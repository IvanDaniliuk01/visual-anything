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
import { definitionsIn, modelIndexOf } from './state';
import { testProject } from './test/fixtures';

const COMPONENTS = ['test.box', 'test.service', 'test.database', 'essence'];
const NESTING = ['test.inside', 'test.part-of'];
const RELATION_TYPES = ['test.calls', 'test.reads', 'test.governs', ...NESTING];

/**
 * The test project with a second relation type that nests, so that containment is attempted across
 * two of them, as views that nest by both would show it.
 */
function propertyProject(): ProjectSnapshot {
  const project = testProject();
  const [own, ...others] = project.packages;
  if (!own) throw new Error('The test project has no package.');
  const partOf = {
    id: 'test.part-of',
    name: 'is part of',
    derivesFrom: 'relates-to',
    direction: 'directed' as const,
    nests: true,
  };
  return {
    ...project,
    packages: [{ ...own, relationTypes: [...own.relationTypes, partOf] }, ...others],
  };
}

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
  | { kind: 'toggle-nests'; type: number }
  | { kind: 'rederive'; component: number; parent: number }
  | { kind: 'remove-definition'; at: number }
  | { kind: 'packages'; systems: boolean }
  | { kind: 'view'; action: 'create' | 'nesting' | 'delete'; at: number; types: number[] }
  | { kind: 'scenario'; action: 'create' | 'steps' | 'delete'; at: number; picks: number[] }
  | { kind: 'note'; action: 'create' | 'move' | 'delete'; at: number }
  | { kind: 'package' }
  | { kind: 'forget-positions'; at: number; picks: number[] }
  | { kind: 'undo' }
  | { kind: 'redo' };

