import { checkProject } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { indexScene } from '../canvas/hit';
import { buildScene } from '../canvas/scene';
import { syntheticProject } from './synthetic';

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

  it('turns into a scene and an index quickly enough to redraw after an edit', () => {
    const started = performance.now();
    const scene = buildScene(project, 'everything');
    const indexed = indexScene(scene);
    const elapsed = performance.now() - started;
    expect(scene.shapes).toHaveLength(10_000);
    expect(indexed.byKey.size).toBe(10_000);
    expect(scene.relations.length).toBeGreaterThan(9_000);
    // A bound that only a much slower algorithm breaks, such as one quadratic in the elements, on
    // a loaded machine too; the benchmark page measures the real speed.
    expect(elapsed).toBeLessThan(5000);
  });
});
