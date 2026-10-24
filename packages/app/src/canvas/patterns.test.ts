import { describe, expect, it } from 'vitest';
import { patternCoverage, patternMatrix, patternTexture } from './patterns';

describe('patternCoverage', () => {
  it('covers four sevenths of a dashed line and two thirds of a dotted one', () => {
    const share = (values: number[]) => values.reduce((sum, each) => sum + each, 0) / values.length;
    expect(share(patternCoverage('dashed'))).toBeCloseTo(4 / 7, 2);
    expect(share(patternCoverage('dotted'))).toBeCloseTo(2 / 3, 2);
  });

  it('starts each period with a dash', () => {
    expect(patternCoverage('dashed')[0]).toBe(1);
    expect(patternCoverage('dashed').at(-1)).toBe(0);
  });
});

describe('patternMatrix', () => {
  // The texture's texels along a period, and across the line.
  const TEXELS = 64;

  it('puts one period along the line every seven widths, starting where the piece starts', () => {
    const matrix = patternMatrix('dashed', { x: 100, y: 50 }, { x: 1, y: 0 }, 0, 2);
    expect(matrix.apply({ x: 0, y: 0 })).toEqual({ x: 100, y: 49 });
    expect(matrix.apply({ x: TEXELS, y: 0 })).toEqual({ x: 114, y: 49 });
    expect(matrix.apply({ x: 0, y: 1 })).toEqual({ x: 100, y: 51 });
  });

  it('follows a piece going up, with the period carried on from the pieces before it', () => {
    const matrix = patternMatrix('dotted', { x: 10, y: 10 }, { x: 0, y: -1 }, 9, 3);
    // Nine units travelled is one period of a dotted line three units wide: a period starts here.
    const start = matrix.apply({ x: TEXELS, y: 0.5 });
    expect(start.x).toBeCloseTo(10);
    expect(start.y).toBeCloseTo(10);
    const next = matrix.apply({ x: 2 * TEXELS, y: 0.5 });
    expect(next.y).toBeCloseTo(1);
  });
});

describe('patternTexture', () => {
  it('makes each texture once', () => {
    expect(patternTexture('dashed')).toBe(patternTexture('dashed'));
    expect(patternTexture('dotted')).not.toBe(patternTexture('dashed'));
  });

  it('repeats along the line', () => {
    expect(patternTexture('dashed').source.style.addressModeU).toBe('repeat');
  });
});
