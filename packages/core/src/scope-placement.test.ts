/**
 * Where the shapes of a view with a scope sit (ADR-0040): in their nearest container that shows, or
 * directly in World; and how positions, the stacking order and changes of container follow it.
 */
import fc from 'fast-check';
import type { Element, Id, Relation, Scope } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from './commands';
import { leavingRelations } from './containers';
import { applyOperations } from './operations';
import { shownByScope } from './scope';
import { shapesInView } from './scope-placement';
import type { ProjectSnapshot } from './snapshot';
import { contentsInView } from './stacking';
import { sequentialIds, testProject } from './test/fixtures';

const VIEW = 'overview';

/** The test project, with a region in World holding the system, and a scope on its view. */
function regional(scope: Scope | undefined): ProjectSnapshot {
  const state = testProject();
  state.model.elements.unshift({ id: 'region', component: 'test.box', name: 'Region' });
  state.model.relations.push({
    id: 'system-in-region',
    relationType: 'test.inside',
    from: 'system',
    to: 'region',
  });
  const view = state.views[0]!;
  state.views[0] = scope === undefined ? view : { ...view, scope };
  return state;
}

const viewOf = (state: ProjectSnapshot) => state.views.find((view) => view.id === VIEW)!;

function run(command: Command, state: ProjectSnapshot) {
  const outcome = executeCommand(state, command, { newId: sequentialIds() });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
  return outcome;
}

describe('shapesInView', () => {
  it('puts every shape where its own container is while every container shows', () => {
    const state = regional({ exclude: [{ kind: 'component', component: 'nothing' }] });
    const placed = shapesInView(state, viewOf(state));
    expect(placed.containersOf('system')).toEqual(['region']);
    expect(placed.containersOf('api')).toEqual(['system']);
    expect(placed.containersOf('client')).toEqual([]);
    expect(placed.contentsOf(undefined)).toEqual(['region', 'client', 'contract']);
    expect(placed.contentsOf('world')).toEqual(['region', 'client', 'contract']);
    expect(placed.contentsOf('system')).toEqual(['api', 'db']);
    expect(placed.containersOf('world')).toBeUndefined();
  });

  it('puts a shape whose container is left out in the nearest container that shows', () => {
    const state = regional({ leftOut: ['system'] });
    const placed = shapesInView(state, viewOf(state));
    expect(placed.containersOf('system')).toBeUndefined();
    expect(placed.containersOf('api')).toEqual(['region']);
    expect(placed.contentsOf('region')).toEqual(['api', 'db']);
    expect(placed.placing('api', 'region').map((each) => each.id)).toEqual(['api-in-system']);
  });

  it('puts it directly in World when no container that holds it shows', () => {
    const state = regional({ leftOut: ['system', 'region'] });
    const placed = shapesInView(state, viewOf(state));
    expect(placed.containersOf('api')).toEqual([]);
    expect(placed.contentsOf(undefined)).toEqual(['api', 'db', 'client', 'contract']);
    expect(placed.placing('api', undefined)).toEqual([]);
  });

  it('leaves World out when another container that shows holds it too', () => {
    const state = regional({ leftOut: ['system', 'region'] });
    state.model.relations.push({
      id: 'api-in-contract',
      relationType: 'test.inside',
      from: 'api',
      to: 'contract',
    });
    const placed = shapesInView(state, viewOf(state));
    expect(placed.containersOf('api')).toEqual(['contract']);
    expect(placed.contentsOf(undefined)).not.toContain('api');
  });

  it('follows only the view’s nesting relation types', () => {
    const state = regional({ leftOut: ['system'] });
    state.views[0] = { ...state.views[0]!, nestingRelationTypes: [] };
    const placed = shapesInView(state, viewOf(state));
    expect(placed.containersOf('api')).toEqual([]);
    expect(placed.contentsOf(undefined)).toEqual(['region', 'api', 'db', 'client', 'contract']);
  });

  it('is worked out once for each state and view', () => {
    const state = regional({ leftOut: ['system'] });
    expect(shapesInView(state, viewOf(state))).toBe(shapesInView(state, viewOf(state)));
  });
});

