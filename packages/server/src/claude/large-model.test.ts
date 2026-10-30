/**
 * A large database from Claude (M3d, "Large models from Claude"): 72 tables with 1,080 columns and
 * their foreign keys, sent through the real tool path, from an MCP client through the MCP server and
 * the bridge to a running program, as add_to_model calls of at most MAX_ADDITIONS items. The batches
 * name one another by ids Claude chose, t.<schema>.<table> and c.<schema>.<table>.<column>, as the
 * SQL recipe says. Each batch must be one action of Claude's, and the project must still open.
 */
import { DATA_MODELING, SYSTEMS, checkProject, type ProjectSnapshot } from '@visual-anything/core';
import { afterEach, describe, expect, it } from 'vitest';
import { loadProject } from '../project';
import { MAX_ADDITIONS } from './batches';
import { startToolHarness, type ToolHarness } from './tool-harness';

const SCHEMAS = 8;
const TABLES_PER_SCHEMA = 9;
const COLUMNS_PER_TABLE = 15;

/** An empty project using Systems and Data modeling. */
function emptyProject(): ProjectSnapshot {
  return {
    project: { schemaVersion: 1, name: 'Audit', packages: ['systems', 'data-modeling'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [],
      relations: [],
    },
    packages: [SYSTEMS, DATA_MODELING],
    views: [],
    scenarios: [],
    tours: [],
    comments: [],
  };
}

type Item =
  | { kind: 'element'; value: Record<string, unknown> & { id: string } }
  | { kind: 'relation'; value: Record<string, unknown> & { id: string; from: string; to: string } };

/**
 * The database as add_to_model items, in the order the recipe sends them: the database, its schemas,
 * then each table with its columns and the foreign keys of its table. Table j of a schema references
 * table j - 1; the first table of every schema but the first references the very first table, which
 * an early batch sends and a late one names.
 */
function database(): Item[] {
  const items: Item[] = [
    {
      kind: 'element',
      value: {
        id: 'db.audit',
        component: 'systems.database',
        name: 'audit',
        attributes: { engine: 'postgres' },
      },
    },
  ];
  const partOf = (container: string) => ({
    inside: [container],
    nestingRelationType: 'systems.is-part-of',
  });
  for (let s = 0; s < SCHEMAS; s++) {
    items.push({
      kind: 'element',
      value: {
        id: `s.s${s}`,
        component: 'data-modeling.schema',
        name: `s${s}`,
        ...partOf('db.audit'),
      },
    });
  }
  for (let s = 0; s < SCHEMAS; s++) {
    for (let t = 0; t < TABLES_PER_SCHEMA; t++) {
      const table = `t.s${s}.t${t}`;
      items.push({
        kind: 'element',
        value: { id: table, component: 'data-modeling.table', name: `t${t}`, ...partOf(`s.s${s}`) },
      });
      const references = t > 0 ? `c.s${s}.t${t - 1}.id` : s > 0 ? 'c.s0.t0.id' : undefined;
      for (let c = 0; c < COLUMNS_PER_TABLE; c++) {
        const name =
          c === 0 ? 'id' : c === 1 && references !== undefined ? 'parent_id' : `col_${c}`;
        items.push({
          kind: 'element',
          value: {
            id: `c.s${s}.t${t}.${name}`,
            component: 'data-modeling.column',
            name,
            inside: [table],
            nestingRelationType: 'data-modeling.is-column-of',
            attributes: c === 0 ? { type: 'uuid', primaryKey: true } : { type: 'text' },
          },
        });
      }
      if (references !== undefined) {
        items.push({
          kind: 'relation',
          value: {
            id: `fk.s${s}.t${t}.parent_id`,
            relationType: 'data-modeling.references',
            from: `c.s${s}.t${t}.parent_id`,
            to: references,
            attributes: { onDelete: 'cascade' },
          },
        });
      }
    }
  }
  return items;
}

/** The items in add_to_model calls of at most MAX_ADDITIONS, in order. */
function inBatches(items: readonly Item[]) {
  const batches: { label: string; elements: Item['value'][]; relations: Item['value'][] }[] = [];
  for (let at = 0; at < items.length; at += MAX_ADDITIONS) {
    const part = items.slice(at, at + MAX_ADDITIONS);
    batches.push({
      label: '',
      elements: part.flatMap((each) => (each.kind === 'element' ? [each.value] : [])),
      relations: part.flatMap((each) => (each.kind === 'relation' ? [each.value] : [])),
    });
  }
  return batches.map((batch, index) => ({
    ...batch,
    label: `Import the audit database (${index + 1} of ${batches.length})`,
  }));
}

let tools: ToolHarness | undefined;

afterEach(async () => {
  await tools?.close();
  tools = undefined;
});

describe('a large database from Claude, in batches', () => {
  it('lands as one action per batch, by ids the batches share, and the project still opens', async () => {
    const items = database();
    const elements = items.filter((each) => each.kind === 'element');
    const tables = elements.filter((each) => each.value.component === 'data-modeling.table');
    const columns = elements.filter((each) => each.value.component === 'data-modeling.column');
    expect(tables.length).toBeGreaterThanOrEqual(70);
    expect(columns.length).toBeGreaterThanOrEqual(1000);
    const batches = inBatches(items);
    expect(batches.length).toBeGreaterThanOrEqual(3);

    // The batch each id is sent in; some relations and columns name what an earlier batch sent.
    const batchOf = new Map<string, number>();
    batches.forEach((batch, index) => {
      for (const each of [...batch.elements, ...batch.relations]) batchOf.set(each.id, index);
    });
    const crossing = (from: string, to: string) =>
      (batchOf.get(to) ?? 0) < (batchOf.get(from) ?? 0);
    const foreignKeys = items.flatMap((each) => (each.kind === 'relation' ? [each.value] : []));
    expect(foreignKeys.filter((each) => crossing(each.id, each.to)).length).toBeGreaterThan(0);
    expect(
      columns.filter((each) => crossing(each.value.id, (each.value.inside as string[])[0] ?? ''))
        .length,
    ).toBeGreaterThan(0);

    const harness = await startToolHarness(emptyProject());
    tools = harness;
    const app = await harness.openApp();
    for (const batch of batches) {
      const answer = await harness.value('add_to_model', batch);
      expect(answer).toMatchObject({
        done: batch.label,
        undo: 'The person can undo it in the app.',
        elements: batch.elements.map((each) => each.id),
        relations: batch.relations.map((each) => each.id),
      });
      // Every nesting relation inside made, one per element given.
      expect(answer.nesting).toHaveLength(batch.elements.filter((each) => each.inside).length);
    }

    // One action of Claude's per batch, with its label.
    await expect
      .poll(() => app.messages.filter((message) => message.type === 'project/changed').length)
      .toBe(batches.length);
    const changes = app.messages.flatMap((message) =>
      message.type === 'project/changed' ? [message] : [],
    );
    expect(changes.map((change) => [change.author, change.label])).toEqual(
      batches.map((batch) => ['claude', batch.label]),
    );
    expect(harness.session.history.undo).toEqual({
      label: batches.at(-1)?.label,
      author: 'claude',
    });

    // The model holds everything by the ids given, with every foreign key between its columns.
    const { model } = harness.session.snapshot;
    expect(model.elements.map((each) => each.id)).toEqual(elements.map((each) => each.value.id));
    for (const key of foreignKeys) {
      expect(model.relations).toContainEqual(
        expect.objectContaining({
          id: key.id,
          relationType: 'data-modeling.references',
          from: key.from,
          to: key.to,
        }),
      );
    }
    expect(checkProject(harness.session.snapshot).errors).toEqual([]);

    // What it saved validates: the folder opens with every file's schema and the core's rules.
    await harness.session.idle();
    const opened = await loadProject(harness.session.folder);
    expect(opened.ok ? [] : opened.errors).toEqual([]);
    expect(opened.ok && opened.project.model.elements.length).toBe(elements.length);
  }, 120_000);
});
