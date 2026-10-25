import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from './commands';
import { applyOperations } from './operations';
import { previewDelete } from './rules';
import type { ProjectSnapshot } from './snapshot';
import { sequentialIds, testProject } from './test/fixtures';

function ok(command: Command, state: ProjectSnapshot = testProject()) {
  const outcome = executeCommand(state, command, { newId: sequentialIds() });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
  return outcome;
}

function refused(command: Command, state: ProjectSnapshot = testProject()) {
  const outcome = executeCommand(state, command);
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems.map((each) => each.code);
}

const collapse = (elements: string[], collapsed = true): Command => ({
  type: 'set-collapsed',
  view: 'overview',
  elements,
  collapsed,
});

describe('set-collapsed', () => {
  it('keeps the containers a view collapses in its file, sorted, each once', () => {
    const one = ok(collapse(['system']));
    expect(one.label).toBe('Collapse "System"');
    expect(one.state.views[0]?.collapsed).toEqual(['system']);
    const more = ok(collapse(['db', 'api', 'system']), one.state);
    expect(more.label).toBe('Collapse 3 containers');
    expect(more.state.views[0]?.collapsed).toEqual(['api', 'db', 'system']);
  });

  it('changes only the view file, and keeps its shapes', () => {
    const outcome = ok(collapse(['system']));
    expect(outcome.operations.map((each) => each.op)).toEqual(['set-view']);
    const before = testProject().views[0];
    expect({ ...outcome.state.views[0], collapsed: undefined }).toEqual({
      ...before,
      collapsed: undefined,
    });
    expect(outcome.state.model).toEqual(testProject().model);
  });

  it('expands, and a view with nothing collapsed keeps no list', () => {
    const collapsed = ok(collapse(['system', 'db'])).state;
    const one = ok(collapse(['db'], false), collapsed);
    expect(one.label).toBe('Expand "DB"');
    expect(one.state.views[0]?.collapsed).toEqual(['system']);
    const none = ok(collapse(['system'], false), one.state);
    expect(none.state.views[0]).not.toHaveProperty('collapsed');
    expect(ok(collapse(['system', 'db'], false), collapsed).label).toBe('Expand 2 containers');
  });

  it('changes nothing when the containers already are as asked', () => {
    const collapsed = ok(collapse(['system'])).state;
    expect(ok(collapse(['system']), collapsed).operations).toEqual([]);
    expect(ok(collapse(['db'], false)).operations).toEqual([]);
  });

  it('refuses World, unknown elements and views, an element given twice, and nothing', () => {
    expect(refused(collapse(['world']))).toEqual(['world-not-allowed']);
    expect(refused(collapse(['nope']))).toEqual(['unknown-element']);
    expect(refused({ ...collapse(['system']), view: 'nope' } as Command)).toEqual(['unknown-view']);
    expect(refused(collapse(['system', 'system']))).toEqual(['invalid-command']);
    expect(refused(collapse([]))).toEqual(['invalid-command']);
    expect(refused({ ...collapse(['system']), collapsed: 'yes' } as unknown as Command)).toEqual([
      'invalid-command',
    ]);
  });

  it('drops ids that name no element the next time the list changes', () => {
    const state = testProject();
    const view = state.views[0];
    if (view) view.collapsed = ['gone', 'system'];
    expect(ok(collapse(['db']), state).state.views[0]?.collapsed).toEqual(['db', 'system']);
  });

  it('survives changes to the view, and loses an element when it is deleted', () => {
    const collapsed = ok(collapse(['system', 'db'])).state;
    const renamed = ok(
      { type: 'update-view', id: 'overview', changes: { name: 'Renamed' } },
      collapsed,
    );
    expect(renamed.state.views[0]?.collapsed).toEqual(['db', 'system']);
    expect(previewDelete(collapsed, { elements: ['db'] }).collapsed).toEqual([
      { view: 'overview', element: 'db' },
    ]);
    const deleted = ok({ type: 'delete', elements: ['db'] }, collapsed);
    expect(deleted.state.views[0]?.collapsed).toEqual(['system']);
    const all = ok({ type: 'delete', elements: ['db', 'system'] }, collapsed);
    expect(all.state.views[0]).not.toHaveProperty('collapsed');
  });
});
