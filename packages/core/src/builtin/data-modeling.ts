/**
 * The built-in "Data modeling" package: what a database holds, as structure. Tables and their
 * columns, and the references between columns; the schemas a database is divided into; views and
 * materialized views, enums, functions, triggers and sequences; what reads from, writes to, fires on
 * and runs what; and the enum a column's type names. A column is an element, so a relation such as a
 * foreign key can end on it. A table, a view and a materialized view draw their columns as their rows.
 *
 * Code is never held: a view's query, a function's body and a trigger's condition stay in the
 * database. Their attributes are text a person reads, such as a function's arguments as written.
 *
 * Every component derives from Essence and every relation type from "relates to", so the package
 * needs no other. A schema sits in its database, and what it holds sits in it, through Systems' "is
 * part of", which every project that holds a database already uses (ADR 0023's clarification of
 * 2026-10-29).
 *
 * Once projects use these ids, they change only by additions: built-in packages have no versions yet
 * (ADR 0018).
 */
import type { Face, PackageFile, SvgImage } from '@visual-anything/schema';
import { OWN_CREDITS, OWN_LICENSE, OWN_SOURCE } from './credits';

/** An icon of this package, drawn for Visual Anything, in the cleaned SVG text given. */
function icon(id: string, name: string, svg: string): SvgImage {
  return {
    kind: 'svg',
    id,
    name,
    source: OWN_SOURCE,
    license: OWN_LICENSE,
    width: 24,
    height: 24,
    svg,
  };
}

/**
 * The icons of its components, each in one colour that reads at 3:1 or more on its component's fill
 * in both themes. Table and Column have none: a table is told by its rows.
 */
export const DATA_MODELING_ICONS = {
  /** A frame with a band across its top, holding two blocks. */
  schema: icon(
    'data-modeling.schema-icon',
    'Schema',
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="18" rx="3" stroke="#5C7591" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="18" x="3" y="3"/><path d="M3 8h18" fill="none" stroke="#5C7591" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><rect fill="#5C7591" height="7" rx="1" width="5" x="6" y="11"/><rect fill="#5C7591" height="7" rx="1" width="5" x="13" y="11"/></svg>',
  ),
  /** An eye: what a view shows of the tables it reads. */
  view: icon(
    'data-modeling.view-icon',
    'View',
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" fill="none" stroke="#2F8A57" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><circle cx="12" cy="12" fill="#2F8A57" r="3"/></svg>',
  ),
  /** An eye over a bar: a view whose rows are stored. */
  materializedView: icon(
    'data-modeling.materialized-view-icon',
    'Materialized view',
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M2 10s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 10 2 10z" fill="none" stroke="#2F8A57" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><circle cx="12" cy="10" fill="#2F8A57" r="2.5"/><rect fill="#2F8A57" height="3" rx="1" width="16" x="4" y="19"/></svg>',
  ),
  /** A list of three items. */
  enum: icon(
    'data-modeling.enum-icon',
    'Enum',
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="6" fill="#B0661E" r="1.5"/><circle cx="5" cy="12" fill="#B0661E" r="1.5"/><circle cx="5" cy="18" fill="#B0661E" r="1.5"/><path d="M10 6h10M10 12h10M10 18h10" fill="none" stroke="#B0661E" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
  ),
  /** An argument between parentheses. */
  function: icon(
    'data-modeling.function-icon',
    'Function',
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M8 3c-4 4-4 14 0 18M16 3c4 4 4 14 0 18" fill="none" stroke="#8768D2" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M9.5 9l5 6M14.5 9l-5 6" fill="none" stroke="#8768D2" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
  ),
  /** A bolt: something that fires when a table changes. */
  trigger: icon(
    'data-modeling.trigger-icon',
    'Trigger',
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="none" stroke="#C9497F" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
  ),
  /** A number sign: the numbers a sequence hands out. */
  sequence: icon(
    'data-modeling.sequence-icon',
    'Sequence',
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M10 3L8 21M16 3l-2 18M4 8h16M4 16h16" fill="none" stroke="#21897C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
  ),
} as const;

/**
 * A table's face (ADR 0083): a header as tall as the canvas's own, with its name on the left, as the
 * canvas writes it, and its schema on the right, left of the toggle, then its rows. Its colors are
 * the theme's tokens, so it reads on the table's fill in both themes.
 */
export const TABLE_FACE: Face = {
  markup: [
    '<header>',
    '  <b>{{name}}</b>',
    '  <small if="schema">{{schema}}</small>',
    '</header>',
    '<rows/>',
  ],
  style: [
    'header { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 30px 0 12px; }',
    'b { flex: 1; font-size: 14px; line-clamp: 1; }',
    'small { font-size: 11px; color: var(--text-muted); white-space: nowrap; }',
  ],
};

