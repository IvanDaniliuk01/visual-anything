import { checkProject } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { centerOf } from '../canvas/geometry';
import { indexScene, type IndexedScene } from '../canvas/hit';
import { buildScene } from '../canvas/scene';
import { MAX_BANDS, cellOf, plannedTiles } from '../canvas/tiles';
import { SYNTHETIC_IMAGES } from './images';
import {
  LARGE_TABLE,
  LARGE_TABLE_COLUMNS,
  TABLE_COLUMNS,
  syntheticProject,
  type Overlap,
} from './synthetic';

/** Builds and indexes a mode at 10,000 elements, and how long that took. */
function built(overlap: Overlap): { indexed: IndexedScene; elapsed: number } {
  const project = syntheticProject({ elements: 10_000, overlap });
  const started = performance.now();
  const indexed = indexScene(buildScene(project, 'everything'));
  return { indexed, elapsed: performance.now() - started };
}

const modes = new Map<Overlap, ReturnType<typeof built>>();
function mode(overlap: Overlap): ReturnType<typeof built> {
  let made = modes.get(overlap);
  if (!made) {
    made = built(overlap);
    modes.set(overlap, made);
  }
  return made;
}

function maximumBand(indexed: IndexedScene): number {
  return Math.max(...indexed.bands);
}

describe('syntheticProject', () => {
  const project = syntheticProject({ elements: 10_000 });

  it('holds 10,000 elements, each with a stored position, and keeps the rules', () => {
    expect(project.model.elements).toHaveLength(10_000);
    expect(project.views[0]?.positions).toHaveLength(10_000);
    expect(checkProject(project).errors).toEqual([]);
  });

  it('is the same every time', () => {
    expect(syntheticProject({ elements: 500 })).toEqual(syntheticProject({ elements: 500 }));
  });

  it('names about a third of its relations', () => {
    const named = project.model.relations.filter((relation) => relation.name !== undefined);
    const between = project.model.relations.filter(
      (relation) => relation.relationType !== 'systems.is-part-of',
    );
    expect(named.length / between.length).toBeGreaterThan(0.3);
    expect(named.length / between.length).toBeLessThan(0.36);
  });

  it('turns into a scene and an index quickly enough to redraw after an edit', () => {
    const { indexed, elapsed } = mode('none');
    expect(indexed.scene.shapes).toHaveLength(10_000);
    expect(indexed.byKey.size).toBe(10_000);
    expect(indexed.scene.relations.length).toBeGreaterThan(9_000);
    // A bound that only a much slower algorithm breaks, such as one quadratic in the elements, on
    // a loaded machine too; the benchmark page measures the real speed.
    expect(elapsed).toBeLessThan(5000);
  });

  it('draws as many tiles in bands as by the containers above each shape', () => {
    const { indexed } = mode('none');
    expect(maximumBand(indexed)).toBe(1);
    const byContainers = new Set(
      indexed.scene.shapes.map(
        (shape) => `${shape.key.split('/').length - 1} ${cellOf(centerOf(shape.rect))}`,
      ),
    );
    expect(plannedTiles(indexed, new Set())).toHaveLength(byContainers.size);
  });

  // Three projects of 10,000 elements, each checked and laid out: the bound on each layout below is
  // the test, so the whole may take longer than a test usually does on a slow CI runner.
  it(
    'lays out every way of overlapping with the same elements, quickly, and keeps the rules',
    { timeout: 30_000 },
    () => {
      for (const overlap of ['stairs', 'grid', 'cascade'] as const) {
        const project = syntheticProject({ elements: 10_000, overlap });
        expect(project.model.elements, overlap).toHaveLength(10_000);
        expect(checkProject(project).errors, overlap).toEqual([]);
        const { indexed, elapsed } = mode(overlap);
        expect(indexed.scene.shapes, overlap).toHaveLength(10_000);
        expect(elapsed, overlap).toBeLessThan(5000);
      }
    },
  );

  it('draws a grid of touching shapes in one band, one tile to a cell', () => {
    const { indexed } = mode('grid');
    expect(maximumBand(indexed)).toBe(0);
    expect(plannedTiles(indexed, new Set())).toHaveLength(50);
  });

  it('draws staircases one band higher for each step', () => {
    const { indexed } = mode('stairs');
    // A system, four steps, and a shape directly in World over them.
    expect(maximumBand(indexed)).toBe(5);
  });

  it('draws a long cascade in every band, then in fewer than a hundred runs', () => {
    const { indexed } = mode('cascade');
    const tiles = plannedTiles(indexed, new Set());
    const first = tiles.filter(
      (tile) => tile.band < MAX_BANDS && tile.shapes.some((shape) => shape.element === 'cascade-0'),
    );
    expect(first).toHaveLength(1);
    const start = tiles.filter(
      (tile) =>
        tile.band < MAX_BANDS && tile.shapes.some((shape) => shape.element.startsWith('cascade-')),
    );
    expect(start).toHaveLength(MAX_BANDS);
    const runs = tiles.filter((tile) => tile.band === MAX_BANDS);
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.length).toBeLessThan(100);
  });
});

describe('syntheticProject with tables', () => {
  const project = syntheticProject({ elements: 10_000, tables: true });

  it('holds 400 tables of 24 columns, one of 300, and 1,000 references, and keeps the rules', () => {
    const tables = project.model.elements.filter(
      (element) => element.component === 'data-modeling.table',
    );
    expect(tables).toHaveLength(401);
    expect(project.model.elements).toHaveLength(401 + 400 * TABLE_COLUMNS + LARGE_TABLE_COLUMNS);
    const references = project.model.relations.filter(
      (relation) => relation.relationType === 'data-modeling.references',
    );
    expect(references.length).toBeGreaterThan(900);
    expect(references.length).toBeLessThanOrEqual(1_000);
    expect(checkProject(project).errors).toEqual([]);
  });

  it('draws each table with its rows, its rows one band above it', () => {
    const scene = buildScene(project, 'tables');
    const large = scene.shapes.find((shape) => shape.element === LARGE_TABLE);
    expect(large?.rowCount).toBe(LARGE_TABLE_COLUMNS);
    expect(maximumBand(indexScene(scene))).toBe(1);
    expect(scene.relations.length).toBeGreaterThan(900);
  });
});

describe('syntheticProject with tables and images', () => {
  const project = syntheticProject({ elements: 2_000, tables: true, images: true });

  it('shows a picture on every table and column, the photos among them, and keeps the rules', () => {
    const { elements } = project.model;
    expect(elements.every((element) => element.appearance?.image !== undefined)).toBe(true);
    const photos = elements.filter((element) => {
      const image = element.appearance?.image;
      return image !== undefined && image !== 'none' && image.placement === 'drawing';
    });
    expect(photos).toHaveLength(SYNTHETIC_IMAGES.photos);
    expect(project.project.packages).toEqual(project.packages.map((file) => file.id));
    expect(project.project.packages[0]).toBe('data-modeling');
    expect(checkProject(project).errors).toEqual([]);
  });

  it('draws a table’s picture in its header and a column’s at its row’s left', () => {
    const scene = buildScene(project, 'tables');
    const rows = scene.shapes.filter((shape) => shape.row !== undefined);
    const tables = scene.shapes.filter((shape) => shape.rowCount !== undefined);
    expect(rows.length).toBeGreaterThan(2_000);
    expect(rows.every((shape) => shape.image?.placement === 'icon')).toBe(true);
    expect(tables.every((shape) => shape.image?.placement === 'header')).toBe(true);
  });
});
