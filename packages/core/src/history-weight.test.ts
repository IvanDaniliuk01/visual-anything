import { describe, expect, it } from 'vitest';
import {
  EMPTY_HISTORY,
  HISTORY_LIMIT,
  HISTORY_WEIGHT_LIMIT,
  actionWeight,
  record,
  type HistoryEntry,
} from './history';
import type { Operation } from './operations';

/** An action whose operations and inverses hold strings of the given length in all. */
function action(label: string, weight: number): HistoryEntry {
  const half = Math.floor(weight / 2);
  const item = (text: string): Operation => ({
    op: 'replace',
    collection: { name: 'elements' },
    item: { id: '', component: '', name: text },
  });
  return {
    label,
    author: 'user',
    operations: [item('x'.repeat(half))],
    inverse: [item('y'.repeat(weight - half))],
  };
}

describe('the history’s size budget', () => {
  it('weighs an action by the length of the strings in its operations and inverses', () => {
    // The text of each operation counts, its kind and list included.
    expect(actionWeight(action('A', 1000))).toBe(1000 + 2 * ('replace'.length + 'elements'.length));
    const nested: HistoryEntry = {
      label: 'Nested',
      author: 'claude',
      operations: [
        { op: 'set-project', project: { schemaVersion: 1, name: 'abc', packages: ['de', 'f'] } },
      ],
      inverse: [{ op: 'remove', collection: { name: 'views' }, key: 'view' }],
    };
    // "abc", "de", "f", then "views" and "view", besides the operations' own names.
    expect(actionWeight(nested)).toBe(
      'set-project'.length + 3 + 2 + 1 + 'remove'.length + 'views'.length + 'view'.length,
    );
  });

  it('drops the oldest actions while the history weighs more than 64 Mi code units', () => {
    // Ten fit, with room for the operations' own names; eleven do not.
    const tenth = Math.floor(HISTORY_WEIGHT_LIMIT / 10) - 100;
    let history = EMPTY_HISTORY;
    for (let each = 0; each < 25; each++)
      history = record(history, action(`Action ${each}`, tenth));
    expect(history.done).toHaveLength(10);
    expect(history.done[0]?.label).toBe('Action 15');
    const total = history.done.reduce((sum, entry) => sum + actionWeight(entry), 0);
    expect(total).toBeLessThanOrEqual(HISTORY_WEIGHT_LIMIT);
  });

  it('always keeps the newest action, however heavy', () => {
    const history = record(
      record(EMPTY_HISTORY, action('Light', 10)),
      action('Heavy', HISTORY_WEIGHT_LIMIT + 1),
    );
    expect(history.done.map((entry) => entry.label)).toEqual(['Heavy']);
  });

  it(`still keeps at most ${HISTORY_LIMIT} light actions`, () => {
    let history = EMPTY_HISTORY;
    for (let each = 0; each < HISTORY_LIMIT + 3; each++)
      history = record(history, action(`A${each}`, 2));
    expect(history.done).toHaveLength(HISTORY_LIMIT);
  });
});
