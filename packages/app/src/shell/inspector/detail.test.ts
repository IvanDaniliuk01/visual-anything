import {
  definitionsOf,
  executeCommand,
  modelIndexOf,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../../test/sample';
import { describedAs, detailOf, startedTypesOf } from './detail';

const sample = loadSample();

function after(state: ProjectSnapshot, ...commands: Command[]): ProjectSnapshot {
  return commands.reduce((current, command) => {
    const outcome = executeCommand(current, command);
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    return outcome.state;
  }, state);
}

/** The sample using Data modeling, with two tables, a primary key and a reference between them. */
const tables = after(
  sample,
  { type: 'update-project', changes: { packages: ['systems', 'clinic', 'data-modeling'] } },
  {
    type: 'create-element',
    element: { id: 'users', component: 'data-modeling.table', name: 'users' },
  },
  {
    type: 'create-element',
    element: {
      id: 'user-id',
      component: 'data-modeling.column',
      name: 'id',
      attributes: { type: 'uuid', primaryKey: true },
    },
    containers: [{ container: 'users', relationType: 'data-modeling.is-column-of' }],
  },
  {
    type: 'create-element',
    element: { id: 'visits', component: 'data-modeling.table', name: 'visits' },
  },
  {
    type: 'create-element',
    element: {
      id: 'visit-user',
      component: 'data-modeling.column',
      name: 'user_id',
      attributes: { type: 'uuid' },
    },
    containers: [{ container: 'visits', relationType: 'data-modeling.is-column-of' }],
  },
  {
    type: 'create-relation',
    relation: { relationType: 'data-modeling.references', from: 'visit-user', to: 'user-id' },
  },
);
const index = modelIndexOf(tables);
const definitions = definitionsOf(tables.packages);
const element = (id: string) => index.element(id)!;

describe('detail in the inspector', () => {
  it('works out what a shape writes as the core does: values, then the badges whose condition holds', () => {
    expect(detailOf(element('user-id'), index, definitions)).toEqual([
      { kind: 'attribute', attribute: 'type', text: 'uuid' },
      { kind: 'badge', text: 'PK' },
    ]);
    expect(detailOf(element('visit-user'), index, definitions)).toEqual([
      { kind: 'attribute', attribute: 'type', text: 'uuid' },
      { kind: 'badge', text: 'FK' },
    ]);
  });

  it('finds the relation types an element starts, and none it only ends', () => {
    expect([...startedTypesOf(index, 'visit-user')].sort()).toEqual([
      'data-modeling.is-column-of',
      'data-modeling.references',
    ]);
    expect([...startedTypesOf(index, 'users')]).toEqual([]);
  });

  it('describes an element by its detail, or by its component when the detail writes nothing', () => {
    expect(describedAs(element('user-id'), index, definitions)).toBe('uuid · PK');
    expect(describedAs(element('users'), index, definitions)).toBe('Table');
    expect(describedAs(element('appointments-db'), index, definitions)).toBe('Calendar');
  });
});
