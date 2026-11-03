/**
 * The sample package that extends the app (M14.6, ADR 0089), `examples/word-count`: it opens as any
 * project does, with no warning, its files written as the program writes them, and its code, through
 * the real QuickJS engine, answers its action, importer, exporter and panel as the README says. And
 * the built-in Data modeling package's code, which runs as the program's own, the same way.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  DATA_MODELING,
  packageCodeOf,
  previewPackageChanges,
  type ExtensionHookName,
  type PackageCode,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { loadNodeEngine } from '@visual-anything/app/src/code/engine-node';
import type {
  CodeReply,
  ExtensionCall,
  ExtensionValues,
  PackageAnswer,
} from '@visual-anything/app/src/code/messages';
import { CodeRunner } from '@visual-anything/app/src/code/runner';
import { CodeSandbox } from '@visual-anything/app/src/code/sandbox';
import { formatFile } from '@visual-anything/schema/format';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openSession, type Session } from './session';

const FOLDER = resolve(import.meta.dirname, '../../../examples/word-count');

/** Generous: an engine slow under load. */
const LONG = 60_000;

let session: Session;

beforeAll(async () => {
  const opened = await openSession(FOLDER, { watch: false, out: () => {}, err: () => {} });
  if (!opened.ok) throw new Error('The sample package that extends the app does not open.');
  session = opened.session;
});

afterAll(async () => {
  await session.close();
});

/** Calls one hook of a package's code, approved with what it declares, in the real engine. */
async function call<H extends ExtensionHookName>(
  project: ProjectSnapshot,
  code: PackageCode,
  request: Extract<ExtensionCall, { hook: H }>,
): Promise<PackageAnswer<ExtensionValues[H]>> {
  const engine = await loadNodeEngine();
  const replies: CodeReply[] = [];
  const runner = new CodeRunner({
    // A busy machine never stops a call here: the limit is the sandbox's own business.
    newSandbox: () => Promise.resolve(new CodeSandbox(engine, { callMs: 5000 })),
    post: (reply) => replies.push(reply),
    pause: () => Promise.resolve(),
  });
  runner.receive({ kind: 'project', project });
  runner.receive({
    kind: 'packages',
    packages: [
      {
        package: code.package,
        name: code.name,
        hash: code.hash,
        code: code.text,
        declared: code.declared,
        granted: code.capabilities,
        stops: 0,
        ...(code.extensions === undefined ? {} : { extensions: code.extensions }),
      },
    ],
  });
  runner.receive({ kind: 'extension/call', call: 1, package: code.package, ...request });
  await runner.settled();
  const answered = replies.find((reply) => reply.kind === 'extension/answer');
  if (answered?.kind !== 'extension/answer') throw new Error('The call was not answered.');
  return answered.answer as PackageAnswer<ExtensionValues[H]>;
}

function sampleCode(project: ProjectSnapshot): PackageCode {
  const file = project.packages.find((each) => each.id === 'word-count');
  const code = file ? packageCodeOf(file) : undefined;
  if (!code) throw new Error('The sample package holds no code.');
  return code;
}

