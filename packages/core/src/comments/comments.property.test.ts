/**
 * Property tests for threads of comments (ADR 0059): random comment commands mixed with deletions of
 * what threads are about, new things made with ids taken from a small pool, undos and redos. After
 * every step, no thread went but by delete-thread, nothing new took the id of a thread or of what a
 * detached thread is about, every thread is a valid file, the project keeps its rules, and every
 * action undoes exactly.
 */
import fc from 'fast-check';
import type { CommentAnchor, CommentAuthor, Id } from '@visual-anything/schema';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { checkProject } from '../check';
import { executeCommand, type Command } from '../commands';
import type { Author } from '../history';
import { EMPTY_HISTORY, record, redo, undo, type History } from '../history';
import { applyOperations } from '../operations';
import type { ProjectSnapshot } from '../snapshot';
import { modelIndexOf } from '../state';
import { testProject } from '../test/fixtures';
import { anchorTargetOf, isDetached } from './anchors';

/** Ids the generator offers again and again, so that taken ones are tried. */
const POOL = ['api', 'db', 'client', 'system', 'overview', 'thread-a', 'first', 'n1', 'n2'];

const PEOPLE: readonly CommentAuthor[] = [
  { kind: 'person', name: 'Ana', email: 'ana@example.com' },
  { kind: 'person', name: 'Bruno' },
  { kind: 'person', name: '  ' },
];

type Intent =
  | {
      kind: 'thread';
      anchor: number;
      pick: number;
      x: number;
      y: number;
      text: string;
      by: number;
      id: number | null;
    }
  | { kind: 'reply'; thread: number; text: string; by: number }
  | { kind: 'edit'; thread: number; comment: number; text: string; by: number }
  | { kind: 'resolve'; thread: number; resolved: boolean; by: number }
  | { kind: 'delete-thread'; thread: number; by: number }
  | { kind: 'delete'; elements: number[]; relations: number[] }
  | { kind: 'delete-view'; view: number }
  | { kind: 'create-element'; id: number | null }
  | { kind: 'create-view'; id: number | null }
  | { kind: 'batch'; thread: number; text: string }
  | { kind: 'undo' }
  | { kind: 'redo' };

const index = fc.nat({ max: 50 });
const text = fc.oneof(
  fc.constantFrom('Why?', 'See @[api].', '- one\n- two', 'Mentions @[gone].', '', ' \n '),
  fc.string({ maxLength: 40 }),
);
const by = fc.nat({ max: PEOPLE.length });

const intent: fc.Arbitrary<Intent> = fc.oneof(
  {
    arbitrary: fc.record({
      kind: fc.constant('thread'),
      anchor: fc.nat({ max: 4 }),
      pick: index,
      x: fc.oneof(fc.integer({ min: -2000, max: 2000 }), fc.constant(2e7)),
      y: fc.integer({ min: -2000, max: 2000 }),
      text,
      by,
      id: fc.option(fc.nat({ max: POOL.length - 1 })),
    }),
    weight: 4,
  },
  { arbitrary: fc.record({ kind: fc.constant('reply'), thread: index, text, by }), weight: 3 },
  {
    arbitrary: fc.record({ kind: fc.constant('edit'), thread: index, comment: index, text, by }),
    weight: 2,
  },
  fc.record({ kind: fc.constant('resolve'), thread: index, resolved: fc.boolean(), by }),
  fc.record({ kind: fc.constant('delete-thread'), thread: index, by }),
  {
    arbitrary: fc.record({
      kind: fc.constant('delete'),
      elements: fc.array(index, { maxLength: 2 }),
      relations: fc.array(index, { maxLength: 2 }),
    }),
    weight: 2,
  },
  fc.record({ kind: fc.constant('delete-view'), view: index }),
  {
    arbitrary: fc.record({
      kind: fc.constant('create-element'),
      id: fc.option(fc.nat({ max: POOL.length - 1 })),
    }),
    weight: 2,
  },
  fc.record({ kind: fc.constant('create-view'), id: fc.option(fc.nat({ max: POOL.length - 1 })) }),
  fc.record({ kind: fc.constant('batch'), thread: index, text }),
  { arbitrary: fc.record({ kind: fc.constant('undo') }), weight: 2 },
  fc.record({ kind: fc.constant('redo') }),
);

function pick<T>(list: readonly T[], at: number): T | undefined {
  return list.length === 0 ? undefined : list[at % list.length];
}

/** Who sends a command, and the author the person's command names. */
function sender(at: number): { author: Author; person?: CommentAuthor } {
  const person = PEOPLE[at];
  return person === undefined ? { author: 'claude' } : { author: 'user', person };
}

