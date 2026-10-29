/** ELK's routes kept right after a layout in one pass, until what they pass moves (ADR 0080). */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import ELK from 'elkjs/lib/elk.bundled.js';
import { describe, expect, it } from 'vitest';
import { VIEW, tablesProject } from '../../test/tables';
import { buildScene, type Scene } from '../scene';
import { layoutCommand } from './command';
import { layOut } from './engine';
import { layoutInput } from './input';
import { keepRoutes, withKeptRoutes } from './keptRoutes';

const elk = new ELK();

/** Orders refer to users and products; a note-like table, audit, stands far off on its own. */
function shop(): ProjectSnapshot {
  return tablesProject({
    tables: [
      { id: 'users', columns: [{ id: 'users-id', name: 'id', primaryKey: true }] },
      {
        id: 'orders',
        columns: [
          { id: 'orders-id', name: 'id', primaryKey: true },
          { id: 'orders-user', name: 'user_id' },
          { id: 'orders-product', name: 'product_id' },
        ],
      },
      { id: 'products', columns: [{ id: 'products-id', name: 'id', primaryKey: true }] },
      { id: 'audit', columns: [{ id: 'audit-id', name: 'id' }] },
    ],
    references: [
      { id: 'user-fk', from: 'orders-user', to: 'users-id' },
      { id: 'product-fk', from: 'orders-product', to: 'products-id' },
    ],
  });
}

function apply(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const done = executeCommand(project, command);
  if (!done.ok) throw new Error(done.problems.map((each) => each.message).join(' '));
  return done.state;
}

async function laidOut() {
  const project = shop();
  const scene = buildScene(project, VIEW);
  const input = layoutInput(scene, project, { kind: 'view' });
  if (!input) throw new Error('Nothing to lay out.');
  const result = await layOut(input, elk);
  const action = layoutCommand(project, VIEW, scene, { kind: 'view' }, result.shapes);
  if (!action) throw new Error('Nothing moved.');
  const after = apply(project, action.command);
  return { project: after, scene: buildScene(after, VIEW), routes: result.routes };
}

function routeOf(scene: Scene, relation: string) {
  return scene.relations.find((line) => line.relation === relation)?.route;
}

/** Moves a table by a step to the right, as a drag would. */
function moved(project: ProjectSnapshot, element: string, dx: number): ProjectSnapshot {
  const scene = buildScene(project, VIEW);
  const shape = scene.shapes.find((each) => each.element === element);
  if (!shape) throw new Error(`No ${element}.`);
  return apply(project, {
    type: 'set-positions',
    view: VIEW,
    positions: [{ element, x: shape.offset.x + dx, y: shape.offset.y }],
  });
}

describe('kept routes', () => {
  it('draws the lines along the routes ELK gave right after a layout', async () => {
    const { scene, routes } = await laidOut();
    const kept = keepRoutes(scene, routes);
    expect([...(kept?.routes.keys() ?? [])].sort()).toEqual(['product-fk', 'user-fk']);
    const drawn = withKeptRoutes(scene, kept);
    for (const relation of ['user-fk', 'product-fk']) {
      expect(routeOf(drawn, relation)).toEqual(kept?.routes.get(relation));
    }
    // The same scene again draws the same lines, the same objects.
    expect(withKeptRoutes(scene, kept)).toBe(drawn);
  });

  it('lets a line go back to its own route once one of its ends moves, and keeps the others', async () => {
    const { project, scene, routes } = await laidOut();
    const kept = keepRoutes(scene, routes);
    const after = buildScene(moved(project, 'users', 400), VIEW);
    const drawn = withKeptRoutes(after, kept);
    expect(routeOf(drawn, 'user-fk')).toEqual(routeOf(after, 'user-fk'));
    expect(routeOf(drawn, 'user-fk')).not.toEqual(kept?.routes.get('user-fk'));
    expect(routeOf(drawn, 'product-fk')).toEqual(kept?.routes.get('product-fk'));
  });

  it('keeps a route when a shape far from it moves', async () => {
    const { project, scene, routes } = await laidOut();
    const kept = keepRoutes(scene, routes);
    const audit = scene.shapes.find((each) => each.element === 'audit');
    const route = kept?.routes.get('user-fk') ?? [];
    const right = Math.max(
      ...route.map((point) => point.x),
      ...scene.shapes.map((each) => each.rect.x + each.rect.width),
    );
    // Away from every route, beyond everything.
    const after = buildScene(moved(project, 'audit', right + 400 - (audit?.rect.x ?? 0)), VIEW);
    const drawn = withKeptRoutes(after, kept);
    expect(routeOf(drawn, 'user-fk')).toEqual(kept?.routes.get('user-fk'));
  });

  it('keeps no route whose end does not lie where the scene draws it', async () => {
    const { scene, routes } = await laidOut();
    const shifted = (routes ?? []).map((route) => ({
      ...route,
      points: route.points.map((point) => ({ x: point.x + 40, y: point.y })),
    }));
    expect(keepRoutes(scene, shifted)).toBeUndefined();
  });
});
