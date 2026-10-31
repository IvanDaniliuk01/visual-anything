/**
 * The parts' shader (ADR 0075), through its sums on the CPU: an overlay's fill and a veil laid over a
 * part, the drawing's fill behind the picture, marks along the edges of marked parts only, casings
 * that keep 3:1 against the mark in both themes, and its GLSL written from the same numbers.
 */
import type { SolidPart } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../colors';
import { THEMES } from '../../theme/themes';
import { partStatesOf, type PartElementState } from './states';
import {
  PART_FRAGMENT,
  PART_MARK_WIDTHS,
  PART_VERTEX,
  casingFor,
  markBands,
  shadePixel,
  type PartShading,
  type ShadeInput,
} from './shader';

const SIDE = 40;

/** A picture 40 pixels a side: an outer part (0) from 2 to 37, an inner one (1) from 8 to 27. */
function input(elements: [number, PartElementState][] = []): ShadeInput {
  const parts: SolidPart[] = [{ name: 'outer' }, { name: 'inner', parent: 0 }];
  const picture = new Uint8ClampedArray(SIDE * SIDE * 4);
  const buffer = new Uint16Array(SIDE * SIDE);
  for (let y = 0; y < SIDE; y++) {
    for (let x = 0; x < SIDE; x++) {
      const at = y * SIDE + x;
      const inner = x >= 8 && x < 28 && y >= 8 && y < 28;
      const outer = x >= 2 && x < 38 && y >= 2 && y < 38;
      buffer[at] = inner ? 2 : outer ? 1 : 0;
      // Grey where a part is drawn, transparent elsewhere.
      picture.set(outer ? [128, 128, 128, 255] : [0, 0, 0, 0], at * 4);
    }
  }
  return {
    width: SIDE,
    height: SIDE,
    picture,
    parts: buffer,
    table: partStatesOf(parts, new Map(elements)).table,
  };
}

const SHADING: PartShading = {
  backdrop: '#FFFFFF',
  selected: '#2563EB',
  highlight: '#C2410C',
  pixelsPerScreenPixel: 1,
};

const at = (shaded: ShadeInput, x: number, y: number, shading = SHADING) =>
  shadePixel(shaded, x + 0.5, y + 0.5, shading);

describe('the parts’ shader', () => {
  it('draws the picture as it is, over the drawing’s fill, where no part has a state', () => {
    const plain = input();
    expect(at(plain, 10, 10)).toEqual([128, 128, 128, 255]);
    expect(at(plain, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(at(plain, 0, 0, { ...SHADING, backdrop: '#102030' })).toEqual([16, 32, 48, 255]);
  });

  it('lays an overlay’s fill over a part, and a veil of the drawing’s fill', () => {
    const filled = input([[1, { fill: '#FF0000' }]]);
    expect(at(filled, 10, 10)).toEqual([255, 0, 0, 255]);
    expect(at(filled, 4, 4)).toEqual([128, 128, 128, 255]);
    const veiled = input([[0, { faint: true }]]);
    const [r] = at(veiled, 4, 4);
    expect(r).toBeGreaterThan(220);
    // The inner part stands for no element of its own, and is veiled with the outer one.
    expect(at(veiled, 10, 10)[0]).toBe(r);
  });

  it('marks a selected part along its edges in the buffer, a line between two casings', () => {
    const selected = input([[1, { selected: true }]]);
    const casing = [255, 255, 255, 255];
    const line = [37, 99, 235, 255];
    // From the inner part's left edge at x = 8, inward: casing, line of 2 pixels, casing.
    expect(at(selected, 8, 17)).toEqual(casing);
    expect(at(selected, 9, 17)).toEqual(line);
    expect(at(selected, 10, 17)).toEqual(line);
    expect(at(selected, 11, 17)).toEqual(casing);
    // Its middle, and the part around it, as the picture draws them.
    expect(at(selected, 12, 17)).toEqual([128, 128, 128, 255]);
    expect(at(selected, 5, 17)).toEqual([128, 128, 128, 255]);
  });

  it('draws no edge between a marked part and the parts it holds, which are marked too', () => {
    const selected = input([[0, { selected: true }]]);
    // Beside the inner part's edge, inside the outer part: no mark.
    expect(at(selected, 7, 17)).toEqual([128, 128, 128, 255]);
    expect(at(selected, 8, 17)).toEqual([128, 128, 128, 255]);
    // Along the outer part's own edge, at x = 2.
    expect(at(selected, 3, 17)).toEqual([37, 99, 235, 255]);
  });

  it('draws no mark on a part a filter hides', () => {
    const hidden = input([[1, { selected: true, hidden: true }]]);
    expect(at(hidden, 9, 17)).toEqual([128, 128, 128, 255]);
  });

  it('sizes the marks by how many pixels of the picture a screen pixel takes', () => {
    expect(markBands(PART_MARK_WIDTHS.selected, 2)).toEqual({ casing: 2, line: 4, reach: 8 });
    const selected = input([[1, { selected: true }]]);
    const twice = { ...SHADING, pixelsPerScreenPixel: 2 };
    expect(at(selected, 9, 17, twice)).toEqual([255, 255, 255, 255]);
    expect(at(selected, 10, 17, twice)).toEqual([37, 99, 235, 255]);
  });

  it('keeps 3:1 between every mark and its casing, in both themes', () => {
    for (const theme of [THEMES.light.canvas, THEMES.dark.canvas]) {
      for (const color of [theme.selected, theme.highlight]) {
        expect(contrastRatio(color, casingFor(color))).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('is written in GLSL from the same numbers', () => {
    expect(PART_VERTEX).toContain('uProjectionMatrix');
    expect(PART_FRAGMENT).toContain('uniform sampler2D uParts;');
    expect(PART_FRAGMENT).toContain('mod(value, 256.0)');
    expect(PART_FRAGMENT).toContain(`${PART_MARK_WIDTHS.selected}.0, uSelected`);
    // No name shadows one of GLSL's own functions.
    expect(PART_FRAGMENT).not.toMatch(/int step\b/);
  });
});
