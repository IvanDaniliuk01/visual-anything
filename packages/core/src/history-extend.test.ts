/**
 * Extending the newest action of the history (ADR 0065): the placement of what an action added joins
 * it, so that one undo takes back both and one redo brings back both, exactly, under the action's own
 * label and author.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from './commands';
import {
  EMPTY_HISTORY,
  extendNewest,
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

/** Runs a command and joins what it did to the newest action, as the program does with a placement. */
function join(state: ProjectSnapshot, history: History, command: Command) {
  const outcome = executeCommand(state, command, { newId: sequentialIds() });
  if (!outcome.ok) throw new Error(outcome.problems[0]?.message);
  const extended = extendNewest(history, outcome.operations, outcome.inverse);
  if (!extended) throw new Error('Nothing to extend.');
  return { state: outcome.state, history: extended };
}

const ADD: Command = {
  type: 'create-element',
  element: { id: 'cache', component: 'test.database', name: 'Cache' },
};

const place = (x: number, y: number): Command => ({
  type: 'set-positions',
  view: 'overview',
  positions: [{ element: 'cache', x, y }],
});

describe('extending the newest action', () => {
  it('keeps its label and author, and undoes and redoes it with what joined it', () => {
    const start = testProject();
    const added = act(start, EMPTY_HISTORY, ADD, 'claude');
    const placed = join(added.state, added.history, place(320, 40));
    expect(placed.history.done).toHaveLength(1);
    expect(summarize(placed.history)).toEqual({
      undo: { label: 'Create "Cache"', author: 'claude' },
    });
    const undone = undo(placed.state, placed.history);
    expect(undone?.state).toStrictEqual(start);
    expect(undone?.entry.author).toBe('claude');
    const redone = redo(undone!.state, undone!.history);
    expect(redone?.state).toStrictEqual(placed.state);
  });

  it('has nothing to extend in an empty history, or once the newest action is undone', () => {
    expect(extendNewest(EMPTY_HISTORY, [], [])).toBeUndefined();
    const added = act(testProject(), EMPTY_HISTORY, ADD);
    const undone = undo(added.state, added.history)!;
    expect(extendNewest(undone.history, [], [])).toBeUndefined();
  });

  it('restores exactly on undo and redo, however many placements join, after any actions', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(fc.integer({ min: -400, max: 400 }), fc.integer({ min: -400, max: 400 })),
          {
            minLength: 1,
            maxLength: 4,
          },
        ),
        fc.boolean(),
        (places, renameFirst) => {
          let { state, history } = { state: testProject(), history: EMPTY_HISTORY };
          if (renameFirst) {
            ({ state, history } = act(state, history, {
              type: 'update-element',
              id: 'api',
              changes: { name: 'Gateway' },
            }));
          }
          const before = state;
          ({ state, history } = act(state, history, ADD, 'claude'));
          for (const [x, y] of places) ({ state, history } = join(state, history, place(x, y)));
          const after = state;
          expect(history.done).toHaveLength(renameFirst ? 2 : 1);
          const undone = undo(after, history)!;
          expect(undone.state).toStrictEqual(before);
          const redone = redo(undone.state, undone.history)!;
          expect(redone.state).toStrictEqual(after);
          expect(redone.history.done.at(-1)).toBe(history.done.at(-1));
        },
      ),
    );
  });
});
