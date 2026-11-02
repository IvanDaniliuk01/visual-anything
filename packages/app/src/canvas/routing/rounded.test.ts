/** Which automatic curves cross a shape, and so are drawn with rounded corners (ADR 0080, section 3). */
import { describe, expect, it } from 'vitest';
import type { Rect } from '../geometry';
import type { ElementShape } from '../scene';
import { curveCrosses } from './rounded';

function block(key: string, rect: Rect): ElementShape {
  return { key, element: key, rect, extent: rect, holdsContents: false } as ElementShape;
}

describe('curveCrosses', () => {
  const from = block('from', { x: 0, y: 0, width: 160, height: 72 });
  const to = block('to', { x: 2000, y: 0, width: 160, height: 72 });

  it('finds a shape standing between two points of the flattened curve (A4)', () => {
    // The curve as flattened, its points far apart; a small table stands between two of them.
    const route = [
      { x: 160, y: 36 },
      { x: 1000, y: 36 },
      { x: 2000, y: 36 },
    ];
    const between = block('between', { x: 1200, y: 0, width: 160, height: 72 });
    expect(curveCrosses(route, ['from', 'to'], [from, to, between])).toBe(true);
    const beside = block('beside', { x: 1200, y: 200, width: 160, height: 72 });
    expect(curveCrosses(route, ['from', 'to'], [from, to, beside])).toBe(false);
  });

  it('never counts its own ends, nor what holds them', () => {
    const route = [
      { x: 80, y: 36 },
      { x: 2080, y: 36 },
    ];
    const holder = block('holder', { x: -40, y: -40, width: 2240, height: 160 });
    const inner = block('from', { x: 0, y: 0, width: 160, height: 72 });
    expect(curveCrosses(route, ['from', 'to'], [inner, to])).toBe(false);
    expect(curveCrosses(route, ['holder/from', 'holder/to'], [holder])).toBe(false);
  });
});
