/**
 * The marks of selection, hover and highlight in a space (ADR 0076), drawn as the canvas draws its
 * parts' marks (`canvas/solids/shader.ts`): a pass writes each pixel's marks' bits, from the nearest
 * piece, box or marker drawn there, and a second draws, along the inside of each marked region's edge, a
 * casing, the mark's line and a casing again. Each casing is black or white, whichever keeps 3:1 or
 * more against the mark's color, so that a mark reads on any solid, in either theme. A piece inside a
 * marked one inherits its marks, so no edge is drawn between them.
 *
 * `markAt` does the second pass's sums on the CPU, for the tests; the GLSL is written from it.
 */
import type { ThemeName } from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import {
  casingFor,
  markBands,
  MOST_MARK_REACH,
  PART_MARK_WIDTHS,
} from '../../../canvas/solids/shader';
import { rgbOf } from '../../../canvas/solids/states';
import { THEMES } from '../../../theme/themes';
import { SPACE_MARK } from './layout';
import { LOOK_VERTEX, LOOK_VERTEX_END, LOOK_VERTEX_PARS } from './looks';

/** The marks, in the order they are drawn: the later one over the earlier. */
const MARKS = [
  { bit: SPACE_MARK.highlighted, width: PART_MARK_WIDTHS.highlighted, color: 'highlight' },
  { bit: SPACE_MARK.hovered, width: PART_MARK_WIDTHS.hovered, color: 'selected' },
  { bit: SPACE_MARK.selected, width: PART_MARK_WIDTHS.selected, color: 'selected' },
] as const;

/** The colors marks are drawn in, in a theme, with their casings. */
export interface MarkColors {
  selected: Color;
  selectedCasing: Color;
  highlight: Color;
  highlightCasing: Color;
}

export function markColorsOf(theme: ThemeName): MarkColors {
  const { selected, highlight } = THEMES[theme].canvas;
  return {
    selected,
    selectedCasing: casingFor(selected),
    highlight,
    highlightCasing: casingFor(highlight),
  };
}

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

/** The marks' bits of a frame's pixels, row by row. */
export interface MarkBuffer {
  width: number;
  height: number;
  bits: Uint8Array;
}

function bitsAt(buffer: MarkBuffer, x: number, y: number): number {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= buffer.width || py >= buffer.height) return 0;
  return buffer.bits[py * buffer.width + px] ?? 0;
}

function depthIn(buffer: MarkBuffer, x: number, y: number, bit: number, reach: number): number {
  const steps = Math.ceil(reach);
  for (let step = 1; step <= steps; step++) {
    for (const [dx, dy] of DIRECTIONS) {
      if ((bitsAt(buffer, x + dx * step, y + dy * step) & bit) === 0) return step;
    }
  }
  return Infinity;
}

/** The color the marks pass draws at a pixel, from (x, y) its middle; none where it draws nothing. */
export function markAt(
  buffer: MarkBuffer,
  x: number,
  y: number,
  colors: MarkColors,
  scale: number,
): [number, number, number] | undefined {
  const bits = bitsAt(buffer, x, y);
  if (bits === 0) return undefined;
  let rgb: [number, number, number] | undefined;
  for (const mark of MARKS) {
    if ((bits & mark.bit) === 0) continue;
    const { casing, line, reach } = markBands(mark.width, scale);
    const depth = depthIn(buffer, x, y, mark.bit, reach);
    if (depth === Infinity) continue;
    const color = mark.color === 'highlight' ? colors.highlight : colors.selected;
    const casingColor = mark.color === 'highlight' ? colors.highlightCasing : colors.selectedCasing;
    if (depth <= casing || (depth > casing + line && depth <= 2 * casing + line)) {
      rgb = rgbOf(casingColor);
    } else if (depth <= casing + line) {
      rgb = rgbOf(color);
    }
  }
  return rgb;
}

// The GLSL ------------------------------------------------------------------------------------------

/** The vertex program: a triangle over the whole frame. */
export const MARKS_VERTEX = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const steps = Math.ceil(MOST_MARK_REACH);

