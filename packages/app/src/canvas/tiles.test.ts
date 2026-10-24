import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { arrowheadAt, distance, middle, type Point, type Rect } from './geometry';
import { indexScene } from './hit';
import { lengthOf, midpointOf } from './route';
import { buildScene, type ElementShape, type RelationLine, type Scene } from './scene';
import {
  MAX_BANDS,
  MAX_RUN,
  TILE,
  cellOf,
  drawnRoute,
  planTiles,
  plannedTiles,
  relationTiles,
  routePieces,
  type PlannedTile,
} from './tiles';

function shapeAt(key: string, rect: Rect): ElementShape {
  return {
    key,
    element: key,
    offset: { x: rect.x, y: rect.y },
    positioned: 'stored',
    name: key,
    componentName: 'Box',
    kind: 'rectangle',
    fill: '#FFFFFF',
    stroke: '#000000',
    rect,
    extent: rect,
    holdsContents: false,
  };
}

function sceneOf(shapes: ElementShape[], drawing?: number[]): Scene {
  return {
    shapes,
    ...(drawing ? { drawing } : {}),
    relations: [],
    notes: [],
    arrows: [],
    bounds: undefined,
  };
}

const previousOf = (tiles: readonly PlannedTile[]) =>
  new Map(tiles.map((tile) => [tile.key, { cell: tile.cell, signature: tile.signature }]));

/** Shapes each 4 right and 2 down from the one before, so that every one overlaps the one before. */
function stacked(count: number, from = { x: 0, y: 0 }): ElementShape[] {
  return Array.from({ length: count }, (_, at) =>
    shapeAt(`s${String(at).padStart(3, '0')}`, {
      x: from.x + at * 4,
      y: from.y + at * 2,
      width: 100,
      height: 50,
    }),
  );
}

describe('plannedTiles', () => {
  const sample = indexScene(buildScene(loadSample(), 'system-overview'));

  it('puts each shape in the tile of its band and of the cell its middle falls in', () => {
    const tiles = plannedTiles(sample, new Set());
    expect(tiles.map((tile) => [tile.key, tile.shapes.map((shape) => shape.element)])).toEqual([
      ['shapes 0 0,0', ['clinic-booking', 'patient']],
      ['shapes 1 0,0', ['booking-agent', 'scheduling', 'whatsapp']],
      ['shapes 2 0,0', ['appointments-api', 'appointments-db']],
      ['shapes 2 1,0', ['reminder-service']],
    ]);
  });

  it('leaves out hidden shapes', () => {
    const tiles = plannedTiles(sample, new Set(['patient', 'clinic-booking/scheduling']));
    expect(tiles.flatMap((tile) => tile.shapes.map((shape) => shape.key))).not.toContain('patient');
    expect(tiles.find((tile) => tile.key === 'shapes 1 0,0')?.shapes).toHaveLength(2);
  });

  it('draws shapes beyond the last band in runs, in drawing order', () => {
    const indexed = indexScene(sceneOf(stacked(40)));
    const tiles = plannedTiles(indexed, new Set());
    const inBands = tiles.filter((tile) => tile.band < MAX_BANDS);
    const runs = tiles.filter((tile) => tile.band === MAX_BANDS);
    expect(inBands).toHaveLength(32);
    expect(new Set(inBands.map((tile) => tile.band)).size).toBe(32);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.key).toBe('shapes over s032');
    expect(runs[0]?.rank).toBe(32);
    expect(runs[0]?.shapes.map((shape) => shape.key)).toEqual(
      stacked(40)
        .slice(32)
        .map((shape) => shape.key),
    );
  });

  it('starts a new run at a change of cell and after the longest run', () => {
    const shapes = stacked(32 + MAX_RUN + 10);
    // A last shape far away, in another cell, overlapping the ones before it through a long one.
    const indexed = indexScene(sceneOf(shapes));
    const runs = plannedTiles(indexed, new Set()).filter((tile) => tile.band === MAX_BANDS);
    expect(runs.map((tile) => tile.shapes.length)).toEqual([MAX_RUN, 10]);
    expect(runs.map((tile) => tile.rank)).toEqual([32, 32 + MAX_RUN]);

    const across = [
      ...stacked(34),
      shapeAt('wide', { x: 0, y: 0, width: 3000, height: 100 }),
      shapeAt('far', { x: 2900, y: 0, width: 60, height: 60 }),
    ];
    const split = plannedTiles(indexScene(sceneOf(across)), new Set()).filter(
      (tile) => tile.band === MAX_BANDS,
    );
    expect(split.map((tile) => tile.shapes.map((shape) => shape.key))).toEqual([
      ['s032', 's033'],
      ['wide'],
      ['far'],
    ]);
  });

  it('signs a band’s tile by what it holds whatever the order, and a run in drawing order', () => {
    const one = plannedTiles(sample, new Set());
    const shuffled = indexScene({ ...sample.scene, drawing: [1, 4, 6, 7, 5, 3, 2, 0] });
    const two = plannedTiles(shuffled, new Set());
    expect(two.map((tile) => [tile.key, tile.signature])).toEqual(
      one.map((tile) => [tile.key, tile.signature]),
    );

    const shapes = stacked(34);
    const forward = plannedTiles(indexScene(sceneOf(shapes)), new Set());
    const [a, b] = forward.filter((tile) => tile.band === MAX_BANDS)[0]?.shapes ?? [];
    expect(a?.key).toBe('s032');
    expect(b?.key).toBe('s033');
  });
});

