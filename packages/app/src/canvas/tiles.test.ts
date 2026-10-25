import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import type { Rect } from './geometry';
import { indexScene } from './hit';
import { buildScene, type ElementShape, type Scene } from './scene';
import { MAX_BANDS, MAX_RUN, planTiles, plannedTiles, type PlannedTile } from './tiles';

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
    dim: false,
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
