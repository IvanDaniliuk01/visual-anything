/**
 * The built-in "Data modeling" package: tables, their columns, and the references between columns.
 * A column is an element, so a relation such as a foreign key can end on it. A table draws its columns
 * as its rows.
 *
 * Once projects use these ids, they change only by additions: built-in packages have no versions yet
 * (ADR 0018).
 */
import type { PackageFile } from '@visual-anything/schema';
import { OWN_CREDITS } from './credits';

export const DATA_MODELING: PackageFile = {
  id: 'data-modeling',
  name: 'Data modeling',
  description: 'Tables and their columns, and the references between columns.',
  ...OWN_CREDITS,
  components: [
    {
      id: 'data-modeling.table',
      name: 'Table',
      derivesFrom: 'essence',
      description: 'A table of a database. It draws its columns as its rows.',
      appearance: {
        shape: 'rectangle',
        fill: '#E3ECFA',
        stroke: '#1F4E8C',
        width: 240,
        detail: { componentName: false },
        contentsAsRows: true,
      },
    },
    {
      id: 'data-modeling.column',
      name: 'Column',
      derivesFrom: 'essence',
      description: 'A column of a table.',
      // No defaults: a column's type and flags are its ordinary data, and an absent flag reads as false.
      attributes: [
        {
          name: 'type',
          type: 'string',
          description: 'Its data type, such as "uuid", "integer" or "varchar(255)".',
        },
        {
          name: 'primaryKey',
          type: 'boolean',
          description: 'Whether it is part of its table’s primary key.',
        },
        { name: 'notNull', type: 'boolean', description: 'Whether it refuses empty values.' },
        {
          name: 'unique',
          type: 'boolean',
          description: 'Whether no two records may hold the same value.',
        },
      ],
      appearance: {
        shape: 'rectangle',
        fill: '#FFFFFF',
        stroke: '#1F4E8C',
        width: 200,
        height: 32,
        detail: {
          componentName: false,
          attributes: ['type'],
          badges: [
            { when: 'attribute', text: 'PK', attribute: 'primaryKey' },
            { when: 'from-end', text: 'FK', relationType: 'data-modeling.references' },
          ],
        },
      },
    },
  ],
  relationTypes: [
    {
      id: 'data-modeling.is-column-of',
      name: 'is column of',
      derivesFrom: 'relates-to',
      description: 'Places a column in its table.',
      direction: 'directed',
      nests: true,
      limits: { from: ['data-modeling.column'], to: ['data-modeling.table'] },
    },
    {
      id: 'data-modeling.references',
      name: 'references',
      derivesFrom: 'relates-to',
      description:
        'A foreign key: the values of this end are values of the other end, usually a primary key.',
      direction: 'directed',
      attributes: [
        {
          name: 'onDelete',
          type: 'string',
          description:
            'What happens to the records that hold this value when the record they refer to is deleted.',
          choices: ['no action', 'restrict', 'cascade', 'set null', 'set default'],
        },
      ],
      appearance: { stroke: '#1F4E8C', width: 1.5 },
      limits: {
        from: ['data-modeling.column', 'data-modeling.table'],
        to: ['data-modeling.column', 'data-modeling.table'],
      },
    },
  ],
};