/**
 * A column's face, which its table draws on its row: its name, its type in monospace, the badges its
 * detail gives (PK, and FK while it references another column), then NOT NULL and UNIQUE from its
 * attributes. Keys are drawn on the theme's highlight, the other flags on its code back.
 */
export const COLUMN_FACE: Face = {
  markup: [
    '<div class="column">',
    '  <span class="name">{{name}}</span>',
    '  <span class="type" if="type">{{type}}</span>',
    '  <badges/>',
    '  <span class="flag" if="notNull">NOT NULL</span>',
    '  <span class="flag" if="unique">UNIQUE</span>',
    '</div>',
  ],
  style: [
    'face { justify-content: center; }',
    '.column { display: flex; align-items: center; gap: 4px; padding: 0 10px; }',
    '.name { flex: 1; font-size: 12px; line-clamp: 1; }',
    '.type { font-family: mono; font-size: 11px; color: var(--text-muted); white-space: nowrap; }',
    'badges, .flag { padding: 0 3px; border-radius: 3px; font-size: 9px; font-weight: 700; white-space: nowrap; }',
    'badges { background: var(--highlight); }',
    '.flag { background: var(--code-back); }',
  ],
};

export const DATA_MODELING: PackageFile = {
  id: 'data-modeling',
  name: 'Data modeling',
  description:
    'Tables and their columns, and the references between columns; the schemas, views, enums, functions, triggers and sequences of a database, what reads from, writes to, fires on and runs what, and the enum each column’s type names.',
  ...OWN_CREDITS,
  components: [
    {
      id: 'data-modeling.table',
      name: 'Table',
      derivesFrom: 'essence',
      description: 'A table of a database. It draws its columns as its rows.',
      attributes: [
        {
          name: 'schema',
          type: 'string',
          description:
            'The schema it belongs to, such as "billing", which its face writes beside its name.',
        },
      ],
      appearance: {
        shape: 'rectangle',
        fill: '#E3ECFA',
        stroke: '#1F4E8C',
        width: 240,
        detail: { componentName: false },
        contentsAsRows: true,
        face: TABLE_FACE,
      },
    },
    {
      id: 'data-modeling.column',
      name: 'Column',
      derivesFrom: 'essence',
      description: 'A column of a table or a view.',
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
        {
          name: 'default',
          type: 'string',
          description:
            'The value it takes when a record gives none, as written, such as "now()" or "0". It is text, and never runs.',
        },
        {
          name: 'check',
          type: 'string',
          description:
            'The condition its values must meet, as written, such as "total_cents >= 0". It is text, and never runs.',
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
        face: COLUMN_FACE,
      },
    },
    {
      id: 'data-modeling.schema',
      name: 'Schema',
      derivesFrom: 'essence',
      description:
        'A namespace of a database, such as "billing", that holds tables, views, enums, functions, triggers and sequences. It is part of its database.',
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#F4F6F9',
        stroke: '#3E5774',
        width: 320,
        height: 200,
        image: { image: DATA_MODELING_ICONS.schema.id },
      },
    },
    {
      id: 'data-modeling.view',
      name: 'View',
      derivesFrom: 'essence',
      description:
        'A view of a database: a named query that is read as a table. It draws its columns as its rows, and reads from the tables and views it names.',
      appearance: {
        shape: 'rectangle',
        fill: '#E3F3E8',
        stroke: '#1E6B43',
        width: 240,
        detail: { componentName: false },
        contentsAsRows: true,
        image: { image: DATA_MODELING_ICONS.view.id },
      },
    },
    {
      id: 'data-modeling.materialized-view',
      name: 'Materialized view',
      derivesFrom: 'data-modeling.view',
      description: 'A view whose rows the database stores, and refreshes when it is asked to.',
      appearance: {
        fill: '#CDEBD8',
        image: { image: DATA_MODELING_ICONS.materializedView.id },
      },
    },
    {
      id: 'data-modeling.enum',
      name: 'Enum',
      derivesFrom: 'essence',
      description:
        'A type that takes one of a fixed, ordered list of values. A column of that type names it as its type.',
      attributes: [
        {
          name: 'values',
          type: 'string',
          description:
            'Its values in their order, separated by commas, such as "draft, paid, void".',
        },
      ],
      appearance: {
        shape: 'rectangle',
        fill: '#FDEBD3',
        stroke: '#8A4B0F',
        width: 200,
        height: 64,
        detail: { attributes: ['values'] },
        image: { image: DATA_MODELING_ICONS.enum.id },
      },
    },
    {
      id: 'data-modeling.function',
      name: 'Function',
      derivesFrom: 'essence',
      description:
        'A function or a procedure stored in a database. The model holds what it reads, writes and returns, never its code.',
      attributes: [
        {
          name: 'language',
          type: 'string',
          description: 'What it is written in, such as "sql" or "plpgsql".',
        },
        {
          name: 'arguments',
          type: 'string',
          description: 'Its arguments as written, such as "order_id uuid, amount integer".',
        },
        {
          name: 'returns',
          type: 'string',
          description:
            'What it returns, as written, such as "trigger", "boolean" or "setof orders".',
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#EDE4FF',
        stroke: '#5B3A9E',
        width: 224,
        height: 64,
        detail: { attributes: ['returns'] },
        image: { image: DATA_MODELING_ICONS.function.id },
      },
    },
    {
      id: 'data-modeling.trigger',
      name: 'Trigger',
      derivesFrom: 'essence',
      description:
        'What a database does when a table or a view changes: it fires on them and runs a function. The model holds when it fires, never its code.',
      attributes: [
        {
          name: 'timing',
          type: 'string',
          description: 'When it fires, beside the change.',
          choices: ['before', 'after', 'instead of'],
        },
        {
          name: 'events',
          type: 'string',
          description:
            'The changes it fires on, as written, such as "insert, update" or "update of status".',
        },
        {
          name: 'level',
          type: 'string',
          description: 'Whether it fires once for each record changed or once for each statement.',
          choices: ['row', 'statement'],
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#FBE3EC',
        stroke: '#8A1F4C',
        width: 224,
        height: 64,
        detail: { attributes: ['timing', 'events'] },
        image: { image: DATA_MODELING_ICONS.trigger.id },
      },
    },
    {
      id: 'data-modeling.sequence',
      name: 'Sequence',
      derivesFrom: 'essence',
      description:
        'A counter of a database that hands out the next number, often to a column’s default.',
      attributes: [
        { name: 'type', type: 'string', description: 'Its data type, such as "bigint".' },
        { name: 'start', type: 'number', description: 'The first number it hands out.' },
        { name: 'increment', type: 'number', description: 'What it adds for the next number.' },
      ],
      appearance: {
        shape: 'rectangle',
        fill: '#E0F2F1',
        stroke: '#0E5E57',
        width: 200,
        height: 56,
        image: { image: DATA_MODELING_ICONS.sequence.id },
      },
    },
  ],
  relationTypes: [
    {
      id: 'data-modeling.is-column-of',
      name: 'is column of',
      derivesFrom: 'relates-to',
      description: 'Places a column in its table or its view.',
      direction: 'directed',
      nests: true,
      limits: {
        from: ['data-modeling.column'],
        to: ['data-modeling.table', 'data-modeling.view'],
      },
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
    {
      id: 'data-modeling.reads-from',
      name: 'reads from',
      derivesFrom: 'relates-to',
      description: 'A view or a function reads the records of a table or a view.',
      direction: 'directed',
      appearance: { stroke: '#3D4651', width: 1.5, dash: 'dashed' },
      limits: {
        from: ['data-modeling.view', 'data-modeling.function'],
        to: ['data-modeling.table', 'data-modeling.view'],
      },
    },
    {
      id: 'data-modeling.writes-to',
      name: 'writes to',
      derivesFrom: 'relates-to',
      description:
        'A function inserts, updates or deletes the records of a table or a view, or takes the next number of a sequence.',
      direction: 'directed',
      appearance: { stroke: '#3D4651', width: 1.5 },
      limits: {
        from: ['data-modeling.function'],
        to: ['data-modeling.table', 'data-modeling.view', 'data-modeling.sequence'],
      },
    },
    {
      id: 'data-modeling.fires-on',
      name: 'fires on',
      derivesFrom: 'relates-to',
      description: 'A trigger fires when the records of this table or view change.',
      direction: 'directed',
      appearance: { stroke: '#8A1F4C', width: 1.5, dash: 'dotted' },
      limits: {
        from: ['data-modeling.trigger'],
        to: ['data-modeling.table', 'data-modeling.view'],
      },
    },
    {
      id: 'data-modeling.runs',
      name: 'runs',
      derivesFrom: 'relates-to',
      description: 'A trigger runs this function each time it fires.',
      direction: 'directed',
      appearance: { stroke: '#5B3A9E', width: 1.5 },
      limits: { from: ['data-modeling.trigger'], to: ['data-modeling.function'] },
    },
    {
      id: 'data-modeling.has-type',
      name: 'has type',
      derivesFrom: 'relates-to',
      description: 'A column takes the values of this enum: the enum its type names.',
      direction: 'directed',
      appearance: { stroke: '#8A4B0F', width: 1.5, dash: 'dotted' },
      limits: { from: ['data-modeling.column'], to: ['data-modeling.enum'] },
    },
  ],
  images: [
    DATA_MODELING_ICONS.schema,
    DATA_MODELING_ICONS.view,
    DATA_MODELING_ICONS.materializedView,
    DATA_MODELING_ICONS.enum,
    DATA_MODELING_ICONS.function,
    DATA_MODELING_ICONS.trigger,
    DATA_MODELING_ICONS.sequence,
  ],
};
