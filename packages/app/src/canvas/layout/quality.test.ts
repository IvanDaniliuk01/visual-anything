/** The measures of a view as drawn (ADR 0080, "Layout quality"). */
import { describe, expect, it } from 'vitest';
import type { Point, Rect } from '../geometry';
import type { ElementShape, RelationLine, Scene } from '../scene';
import { measureScene, segmentThrough } from './quality';

/** A shape of a scene with what the measures read. */
function shape(key: string, rect: Rect, more: Partial<ElementShape> = {}): ElementShape {
  return {
    key,
    element: key.split('/').at(-1) as string,
    offset: { x: rect.x, y: rect.y },
    positioned: 'stored',
    name: key,
    componentName: 'Thing',
    kind: 'rectangle',
    fill: '#ffffff',
    stroke: '#000000',
    rect,
    extent: rect,
    holdsContents: false,
    ...more,
  };
}

function line(relation: string, from: string, to: string, route: Point[]): RelationLine {
  return {
    relation,
    route,
    from: route[0] as Point,
    to: route.at(-1) as Point,
    middle: route[0] as Point,
    stroke: '#000000',
    width: 1,
    dash: 'solid',
    ends: { from: { kind: 'shape', key: from }, to: { kind: 'shape', key: to }, offset: 0 },
  };
}

function scene(shapes: ElementShape[], relations: RelationLine[]): Scene {
  return { shapes, relations, notes: [], arrows: [], bounds: undefined };
}

describe('measureScene', () => {
  const a = shape('a', { x: 0, y: 0, width: 100, height: 100 });
  const b = shape('b', { x: 400, y: 0, width: 100, height: 100 });
  const c = shape('c', { x: 0, y: 300, width: 100, height: 100 });
  const d = shape('d', { x: 400, y: 300, width: 100, height: 100 });

  it('counts crossings, bends and length', () => {
    const measured = measureScene(
      scene(
        [a, b, c, d],
        [
          line('ad', 'a', 'd', [
            { x: 100, y: 50 },
            { x: 250, y: 50 },
            { x: 250, y: 350 },
            { x: 400, y: 350 },
          ]),
          line('cb', 'c', 'b', [
            { x: 100, y: 350 },
            { x: 200, y: 350 },
            { x: 200, y: 200 },
            { x: 300, y: 200 },
            { x: 300, y: 50 },
            { x: 400, y: 50 },
          ]),
        ],
      ),
    );
    expect(measured.lines).toBe(2);
    // cb crosses ad once, where it runs across at y 200.
    expect(measured.crossings).toBe(1);
    expect(measured.bends).toBe(2 + 4);
    expect(measured.meanLength).toBe(600);
  });

  it('counts segments two lines share only between lines without a common end', () => {
    const along = (relation: string, from: string, to: string, y: number) =>
      line(relation, from, to, [
        { x: 100, y },
        { x: 250, y },
        { x: 250, y: 350 },
        { x: 400, y: 350 },
      ]);
    const shared = measureScene(
      scene([a, b, c, d], [along('ad', 'a', 'd', 50), along('bd', 'b', 'd', 60)]),
    );
    // Both end on d: their common run is a trunk, not a shared segment.
    expect(shared.sharedSegments).toBe(0);
    const apart = measureScene(
      scene(
        [a, b, c, d],
        [
          along('ad', 'a', 'd', 50),
          line('cb', 'c', 'b', [
            { x: 100, y: 380 },
            { x: 250, y: 380 },
            { x: 250, y: 100 },
            { x: 400, y: 100 },
          ]),
        ],
      ),
    );
    expect(apart.sharedSegments).toBe(1);
    expect(apart.sharedLength).toBe(250);
  });

  it('counts lines through shapes that are not their ends, and overlapping siblings', () => {
    const between = shape('between', { x: 200, y: 0, width: 100, height: 100 });
    const pinned = shape('p', { x: 0, y: 0, width: 50, height: 50 }, { positioned: 'pinned' });
    const pinnedToo = shape('q', { x: 10, y: 10, width: 50, height: 50 }, { positioned: 'pinned' });
    const measured = measureScene(
      scene(
        [a, b, between, pinned, pinnedToo],
        [
          line('ab', 'a', 'b', [
            { x: 100, y: 50 },
            { x: 400, y: 50 },
          ]),
        ],
      ),
    );
    expect(measured.linesThroughShapes).toBe(1);
    // a covers both pinned shapes; the two pinned ones cover each other, which layout leaves.
    expect(measured.overlappingSiblings).toBe(2);
    expect(measured.pinnedOverlaps).toBe(1);
  });

  it('tells the ends on a row that lie at its middle on a side of its table', () => {
    const table = shape(
      't',
      { x: 0, y: 0, width: 200, height: 80 },
      { holdsContents: true, rowCount: 2 },
    );
    const row = shape(
      't/r',
      { x: 0, y: 32, width: 200, height: 24 },
      { containerShape: 't', row: 0 },
    );
    const other = shape(
      'u',
      { x: 400, y: 0, width: 200, height: 80 },
      { holdsContents: true, rowCount: 1 },
    );
    const otherRow = shape(
      'u/r',
      { x: 400, y: 32, width: 200, height: 24 },
      { containerShape: 'u', row: 0 },
    );
    const measured = measureScene(
      scene(
        [table, row, other, otherRow],
        [
          line('fk', 't/r', 'u/r', [
            { x: 200, y: 44 },
            { x: 400, y: 50 },
          ]),
        ],
      ),
    );
    expect(measured.rowEnds).toBe(2);
    expect(measured.rowEndsAtMiddle).toBe(1);
  });

  it('can measure only some of the lines', () => {
    const measured = measureScene(
      scene(
        [a, b],
        [
          line('one', 'a', 'b', [
            { x: 100, y: 50 },
            { x: 400, y: 50 },
          ]),
          line('two', 'a', 'b', [
            { x: 100, y: 60 },
            { x: 400, y: 60 },
          ]),
        ],
      ),
      { lines: (each) => each.relation === 'one' },
    );
    expect(measured.lines).toBe(1);
  });
});

describe('segmentThrough', () => {
  const rect = { x: 0, y: 0, width: 100, height: 100 };
  it('finds a segment through a rectangle, and none along or beside its sides', () => {
    expect(segmentThrough({ x: -10, y: 50 }, { x: 110, y: 50 }, rect)).toBe(true);
    expect(segmentThrough({ x: 50, y: 50 }, { x: 50, y: 200 }, rect)).toBe(true);
    expect(segmentThrough({ x: -10, y: 1 }, { x: 110, y: 1 }, rect)).toBe(false);
    expect(segmentThrough({ x: 100, y: 0 }, { x: 100, y: 100 }, rect)).toBe(false);
    expect(segmentThrough({ x: 120, y: 0 }, { x: 120, y: 100 }, rect)).toBe(false);
  });
});