describe('the sample package that extends the app', () => {
  it('opens with no warning, and its files are written as the program writes them', () => {
    expect(session.warnings()).toEqual([]);
    for (const [kind, path] of [
      ['project', 'project.vaproject'],
      ['model', 'model.vamodel'],
      ['package', 'packages/word-count.vapackage'],
      ['view', 'views/notes.vaview'],
    ] as const) {
      const text = readFileSync(join(FOLDER, path), 'utf8');
      expect(formatFile(kind, JSON.parse(text) as never)).toBe(text);
    }
    // Its code waits for the person's approval: it is no built-in package's.
    expect(sampleCode(session.snapshot).builtIn).toBeUndefined();
  });

  it(
    'counts the words of the notes whose count is out of date, as changes the core previews',
    async () => {
      const project = session.snapshot;
      const answer = await call(project, sampleCode(project), {
        hook: 'act',
        input: { action: 'count-words', selection: [] },
      });
      expect(answer).toEqual({
        ok: true,
        value: {
          label: 'Count the words of 3 notes',
          commands: [
            { type: 'update-element', id: 'how', changes: { attributes: { words: 19 } } },
            { type: 'update-element', id: 'try', changes: { attributes: { words: 20 } } },
          ],
        },
      });
      if (!answer.ok) return;
      expect(previewPackageChanges(project, answer.value).ok).toBe(true);
    },
    LONG,
  );

  it(
    'imports a paragraph a note, writes Markdown, and answers the Words panel',
    async () => {
      const project = session.snapshot;
      const code = sampleCode(project);
      const text = readFileSync(join(FOLDER, 'notes.txt'), 'utf8');
      const imported = await call(project, code, {
        hook: 'importFile',
        input: { importer: 'paragraphs', name: 'notes.txt', text },
      });
      expect(imported.ok && imported.value.commands).toHaveLength(2);
      expect(imported.ok && imported.value.commands[0]).toMatchObject({
        type: 'create-element',
        element: { component: 'word-count.note', name: 'packages extend visual anything' },
      });
      if (imported.ok) expect(previewPackageChanges(project, imported.value).ok).toBe(true);

      const written = await call(project, code, {
        hook: 'exportFile',
        input: { exporter: 'markdown', view: 'notes' },
      });
      expect(written.ok && written.value.split('\n').slice(0, 5)).toEqual([
        '# Notes',
        '',
        '## Welcome',
        '',
        '_17 words_',
      ]);

      const panel = await call(project, code, {
        hook: 'panel',
        input: { panel: 'words', element: 'how' },
      });
      expect(panel.ok && panel.value.map((block) => block.kind)).toEqual([
        'value',
        'value',
        'value',
        'chart',
        'text',
        'button',
      ]);
      expect(panel.ok && panel.value[0]).toEqual({ kind: 'value', label: 'Words', value: 19 });
    },
    LONG,
  );
});

describe('the built-in Data modeling package’s code, in the real engine', () => {
  const table = (id: string, name: string) => ({ id, component: 'data-modeling.table', name });
  const column = (id: string, name: string, attributes: Record<string, unknown>) => ({
    id,
    component: 'data-modeling.column',
    name,
    attributes,
  });
  const of = (from: string, to: string) => ({
    id: `${from}-of`,
    relationType: 'data-modeling.is-column-of',
    from,
    to,
  });
  const project: ProjectSnapshot = {
    project: { schemaVersion: 1, name: 'Shop', packages: ['data-modeling'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        table('customers', 'customers'),
        column('customers-id', 'id', { type: 'uuid', primaryKey: true }),
        table('orders', 'orders'),
        column('orders-customer', 'customer_id', { type: 'uuid' }),
        table('audit', 'audit'),
      ],
      relations: [
        of('customers-id', 'customers'),
        of('orders-customer', 'orders'),
        {
          id: 'fk',
          relationType: 'data-modeling.references',
          from: 'orders-customer',
          to: 'customers-id',
        },
      ],
    },
    packages: [DATA_MODELING],
    views: [],
    scenarios: [],
    tours: [],
    comments: [],
  };
  const code = packageCodeOf(DATA_MODELING) as PackageCode;

  it(
    'writes SQL DDL and finds the tables no relation reaches',
    async () => {
      expect(code.builtIn).toBe(true);
      const sql = await call(project, code, {
        hook: 'exportFile',
        input: { exporter: 'sql-ddl' },
      });
      expect(sql.ok && sql.value).toContain(
        'ALTER TABLE orders\n  ADD FOREIGN KEY (customer_id) REFERENCES customers (id);',
      );
      expect(sql.ok && sql.value).toContain(
        '-- The model gives it no columns.\nCREATE TABLE audit ();',
      );
      const found = await call(project, code, {
        hook: 'act',
        input: { action: 'find-unreached', selection: [] },
      });
      expect(found.ok && found.value).toMatchObject({
        label: 'Mark the table no relation reaches: audit',
        commands: [{ type: 'update-element', id: 'audit' }],
      });
    },
    LONG,
  );
});
