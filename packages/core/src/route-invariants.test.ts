/**
 * Property tests for routes chosen by hand (ADR 0039). Random sequences of route commands, mixed with
 * the commands that can break a route (deletes, moved ends, connection points and components that
 * change, changes of container and of nesting, collapse, batches), undos and redos run on a project.
 * After every step no route names a relation, a connection point or a container that is gone, every
 * view file stays valid, every action undoes exactly, and a delete takes exactly the routes its
 * preview lists.
 */
import fc from 'fast-check';
import type {
  Component,
  ConnectionPoint,
  EndAttachment,
  Id,
  Point,
  RelationRoute,
  ViewFile,
} from '@visual-anything/schema';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { checkProject } from './check';
import { executeCommand, type Command, type RouteStyle } from './commands';
import { containmentTree, type Placement } from './containment';
import { nestingTypesInView } from './containers';
import { appearanceOf } from './definitions';
import { EMPTY_HISTORY, record, redo, undo, type History } from './history';
import { randomIds } from './ids';
import { routeWarnings } from './routes';
import { previewDelete, type DeletePreview } from './rules';
import type { ProjectSnapshot } from './snapshot';
import { definitionsIn, modelIndexOf } from './state';
import { testProject } from './test/fixtures';

const IN: ConnectionPoint = { name: 'in', side: 'left', at: 0.5 };
const OUT: ConnectionPoint = { name: 'out', side: 'right', at: 0.5 };
const EXIT: ConnectionPoint = { name: 'exit', side: 'right', at: 0.5 };
const TOP: ConnectionPoint = { name: 'top', side: 'top', at: 0.5 };

/** The lists of connection points a component or an element may be given, `null` to inherit. */
const POINT_LISTS: readonly (ConnectionPoint[] | null)[] = [
  [IN, OUT],
  [EXIT],
  [],
  [IN],
  [TOP, OUT],
  null,
];
const NAMES = ['in', 'out', 'exit', 'top', 'gone'];
const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const PLACES = [0, 0.25, 0.5, 1];
const STYLES: readonly RouteStyle[] = ['orthogonal', 'straight', 'curved'];
const COMPONENTS = ['test.box', 'test.service', 'test.database', 'test.table', 'essence'];
const RELATION_TYPES = ['test.calls', 'test.governs', 'test.inside'];

/**
 * The test project with connection points on services and boxes, a table with a column, a second
 * view that nests by nothing, and some routes already chosen by hand in both views.
 */
function propertyProject(): ProjectSnapshot {
  const project = testProject();
  const [own, ...others] = project.packages;
  if (!own) throw new Error('The test project has no package.');
  const table: Component = {
    id: 'test.table',
    name: 'Table',
    derivesFrom: 'test.box',
    appearance: { shape: 'rectangle', contentsAsRows: true },
  };
  const components = own.components.map((component) => {
    if (component.id === 'test.service') {
      return { ...component, appearance: { ...component.appearance, connectionPoints: [IN, OUT] } };
    }
    if (component.id === 'test.box') {
      return { ...component, appearance: { ...component.appearance, connectionPoints: [TOP] } };
    }
    return component;
  });
  const flat: ViewFile = {
    id: 'flat',
    name: 'Flat',
    perspective: { name: 'Everything' },
    nestingRelationTypes: [],
    positions: [],
    freeShapes: [],
    routes: { 'api-in-system': { style: 'curved', bendPoints: [{ x: 10, y: 20 }] } },
  };
  return {
    ...project,
    packages: [{ ...own, components: [...components, table] }, ...others],
    model: {
      ...project.model,
      elements: [
        ...project.model.elements,
        { id: 'orders', component: 'test.table', name: 'Orders' },
        { id: 'orders-id', component: 'test.box', name: 'id' },
      ],
      relations: [
        ...project.model.relations,
        { id: 'id-in-orders', relationType: 'test.inside', from: 'orders-id', to: 'orders' },
        { id: 'api-writes-id', relationType: 'test.calls', from: 'api', to: 'orders-id' },
        { id: 'client-reads-orders', relationType: 'test.calls', from: 'client', to: 'orders' },
      ],
    },
    views: [
      ...project.views.map((view) => ({
        ...view,
        routes: {
          'client-calls-api': {
            from: { kind: 'connection-point', name: 'out' },
            to: { kind: 'connection-point', name: 'in' },
          },
          'api-reads-db': {
            from: { kind: 'border', side: 'bottom', at: 0.25 },
            container: 'system',
            bendPoints: [{ x: 120, y: 100 }],
          },
        } satisfies Record<Id, RelationRoute>,
      })),
      flat,
    ],
  };
}

