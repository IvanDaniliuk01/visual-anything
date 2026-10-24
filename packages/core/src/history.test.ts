import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from './commands';
import {
  EMPTY_HISTORY,
  HISTORY_LIMIT,
  record,
  redo,
  summarize,
  undo,
  type Author,
  type History,
} from './history';
import type { ProjectSnapshot } from './snapshot';
import { sequentialIds, testProject } from './test/fixtures';

function act(state: ProjectSnapshot, history: History, command: Command, author: Author = 'user') {
  const outcome = executeCommand(state, command, { newId: sequentialIds() });
  if (!outcome.ok) throw new Error(outcome.problems[0]?.message);
  return {
    state: outcome.state,
    history: record(history, {
      label: outcome.label,
      author,
      operations: outcome.operations,
      inverse: outcome.inverse,
    }),
  };
}

describe('the undo history', () => {
  it('undoes one action at a time, whoever did it, and redoes them', () => {
    const start = testProject();
    const first = act(start, EMPTY_HISTORY, {
      type: 'update-element',
      id: 'api',
      changes: { name: 'Gateway' },
    });
    const second = act(first.state, first.history, { type: 'delete', elements: ['db'] }, 'claude');
    expect(summarize(second.history)).toEqual({ undo: { label: 'Delete "DB"', author: 'claude' } });

    const undone = undo(second.state, second.history);
    expect(undone?.state).toEqual(first.state);
    expect(undone?.entry.author).toBe('claude');
    expect(summarize(undone?.history ?? EMPTY_HISTORY)).toEqual({
      undo: { label: 'Rename "API" to "Gateway"', author: 'user' },
      redo: { label: 'Delete "DB"', author: 'claude' },
    });

    const undoneAgain = undo(undone?.state ?? start, undone?.history ?? EMPTY_HISTORY);
    expect(undoneAgain?.state).toEqual(start);
    expect(
      undo(undoneAgain?.state ?? start, undoneAgain?.history ?? EMPTY_HISTORY),
    ).toBeUndefined();

    const redone = redo(undoneAgain?.state ?? start, undoneAgain?.history ?? EMPTY_HISTORY);
    expect(redone?.state).toEqual(first.state);
  });

  it('forgets what was undone once a new action is recorded', () => {
    const first = act(testProject(), EMPTY_HISTORY, { type: 'delete', elements: ['db'] });
    const undone = undo(first.state, first.history);
    const next = act(undone?.state ?? first.state, undone?.history ?? EMPTY_HISTORY, {
      type: 'update-element',
      id: 'api',
      changes: { name: 'Gateway' },
    });
    expect(next.history.undone).toEqual([]);
    expect(redo(next.state, next.history)).toBeUndefined();
  });

  it(`keeps the last ${HISTORY_LIMIT} actions`, () => {
    let history = EMPTY_HISTORY;
    for (let each = 0; each < HISTORY_LIMIT + 5; each++) {
      history = record(history, {
        label: `Action ${each}`,
        author: 'user',
        operations: [],
        inverse: [],
      });
    }
    expect(history.done).toHaveLength(HISTORY_LIMIT);
    expect(history.done[0]?.label).toBe('Action 5');
  });
});
