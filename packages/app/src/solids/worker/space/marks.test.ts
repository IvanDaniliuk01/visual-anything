// @vitest-environment node
/**
 * The marks of selection, hover and highlight in a space (ADR 0076): drawn inside the edge of what is
 * marked, as a casing, the mark's line and a casing again, never between a piece and one inside it
 * that inherits its marks; each casing keeps 3:1 against its mark's color, in both themes.
 */
import { contrastRatio } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { rgbOf } from '../../../canvas/solids/states';
import { SPACE_MARK } from './layout';
import { MARKS_FRAGMENT, markAt, markColorsOf, type MarkBuffer } from './marks';

/** A frame 20 pixels wide and tall, with a square of these bits from 5 to 14. */
function square(bits: number, inner?: number): MarkBuffer {
  const data = new Uint8Array(400);
  for (let y = 5; y < 15; y++) {
    for (let x = 5; x < 15; x++) {
      const within = inner !== undefined && x >= 9 && x < 12 && y >= 9 && y < 12;
      data[y * 20 + x] = within ? inner : bits;
    }
  }
  return { width: 20, height: 20, bits: data };
}

const LIGHT = markColorsOf('light');

describe('the marks in a space', () => {
  it('draws a casing, the line and a casing again inside a selected region’s edge', () => {
    const buffer = square(SPACE_MARK.selected);
    // The selection's line is two pixels wide between casings one pixel wide.
    expect(markAt(buffer, 5.5, 9.5, LIGHT, 1)).toEqual(rgbOf(LIGHT.selectedCasing));
    expect(markAt(buffer, 6.5, 9.5, LIGHT, 1)).toEqual(rgbOf(LIGHT.selected));
    expect(markAt(buffer, 7.5, 9.5, LIGHT, 1)).toEqual(rgbOf(LIGHT.selected));
    expect(markAt(buffer, 8.5, 9.5, LIGHT, 1)).toEqual(rgbOf(LIGHT.selectedCasing));
    expect(markAt(buffer, 9.5, 9.5, LIGHT, 1)).toBeUndefined();
    expect(markAt(buffer, 2.5, 9.5, LIGHT, 1)).toBeUndefined();
  });

  it('draws no edge between a piece and one inside it that inherits its marks', () => {
    const buffer = square(SPACE_MARK.selected, SPACE_MARK.selected | SPACE_MARK.hovered);
    // At the inner square's edge, the selection goes on unbroken; the hover marks the inner one.
    expect(markAt(buffer, 9.5, 10.5, LIGHT, 1)).toEqual(rgbOf(LIGHT.selectedCasing));
    const outerOnly = square(SPACE_MARK.selected, SPACE_MARK.selected);
    expect(markAt(outerOnly, 9.5, 10.5, LIGHT, 1)).toBeUndefined();
  });

  it('draws a highlight in its own color, wider', () => {
    const buffer = square(SPACE_MARK.highlighted);
    expect(markAt(buffer, 6.5, 9.5, LIGHT, 1)).toEqual(rgbOf(LIGHT.highlight));
    expect(markAt(buffer, 8.5, 9.5, LIGHT, 1)).toEqual(rgbOf(LIGHT.highlight));
    expect(markAt(buffer, 9.5, 9.5, LIGHT, 1)).toEqual(rgbOf(LIGHT.highlightCasing));
  });

  it('keeps 3:1 between each mark and its casing, in both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      const colors = markColorsOf(theme);
      expect(contrastRatio(colors.selected, colors.selectedCasing)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(colors.highlight, colors.highlightCasing)).toBeGreaterThanOrEqual(3);
      // Black and white between them keep 3:1 against any color a solid may have.
      for (const solid of ['#000000', '#FFFFFF', '#767676', colors.selected]) {
        const best = Math.max(contrastRatio(solid, '#000000'), contrastRatio(solid, '#FFFFFF'));
        expect(best).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('is written as the GLSL reads it', () => {
    expect(MARKS_FRAGMENT).toContain(`${SPACE_MARK.highlighted}.0, 3.0`);
    expect(MARKS_FRAGMENT).toContain(`${SPACE_MARK.selected}.0, 2.0`);
    expect(MARKS_FRAGMENT).toContain('discard');
  });
});
