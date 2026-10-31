/**
 * Claude's guidance `simulation` (ADR 0085), done as the person would: it selects the element so
 * that the inspector shows its section, opens its run with what it asks for, plays it at a speed or
 * leaves it paused, and closes the simulation shown.
 */
import { definitionsIn } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION, type Selection } from '../editor/selection';
import { simulationHarness } from '../test/simulation';
import { applyGuidedSimulation } from './useGuidedSimulation';

function setUp() {
  const harness = simulationHarness();
  let selection: Selection = EMPTY_SELECTION;
  const editor = {
    project: harness.project,
    definitions: definitionsIn(harness.project),
    get selection() {
      return selection;
    },
    select: (next: Selection) => {
      selection = next;
    },
  };
  return { ...harness, editor, selected: () => selection };
}

describe('guidance simulation', () => {
  it('opens the run with its parameters, seed and tick, selects it, and plays at its speed', () => {
    const { store, worker, editor, selected } = setUp();
    expect(
      applyGuidedSimulation(store, editor, {
        element: 'api',
        parameters: { arrivals: 9 },
        seed: 7,
        tick: 3,
        play: true,
        speed: 20,
        request: 1,
      }),
    ).toBe(true);
    worker.work();
    expect(store.get('api')).toMatchObject({ seed: 7, shown: 3, playing: true, speed: 20 });
    expect(store.get('api')?.parameters.arrivals).toBe(9);
    expect([...selected().elements]).toEqual(['api']);
  });

  it('leaves it paused unless asked to play, and refuses what its simulation refuses', () => {
    const { store, editor } = setUp();
    applyGuidedSimulation(store, editor, { element: 'api', speed: 60, request: 1 });
    expect(store.get('api')).toMatchObject({ playing: false, speed: 60 });
    expect(
      applyGuidedSimulation(store, editor, {
        element: 'api',
        parameters: { arrivals: 99 },
        request: 2,
      }),
    ).toBe(false);
    expect(applyGuidedSimulation(store, editor, { element: 'db', request: 3 })).toBe(false);
  });

  it('closes the simulation shown', () => {
    const { store, editor } = setUp();
    applyGuidedSimulation(store, editor, { element: 'api', request: 1 });
    applyGuidedSimulation(store, editor, { close: true, request: 2 });
    expect(store.list()).toEqual([]);
  });
});
