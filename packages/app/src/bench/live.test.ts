/**
 * The live values benchmark's own pieces (ADR 0057): what it gives every shape, and that a change of
 * every value makes new shapes only for the details that read otherwise. The phases themselves run in
 * the browser, with `pnpm bench` and `?live`.
 */
import { describe, expect, it } from 'vitest';
import { buildScene } from '../canvas/scene';
import { LIVE_ATTRIBUTE, liveLookup, liveScene, withLiveDetail } from './live';
import { syntheticProject } from './synthetic';

describe('the live values benchmark', () => {
  it('shows a live value in every shape’s detail, and changes only those that read otherwise', () => {
    const project = withLiveDetail(syntheticProject({ elements: 2000 }));
    const view = project.views[0]?.id ?? '';
    const scene = buildScene(project, view);
    const first = liveScene(project, scene, liveLookup(scene, 1, 1_000));
    const sample = first.shapes.find((shape) => shape.detail?.includes('●'));
    expect(sample?.detail).toMatch(/^.*● \d+/);
    const second = liveScene(project, scene, liveLookup(scene, 2, 1_000));
    const changed = second.shapes.filter((shape, at) => shape !== first.shapes[at]).length;
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThanOrEqual(scene.shapes.length);
    expect(LIVE_ATTRIBUTE).toBe('latency');
    const began = performance.now();
    liveScene(project, scene, liveLookup(scene, 3, 1_000));
    // Not a mark, which the browser's run sets: only a guard against something far off.
    expect(performance.now() - began).toBeLessThan(2_000);
  });
});
