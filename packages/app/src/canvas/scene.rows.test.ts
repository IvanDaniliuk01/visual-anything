import type { ProjectSnapshot } from '@visual-anything/core';
import type { Element, PackageFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { VIEW, tablesProject, usersAndOrders } from '../test/tables';
import { HEADER_DETAIL_SIZE, HEADER_NAME_SIZE, estimateWidth, headerRoom } from './fit';
import {
  ROWS_HEADER,
  ROW_HEIGHT,
  collapsedRowsHeight,
  headerMiddle,
  measureRows,
  rowMiddle,
} from './rows';
import { buildScene, buildSceneAfresh, type ElementShape, type Scene } from './scene';
import { shapeSignature } from './tiles';

function shapeOf(scene: Scene, element: string): ElementShape {
  const found = scene.shapes.filter((shape) => shape.element === element);
  if (found.length !== 1) throw new Error(`Expected one shape of ${element}, got ${found.length}.`);
  return found[0] as ElementShape;
}

function withView(project: ProjectSnapshot, changes: Partial<ProjectSnapshot['views'][0]>) {
  return { ...project, views: project.views.map((view) => ({ ...view, ...changes })) };
}

describe('a shape that draws its contents as rows', () => {
  const project = usersAndOrders();
  const scene = buildScene(project, VIEW);

  it('stacks its rows under its header in the model’s order, as wide as itself', () => {
    const users = shapeOf(scene, 'users');
    const rows = ['users-id', 'users-email', 'users-name'].map((id) => shapeOf(scene, id));
    rows.forEach((row, index) => {
      expect(row.row).toBe(index);
      expect(row.containerShape).toBe(users.key);
      expect(row.rect).toEqual({
        x: users.rect.x,
        y: users.rect.y + ROWS_HEADER + index * ROW_HEIGHT,
        width: users.rect.width,
        height: ROW_HEIGHT,
      });
      expect(row.positioned).toBe('placed');
      expect(row.kind).toBe('rectangle');
      expect(row.holdsContents).toBe(false);
    });
    expect(users.rowCount).toBe(3);
    expect(users.holdsContents).toBe(true);
    expect(users.rect.height).toBe(measureRows(240, 3).height);
  });

  it('comes after its container in scene order, so that pointing finds the row', () => {
    const keys = scene.shapes.map((shape) => shape.key);
    expect(keys.indexOf('users')).toBeLessThan(keys.indexOf('users/users-id'));
  });

  it('follows the model’s order when it changes', () => {
    const elements = [...project.model.elements];
    const name = elements.findIndex((element) => element.id === 'users-name');
    const [moved] = elements.splice(name, 1);
    elements.splice(
      elements.findIndex((element) => element.id === 'users-id'),
      0,
      moved as Element,
    );
    const reordered = buildScene({ ...project, model: { ...project.model, elements } }, VIEW);
    expect(shapeOf(reordered, 'users-name').row).toBe(0);
    expect(shapeOf(reordered, 'users-id').row).toBe(1);
  });

  it('ignores the positions stored for its rows, and its stored height', () => {
    const stored = withView(project, {
      positions: [
        ...(project.views[0]?.positions ?? []).map((position) =>
          position.element === 'users' ? { ...position, width: 300, height: 900 } : position,
        ),
        { element: 'users-email', container: 'users', x: 500, y: 500 },
      ],
    });
    const drawn = buildScene(stored, VIEW);
    const users = shapeOf(drawn, 'users');
    expect(users.rect.width).toBe(300);
    expect(users.rect.height).toBe(measureRows(300, 3).height);
    expect(shapeOf(drawn, 'users-email').rect.y).toBe(users.rect.y + ROWS_HEADER + ROW_HEIGHT);
  });

  it('keeps one empty row when it holds nothing', () => {
    const empty = buildScene(tablesProject({ tables: [{ id: 'empty', columns: [] }] }), VIEW);
    const table = shapeOf(empty, 'empty');
    expect(table.rowCount).toBe(0);
    expect(table.holdsContents).toBe(false);
    expect(table.rect.height).toBe(measureRows(240, 1).height);
  });

  it('draws rows only in a rectangle or a rounded rectangle', () => {
    const odd: PackageFile = {
      id: 'odd',
      name: 'Odd',
      relationTypes: [],
      components: [
        {
          id: 'odd.round',
          name: 'Round table',
          derivesFrom: 'data-modeling.table',
          appearance: { shape: 'ellipse' },
        },
        {
          id: 'odd.soft',
          name: 'Soft table',
          derivesFrom: 'data-modeling.table',
          appearance: { shape: 'rounded-rectangle' },
        },
      ],
    };
    const base = tablesProject({ tables: [], packages: [odd] });
    const shaped = {
      ...base,
      model: {
        ...base.model,
        elements: [
          { id: 'round', component: 'odd.round', name: 'round' },
          { id: 'soft', component: 'odd.soft', name: 'soft' },
        ],
      },
    };
    const drawn = buildScene(shaped, VIEW);
    expect(shapeOf(drawn, 'round').kind).toBe('rectangle');
    expect(shapeOf(drawn, 'soft').kind).toBe('rounded-rectangle');
  });

  it('fits its rows’ names and details, and its own, to one line', () => {
    const id = shapeOf(scene, 'users-id');
    expect(id.detail).toBe('uuid · PK');
    expect(id.fitted).toEqual({ name: 'id', detail: 'uuid · PK' });
    const user = shapeOf(scene, 'orders-user');
    expect(user.detail).toBe('uuid · FK');
    const users = shapeOf(scene, 'users');
    expect(users.fitted).toEqual({ name: 'users', detail: '' });
  });

  it('never lets a long header name run into its detail', () => {
    const long = tablesProject({
      tables: [
        {
          id: 'a_table_with_a_name_far_too_long_to_fit_in_its_header',
          columns: [{ id: 'c', type: 'int' }],
        },
      ],
    });
    const table = shapeOf(
      buildScene(long, VIEW),
      'a_table_with_a_name_far_too_long_to_fit_in_its_header',
    );
    const fitted = table.fitted as { name: string; detail: string };
    expect(fitted.name.endsWith('…')).toBe(true);
    expect(estimateWidth(fitted.name, HEADER_NAME_SIZE, true)).toBeLessThanOrEqual(
      headerRoom(table.rect.width, { toggle: true }),
    );
    expect(estimateWidth(fitted.detail, HEADER_DETAIL_SIZE)).toBe(0);
  });
});

describe('what a row holds', () => {
  // A database whose shape draws its tables as rows: the tables' columns are not drawn.
  const db: PackageFile = {
    id: 'db',
    name: 'DB',
    relationTypes: [],
    components: [
      {
        id: 'db.schema-list',
        name: 'Database',
        derivesFrom: 'essence',
        appearance: { contentsAsRows: true, width: 260 },
      },
    ],
  };
  const project = tablesProject({
    packages: [db],
    elements: [{ id: 'shop', component: 'db.schema-list', name: 'shop' }],
    positions: [{ element: 'shop', x: 0, y: 0 }],
    tables: [
      { id: 'users', in: 'shop', columns: [{ id: 'users-id', name: 'id' }] },
      { id: 'orders', in: 'shop', columns: [{ id: 'orders-user', name: 'user_id' }] },
    ],
    references: [{ id: 'fk', from: 'orders-user', to: 'users-id' }],
  });
  const scene = buildScene(project, VIEW);

  it('is listed on the row and not drawn', () => {
    const users = shapeOf(scene, 'users');
    expect(users.row).toBe(0);
    expect(users.undrawn).toEqual(['users-id']);
    expect(scene.shapes.some((shape) => shape.element === 'users-id')).toBe(false);
  });

  it('keeps its relations, aggregated between the rows that hold their ends', () => {
    const [line] = scene.relations;
    expect(scene.relations).toHaveLength(1);
    expect(line?.aggregate?.relations).toEqual(['fk']);
    expect(line?.ends?.from).toEqual({ kind: 'shape', key: 'shop/orders' });
    expect(line?.ends?.to).toEqual({ kind: 'shape', key: 'shop/users' });
    // Both rows of one shape: a C on the right, beside each row.
    const shop = shapeOf(scene, 'shop');
    const right = shop.rect.x + shop.rect.width;
    expect(line?.route[0]).toEqual({ x: right, y: rowMiddle(shop.rect, 1) });
    expect(line?.route.at(-1)).toEqual({ x: right, y: rowMiddle(shop.rect, 0) });
  });
});

describe('relations that end on rows', () => {
  const scene = buildScene(usersAndOrders(), VIEW);
  const users = shapeOf(scene, 'users');
  const orders = shapeOf(scene, 'orders');
  const [fk] = scene.relations;

  it('attach beside the rows they join', () => {
    expect(fk?.relation).toBe('orders-user-fk');
    // orders sits right of users: the key leaves orders on its left, beside user_id, and enters
    // users on its right, beside id.
    expect(fk?.route[0]).toEqual({ x: orders.rect.x, y: rowMiddle(orders.rect, 1) });
    expect(fk?.route.at(-1)).toEqual({
      x: users.rect.x + users.rect.width,
      y: rowMiddle(users.rect, 0),
    });
    expect(fk?.ends).toEqual({
      from: { kind: 'shape', key: 'orders/orders-user' },
      to: { kind: 'shape', key: 'users/users-id' },
      offset: 0,
    });
  });

  it('attach beside the header when they end on the table', () => {
    const project = usersAndOrders({
      references: [{ id: 'to-table', from: 'orders-user', to: 'users' }],
    });
    const drawn = buildScene(project, VIEW);
    const line = drawn.relations.find((each) => each.relation === 'to-table');
    expect(line?.route.at(-1)).toEqual({
      x: users.rect.x + users.rect.width,
      y: headerMiddle(users.rect),
    });
  });

  it('attach beside the header of a collapsed table, aggregated there', () => {
    const collapsed = buildScene(usersAndOrders({ collapsed: ['users'] }), VIEW);
    const table = shapeOf(collapsed, 'users');
    expect(table.collapsed).toMatchObject({ contents: 3 });
    expect(table.rowCount).toBe(0);
    expect(table.rect.height).toBe(collapsedRowsHeight());
    expect(table.fitted?.detail).toBe('3 × Column');
    const [line] = collapsed.relations;
    expect(line?.aggregate?.relations).toEqual(['orders-user-fk']);
    expect(line?.route.at(-1)).toEqual({
      x: table.rect.x + table.rect.width,
      y: headerMiddle(table.rect),
    });
  });

  it('turn the FK badge on and off as a reference is made and deleted, and the row’s drawing with it', () => {
    const start = usersAndOrders({ references: [] });
    const before = shapeOf(buildScene(start, VIEW), 'orders-user');
    expect(before.detail).toBe('uuid');
    const related = {
      ...start,
      model: {
        ...start.model,
        relations: [
          ...start.model.relations,
          {
            id: 'fk',
            relationType: 'data-modeling.references',
            from: 'orders-user',
            to: 'users-id',
          },
        ],
      },
    };
    const after = shapeOf(buildScene(related, VIEW), 'orders-user');
    expect(after.detail).toBe('uuid · FK');
    expect(shapeSignature(after)).not.toBe(shapeSignature(before));
    const again = shapeOf(buildScene(start, VIEW), 'orders-user');
    expect(again.detail).toBe('uuid');
    expect(shapeSignature(again)).not.toBe(shapeSignature(after));
  });

  it('take a lane of their own for each row on one side', () => {
    const project = usersAndOrders({
      references: [
        { id: 'one', from: 'orders-user', to: 'users-id' },
        { id: 'two', from: 'orders-total', to: 'users-email' },
      ],
    });
    const drawn = buildScene(project, VIEW);
    const [one, two] = ['one', 'two'].map((id) =>
      drawn.relations.find((line) => line.relation === id),
    );
    // Facing stubs join in a Z through the middle of the gap, so each keeps its own vertical run.
    expect(one?.route).toHaveLength(4);
    expect(two?.route).toHaveLength(4);
    expect(one?.route[1]?.x).toBe(two?.route[1]?.x);
    expect(one?.route[1]?.y).not.toBe(two?.route[1]?.y);
  });
});

describe('a scene with tables built after a change', () => {
  it('equals one built from nothing after moving, renaming and relating rows', () => {
    let project = usersAndOrders();
    buildScene(project, VIEW);
    const steps: ((now: ProjectSnapshot) => ProjectSnapshot)[] = [
      // Move a table.
      (now) =>
        withView(now, {
          positions: (now.views[0]?.positions ?? []).map((position) =>
            position.element === 'orders' ? { ...position, x: -600, y: 40 } : position,
          ),
        }),
      // Rename a column.
      (now) => ({
        ...now,
        model: {
          ...now.model,
          elements: now.model.elements.map((element) =>
            element.id === 'users-email' ? { ...element, name: 'email_address' } : element,
          ),
        },
      }),
      // Collapse a table, then expand it.
      (now) => withView(now, { collapsed: ['orders'] }),
      (now) => withView(now, { collapsed: [] }),
      // Move the other table over the first.
      (now) =>
        withView(now, {
          positions: (now.views[0]?.positions ?? []).map((position) =>
            position.element === 'users' ? { ...position, x: -620, y: 400 } : position,
          ),
        }),
    ];
    for (const step of steps) {
      project = step(project);
      expect(buildScene(project, VIEW)).toEqual(buildSceneAfresh(project, VIEW));
    }
  });
});
