import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ROBOTO_VARIANTS, robotoEms, robotoWidth } from './roboto';
import {
  BOLD_ITALIC_WIDTHS,
  BOLD_WIDTHS,
  ITALIC_WIDTHS,
  MEASURED_EXTRA,
  MEASURED_RANGES,
  REGULAR_WIDTHS,
} from './roboto-widths';

describe("Roboto's widths", () => {
  it('holds one width for every code point measured, in each of the four styles', () => {
    const count =
      MEASURED_RANGES.reduce((sum, [from, to]) => sum + to - from + 1, 0) + MEASURED_EXTRA.length;
    for (const table of [REGULAR_WIDTHS, BOLD_WIDTHS, ITALIC_WIDTHS, BOLD_ITALIC_WIDTHS]) {
      expect(table).toHaveLength(count);
    }
  });

  it('measures as the fonts do', () => {
    // "M" in Roboto Regular is 0.873 em, in Bold 0.876, in Italic 0.852 and in Bold Italic 0.854.
    expect(robotoWidth('M', 'regular', 1000)).toBeCloseTo(873);
    expect(robotoWidth('M', 'bold', 1000)).toBeCloseTo(876);
    expect(robotoEms(0x4d, 'italic')).toBe(ITALIC_WIDTHS[0x4d - 0x20]! / 1000);
    expect(robotoEms(0x4d, 'boldItalic')).toBe(BOLD_ITALIC_WIDTHS[0x4d - 0x20]! / 1000);
    expect(robotoWidth('abc', 'mono', 10)).toBeCloseTo(18);
    expect(robotoWidth('', 'regular', 12)).toBe(0);
  });

  it('gives characters it does not hold an estimate: wide for East Asian scripts and emoji', () => {
    expect(robotoEms(0x4e2d, 'regular')).toBe(1);
    expect(robotoEms(0x1f600, 'bold')).toBe(1);
    expect(robotoEms(0x0416, 'italic')).toBe(0.6);
  });

  it('is additive, positive and proportional to the size', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.constantFrom(...ROBOTO_VARIANTS),
        fc.integer({ min: 1, max: 64 }),
        (a, b, variant, size) => {
          const whole = robotoWidth(a + b, variant, size);
          expect(whole).toBeCloseTo(robotoWidth(a, variant, size) + robotoWidth(b, variant, size));
          expect(whole).toBeGreaterThanOrEqual(0);
          expect(robotoWidth(a, variant, size * 2)).toBeCloseTo(robotoWidth(a, variant, size) * 2);
        },
      ),
    );
  });
});
