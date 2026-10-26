/**
 * Relations routed by hand, per view (ADR 0039): the operations, `set-route` and `reset-route`, the
 * resolver the scene draws from, how routes follow the model, and what checking a project says.
 */
import type {
  Component,
  ConnectionPoint,
  RelationRoute,
  Routes,
  ViewFile,
} from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { checkProject } from './check';
import { executeCommand, type Command, type CommandOutcome } from './commands';
import { applyOperations, type Operation } from './operations';
import { routeOf } from './routes';
import { previewDelete } from './rules';
import type { ProjectSnapshot } from './snapshot';
import { sequentialIds, testProject } from './test/fixtures';

const IN: ConnectionPoint = { name: 'in', side: 'left', at: 0.5 };
const OUT: ConnectionPoint = { name: 'out', side: 'right', at: 0.5 };

/**
 * The test project with connection points on services, a table holding a column that holds a note,
 * relations from the API to the column, from the client to the table, from the API to its own
 * container, from the note in the column to the API, and from the client to World.
 */
function routingProject(): ProjectSnapshot {
  const project = testProject();
  const [own, ...others] = project.packages;
  if (!own) throw new Error('The test project has no package.');
  const table: Component = {
    id: 'test.table',
    name: 'Table',
    derivesFrom: 'test.box',
    appearance: { shape: 'rectangle', contentsAsRows: true, connectionPoints: [IN] },
  };
  const components = own.components.map((component) =>
    component.id === 'test.service'
      ? { ...component, appearance: { ...component.appearance, connectionPoints: [IN, OUT] } }
      : component,
  );
  return {
    ...project,
    packages: [{ ...own, components: [...components, table] }, ...others],
    model: {
      ...project.model,
      elements: [
        ...project.model.elements,
        { id: 'orders', component: 'test.table', name: 'Orders' },
        { id: 'orders-id', component: 'test.box', name: 'id' },
        { id: 'remark', component: 'test.box', name: 'Remark' },
      ],
      relations: [
        ...project.model.relations,
        { id: 'id-in-orders', relationType: 'test.inside', from: 'orders-id', to: 'orders' },
        { id: 'remark-in-id', relationType: 'test.inside', from: 'remark', to: 'orders-id' },
        { id: 'api-writes-id', relationType: 'test.calls', from: 'api', to: 'orders-id' },
        { id: 'api-reports-system', relationType: 'test.governs', from: 'api', to: 'system' },
        { id: 'client-in-world', relationType: 'test.governs', from: 'client', to: 'world' },
        { id: 'remark-on-api', relationType: 'test.governs', from: 'remark', to: 'api' },
        { id: 'client-reads-orders', relationType: 'test.calls', from: 'client', to: 'orders' },
      ],
    },
  };
}

/** The project with a second view, which nests by nothing, so it draws every relation as a line. */
function withFlatView(state: ProjectSnapshot = routingProject()): ProjectSnapshot {
  const flat: ViewFile = {
    id: 'flat',
    name: 'Flat',
    perspective: { name: 'Everything' },
    nestingRelationTypes: [],
    positions: [],
    freeShapes: [],
  };
  return { ...state, views: [...state.views, flat] };
}

function run(state: ProjectSnapshot, command: Command): CommandOutcome {
  return executeCommand(state, command, { newId: sequentialIds() });
}

