import { describe, expect, it } from 'vitest';
import type { ResolvedRoute } from '@visual-anything/core';
import type { Point, Rect } from '../geometry';
import { routeLine, withoutIdleBends, type HandOfLine, type LineEnds } from './scene-routes';

const A: Rect = { x: 0, y: 0, width: 100, height: 60 };

function line(to: Rect, bendPoints: Point[], style: ResolvedRoute['style'] = 'orthogonal') {
  const ends: LineEnds = {
    relation: 'r',
    offset: 0,
    fromShape: undefined,
    toShape: undefined,
    from: { rect: A },
    to: { rect: to },
  };
  const hand: HandOfLine = {
    route: {
      relation: 'r',
      from: { kind: 'border', side: 'right', at: 0.5 },
      to: { kind: 'border', side: 'left', at: 0.5 },
      style,
      bendPoints: [],
      byHand: true,
    },
    bendPoints,
    bendOrigin: { x: 0, y: 0 },
  };
  return { ends, hand };
}

describe('bend points a route no longer turns at', () => {
  it('are dropped where they lie in a straight run', () => {
    const { ends, hand } = line({ x: 300, y: 0, width: 100, height: 60 }, [
      { x: 150, y: 30 },
      { x: 250, y: 30 },
    ]);
    expect(withoutIdleBends(ends, hand).bendPoints).toEqual([]);
    expect(routeLine(ends, withoutIdleBends(ends, hand)).route).toEqual(
      routeLine(ends, hand).route,
    );
  });

  it('are dropped past a corner the route would fold back from, and the route never folds', () => {
    const { ends, hand } = line({ x: 300, y: 200, width: 100, height: 60 }, [
      { x: 150, y: 30 },
      { x: 150, y: 230 },
      { x: 130, y: 230 },
    ]);
    // The run to the last bend point goes left, past the corner, and back right to the end.
    expect(routeLine(ends, hand).route).toEqual([
      { x: 100, y: 30 },
      { x: 150, y: 30 },
      { x: 150, y: 230 },
      { x: 300, y: 230 },
    ]);
    const kept = withoutIdleBends(ends, hand);
    expect(kept.bendPoints).toEqual([
      { x: 150, y: 30 },
      { x: 150, y: 230 },
    ]);
    expect(routeLine(ends, kept).route).toEqual(routeLine(ends, hand).route);
  });

  it('are dropped past a corner the route comes back from a fraction of a unit away', () => {
    // Both ends on their left sides, at places kept to three decimals: the end's run is at y 288.128.
    const ends: LineEnds = {
      relation: 'r',
      offset: 0,
      fromShape: undefined,
      toShape: undefined,
      from: { rect: { x: 128, y: 456, width: 240, height: 71 } },
      to: { rect: { x: 100, y: 256, width: 180, height: 64 } },
    };
    const hand: HandOfLine = {
      route: {
        relation: 'r',
        from: { kind: 'border', side: 'left', at: 0.562 },
        to: { kind: 'border', side: 'left', at: 0.502 },
        style: 'orthogonal',
        bendPoints: [],
        byHand: true,
      },
      bendPoints: [
        { x: 116, y: 496 },
        { x: 64, y: 496 },
        { x: 64, y: 288 },
        { x: 30, y: 288 },
      ],
      bendOrigin: { x: 0, y: 0 },
    };
    const route = routeLine(ends, hand).route;
    expect(route).toHaveLength(4);
    expect(Math.min(...route.map((point) => point.x))).toBe(64);
    const kept = withoutIdleBends(ends, hand);
    expect(kept.bendPoints).toEqual([
      { x: 64, y: 496 },
      { x: 64, y: 288 },
    ]);
    expect(routeLine(ends, kept).route).toEqual(route);
  });

  it('stay where the route turns at them', () => {
    const { ends, hand } = line({ x: 300, y: 200, width: 100, height: 60 }, [
      { x: 150, y: 30 },
      { x: 150, y: 120 },
      { x: 200, y: 120 },
      { x: 200, y: 230 },
    ]);
    expect(withoutIdleBends(ends, hand)).toBe(hand);
  });

  it('stay on straight and curved routes', () => {
    const { ends, hand } = line(
      { x: 300, y: 0, width: 100, height: 60 },
      [{ x: 200, y: 30 }],
      'straight',
    );
    expect(withoutIdleBends(ends, hand)).toBe(hand);
  });
});
