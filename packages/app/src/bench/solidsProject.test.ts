/**
 * The solids benchmark's project holds what the spec counts (M9's "Done when"): 10,000 elements of
 * which 200 show solids, from 20 distinct solids, 4 of them at the caps, and 10 drawings with parts
 * holding 1,000 anchored parts, 100 relations ending on them; and it keeps the rules.
 */
import { SOLID_CAPS, checkProject, readSolid } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { buildScene } from '../canvas/scene';
import { BENCH_SOLIDS, benchSolidFiles } from './solidFiles';
import { SOLIDS_VIEW, benchSolidId, syntheticSolids } from './solidsProject';

describe('the solids benchmark’s files', () => {
  it('are twenty canonical solids, four at the caps, one of 200,000 triangles', () => {
    const files = benchSolidFiles('full');
    expect(files).toHaveLength(BENCH_SOLIDS.count);
    const read = files.map((file) => {
      const each = readSolid(file.bytes);
      if (!each.ok) throw new Error(`${file.name}: ${each.problems[0]?.message}`);
      return each;
    });
    expect(new Set(read.map((each) => each.hash)).size).toBe(BENCH_SOLIDS.count);
    const counts = (index: number) => read[index]?.description.counts;
    const parts = (index: number) => read[index]?.description.parts.length ?? 0;
    // At the cap on named parts, and on nodes.
    expect(parts(0)).toBe(SOLID_CAPS.parts);
    expect(counts(0)?.nodes).toBe(SOLID_CAPS.nodes);
    // At every cap at once: parts, nodes, meshes, and within 1% of the vertices and triangles.
    expect(parts(1)).toBe(SOLID_CAPS.parts);
    expect(counts(1)?.nodes).toBe(SOLID_CAPS.nodes);
    expect(counts(1)?.vertices).toBeGreaterThan(SOLID_CAPS.vertices * 0.99);
    expect(counts(1)?.triangles).toBeGreaterThan(SOLID_CAPS.triangles * 0.99);
    expect(counts(10)?.triangles).toBeGreaterThan(SOLID_CAPS.triangles * 0.999);
    expect(counts(11)?.vertices).toBeGreaterThan(SOLID_CAPS.vertices * 0.999);
    expect(counts(BENCH_SOLIDS.turned)?.triangles).toBeGreaterThan(199_000);
    expect(counts(BENCH_SOLIDS.turned)?.triangles).toBeLessThanOrEqual(200_000);
    for (const index of BENCH_SOLIDS.drawings) expect(parts(index)).toBeGreaterThanOrEqual(100);
    for (const file of files) expect(file.bytes.length).toBeLessThanOrEqual(SOLID_CAPS.fileBytes);
    expect(files.filter((file) => file.atCaps).map((file) => file.index)).toEqual([0, 1, 10, 11]);
  }, 120_000);
});

describe('the solids benchmark’s project', () => {
  const made = syntheticSolids({ elements: 10_000, scale: 'small' });
  const { project } = made;
  const scene = buildScene(project, SOLIDS_VIEW);

  it('holds 10,000 elements and keeps the rules, warning of nothing about solids', () => {
    expect(project.model.elements).toHaveLength(10_000);
    expect(scene.shapes).toHaveLength(10_000);
    const check = checkProject(project);
    expect(check.errors).toEqual([]);
    expect(
      check.warnings.filter((each) => each.code.includes('solid') || each.code.includes('part')),
    ).toEqual([]);
  });

  it('shows solids on 200 shapes, from all twenty, 10 of them drawings with parts', () => {
    const showing = scene.shapes.filter((shape) => shape.solid !== undefined && !shape.part);
    expect(showing).toHaveLength(200);
    expect(new Set(showing.map((shape) => shape.solid?.id)).size).toBe(BENCH_SOLIDS.count);
    const drawings = showing.filter((shape) => shape.solid?.placement === 'parts');
    expect(drawings).toHaveLength(10);
    expect(made.drawings).toHaveLength(10);
    // The middle drawing shows the solid at the cap on parts, the next the one at every cap.
    const shapeOf = (id: string) => scene.shapes.find((shape) => shape.element === id);
    expect(shapeOf(made.drawings[0] as string)?.solid?.id).toBe(benchSolidId(0));
    expect(shapeOf(made.drawings[1] as string)?.solid?.id).toBe(benchSolidId(1));
  });

  it('anchors 1,000 parts, 100 in each drawing, with 100 relations ending on them', () => {
    const anchored = scene.shapes.filter((shape) => shape.part?.inDrawing === true);
    expect(anchored).toHaveLength(1_000);
    const byDrawing = new Map<string, number>();
    for (const shape of anchored) {
      byDrawing.set(
        shape.containerShape ?? '',
        (byDrawing.get(shape.containerShape ?? '') ?? 0) + 1,
      );
    }
    expect([...byDrawing.values()]).toEqual(Array.from({ length: 10 }, () => 100));
    const keys = new Set(anchored.map((shape) => shape.key));
    const onParts = scene.relations.filter(
      (line) =>
        (line.ends?.to.kind === 'shape' && keys.has(line.ends.to.key)) ||
        (line.ends?.from.kind === 'shape' && keys.has(line.ends.from.key)),
    );
    expect(onParts).toHaveLength(100);
  });
});
