import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { parseColumns } from '../shell/inspector/columns';
import { VIEW, tablesProject, usersAndOrders } from '../test/tables';
import {
  addColumnsCommand,
  addRowCommand,
  isTable,
  moveRowCommand,
  rowComponentOf,
  rowsInView,
} from './rowCommands';

/** Ids that count up, so that tests can name what they make. */
function counting(): (base: string) => string {
  let next = 0;
  return (base) => `${base}-${++next}`;
}

function run(project: ProjectSnapshot, command: Command | undefined): ProjectSnapshot {
  if (!command) throw new Error('No command.');
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

const viewOf = (project: ProjectSnapshot) => project.views[0] as ViewFile;

describe('rows in a view', () => {
  const project = usersAndOrders();

  it('are what a container holds through the view’s nesting relation types, in the model’s order', () => {
    expect(rowsInView(project, viewOf(project), 'users')).toEqual([
      'users-id',
      'users-email',
      'users-name',
    ]);
  });

  it('of a table are made from Column', () => {
    expect(isTable(project, 'users')).toBe(true);
    expect(isTable(project, 'users-id')).toBe(false);
    expect(rowComponentOf(project, viewOf(project), 'users')).toBe('data-modeling.column');
  });
});

describe('addRowCommand', () => {
  it('adds a row at the end, named after its component, through "is column of"', () => {
    const project = usersAndOrders();
    const added = addRowCommand(project, VIEW, 'users', undefined, counting());
    const after = run(project, added?.command);
    expect(added?.id).toBe('column-1');
    expect(rowsInView(after, viewOf(after), 'users').at(-1)).toBe('column-1');
    const relation = after.model.relations.find((each) => each.from === 'column-1');
    expect(relation?.relationType).toBe('data-modeling.is-column-of');
    expect(relation?.to).toBe('users');
  });

  it('adds a row below the one given', () => {
    const project = usersAndOrders();
    const added = addRowCommand(project, VIEW, 'users', 'users-id', counting());
    const after = run(project, added?.command);
    expect(rowsInView(after, viewOf(after), 'users')).toEqual([
      'users-id',
      'column-1',
      'users-email',
      'users-name',
    ]);
  });

  it('makes the view nest by "is column of" in the same action when it does not yet', () => {
    const project = usersAndOrders({ nesting: [] });
    const added = addRowCommand(project, VIEW, 'users', undefined, counting());
    expect(added?.command.type).toBe('batch');
    const after = run(project, added?.command);
    expect(viewOf(after).nestingRelationTypes).toEqual(['data-modeling.is-column-of']);
  });
});

describe('moveRowCommand', () => {
  const project = usersAndOrders();
  const view = viewOf(project);

  it('moves a row up and down among its container’s rows', () => {
    const up = run(project, moveRowCommand(project, view, 'users', 'users-email', 'up'));
    expect(rowsInView(up, viewOf(up), 'users')).toEqual(['users-email', 'users-id', 'users-name']);
    const down = run(project, moveRowCommand(project, view, 'users', 'users-id', 'down'));
    expect(rowsInView(down, viewOf(down), 'users')).toEqual([
      'users-email',
      'users-id',
      'users-name',
    ]);
    const last = run(project, moveRowCommand(project, view, 'users', 'users-email', 'down'));
    expect(rowsInView(last, viewOf(last), 'users')).toEqual(['users-id', 'users-name', 'users-email']);
  });

  it('does nothing at the top or the bottom', () => {
    expect(moveRowCommand(project, view, 'users', 'users-id', 'up')).toBeUndefined();
    expect(moveRowCommand(project, view, 'users', 'users-name', 'down')).toBeUndefined();
  });
});

describe('addColumnsCommand', () => {
  const pasted = parseColumns(`CREATE TABLE appointments (
    id uuid PRIMARY KEY,
    patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id uuid REFERENCES doctors,
    starts_at timestamp
  );`);

  it('sends one batch: the columns, with only the attributes they have, and the references it finds', () => {
    const project = tablesProject({
      tables: [
        { id: 'patients', columns: [{ id: 'patients-id', name: 'id', primaryKey: true }] },
        { id: 'appointments', columns: [] },
      ],
    });
    const { command, ids, unrelated } = addColumnsCommand(
      project,
      VIEW,
      'appointments',
      pasted.columns,
      counting(),
    );
    expect(command?.type === 'batch' && command.label).toBe('Add 4 columns to "appointments"');
    expect(ids).toEqual(['id-1', 'patient-id-2', 'doctor-id-3', 'starts-at-4']);
    expect(unrelated).toEqual([{ text: 'doctors', reason: 'no table named “doctors”' }]);
    const after = run(project, command);
    expect(rowsInView(after, viewOf(after), 'appointments')).toEqual(ids);
    const patient = after.model.elements.find((each) => each.id === 'patient-id-2');
    expect(patient?.attributes).toEqual({ type: 'uuid', notNull: true });
    const starts = after.model.elements.find((each) => each.id === 'starts-at-4');
    expect(starts?.attributes).toEqual({ type: 'timestamp' });
    const reference = after.model.relations.find(
      (each) => each.relationType === 'data-modeling.references',
    );
    expect(reference).toMatchObject({
      from: 'patient-id-2',
      to: 'patients-id',
      attributes: { onDelete: 'cascade' },
    });
  });

  it('finds a table’s single primary key when a reference leaves the column out, and columns being added', () => {
    const project = tablesProject({ tables: [{ id: 'categories', columns: [] }] });
    const { command, unrelated } = addColumnsCommand(
      project,
      VIEW,
      'categories',
      parseColumns('id int pk, parent int references categories').columns,
      counting(),
    );
    expect(unrelated).toEqual([]);
    const after = run(project, command);
    expect(
      after.model.relations.find((each) => each.relationType === 'data-modeling.references'),
    ).toMatchObject({ from: 'parent-2', to: 'id-1' });
  });

  it('nests the columns by "is column of", whatever the view nested by before', () => {
    for (const nesting of [['systems.is-part-of', 'data-modeling.is-column-of'], []]) {
      const project = tablesProject({ tables: [{ id: 'patients', columns: [] }], nesting });
      const { command } = addColumnsCommand(
        project,
        VIEW,
        'patients',
        parseColumns('id uuid pk').columns,
        counting(),
      );
      const after = run(project, command);
      expect(viewOf(after).nestingRelationTypes).toContain('data-modeling.is-column-of');
      expect(after.model.relations.find((each) => each.from === 'id-1')?.relationType).toBe(
        'data-modeling.is-column-of',
      );
    }
  });
});