/** One end of a route a random action chooses: left as it is, automatic, a named point or a border point. */
type Choice =
  | { kind: 'keep' }
  | { kind: 'automatic' }
  | { kind: 'point'; name: number }
  | { kind: 'border'; side: number; at: number };

type Intent =
  | {
      kind: 'set-route';
      view: number;
      relation: number;
      from: Choice;
      to: Choice;
      bends: Point[] | null | undefined;
      style: number | null;
      container: number | null;
    }
  | { kind: 'reset-route'; view: number; picks: number[] }
  | { kind: 'delete-elements'; picks: number[] }
  | { kind: 'delete-relations'; picks: number[] }
  | { kind: 'move-end'; relation: number; end: 'from' | 'to'; target: number }
  | { kind: 'reconnect'; relation: number; target: number; side: number }
  | { kind: 'component-points'; component: number; list: number }
  | { kind: 'element-points'; element: number; list: number }
  | { kind: 'retype'; element: number; component: number }
  | { kind: 'change-container'; picks: number[]; to: number | null }
  | { kind: 'nesting'; nests: boolean }
  | { kind: 'collapse'; picks: number[]; collapsed: boolean }
  | { kind: 'create-relation'; type: number; from: number; to: number }
  | { kind: 'create-element'; component: number; container: number | null }
  | { kind: 'undo' }
  | { kind: 'redo' };

const index = fc.nat({ max: 1000 });
const choice: fc.Arbitrary<Choice> = fc.oneof(
  { arbitrary: fc.constant({ kind: 'keep' as const }), weight: 3 },
  fc.constant({ kind: 'automatic' as const }),
  { arbitrary: fc.record({ kind: fc.constant('point' as const), name: index }), weight: 2 },
  {
    arbitrary: fc.record({ kind: fc.constant('border' as const), side: index, at: index }),
    weight: 2,
  },
);
const point = fc.record({
  x: fc.integer({ min: -500, max: 500 }),
  y: fc.integer({ min: -500, max: 500 }),
});
const picks = fc.array(index, { minLength: 1, maxLength: 3 });

const intent: fc.Arbitrary<Intent> = fc.oneof(
  {
    arbitrary: fc.record({
      kind: fc.constant('set-route' as const),
      view: index,
      relation: index,
      from: choice,
      to: choice,
      bends: fc.oneof(fc.constant(undefined), fc.constant(null), fc.array(point, { maxLength: 3 })),
      style: fc.option(index),
      container: fc.option(index, { freq: 4 }),
    }),
    weight: 8,
  },
  {
    arbitrary: fc.record({ kind: fc.constant('reset-route' as const), view: index, picks }),
    weight: 2,
  },
  fc.record({ kind: fc.constant('delete-elements' as const), picks }),
  { arbitrary: fc.record({ kind: fc.constant('delete-relations' as const), picks }), weight: 2 },
  {
    arbitrary: fc.record({
      kind: fc.constant('move-end' as const),
      relation: index,
      end: fc.constantFrom('from' as const, 'to' as const),
      target: index,
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant('reconnect' as const),
      relation: index,
      target: index,
      side: index,
    }),
    weight: 2,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant('component-points' as const),
      component: index,
      list: index,
    }),
    weight: 3,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant('element-points' as const),
      element: index,
      list: index,
    }),
    weight: 2,
  },
  fc.record({ kind: fc.constant('retype' as const), element: index, component: index }),
  {
    arbitrary: fc.record({
      kind: fc.constant('change-container' as const),
      picks,
      to: fc.option(index),
    }),
    weight: 2,
  },
  fc.record({ kind: fc.constant('nesting' as const), nests: fc.boolean() }),
  fc.record({ kind: fc.constant('collapse' as const), picks, collapsed: fc.boolean() }),
  fc.record({ kind: fc.constant('create-relation' as const), type: index, from: index, to: index }),
  fc.record({
    kind: fc.constant('create-element' as const),
    component: index,
    container: fc.option(index),
  }),
  { arbitrary: fc.constant({ kind: 'undo' as const }), weight: 3 },
  { arbitrary: fc.constant({ kind: 'redo' as const }), weight: 1 },
);

