/**
 * The built-in Data modeling package's code (ADR 0089's M14.6 clarification), run here in a plain
 * context of Node's with the core's own model reader, as the code worker hands it to QuickJS: the SQL
 * DDL exporter and "Find tables no relation reaches", whose changes the core previews and applies.
 */
import { runInNewContext } from 'node:vm';
import type { Element, Relation } from '@visual-anything/schema';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { CANVAS_BACKGROUNDS, contrastRatio } from '../colors';
import { checkedExtensions, checkChangesAnswer, previewPackageChanges } from '../code/extensions';
import { modelReaderOf } from '../code/input';
import { CODE_LIMITS } from '../code/limits';
import { codeStatusOf } from '../code/approvals';
import { packageCodeOf } from '../code/packages';
import type { ProjectSnapshot } from '../snapshot';
import { DATA_MODELING } from './data-modeling';
import { DATA_MODELING_CODE, DATA_MODELING_EXTENSIONS, UNREACHED_MARK } from './data-modeling-code';
import { SYSTEMS } from './systems';

interface Hooks {
  act: (input: unknown, context: unknown) => unknown;
  exportFile: (input: unknown, context: unknown) => unknown;
}

/** The module's hooks, its `export`s read as plain functions. */
function hooks(): Hooks {
  const text = DATA_MODELING_CODE.join('\n').replace(/^export function /gm, 'function ');
  return runInNewContext(`${text}\n({ act, exportFile });`, {}) as Hooks;
}

function project(elements: Element[], relations: Relation[]): ProjectSnapshot {
  return {
    project: { schemaVersion: 1, name: 'Shop', packages: ['systems', 'data-modeling'] },
    model: { world: { id: 'world', component: 'essence', name: 'World' }, elements, relations },
    packages: [SYSTEMS, DATA_MODELING],
    views: [],
    scenarios: [],
    tours: [],
    comments: [],
  };
}

const table = (id: string, name: string, schema?: string): Element => ({
  id,
  component: 'data-modeling.table',
  name,
  ...(schema === undefined ? {} : { attributes: { schema } }),
});
const column = (id: string, name: string, attributes: Element['attributes'] = {}): Element => ({
  id,
  component: 'data-modeling.column',
  name,
  attributes,
});
const columnOf = (col: string, tab: string): Relation => ({
  id: `${col}-of`,
  relationType: 'data-modeling.is-column-of',
  from: col,
  to: tab,
});

/** Customers and their orders, with a foreign key, and a table of settings nothing references. */
function shop(): ProjectSnapshot {
  return project(
    [
      table('customers', 'customers', 'shop'),
      column('customers-id', 'id', { type: 'uuid', primaryKey: true }),
      column('customers-email', 'email', { type: 'varchar(255)', notNull: true, unique: true }),
      table('orders', 'orders', 'shop'),
      column('orders-id', 'id', { type: 'uuid', primaryKey: true }),
      column('orders-customer', 'customer_id', { type: 'uuid', notNull: true }),
      column('orders-total', 'total cents', {
        type: 'integer',
        default: '0',
        check: 'total_cents >= 0',
      }),
      { ...table('settings', 'user'), description: 'One row of settings.' },
      column('settings-key', 'key'),
      {
        id: 'status',
        component: 'data-modeling.enum',
        name: 'order_status',
        attributes: { values: "placed, paid, it's shipped" },
      },
    ],
    [
      columnOf('customers-id', 'customers'),
      columnOf('customers-email', 'customers'),
      columnOf('orders-id', 'orders'),
      columnOf('orders-customer', 'orders'),
      columnOf('orders-total', 'orders'),
      columnOf('settings-key', 'settings'),
      {
        id: 'fk',
        relationType: 'data-modeling.references',
        from: 'orders-customer',
        to: 'customers-id',
        attributes: { onDelete: 'cascade' },
      },
    ],
  );
}

