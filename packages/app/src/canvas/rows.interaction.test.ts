/** Pointing at, selecting, dragging and keying rows and the tables that draw them (ADR 0023). */
import { executeCommand } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { selectionOf } from '../editor/selection';
import { VIEW, usersAndOrders } from '../test/tables';
import { centerOf } from './geometry';
import { createBesideCommand, moveCommand, movingShapes } from './gestures';
import { enclosedBy, hitAt, indexScene } from './hit';
import { rowMoveFor, rowTargetFor } from './rowKeys';
import { rowsInView } from './rowCommands';
import { buildScene, type ElementShape } from './scene';
import { grow } from './geometry';

const project = usersAndOrders();
const indexed = indexScene(buildScene(project, VIEW));
const shape = (key: string) => indexed.byKey.get(key) as ElementShape;
const users = shape('users');
const id = shape('users/users-id');
const email = shape('users/users-email');
const select = (...ids: string[]) =>
  selectionOf(ids.map((each) => ({ kind: 'element', id: each })));

describe('pointing at rows', () => {
  it('selects the column under the pointer, and the table at its header', () => {
    const onRow = hitAt(indexed, centerOf(email.rect), 1);
    expect(onRow?.kind === 'shape' && onRow.shape.key).toBe('users/users-email');
    const onHeader = hitAt(indexed, { x: users.rect.x + 40, y: users.rect.y + 10 }, 1);
    expect(onHeader?.kind === 'shape' && onHeader.shape.key).toBe('users');
  });

  it('prefers a relation’s line beside a row to the row', () => {
    const [fk] = indexed.scene.relations;
    const start = fk?.route.at(-1);
    const hit = start && hitAt(indexed, { x: start.x + 2, y: start.y }, 6);
    expect(hit?.kind).toBe('relation');
  });

  it('selects a table with a box around it, not its rows as well', () => {
    const found = enclosedBy(indexed, grow(users.rect, 4));
    expect(found.shapes.map((each) => each.key)).toEqual(['users']);
    // A box around rows alone still selects them.
    const rows = enclosedBy(indexed, grow({ ...email.rect, x: email.rect.x }, 2));
    expect(rows.shapes.map((each) => each.key)).toEqual(['users/users-email']);
  });
});

describe('dragging rows', () => {
  it('moves the table when a row is dragged, and writes no row position', () => {
    expect(movingShapes(indexed, select('users-email')).map((each) => each.key)).toEqual(['users']);
    const command = moveCommand(indexed, project, VIEW, select('users-email'), { x: 40, y: 0 });
    expect(command).toEqual({
      type: 'set-positions',
      view: VIEW,
      positions: [{ element: 'users', x: 40, y: 0, pinned: true }],
    });
    expect(command && executeCommand(project, command).ok).toBe(true);
  });

  it('sends each position once, whatever rows and tables are selected', () => {
    for (const selection of [
      select('users-id', 'users-email'),
      select('users-id', 'orders-user'),
      select('users', 'users-id', 'orders', 'orders-total'),
    ]) {
      const command = moveCommand(indexed, project, VIEW, selection, { x: 8, y: 8 });
      const positions = command?.type === 'set-positions' ? command.positions : [];
      const keys = positions.map((each) => each.element);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys.every((each) => each === 'users' || each === 'orders')).toBe(true);
      expect(command && executeCommand(project, command).ok).toBe(true);
    }
  });
});

describe('the keys on rows', () => {
  it('move a row up and down with Shift, and do nothing to the left or right', () => {
    expect(rowMoveFor(project, VIEW, email, 'up')).toEqual({
      handled: true,
      command: { type: 'reorder-elements', elements: ['users-email'], before: 'users-id' },
    });
    expect(rowMoveFor(project, VIEW, id, 'up')).toEqual({ handled: true });
    expect(rowMoveFor(project, VIEW, id, 'left')).toEqual({ handled: true });
    expect(rowMoveFor(project, VIEW, users, 'up')).toEqual({ handled: false });
  });

  it('add a row below a row, or at the end of a table, with Ctrl+Enter', () => {
    expect(rowTargetFor(indexed, email)).toEqual({ container: users, below: 'users-email' });
    expect(rowTargetFor(indexed, users)).toEqual({ container: users });
  });
});

describe('adding beside a row', () => {
  it('adds the new row below the selected one, with no position', () => {
    const command = createBesideCommand(indexed, project, VIEW, 'data-modeling.column', id);
    expect(command).toMatchObject({ type: 'create-element', before: 'users-email' });
    expect(command && 'positions' in command && command.positions).toBeFalsy();
    const outcome = command && executeCommand(project, command);
    if (!outcome?.ok) throw new Error('Refused.');
    const view = outcome.state.views[0];
    expect(view && rowsInView(outcome.state, view, 'users')[1]).not.toBe('users-email');
  });
});
