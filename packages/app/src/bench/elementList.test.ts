/**
 * The benchmark's element list and destination phases run on the synthetic project and come back to
 * where they started, each change built into a scene equal to one made from nothing.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { buildScene, buildSceneAfresh } from '../canvas/scene';
import { measureElementList } from './elementList';
import { syntheticProject } from './synthetic';

describe('the element list phases', () => {
  it('lists, sorts, filters, pastes and marks, and comes back to where it started', async () => {
    let project: ProjectSnapshot = syntheticProject({ elements: 120 });
    const start = project;
    const view = project.views[0]!.id;
    const results = await measureElementList(
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
    expect(results.map((each) => each.times.length)).toEqual([1, 1, 1, 2, 2]);
    expect(project.model.elements.map((each) => each.name)).toEqual(
      start.model.elements.map((each) => each.name),
    );
    expect(project.model.elements.some((each) => each.attributes?.benchDocs !== undefined)).toBe(
      false,
    );
  });
});
