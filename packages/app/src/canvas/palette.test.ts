import { describe, expect, it } from 'vitest';
import { contrastRatio, readableTextColors } from './palette';

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
