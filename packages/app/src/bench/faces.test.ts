/**
 * The benchmark's phases with faces (ADR 0083, F5): every table and column of the view of tables, and
 * every shape of the benchmark's own project, carries a face that lays out without a problem, and the
 * scene's numbers are measured in Node as in the page. The frames themselves are measured in the
 * browser, with `pnpm bench` and `?tables&faces`.
 */
import { describe, expect, it } from 'vitest';
import { shapeFaceDrawing } from '../canvas/faces';
import { buildSceneAfresh } from '../canvas/scene';
import { hitRate, measureFacesScene, withBenchFaces } from './faces';
import { syntheticProject, syntheticTables } from './synthetic';

describe('the benchmark’s faces', () => {
  it('give every table and column a face that lays out whole, the tables’ over their rows', () => {
    const project = withBenchFaces(syntheticTables(500));
    const scene = buildSceneAfresh(project, project.views[0]?.id ?? '');
    const tables = scene.shapes.filter((shape) => shape.rowCount !== undefined);
    const columns = scene.shapes.filter((shape) => shape.row !== undefined);
    expect(tables.length).toBeGreaterThan(10);
    expect(columns.length).toBeGreaterThan(400);
    for (const shape of [...tables, ...columns]) {
      expect(shape.face?.compiled.ok, shape.key).toBe(true);
      const drawing = shapeFaceDrawing(shape);
      expect(drawing?.fallback, shape.key).toBeUndefined();
      expect(drawing?.runs.length, shape.key).toBeGreaterThan(0);
    }
    // A table's face is its header, taller than the canvas's own.
    expect(tables[0]?.header).toBeGreaterThan(32);
  });

  it('give every shape of the benchmark’s own project a face', () => {
    const project = withBenchFaces(syntheticProject({ elements: 300 }));
    const scene = buildSceneAfresh(project, project.views[0]?.id ?? '');
    expect(scene.shapes.every((shape) => shape.face !== undefined)).toBe(true);
  });

  it('measure the first build, the builds after a move, and the face layout cache', () => {
    const project = withBenchFaces(syntheticTables(500));
    const numbers = measureFacesScene(project, undefined, { moves: 3, runs: 2 });
    expect(numbers.faced).toBe(numbers.shapes);
    expect(numbers.firstBuilds).toHaveLength(2);
    expect(numbers.moves).toHaveLength(3);
    // Each table's header is laid out before layout.
    expect(numbers.firstBuildCounts.laidOut).toBeGreaterThan(0);
    // Every face is laid out the first time a tile draws it, and kept for the next.
    expect(numbers.drawn.asked).toBe(numbers.faced);
    expect(numbers.drawnAgain.laidOut).toBeLessThanOrEqual(2);
    expect(hitRate(numbers.drawnAgain)).toMatch(/^(99|100)\./);
    expect(hitRate({ asked: 0, laidOut: 0 })).toBe('–');
  });
});