function anchorFor(
  state: ProjectSnapshot,
  intent: Extract<Intent, { kind: 'thread' }>,
): CommentAnchor {
  const { elements, relations } = state.model;
  const view = pick(state.views, intent.pick)?.id ?? 'overview';
  switch (intent.anchor) {
    case 0:
      return { kind: 'element', element: pick(elements, intent.pick)?.id ?? 'gone' };
    case 1:
      return { kind: 'relation', relation: pick(relations, intent.pick)?.id ?? 'gone' };
    case 2:
      return { kind: 'view', view };
    case 3:
      return { kind: 'point', view, x: intent.x, y: intent.y };
    default:
      return { kind: 'element', element: 'world' };
  }
}

/** The command an intent comes to on the project as it is, and who sends it. */
function commandFor(
  state: ProjectSnapshot,
  intent: Intent,
): { command: Command; author: Author } | undefined {
  const thread = (at: number) => pick(state.comments, at);
  switch (intent.kind) {
    case 'thread': {
      const { author, person } = sender(intent.by);
      return {
        author,
        command: {
          type: 'create-thread',
          thread: {
            ...(intent.id === null ? {} : { id: POOL[intent.id] }),
            anchor: anchorFor(state, intent),
            comment: { text: intent.text, ...(person ? { author: person } : {}) },
          },
        },
      };
    }
    case 'reply': {
      const target = thread(intent.thread);
      if (!target) return undefined;
      const { author, person } = sender(intent.by);
      return {
        author,
        command: {
          type: 'add-comment',
          thread: target.id,
          comment: { text: intent.text, ...(person ? { author: person } : {}) },
        },
      };
    }
    case 'edit': {
      const target = thread(intent.thread);
      const comment = target && pick(target.comments, intent.comment);
      if (!target || !comment) return undefined;
      const { author, person } = sender(intent.by);
      return {
        author,
        command: {
          type: 'edit-comment',
          thread: target.id,
          comment: comment.id,
          text: intent.text,
          ...(person ? { author: person } : {}),
        },
      };
    }
    case 'resolve': {
      const target = thread(intent.thread);
      if (!target) return undefined;
      return {
        author: sender(intent.by).author,
        command: { type: 'resolve-thread', thread: target.id, resolved: intent.resolved },
      };
    }
    case 'delete-thread': {
      const target = thread(intent.thread);
      if (!target) return undefined;
      return {
        author: sender(intent.by).author,
        command: { type: 'delete-thread', thread: target.id },
      };
    }
    case 'delete': {
      const elements = intent.elements.flatMap((at) => pick(state.model.elements, at)?.id ?? []);
      const relations = intent.relations.flatMap((at) => pick(state.model.relations, at)?.id ?? []);
      if (elements.length === 0 && relations.length === 0) return undefined;
      return {
        author: 'user',
        command: {
          type: 'delete',
          elements: [...new Set(elements)],
          relations: [...new Set(relations)],
        },
      };
    }
    case 'delete-view': {
      const view = pick(state.views, intent.view);
      if (!view) return undefined;
      return { author: 'user', command: { type: 'delete-view', id: view.id } };
    }
    case 'create-element':
      return {
        author: 'user',
        command: {
          type: 'create-element',
          element: {
            ...(intent.id === null ? {} : { id: POOL[intent.id] }),
            component: 'test.service',
            name: 'New',
          },
        },
      };
    case 'create-view':
      return {
        author: 'claude',
        command: {
          type: 'create-view',
          view: {
            ...(intent.id === null ? {} : { id: POOL[intent.id] }),
            name: 'Another',
            perspective: { name: 'Ownership' },
          },
        },
      };
    case 'batch': {
      const target = thread(intent.thread);
      if (!target) return undefined;
      return {
        author: 'claude',
        command: {
          type: 'batch',
          label: 'Answer and resolve',
          commands: [
            { type: 'add-comment', thread: target.id, comment: { text: intent.text } },
            { type: 'resolve-thread', thread: target.id, resolved: true },
          ],
        },
      };
    }
    case 'undo':
    case 'redo':
      return undefined;
  }
}

/** The ids every thread's anchor names whose element, relation or view is gone. */
function detachedTargets(state: ProjectSnapshot): Set<Id> {
  return new Set(
    state.comments
      .filter((thread) => isDetached(state, thread))
      .map((thread) => anchorTargetOf(thread.anchor)),
  );
}

/** Every id the project gives to an element, a relation or a view. */
function modelAndViewIds(state: ProjectSnapshot): Set<Id> {
  const index = modelIndexOf(state);
  return new Set([
    ...state.model.elements.map((each) => each.id),
    ...state.model.relations.map((each) => each.id),
    ...state.views.map((each) => each.id),
    index.world.id,
  ]);
}

