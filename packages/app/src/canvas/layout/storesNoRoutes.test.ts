/**
 * Layout never stores a route (ADR 0039; M3d, "Fixes from use"). The first real model found routes
 * with bend points in a view's file after `lay_out_view`, `set_positions` and `update_view` with
 * `routeStyle: curved`, as if drawn by hand. This replays that path, the app's layout through ELK in
 * one pass with the routes it keeps for the canvas (ADR 0080), then the commands Claude's
 * `set_positions` and `update_view` send, and checks that none of it writes `routes`; and that a
 * route chosen by hand stays exactly as it was through all of it.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { ShapePosition } from '@visual-anything/schema';
import ELK from 'elkjs/lib/elk.bundled.js';
import { describe, expect, it } from 'vitest';
import { VIEW, tablesProject } from '../../test/tables';
import { buildScene } from '../scene';
import { layoutCommand } from './command';
import { layOut } from './engine';
import { layoutInput } from './input';
import { keepRoutes, withKeptRoutes } from './keptRoutes';

const elk = new ELK();

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
      { id: 'payments', columns: [{ id: 'payments-order', name: 'order_id' }] },
    ],
    references: [
      { id: 'user-fk', from: 'orders-user', to: 'users-id' },
      { id: 'product-fk', from: 'orders-product', to: 'products-id' },
      { id: 'order-fk', from: 'payments', to: 'orders' },
    ],
  });
}

function apply(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const done = executeCommand(project, command);
  if (!done.ok) throw new Error(done.problems.map((each) => each.message).join(' '));
  return done.state;
}

const routesOf = (project: ProjectSnapshot) =>
  project.views.find((view) => view.id === VIEW)?.routes;

/** Lays the view out as Layout and `lay_out_view` do, and gives back what the canvas keeps. */
async function layIt(project: ProjectSnapshot) {
  const scene = buildScene(project, VIEW);
  const input = layoutInput(scene, project, { kind: 'view' });
  if (!input) throw new Error('Nothing to lay out.');
  const result = await layOut(input, elk);
  const action = layoutCommand(project, VIEW, scene, { kind: 'view' }, result.shapes);
  if (!action) throw new Error('Nothing moved.');
  const after = apply(project, action.command);
  const laidOutScene = buildScene(after, VIEW);
  return { command: action.command, project: after, kept: keepRoutes(laidOutScene, result.routes) };
}

/** The command Claude's set_positions sends: places, unpinned. */
function claudesPositions(positions: Omit<ShapePosition, 'pinned'>[]): Command {
  return {
    type: 'set-positions',
    view: VIEW,
    positions: positions.map((position) => ({ pinned: false, ...position })),
  };
}

/** Every command a command holds, batches opened. */
function flat(command: Command): Command[] {
  return command.type === 'batch' ? command.commands.flatMap(flat) : [command];
}

describe('layout and moves store no route', () => {
  it('lay_out_view, then set_positions, then a curved routeStyle, write no routes', async () => {
    const { command, project, kept } = await layIt(shop());
    // The layout sends only places: no set-route, even with ELK's routes kept for the canvas.
    expect(flat(command).map((each) => each.type)).toEqual(['set-positions']);
    expect(kept?.routes.size ?? 0).toBeGreaterThan(0);
    expect(routesOf(project)).toBeUndefined();

    const moved = apply(
      project,
      claudesPositions([
        { element: 'users', x: 0, y: 30 },
        { element: 'orders', x: 420, y: 0 },
        { element: 'products', x: 820, y: 0 },
        { element: 'payments', x: 420, y: 400 },
      ]),
    );
    expect(routesOf(moved)).toBeUndefined();
    // The canvas lets go of ELK's routes whose ends moved, and draws its own.
    const scene = buildScene(moved, VIEW);
    expect(withKeptRoutes(scene, kept)).toBe(scene);

    const curved = apply(moved, {
      type: 'update-view',
      id: VIEW,
      changes: { routeStyle: 'curved' },
    });
    expect(routesOf(curved)).toBeUndefined();
    const lines = buildScene(curved, VIEW).relations.filter((line) => line.relation !== undefined);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.hand, line.relation).toBeUndefined();
  });

  it('keeps a route chosen by hand as it was, through a layout, a move of its ends and a style', async () => {
    const hand = {
      bendPoints: [
        { x: 184, y: 82 },
        { x: 184, y: 648 },
      ],
    };
    const drawn = apply(shop(), { type: 'set-route', view: VIEW, relation: 'order-fk', ...hand });
    const { project } = await layIt(drawn);
    expect(routesOf(project)).toEqual({ 'order-fk': hand });
    const moved = apply(project, claudesPositions([{ element: 'payments', x: 40, y: 900 }]));
    expect(routesOf(moved)).toEqual({ 'order-fk': hand });
    const curved = apply(moved, {
      type: 'update-view',
      id: VIEW,
      changes: { routeStyle: 'curved' },
    });
    expect(routesOf(curved)).toEqual({ 'order-fk': hand });
  });
});
