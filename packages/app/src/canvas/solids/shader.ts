/**
 * The parts' shader (ADR 0075): one pass draws a drawing's picture, its part buffer and its table of
 * part states (`states.ts`), so that a change of a part's state rewrites a small table and no picture.
 *
 * For each pixel of the picture it reads the part drawn there from the part buffer, and that part's
 * entry from the table, then:
 * 1. lays the part's overlay fill over the picture, as much of it as the entry says;
 * 2. lays the veil of the drawing's fill over it, for a part drawn faintly or by an overlay's opacity;
 * 3. draws the marks of selection, hover and highlight along the edges of the parts that have them in
 *    the buffer, inside the part: a casing, the mark's line, and a casing again, each casing black or
 *    white, whichever keeps 3:1 or more against the mark's color, so that the mark reads on any
 *    picture. A part inside a marked one, which inherits its marks, draws no edge between them;
 * 4. puts the result over the drawing's fill, which shows behind the picture's transparent background.
 *
 * `shadePixel` does the same sums on the CPU, for the tests; the GLSL below is written from it.
 */
import type { Color } from '@visual-anything/schema';
import { contrastRatio } from '../colors';
import { PART_MARK, STATE_TABLE_WIDTH, entryOffset, rgbOf } from './states';

/** How wide the marks are drawn, in screen pixels: the line, and each casing beside it. */
export const PART_MARK_WIDTHS = {
  selected: 2,
  hovered: 1,
  highlighted: 3,
  casing: 1,
} as const;

/** The farthest, in pixels of the picture, a mark looks for an edge. */
export const MOST_MARK_REACH = 8;

/** The casing a mark's color is drawn between: black or white, whichever contrasts more. */
export function casingFor(color: Color): Color {
  return contrastRatio(color, '#FFFFFF') >= contrastRatio(color, '#000000') ? '#FFFFFF' : '#000000';
}

/** What the shader is drawn with, besides its three textures. */
export interface PartShading {
  /** The drawing's fill, which the veil is laid in and which shows behind the picture. */
  backdrop: Color;
  /** The colors of selection and hover, and of a highlight. */
  selected: Color;
  highlight: Color;
  /** How many pixels of the picture a screen pixel takes, which sizes the marks. */
  pixelsPerScreenPixel: number;
}

/** The marks, in the order they are drawn: the later one over the earlier. */
const MARKS = [
  { bit: PART_MARK.highlighted, width: PART_MARK_WIDTHS.highlighted, color: 'highlight' },
  { bit: PART_MARK.hovered, width: PART_MARK_WIDTHS.hovered, color: 'selected' },
  { bit: PART_MARK.selected, width: PART_MARK_WIDTHS.selected, color: 'selected' },
] as const;

/** The eight directions a mark looks for an edge in. */
const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
];

/** What `shadePixel` reads: the picture's pixels, its part buffer and the table, all of one size. */
export interface ShadeInput {
  width: number;
  height: number;
  /** RGBA, not premultiplied, row by row from the top left. */
  picture: Uint8ClampedArray | Uint8Array;
  parts: Uint16Array;
  table: Uint8Array;
}

/** Bands of a mark, in pixels of the picture from the part's edge inward. */
export function markBands(width: number, pixelsPerScreenPixel: number) {
  const scale = Math.max(0.25, pixelsPerScreenPixel);
  const casing = PART_MARK_WIDTHS.casing * scale;
  const line = width * scale;
  return { casing, line, reach: Math.min(MOST_MARK_REACH, 2 * casing + line) };
}

function partAt(input: ShadeInput, x: number, y: number): number {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= input.width || py >= input.height) return 0;
  return input.parts[py * input.width + px] ?? 0;
}

function bitsOf(table: Uint8Array, value: number): number {
  return table[entryOffset(value) + STATE_TABLE_WIDTH * 4 + 1] ?? 0;
}

