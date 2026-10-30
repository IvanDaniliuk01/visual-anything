/**
 * A route by hand follows its ends, on the canvas (ADR 0039's clarification of 2026-10-30, M3c
 * Stage 1): the user's sequence from their first real model, a view whose scope left out the schema,
 * a route by hand relative to the canvas, Claude's `set_positions` moving both its ends, then
 * `routeStyle: curved`, now draws a curve near its ends rather than a huge one through where they were.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { VIEW, tablesProject } from '../../test/tables';
import type { Rect } from '../geometry';
import { buildScene, type ElementShape, type Scene } from '../scene';

function run(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const done = executeCommand(project, command);
  if (!done.ok) throw new Error(done.problems.map((each) => each.message).join(' '));
  return done.state;
}

/** Users and orders in a schema, the orders referring to the users. */
function inSchema(): ProjectSnapshot {
  return tablesProject({
    elements: [{ id: 'sales', component: 'systems.box', name: 'sales' }],
    positions: [{ element: 'sales', x: 0, y: 0 }],
    tables: [
      {
        id: 'users',
        in: 'sales',
        at: { x: 24, y: 64 },
        columns: [{ id: 'users-id', name: 'id', primaryKey: true }],
      },
      {
        id: 'orders',
        in: 'sales',
        at: { x: 424, y: 264 },
        columns: [
          { id: 'orders-id', name: 'id', primaryKey: true },
          { id: 'orders-user', name: 'user_id' },
        ],
      },
    ],
    references: [{ id: 'user-fk', from: 'orders-user', to: 'users-id' }],
  });
}

function shapeOf(scene: Scene, element: string): ElementShape {
  const found = scene.shapes.find((shape) => shape.element === element);
  if (!found) throw new Error(`No shape for ${element}`);
  return found;
}

function boundsOf(points: readonly { x: number; y: number }[]): Rect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function grown(rect: Rect, by: number): Rect {
  return {
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + 2 * by,
    height: rect.height + 2 * by,
  };
}

function within(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

describe('a route by hand follows its ends on the canvas', () => {
  it('draws no huge curve after a scope change, set_positions moving both ends, and a curved style', () => {
    // The scope leaves the schema out: the tables sit in World, and a layout stores their places.
    let project = run(inSchema(), { type: 'set-scope', view: VIEW, scope: { leftOut: ['sales'] } });
    project = run(project, {
      type: 'set-positions',
      view: VIEW,
      positions: [
        { element: 'users', x: 0, y: 0, pinned: false },
        { element: 'orders', x: 400, y: 200, pinned: false },
      ],
    });
    // The person drags a segment: the corners near it become bend points, relative to the canvas.
    const line = buildScene(project, VIEW).relations.find((each) => each.relation === 'user-fk');
    if (!line) throw new Error('No line.');
    const middle = { x: 300, y: 0 };
    project = run(project, {
      type: 'set-route',
      view: VIEW,
      relation: 'user-fk',
      bendPoints: [
        { x: middle.x, y: line.from.y },
        { x: middle.x, y: line.to.y },
      ],
    });
    // Claude moves both tables 2,000 units right and 1,500 down.
    project = run(project, {
      type: 'set-positions',
      view: VIEW,
      positions: [
        { element: 'users', x: 2000, y: 1500, pinned: false },
        { element: 'orders', x: 2400, y: 1700, pinned: false },
      ],
    });
    project = run(project, { type: 'update-view', id: VIEW, changes: { routeStyle: 'curved' } });
    const scene = buildScene(project, VIEW);
    const drawn = scene.relations.find((each) => each.relation === 'user-fk');
    expect(drawn?.curve).toBeDefined();
    const users = shapeOf(scene, 'users').rect;
    const orders = shapeOf(scene, 'orders').rect;
    const around = grown(boundsOf([users, orders].flatMap((rect) => corners(rect))), 120);
    expect(within(boundsOf(drawn?.route ?? []), around)).toBe(true);
  });
});

function corners(rect: Rect) {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
  ];
}
