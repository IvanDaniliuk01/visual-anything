/**
 * A tick's marks on the canvas (ADR 0085): the shapes and relations it marks are highlighted, a
 * marker travels along each relation drawn as a line from its from end and stands at its end, still
 * under reduced motion; nothing is set again while the marks stand as they stood, and closing the
 * run takes them away.
 */
import type { Id } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { buildScene } from '../canvas/scene';
import type { Emphasis } from '../editor/emphasis';
import { simulationHarness } from '../test/simulation';
import {
  MARKER_TRAVEL_MAX,
  SIMULATION_SOURCE,
  SimulationMarks,
  markedKeys,
  travelTime,
} from './marks';
import type { Frames } from './useSimulationStore';

function setUp(reduced = false) {
  const harness = simulationHarness();
  const view = harness.project.views[0]!;
  const scene = buildScene(harness.project, view.id);
  const set: (Emphasis | undefined)[] = [];
  const emphasis = {
    set: (source: string, value: Emphasis | undefined) => {
      expect(source).toBe(SIMULATION_SOURCE);
      set.push(value);
    },
  };
  const waiting: ((now: number) => void)[] = [];
  const frames: Frames = {
    request: (callback) => waiting.push(callback),
    cancel: () => {},
  };
  let now = 0;
  const marks = new SimulationMarks(harness.store, emphasis, frames, () => now);
  marks.setContext({ project: harness.project, view, scene, reduced });
  return {
    ...harness,
    view,
    scene,
    set,
    marks,
    at: (time: number) => {
      now = time;
    },
    frame: (time: number) => {
      now = time;
      const callbacks = waiting.splice(0);
      for (const callback of callbacks) callback(time);
    },
    get waiting() {
      return waiting.length;
    },
  };
}

function keyOf(scene: ReturnType<typeof buildScene>, element: Id): string {
  return scene.shapes.find((shape) => shape.element === element)?.key ?? '';
}

describe('a tick’s marks', () => {
  it('highlight the shapes and relations they name, with lines for the relations drawn', () => {
    const { project, view, scene } = setUp();
    const marked = markedKeys(project, view, scene, ['api', 'api-reads-db', 'api-in-system']);
    expect([...marked.highlighted].sort()).toEqual(
      [keyOf(scene, 'api'), 'api-in-system', 'api-reads-db'].sort(),
    );
    // "is inside" nests in this view: no line to travel along.
    expect(marked.lines).toEqual(['api-reads-db']);
  });

  it('send a marker from the from end, which travels a tick’s time and stands at its end', () => {
    const state = setUp();
    state.store.open('api', state.simulation);
    state.worker.work();
    const first = state.set.at(-1);
    expect(first?.highlighted?.has(keyOf(state.scene, 'api'))).toBe(true);
    expect(first?.markers).toEqual([{ relation: 'api-reads-db', progress: 0 }]);
    const travel = travelTime(5);
    state.frame(travel / 2);
    expect(state.set.at(-1)?.markers?.[0]?.progress).toBeCloseTo(0.5);
    expect(state.set.at(-1)?.markers?.[0]?.trail).toBeDefined();
    state.frame(travel);
    expect(state.set.at(-1)?.markers).toEqual([{ relation: 'api-reads-db', progress: 1 }]);
    expect(state.waiting).toBe(0);
    // Standing as they stood, they are not set again.
    const count = state.set.length;
    state.store.setSpeed('api', 20);
    expect(state.set.length).toBe(count);
    expect(travelTime(1)).toBe(MARKER_TRAVEL_MAX);
    expect(travelTime('max')).toBe(0);
  });

  it('stand still at their ends under reduced motion', () => {
    const state = setUp(true);
    state.store.open('api', state.simulation);
    state.worker.work();
    expect(state.set.at(-1)?.markers).toEqual([{ relation: 'api-reads-db', progress: 1 }]);
    expect(state.waiting).toBe(0);
  });

  it('go when the tick shown marks nothing, and when the run closes', () => {
    const state = setUp();
    state.store.open('api', state.simulation);
    state.worker.work();
    state.store.forward('api');
    state.worker.work();
    // Odd ticks mark nothing.
    expect(state.set.at(-1)).toBeUndefined();
    state.store.back('api');
    expect(state.set.at(-1)?.markers).toHaveLength(1);
    state.store.close('api');
    expect(state.set.at(-1)).toBeUndefined();
    state.marks.dispose();
  });
});