function pick<T>(list: readonly T[], at: number): T | undefined {
  return list.length === 0 ? undefined : list[at % list.length];
}

/** The attachment a choice stands for, or what the command says to do with the end. */
function attachmentOf(wish: Choice): EndAttachment | null | undefined {
  switch (wish.kind) {
    case 'keep':
      return undefined;
    case 'automatic':
      return null;
    case 'point':
      return { kind: 'connection-point', name: pick(NAMES, wish.name) as string };
    case 'border':
      return {
        kind: 'border',
        side: pick(SIDES, wish.side) as (typeof SIDES)[number],
        at: pick(PLACES, wish.at) as number,
      };
  }
}

/** Every anchored shape of a view: an element, and the container it sits in there. */
function placementsIn(state: ProjectSnapshot, view: ViewFile): { element: Id; container?: Id }[] {
  const types = new Set(nestingTypesInView(state, view));
  const placements: { element: Id; container?: Id }[] = [];
  const visit = (tree: readonly Placement[]) => {
    for (const placement of tree) {
      placements.push({
        element: placement.element,
        ...(placement.container === undefined ? {} : { container: placement.container }),
      });
      visit(placement.contents);
    }
  };
  visit(containmentTree(state.model, (type) => types.has(type)));
  return placements;
}

/** The command an intent stands for in this project, if it can stand for one. */
function commandFor(state: ProjectSnapshot, wish: Intent): Command | undefined {
  const world = state.model.world.id;
  const elements = state.model.elements.map((element) => element.id);
  const relations = state.model.relations.map((relation) => relation.id);
  const ends = [world, ...elements, ...relations];
  const views = state.views.map((view) => view.id);
  switch (wish.kind) {
    case 'set-route': {
      const relation = pick(relations, wish.relation);
      if (relation === undefined) return undefined;
      const from = attachmentOf(wish.from);
      const to = attachmentOf(wish.to);
      const style = wish.style === null ? undefined : pick(STYLES, wish.style);
      const container =
        wish.container === null || !Array.isArray(wish.bends) || wish.bends.length === 0
          ? undefined
          : pick([world, ...elements], wish.container);
      return {
        type: 'set-route',
        view: pick(views, wish.view) as Id,
        relation,
        ...(from === undefined ? {} : { from }),
        ...(to === undefined ? {} : { to }),
        ...(wish.bends === undefined ? {} : { bendPoints: wish.bends }),
        ...(container === undefined ? {} : { container }),
        ...(style === undefined ? {} : { style }),
      };
    }
    case 'reset-route': {
      const view = pick(state.views, wish.view);
      const routed = Object.keys(view?.routes ?? {});
      if (view === undefined || routed.length === 0) return undefined;
      return {
        type: 'reset-route',
        view: view.id,
        relations: [...new Set(wish.picks.map((at) => pick(routed, at) as Id))],
      };
    }
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
    case 'reconnect': {
      const relation = pick(relations, wish.relation);
      const target = pick(elements, wish.target);
      if (relation === undefined || target === undefined) return undefined;
      return {
        type: 'batch',
        label: 'Reconnect',
        commands: [
          { type: 'update-relation', id: relation, changes: { to: target } },
          {
            type: 'set-route',
            view: 'overview',
            relation,
            to: { kind: 'border', side: pick(SIDES, wish.side) as (typeof SIDES)[number], at: 0.5 },
          },
        ],
      };
    }
    case 'component-points': {
      const id = pick(['test.service', 'test.box', 'test.table'], wish.component) as Id;
      const list = pick(POINT_LISTS, wish.list);
      return {
        type: 'update-component',
        id,
        changes: { appearance: { connectionPoints: list === undefined ? null : list } },
      };
    }
    case 'element-points': {
      const element = pick(elements, wish.element);
      const list = pick(POINT_LISTS, wish.list);
      return element === undefined
        ? undefined
        : {
            type: 'update-element',
            id: element,
            changes: { appearanceTraits: { connectionPoints: list === undefined ? null : list } },
          };
    }
    case 'retype': {
      const element = pick(elements, wish.element);
      return element === undefined
        ? undefined
        : {
            type: 'update-element',
            id: element,
            changes: { component: pick(COMPONENTS, wish.component) },
          };
    }
    case 'change-container': {
      const view = state.views.find((each) => each.id === 'overview');
      if (view === undefined) return undefined;
      const placements = placementsIn(state, view);
      const chosen = new Map<Id, { element: Id; container?: Id }>();
      for (const at of wish.picks) {
        const shape = pick(placements, at);
        if (shape !== undefined && !chosen.has(shape.element)) chosen.set(shape.element, shape);
      }
      if (chosen.size === 0) return undefined;
      const to = wish.to === null ? undefined : pick(elements, wish.to);
      return {
        type: 'change-container',
        view: view.id,
        ...(to === undefined ? {} : { to }),
        shapes: [...chosen.values()].map((shape) => ({
          element: shape.element,
          ...(shape.container === undefined ? {} : { from: shape.container }),
          at: { x: 40, y: 60 },
        })),
      };
    }
    case 'nesting':
      return {
        type: 'update-view',
        id: 'overview',
        changes: { nestingRelationTypes: wish.nests ? ['test.inside'] : [] },
      };
    case 'collapse':
      return elements.length === 0
        ? undefined
        : {
            type: 'set-collapsed',
            view: 'overview',
            elements: [...new Set(wish.picks.map((at) => pick(elements, at) as Id))],
            collapsed: wish.collapsed,
          };
    case 'create-relation':
      return {
        type: 'create-relation',
        relation: {
          relationType: pick(RELATION_TYPES, wish.type) as Id,
          from: pick(ends, wish.from) as Id,
          to: pick(ends, wish.to) as Id,
        },
      };
    case 'create-element': {
      const container = wish.container === null ? undefined : pick(elements, wish.container);
      return {
        type: 'create-element',
        element: { component: pick(COMPONENTS, wish.component) as Id, name: 'New element' },
        ...(container === undefined
          ? {}
          : { containers: [{ container, relationType: 'test.inside' }] }),
      };
    }
    case 'undo':
    case 'redo':
      return undefined;
  }
}

