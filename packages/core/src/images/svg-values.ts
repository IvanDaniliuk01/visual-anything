/**
 * The values of a cleaned picture's attributes, read as a browser reads them: transform lists,
 * lengths, colors, view boxes and how they fit their viewports. A value outside its grammar reads as
 * `undefined`, which its reader takes as the attribute left out, as SVG does with an invalid
 * presentation attribute.
 */
import type { Color } from '@visual-anything/schema';
import {
  IDENTITY,
  multiply,
  rotation,
  scaling,
  skewingX,
  skewingY,
  translation,
  type Matrix,
} from '../geometry/affine';

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** A number written as SVG writes one, finite. */
export function readNumber(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const trimmed = text.trim();
  if (!NUMBER.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/** Numbers apart by spaces or commas, all of them, or `undefined`. */
export function readNumbers(text: string): number[] | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return [];
  const numbers: number[] = [];
  for (const part of trimmed.split(/\s*,\s*|\s+/)) {
    const value = readNumber(part);
    if (value === undefined) return undefined;
    numbers.push(value);
  }
  return numbers;
}

const FUNCTION = /\s*([A-Za-z]+)\s*\(([^()]*)\)\s*,?\s*/y;

/**
 * A transform list, as `transform` writes it, composed left to right. Its function names are read as
 * SVG writes them, case and all; anything else makes the whole list invalid, which leaves the
 * element untransformed.
 */
export function readTransform(text: string | undefined): Matrix | undefined {
  if (text === undefined) return undefined;
  let matrix = IDENTITY;
  FUNCTION.lastIndex = 0;
  let at = 0;
  while (at < text.length) {
    FUNCTION.lastIndex = at;
    const match = FUNCTION.exec(text);
    if (!match) return text.slice(at).trim() === '' ? matrix : undefined;
    at = FUNCTION.lastIndex;
    const name = match[1] as string;
    const args = readNumbers(match[2] as string);
    if (args === undefined) return undefined;
    const step = transformStep(name, args);
    if (step === undefined) return undefined;
    matrix = multiply(matrix, step);
  }
  return matrix;
}

function transformStep(name: string, args: readonly number[]): Matrix | undefined {
  const [a = 0, b, c] = args;
  switch (name) {
    case 'matrix':
      return args.length === 6 ? (args as unknown as Matrix) : undefined;
    case 'translate':
      return args.length === 1 || args.length === 2 ? translation(a, b ?? 0) : undefined;
    case 'scale':
      return args.length === 1 || args.length === 2 ? scaling(a, b ?? a) : undefined;
    case 'rotate':
      return args.length === 1 ? rotation(a) : args.length === 3 ? rotation(a, b, c) : undefined;
    case 'skewX':
      return args.length === 1 ? skewingX(a) : undefined;
    case 'skewY':
      return args.length === 1 ? skewingY(a) : undefined;
    default:
      return undefined;
  }
}

/** CSS pixels in each absolute unit, and what em and ex are taken as, without a font. */
const UNITS: Readonly<Record<string, number>> = {
  '': 1,
  px: 1,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
  pt: 4 / 3,
  pc: 16,
  em: 16,
  ex: 8,
};

const LENGTH = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*([a-zA-Z]*|%)$/;

/** A length in user units: a number, a number in a unit, or a percentage of `whole`. */
export function readLength(text: string | undefined, whole: number): number | undefined {
  if (text === undefined) return undefined;
  const match = LENGTH.exec(text.trim());
  if (!match) return undefined;
  const value = Number(match[1]);
  const unit = (match[2] as string).toLowerCase();
  const scale = unit === '%' ? whole / 100 : UNITS[unit];
  if (scale === undefined) return undefined;
  const length = value * scale;
  return Number.isFinite(length) ? length : undefined;
}

/** A view box: where its user space starts and how large it is. */
export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A `viewBox` value: four numbers, its width and height not below 0. One of 0 is a view box that
 * draws nothing, which its reader tells by its size.
 */
export function readViewBox(text: string | undefined): ViewBox | undefined {
  if (text === undefined) return undefined;
  const numbers = readNumbers(text);
  if (numbers?.length !== 4) return undefined;
  const [x, y, width, height] = numbers as [number, number, number, number];
  if (width < 0 || height < 0) return undefined;
  return { x, y, width, height };
}

/**
 * The transform that fits a view box into a viewport, as `preserveAspectRatio` asks: stretched, or
 * scaled to meet or slice and aligned at its start, middle or end on each axis. xMidYMid meet when
 * left out or not valid.
 */
export function viewBoxTransform(
  box: ViewBox,
  aspect: string | undefined,
  viewport: ViewBox,
): Matrix {
  const sx = viewport.width / box.width;
  const sy = viewport.height / box.height;
  const words = (aspect ?? '')
    .trim()
    .split(/\s+/)
    .filter((word) => word !== 'defer');
  const align = words[0] ?? 'xMidYMid';
  const slice = words[1] === 'slice';
  const known = /^x(Min|Mid|Max)Y(Min|Mid|Max)$/.exec(align);
  if (align === 'none') {
    return multiply(
      translation(viewport.x, viewport.y),
      multiply(scaling(sx, sy), translation(-box.x, -box.y)),
    );
  }
  const along = (word: string | undefined) => (word === 'Min' ? 0 : word === 'Max' ? 1 : 0.5);
  const ax = known ? along(known[1]) : 0.5;
  const ay = known ? along(known[2]) : 0.5;
  const scale = slice ? Math.max(sx, sy) : Math.min(sx, sy);
  const tx = viewport.x - box.x * scale + (viewport.width - box.width * scale) * ax;
  const ty = viewport.y - box.y * scale + (viewport.height - box.height * scale) * ay;
  return [scale, 0, 0, scale, tx, ty];
}

/**
 * A color as paint is read: `#RRGGBB` in capitals, or `transparent` for paint that draws nothing
 * one can see but still fills, as an invisible fill does.
 */
export type ReadColor = string;

/**
 * A color written as CSS writes one in SVG: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`,
 * `rgba()`, `hsl()`, `hsla()`, a named color, or `transparent`. A color with no alpha left is
 * `transparent`; any other alpha is dropped.
 */
export function readColor(text: string): ReadColor | undefined {
  const value = text.trim().toLowerCase();
  if (value === 'transparent') return 'transparent';
  const named = NAMED_COLORS.get(value);
  if (named !== undefined) return named;
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(value)?.[1];
  if (hex !== undefined) {
    const full = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join('') : hex;
    if (full.length === 8 && full.slice(6) === '00') return 'transparent';
    return `#${full.slice(0, 6).toUpperCase()}`;
  }
  const call = /^(rgba?|hsla?)\(\s*([^()]*)\)$/.exec(value);
  if (!call) return undefined;
  const args = (call[2] as string).trim().split(/\s*,\s*|\s+/);
  if (args.length !== 3 && args.length !== 4) return undefined;
  const alpha = args.length === 4 ? channel(args[3] as string, 1) : 1;
  if (alpha === undefined) return undefined;
  if (alpha <= 0) return 'transparent';
  if ((call[1] as string).startsWith('rgb')) {
    const rgb = args.slice(0, 3).map((arg) => channel(arg, 255));
    if (rgb.some((each) => each === undefined)) return undefined;
    return hexOf(rgb as number[]);
  }
  const hue = readNumber((args[0] as string).replace(/deg$/, ''));
  const saturation = percent(args[1] as string);
  const lightness = percent(args[2] as string);
  if (hue === undefined || saturation === undefined || lightness === undefined) return undefined;
  return hexOf(hslToRgb(hue, saturation, lightness));
}

/** A channel written as a number of `scale`, or as a percentage of it, clamped to it. */
function channel(text: string, scale: number): number | undefined {
  const share = text.endsWith('%') ? percent(text) : undefined;
  const value = share !== undefined ? share * scale : readNumber(text);
  return value === undefined ? undefined : Math.max(0, Math.min(scale, value));
}

/** A percentage as a fraction from 0 to 1, clamped. */
function percent(text: string): number | undefined {
  if (!text.endsWith('%')) return undefined;
  const value = readNumber(text.slice(0, -1));
  return value === undefined ? undefined : Math.max(0, Math.min(1, value / 100));
}

function hslToRgb(hue: number, saturation: number, lightness: number): number[] {
  const h = (((hue % 360) + 360) % 360) / 360;
  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const at = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [at(h + 1 / 3), at(h), at(h - 1 / 3)].map((value) => value * 255);
}

function hexOf(rgb: readonly number[]): Color {
  return `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** CSS's named colors. */
const NAMED_COLORS: ReadonlyMap<string, Color> = new Map(
  (
    'aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc ' +
    'bisque ffe4c4 black 000000 blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a ' +
    'burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00 chocolate d2691e coral ff7f50 ' +
    'cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff darkblue 00008b darkcyan 008b8b ' +
    'darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b ' +
    'darkmagenta 8b008b darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000 ' +
    'darksalmon e9967a darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f ' +
    'darkslategrey 2f4f4f darkturquoise 00ced1 darkviolet 9400d3 deeppink ff1493 deepskyblue 00bfff ' +
    'dimgray 696969 dimgrey 696969 dodgerblue 1e90ff firebrick b22222 floralwhite fffaf0 ' +
    'forestgreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 goldenrod daa520 ' +
    'gray 808080 green 008000 greenyellow adff2f grey 808080 honeydew f0fff0 hotpink ff69b4 ' +
    'indianred cd5c5c indigo 4b0082 ivory fffff0 khaki f0e68c lavender e6e6fa lavenderblush fff0f5 ' +
    'lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6 lightcoral f08080 lightcyan e0ffff ' +
    'lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3 lightpink ffb6c1 ' +
    'lightsalmon ffa07a lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 ' +
    'lightslategrey 778899 lightsteelblue b0c4de lightyellow ffffe0 lime 00ff00 limegreen 32cd32 ' +
    'linen faf0e6 magenta ff00ff maroon 800000 mediumaquamarine 66cdaa mediumblue 0000cd ' +
    'mediumorchid ba55d3 mediumpurple 9370db mediumseagreen 3cb371 mediumslateblue 7b68ee ' +
    'mediumspringgreen 00fa9a mediumturquoise 48d1cc mediumvioletred c71585 midnightblue 191970 ' +
    'mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5 navajowhite ffdead navy 000080 oldlace fdf5e6 ' +
    'olive 808000 olivedrab 6b8e23 orange ffa500 orangered ff4500 orchid da70d6 palegoldenrod eee8aa ' +
    'palegreen 98fb98 paleturquoise afeeee palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 ' +
    'peru cd853f pink ffc0cb plum dda0dd powderblue b0e0e6 purple 800080 rebeccapurple 663399 ' +
    'red ff0000 rosybrown bc8f8f royalblue 4169e1 saddlebrown 8b4513 salmon fa8072 sandybrown f4a460 ' +
    'seagreen 2e8b57 seashell fff5ee sienna a0522d silver c0c0c0 skyblue 87ceeb slateblue 6a5acd ' +
    'slategray 708090 slategrey 708090 snow fffafa springgreen 00ff7f steelblue 4682b4 tan d2b48c ' +
    'teal 008080 thistle d8bfd8 tomato ff6347 turquoise 40e0d0 violet ee82ee wheat f5deb3 ' +
    'white ffffff whitesmoke f5f5f5 yellow ffff00 yellowgreen 9acd32'
  )
    .split(' ')
    .reduce<[string, Color][]>((pairs, word, at, words) => {
      if (at % 2 === 0) pairs.push([word, `#${(words[at + 1] as string).toUpperCase()}`]);
      return pairs;
    }, []),
);