describe('planTiles', () => {
  const tile = (key: string, cell: string, signature: string): PlannedTile => ({
    key,
    band: 0,
    cell,
    signature,
    shapes: [],
    rank: 0,
  });

  it('keeps, moves, makes and drops', () => {
    const previous = previousOf([
      tile('a', '0,0', 'x'),
      tile('b', '0,0', 'y'),
      tile('c', '1,0', 'z'),
      tile('d', '2,0', 'w'),
    ]);
    const plan = planTiles(previous, [
      tile('a', '0,0', 'x'),
      tile('b2', '0,0', 'y'),
      tile('c', '1,0', 'z2'),
    ]);
    expect(plan.keep).toEqual(['a']);
    expect(plan.move).toEqual([{ from: 'b', to: 'b2' }]);
    expect(plan.make.map((each) => each.key)).toEqual(['c']);
    expect(plan.drop.sort()).toEqual(['c', 'd']);
  });

  it('moves every tile and makes none when two overlapping shapes in shared cells swap', () => {
    // Two containers that overlap across cells, each with a content in a cell of its own.
    const shapes = [
      shapeAt('A', { x: 0, y: 0, width: 1500, height: 1000 }),
      { ...shapeAt('A/a', { x: 1100, y: 100, width: 100, height: 50 }), containerShape: 'A' },
      shapeAt('B', { x: 1000, y: 600, width: 1500, height: 1000 }),
      { ...shapeAt('B/b', { x: 2100, y: 1400, width: 100, height: 50 }), containerShape: 'B' },
    ];
    const before = plannedTiles(indexScene(sceneOf(shapes, [0, 1, 2, 3])), new Set());
    const after = plannedTiles(indexScene(sceneOf(shapes, [2, 3, 0, 1])), new Set());
    expect(after.map((each) => each.key)).not.toEqual(before.map((each) => each.key));
    const plan = planTiles(previousOf(before), after);
    expect(plan.keep).toEqual([]);
    expect(plan.make).toEqual([]);
    expect(plan.drop).toEqual([]);
    expect(plan.move).toHaveLength(4);
  });
});

/** A relation drawn along a route, solid and without an arrowhead unless told otherwise. */
function lineAlong(route: Point[], extra: Partial<RelationLine> = {}): RelationLine {
  return {
    relation: 'r',
    route,
    from: route[0] as Point,
    to: route.at(-1) as Point,
    middle: midpointOf(route),
    stroke: '#000000',
    width: 2,
    dash: 'solid',
    ...extra,
  };
}

