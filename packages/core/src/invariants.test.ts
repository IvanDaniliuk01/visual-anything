/**
 * Property tests for the rules the core enforces. Random sequences of commands, undos and redos run on
 * a project; after every step the project keeps its rules, and every action undoes exactly.
 */
import fc from 'fast-check';
import type { FileKind, Id } from '@visual-anything/schema';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { checkProject } from './check';
import { executeCommand, previewChangeContainer, type ContainerChangePreview } from './commands';
import { EMPTY_HISTORY, record, redo, undo, type History } from './history';
import { randomIds } from './ids';
import { containmentCycles, previewDelete } from './rules';
import { shownByScope } from './scope';
import type { ProjectSnapshot } from './snapshot';
import { definitionsIn, modelIndexOf } from './state';
import {
  COMMAND_TYPES,
  NESTING,
  RECOLORS,
  commandFor,
  index,
  everyIntent,
  lowerCased,
  pick,
  placementsIn,
  propertyProject,
} from './test/random-commands';

/** The rules every project keeps after any sequence of actions. */
function expectRulesKept(state: ProjectSnapshot) {
  expect(checkProject(state).errors).toEqual([]);
  const model = modelIndexOf(state);
  const all = [state.model.world.id, ...state.model.elements.map((element) => element.id)];
  expect(containmentCycles(model, all)).toEqual([]);
  for (const relation of state.model.relations) {
    expect(model.has(relation.from) && model.has(relation.to)).toBe(true);
  }
  // A stacking order is never empty, nor any list in it, and no list names anything twice. Each list
  // is kept for World or an element, and names only elements.
  const elements = new Set(state.model.elements.map((element) => element.id));
  for (const view of state.views) {
    if (!('stackingOrder' in view)) continue;
    const order = view.stackingOrder ?? {};
    expect(Object.keys(order).length).toBeGreaterThan(0);
    for (const [container, list] of Object.entries(order)) {
      expect(container === state.model.world.id || elements.has(container)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
      expect(new Set(list).size).toBe(list.length);
      for (const id of list) expect(elements.has(id)).toBe(true);
    }
  }
  // The containers a view keeps collapsed: never an empty list, sorted, each once, only elements.
  for (const view of state.views) {
    if (!('collapsed' in view)) continue;
    const collapsed = view.collapsed ?? [];
    expect(collapsed.length).toBeGreaterThan(0);
    expect(collapsed).toEqual([...new Set(collapsed)].sort());
    for (const id of collapsed) expect(elements.has(id)).toBe(true);
  }
  // A scope's lists: sorted, each once, apart from each other, and naming only elements, never World.
  for (const view of state.views) {
    const scope = view.scope;
    if (!scope) continue;
    expect(Object.keys(scope).length).toBeGreaterThan(0);
    for (const list of [scope.added, scope.leftOut]) {
      if (list === undefined) continue;
      expect(list.length).toBeGreaterThan(0);
      expect(list).toEqual([...new Set(list)].sort());
      for (const id of list) expect(elements.has(id)).toBe(true);
    }
    const added = new Set(scope.added ?? []);
    for (const id of scope.leftOut ?? []) expect(added.has(id)).toBe(false);
    // What the view shows is what the scope gives, and a relation shows while its ends do.
    const shown = shownByScope(state, view);
    for (const relation of state.model.relations) {
      const end = (id: Id): boolean => (model.element(id) ? shown.element(id) : shown.relation(id));
      expect(shown.relation(relation.id)).toBe(end(relation.from) && end(relation.to));
    }
  }
  // Every value a command set is one the published schema accepts, so every save succeeds. A file an
  // action left alone keeps its object, so each object is checked once.
  const files: [FileKind, object][] = [
    ['project', state.project],
    ['model', state.model],
    ...state.packages.map((file): [FileKind, object] => ['package', file]),
    ...state.views.map((view): [FileKind, object] => ['view', view]),
  ];
  for (const [kind, file] of files) {
    if (validated.has(file)) continue;
    expect(validateFile(kind, file)).toEqual({ ok: true, value: file });
    // Every color a command stored is written in capitals: the project starts with no other.
    for (const color of JSON.stringify(file).match(/#[0-9A-Fa-f]{6}\b/g) ?? []) {
      expect(color).toBe(color.toUpperCase());
    }
    validated.add(file);
  }
}

/** The file contents already found valid. */
const validated = new WeakSet<object>();

/** What the sequences of commands did, counted to make sure they do things and not only fail. */
interface Seen {
  applied: number;
  deletes: number;
  containerChanges: number;
  recolors: number;
  undos: number;
  kinds: Set<string>;
}

function nothingSeen(): Seen {
  return { applied: 0, deletes: 0, containerChanges: 0, recolors: 0, undos: 0, kinds: new Set() };
}

/**
 * Any sequence of commands, undos and redos keeps the rules, and every action undoes exactly; what
 * happened is counted in `seen`.
 */
function sequences(seen: Seen) {
  return fc.property(
    fc.array(everyIntent, { minLength: 10, maxLength: 60 }),
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
        const containerPreview =
          command.type === 'change-container' ? previewChangeContainer(state, command) : undefined;
        const outcome = executeCommand(state, command, { newId });
        // A change of container the preview lets through is never refused, and one it stops is.
        if (containerPreview) {
          expect(outcome.ok).toBe(containerPreview.problems.length === 0);
        }
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
        if (containerPreview) {
          expectContainerChangedExactly(before, after, containerPreview);
          seen.containerChanges += 1;
        }
        // Picking the same colors again, in another case, changes nothing.
        if (RECOLORS.has(wish.kind)) {
          const again = executeCommand(after, lowerCased(command), { newId });
          expect(again.ok && again.state).toStrictEqual(after);
          seen.recolors += 1;
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
        // Exactly: a key left with an undefined value would not count as undone.
        expect(undone?.state).toStrictEqual(before);
        expect(redo(undone?.state ?? before, undone?.history ?? recorded)?.state).toEqual(after);
        state = after;
        history = recorded;
      }
    },
  );
}

describe('the rules of the core', () => {
  it('hold after any sequence of commands, undos and redos, and every action undoes exactly', () => {
    const seen = nothingSeen();
    // A fixed seed, so that the counts below hold on every run; the next test explores at random.
    fc.assert(sequences(seen), { numRuns: 150, seed: 20261025 });
    // The sequences must do things, not only be refused.
    expect(seen.applied).toBeGreaterThan(1000);
    expect(seen.deletes).toBeGreaterThan(50);
    expect(seen.containerChanges).toBeGreaterThan(20);
    expect(seen.recolors).toBeGreaterThan(100);
    expect(seen.undos).toBeGreaterThan(50);
    // And every kind of command among them.
    expect([...seen.kinds].sort()).toEqual([...COMMAND_TYPES].sort());
    // Thousands of actions: on a loaded machine this takes longer than a test's default 5 seconds.
  }, 60_000);

  it('hold after sequences picked at random on each run', () => {
    fc.assert(sequences(nothingSeen()), { numRuns: 40 });
  }, 60_000);

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
          // Putting a shape inside another from the canvas never forms one either.
          const view = state.views[0];
          if (view) {
            const placements = placementsIn(state, view);
            const shape = pick(placements, from);
            const into = pick(elements, to);
            if (shape && into) {
              const moved = executeCommand(state, {
                type: 'change-container',
                view: view.id,
                to: into,
                shapes: [
                  {
                    element: shape.element,
                    ...(shape.container === undefined ? {} : { from: shape.container }),
                  },
                ],
              });
              if (moved.ok) state = moved.state;
              expect(containmentCycles(modelIndexOf(state), all)).toEqual([]);
            }
          }
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
  // No stacking list names, or is kept for, something deleted, and the lists lost what the preview said.
  const entries = (state: ProjectSnapshot) =>
    state.views.flatMap((view) =>
      Object.entries(view.stackingOrder ?? {}).flatMap(([container, list]) =>
        list.map((element) => JSON.stringify([view.id, container, element])),
      ),
    );
  const left = new Set(entries(after));
  const gone = entries(before).filter((entry) => !left.has(entry));
  expect(new Set(gone)).toEqual(
    new Set(
      preview.stacking.map((entry) => JSON.stringify([entry.view, entry.container, entry.element])),
    ),
  );
  for (const view of after.views) {
    for (const [container, list] of Object.entries(view.stackingOrder ?? {})) {
      expect(preview.elements).not.toContain(container);
      for (const element of list) expect(preview.elements).not.toContain(element);
    }
  }
  for (const relation of after.model.relations) {
    expect(preview.elements.includes(relation.from) || preview.elements.includes(relation.to)).toBe(
      false,
    );
  }
}

/**
 * A change of container deletes exactly the relations its preview listed, and no element; the steps
 * that played them stay, broken, as the preview said.
 */
function expectContainerChangedExactly(
  before: ProjectSnapshot,
  after: ProjectSnapshot,
  preview: ContainerChangePreview,
) {
  const left = new Set(after.model.relations.map((relation) => relation.id));
  const removed = before.model.relations
    .map((relation) => relation.id)
    .filter((id) => !left.has(id));
  expect(removed).toEqual(preview.relations);
  expect(preview.elements).toEqual([]);
  expect(after.model.elements).toEqual(before.model.elements);
  expect(after.scenarios).toEqual(before.scenarios);
  const gone = new Set(removed);
  const broken = before.scenarios.flatMap((scenario) =>
    scenario.steps
      .filter((step) => step.relations.some((id) => gone.has(id)))
      .map((step) => ({ scenario: scenario.id, step: step.id })),
  );
  expect(preview.brokenSteps).toEqual(broken);
}