/** The fragment program, the sums of `markAt`, reading the bits' pass from its red byte. */
export const MARKS_FRAGMENT = /* glsl */ `
uniform sampler2D bitsPass;
uniform vec2 size;
uniform vec3 selected;
uniform vec3 selectedCasing;
uniform vec3 highlight;
uniform vec3 highlightCasing;
uniform float scale;

float bitsAt(vec2 pixel) {
  if (pixel.x < 0.0 || pixel.y < 0.0 || pixel.x >= size.x || pixel.y >= size.y) return 0.0;
  return floor(texture2D(bitsPass, (floor(pixel) + 0.5) / size).r * 255.0 + 0.5);
}

bool hasBit(float bits, float bit) {
  return mod(floor(bits / bit), 2.0) >= 1.0;
}

float depthIn(vec2 pixel, float bit, float reach) {
  for (int k = 1; k <= ${steps}; k++) {
    float s = float(k);
    if (s > ceil(reach)) break;
    if (!hasBit(bitsAt(pixel + vec2(s, 0.0)), bit)) return s;
    if (!hasBit(bitsAt(pixel + vec2(-s, 0.0)), bit)) return s;
    if (!hasBit(bitsAt(pixel + vec2(0.0, s)), bit)) return s;
    if (!hasBit(bitsAt(pixel + vec2(0.0, -s)), bit)) return s;
    float d = s * 0.70710678;
    if (!hasBit(bitsAt(pixel + vec2(d, d)), bit)) return s;
    if (!hasBit(bitsAt(pixel + vec2(-d, d)), bit)) return s;
    if (!hasBit(bitsAt(pixel + vec2(d, -d)), bit)) return s;
    if (!hasBit(bitsAt(pixel + vec2(-d, -d)), bit)) return s;
  }
  return 1e9;
}

bool markOver(inout vec3 rgb, vec2 pixel, float bits, float bit, float width, vec3 color, vec3 casingColor) {
  if (!hasBit(bits, bit)) return false;
  float s = max(0.25, scale);
  float casing = ${PART_MARK_WIDTHS.casing}.0 * s;
  float line = width * s;
  float reach = min(${MOST_MARK_REACH}.0, 2.0 * casing + line);
  float depth = depthIn(pixel, bit, reach);
  if (depth > 1e8) return false;
  if (depth <= casing || (depth > casing + line && depth <= 2.0 * casing + line)) {
    rgb = casingColor;
    return true;
  }
  if (depth <= casing + line) {
    rgb = color;
    return true;
  }
  return false;
}

void main() {
  vec2 pixel = gl_FragCoord.xy;
  float bits = bitsAt(pixel);
  if (bits < 0.5) discard;
  vec3 rgb = vec3(0.0);
  bool drawn = false;
  drawn = markOver(rgb, pixel, bits, ${SPACE_MARK.highlighted}.0, ${PART_MARK_WIDTHS.highlighted}.0, highlight, highlightCasing) || drawn;
  drawn = markOver(rgb, pixel, bits, ${SPACE_MARK.hovered}.0, ${PART_MARK_WIDTHS.hovered}.0, selected, selectedCasing) || drawn;
  drawn = markOver(rgb, pixel, bits, ${SPACE_MARK.selected}.0, ${PART_MARK_WIDTHS.selected}.0, selected, selectedCasing) || drawn;
  if (!drawn) discard;
  gl_FragColor = vec4(rgb, 1.0);
}`;

/**
 * The vertex program of the bits' pass: each instance of a batch where it is drawn, cut as drawn,
 * reading its looks as the batch's other passes do (`looks.ts`), and moving out of the frame what is
 * hidden, or faint and unmarked.
 */
export const BITS_VERTEX = /* glsl */ `
#include <common>
#include <clipping_planes_pars_vertex>
${LOOK_VERTEX_PARS}
void main() {
  vec3 transformed = vec3(position);
${LOOK_VERTEX}
  vec4 mvPosition = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
  #endif
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
${LOOK_VERTEX_END}
}`;

/** The fragment program of the bits' pass: its look's marks' bits in the red byte. */
export const BITS_FRAGMENT = /* glsl */ `
#include <clipping_planes_pars_fragment>
varying float vLookMarks;
void main() {
  #include <clipping_planes_fragment>
  gl_FragColor = vec4(vLookMarks / 255.0, 0.0, 0.0, 1.0);
}`;
