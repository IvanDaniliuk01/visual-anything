/**
 * Comparing two versions (ADR 0070): by id, item by item, into what was added, removed, changed and
 * moved; following an action equals comparing afresh; and the operations between two versions give
 * the second from the first, and the first back from their inverses.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from '../commands';
import { randomIds } from '../ids';
import { applyOperations, type Operation } from '../operations';
import type { ProjectSnapshot } from '../snapshot';
import { testProject } from '../test/fixtures';
import { commandFor, intent, propertyProject, type Intent } from '../test/random-commands';
import { compareProjects, compareView, recompare, type Comparison } from './compare';
import { itemKey } from './items';
import { operationsBetween } from './operations-between';

function done(state: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(state, command, { newId: (base) => `${base}-new` });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

const summary = (comparison: Comparison) =>
  comparison.changes.map((change) => `${change.status} ${itemKey(change.ref)}`);

describe('compareProjects', () => {
  it('compares pictures by id, as notes: added, moved and changed (ADR 0098)', () => {
    const media = { hash: 'ab'.repeat(32), format: 'png' as const, width: 8, height: 8, bytes: 70 };
    const picture = {
      kind: 'picture' as const,
      id: 'desk',
      x: 0,
      y: 0,
      width: 8,
      height: 8,
      media,
    };
    const older = testProject();
    const added = done(older, { type: 'create-free-shape', view: 'overview', shape: picture });
    expect(summary(compareProjects(older, added))).toEqual(['added free-shape:overview:desk']);
    const moved = done(added, {
      type: 'update-free-shape',
      view: 'overview',
      shape: { ...picture, x: 40, name: 'Desk' },
    });
    const comparison = compareProjects(added, moved);
    expect(summary(comparison)).toEqual([
      'changed free-shape:overview:desk',
      'moved free-shape:overview:desk',
    ]);
    expect(comparison.changes[0]?.differences).toEqual([
      { path: 'name', before: undefined, after: 'Desk' },
    ]);
  });

  it('compares link cards by id, as notes (ADR 0098, stage 3)', () => {
    const card = {
      kind: 'link' as const,
      id: 'guide',
      x: 0,
      y: 0,
      width: 320,
      height: 112,
      url: 'https://example.org/',
      title: 'Guide',
    };
    const older = testProject();
    const added = done(older, { type: 'create-free-shape', view: 'overview', shape: card });
    expect(summary(compareProjects(older, added))).toEqual(['added free-shape:overview:guide']);
    const retitled = done(added, {
      type: 'update-free-shape',
      view: 'overview',
      id: 'guide',
      changes: { title: 'The guide' },
    });
    expect(compareProjects(added, retitled).changes[0]?.differences).toEqual([
      { path: 'title', before: 'Guide', after: 'The guide' },
    ]);
  });

  it('compares the pictures a step shows and plays as part of its step (ADR 0098, stage 4)', () => {
    const media = { hash: 'ab'.repeat(32), format: 'mp4' as const, width: 8, height: 8, bytes: 70 };
    const video = { kind: 'picture' as const, id: 'desk', x: 0, y: 0, width: 8, height: 8, media };
    const older = done(testProject(), {
      type: 'create-free-shape',
      view: 'overview',
      shape: video,
    });
    const steps = older.scenarios[0]!.steps;
    const shown = done(older, {
      type: 'update-scenario',
      id: 'request',
      changes: { steps: [{ ...steps[0]!, shows: ['desk'], playing: ['desk'] }, steps[1]!] },
    });
    const comparison = compareProjects(older, shown);
    expect(summary(comparison)).toEqual(['changed scenario:request']);
    // The step, by id, with its lists.
    expect(comparison.changes[0]?.differences).toEqual([
      {
        path: 'steps.call',
        before: steps[0],
        after: { ...steps[0], shows: ['desk'], playing: ['desk'] },
      },
    ]);
    // Back the other way, and the operations between them give the newer from the older.
    expect(summary(compareProjects(shown, older))).toEqual(['changed scenario:request']);
    expect(applyOperations(older, operationsBetween(older, shown)).state.scenarios).toEqual(
      shown.scenarios,
    );
  });

  it('finds nothing between a version and itself', () => {
    const project = testProject();
    expect(compareProjects(project, project)).toEqual({
      changes: [],
      counts: { added: 0, removed: 0, changed: 0, moved: 0 },
      names: {},
    });
  });

  it('says what changed inside an element, by path, with both values', () => {
    const older = testProject();
    const newer = done(older, {
      type: 'update-element',
      id: 'api',
      changes: { name: 'Gateway', attributes: { latency: 40 } },
    });
    const comparison = compareProjects(older, newer);
    expect(summary(comparison)).toEqual(['changed element:api']);
    expect(comparison.changes[0]?.differences).toEqual([
      { path: 'name', before: 'API', after: 'Gateway' },
      { path: 'attributes.latency', before: 20, after: 40 },
    ]);
    expect(comparison.names.api).toEqual({ before: 'API', after: 'Gateway' });
  });

  it('takes an added element’s places and the nesting relation that places it with it', () => {
    const older = testProject();
    const newer = done(older, {
      type: 'create-element',
      element: { id: 'cache', component: 'test.database', name: 'Cache' },
      containers: [{ container: 'system', relationType: 'test.inside' }],
      positions: [{ view: 'overview', container: 'system', x: 40, y: 280 }],
    });
    const comparison = compareProjects(older, newer);
    const added = comparison.changes.find((change) => change.ref.kind === 'element');
    expect(added?.status).toBe('added');
    expect(added?.items.map(itemKey)).toEqual(
      expect.arrayContaining([
        'element:cache',
        'position:overview:cache in system',
        expect.stringMatching(/^relation:/),
      ]),
    );
    // Nothing it took comes as a change of its own.
    expect(
      comparison.changes.filter((change) => change !== added && change.ref.kind === 'relation'),
    ).toEqual([]);
  });

  it('counts a shape moved by a canvas unit or more, and not by less', () => {
    const older = testProject();
    const position = older.views[0]?.positions[0];
    if (!position) throw new Error('The test project draws nothing.');
    const nudged = (by: number) =>
      done(older, {
        type: 'set-positions',
        view: 'overview',
        positions: [{ ...position, x: position.x + by }],
      });
    expect(summary(compareProjects(older, nudged(0.4)))).toEqual([]);
    const moved = compareProjects(older, nudged(3));
    expect(moved.changes.map((change) => change.status)).toEqual(['moved']);
    expect(moved.changes[0]?.differences).toEqual([
      { path: 'x', before: position.x, after: position.x + 3 },
    ]);
  });

  it('reads colors whatever their case, and key order not at all', () => {
    const older = testProject();
    const element = older.model.elements[0];
    if (!element) throw new Error('No element.');
    const recolored: ProjectSnapshot = {
      ...older,
      model: {
        ...older.model,
        elements: older.model.elements.map((each) =>
          each === element
            ? // The same keys written the other way round.
              (Object.fromEntries(
                Object.entries({ ...each, appearance: { fill: '#aabbcc' } }).reverse(),
              ) as unknown as typeof each)
            : each,
        ),
      },
    };
    const upper: ProjectSnapshot = {
      ...older,
      model: {
        ...older.model,
        elements: older.model.elements.map((each) =>
          each === element ? { ...each, appearance: { fill: '#AABBCC' } } : each,
        ),
      },
    };
    expect(summary(compareProjects(recolored, upper))).toEqual([]);
  });

  it('says what a view shows that it did not, and why', () => {
    const older = testProject();
    const newer = done(older, {
      type: 'create-element',
      element: { id: 'cache', component: 'test.database', name: 'Cache' },
    });
    const view = compareView(compareProjects(older, newer), older, newer, 'overview');
    expect(view.states.get('element:cache')).toEqual({ status: 'added', why: 'new' });
    expect(view.states.get('element:api')).toEqual({ status: 'unchanged' });
  });
});

// ——— Property tests ———

/** A project after some random actions, and the operations of each, in order. */
function evolve(
  start: ProjectSnapshot,
  wishes: readonly Intent[],
  seed: number,
): { state: ProjectSnapshot; steps: { before: ProjectSnapshot; operations: Operation[] }[] } {
  let random = seed;
  const newId = randomIds(() => {
    random = (random * 1103515245 + 12345) % 2147483648;
    return Math.abs(random) / 2147483648;
  });
  let state = start;
  const steps: { before: ProjectSnapshot; operations: Operation[] }[] = [];
  for (const wish of wishes) {
    if (wish.kind === 'undo' || wish.kind === 'redo') continue;
    const command = commandFor(state, wish);
    if (!command) continue;
    const outcome = executeCommand(state, command, { newId });
    if (!outcome.ok) continue;
    steps.push({ before: state, operations: outcome.operations });
    state = outcome.state;
  }
  return { state, steps };
}

