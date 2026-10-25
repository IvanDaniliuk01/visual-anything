import { checkProject } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { syntheticProject } from '../../bench/synthetic';
import { buildScene, buildSceneAfresh } from '../scene';

describe('the synthetic project with routes chosen by hand', () => {
  const project = syntheticProject({ elements: 2000, routes: 300 });
  const view = project.views[0];

  it('routes the first relations by hand, a third of them curved', () => {
    const routes = Object.values(view?.routes ?? {});
    expect(routes).toHaveLength(300);
    expect(routes.filter((route) => route.style === 'curved')).toHaveLength(100);
    expect(routes.filter((route) => route.style === 'straight')).toHaveLength(100);
    expect(routes.filter((route) => route.bendPoints?.length === 1)).toHaveLength(100);
    expect(checkProject(project).errors).toEqual([]);
    const routeCodes = new Set([
      'unknown-relation',
      'end-does-not-fit',
      'unknown-connection-point',
    ]);
    expect(
      checkProject(project).warnings.filter((warning) => routeCodes.has(warning.code)),
    ).toEqual([]);
  });

  it('draws them by hand, as a build from nothing does', () => {
    const scene = buildScene(project, 'everything');
    const lines = scene.relations.filter((line) => line.hand);
    expect(lines).toHaveLength(300);
    expect(lines.filter((line) => line.curve)).toHaveLength(100);
    expect(scene).toEqual(buildSceneAfresh(project, 'everything'));
  });

  it('leaves them out unless asked', () => {
    expect(syntheticProject({ elements: 200 }).views[0]).not.toHaveProperty('routes');
  });
});
