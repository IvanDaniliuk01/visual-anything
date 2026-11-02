/**
 * The fixture shaped like the user's PostgreSQL model, with faces (ADR 0083, F5): its tables and
 * database views draw a header with their name and schema over their rows, and its columns their name,
 * type and PK and FK badges, as Data modeling's faces do (`withDataModelFaces`). Layout and routing
 * keep their quality with them: no overlaps, every row end at its row's middle, and crossings, lines
 * through shapes and shared segments as the thresholds without faces hold; and every face fits its
 * shape.
 */
import ELK from 'elkjs/lib/elk.bundled.js';
import { describe, expect, it } from 'vitest';
import {
  fixtureCases,
  gaveUpOn,
  laidOutView,
  loadDataModel,
  withDataModelFaces,
} from '../../test/dataModel';
import { faceRect, shapeFaceDrawing } from '../faces';
import { buildSceneAfresh, type Scene } from '../scene';
import { measureScene } from './quality';

const elk = new ELK();
const base = withDataModelFaces(loadDataModel());
const cases = fixtureCases(base);

/** Every face of a scene that does not fit its shape, by key and why. */
function unfitting(scene: Scene): string[] {
  const found: string[] = [];
  for (const shape of scene.shapes) {
    const drawing = shapeFaceDrawing(shape);
    if (!drawing) continue;
    const { width, height } = faceRect(shape);
    const within = (x: number, y: number, w: number, h: number) =>
      x >= -0.5 && y >= -0.5 && x + w <= width + 0.5 && y + h <= height + 0.5;
    if (drawing.fallback) found.push(`${shape.key}: drawn as its name`);
    if (drawing.cut) found.push(`${shape.key}: cut`);
    for (const box of drawing.boxes) {
      if (!within(box.x, box.y, box.width, box.height)) found.push(`${shape.key}: a box`);
    }
    for (const run of drawing.runs) {
      if (!within(run.x, run.y - run.size, run.width, run.size)) {
        found.push(`${shape.key}: "${run.text}"`);
      }
    }
  }
  return found;
}

describe('the fixture with faces (ADR 0083, F5)', () => {
  it('gives every table, database view and column a face, with the table’s schema in its header', () => {
    const scene = buildSceneAfresh(base, 'schema-view');
    const tables = scene.shapes.filter((shape) => shape.rowCount !== undefined);
    const columns = scene.shapes.filter((shape) => shape.row !== undefined);
    expect(tables.length).toBeGreaterThan(5);
    expect(columns.length).toBeGreaterThan(50);
    for (const shape of [...tables, ...columns]) expect(shape.face, shape.key).toBeDefined();
    const table = tables[0]!;
    const texts = shapeFaceDrawing(table)!.runs.map((run) => run.text);
    expect(texts).toContain(table.name);
    expect(texts.some((text) => text.startsWith('schema_'))).toBe(true);
    // Its header is the face's, taller than the canvas's own.
    expect(table.header).toBeGreaterThan(32);
    // A column with its key's badge.
    const keyed = columns.find((shape) =>
      shapeFaceDrawing(shape)?.runs.some((run) => run.text.includes('PK')),
    );
    expect(keyed).toBeDefined();
  });

  it.each(cases)(
    '$name: laid out and routed with faces, no overlaps, ends at their rows, every face fits',
    async (each) => {
      const { scene, built, kept, result } = await laidOutView(each.project, each.view, elk);
      expect(result.stats.onePass).toBe(true);
      const quality = measureScene(scene);
      const held = HELD[each.name] as Held;
      // Layout: no overlaps, and every end on a row at its row's middle.
      expect(quality.overlappingSiblings).toBe(0);
      expect(quality.rowEnds).toBeGreaterThan(0);
      expect(quality.rowEndsAtMiddle).toBe(quality.rowEnds);
      // Crossings no more than after Stage 0a, and crossings per line and fill as reached without faces.
      expect(quality.crossings).toBeLessThanOrEqual(held.crossings);
      expect(quality.crossingsPerLine).toBeLessThanOrEqual(held.crossingsPerLine + 0.05);
      expect(quality.fill).toBeGreaterThanOrEqual(held.fill - 0.01);
      // Routing, as Stage 0b holds it without faces: what the router gives up on, lines through
      // shapes, lines over the shapes that cover their ends, and bends.
      const gaveUp = gaveUpOn(built, kept);
      expect(gaveUp).toBeLessThanOrEqual(Math.ceil(quality.lines / 100));
      expect(quality.linesThroughShapes).toBeLessThanOrEqual(gaveUp);
      if (each.name !== 'overview expanded') expect(quality.linesOverCoveringShapes).toBe(0);
      expect(quality.sharedSegments).toBeLessThanOrEqual(held.sharedSegments);
      expect(quality.bendsPerLine).toBeLessThanOrEqual(held.bendsPerLine);
      // Every face fits its shape: nothing cut, nothing past its rectangle.
      expect(unfitting(scene)).toEqual([]);
      expect(scene.shapes.filter((shape) => shape.face).length).toBeGreaterThan(200);
    },
  );
});

interface Held {
  crossings: number;
  crossingsPerLine: number;
  fill: number;
  sharedSegments: number;
  bendsPerLine: number;
}

/**
 * What each view is held to with faces, measured on 2026-10-30 (without faces → with them):
 *
 * | View | Crossings | Per line | Shared | Bends per line | Fill |
 * |---|---|---|---|---|---|
 * | schema-view | 24 → 24 | 0.67 → 0.67 | 0 → 0 | 1.67 → 1.67 | 0.24 → 0.24 |
 * | overview expanded | 1,821 → 1,725 | 11.17 → 10.58 | 16 → 30 | 4.01 → 3.71 | 0.15 → 0.15 |
 * | overview expanded, unpinned | 1,681 → 1,599 | 10.31 → 9.81 | 0 → 1 | 3.32 → 3.28 | 0.15 → 0.15 |
 * | processing with its tables open | 38 → 38 | 1.36 → 1.36 | 0 → 0 | 1.57 → 1.71 | 0.13 → 0.13 |
 *
 * Crossings, crossings per line, fill and bends are held as `quality.fixture.test.ts` holds them
 * without faces (the thresholds, or what was reached where a threshold is not held). Shared segments
 * are held as reached with faces: the faces' headers, about 13 units taller than the canvas's own,
 * move every row down, ELK lays the overview out otherwise, and two more corridors between tables
 * hold more lines than they have room for. ADR 0080 wants none; the unpinned overview misses it by
 * one, recorded in ADR 0083's clarification of F5.
 */
const HELD: Record<string, Held> = {
  // A4's spacings (ADR 0080's clarification of 2026-10-31): 29 crossings where Stage 0a's 23 and the
  // short C gave 24, as without faces; `processing`, drawn with curves, 57 where it gave 38.
  'schema-view': {
    crossings: 29,
    crossingsPerLine: 0.81,
    fill: 0.21,
    sharedSegments: 0,
    bendsPerLine: 2,
  },
  'overview expanded': {
    crossings: 2083,
    crossingsPerLine: 11.17,
    fill: 0.14,
    sharedSegments: 30,
    bendsPerLine: 4.1,
  },
  'overview expanded, unpinned': {
    crossings: 1825,
    crossingsPerLine: 10.31,
    fill: 0.14,
    sharedSegments: 1,
    bendsPerLine: 4.1,
  },
  'processing with its tables open': {
    crossings: 57,
    crossingsPerLine: 2.04,
    fill: 0.12,
    sharedSegments: 0,
    bendsPerLine: 2,
  },
};
