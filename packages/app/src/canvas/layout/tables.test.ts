/** Layout of tables (ADR 0023): each table one block, with a port beside each related row. */
import { executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api';
import { describe, expect, it } from 'vitest';
import { VIEW, tablesProject } from '../../test/tables';
import { rowMiddle } from '../rows';
import { buildScene, type ElementShape, type Scene } from '../scene';
import { layoutCommand } from './command';
import { blockGraph, layOut, type ElkEngine } from './engine';
import { layoutInput } from './input';

const elk = new ELK();

/** Three tables with no positions: orders refer to users and products. */
function shop(): ProjectSnapshot {
  return tablesProject({
    tables: [
      {
        id: 'users',
        columns: [
          { id: 'users-id', name: 'id', type: 'uuid', primaryKey: true },
          { id: 'users-email', name: 'email', type: 'text' },
        ],
      },
      {
        id: 'orders',
        columns: [
          { id: 'orders-id', name: 'id', type: 'uuid', primaryKey: true },
          { id: 'orders-user', name: 'user_id', type: 'uuid' },
          { id: 'orders-product', name: 'product_id', type: 'uuid' },
        ],
      },
      {
        id: 'products',
        columns: [{ id: 'products-id', name: 'id', type: 'uuid', primaryKey: true }],
      },
    ],
    references: [
      { id: 'user-fk', from: 'orders-user', to: 'users-id' },
      { id: 'product-fk', from: 'orders-product', to: 'products-id' },
    ],
  });
}

const shapeOf = (scene: Scene, key: string) =>
  scene.shapes.find((shape) => shape.key === key) as ElementShape;

describe('the layout of tables', () => {
  it('moves the tables only: rows are no shapes to place', () => {
    const project = shop();
    const scene = buildScene(project, VIEW);
    const input = layoutInput(scene, project, { kind: 'view' });
    const rows = input?.shapes.filter((shape) => shape.key.includes('/')) ?? [];
    expect(rows.length).toBe(6);
    expect(rows.every((shape) => !shape.free && shape.rowAt !== undefined)).toBe(true);
    const tables = input?.shapes.filter((shape) => !shape.key.includes('/')) ?? [];
    expect(tables.every((shape) => shape.free && shape.headerAt === 16)).toBe(true);
    // The middle of user_id, the second row, from the top of orders.
    const userId = input?.shapes.find((shape) => shape.key === 'orders/orders-user');
    expect(userId?.rowAt).toBe(32 + 24 + 12);
  });

  it('gives each table one block with a port beside each related row, on the side its relation runs', async () => {
    const project = shop();
    const scene = buildScene(project, VIEW);
    const input = layoutInput(scene, project, { kind: 'view' });
    if (!input) throw new Error('Nothing to lay out.');
    const graphs: ElkNode[] = [];
    const watching: ElkEngine = {
      layout: (graph) => {
        graphs.push(...(graph.children ?? []));
        return elk.layout(graph);
      },
    };
    await layOut(input, watching);
    const [world] = graphs;
    const orders = world?.children?.find(
      (node) => input.shapes[Number(node.id.slice(1))]?.key === 'orders',
    );
    // Orders refers to the other two: its related rows leave on its east side, at their middles.
    expect(orders?.layoutOptions?.['elk.portConstraints']).toBe('FIXED_POS');
    expect(orders?.ports?.map((port) => [(port.x ?? 0) + 0, (port.y ?? 0) + 0])).toEqual([
      [240, 68],
      [240, 92],
    ]);
    expect(orders?.children ?? []).toEqual([]);
    const users = world?.children?.find(
      (node) => input.shapes[Number(node.id.slice(1))]?.key === 'users',
    );
    expect(users?.ports?.map((port) => [(port.x ?? 0) + 0, (port.y ?? 0) + 0])).toEqual([[0, 44]]);
  });

  it('writes no row position, and the reference still attaches beside the rows it joins after layout', async () => {
    const project = shop();
    const scene = buildScene(project, VIEW);
    const input = layoutInput(scene, project, { kind: 'view' });
    if (!input) throw new Error('Nothing to lay out.');
    const result = await layOut(input, elk);
    const action = layoutCommand(project, VIEW, scene, { kind: 'view' }, result.shapes);
    const command = action?.command;
    const positions =
      command?.type === 'batch' && command.commands[0]?.type === 'set-positions'
        ? command.commands[0].positions
        : [];
    expect(positions.map((each) => each.element).sort()).toEqual(['orders', 'products', 'users']);
    const outcome = command && executeCommand(project, command);
    if (!outcome?.ok) throw new Error('Refused.');
    const after = buildScene(outcome.state, VIEW);
    const orders = shapeOf(after, 'orders');
    const users = shapeOf(after, 'users');
    const line = after.relations.find((each) => each.relation === 'user-fk');
    const start = line?.route[0];
    const end = line?.route.at(-1);
    expect([orders.rect.x, orders.rect.x + orders.rect.width]).toContain(start?.x);
    expect(start?.y).toBe(rowMiddle(orders.rect, 1));
    expect([users.rect.x, users.rect.x + users.rect.width]).toContain(end?.x);
    expect(end?.y).toBe(rowMiddle(users.rect, 0));
  });
});

describe('blockGraph', () => {
  it('turns a port beside a row around for a relation that closes a cycle', () => {
    const graph = blockGraph(
      'level',
      [0, 1],
      new Map([
        [0, { width: 200, height: 100 }],
        [1, { width: 200, height: 100 }],
      ]),
      () => undefined,
      [
        { u: 0, v: 1, uDirect: false, vDirect: false, uAt: 44, vAt: 68 },
        { u: 1, v: 0, uDirect: false, vDirect: false, uAt: 92, vAt: 44 },
      ],
    );
    const [first, second] = graph.children ?? [];
    // 0 → 1 runs forward: east of 0, west of 1; 1 → 0 closes the cycle: west of 1, east of 0.
    expect(first?.ports?.map((port) => port.id)).toEqual(['s0:east:44']);
    expect(second?.ports?.map((port) => port.id).sort()).toEqual(['s1:west:68', 's1:west:92']);
  });
});
