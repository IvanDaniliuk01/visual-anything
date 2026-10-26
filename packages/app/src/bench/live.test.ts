/**
 * The live values benchmark's own pieces (ADR 0057): what it gives every shape, and that a change of
 * every value makes new shapes only for the details that read otherwise. The phases themselves run in
 * the browser, with `pnpm bench` and `?live`.
 */
import { describe, expect, it } from 'vitest';
import { indexScene } from '../canvas/hit';
import { buildScene, type Scene } from '../canvas/scene';
import {
  LIVE_ATTRIBUTE,
  LIVE_CHANGED,
  liveLookup,
  liveRounds,
  liveScene,
  withLatencyOverlay,
  withLiveDetail,
} from './live';
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

  it('recolors only the shapes whose values changed when 1,000 of 10,000 change under an overlay', () => {
    const plain = syntheticProject({ elements: 10_000 });
    const view = plain.views[0]?.id ?? '';
    const project = withLatencyOverlay(withLiveDetail(plain), view);
    const scene = buildScene(project, view);
    const rounds = liveRounds(scene, LIVE_CHANGED);
    let lookup = rounds(0, 1_000);
    let drawn = liveScene(project, scene, lookup);
    indexScene(drawn);
    const times: number[] = [];
    for (let round = 1; round <= 6; round++) {
      const before: Scene = drawn;
      const last = lookup;
      const began = performance.now();
      lookup = rounds(round, 1_000 + round);
      drawn = liveScene(project, scene, lookup);
      indexScene(drawn);
      times.push(performance.now() - began);
      const changed = new Set(
        scene.shapes
          .map((shape) => shape.element)
          .filter((id) => lookup.liveOf(id) !== last.liveOf(id)),
      );
      expect(changed.size).toBe(LIVE_CHANGED);
      const redrawn = drawn.shapes.filter((shape, at) => shape !== before.shapes[at]);
      expect(redrawn.length).toBeGreaterThan(0);
      expect(redrawn.every((shape) => changed.has(shape.element))).toBe(true);
      expect(drawn.relations).toBe(before.relations);
    }
    times.sort((a, b) => a - b);
    // Not a mark, which the browser's run sets: only a guard against something far off.
    expect(times[3]).toBeLessThan(250);
  }, 120_000);
});