const versions = fc
  .tuple(
    fc.array(intent, { minLength: 0, maxLength: 25 }),
    fc.array(intent, { minLength: 1, maxLength: 25 }),
    fc.integer(),
  )
  .map(([first, then, seed]) => {
    const older = evolve(propertyProject(), first, seed).state;
    const newer = evolve(older, then, seed + 1);
    return { older, newer: newer.state, steps: newer.steps };
  });

describe('comparisons, for any two versions', () => {
  it('find nothing between a version and itself', () => {
    fc.assert(
      fc.property(versions, ({ newer }) => {
        expect(compareProjects(newer, newer).changes).toEqual([]);
      }),
      { numRuns: 60 },
    );
  });

  it('see every kind of change the actions make', () => {
    const seen = new Set<string>();
    fc.assert(
      fc.property(versions, ({ older, newer }) => {
        for (const change of compareProjects(older, newer).changes) {
          seen.add(`${change.status} ${change.ref.kind}`);
        }
      }),
      { numRuns: 80, seed: 20261028 },
    );
    for (const each of [
      'added element',
      'removed element',
      'changed element',
      'added relation',
      'removed relation',
      'moved position',
      'added view',
      'changed view',
      'added scenario',
    ]) {
      expect([...seen]).toContain(each);
    }
  });

  it('swap added and removed the other way round, and keep the rest', () => {
    const flipped = {
      added: 'removed',
      removed: 'added',
      changed: 'changed',
      moved: 'moved',
    } as const;
    fc.assert(
      fc.property(versions, ({ older, newer }) => {
        const forth = compareProjects(older, newer);
        const back = compareProjects(newer, older);
        expect(back.counts).toEqual({
          added: forth.counts.removed,
          removed: forth.counts.added,
          changed: forth.counts.changed,
          moved: forth.counts.moved,
        });
        const statuses = (comparison: Comparison, flip: boolean) =>
          comparison.changes
            .map((change) => {
              const key =
                change.ref.kind === 'position' && change.status === 'moved'
                  ? `${change.ref.view}:${change.ref.element}`
                  : itemKey(change.ref);
              return `${flip ? flipped[change.status] : change.status} ${key}`;
            })
            .sort();
        expect(statuses(back, false)).toEqual(statuses(forth, true));
      }),
      { numRuns: 60 },
    );
  });

  it('follow every action as comparing afresh does', () => {
    fc.assert(
      fc.property(versions, ({ older, steps }) => {
        let comparison = compareProjects(older, older);
        for (const { before, operations } of steps) {
          const after = applyOperations(before, operations).state;
          comparison = recompare(comparison, older, after, operations);
          expect(comparison).toEqual(compareProjects(older, after));
        }
      }),
      { numRuns: 60 },
    );
  });

  it('give the newer version from the older by the operations between them, and back by their inverses', () => {
    fc.assert(
      fc.property(versions, ({ older, newer }) => {
        const operations = operationsBetween(older, newer);
        const applied = applyOperations(older, operations);
        expect(applied.state).toEqual(newer);
        expect(applyOperations(applied.state, applied.inverse).state).toEqual(older);
        expect(operationsBetween(newer, newer)).toEqual([]);
      }),
      { numRuns: 60 },
    );
  });
});