/** Every kind of command, each of which the random actions must manage to apply. */
const COMMAND_TYPES: readonly Command['type'][] = [
  'create-element',
  'update-element',
  'delete',
  'create-relation',
  'update-relation',
  'create-package',
  'define-component',
  'remove-component',
  'define-relation-type',
  'remove-relation-type',
  'create-view',
  'update-view',
  'delete-view',
  'set-positions',
  'remove-positions',
  'create-free-shape',
  'update-free-shape',
  'delete-free-shapes',
  'create-scenario',
  'update-scenario',
  'delete-scenario',
  'update-project',
  'batch',
];

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
  fc.record({ kind: fc.constant('toggle-nests'), type: index }),
  fc.record({ kind: fc.constant('rederive'), component: index, parent: index }),
  fc.record({ kind: fc.constant('remove-definition'), at: index }),
  fc.record({ kind: fc.constant('packages'), systems: fc.boolean() }),
  fc.record({
    kind: fc.constant('view'),
    action: fc.constantFrom('create', 'nesting', 'delete'),
    at: index,
    types: fc.array(index, { maxLength: 2 }),
  }),
  fc.record({
    kind: fc.constant('scenario'),
    action: fc.constantFrom('create', 'steps', 'delete'),
    at: index,
    picks: fc.array(index, { minLength: 1, maxLength: 3 }),
  }),
  fc.record({
    kind: fc.constant('note'),
    action: fc.constantFrom('create', 'move', 'delete'),
    at: index,
  }),
  fc.constant({ kind: 'package' as const }),
  fc.record({
    kind: fc.constant('forget-positions'),
    at: index,
    picks: fc.array(index, { minLength: 1, maxLength: 3 }),
  }),
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
        ...(container
          ? { containers: [{ container, relationType: pick(NESTING, wish.component) as Id }] }
          : {}),
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
    case 'toggle-nests': {
      const relationType = pick(ownPackage(state).relationTypes, wish.type);
      return (
        relationType && {
          type: 'define-relation-type',
          package: 'test',
          relationType: { ...relationType, nests: !relationType.nests },
        }
      );
    }
    case 'rederive': {
      const component = pick(ownPackage(state).components, wish.component);
      return (
        component && {
          type: 'define-component',
          package: 'test',
          component: { ...component, derivesFrom: pick(COMPONENTS, wish.parent) as Id },
        }
      );
    }
    case 'remove-definition': {
      const own = ownPackage(state);
      const ids = [...own.components, ...own.relationTypes].map((definition) => definition.id);
      const id = pick(ids, wish.at);
      if (id === undefined) return undefined;
      return own.components.some((component) => component.id === id)
        ? { type: 'remove-component', id }
        : { type: 'remove-relation-type', id };
    }
    case 'packages':
      return {
        type: 'update-project',
        changes: { packages: wish.systems ? ['test', 'systems'] : ['test'] },
      };
    case 'view': {
      const views = state.views.map((view) => view.id);
      const nestingRelationTypes = [...new Set(wish.types.map((at) => pick(NESTING, at) as Id))];
      switch (wish.action) {
        case 'create':
          return {
            type: 'create-view',
            view: {
              name: 'Another view',
              perspective: { name: 'Structure' },
              nestingRelationTypes,
            },
          };
        case 'nesting': {
          const view = pick(views, wish.at);
          return view === undefined
            ? undefined
            : { type: 'update-view', id: view, changes: { nestingRelationTypes } };
        }
        case 'delete': {
          const view = pick(views, wish.at);
          return view === undefined ? undefined : { type: 'delete-view', id: view };
        }
      }
      return undefined;
    }
    case 'scenario': {
      const scenarios = state.scenarios.map((scenario) => scenario.id);
      const chosen = [...new Set(wish.picks.map((at) => pick(relations, at)))].filter(
        (id): id is Id => id !== undefined,
      );
      const steps = [{ description: 'A step.', relations: chosen }];
      switch (wish.action) {
        case 'create': {
          const view = pick(state.views, wish.at);
          return view && chosen.length > 0
            ? { type: 'create-scenario', scenario: { name: 'A story', view: view.id, steps } }
            : undefined;
        }
        case 'steps': {
          const scenario = pick(scenarios, wish.at);
          return scenario && chosen.length > 0
            ? { type: 'update-scenario', id: scenario, changes: { steps } }
            : undefined;
        }
        case 'delete': {
          const scenario = pick(scenarios, wish.at);
          return scenario === undefined ? undefined : { type: 'delete-scenario', id: scenario };
        }
      }
      return undefined;
    }
    case 'note': {
      const view = pick(state.views, wish.at);
      if (!view) return undefined;
      if (wish.action === 'create') {
        return {
          type: 'create-free-shape',
          view: view.id,
          shape: { kind: 'note', x: 0, y: 0, width: 120, height: 60, text: 'A note' },
        };
      }
      const note = pick(
        view.freeShapes.filter((shape) => shape.kind === 'note'),
        wish.at,
      );
      if (!note) return undefined;
      return wish.action === 'move'
        ? { type: 'update-free-shape', view: view.id, shape: { ...note, x: note.x + 10 } }
        : { type: 'delete-free-shapes', view: view.id, ids: [note.id] };
    }
    case 'package':
      return { type: 'create-package', package: { id: 'extra', name: 'Extra' } };
    case 'forget-positions': {
      const view = pick(state.views, wish.at);
      if (!view || view.positions.length === 0) return undefined;
      const positions = [...new Set(wish.picks.map((at) => pick(view.positions, at)))].flatMap(
        (position) =>
          position === undefined
            ? []
            : [
                {
                  element: position.element,
                  ...(position.container === undefined ? {} : { container: position.container }),
                },
              ],
      );
      return { type: 'remove-positions', view: view.id, positions };
    }
    case 'undo':
    case 'redo':
      return undefined;
  }
}

/** The project's own package, whose definitions the actions change. */
function ownPackage(state: ProjectSnapshot) {
  const own = state.packages.find((file) => file.id === 'test');
  if (!own) throw new Error('The project lost its own package.');
  return own;
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
    const seen = { applied: 0, deletes: 0, undos: 0, kinds: new Set<string>() };
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
          let state = propertyProject();
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
            // Relation type limits only warn: a relation that does not nest, of a relation type
            // that exists, between ends that exist, is never refused.
            const definitions = definitionsIn(state);
            if (
              command.type === 'create-relation' &&
              definitions.relationTypes.has(command.relation.relationType) &&
              !definitions.nestingRelationTypes.has(command.relation.relationType)
            ) {
              expect(outcome.ok).toBe(true);
            }
            if (!outcome.ok) continue;
            const before = state;
            const after = outcome.state;
            expectRulesKept(after);
            if (preview) {
              expectDeletedExactly(before, after, preview);
              seen.deletes += 1;
            }
            seen.applied += 1;
            seen.kinds.add(command.type);

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
    // And every kind of command among them.
    expect([...seen.kinds].sort()).toEqual([...COMMAND_TYPES].sort());
  });

  it('never lets containment form a cycle, however nesting is attempted', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(index, index), { maxLength: 60 }), (pairs) => {
        let state = propertyProject();
        for (const [from, to] of pairs) {
          const elements = [...state.model.elements.map((element) => element.id)];
          const outcome = executeCommand(state, {
            type: 'create-relation',
            relation: {
              relationType: pick(NESTING, from + to) as Id,
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
