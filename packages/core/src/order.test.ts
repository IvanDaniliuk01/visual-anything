/**
 * The model's order: reordering elements, and creating one before another. Rows follow the model's
 * order; every other shape keeps where each view draws it.
 */
import fc from 'fast-check';
import type { Id, PackageFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from './commands';
import { contentsInView, stackingOrderOf } from './stacking';
import { applyOperations } from './operations';
import type { ProjectSnapshot } from './snapshot';
import { TEST_PACKAGE, sequentialIds, testProject } from './test/fixtures';

/**
 * The test project with a table-like component that draws its contents as rows, a table holding two
 * rows, and a second view that also nests by "is inside".
 */
function orderProject(): ProjectSnapshot {
  const project = JSON.parse(JSON.stringify(testProject())) as ProjectSnapshot;
  const own: PackageFile = {
    ...TEST_PACKAGE,
    components: [
      ...TEST_PACKAGE.components,
      {
        id: 'test.table',
        name: 'Table',
        derivesFrom: 'essence',
        appearance: { contentsAsRows: true },
      },
    ],
  };
  project.packages = [own];
  project.model.elements.push(
    { id: 'table', component: 'test.table', name: 'Table' },
    { id: 'col-a', component: 'test.box', name: 'a' },
    { id: 'col-b', component: 'test.box', name: 'b' },
    { id: 'cache', component: 'test.database', name: 'Cache' },
  );
  project.model.relations.push(
    { id: 'a-in-table', relationType: 'test.inside', from: 'col-a', to: 'table' },
    { id: 'b-in-table', relationType: 'test.inside', from: 'col-b', to: 'table' },
    { id: 'cache-in-system', relationType: 'test.inside', from: 'cache', to: 'system' },
  );
  project.views.push({
    id: 'second',
    name: 'Second',
    perspective: { name: 'Ownership' },
    nestingRelationTypes: ['test.inside'],
    positions: [],
    freeShapes: [],
    stackingOrder: { world: ['client', 'system'], system: ['db', 'api'] },
  });
  return project;
}

function run(command: Command, state: ProjectSnapshot) {
  const outcome = executeCommand(state, command, { newId: sequentialIds() });
  if (outcome.ok)
    expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
  return outcome;
}

function ok(command: Command, state: ProjectSnapshot = orderProject()) {
  const outcome = run(command, state);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome;
}

function refused(command: Command, state: ProjectSnapshot = orderProject()) {
  const outcome = run(command, state);
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems.map((each) => each.code);
}

const ids = (state: ProjectSnapshot) => state.model.elements.map((element) => element.id);

/** For every view and every place shapes sit (World, and each element), the order it draws them in. */
function drawings(state: ProjectSnapshot, rowsHolders: ReadonlySet<Id>): Map<string, Id[]> {
  const result = new Map<string, Id[]>();
  for (const view of state.views) {
    for (const key of [state.model.world.id, ...ids(state)]) {
      if (rowsHolders.has(key)) continue;
      result.set(`${view.id} ${key}`, stackingOrderOf(state, view.id, key));
    }
  }
  return result;
}

describe('reorder-elements', () => {
  it('moves the listed elements before another, in the order listed, or to the end', () => {
    const moved = ok({ type: 'reorder-elements', elements: ['db', 'client'], before: 'api' });
    expect(ids(moved.state)).toEqual([
      'system',
      'db',
      'client',
      'api',
      'contract',
      'table',
      'col-a',
      'col-b',
      'cache',
    ]);
    expect(moved.label).toBe('Move 2 elements before "API"');
    const last = ok({ type: 'reorder-elements', elements: ['system'] });
    expect(ids(last.state).at(-1)).toBe('system');
    expect(last.label).toBe('Move "System" to the end');
    expect(ok({ type: 'reorder-elements', elements: ['col-b'], before: 'col-a' }).label).toBe(
      'Move "b" before "a"',
    );
  });

  it('changes nothing when the elements already sit there', () => {
    expect(ok({ type: 'reorder-elements', elements: ['api'], before: 'db' }).operations).toEqual(
      [],
    );
    expect(ok({ type: 'reorder-elements', elements: ['cache'] }).operations).toEqual([]);
  });

  it('refuses World, unknown and repeated elements, nothing, and a place among the moved', () => {
    const reorder = (elements: Id[], before?: Id): Command => ({
      type: 'reorder-elements',
      elements,
      ...(before === undefined ? {} : { before }),
    });
    expect(refused(reorder(['world']))).toEqual(['world-not-allowed']);
    expect(refused(reorder(['nope']))).toEqual(['unknown-element']);
    expect(refused(reorder(['api', 'api']))).toEqual(['invalid-command']);
    expect(refused(reorder([]))).toEqual(['invalid-command']);
    expect(refused(reorder(['api', 'db'], 'db'))).toEqual(['invalid-command']);
    expect(refused(reorder(['api'], 'world'))).toEqual(['world-not-allowed']);
    expect(refused(reorder(['api'], 'nope'))).toEqual(['unknown-element']);
  });

  it('keeps the set of elements, moves only the listed ones, and keeps every view drawing as it did', () => {
    const element = fc.constantFrom(...ids(orderProject()));
    const restack = fc.record({
      view: fc.constantFrom('overview', 'second'),
      element,
      place: fc.constantFrom('front' as const, 'back' as const),
    });
    fc.assert(
      fc.property(
        fc.array(restack, { maxLength: 6 }),
        fc.uniqueArray(element, { minLength: 1, maxLength: 4 }),
        fc.option(element, { nil: undefined }),
        (moves, moving, before) => {
          let state = orderProject();
          for (const move of moves) {
            const view = state.views.find((each) => each.id === move.view);
            const container = state.model.relations.find(
              (relation) =>
                relation.from === move.element && relation.relationType === 'test.inside',
            )?.to;
            if (!view || container === 'table') continue;
            const outcome = executeCommand(state, {
              type: 'restack',
              view: view.id,
              moves: [
                {
                  shape: { element: move.element, ...(container ? { container } : {}) },
                  to: move.place,
                },
              ],
            });
            if (outcome.ok) state = outcome.state;
          }
          fc.pre(before === undefined || !moving.includes(before));
          const outcome = ok(
            {
              type: 'reorder-elements',
              elements: moving,
              ...(before === undefined ? {} : { before }),
            },
            state,
          );
          const after = outcome.state;
          // The same elements, the others in the same order, the moved ones together where asked.
          expect([...ids(after)].sort()).toEqual([...ids(state)].sort());
          const others = (list: Id[]) => list.filter((id) => !moving.includes(id));
          expect(others(ids(after))).toEqual(others(ids(state)));
          const at = ids(after).indexOf(moving[0] as Id);
          expect(ids(after).slice(at, at + moving.length)).toEqual(moving);
          expect(ids(after)[at + moving.length]).toBe(before);
          // Every view draws every shape where it did; only rows follow the model's order.
          const rows = new Set(['table']);
          expect(drawings(after, rows)).toEqual(drawings(state, rows));
          for (const view of after.views) {
            expect(contentsInView(after, view, 'table')).toEqual(
              ids(after).filter((id) => id === 'col-a' || id === 'col-b'),
            );
            expect(view.stackingOrder?.table).toBeUndefined();
          }
        },
      ),
    );
  });
});

describe('create-element before another', () => {
  it('places the element in the model before another, and still draws it in front', () => {
    const outcome = ok({
      type: 'create-element',
      element: { component: 'test.service', name: 'Worker' },
      containers: [{ container: 'system', relationType: 'test.inside' }],
      before: 'api',
    });
    expect(ids(outcome.state).slice(0, 3)).toEqual(['system', 'worker-1', 'api']);
    for (const view of outcome.state.views) {
      expect(stackingOrderOf(outcome.state, view.id, 'system').at(-1)).toBe('worker-1');
      const others = stackingOrderOf(outcome.state, view.id, 'system').filter(
        (id) => id !== 'worker-1',
      );
      expect(others).toEqual(stackingOrderOf(orderProject(), view.id, 'system'));
    }
  });

  it('adds a row where it is asked, without touching any stacking list', () => {
    const outcome = ok({
      type: 'create-element',
      element: { component: 'test.box', name: 'id' },
      containers: [{ container: 'table', relationType: 'test.inside' }],
      before: 'col-a',
    });
    for (const view of outcome.state.views) {
      expect(contentsInView(outcome.state, view, 'table')).toEqual(['id-1', 'col-a', 'col-b']);
    }
    expect(outcome.state.views.map((view) => view.stackingOrder)).toEqual(
      orderProject().views.map((view) => view.stackingOrder),
    );
  });

  it('refuses a place before World, an unknown element, and a position inside rows', () => {
    const create = (extra: object): Command => ({
      type: 'create-element',
      element: { component: 'test.box', name: 'X' },
      ...extra,
    });
    expect(refused(create({ before: 'world' }))).toEqual(['world-not-allowed']);
    expect(refused(create({ before: 'nope' }))).toEqual(['unknown-element']);
    expect(
      refused(
        create({
          containers: [{ container: 'table', relationType: 'test.inside' }],
          positions: [{ view: 'overview', container: 'table', x: 0, y: 0 }],
        }),
      ),
    ).toEqual(['position-of-row']);
  });

  it('refuses a position inside a container that draws rows, in set-positions too', () => {
    expect(
      refused({
        type: 'set-positions',
        view: 'overview',
        positions: [{ element: 'col-a', container: 'table', x: 0, y: 0 }],
      }),
    ).toEqual(['position-of-row']);
  });
});
