/**
 * Labels drawn from bitmap fonts: each glyph is drawn once into a shared texture, so that showing
 * thousands of names costs little more than showing one. Shape labels are drawn in white and tinted
 * to the colour that reads on their shape's fill.
 */
import { BitmapFont, BitmapText, Cache, type TextStyleOptions } from 'pixi.js';
import { FONT_FAMILY, fitText, type LabelKind, type TextFactory } from './draw';
import { RELATION_LABEL_HALO, RELATION_LABEL_TEXT } from './palette';

const FONTS: Record<LabelKind, string> = {
  name: 'visual-anything-name',
  detail: 'visual-anything-detail',
  relation: 'visual-anything-relation',
};

/**
 * Printable ASCII, the letters and signs Spanish and English text use most, and the × an aggregated
 * relation's count is written with; others are added when met.
 */
const CHARACTERS: (string | string[])[] = [[' ', '~'], 'áéíóúüñÁÉÍÓÚÜÑ¿¡…—–→·“”‘’×'];

/** The keys PixiJS keeps the installed fonts under in its cache. */
const CACHED = Object.values(FONTS).map((name) => `${name}-bitmap`);

/**
 * Draws the glyphs of the label fonts, which takes a moment the first time; done ahead of need. Each
 * font is installed only while PixiJS's cache lacks it: a renderer started again finds the fonts an
 * earlier one installed, and so does this module loaded again by a hot reload, as PixiJS is not.
 */
export function installFonts(): void {
  if (CACHED.every((key) => Cache.has(key))) return;
  // Drawn at twice the screen's density or more, so that names stay sharp when zoomed in.
  const resolution = Math.min(4, Math.max(2, (globalThis.devicePixelRatio || 1) * 2));
  const common = { chars: CHARACTERS, resolution, padding: 4 };
  installOnce({
    name: FONTS.name,
    style: { fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: '600', fill: '#ffffff' },
    ...common,
  });
  installOnce({
    name: FONTS.detail,
    style: { fontFamily: FONT_FAMILY, fontSize: 11, fill: '#ffffff' },
    ...common,
  });
  installOnce({
    name: FONTS.relation,
    style: {
      fontFamily: FONT_FAMILY,
      fontSize: 12,
      fill: RELATION_LABEL_TEXT,
      stroke: { color: RELATION_LABEL_HALO, width: 4, join: 'round' },
    },
    ...common,
  });
}

/** Installs a font unless PixiJS's cache already holds it. */
function installOnce(options: Parameters<typeof BitmapFont.install>[0] & { name: string }): void {
  if (Cache.has(`${options.name}-bitmap`)) return;
  BitmapFont.install(options);
}

/**
 * Makes a label from a bitmap font, laid out as `draw.ts` lays out its text, and fitted in the room
 * its shape gives it: shortened with "…" when too tall, or left out when even that does not fit.
 */
export const bitmapText: TextFactory = (options, kind, room) => {
  installFonts();
  const style: TextStyleOptions = options.style ?? {};
  const text = new BitmapText({
    text: options.text,
    ...(options.anchor === undefined ? {} : { anchor: options.anchor }),
    ...(options.x === undefined ? {} : { x: options.x }),
    ...(options.y === undefined ? {} : { y: options.y }),
    style: {
      fontFamily: FONTS[kind],
      ...(style.fontSize === undefined ? {} : { fontSize: style.fontSize }),
      ...(style.align === undefined ? {} : { align: style.align }),
      ...(style.wordWrap === undefined ? {} : { wordWrap: style.wordWrap }),
      ...(style.wordWrapWidth === undefined ? {} : { wordWrapWidth: style.wordWrapWidth }),
      ...(style.breakWords === undefined ? {} : { breakWords: style.breakWords }),
    },
  });
  if (kind !== 'relation' && typeof style.fill === 'string') text.tint = style.fill;
  return fitText(text, room);
};
