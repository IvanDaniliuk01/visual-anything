/**
 * Property tests for the rules the core enforces. Random sequences of commands, undos and redos run on
 * a project; after every step the project keeps its rules, and every action undoes exactly.
 */
import fc from 'fast-check';
import type { Id } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { checkProject } from './check';
import { executeCommand, type Command } from './commands';
import { EMPTY_HISTORY, record, redo, undo, type History } from './history';
import { randomIds } from './ids';
import { containmentCycles, previewDelete } from './rules';
import type { ProjectSnapshot } from './snapshot';
import { modelIndexOf } from './state';
import { testProject } from './test/fixtures';

const COMPONENTS = ['test.box', 'test.service', 'test.database', 'essence'];
const RELATION_TYPES = ['test.calls', 'test.reads', 'test.inside', 'test.governs'];

/** What to do next, in terms the current project turns into a command. */
type Intent =
  | { kind: 'create-element'; component: number; container: number | null }
  | { kind: 'create-relation'; type: number; from: number; to: number }
  | { kind: 'move-end'; relation: number; end: 'from' | 'to'; target: number }
  | { kind: 'retype'; relation: number; type: number }
  | { kind: 'update-element'; element: number; component: number }
  | { kind: 'delete-elements'; picks: number[] }
  | { kind: 'delete-relations'; picks: number[] }
  | { kind: 'position'; picks: number[] }
  | { kind: 'batch'; first: number; second: number }
  | { kind: 'undo' }
  | { kind: 'redo' };

const index = fc.nat({ max: 1000 });
const intent: fc.Arbitrary<Intent> = fc.oneof(
  fc.record({ kind: fc.constant('create-element'), component: index, container: fc.option(index) }),
  fc.record({ kind: fc.constant('create-relation'), type: index, from: index, to: index }),
  fc.record({
    kind: fc.constant('move-end'),
    relation: index,
    end: fc.constantFrom('from', 'to'),
    target: index,
  }),
  fc.record({ kind: fc.constant('retype'), relation: index, type: index }),
  fc.record({ kind: fc.constant('update-element'), element: index, component: index }),
  fc.record({
    kind: fc.constant('delete-elements'),
    picks: fc.array(index, { minLength: 1, maxLength: 3 }),
  }),
  fc.record({
    kind: fc.constant('delete-relations'),
    picks: fc.array(index, { minLength: 1, maxLength: 3 }),
  }),
  fc.record({
    kind: fc.constant('position'),
    picks: fc.array(index, { minLength: 1, maxLength: 3 }),
  }),
  fc.record({ kind: fc.constant('batch'), first: index, second: index }),
  { arbitrary: fc.constant({ kind: 'undo' as const }), weight: 2 },
  { arbitrary: fc.constant({ kind: 'redo' as const }), weight: 1 },
);

function pick<T>(list: readonly T[], at: number): T | undefined {
  return list.length === 0 ? undefined : list[at % list.length];
}

/** The command an intent stands for in this project, if it can stand for one. */
function commandFor(state: ProjectSnapshot, wish: Intent): Command | undefined {
  const elements = state.model.elements.map((element) => element.id);
  const relations = state.model.relations.map((relation) => relation.id);
  const ends = [state.model.world.id, ...elements, ...relations];
  switch (wish.kind) {
    case 'create-element': {
      const container = wish.container === null ? undefined : pick(elements, wish.container);
      return {
        type: 'create-element',
        element: { component: pick(COMPONENTS, wish.component) as Id, name: 'New element' },
        ...(container ? { containers: [{ container, relationType: 'test.inside' }] } : {}),
      };
    }
    case 'create-relation':
      return {
        type: 'create-relation',
        relation: {
          relationType: pick(RELATION_TYPES, wish.type) as Id,
          from: pick(ends, wish.from) as Id,
          to: pick(ends, wish.to) as Id,
        },
      };
    case 'move-end': {
      const relation = pick(relations, wish.relation);
      return relation === undefined
        ? undefined
        : {
            type: 'update-relation',
            id: relation,
            changes: { [wish.end]: pick(ends, wish.target) as Id },
          };
    }
    case 'retype': {
      const relation = pick(relations, wish.relation);
      return relation === undefined
        ? undefined
        : {
            type: 'update-relation',
            id: relation,
            changes: { relationType: pick(RELATION_TYPES, wish.type) },
          };
    }
    case 'update-element':
      return {
        type: 'update-element',
        id: pick([state.model.world.id, ...elements], wish.element) as Id,
        changes: { component: pick(COMPONENTS, wish.component), name: 'Renamed' },
      };
    case 'delete-elements':
      return elements.length === 0
        ? undefined
        : {
            type: 'delete',
            elements: [...new Set(wish.picks.map((at) => pick(elements, at) as Id))],
          };
    case 'delete-relations':
      return relations.length === 0
        ? undefined
        : {
            type: 'delete',
            relations: [...new Set(wish.picks.map((at) => pick(relations, at) as Id))],
          };
    case 'position': {
      if (elements.length === 0) return undefined;
      const ids = [...new Set(wish.picks.map((at) => pick(elements, at) as Id))];
      return {
        type: 'set-positions',
        view: 'overview',
        positions: ids.map((element, at) => ({ element, x: at * 10, y: 5 })),
      };
    }
    case 'batch': {
      const first = commandFor(state, {
        kind: 'create-relation',
        type: wish.first,
        from: wish.first,
        to: wish.second,
      });
      const second = commandFor(state, { kind: 'delete-relations', picks: [wish.second] });
      return first && second && { type: 'batch', label: 'Two at once', commands: [first, second] };
    }
    case 'undo':
    case 'redo':
      return undefined;
  }
}