describe('routePieces', () => {
  it('cuts a route where it passes from one cell to another, carrying on how far it has come', () => {
    const pieces = routePieces(
      lineAlong([
        { x: 100, y: 100 },
        { x: 2500, y: 100 },
      ]),
    );
    expect(pieces.map((piece) => [piece.cell, piece.points, piece.travelled])).toEqual([
      [
        '0,0',
        [
          { x: 100, y: 100 },
          { x: 1024, y: 100 },
        ],
        0,
      ],
      [
        '1,0',
        [
          { x: 1024, y: 100 },
          { x: 2048, y: 100 },
        ],
        924,
      ],
      [
        '2,0',
        [
          { x: 2048, y: 100 },
          { x: 2500, y: 100 },
        ],
        1948,
      ],
    ]);
    expect(pieces.every((piece) => !piece.bendAtStart && !piece.bendAtEnd)).toBe(true);
    expect(pieces.map((piece) => piece.last)).toEqual([false, false, true]);
  });

  it('keeps a bend inside a cell in one piece, and says where a piece ends at a bend', () => {
    const inside = routePieces(
      lineAlong([
        { x: 100, y: 100 },
        { x: 500, y: 100 },
        { x: 500, y: 900 },
      ]),
    );
    expect(inside.map((piece) => piece.points)).toEqual([
      [
        { x: 100, y: 100 },
        { x: 500, y: 100 },
        { x: 500, y: 900 },
      ],
    ]);
    // Bent on the side two cells share: the second segment runs along it, in the cell to its right.
    const onTheSide = routePieces(
      lineAlong([
        { x: 100, y: 100 },
        { x: 1024, y: 100 },
        { x: 1024, y: 900 },
      ]),
    );
    expect(
      onTheSide.map((piece) => [
        piece.cell,
        piece.bendAtStart,
        piece.bendAtEnd,
        piece.points.length,
      ]),
    ).toEqual([
      ['0,0', false, true, 2],
      ['1,0', true, false, 2],
    ]);
  });

  it('stops the line at the base of its arrowhead, which covers the rest', () => {
    const route = [
      { x: 100, y: 100 },
      { x: 600, y: 100 },
    ];
    const arrowhead = arrowheadAt(route[0] as Point, route[1] as Point, 2);
    const line = lineAlong(route, { arrowhead });
    expect(drawnRoute(line).at(-1)).toEqual(middle(arrowhead.left, arrowhead.right));
    expect(routePieces(line).at(-1)?.points.at(-1)).toEqual(
      middle(arrowhead.left, arrowhead.right),
    );
  });

  it('cuts any route into pieces that each lie in their cell and together draw the whole route', () => {
    const step = fc.tuple(fc.boolean(), fc.integer({ min: -4000, max: 4000 }));
    const start = fc.record({
      x: fc.integer({ min: -3000, max: 3000 }),
      y: fc.integer({ min: -3000, max: 3000 }),
    });
    fc.assert(
      fc.property(start, fc.array(step, { minLength: 1, maxLength: 5 }), (first, steps) => {
        // An orthogonal route, as relations are routed.
        const route: Point[] = [first];
        for (const [across, by] of steps) {
          const last = route.at(-1) as Point;
          route.push(across ? { x: last.x + by, y: last.y } : { x: last.x, y: last.y + by });
        }
        const line = lineAlong(route);
        const pieces = routePieces(line);
        let travelled = 0;
        pieces.forEach((piece, at) => {
          const [column = 0, row = 0] = piece.cell.split(',').map(Number);
          for (const point of piece.points) {
            expect(point.x).toBeGreaterThanOrEqual(column * TILE);
            expect(point.x).toBeLessThanOrEqual((column + 1) * TILE);
            expect(point.y).toBeGreaterThanOrEqual(row * TILE);
            expect(point.y).toBeLessThanOrEqual((row + 1) * TILE);
          }
          expect(piece.travelled).toBeCloseTo(travelled, 6);
          travelled += lengthOf(piece.points);
          const next = pieces[at + 1];
          if (next) expect(next.points[0]).toEqual(piece.points.at(-1));
        });
        expect(travelled).toBeCloseTo(lengthOf(drawnRoute(line)), 6);
      }),
    );
  });
});

describe('relationTiles', () => {
  const across = lineAlong(
    [
      { x: 100, y: 100 },
      { x: 3000, y: 100 },
    ],
    { relation: 'across', label: 'HTTPS' },
  );
  const directed: RelationLine = {
    ...across,
    arrowhead: arrowheadAt({ x: 100, y: 100 }, { x: 3000, y: 100 }, 2),
  };
  const short = lineAlong(
    [
      { x: 200, y: 300 },
      { x: 400, y: 300 },
    ],
    { relation: 'short' },
  );

  it('draws a relation in every cell it crosses, its arrowhead where its tip is and its name where its middle is', () => {
    const tiles = relationTiles([directed, short], new Set());
    const byCell = new Map(tiles.map((tile) => [tile.cell, tile]));
    expect([...byCell.keys()].sort()).toEqual(['0,0', '1,0', '2,0']);
    expect(byCell.get('0,0')?.pieces.map((piece) => piece.line.relation)).toEqual([
      'across',
      'short',
    ]);
    expect(byCell.get('2,0')?.ends.map((line) => line.relation)).toEqual(['across']);
    expect(byCell.get(cellOf(directed.middle))?.lines.map((line) => line.relation)).toEqual([
      'across',
    ]);
    expect(byCell.get('0,0')?.lines.map((line) => line.relation)).toEqual(['short']);
    // However long its relations, a tile spans about its cell.
    for (const tile of tiles) {
      expect(tile.bounds.width).toBeLessThanOrEqual(TILE + 256);
      expect(tile.bounds.height).toBeLessThanOrEqual(TILE + 256);
    }
  });

  it('leaves out hidden relations, and signs each tile by the relations it draws', () => {
    const before = relationTiles([across, short], new Set());
    const moved = lineAlong(
      [
        { x: 200, y: 320 },
        { x: 400, y: 320 },
      ],
      { relation: 'short' },
    );
    const after = relationTiles([across, moved], new Set());
    const signature = (tiles: typeof before, cell: string) =>
      tiles.find((tile) => tile.cell === cell)?.signature;
    expect(signature(after, '0,0')).not.toBe(signature(before, '0,0'));
    expect(signature(after, '1,0')).toBe(signature(before, '1,0'));
    expect(relationTiles([across, short], new Set(['across'])).map((tile) => tile.cell)).toEqual([
      '0,0',
    ]);
    expect(distance(directed.to, { x: 3000, y: 100 })).toBe(0);
  });
});
