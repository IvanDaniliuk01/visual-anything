/**
 * The pictures an exported drawing shows, each written once as a `<symbol>` that every shape showing
 * it uses (ADR-0027): only the cleaned view of a picture, never what is stored.
 *
 * - **An SVG picture** is written as its own markup inside the symbol, which a browser draws and the
 *   PDF writer reads alike. Cleaning writes it in one canonical form (`core/images/svg.ts`): elements
 *   only, attributes sorted and escaped, no text, nothing that runs or loads. It is read back here in
 *   that form only; anything else is left out. Its ids are given a prefix of the picture's own, so
 *   that two pictures, or a picture and the drawing, never share one. Colors written with `hsl()` or
 *   with fractions are written in whole numbers, which every reader of SVG reads.
 * - **A silhouette** of an SVG picture keeps its shape and paints in one colour: every fill, stroke and
 *   gradient stop that paints is the tint, as the canvas tints a picture drawn in white. Masks and clip
 *   paths are kept as they are, since they paint nothing.
 * - **A bitmap** is a data address in an `<image>` of the symbol; a silhouette of one is drawn through
 *   a filter that keeps its alpha in the tint, which a PDF cannot draw.
 */
import type { Color } from '@visual-anything/schema';
import { attributes, element, empty } from './markup';

/** The media type of each bitmap format, for a data address. */
export const BITMAP_MEDIA_TYPES = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
} as const;

export type BitmapFormat = keyof typeof BITMAP_MEDIA_TYPES;

/** A tag of a cleaned picture, as cleaning writes it. */
interface Tag {
  closing: boolean;
  name: string;
  attributes: [string, string][];
  selfClosing: boolean;
}