describe('the code of the built-in Data modeling package', () => {
  it('is held by the package, declared, within the limits, and runs as the program’s own', () => {
    expect(validateFile('package', DATA_MODELING)).toEqual({ ok: true, value: DATA_MODELING });
    expect(checkedExtensions(DATA_MODELING_EXTENSIONS)).toEqual({
      ok: true,
      extensions: DATA_MODELING_EXTENSIONS,
    });
    expect(DATA_MODELING.capabilities).toEqual(['model:read']);
    const code = packageCodeOf(DATA_MODELING);
    expect(code?.tooLarge).toBe(false);
    expect(code?.text.length).toBeLessThan(CODE_LIMITS.codeText);
    expect(DATA_MODELING_CODE.every((line) => line.length <= CODE_LIMITS.lineLength)).toBe(true);
    // Built in: approved without any approval, with every capability it declares.
    expect(code?.builtIn).toBe(true);
    expect(code && codeStatusOf(code, [])).toEqual({
      state: 'approved',
      granted: ['model:read'],
      builtIn: true,
    });
  });

  it('is not the program’s own once its code or what it may reach differs', () => {
    const changed = packageCodeOf({ ...DATA_MODELING, code: [...DATA_MODELING_CODE, '// more'] });
    expect(changed?.builtIn).toBeUndefined();
    expect(changed && codeStatusOf(changed, [])).toEqual({ state: 'unapproved' });
    const more = packageCodeOf({ ...DATA_MODELING, capabilities: ['model:read', 'time'] });
    expect(more?.builtIn).toBeUndefined();
    // Nor is another package's code that is the same text.
    expect(packageCodeOf({ ...DATA_MODELING, id: 'mine' })?.builtIn).toBeUndefined();
  });

  it('writes the tables, their columns, keys and foreign keys, and the enums, as SQL DDL', () => {
    const state = shop();
    const sql = hooks().exportFile({ exporter: 'sql-ddl' }, { model: modelReaderOf(state) });
    expect(sql).toBe(
      [
        '-- Written by the built-in package "Data modeling" of Visual Anything: the tables of the model,',
        '-- their columns, primary keys and foreign keys. Views, functions, triggers and sequences are left',
        '-- out, as the model holds none of their code.',
        '',
        'CREATE SCHEMA IF NOT EXISTS shop;',
        '',
        "CREATE TYPE order_status AS ENUM ('placed', 'paid', 'it''s shipped');",
        '',
        'CREATE TABLE shop.customers (',
        '  id uuid,',
        '  email varchar(255) NOT NULL UNIQUE,',
        '  PRIMARY KEY (id)',
        ');',
        '',
        'CREATE TABLE shop.orders (',
        '  id uuid,',
        '  customer_id uuid NOT NULL,',
        '  "total cents" integer DEFAULT 0 CHECK (total_cents >= 0),',
        '  PRIMARY KEY (id)',
        ');',
        '',
        '-- One row of settings.',
        'CREATE TABLE "user" (',
        '  "key" text -- the model gives it no type',
        ');',
        '',
        'ALTER TABLE shop.orders',
        '  ADD FOREIGN KEY (customer_id) REFERENCES shop.customers (id) ON DELETE CASCADE;',
        '',
      ].join('\n'),
    );
  });

  it('never writes a value of the model as SQL that could end its statement or a comment', () => {
    const state = shop();
    const hostile = 'x; DROP TABLE shop.customers; --';
    for (const element of state.model.elements) {
      element.description = 'Notes\rDROP TABLE first;\u2028DROP TABLE second;';
      if (element.attributes && 'type' in element.attributes) {
        element.attributes = {
          ...element.attributes,
          type: hostile,
          default: hostile,
          check: hostile,
        };
      }
    }
    for (const relation of state.model.relations) {
      relation.attributes = { ...relation.attributes, onDelete: 'cascade; DROP TABLE third' };
    }
    const sql = hooks().exportFile(
      { exporter: 'sql-ddl' },
      { model: modelReaderOf(state) },
    ) as string;
    // Every line ending a SQL reader may take, control characters included, on purpose.
    // eslint-disable-next-line no-control-regex
    for (const line of sql.split(/\r\n|[\n\r\u000b\u000c\u0085\u2028\u2029]/)) {
      const code = line.includes('--') ? line.slice(0, line.indexOf('--')) : line;
      expect(code).not.toMatch(/DROP/);
    }
    expect(sql).toContain('is not written, as it holds what could end the statement');
    expect(sql).toContain('its ON DELETE is not one SQL knows');
  });

  it('never lets a quote one value opens be closed by what follows it', () => {
    const state = shop();
    let first = true;
    for (const element of state.model.elements) {
      element.description = "x' ; DROP TABLE described; --";
      if (element.attributes && 'type' in element.attributes) {
        element.attributes = first
          ? { ...element.attributes, default: "'", check: 'a $$ b', type: 'int) ; x' }
          : { ...element.attributes, default: "'it''s'" };
        first = false;
      }
    }
    const sql = hooks().exportFile(
      { exporter: 'sql-ddl' },
      { model: modelReaderOf(state) },
    ) as string;
    const outsideComments = sql
      .split(String.fromCharCode(10))
      .map((line) => (line.includes('--') ? line.slice(0, line.indexOf('--')) : line))
      .join(String.fromCharCode(10));
    expect((outsideComments.match(/'/g) ?? []).length % 2).toBe(0);
    expect(outsideComments).not.toMatch(/DROP|\$\$/);
    expect(sql).toContain("DEFAULT 'it''s'");
    const closing = shop();
    for (const element of closing.model.elements) {
      if (element.attributes && 'check' in element.attributes) {
        element.attributes = {
          ...element.attributes,
          check: 'total_cents >= 0) , x int CHECK (true',
        };
      }
    }
    const closed = hooks().exportFile(
      { exporter: 'sql-ddl' },
      { model: modelReaderOf(closing) },
    ) as string;
    expect(closed).not.toContain('x int');
  });

  it('says so of a model with no tables, and of a reference between tables without columns', () => {
    const empty = hooks().exportFile(
      { exporter: 'sql-ddl' },
      { model: modelReaderOf(project([], [])) },
    );
    expect(empty).toContain('-- The model holds no tables.');
    const state = project(
      [table('a', 'a'), table('b', 'b')],
      [{ id: 'ab', relationType: 'data-modeling.references', from: 'a', to: 'b' }],
    );
    expect(hooks().exportFile({ exporter: 'sql-ddl' }, { model: modelReaderOf(state) })).toContain(
      '-- a references b, with no columns to write as a foreign key.',
    );
  });

  it('needs to read the model, and writes only what it declares', () => {
    expect(() => hooks().exportFile({ exporter: 'sql-ddl' }, {})).toThrow(/read the model/);
    expect(() => hooks().exportFile({ exporter: 'csv' }, { model: modelReaderOf(shop()) })).toThrow(
      /writes no "csv"/,
    );
  });

  it('marks, for review, the tables no reference reaches, which the core previews as one action', () => {
    const state = shop();
    const answer = hooks().act(
      { action: 'find-unreached', selection: [] },
      { model: modelReaderOf(state) },
    );
    expect(answer).toEqual({
      label: 'Mark the table no relation reaches: user',
      commands: [
        {
          type: 'update-element',
          id: 'settings',
          changes: { appearanceTraits: { stroke: UNREACHED_MARK.stroke, dash: 'dashed' } },
        },
      ],
    });
    const checked = checkChangesAnswer(
      JSON.parse(JSON.stringify(answer)),
      'Find tables no relation reaches',
    );
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const preview = previewPackageChanges(state, checked.value);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    const marked = preview.project.model.elements.find((each) => each.id === 'settings');
    expect(marked?.appearance).toEqual({ stroke: UNREACHED_MARK.stroke, dash: 'dashed' });
  });

  it('looks only at the selected tables, and proposes nothing when a reference reaches each', () => {
    const state = shop();
    const answer = hooks().act(
      { action: 'find-unreached', selection: ['orders', 'customers', 'orders-id'] },
      { model: modelReaderOf(state) },
    ) as { commands: unknown[] };
    expect(answer.commands).toEqual([]);
  });

  it('marks in a red that reads at 3:1 on both canvases', () => {
    for (const background of Object.values(CANVAS_BACKGROUNDS)) {
      expect(contrastRatio(UNREACHED_MARK.stroke, background)).toBeGreaterThanOrEqual(3);
    }
  });
});