describe('threads of comments, under random commands', () => {
  it('are kept, never taken over, valid, and undone exactly', () => {
    const applied = new Set<string>();
    let detached = 0;
    fc.assert(
      fc.property(fc.array(intent, { minLength: 1, maxLength: 40 }), (intents) => {
        // No scenario, so that views can be deleted too.
        let state: ProjectSnapshot = { ...testProject(), scenarios: [] };
        let history: History = EMPTY_HISTORY;
        let calls = 0;
        // Offers an id of the pool every other time, and a fresh one otherwise.
        const newId = (base: string) => {
          calls += 1;
          return calls % 2 === 0 ? (POOL[calls % POOL.length] as Id) : `${base}-${calls}`;
        };
        let minutes = 0;
        const now = () => Date.UTC(2026, 9, 25) + (minutes += 1) * 60_000;
        for (const each of intents) {
          const before = state;
          if (each.kind === 'undo' || each.kind === 'redo') {
            const step = each.kind === 'undo' ? undo(state, history) : redo(state, history);
            if (step) {
              state = step.state;
              history = step.history;
            }
          } else {
            const planned = commandFor(state, each);
            if (!planned) continue;
            const outcome = executeCommand(state, planned.command, {
              newId,
              now,
              author: planned.author,
            });
            if (!outcome.ok) continue;
            // Every action undoes exactly.
            expect(applyOperations(outcome.state, outcome.inverse).state).toEqual(before);
            // Nothing new takes the id of a thread, or of what a detached thread is about.
            const reserved = new Set([
              ...before.comments.map((thread) => thread.id),
              ...detachedTargets(before),
            ]);
            const fresh = [...modelAndViewIds(outcome.state)].filter(
              (id) => !modelAndViewIds(before).has(id),
            );
            expect(fresh.filter((id) => reserved.has(id))).toEqual([]);
            // No thread goes but by delete-thread.
            const deletes = planned.command.type === 'delete-thread';
            if (!deletes) {
              const after = new Set(outcome.state.comments.map((thread) => thread.id));
              expect(before.comments.filter((thread) => !after.has(thread.id))).toEqual([]);
            }
            state = outcome.state;
            if (outcome.operations.length > 0) {
              applied.add(planned.command.type);
              history = record(history, {
                label: outcome.label,
                author: planned.author,
                operations: outcome.operations,
                inverse: outcome.inverse,
              });
            }
          }
          for (const thread of state.comments) {
            const valid = validateFile('comment', thread);
            expect(valid.ok ? [] : valid).toEqual([]);
          }
          expect(checkProject(state).errors).toEqual([]);
          detached += detachedTargets(state).size;
        }
      }),
      // Enough runs that every command, and a detached thread, is reached in all but a vanishing
      // share of them: at 150, about one in ten missed one.
      { numRuns: 600 },
    );
    // The random runs reach every comment command, and detached threads.
    expect(
      ['create-thread', 'add-comment', 'edit-comment', 'resolve-thread', 'delete-thread'].filter(
        (type) => !applied.has(type),
      ),
    ).toEqual([]);
    expect(detached).toBeGreaterThan(0);
  }, 60_000);

  // Random runs reach a batch of comment commands only when an earlier intent left a thread and the
  // text is not blank, which some runs never do; so the batch has a case of its own.
  it('answers and resolves a thread in one batch, undone exactly', () => {
    const start: ProjectSnapshot = { ...testProject(), scenarios: [] };
    const made = executeCommand(
      start,
      {
        type: 'create-thread',
        thread: {
          id: 'why',
          anchor: { kind: 'element', element: 'api' },
          comment: { text: 'Why?' },
        },
      },
      { author: 'claude', now: () => Date.UTC(2026, 9, 25) },
    );
    if (!made.ok) throw new Error(made.problems.map((each) => each.message).join(' '));
    const batch = executeCommand(
      made.state,
      {
        type: 'batch',
        label: 'Answer and resolve',
        commands: [
          { type: 'add-comment', thread: 'why', comment: { text: 'Because.' } },
          { type: 'resolve-thread', thread: 'why', resolved: true },
        ],
      },
      { author: 'claude', now: () => Date.UTC(2026, 9, 25, 1) },
    );
    if (!batch.ok) throw new Error(batch.problems.map((each) => each.message).join(' '));
    const thread = batch.state.comments.find((each) => each.id === 'why');
    expect(thread?.resolved).toBe(true);
    expect(thread?.comments.map((each) => each.text)).toEqual(['Why?', 'Because.']);
    expect(applyOperations(batch.state, batch.inverse).state).toEqual(made.state);
  });
});