/** The view files already found valid: a file an action left alone keeps its object. */
const validated = new WeakSet<object>();

/** What every project keeps after any sequence of actions, as far as routes go. */
function expectRoutesKept(state: ProjectSnapshot): void {
  expect(routeWarnings(state)).toEqual([]);
  expect(checkProject(state).errors).toEqual([]);
  const model = modelIndexOf(state);
  const definitions = definitionsIn(state);
  for (const view of state.views) {
    for (const [id, route] of Object.entries(view.routes ?? {})) {
      // No route names a relation that is gone.
      const relation = model.relation(id);
      expect(relation, `the route of "${id}" in "${view.id}"`).toBeDefined();
      if (relation === undefined) continue;
      for (const end of ['from', 'to'] as const) {
        const attachment = route[end];
        if (attachment?.kind !== 'connection-point') continue;
        // Nor a connection point its end does not have.
        const element = model.element(relation[end]);
        expect(element).toBeDefined();
        if (element === undefined) continue;
        const names = appearanceOf(element, definitions).connectionPoints.map((each) => each.name);
        expect(names).toContain(attachment.name);
      }
      // Nor a container that is gone, and a container only beside bend points.
      if (route.container !== undefined) {
        expect(model.element(route.container)).toBeDefined();
        expect(route.bendPoints).toBeDefined();
      }
    }
    if (validated.has(view)) continue;
    expect(validateFile('view', view)).toEqual({ ok: true, value: view });
    validated.add(view);
  }
}