function marked(table: Uint8Array, value: number, bit: number): boolean {
  if (value === 0) return false;
  const bits = bitsOf(table, value);
  return (bits & bit) !== 0 && (bits & PART_MARK.hidden) === 0;
}

/**
 * How far inside a marked region a pixel lies from its edge, in whole steps of a pixel up to
 * `reach`: the first step at which some direction leaves the region. `Infinity` past the reach.
 */
function depthIn(input: ShadeInput, x: number, y: number, bit: number, reach: number): number {
  const steps = Math.ceil(reach);
  for (let step = 1; step <= steps; step++) {
    for (const [dx, dy] of DIRECTIONS) {
      if (!marked(input.table, partAt(input, x + dx * step, y + dy * step), bit)) return step;
    }
  }
  return Infinity;
}

/**
 * The color of one pixel of the picture as the shader draws it, from (x, y) its middle, as red, green,
 * blue and alpha from 0 to 255, not premultiplied: always opaque, since the drawing's fill shows
 * behind it.
 */
export function shadePixel(
  input: ShadeInput,
  x: number,
  y: number,
  shading: PartShading,
): [number, number, number, number] {
  const at = (Math.floor(y) * input.width + Math.floor(x)) * 4;
  const alpha = (input.picture[at + 3] ?? 0) / 255;
  let rgb: [number, number, number] = [
    input.picture[at] ?? 0,
    input.picture[at + 1] ?? 0,
    input.picture[at + 2] ?? 0,
  ];
  const value = partAt(input, x, y);
  const entry = entryOffset(value);
  const table = input.table;
  const fillAlpha = (table[entry + 3] ?? 0) / 255;
  if (value !== 0 && fillAlpha > 0) {
    rgb = mix(rgb, [table[entry] ?? 0, table[entry + 1] ?? 0, table[entry + 2] ?? 0], fillAlpha);
  }
  const backdrop = rgbOf(shading.backdrop);
  const veil = (table[entry + STATE_TABLE_WIDTH * 4] ?? 0) / 255;
  if (value !== 0 && veil > 0) rgb = mix(rgb, backdrop, veil);
  // Over the drawing's fill.
  rgb = mix(backdrop, rgb, alpha);
  for (const mark of MARKS) {
    if (!marked(table, value, mark.bit)) continue;
    const { casing, line, reach } = markBands(mark.width, shading.pixelsPerScreenPixel);
    const depth = depthIn(input, x, y, mark.bit, reach);
    if (depth === Infinity) continue;
    const color = mark.color === 'highlight' ? shading.highlight : shading.selected;
    if (depth <= casing || (depth > casing + line && depth <= 2 * casing + line)) {
      rgb = rgbOf(casingFor(color));
    } else if (depth <= casing + line) {
      rgb = rgbOf(color);
    }
  }
  return [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2]), 255];
}

function mix(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  amount: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ];
}

// The GLSL ------------------------------------------------------------------------------------------

/** The vertex program: a quad over the picture's place, its texture coordinates from 0 to 1. */
export const PART_VERTEX = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}
`;

const steps = Math.ceil(MOST_MARK_REACH);

/**
 * The fragment program, the sums of `shadePixel`. The picture may sit in an atlas page: `uFrame` is
 * where, in the page's coordinates. Its colors come premultiplied.
 */
export const PART_FRAGMENT = `
in vec2 vUV;
uniform sampler2D uPicture;
uniform sampler2D uParts;
uniform sampler2D uStates;
uniform vec4 uFrame;
uniform vec2 uPartsSize;
uniform vec2 uStatesSize;
uniform vec3 uBackdrop;
uniform vec3 uSelected;
uniform vec3 uSelectedCasing;
uniform vec3 uHighlight;
uniform vec3 uHighlightCasing;
uniform float uScale;
uniform float uMarks;
uniform float uAlpha;

