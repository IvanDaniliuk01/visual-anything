import { describe, expect, it } from 'vitest';
import {
  CANVAS_BACKGROUND,
  DIMMED_ALPHA,
  HIGHLIGHT,
  MARKER_RING,
  TOGGLE_FACE,
  TOGGLE_SIGN,
  contrastRatio,
  readableTextColors,
} from './palette';

describe('readableTextColors', () => {
  it('writes dark text on a light fill and light text on a dark one', () => {
    expect(readableTextColors('#DCEBFF').name).toBe('#1F2933');
    expect(readableTextColors('#1D4F91').name).toBe('#FFFFFF');
  });

  it.each(['#FFFFFF', '#F3F5F8', '#DCEBFF', '#FFF3C9', '#808080', '#1D4F91', '#000000'])(
    'keeps both lines of text on %s at a contrast of at least 4.5:1',
    (fill) => {
      const colors = readableTextColors(fill);
      expect(contrastRatio(colors.name, fill)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors.detail, fill)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe('the emphasis colors', () => {
  it('keeps the highlight and the markers at 3:1 against the canvas and their ring', () => {
    expect(contrastRatio(HIGHLIGHT, CANVAS_BACKGROUND)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(HIGHLIGHT, MARKER_RING)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(TOGGLE_SIGN, TOGGLE_FACE)).toBeGreaterThanOrEqual(4.5);
    expect(DIMMED_ALPHA).toBeGreaterThan(0);
    expect(DIMMED_ALPHA).toBeLessThan(0.5);
  });
});