/** The rules every project keeps after any sequence of actions. */
function expectRulesKept(state: ProjectSnapshot) {
  expect(checkProject(state).errors).toEqual([]);
  const model = modelIndexOf(state);
  const all = [state.model.world.id, ...state.model.elements.map((element) => element.id)];
  expect(containmentCycles(model, all)).toEqual([]);
  for (const relation of state.model.relations) {
    expect(model.has(relation.from) && model.has(relation.to)).toBe(true);
  }
}

describe('the rules of the core', () => {
  it('hold after any sequence of commands, undos and redos, and every action undoes exactly', () => {
    const seen = { applied: 0, deletes: 0, undos: 0 };
    fc.assert(
      fc.property(
        fc.array(intent, { minLength: 10, maxLength: 60 }),
        fc.integer(),
        (wishes, seed) => {
          let random = seed;
          const newId = randomIds(() => {
            random = (random * 1103515245 + 12345) % 2147483648;
            return Math.abs(random) / 2147483648;
          });
          let state = testProject();
          let history: History = EMPTY_HISTORY;
          for (const wish of wishes) {
            if (wish.kind === 'undo' || wish.kind === 'redo') {
              const step = (wish.kind === 'undo' ? undo : redo)(state, history);
              if (step) {
                ({ state, history } = step);
                seen.undos += 1;
              }
              expectRulesKept(state);
              continue;
            }
            const command = commandFor(state, wish);
            if (!command) continue;
            const preview = command.type === 'delete' ? previewDelete(state, command) : undefined;
            const outcome = executeCommand(state, command, { newId });
            if (!outcome.ok) continue;
            const before = state;
            const after = outcome.state;
            expectRulesKept(after);
            if (preview) {
              expectDeletedExactly(before, after, preview);
              seen.deletes += 1;
            }
            seen.applied += 1;

            const recorded = record(history, {
              label: outcome.label,
              author: 'user',
              operations: outcome.operations,
              inverse: outcome.inverse,
            });
            const undone = undo(after, recorded);
            expect(undone?.state).toEqual(before);
            expect(redo(undone?.state ?? before, undone?.history ?? recorded)?.state).toEqual(
              after,
            );
            state = after;
            history = recorded;
          }
        },
      ),
      { numRuns: 150 },
    );
    // The sequences must do things, not only be refused.
    expect(seen.applied).toBeGreaterThan(1000);
    expect(seen.deletes).toBeGreaterThan(100);
    expect(seen.undos).toBeGreaterThan(100);
  });

  it('never lets containment form a cycle, however nesting is attempted', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(index, index), { maxLength: 60 }), (pairs) => {
        let state = testProject();
        for (const [from, to] of pairs) {
          const elements = [...state.model.elements.map((element) => element.id)];
          const outcome = executeCommand(state, {
            type: 'create-relation',
            relation: {
              relationType: 'test.inside',
              from: pick(elements, from) as Id,
              to: pick(elements, to) as Id,
            },
          });
          if (outcome.ok) state = outcome.state;
          const all = state.model.elements.map((element) => element.id);
          expect(containmentCycles(modelIndexOf(state), all)).toEqual([]);
        }
      }),
    );
  });
});

/** A deletion removes exactly what its preview listed, and keeps every scenario step. */
function expectDeletedExactly(
  before: ProjectSnapshot,
  after: ProjectSnapshot,
  preview: ReturnType<typeof previewDelete>,
) {
  const removedElements = before.model.elements
    .map((element) => element.id)
    .filter((id) => !after.model.elements.some((element) => element.id === id));
  const removedRelations = before.model.relations
    .map((relation) => relation.id)
    .filter((id) => !after.model.relations.some((relation) => relation.id === id));
  expect(removedElements).toEqual(preview.elements);
  expect(removedRelations).toEqual(preview.relations);
  expect(after.scenarios).toEqual(before.scenarios);
  for (const relation of after.model.relations) {
    expect(preview.elements.includes(relation.from) || preview.elements.includes(relation.to)).toBe(
      false,
    );
  }
}