/** A tag as cleaning writes them: a name, attributes in double quotes, nothing else. */
const TAG = /<(\/?)([A-Za-z][\w.:-]*)((?:\s+[A-Za-z_:][\w.:-]*="[^"<>]*")*)\s*(\/?)>/y;
const ATTRIBUTE = /\s+([A-Za-z_:][\w.:-]*)="([^"<>]*)"/g;
/** References to a part of the picture, by id. */
const URL_REFERENCE = /url\(#([A-Za-z_][\w.-]*)\)/g;

/** The paints a silhouette replaces with its tint, wherever they paint. */
const PAINTS = new Set(['fill', 'stroke', 'stop-color', 'color']);
/** Elements whose contents paint nothing, which a silhouette keeps as they are. */
const UNPAINTED = new Set(['mask', 'clipPath']);
/** What stays on the symbol of the outermost element; the rest goes on a group inside it. */
const ON_SYMBOL = new Set(['viewBox', 'preserveAspectRatio']);

const COLOR_FUNCTION = /^(rgba?|hsla?)\(\s*([^()]*)\)$/i;

/**
 * A color written with a function, `rgb()`, `rgba()`, `hsl()` or `hsla()`, in commas or in spaces
 * with a slash before its alpha, as `#rrggbb` or `rgba()` of whole numbers, which every reader of SVG
 * reads, the PDF writer among them; any other value as it is.
 */
export function plainColor(value: string): string {
  const match = COLOR_FUNCTION.exec(value.trim());
  if (!match) return value;
  const kind = (match[1] ?? '').toLowerCase();
  const parts = (match[2] ?? '').split(/\s*[,/]\s*|\s+/).filter((part) => part !== '');
  if (parts.length !== 3 && parts.length !== 4) return value;
  const number = (part: string, percentOf: number) =>
    part.endsWith('%') ? (Number(part.slice(0, -1)) / 100) * percentOf : Number(part);
  const alpha = parts[3] === undefined ? 1 : number(parts[3], 1);
  let rgb: number[];
  if (kind.startsWith('rgb')) {
    rgb = parts.slice(0, 3).map((part) => number(part, 255));
  } else {
    const hue = ((((Number(parts[0]?.replace(/deg$/, '')) % 360) + 360) % 360) / 360) * 6;
    const saturation = number(parts[1] ?? '', 1);
    const lightness = number(parts[2] ?? '', 1);
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const second = chroma * (1 - Math.abs((hue % 2) - 1));
    const [r, g, b] =
      hue < 1
        ? [chroma, second, 0]
        : hue < 2
          ? [second, chroma, 0]
          : hue < 3
            ? [0, chroma, second]
            : hue < 4
              ? [0, second, chroma]
              : hue < 5
                ? [second, 0, chroma]
                : [chroma, 0, second];
    const lift = lightness - chroma / 2;
    rgb = [r, g, b].map((channel) => (channel + lift) * 255);
  }
  if (![...rgb, alpha].every(Number.isFinite)) return value;
  const [r, g, b] = rgb.map((channel) => Math.round(Math.min(255, Math.max(0, channel)))) as [
    number,
    number,
    number,
  ];
  const opacity = Math.min(1, Math.max(0, alpha));
  if (opacity === 1) {
    return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  }
  return `rgba(${r},${g},${b},${Math.round(opacity * 1000) / 1000})`;
}

/** The tags of a cleaned picture; undefined when its text is not in the form cleaning writes. */
function tagsOf(svg: string): Tag[] | undefined {
  const tags: Tag[] = [];
  TAG.lastIndex = 0;
  while (TAG.lastIndex < svg.length) {
    const at = TAG.lastIndex;
    const match = TAG.exec(svg);
    if (!match || match.index !== at) return undefined;
    const [, closing = '', name = '', written = '', selfClosing = ''] = match;
    const values: [string, string][] = [];
    for (const each of written.matchAll(ATTRIBUTE)) values.push([each[1] ?? '', each[2] ?? '']);
    tags.push({
      closing: closing === '/',
      name,
      attributes: values,
      selfClosing: selfClosing === '/',
    });
  }
  return tags;
}

/** An attribute's value as cleaning wrote it, escaped; written again as it is. */
function rawAttributes(values: readonly [string, string][]): string {
  return values.map(([name, value]) => ` ${name}="${value}"`).join('');
}

/**
 * A cleaned SVG picture as a symbol with id `id`, its own ids starting with `prefix`; with `tint`, as
 * a silhouette of that colour. Undefined when its text is not in the form cleaning writes, or its
 * elements do not nest.
 */
export function svgSymbol(
  id: string,
  svg: string,
  prefix: string,
  tint?: Color,
): string | undefined {
  const tags = tagsOf(svg);
  const [root] = tags ?? [];
  if (!tags || !root || root.closing || root.name !== 'svg') return undefined;
  const open: string[] = [];
  /** How many of the open elements paint nothing, as a mask or a clip path. */
  let unpainted = 0;
  let written = '';
  for (const [at, tag] of tags.entries()) {
    if (tag.closing) {
      const name = open.pop();
      if (name !== tag.name) return undefined;
      if (UNPAINTED.has(name)) unpainted -= 1;
      if (open.length === 0) {
        if (at !== tags.length - 1) return undefined;
        continue;
      }
      written += `</${name}>`;
      continue;
    }
    const painting = tint !== undefined && unpainted === 0;
    const values = tag.attributes.flatMap(([name, value]): [string, string][] => {
      if (name === 'xmlns' || name.startsWith('xmlns:')) return [];
      if (name === 'id') return [[name, `${prefix}${value}`]];
      if (name === 'href')
        return value.startsWith('#') ? [[name, `#${prefix}${value.slice(1)}`]] : [];
      const referred = value.replace(
        URL_REFERENCE,
        (_all, part: string) => `url(#${prefix}${part})`,
      );
      if (!PAINTS.has(name)) return [[name, referred]];
      if (painting && referred !== 'none' && !referred.startsWith('url(')) return [[name, tint]];
      return [[name, plainColor(referred)]];
    });
    if (painting && tag.name === 'stop' && !values.some(([name]) => name === 'stop-color')) {
      values.push(['stop-color', tint]);
    }
    if (open.length === 0 && at === 0) {
      // The outermost element: its view box goes on the symbol, its paint on a group inside it.
      const symbol = values.filter(([name]) => ON_SYMBOL.has(name));
      const group = values.filter(([name]) => !ON_SYMBOL.has(name));
      if (painting && !group.some(([name]) => name === 'fill')) group.push(['fill', tint]);
      if (!symbol.some(([name]) => name === 'viewBox')) return undefined;
      written = `<symbol${attributes({ id })}${rawAttributes(symbol)}><g${rawAttributes(group)}>`;
      if (tag.selfClosing) return `${written}</g></symbol>`;
      open.push(tag.name);
      continue;
    }
    if (open.length === 0) return undefined;
    written += `<${tag.name}${rawAttributes(values)}${tag.selfClosing ? '/>' : '>'}`;
    if (!tag.selfClosing) {
      open.push(tag.name);
      if (UNPAINTED.has(tag.name)) unpainted += 1;
    }
  }
  if (open.length !== 0) return undefined;
  return `${written}</g></symbol>`;
}

/** A cleaned bitmap as a symbol with id `id`, its picture filling the symbol's view box. */
export function bitmapSymbol(
  id: string,
  image: { format: BitmapFormat; data: string; width: number; height: number },
): string {
  return element(
    'symbol',
    { id, viewBox: `0 0 ${image.width} ${image.height}` },
    empty('image', {
      width: image.width,
      height: image.height,
      preserveAspectRatio: 'none',
      href: `data:${BITMAP_MEDIA_TYPES[image.format]};base64,${image.data}`,
    }),
  );
}

/** The id of the filter that draws a bitmap as a silhouette of a colour. */
export function tintFilterId(tint: Color): string {
  return `va-tint-${tint.slice(1).toLowerCase()}`;
}

/** The filter that draws what it filters in one colour, keeping its alpha. */
export function tintFilter(tint: Color): string {
  return element(
    'filter',
    {
      id: tintFilterId(tint),
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      'color-interpolation-filters': 'sRGB',
    },
    empty('feFlood', { 'flood-color': tint }) +
      empty('feComposite', { in2: 'SourceAlpha', operator: 'in' }),
  );
}