describe('the commands, in a view whose scope lifts a shape out of its container', () => {
  it('store its position in the container it sits in', () => {
    const state = regional({ leftOut: ['system'] });
    const outcome = run(
      {
        type: 'set-positions',
        view: VIEW,
        positions: [{ element: 'api', container: 'region', x: 10, y: 20 }],
      },
      state,
    );
    expect(viewOf(outcome.state).positions).toContainEqual({
      element: 'api',
      container: 'region',
      x: 10,
      y: 20,
    });
    // Its position in the system it sits in in the model is kept, and not used.
    expect(viewOf(outcome.state).positions).toContainEqual({
      element: 'api',
      container: 'system',
      x: 20,
      y: 40,
    });
  });

  it('still refuse a position in a container that does not hold it', () => {
    const state = regional({ leftOut: ['system'] });
    const outcome = executeCommand(state, {
      type: 'set-positions',
      view: VIEW,
      positions: [{ element: 'api', container: 'client', x: 0, y: 0 }],
    });
    expect(outcome.ok).toBe(false);
  });

  it('list it among the contents of where it sits, as the stacking order does', () => {
    const state = regional({ leftOut: ['system'] });
    expect(contentsInView(state, viewOf(state), 'region')).toEqual(['api', 'db']);
    expect(contentsInView(state, viewOf(state), 'system')).toEqual([]);
    const restacked = run(
      {
        type: 'restack',
        view: VIEW,
        moves: [{ shape: { element: 'api', container: 'region' }, to: 'front' }],
      },
      state,
    );
    // The shortest list that draws the DB behind the API, which comes after it in model order.
    expect(viewOf(restacked.state).stackingOrder).toEqual({ region: ['db'] });
  });

  it('take it out of where it sits through the container left out', () => {
    const state = regional({ leftOut: ['system'] });
    expect(leavingRelations(state, viewOf(state), 'api', 'region').map((each) => each.id)).toEqual([
      'api-in-system',
    ]);
    const outcome = run(
      { type: 'change-container', view: VIEW, shapes: [{ element: 'api', from: 'region' }] },
      state,
    );
    expect(outcome.state.model.relations.some((each) => each.id === 'api-in-system')).toBe(false);
    expect(shapesInView(outcome.state, viewOf(outcome.state)).containersOf('api')).toEqual([]);
  });

  it('move it from where it sits into another container', () => {
    const state = regional({ leftOut: ['system'] });
    const outcome = run(
      {
        type: 'change-container',
        view: VIEW,
        to: 'contract',
        shapes: [{ element: 'api', from: 'region', at: { x: 8, y: 48 } }],
      },
      state,
    );
    expect(shapesInView(outcome.state, viewOf(outcome.state)).containersOf('api')).toEqual([
      'contract',
    ]);
  });
});

/** A random model: elements, nesting relations from a later element to an earlier one, and a scope. */
const scopedModels = fc
  .integer({ min: 1, max: 8 })
  .chain((size) =>
    fc.record({
      size: fc.constant(size),
      nesting: fc.uniqueArray(
        fc
          .tuple(fc.integer({ min: 0, max: size - 1 }), fc.integer({ min: 0, max: size - 1 }))
          .filter(([from, to]) => from > to),
        { maxLength: size * 2, selector: ([from, to]) => `${from} ${to}` },
      ),
      leftOut: fc.uniqueArray(fc.integer({ min: 0, max: size - 1 }), { maxLength: size }),
      nestsInView: fc.boolean(),
    }),
  )
  .map(({ size, nesting, leftOut, nestsInView }) => {
    const state = testProject();
    const ids = Array.from({ length: size }, (_, at) => `e${at}`);
    state.model.elements = ids.map((id): Element => ({
      id,
      component: 'test.box',
      name: id.toUpperCase(),
    }));
    state.model.relations = nesting.map(([from, to]): Relation => ({
      id: `r${from}-${to}`,
      relationType: 'test.inside',
      from: ids[from]!,
      to: ids[to]!,
    }));
    state.views[0] = {
      ...state.views[0]!,
      nestingRelationTypes: nestsInView ? ['test.inside'] : [],
      positions: [],
      scope: { exclude: [{ kind: 'component', component: 'nothing' }] },
    };
    const out = leftOut.map((at) => ids[at]!);
    if (out.length > 0) state.views[0].scope = { leftOut: out.sort() };
    state.scenarios = [];
    return { state, ids };
  });

describe('shapesInView, on any model and scope', () => {
  it('sits each shape in the containers that show and that chains through containers left out reach, or in World', () => {
    fc.assert(
      fc.property(scopedModels, ({ state, ids }) => {
        const view = viewOf(state);
        const shown = shownByScope(state, view);
        const placed = shapesInView(state, view);
        const nests = view.nestingRelationTypes.length > 0;
        const holders = (id: Id) =>
          nests
            ? state.model.relations.filter((each) => each.from === id).map((each) => each.to)
            : [];
        // The containers that show which a chain through containers left out reaches.
        const nearest = (id: Id): Set<Id> => {
          const found = new Set<Id>();
          const seen = new Set<Id>();
          const waiting = [...holders(id)];
          for (let at = waiting.pop(); at !== undefined; at = waiting.pop()) {
            if (seen.has(at)) continue;
            seen.add(at);
            if (shown.element(at)) found.add(at);
            else waiting.push(...holders(at));
          }
          return found;
        };
        for (const id of ids) {
          if (!shown.element(id)) {
            expect(placed.containersOf(id)).toBeUndefined();
            continue;
          }
          const containers = placed.containersOf(id) ?? [];
          expect(new Set(containers)).toEqual(nearest(id));
          for (const container of containers) expect(placed.contentsOf(container)).toContain(id);
          expect(placed.contentsOf(undefined).includes(id)).toBe(containers.length === 0);
        }
      }),
    );
  });

  it('lets each shape be placed where it sits, and taken out of there', () => {
    fc.assert(
      fc.property(scopedModels, ({ state, ids }) => {
        const view = viewOf(state);
        const placed = shapesInView(state, view);
        for (const id of ids) {
          for (const container of placed.containersOf(id) ?? []) {
            const positioned = executeCommand(state, {
              type: 'set-positions',
              view: VIEW,
              positions: [{ element: id, container, x: 1, y: 2 }],
            });
            expect(positioned.ok).toBe(true);
            const taken = executeCommand(state, {
              type: 'change-container',
              view: VIEW,
              shapes: [{ element: id, from: container }],
            });
            expect(taken.ok).toBe(true);
            if (!taken.ok) continue;
            const after = shapesInView(taken.state, viewOf(taken.state)).containersOf(id) ?? [];
            expect(after).not.toContain(container);
          }
        }
      }),
    );
  });
});