/**
 * A delete takes exactly the routes its preview lists: whole ones with their relations, and only the
 * bend points of those whose container goes; every other route stays as it was.
 */
function expectRoutesDeletedExactly(
  before: ProjectSnapshot,
  after: ProjectSnapshot,
  preview: DeletePreview,
): void {
  for (const view of before.views) {
    const now = after.views.find((each) => each.id === view.id)?.routes ?? {};
    for (const id of Object.keys(now)) expect(Object.hasOwn(view.routes ?? {}, id)).toBe(true);
    for (const [id, route] of Object.entries(view.routes ?? {})) {
      const listed = preview.routes.find((each) => each.view === view.id && each.relation === id);
      const left = Object.hasOwn(now, id) ? now[id] : undefined;
      if (listed === undefined) {
        expect(left).toEqual(route);
      } else if (listed.bendPointsOnly === undefined) {
        expect(left).toBeUndefined();
      } else {
        const kept: RelationRoute = { ...route };
        delete kept.bendPoints;
        delete kept.container;
        expect(left).toEqual(Object.keys(kept).length === 0 ? undefined : kept);
      }
    }
  }
}

describe('routes chosen by hand', () => {
  it('stay true to the model after any sequence of commands, undos and redos, and undo exactly', () => {
    const seen = { routed: 0, reset: 0, settled: 0, deletesWithRoutes: 0, undos: 0 };
    expectRoutesKept(propertyProject());
    fc.assert(
      fc.property(
        fc.array(intent, { minLength: 10, maxLength: 50 }),
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
              expectRoutesKept(state);
              continue;
            }
            const command = commandFor(state, wish);
            if (command === undefined) continue;
            const preview = command.type === 'delete' ? previewDelete(state, command) : undefined;
            const outcome = executeCommand(state, command, { newId });
            if (!outcome.ok) continue;
            const before = state;
            const after = outcome.state;
            expectRoutesKept(after);
            if (preview !== undefined) {
              expectRoutesDeletedExactly(before, after, preview);
              if (preview.routes.length > 0) seen.deletesWithRoutes += 1;
            }
            if (command.type === 'set-route' && outcome.operations.length > 0) seen.routed += 1;
            if (command.type === 'reset-route' && outcome.operations.length > 0) seen.reset += 1;
            const routeCommand = command.type === 'set-route' || command.type === 'reset-route';
            if (
              !routeCommand &&
              command.type !== 'delete' &&
              before.views.some(
                (view, at) =>
                  JSON.stringify(view.routes) !== JSON.stringify(after.views[at]?.routes),
              )
            ) {
              seen.settled += 1;
            }

            const recorded = record(history, {
              label: outcome.label,
              author: 'user',
              operations: outcome.operations,
              inverse: outcome.inverse,
            });
            const undone = undo(after, recorded);
            // Exactly: an empty map, or a key left with an undefined value, would not count as undone.
            expect(undone?.state).toStrictEqual(before);
            expect(redo(undone?.state ?? before, undone?.history ?? recorded)?.state).toEqual(
              after,
            );
            state = after;
            history = recorded;
          }
        },
      ),
      { numRuns: 200 },
    );
    // The sequences must do things, not only be refused.
    expect(seen.routed).toBeGreaterThan(200);
    expect(seen.reset).toBeGreaterThan(100);
    expect(seen.settled).toBeGreaterThan(100);
    expect(seen.deletesWithRoutes).toBeGreaterThan(100);
    expect(seen.undos).toBeGreaterThan(200);
    // Thousands of actions: on a loaded machine this takes longer than a test's default 5 seconds.
  }, 120_000);
});