float partAt(vec2 pixel) {
  if (pixel.x < 0.0 || pixel.y < 0.0 || pixel.x >= uPartsSize.x || pixel.y >= uPartsSize.y) {
    return 0.0;
  }
  vec4 texel = texture2D(uParts, (floor(pixel) + 0.5) / uPartsSize);
  return floor(texel.r * 255.0 + 0.5) + 256.0 * floor(texel.g * 255.0 + 0.5);
}

vec4 entry(float value, float row) {
  float column = mod(value, ${STATE_TABLE_WIDTH}.0);
  float band = floor(value / ${STATE_TABLE_WIDTH}.0);
  return texture2D(uStates, vec2((column + 0.5) / uStatesSize.x, (2.0 * band + row + 0.5) / uStatesSize.y));
}

bool hasBit(float bits, float bit) {
  return mod(floor(bits / bit), 2.0) >= 1.0;
}

bool marked(float value, float bit) {
  if (value < 0.5) return false;
  float bits = floor(entry(value, 1.0).g * 255.0 + 0.5);
  return hasBit(bits, bit) && !hasBit(bits, ${PART_MARK.hidden}.0);
}

float depthIn(vec2 pixel, float bit, float reach) {
  for (int k = 1; k <= ${steps}; k++) {
    float s = float(k);
    if (s > ceil(reach)) break;
    if (!marked(partAt(pixel + vec2(s, 0.0)), bit)) return s;
    if (!marked(partAt(pixel + vec2(-s, 0.0)), bit)) return s;
    if (!marked(partAt(pixel + vec2(0.0, s)), bit)) return s;
    if (!marked(partAt(pixel + vec2(0.0, -s)), bit)) return s;
    float d = s * 0.70710678;
    if (!marked(partAt(pixel + vec2(d, d)), bit)) return s;
    if (!marked(partAt(pixel + vec2(-d, d)), bit)) return s;
    if (!marked(partAt(pixel + vec2(d, -d)), bit)) return s;
    if (!marked(partAt(pixel + vec2(-d, -d)), bit)) return s;
  }
  return 1e9;
}

vec3 markOver(vec3 rgb, vec2 pixel, float value, float bit, float width, vec3 color, vec3 casingColor) {
  if (!marked(value, bit)) return rgb;
  float scale = max(0.25, uScale);
  float casing = ${PART_MARK_WIDTHS.casing}.0 * scale;
  float line = width * scale;
  float reach = min(${MOST_MARK_REACH}.0, 2.0 * casing + line);
  float depth = depthIn(pixel, bit, reach);
  if (depth > 1e8) return rgb;
  if (depth <= casing || (depth > casing + line && depth <= 2.0 * casing + line)) return casingColor;
  if (depth <= casing + line) return color;
  return rgb;
}

void main() {
  vec4 picture = texture2D(uPicture, uFrame.xy + vUV * uFrame.zw);
  vec3 rgb = picture.a > 0.0 ? picture.rgb / picture.a : vec3(0.0);
  vec2 pixel = vUV * uPartsSize;
  float value = partAt(pixel);
  if (value > 0.5) {
    vec4 fill = entry(value, 0.0);
    rgb = mix(rgb, fill.rgb, fill.a);
    rgb = mix(rgb, uBackdrop, entry(value, 1.0).r);
  }
  rgb = mix(uBackdrop, rgb, picture.a);
  if (uMarks > 0.5) {
    rgb = markOver(rgb, pixel, value, ${PART_MARK.highlighted}.0, ${PART_MARK_WIDTHS.highlighted}.0, uHighlight, uHighlightCasing);
    rgb = markOver(rgb, pixel, value, ${PART_MARK.hovered}.0, ${PART_MARK_WIDTHS.hovered}.0, uSelected, uSelectedCasing);
    rgb = markOver(rgb, pixel, value, ${PART_MARK.selected}.0, ${PART_MARK_WIDTHS.selected}.0, uSelected, uSelectedCasing);
  }
  gl_FragColor = vec4(rgb, 1.0) * uAlpha;
}
`;