/** The project after a command that must succeed. */
function after(state: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = run(state, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

/** The codes of the problems a command that must fail is refused with. */
function refusal(state: ProjectSnapshot, command: Command): string[] {
  const outcome = run(state, command);
  if (outcome.ok) throw new Error(`"${command.type}" was not refused.`);
  return outcome.problems.map((each) => each.code);
}

function routesOf(state: ProjectSnapshot, view = 'overview'): Routes | undefined {
  return state.views.find((each) => each.id === view)?.routes;
}

/** Applies a command, then its inverse, and expects the project back exactly. */
function expectUndoneExactly(state: ProjectSnapshot, command: Command): CommandOutcome {
  const outcome = run(state, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
  expect(applyOperations(state, outcome.operations).state).toStrictEqual(outcome.state);
  return outcome;
}

/** The project with routes stored as given in the overview, as a file would hold them. */
function routed(
  routes: Routes,
  state: ProjectSnapshot = routingProject(),
  viewId = 'overview',
): ProjectSnapshot {
  return {
    ...state,
    views: state.views.map((view) => (view.id === viewId ? { ...view, routes } : view)),
  };
}

const viaOut = { kind: 'connection-point', name: 'out' } as const;
const viaIn = { kind: 'connection-point', name: 'in' } as const;
const topQuarter = { kind: 'border', side: 'top', at: 0.25 } as const;

describe('the routes of a view, as operations', () => {
  const route: RelationRoute = { style: 'curved' };

  it('insert, replace and remove one route, and undo each exactly', () => {
    const state = routingProject();
    const collection = { name: 'routes', view: 'overview' } as const;
    const operations: Operation[] = [
      { op: 'insert', collection, index: 0, item: { relation: 'client-calls-api', route } },
      { op: 'insert', collection, index: 1, item: { relation: 'api-reads-db', route } },
      {
        op: 'replace',
        collection,
        item: { relation: 'client-calls-api', route: { style: 'straight' } },
      },
      { op: 'remove', collection, key: 'api-reads-db' },
    ];
    const done = applyOperations(state, operations);
    expect(routesOf(done.state)).toEqual({ 'client-calls-api': { style: 'straight' } });
    expect(applyOperations(done.state, done.inverse).state).toStrictEqual(state);
  });

  it('leave a view without routes with no map at all', () => {
    const state = routed({ 'client-calls-api': route });
    const done = applyOperations(state, [
      { op: 'remove', collection: { name: 'routes', view: 'overview' }, key: 'client-calls-api' },
    ]);
    expect(done.state.views[0]).not.toHaveProperty('routes');
    expect(applyOperations(done.state, done.inverse).state).toStrictEqual(state);
  });

  it('replace them all at once', () => {
    const state = routed({ 'client-calls-api': route });
    const collection = { name: 'routes', view: 'overview' } as const;
    const done = applyOperations(state, [
      { op: 'replace-all', collection, items: [{ relation: 'api-reads-db', route }] },
    ]);
    expect(routesOf(done.state)).toEqual({ 'api-reads-db': route });
    expect(applyOperations(done.state, done.inverse).state).toStrictEqual(state);
  });

  it('are kept by a change to the view itself, whatever its properties carry', () => {
    const state = routed({ 'client-calls-api': route });
    const view = state.views[0] as ViewFile;
    // As a view's properties made from a whole view would, it carries a copy of the routes.
    const properties = {
      id: view.id,
      name: 'Renamed',
      perspective: view.perspective,
      nestingRelationTypes: view.nestingRelationTypes,
      routes: { other: route },
    };
    const done = applyOperations(state, [
      { op: 'set-view', view: 'overview', properties: properties },
    ]);
    expect(done.state.views[0]?.name).toBe('Renamed');
    expect(routesOf(done.state)).toEqual({ 'client-calls-api': route });
    expect(applyOperations(done.state, done.inverse).state).toStrictEqual(state);
  });

  it('are kept when collapsing changes the view', () => {
    const state = routed({ 'client-calls-api': route });
    const done = after(state, {
      type: 'set-collapsed',
      view: 'overview',
      elements: ['system'],
      collapsed: true,
    });
    expect(routesOf(done)).toEqual({ 'client-calls-api': route });
  });
});

describe('set-route', () => {
  it('attaches an end at a place inside its shape, and resolves it there', () => {
    const inside = { kind: 'inside', x: 0.25, y: 0.75 } as const;
    const outcome = expectUndoneExactly(routingProject(), {
      type: 'set-route',
      view: 'overview',
      relation: 'client-calls-api',
      to: inside,
    });
    if (!outcome.ok) return;
    expect(routesOf(outcome.state)).toEqual({ 'client-calls-api': { to: inside } });
    expect(routeOf(outcome.state, 'overview', 'client-calls-api')?.to).toEqual(inside);
    expect(
      refusal(routingProject(), {
        type: 'set-route',
        view: 'overview',
        relation: 'client-calls-api',
        to: { kind: 'inside', x: 1.5, y: 0.5 },
      }),
    ).toEqual(['invalid-command']);
  });

  it('stores only what it names, and says what it did', () => {
    const outcome = expectUndoneExactly(routingProject(), {
      type: 'set-route',
      view: 'overview',
      relation: 'client-calls-api',
      from: viaOut,
    });
    if (!outcome.ok) return;
    expect(routesOf(outcome.state)).toEqual({ 'client-calls-api': { from: viaOut } });
    expect(outcome.label).toBe('Route "Client → API" by hand in "Overview"');
  });

  it('changes only what it names', () => {
    let state = after(routingProject(), {
      type: 'set-route',
      view: 'overview',
      relation: 'client-calls-api',
      from: viaOut,
      bendPoints: [{ x: -40, y: 60 }],
    });
    state = after(state, {
      type: 'set-route',
      view: 'overview',
      relation: 'client-calls-api',
      to: viaIn,
    });
    state = after(state, {
      type: 'set-route',
      view: 'overview',
      relation: 'client-calls-api',
      style: 'straight',
    });
    expect(routesOf(state)).toEqual({
      'client-calls-api': {
        from: viaOut,
        to: viaIn,
        style: 'straight',
        bendPoints: [{ x: -40, y: 60 }],
      },
    });
  });

  it('stores bend points relative to the nearest container that holds both ends', () => {
    const state = after(routingProject(), {
      type: 'set-route',
      view: 'overview',
      relation: 'api-reads-db',
      bendPoints: [{ x: 120, y: 100 }],
    });
    expect(routesOf(state)).toEqual({
      'api-reads-db': { container: 'system', bendPoints: [{ x: 120, y: 100 }] },
    });
    // A relation between a shape and its own container: the container holds both.
    const own = after(state, {
      type: 'set-route',
      view: 'overview',
      relation: 'api-reports-system',
      bendPoints: [{ x: 300, y: 10 }],
    });
    expect(routesOf(own)?.['api-reports-system']).toEqual({
      container: 'system',
      bendPoints: [{ x: 300, y: 10 }],
    });
    // Between World's contents, they are relative to the canvas.
    const outside = after(state, {
      type: 'set-route',
      view: 'overview',
      relation: 'client-calls-api',
      bendPoints: [{ x: -40, y: 60 }],
    });
    expect(routesOf(outside)?.['client-calls-api']).toEqual({ bendPoints: [{ x: -40, y: 60 }] });
  });

  it('takes bend points relative to a container it is given, when that holds both ends', () => {
    const canvas = after(routingProject(), {
      type: 'set-route',
      view: 'overview',
      relation: 'api-reads-db',
      bendPoints: [{ x: 120, y: 100 }],
      container: 'world',
    });
    expect(routesOf(canvas)).toEqual({ 'api-reads-db': { bendPoints: [{ x: 120, y: 100 }] } });
    expect(
      refusal(routingProject(), {
        type: 'set-route',
        view: 'overview',
        relation: 'client-calls-api',
        bendPoints: [{ x: 1, y: 2 }],
        container: 'system',
      }),
    ).toEqual(['unknown-position']);
    expect(
      refusal(routingProject(), {
        type: 'set-route',
        view: 'overview',
        relation: 'api-reads-db',
        container: 'system',
      }),
    ).toEqual(['invalid-command']);
  });

  it('attaches ends automatically again with null, and lets the route go when nothing is left', () => {
    const state = after(routingProject(), {
      type: 'set-route',
      view: 'overview',
      relation: 'client-calls-api',
      from: viaOut,
      to: topQuarter,
    });
    const one = after(state, {
      type: 'set-route',
      view: 'overview',
      relation: 'client-calls-api',
      from: null,
    });
    expect(routesOf(one)).toEqual({ 'client-calls-api': { to: topQuarter } });
    const outcome = expectUndoneExactly(one, {
      type: 'set-route',
      view: 'overview',
      relation: 'client-calls-api',
      to: null,
      bendPoints: null,
    });
    if (!outcome.ok) return;
    expect(outcome.state.views[0]).not.toHaveProperty('routes');
    expect(outcome.label).toBe('Reset the route of "Client → API" in "Overview"');
  });

  it('names a change of style alone by the style, and stores orthogonal as nothing', () => {
    const curved = run(routingProject(), {
      type: 'set-route',
      view: 'overview',
      relation: 'client-calls-api',
      style: 'curved',
    });
    expect(curved.ok && curved.label).toBe('Draw "Client → API" curved in "Overview"');
    if (!curved.ok) return;
    expect(routesOf(curved.state)).toEqual({ 'client-calls-api': { style: 'curved' } });
    const straight = run(curved.state, {
      type: 'set-route',
      view: 'overview',
      relation: 'client-calls-api',
      style: 'straight',
    });
    expect(straight.ok && straight.label).toBe('Draw "Client → API" straight in "Overview"');
    const withEnd = after(curved.state, {
      type: 'set-route',
      view: 'overview',
      relation: 'client-calls-api',
      from: viaOut,
    });
    const orthogonal = run(withEnd, {
      type: 'set-route',
      view: 'overview',
      relation: 'client-calls-api',
      style: 'orthogonal',
    });
    expect(orthogonal.ok && orthogonal.label).toBe('Draw "Client → API" orthogonal in "Overview"');
    expect(orthogonal.ok && routesOf(orthogonal.state)).toEqual({
      'client-calls-api': { from: viaOut },
    });
  });

  it('records nothing when nothing changes', () => {
    const state = after(routingProject(), {
      type: 'set-route',
      view: 'overview',
      relation: 'client-calls-api',
      from: viaOut,
      bendPoints: [{ x: 1, y: 2 }],
    });
    for (const command of [
      { from: viaOut },
      { bendPoints: [{ x: 1, y: 2 }] },
      { style: 'orthogonal' as const },
      { to: null },
    ]) {
      const outcome = run(state, {
        type: 'set-route',
        view: 'overview',
        relation: 'client-calls-api',
        ...command,
      });
      expect(outcome.ok && outcome.operations).toEqual([]);
    }
    const nothing = run(routingProject(), {
      type: 'set-route',
      view: 'overview',
      relation: 'client-calls-api',
      bendPoints: [],
    });
    expect(nothing.ok && nothing.operations).toEqual([]);
  });

  it('refuses what does not fit, with a code for each', () => {
    const state = routingProject();
    const set = (rest: Partial<Extract<Command, { type: 'set-route' }>>) =>
      refusal(state, {
        type: 'set-route',
        view: 'overview',
        relation: 'client-calls-api',
        ...rest,
      });
    expect(set({ view: 'nowhere' })).toEqual(['unknown-view']);
    expect(set({ relation: 'nothing' })).toEqual(['unknown-relation']);
    // The overview nests by "is inside": it draws that relation as containment, not as a line.
    expect(set({ relation: 'api-in-system', style: 'curved' })).toEqual(['not-drawn-as-line']);
    expect(set({ from: { kind: 'connection-point', name: 'side' } })).toEqual([
      'unknown-connection-point',
    ]);
    expect(set({ relation: 'api-reads-db', to: viaIn })).toEqual(['unknown-connection-point']);
    expect(set({ relation: 'contract-governs-call', to: topQuarter })).toEqual([
      'end-does-not-fit',
    ]);
    expect(set({ relation: 'client-in-world', to: topQuarter })).toEqual(['end-does-not-fit']);
    expect(set({ from: { kind: 'border', side: 'middle', at: 0.5 } as never })).toEqual([
      'invalid-command',
    ]);
    expect(set({ from: { kind: 'border', side: 'top', at: 2 } })).toEqual(['invalid-command']);
    expect(set({ from: { kind: 'border', side: 'top', at: Number.NaN } })).toEqual([
      'invalid-command',
    ]);
    expect(set({ from: { kind: 'somewhere' } as never })).toEqual(['invalid-command']);
    expect(set({ bendPoints: [{ x: Number.POSITIVE_INFINITY, y: 0 }] })).toEqual([
      'invalid-command',
    ]);
    expect(set({ bendPoints: Array.from({ length: 65 }, (_, x) => ({ x, y: 0 })) })).toEqual([
      'invalid-command',
    ]);
    expect(set({ style: 'wavy' as never })).toEqual(['invalid-command']);
  });

  it('on a row or a shape that draws rows, attaches only beside it, at the middle', () => {
    const state = after(routingProject(), {
      type: 'set-route',
      view: 'overview',
      relation: 'api-writes-id',
      to: { kind: 'border', side: 'left', at: 0.3 },
    });
    expect(routesOf(state)).toEqual({
      'api-writes-id': { to: { kind: 'border', side: 'left', at: 0.5 } },
    });
    const set = (relation: string, to: unknown) =>
      refusal(routingProject(), {
        type: 'set-route',
        view: 'overview',
        relation,
        to,
      } as Command);
    expect(set('api-writes-id', topQuarter)).toEqual(['end-does-not-fit']);
    expect(set('api-writes-id', viaIn)).toEqual(['end-does-not-fit']);
    // A table's own connection points give way to its header's sides.
    expect(set('client-reads-orders', viaIn)).toEqual(['end-does-not-fit']);
    const header = after(routingProject(), {
      type: 'set-route',
      view: 'overview',
      relation: 'client-reads-orders',
      to: { kind: 'border', side: 'right', at: 0.2 },
    });
    expect(routesOf(header)).toEqual({
      'client-reads-orders': { to: { kind: 'border', side: 'right', at: 0.5 } },
    });
    // What a row holds has no shape of its own: its relations are drawn on the row.
    expect(
      refusal(routingProject(), {
        type: 'set-route',
        view: 'overview',
        relation: 'remark-on-api',
        from: topQuarter,
      }),
    ).toEqual(['end-does-not-fit']);
  });

  it('checks only what it sets, so a route a file left broken can still change', () => {
    const state = routed({
      'client-calls-api': { from: { kind: 'connection-point', name: 'gone' } },
    });
    const done = after(state, {
      type: 'set-route',
      view: 'overview',
      relation: 'client-calls-api',
      style: 'curved',
    });
    expect(routesOf(done)).toEqual({
      'client-calls-api': { from: { kind: 'connection-point', name: 'gone' }, style: 'curved' },
    });
  });
});

describe('reset-route', () => {
  const state = routed({
    'client-calls-api': { from: viaOut },
    'api-reads-db': { style: 'curved' },
    'api-writes-id': { style: 'straight' },
  });

  it('routes one relation automatically again', () => {
    const outcome = expectUndoneExactly(state, {
      type: 'reset-route',
      view: 'overview',
      relations: ['client-calls-api'],
    });
    if (!outcome.ok) return;
    expect(outcome.label).toBe('Reset the route of "Client → API" in "Overview"');
    expect(routesOf(outcome.state)).toEqual({
      'api-reads-db': { style: 'curved' },
      'api-writes-id': { style: 'straight' },
    });
  });

  it('routes several automatically again, leaving those it does not route as they are', () => {
    const outcome = expectUndoneExactly(state, {
      type: 'reset-route',
      view: 'overview',
      relations: ['client-calls-api', 'api-reads-db', 'contract-governs-call'],
    });
    if (!outcome.ok) return;
    expect(outcome.label).toBe('Reset 2 routes in "Overview"');
    expect(routesOf(outcome.state)).toEqual({ 'api-writes-id': { style: 'straight' } });
    const all = after(outcome.state, {
      type: 'reset-route',
      view: 'overview',
      relations: ['api-writes-id'],
    });
    expect(all.views[0]).not.toHaveProperty('routes');
  });

  it('records nothing for relations the view routes automatically already', () => {
    const outcome = run(state, {
      type: 'reset-route',
      view: 'overview',
      relations: ['contract-governs-call'],
    });
    expect(outcome.ok && outcome.operations).toEqual([]);
  });

  it('takes away a route that a file keeps for a relation the model does not have', () => {
    const stale = routed({ gone: { style: 'curved' } });
    expect(
      routesOf(after(stale, { type: 'reset-route', view: 'overview', relations: ['gone'] })),
    ).toBeUndefined();
  });

  it('refuses an empty list, an id given twice, and an id that is no relation', () => {
    const reset = (relations: string[], view = 'overview') =>
      refusal(state, { type: 'reset-route', view, relations });
    expect(reset([])).toEqual(['invalid-command']);
    expect(reset(['api-reads-db', 'api-reads-db'])).toEqual(['invalid-command']);
    expect(reset(['nothing'])).toEqual(['unknown-relation']);
    expect(reset(['api-reads-db'], 'nowhere')).toEqual(['unknown-view']);
  });
});

describe('routeOf', () => {
  it('works out an automatic route and the frame new bend points go in', () => {
    const state = routingProject();
    expect(routeOf(state, 'overview', 'api-reads-db')).toEqual({
      relation: 'api-reads-db',
      from: { kind: 'automatic' },
      to: { kind: 'automatic' },
      style: 'orthogonal',
      bendPoints: [],
      frame: 'system',
      byHand: false,
    });
    expect(routeOf(state, 'overview', 'client-calls-api')?.frame).toBeUndefined();
    expect(routeOf(state, 'overview', 'api-reports-system')?.frame).toBe('system');
    // A relation that ends on a relation sits where that relation's line does: here, in World.
    expect(routeOf(state, 'overview', 'contract-governs-call')?.frame).toBeUndefined();
    // In a view that nests by nothing, everything sits in World.
    expect(routeOf(withFlatView(), 'flat', 'api-reads-db')?.frame).toBeUndefined();
  });

  it('resolves the attachments it keeps', () => {
    const state = routed({
      'client-calls-api': {
        from: viaOut,
        to: topQuarter,
        style: 'curved',
        bendPoints: [{ x: 5, y: 6 }],
      },
    });
    expect(routeOf(state, 'overview', 'client-calls-api')).toEqual({
      relation: 'client-calls-api',
      from: { kind: 'connection-point', name: 'out', side: 'right', at: 0.5 },
      to: { kind: 'border', side: 'top', at: 0.25 },
      style: 'curved',
      bendPoints: [{ x: 5, y: 6 }],
      byHand: true,
    });
  });

  it('attaches automatically what does not fit, and keeps it stored', () => {
    const state = routed({
      'client-calls-api': { from: { kind: 'connection-point', name: 'gone' } },
      'contract-governs-call': { to: topQuarter },
      'api-writes-id': { to: { kind: 'border', side: 'right', at: 0.9 } },
    });
    expect(routeOf(state, 'overview', 'client-calls-api')?.from).toEqual({ kind: 'automatic' });
    expect(routeOf(state, 'overview', 'contract-governs-call')?.to).toEqual({ kind: 'automatic' });
    expect(routeOf(state, 'overview', 'api-writes-id')?.to).toEqual({
      kind: 'border',
      side: 'right',
      at: 0.5,
    });
  });

  it('has nothing for a relation the view draws as containment, or that is not there', () => {
    const state = routingProject();
    expect(routeOf(state, 'overview', 'api-in-system')).toBeUndefined();
    expect(routeOf(state, 'overview', 'nothing')).toBeUndefined();
    expect(routeOf(state, 'nowhere', 'api-reads-db')).toBeUndefined();
    expect(routeOf(withFlatView(), 'flat', 'api-in-system')?.byHand).toBe(false);
  });

  it('ignores bend points while their container no longer holds both ends, and keeps them', () => {
    const state = after(routingProject(), {
      type: 'set-route',
      view: 'overview',
      relation: 'api-reads-db',
      bendPoints: [{ x: 120, y: 100 }],
    });
    const out = after(state, {
      type: 'change-container',
      view: 'overview',
      shapes: [{ element: 'db', from: 'system', at: { x: 500, y: 0 } }],
    });
    expect(routesOf(out)?.['api-reads-db']).toEqual({
      container: 'system',
      bendPoints: [{ x: 120, y: 100 }],
    });
    expect(routeOf(out, 'overview', 'api-reads-db')).toMatchObject({
      bendPoints: [],
      byHand: true,
    });
    expect(routeOf(out, 'overview', 'api-reads-db')?.frame).toBeUndefined();
    const back = after(out, {
      type: 'change-container',
      view: 'overview',
      to: 'system',
      shapes: [{ element: 'db' }],
    });
    expect(routeOf(back, 'overview', 'api-reads-db')).toMatchObject({
      bendPoints: [{ x: 120, y: 100 }],
      bendPointsIn: 'system',
      frame: 'system',
    });
  });

  it('places a relation between the first shapes of elements that sit in several containers', () => {
    // The API also sits inside a zone, which comes after the system in the model's order.
    let state = after(routingProject(), {
      type: 'create-element',
      element: { id: 'zone', component: 'test.box', name: 'Zone' },
    });
    state = after(state, {
      type: 'create-relation',
      relation: { id: 'api-in-zone', relationType: 'test.inside', from: 'api', to: 'zone' },
    });
    // The API's first shape is inside the system, which comes first in the model's order.
    expect(routeOf(state, 'overview', 'api-reads-db')?.frame).toBe('system');
  });

  it('takes the shapes a caller placed, as the scene does, without working them out again', () => {
    const state = routed({
      'api-reads-db': { from: viaOut, container: 'system', bendPoints: [{ x: 1, y: 2 }] },
      'client-calls-api': { to: viaIn },
    });
    // Keys of the scene's first shapes, read as holders: here the DB is drawn in the zone instead.
    const keys: Record<string, string> = {
      system: 'system',
      api: 'system/api',
      db: 'zone/db',
      client: 'client',
      zone: 'zone',
    };
    const elements = new Map(state.model.elements.map((element) => [element.id, element]));
    const relations = new Map(state.model.relations.map((relation) => [relation.id, relation]));
    const shapes = {
      holdersOf: (id: string) => keys[id]?.split('/'),
      lookups: {
        world: state.model.world,
        element: (id: string) => elements.get(id),
        relation: (id: string) => relations.get(id),
      },
    };
    const between = routeOf(state, 'overview', 'api-reads-db', shapes);
    expect(between).toMatchObject({ bendPoints: [], from: { kind: 'connection-point' } });
    expect(between?.frame).toBeUndefined();
    // An element the caller draws no shape for takes no attachment.
    const unplaced = { ...shapes, holdersOf: (id: string) => (id === 'api' ? undefined : [id]) };
    expect(routeOf(state, 'overview', 'client-calls-api', unplaced)?.to).toEqual({
      kind: 'automatic',
    });
  });
});

describe('routes follow the model', () => {
  const bent: RelationRoute = { container: 'system', bendPoints: [{ x: 120, y: 100 }] };

  it('go with a deleted relation, in every view, as the preview lists', () => {
    const state = withFlatView(routed({ 'api-reads-db': { style: 'curved' } }));
    const both = routed({ 'api-reads-db': { style: 'straight' } }, state, 'flat');
    expect(previewDelete(both, { relations: ['api-reads-db'] }).routes).toEqual([
      { view: 'overview', relation: 'api-reads-db' },
      { view: 'flat', relation: 'api-reads-db' },
    ]);
    const outcome = expectUndoneExactly(both, { type: 'delete', relations: ['api-reads-db'] });
    if (!outcome.ok) return;
    expect(outcome.state.views.every((view) => view.routes === undefined)).toBe(true);
  });

  it('go when an end is deleted, with the relations that end on it', () => {
    const state = routed({
      'client-calls-api': { style: 'curved' },
      'contract-governs-call': { style: 'straight' },
      'api-reads-db': { style: 'straight' },
    });
    const outcome = expectUndoneExactly(state, { type: 'delete', elements: ['client'] });
    if (!outcome.ok) return;
    expect(routesOf(outcome.state)).toEqual({ 'api-reads-db': { style: 'straight' } });
  });

  it('lose their bend points when the container they are relative to is deleted', () => {
    const state = routed({
      'api-reads-db': { ...bent, style: 'curved' },
      'api-writes-id': { container: 'system', bendPoints: [{ x: 1, y: 1 }] },
    });
    expect(previewDelete(state, { elements: ['system'] }).routes).toEqual([
      { view: 'overview', relation: 'api-reads-db', bendPointsOnly: true },
      { view: 'overview', relation: 'api-writes-id', bendPointsOnly: true },
    ]);
    const outcome = expectUndoneExactly(state, { type: 'delete', elements: ['system'] });
    if (!outcome.ok) return;
    expect(routesOf(outcome.state)).toEqual({ 'api-reads-db': { style: 'curved' } });
  });

  it('go with the nesting relations a change of container deletes', () => {
    const state = withFlatView();
    const routedFlat = routed({ 'db-in-system': { style: 'curved' } }, state, 'flat');
    const out = after(routedFlat, {
      type: 'change-container',
      view: 'overview',
      shapes: [{ element: 'db', from: 'system', at: { x: 500, y: 0 } }],
    });
    expect(routesOf(out, 'flat')).toBeUndefined();
  });

  it('attach an end that changes automatically again, keeping the rest', () => {
    const state = routed({
      'api-reads-db': { from: viaOut, to: { kind: 'border', side: 'top', at: 0.5 }, ...bent },
    });
    const outcome = expectUndoneExactly(state, {
      type: 'update-relation',
      id: 'api-reads-db',
      changes: { to: 'api' },
    });
    if (!outcome.ok) return;
    // The system still holds both ends, so the bend points stay.
    expect(routesOf(outcome.state)).toEqual({ 'api-reads-db': { from: viaOut, ...bent } });
    const outside = after(state, {
      type: 'update-relation',
      id: 'api-reads-db',
      changes: { to: 'client' },
    });
    expect(routesOf(outside)).toEqual({ 'api-reads-db': { from: viaOut } });
    const both = after(state, {
      type: 'update-relation',
      id: 'api-reads-db',
      changes: { from: 'client', to: 'contract' },
    });
    expect(routesOf(both)).toBeUndefined();
  });

  it('keep the attachment a batch sets after reconnecting an end', () => {
    const state = routed({ 'client-calls-api': { to: viaIn } });
    const done = after(state, {
      type: 'batch',
      label: 'Reconnect "Client → API" to "DB"',
      commands: [
        { type: 'update-relation', id: 'client-calls-api', changes: { to: 'db' } },
        {
          type: 'set-route',
          view: 'overview',
          relation: 'client-calls-api',
          to: topQuarter,
        },
      ],
    });
    expect(routesOf(done)).toEqual({ 'client-calls-api': { to: topQuarter } });
  });

  it('keep the line where it was when the connection point it names goes', () => {
    const state = routed({ 'client-calls-api': { from: viaOut, to: viaIn } });
    // "out" moves under a new name, and "in" goes: the line attaches where each was.
    const outcome = expectUndoneExactly(state, {
      type: 'update-component',
      id: 'test.service',
      changes: {
        appearance: { connectionPoints: [{ name: 'exit', side: 'right', at: 0.5 }] },
      },
    });
    if (!outcome.ok) return;
    expect(routesOf(outcome.state)).toEqual({
      'client-calls-api': {
        from: { kind: 'connection-point', name: 'exit' },
        to: { kind: 'border', side: 'left', at: 0.5 },
      },
    });
  });

  it('keep the line where it was when an element stops having the connection point', () => {
    const state = routed({ 'client-calls-api': { from: viaOut } });
    const own = after(state, {
      type: 'update-element',
      id: 'client',
      changes: { appearanceTraits: { connectionPoints: [] } },
    });
    expect(routesOf(own)).toEqual({
      'client-calls-api': { from: { kind: 'border', side: 'right', at: 0.5 } },
    });
    const other = after(state, {
      type: 'update-element',
      id: 'client',
      changes: { component: 'test.box' },
    });
    expect(routesOf(other)).toEqual({
      'client-calls-api': { from: { kind: 'border', side: 'right', at: 0.5 } },
    });
  });

  it('change nothing else when unrelated things change', () => {
    const state = routed({ 'client-calls-api': { from: viaOut, style: 'curved' } });
    const renamed = after(state, {
      type: 'update-element',
      id: 'client',
      changes: { name: 'Customer' },
    });
    expect(routesOf(renamed)).toBe(routesOf(state));
    const moved = after(state, {
      type: 'set-positions',
      view: 'overview',
      positions: [{ element: 'client', x: -300, y: 40, pinned: true }],
    });
    expect(routesOf(moved)).toBe(routesOf(state));
  });
});

describe('checking a project with routes', () => {
  it('only warns about what a file holds that cannot be drawn', () => {
    const state = routed({
      gone: { style: 'curved' },
      'client-calls-api': { from: { kind: 'connection-point', name: 'side' } },
      'contract-governs-call': { to: topQuarter },
      'api-reads-db': { container: 'nowhere', bendPoints: [{ x: 1, y: 2 }] },
      'api-writes-id': { to: topQuarter },
    });
    const check = checkProject(state);
    expect(check.errors).toEqual([]);
    expect(
      check.warnings
        .filter((each) => each.subjects?.includes('overview'))
        .map((each) => [each.code, each.message]),
    ).toEqual([
      [
        'unknown-relation',
        'The view "Overview" keeps a route for "gone", which is no relation of the model; it is ignored.',
      ],
      [
        'unknown-connection-point',
        'The view "Overview" attaches the start of "Client → API" at the connection point "side", which "Client" does not have; it attaches automatically.',
      ],
      [
        'end-does-not-fit',
        'The view "Overview" attaches the end of "Contract → (Client → API)" by hand, but that end is a relation, whose line it meets in the middle; it attaches automatically.',
      ],
      [
        'unknown-element',
        'The view "Overview" keeps the bend points of "API → DB" relative to "nowhere", which is no element of the model; they are ignored.',
      ],
    ]);
  });

  it('says nothing about a project whose routes all fit', () => {
    const state = routed({ 'client-calls-api': { from: viaOut, to: viaIn, style: 'curved' } });
    expect(
      checkProject(state).warnings.filter((each) => each.subjects?.includes('overview')),
    ).toEqual([]);
  });
});
