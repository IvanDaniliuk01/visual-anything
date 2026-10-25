/**
 * The benchmark's scope phase runs its changes on the synthetic project and comes back to where it
 * started, each change built into a scene equal to one made from nothing.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { buildScene, buildSceneAfresh } from '../canvas/scene';
import { measureScopeChanges } from './scope';
import { syntheticProject } from './synthetic';

describe('the scope phase', () => {
  it('changes the scope three ways and back, every scene as built from nothing', async () => {
    let project: ProjectSnapshot = syntheticProject({ elements: 120 });
    const start = project;
    const view = project.views[0]!.id;
    const results = await measureScopeChanges(
      {
        project: () => project,
        show: (next) => {
          project = next;
          expect(buildScene(next, view)).toEqual(buildSceneAfresh(next, view));
          return { build: 1, index: 1, draw: 1 };
        },
        settle: () => Promise.resolve(),
        view,
      },
      1,
    );
    expect(results.map((each) => each.times.length)).toEqual([2, 2, 2]);
    expect(project.views[0]?.scope).toBeUndefined();
    expect(project.model).toBe(start.model);
  });
});
