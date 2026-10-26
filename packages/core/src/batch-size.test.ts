import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from './commands';
import { applyOperations } from './operations';
import { modelIndexOf } from './state';
import { testProject } from './test/fixtures';
import type { ProjectSnapshot } from './snapshot';
import { cpuNow } from './test/cpu';

/**
 * A batch creating `count` elements inside the system, each with its shape in the view and a
 * relation to the one before: what an import makes.
 */
function importBatch(count: number): Command {
  const commands: Command[] = [];
  for (let at = 0; at < count; at += 1) {
    commands.push({
      type: 'create-element',
      element: { id: `e${at}`, component: 'test.service', name: `Service ${at}` },
      containers: [{ container: 'system', relationType: 'test.inside' }],
      positions: [{ view: 'overview', container: 'system', x: at * 10, y: 0 }],
    });
  }
  for (let at = 1; at < count; at += 1) {
    commands.push({
      type: 'create-relation',
      relation: { id: `c${at}`, relationType: 'test.calls', from: `e${at - 1}`, to: `e${at}` },
    });
  }
  return { type: 'batch', label: 'Import "services.csv"', commands };
}

/** The test project with a view that routes one relation by hand, so that routes settle. */
function routedProject(): ProjectSnapshot {
  const state = testProject();
  const [view] = state.views;
  return {
    ...state,
    views: [{ ...view!, routes: { 'client-calls-api': { style: 'straight' } } }],
  };
}

describe('a large batch', () => {
  // Each command reads the model through an index the draft keeps up to date, and each list finds
  // its items through places it keeps: a batch of N commands no longer indexes the model N times.
  // Before, 3,000 elements took 16 s on a loaded machine; the bound is loose so that only that
  // kind of slowness fails it.
  it('creates thousands of elements, shapes and relations in time linear in their number', () => {
    const state = routedProject();
    const started = cpuNow();
    const outcome = executeCommand(state, importBatch(5000));
    const took = cpuNow() - started;
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.state.model.elements).toHaveLength(state.model.elements.length + 5000);
    expect(outcome.state.views[0]?.positions).toHaveLength(state.views[0]!.positions.length + 5000);
    expect(took).toBeLessThan(15_000);
  }, 60_000);

  it('leaves the index of the project it ends with as one built from scratch would be', () => {
    const outcome = executeCommand(routedProject(), importBatch(50));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const kept = modelIndexOf(outcome.state);
    const built = modelIndexOf({ ...outcome.state, model: { ...outcome.state.model } });
    expect(kept).not.toBe(built);
    for (const id of ['system', 'e0', 'e25', 'e49', 'c1', 'c49', 'client-calls-api']) {
      expect(kept.element(id)).toBe(built.element(id));
      expect(kept.relation(id)).toBe(built.relation(id));
      expect(kept.relationsOn(id)).toEqual(built.relationsOn(id));
      expect(kept.containersOf(id)).toEqual(built.containersOf(id));
      expect(kept.contentsOf(id)).toEqual(built.contentsOf(id));
    }
  });

  it('is undone exactly', () => {
    const state = routedProject();
    const outcome = executeCommand(state, importBatch(300));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(applyOperations(outcome.state, outcome.inverse).state).toEqual(state);
  });
});
