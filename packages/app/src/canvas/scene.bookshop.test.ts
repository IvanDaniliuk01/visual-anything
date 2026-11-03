/**
 * The data modeling sample, "Bookshop database" (R1), as the canvas's scene draws it: it opens clean,
 * each of its views sits where the app's layout puts it, its scenario follows foreign keys that are
 * in the model, and the built-in package's SQL DDL exporter writes every table with its keys.
 */
import { runInNewContext } from 'node:vm';
import { DATA_MODELING, checkProject, modelReaderOf } from '@visual-anything/core';
import ELK from 'elkjs/lib/elk.bundled.js';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { layoutCommand } from './layout/command';
import { layOut } from './layout/engine';
import { layoutInput } from './layout/input';
import { inputAfter } from './layout/settle';
import { buildSceneAfresh } from './scene';

const project = loadSample('bookshop-database');
const VIEWS = ['catalog', 'overview', 'sales'];

/** The SQL DDL the built-in Data modeling package's code writes of a project. */
function sqlDdl(): string {
  const text = (DATA_MODELING.code ?? []).join('\n').replace(/^export function /gm, 'function ');
  const { exportFile } = runInNewContext(`${text}\n({ exportFile });`, {}) as {
    exportFile: (input: unknown, context: unknown) => string;
  };
  return exportFile({ exporter: 'sql-ddl' }, { model: modelReaderOf(project) });
}

describe('the data modeling sample', () => {
  it('opens with nothing to warn about, using Systems and Data modeling', () => {
    expect(checkProject(project)).toEqual({ errors: [], warnings: [] });
    expect(project.project.packages).toEqual(['systems', 'data-modeling']);
    expect(project.views.map((view) => view.id)).toEqual(VIEWS);
  });

  it('holds two schemas and six tables, each table in its schema', () => {
    const of = (component: string) =>
      project.model.elements.filter((each) => each.component === component).map((each) => each.id);
    expect(of('data-modeling.schema')).toEqual(['catalog', 'sales']);
    const tables = of('data-modeling.table');
    expect(tables).toEqual([
      'authors',
      'publishers',
      'books',
      'customers',
      'orders',
      'order-lines',
    ]);
    for (const table of tables) {
      const element = project.model.elements.find((each) => each.id === table);
      const schema = project.model.relations.find(
        (each) => each.relationType === 'systems.is-part-of' && each.from === table,
      );
      expect(schema?.to, table).toBe(element?.attributes?.schema);
    }
  });

  it.each(VIEWS)(
    'keeps %s where the app’s layout puts it: laying it out again moves nothing',
    { timeout: 30_000 },
    async (view) => {
      const elk = new ELK();
      const scope = { kind: 'view' } as const;
      const scene = buildSceneAfresh(project, view);
      const input = layoutInput(scene, project, scope);
      if (!input) throw new Error('Nothing to lay out.');
      let result = await layOut(input, elk);
      const again = inputAfter(project, view, scene, scope, input, result.shapes);
      if (again) result = await layOut(again, elk);
      expect(layoutCommand(project, view, scene, scope, result.shapes)).toBeUndefined();
    },
  );

  it('plays a scenario along foreign keys of the model', () => {
    const references = new Set(
      project.model.relations
        .filter((each) => each.relationType === 'data-modeling.references')
        .map((each) => each.id),
    );
    const [scenario] = project.scenarios;
    expect(scenario?.view).toBe('overview');
    // Each foreign key once, from the order to its customer, then from its line to the book's author.
    expect(scenario?.steps.flatMap((step) => step.relations).sort()).toEqual(
      [...references].sort(),
    );
  });

  it('exports to SQL DDL with every schema, table, primary key and foreign key, and no note', () => {
    const sql = sqlDdl();
    expect(sql).toContain(
      'CREATE SCHEMA IF NOT EXISTS catalog;\nCREATE SCHEMA IF NOT EXISTS sales;',
    );
    for (const table of [
      'catalog.authors',
      'catalog.publishers',
      'catalog.books',
      'sales.customers',
      'sales.orders',
      'sales.order_lines',
    ]) {
      expect(sql).toContain(`CREATE TABLE ${table} (`);
    }
    expect(sql).toContain('  PRIMARY KEY (order_id, book_id)\n');
    expect(sql).toContain(
      "  status varchar(20) NOT NULL DEFAULT 'placed' CHECK (status in ('placed', 'paid', 'shipped', 'cancelled')),\n",
    );
    expect(sql).toContain(
      'ALTER TABLE sales.order_lines\n  ADD FOREIGN KEY (book_id) REFERENCES catalog.books (id) ON DELETE RESTRICT;',
    );
    expect(sql).toContain(
      'ALTER TABLE catalog.books\n  ADD FOREIGN KEY (publisher_id) REFERENCES catalog.publishers (id) ON DELETE SET NULL;',
    );
    expect(sql.match(/ADD FOREIGN KEY/g)).toHaveLength(5);
    // Every line that is not a comment is SQL: no column was left without its type, default or check.
    for (const line of sql.split('\n')) expect(line).not.toMatch(/\S.*-- /);
  });
});
