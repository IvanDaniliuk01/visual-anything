/**
 * Dropping shapes onto a shape that draws rows (ADR 0023): an element whose component can be one of
 * its rows becomes one, at the place it is dropped, as one action; anything else is refused, and the
 * caption says why.
 */
import {
  contentsInView,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { PackageFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { selectionOf, type Selection } from '../editor/selection';
import { VIEW, tablesProject, usersAndOrders } from '../test/tables';
import {
  dropAimAt,
  dropCaption,
  dropCommand,
  dropOverlay,
  landingCover,
  planDrop,
  type DropAim,
} from './drop';
import { indexScene, type IndexedScene } from './hit';
import { rowNestingFor, rowNestingForAdd } from './rowDrop';
import { buildScene, type ElementShape } from './scene';

function after(project: ProjectSnapshot, command: Command | undefined): ProjectSnapshot {
  if (!command) throw new Error('There is no command.');
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
  return outcome.state;
}

/** Users and orders, with a column that sits loose in World and a service beside them. */
function withLoose(nesting?: string[]): ProjectSnapshot {
  return usersAndOrders({
    elements: [
      { id: 'loose', component: 'data-modeling.column', name: 'phone' },
      { id: 'mailer', component: 'systems.service', name: 'Mailer' },
    ],
    positions: [
      { element: 'loose', x: 800, y: 0 },
      { element: 'mailer', x: 800, y: 300 },
    ],
    ...(nesting ? { nesting } : {}),
  });
}

function shapeOf(indexed: IndexedScene, key: string): ElementShape {
  const found = indexed.byKey.get(key);
  if (!found) throw new Error(`No shape ${key}`);
  return found;
}

function elements(...ids: string[]): Selection {
  return selectionOf(ids.map((id) => ({ kind: 'element' as const, id })));
}

/** What dragging an element's shape and letting it go at a point would do. */
function dropAt(project: ProjectSnapshot, grabbed: string, point: { x: number; y: number }) {
  const indexed = indexScene(buildScene(project, VIEW));
  const selection = elements(grabbed);
  const shape = shapeOf(indexed, grabbed);
  const plan = planDrop(indexed, project, VIEW, selection, shape);
  if (!plan) throw new Error('The drag only moves.');
  const delta = { x: point.x - shape.rect.x, y: point.y - shape.rect.y };
  const aim = dropAimAt(indexed, plan, point, delta, undefined, () => false);
  return {
    aim,
    plan,
    caption: dropCaption(project, plan, aim, landingCover(indexed, plan, aim, delta)),
    drop: dropCommand(indexed, project, VIEW, selection, plan, aim, delta),
  };
}

const rowsOf = (project: ProjectSnapshot, table: string) => {
  const view = project.views.find((each) => each.id === VIEW);
  if (!view) throw new Error('No view.');
  return contentsInView(project, view, table);
};

describe('rowNestingFor', () => {
  it('holds a column in a table through "is column of"', () => {
    const project = withLoose();
    expect(rowNestingFor(project, VIEW, 'data-modeling.column', 'users')).toEqual({
      relationType: 'data-modeling.is-column-of',
      addToView: false,
    });
  });

  it('holds nothing else in a table, though "is part of" sets no limits, and says why', () => {
    const project = withLoose();
    expect(rowNestingFor(project, VIEW, 'systems.service', 'users')).toEqual({
      reason: 'Only a Column can be a row of "users", through "is column of"',
    });
  });

  it('holds anything that a nesting relation type accepts in a shape of one’s own that draws rows', () => {
    const queues: PackageFile = {
      id: 'queues',
      name: 'Queues',
      components: [
        {
          id: 'queues.queue',
          name: 'Queue',
          derivesFrom: 'essence',
          appearance: { contentsAsRows: true },
        },
      ],
      relationTypes: [],
    };
    const project = tablesProject({
      tables: [],
      elements: [{ id: 'jobs', component: 'queues.queue', name: 'Jobs' }],
      packages: [queues],
    });
    expect(rowNestingFor(project, VIEW, 'systems.service', 'jobs')).toEqual({
      relationType: 'systems.is-part-of',
      addToView: false,
    });
  });
});

describe('dropping a shape onto a table', () => {
  it('aims at the table under a row, at the place among its rows the pointer is at', () => {
    const project = withLoose();
    const slot = (y: number) => {
      const { aim } = dropAt(project, 'loose', { x: 100, y });
      return aim.kind === 'into' ? aim.rows : undefined;
    };
    // The header, the upper half of the email row, its lower half, and the room under the rows.
    expect(slot(10)).toMatchObject({ at: 0, before: 'users-id' });
    expect(slot(60)).toMatchObject({ at: 1, before: 'users-email' });
    expect(slot(76)).toMatchObject({ at: 2, before: 'users-name' });
    expect(slot(105)).toEqual(expect.objectContaining({ at: 3 }));
    expect(slot(105)?.before).toBeUndefined();
    const { aim, plan } = dropAt(project, 'loose', { x: 100, y: 60 });
    expect(aim.kind === 'into' && aim.target.key).toBe('users');
    // A bar across the table, on the line between id and email.
    const indexed = indexScene(buildScene(project, VIEW));
    expect(dropOverlay(indexed, plan, aim)?.slot).toEqual({ x: 2, y: 56, width: 236, height: 0 });
  });

  it('makes the column a row there, as one action, with no position of its own', () => {
    const project = withLoose();
    const { drop, caption } = dropAt(project, 'loose', { x: 100, y: 60 });
    expect(caption).toEqual({
      text: 'Make it a row of "users"',
      detail: 'Before "email" · is column of · Alt: move only',
    });
    expect(drop?.label).toBe('Put "phone" inside "users"');
    const next = after(project, drop?.command);
    expect(rowsOf(next, 'users')).toEqual(['users-id', 'loose', 'users-email', 'users-name']);
    const view = next.views.find((each) => each.id === VIEW);
    expect(view?.positions.filter((position) => position.element === 'loose')).toEqual([
      { element: 'loose', x: 800, y: 0 },
    ]);
    expect(view?.stackingOrder).toBeUndefined();
    expect(
      next.model.relations
        .filter((relation) => relation.from === 'loose')
        .map((r) => r.relationType),
    ).toEqual(['data-modeling.is-column-of']);
  });

  it('puts it last when it is dropped under the rows', () => {
    const project = withLoose();
    const { drop, caption } = dropAt(project, 'loose', { x: 100, y: 105 });
    expect(caption?.detail).toBe('After its last row · is column of · Alt: move only');
    const next = after(project, drop?.command);
    expect(rowsOf(next, 'users')).toEqual(['users-id', 'users-email', 'users-name', 'loose']);
    // Rows keep the model's order: no stacking list is written for them.
    expect(next.views[0]?.stackingOrder).toBeUndefined();
  });

  it('takes it out of the container it sat in, as a change of container does', () => {
    const project = usersAndOrders({
      elements: [
        { id: 'drafts', component: 'systems.box', name: 'Drafts' },
        { id: 'loose', component: 'data-modeling.column', name: 'phone' },
      ],
      relations: [
        { id: 'loose-in-drafts', relationType: 'systems.is-part-of', from: 'loose', to: 'drafts' },
      ],
      positions: [
        { element: 'drafts', x: 800, y: 0, width: 240, height: 160 },
        { element: 'loose', container: 'drafts', x: 24, y: 48 },
      ],
    });
    const indexed = indexScene(buildScene(project, VIEW));
    const shape = shapeOf(indexed, 'drafts/loose');
    const selection = elements('loose');
    const plan = planDrop(indexed, project, VIEW, selection, shape);
    if (!plan) throw new Error('The drag only moves.');
    const point = { x: 100, y: 60 };
    const delta = { x: point.x - shape.rect.x, y: point.y - shape.rect.y };
    const aim = dropAimAt(indexed, plan, point, delta, undefined, () => false);
    const drop = dropCommand(indexed, project, VIEW, selection, plan, aim, delta);
    expect(drop?.label).toBe('Move "phone" from "Drafts" into "users"');
    expect(drop?.change).toEqual({
      type: 'change-container',
      view: VIEW,
      to: 'users',
      shapes: [{ element: 'loose', from: 'drafts' }],
    });
    const next = after(project, drop?.command);
    expect(next.model.relations.some((relation) => relation.id === 'loose-in-drafts')).toBe(false);
    expect(rowsOf(next, 'users')).toEqual(['users-id', 'loose', 'users-email', 'users-name']);
    expect(rowsOf(next, 'drafts')).toEqual([]);
    expect(next.views[0]?.stackingOrder).toBeUndefined();
  });

  it('moves a row of another table into this one, out of its table', () => {
    const project = withLoose();
    const indexed = indexScene(buildScene(project, VIEW));
    const total = shapeOf(indexed, 'orders/orders-total');
    // A row moves its table: dragging it drags the table, never the row alone.
    const plan = planDrop(indexed, project, VIEW, elements('orders-total'), total);
    expect(plan?.moving.map((mover) => mover.shape.key)).not.toContain('orders/orders-total');
  });

  it('refuses an element that cannot be a row of the table, and says why', () => {
    const project = withLoose();
    const { aim, caption, drop } = dropAt(project, 'mailer', { x: 100, y: 60 });
    expect(aim).toMatchObject({ kind: 'refused', target: { key: 'users' } });
    // Let go there, it only moves, and lands behind the table, which is newer.
    expect(caption).toEqual({
      text: 'Cannot put inside "users"',
      detail:
        'Only a Column can be a row of "users", through "is column of" · Lands behind "users"',
    });
    expect(drop).toBeUndefined();
  });

  it('takes a drop at once on an empty table, which holds nothing yet', () => {
    const project = tablesProject({
      tables: [{ id: 'empty', at: { x: 0, y: 0 }, columns: [] }],
      elements: [{ id: 'loose', component: 'data-modeling.column', name: 'phone' }],
      positions: [{ element: 'loose', x: 800, y: 0 }],
    });
    const { aim, caption, drop } = dropAt(project, 'loose', { x: 100, y: 40 });
    expect(aim).toMatchObject({ kind: 'into', target: { key: 'empty' }, rows: { at: 0 } });
    expect(caption?.detail).toBe('As its first row · is column of · Alt: move only');
    const next = after(project, drop?.command);
    expect(rowsOf(next, 'empty')).toEqual(['loose']);
    expect(next.views[0]?.stackingOrder).toBeUndefined();
  });

  it('makes the view nest by the relation type that holds the row, in the same action', () => {
    const project = withLoose(['systems.is-part-of']);
    const { aim, drop, caption } = dropAt(project, 'loose', { x: 100, y: 40 });
    expect(aim.kind).toBe('into');
    // The table draws none of its columns until the view nests by "is column of": it goes last.
    expect(caption?.detail).toBe('After its last row · is column of · Alt: move only');
    const command = drop?.command;
    expect(command?.type).toBe('batch');
    if (command?.type !== 'batch') return;
    expect(command.commands[0]).toEqual({
      type: 'update-view',
      id: VIEW,
      changes: { nestingRelationTypes: ['systems.is-part-of', 'data-modeling.is-column-of'] },
    });
    const next = after(project, command);
    expect(rowsOf(next, 'users')).toEqual(['users-id', 'users-email', 'users-name', 'loose']);
  });

  it('only moves with Alt, as every drop', () => {
    const project = withLoose();
    const indexed = indexScene(buildScene(project, VIEW));
    const shape = shapeOf(indexed, 'loose');
    const plan = planDrop(indexed, project, VIEW, elements('loose'), shape);
    if (!plan) throw new Error('The drag only moves.');
    const aim: DropAim = dropAimAt(
      indexed,
      plan,
      { x: 100, y: 60 },
      { x: 0, y: 0 },
      undefined,
      () => false,
      true,
    );
    expect(aim.kind).toBe('only-moves');
  });
});

describe('adding from the palette to a shape that draws rows', () => {
  it('takes only what can be a row of it, as a drop does, and leaves other shapes to the usual rules', () => {
    const project = usersAndOrders();
    const indexed = indexScene(buildScene(project, VIEW));
    expect(rowNestingForAdd(indexed, project, VIEW, 'data-modeling.column', 'users')).toEqual(
      expect.objectContaining({ relationType: 'data-modeling.is-column-of' }),
    );
    const refused = rowNestingForAdd(indexed, project, VIEW, 'systems.service', 'users');
    expect(refused && 'reason' in refused && refused.reason).toMatch(/can be a row of "users"/);
    expect(rowNestingForAdd(indexed, project, VIEW, 'systems.service', undefined)).toBeUndefined();
  });
});
