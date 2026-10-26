/**
 * The spreadsheet reader (ADR-0042, R35): CSV and TSV with element columns and relation columns,
 * quoted as RFC 4180 says; tables separated by a blank line; values kept as written; rows matched to
 * the project's elements by a key column when importing again; and refusals for what cannot be read.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { systemsProject } from './fixtures/projects';
import {
  ELEMENTS_AND_RELATIONS,
  HOSTILE_CELLS,
  SEMICOLONS,
  TAB_SEPARATED,
  UNCLOSED_QUOTE,
} from './fixtures/tables';
import type { ImportPlan } from './plan';
import { IMPORT_LIMITS } from './plan';
import { TABLE, parseDelimited, readTable } from './table';
import type { ReadOptions } from './reader';
import { testProject } from '../test/fixtures';
import { cpuNow } from '../test/cpu';

function read(text: string, name = 'model.csv', options: ReadOptions = {}): ImportPlan {
  const result = readTable({ name, text }, options);
  if (!result.ok) throw new Error(result.problems.join(' '));
  return result.plan;
}

describe('a spreadsheet of elements and relations', () => {
  const plan = read(ELEMENTS_AND_RELATIONS);

  it('reads its elements with their ids, names, components, containers and attributes', () => {
    expect(plan.format).toBe('csv');
    expect(plan.elements).toEqual([
      {
        key: 'shop',
        sourceId: 'shop',
        name: 'Shop',
        kind: 'System',
        attributes: { owner: 'Team A' },
      },
      {
        key: 'api',
        sourceId: 'api',
        name: 'Checkout API',
        kind: 'Service',
        attributes: { owner: 'Team B', latency: '120' },
      },
      {
        key: 'db',
        sourceId: 'db',
        name: 'Orders, archived',
        kind: 'Database',
        attributes: { owner: 'Team B' },
      },
      { key: 'web', sourceId: 'web', name: 'Web "front"', kind: 'Service' },
    ]);
    expect(plan.containment).toEqual([
      { element: 'api', container: 'shop' },
      { element: 'db', container: 'shop' },
      { element: 'web', container: 'shop' },
    ]);
    expect(plan.views).toEqual([]);
  });

  it('reads external identifiers from columns named by their scheme, such as id:uberon', () => {
    const anatomy = read(
      'name,ID: UBERON,id:fma,id:uberon,id:not a scheme\nHeart,UBERON:0000948,FMA:7088,x,y\nLung,,,,\n',
    );
    expect(anatomy.elements.map((each) => [each.name, each.ids, each.attributes])).toEqual([
      ['Heart', { uberon: 'UBERON:0000948', fma: 'FMA:7088' }, { 'id:not a scheme': 'y' }],
      ['Lung', undefined, undefined],
    ]);
    expect(anatomy.unmatched).toContainEqual({
      text: 'x',
      why: 'This column repeats the scheme "uberon", so it is not read.',
    });
  });

  it('reads its relations, with ends named by id or by name', () => {
    expect(plan.relations).toEqual([
      {
        key: 'relation 1',
        from: 'api',
        to: 'db',
        kind: 'writes to',
        name: 'Stores orders',
        attributes: { protocol: 'SQL' },
      },
      {
        key: 'relation 2',
        from: 'web',
        to: 'api',
        kind: 'calls',
        attributes: { protocol: 'HTTPS' },
      },
    ]);
  });

  it('offers the components and relation types as written, with suggestions', () => {
    expect(plan.kinds).toEqual({
      elements: [
        { kind: 'System', label: 'System', count: 1, suggested: 'systems.system' },
        { kind: 'Service', label: 'Service', count: 2, suggested: 'systems.service' },
        { kind: 'Database', label: 'Database', count: 1, suggested: 'systems.database' },
      ],
      relations: [
        { kind: 'writes to', label: 'writes to', count: 1, suggested: 'systems.writes-to' },
        { kind: 'calls', label: 'calls', count: 1, suggested: 'systems.communicates-with' },
      ],
    });
    expect(plan.unmatched).toEqual([]);
  });

  it('reads the same from TSV', () => {
    const tabs = read(TAB_SEPARATED, 'model.tsv');
    expect(tabs.format).toBe('tsv');
    expect({ ...tabs, format: 'csv', source: 'model.csv' }).toEqual(plan);
  });

  it('finds semicolons, keeps a decimal comma as text, and suggests from the project’s own names', () => {
    const project = systemsProject();
    const plan = read(SEMICOLONS, 'pasted text', { project });
    expect(plan.format).toBe('csv');
    expect(plan.elements.map((each) => [each.name, each.kind, each.attributes])).toEqual([
      ['Agenda', 'Service', { Owner: 'Clínica', Cost: '12,5' }],
      ['Turnos', 'Database', { Owner: 'Clínica' }],
    ]);
    expect(plan.kinds.elements.map((each) => each.suggested)).toEqual([
      'systems.service',
      'systems.database',
    ]);
  });

  it('suggests a component the project names by its id or its name, before any built-in word', () => {
    const plan = read('name,component\nA,test.service\nB,box\nC,Gadget', 'x.csv', {
      project: testProject(),
    });
    expect(plan.kinds.elements.map((each) => [each.kind, each.suggested])).toEqual([
      ['test.service', 'test.service'],
      ['box', 'test.box'],
      ['Gadget', undefined],
    ]);
  });
});

describe('importing a spreadsheet again', () => {
  const project = testProject();

  it('matches rows to elements by id, updating their values and leaving the rest', () => {
    const plan = read(
      'id,name,component,container,latency\napi,API v2,Service,nowhere,5\nfresh,Fresh,Service,system,\n',
      'again.csv',
      { project },
    );
    expect(plan.elements).toEqual([
      {
        key: 'api',
        name: 'API v2',
        kind: 'Service',
        existing: 'api',
        attributes: { latency: '5' },
      },
      { key: 'fresh', sourceId: 'fresh', name: 'Fresh', kind: 'Service' },
      { key: 'system', name: 'System', kind: '', existing: 'system' },
    ]);
    // A matched row keeps its containers; a new one goes where the row says, even into an element
    // of the project.
    expect(plan.containment).toEqual([{ element: 'fresh', container: 'system' }]);
    // What matched counts toward no kind, since it is not created; the project's own Service first.
    expect(plan.kinds.elements).toEqual([
      { kind: 'Service', label: 'Service', count: 1, suggested: 'test.service' },
    ]);
  });

  it('matches by another column the person chooses: the name, or an attribute', () => {
    const byName = read('name,latency\nAPI,7\nNew one,\n', 'again.csv', { project, key: 'name' });
    expect(byName.elements.map((each) => [each.name, each.existing])).toEqual([
      ['API', 'api'],
      ['New one', undefined],
    ]);
    const byAttribute = read('name,latency\nRenamed,20\n', 'again.csv', {
      project,
      key: 'latency',
    });
    expect(byAttribute.elements[0]).toMatchObject({ existing: 'api', name: 'Renamed' });
  });

  it('leaves out a row whose key matches several elements, and says so', () => {
    const plan = read('name,owner\nTwin,x\n', 'again.csv', {
      project: {
        ...project,
        model: {
          ...project.model,
          elements: [
            ...project.model.elements,
            { id: 't1', component: 'test.box', name: 'Twin' },
            { id: 't2', component: 'test.box', name: 'Twin' },
          ],
        },
      },
      key: 'name',
    });
    expect(plan.elements).toEqual([]);
    expect(plan.unmatched).toEqual([
      { text: 'Twin', why: '"Twin" matches 2 elements of the project, so the row is left out.' },
    ]);
  });

  it('ends relations on the project’s elements, by id or by a name only one has', () => {
    const plan = read('from,to,kind\nclient,DB,calls\nclient,ghost,calls\n', 'r.csv', { project });
    expect(plan.relations.map((each) => [each.from, each.to])).toEqual([['client', 'db']]);
    expect(plan.elements.map((each) => [each.key, each.existing])).toEqual([
      ['client', 'client'],
      ['db', 'db'],
    ]);
    expect(plan.unmatched).toEqual([
      {
        text: 'ghost',
        why: '"ghost" names no element of the file or the project, so the row is left out.',
      },
    ]);
  });

  it('refuses a key column the spreadsheet does not have', () => {
    expect(readTable({ name: 'x.csv', text: 'name\nA\n' }, { project, key: 'email' })).toEqual({
      ok: false,
      problems: ['The spreadsheet has no column "email" to match its rows by.'],
    });
  });
});

describe('hostile spreadsheets', () => {
  it('refuses a quote that never closes, saying where it opens', () => {
    expect(readTable({ name: 'x.csv', text: UNCLOSED_QUOTE })).toEqual({
      ok: false,
      problems: ['A quote that opens on line 3 never closes.'],
    });
  });

  it('keeps HTML, entities and formulas as text, exactly as written', () => {
    const plan = read(HOSTILE_CELLS);
    expect(plan.elements.map((each) => [each.name, each.attributes])).toEqual([
      ['<script>alert(1)</script>', { note: '=HYPERLINK("http://example.com")' }],
      ['&lt;b&gt;', { note: '&amp;' }],
    ]);
  });

  it('reports rows without a name, ids given twice and columns without a header', () => {
    const plan = read('id,name,\na,A,x\na,Again,\nb,,\n,,\n');
    expect(plan.elements.map((each) => each.key)).toEqual(['a', 'b']);
    expect(plan.elements[1]?.name).toBe('b');
    expect(plan.unmatched).toEqual([
      { text: 'x', why: 'This column has no header, so it is not read.' },
      { text: 'a', why: 'The id "a" is given to an earlier row, so this row is left out.' },
    ]);
  });

  it('refuses more rows than an import brings, and a table it cannot tell the kind of', () => {
    const rows = Array.from({ length: IMPORT_LIMITS.elements + 1 }, (_, at) => `n${at}`);
    expect(readTable({ name: 'big.csv', text: `name\n${rows.join('\n')}` })).toEqual({
      ok: false,
      problems: ['The file holds more than 20,000 elements; an import brings at most 20,000.'],
    });
    expect(readTable({ name: 'odd.csv', text: 'owner,cost\nA,1\n' })).toEqual({
      ok: false,
      problems: [
        'The table that starts on line 1 has no name or id column for elements, and no from and to columns for relations.',
      ],
    });
    expect(readTable({ name: 'empty.csv', text: '\n\n' })).toEqual({
      ok: false,
      problems: ['The spreadsheet holds no table.'],
    });
  });

  it('cuts a megabyte cell to a name, quickly', () => {
    const start = cpuNow();
    const plan = read(`name\n"${'y'.repeat(1024 * 1024)}"\n`);
    expect(cpuNow() - start).toBeLessThan(2_000);
    expect(plan.elements[0]?.name).toHaveLength(1_000);
  });
});

describe('parseDelimited', () => {
  /** Writes cells as RFC 4180 says, quoting those that need it. */
  function write(rows: string[][], delimiter: string): string {
    return rows
      .map((row) =>
        row
          .map((cell) =>
            /["\r\n]/.test(cell) || cell.includes(delimiter) || cell !== cell.trim()
              ? `"${cell.replaceAll('"', '""')}"`
              : cell,
          )
          .join(delimiter),
      )
      .join('\r\n');
  }

  it('reads back whatever cells were written, in every delimiter', () => {
    fc.assert(
      fc.property(
        fc.array(fc.array(fc.string({ maxLength: 12 }), { minLength: 1, maxLength: 5 }), {
          minLength: 1,
          maxLength: 8,
        }),
        fc.constantFrom(',', '\t', ';'),
        (rows, delimiter) => {
          // A row of one empty cell writes an empty line, which reads as no row.
          const kept = rows.filter((row) => row.length > 1 || row[0] !== '');
          const parsed = parseDelimited(write(kept, delimiter), delimiter);
          expect(parsed.ok).toBe(true);
          if (parsed.ok) expect(parsed.rows.map((row) => row.cells)).toEqual(kept);
        },
      ),
    );
  });

  it('tells each row the line it starts on', () => {
    const parsed = parseDelimited('a,b\n"multi\nline",c\nd,e', ',');
    expect(parsed.ok && parsed.rows.map((row) => row.line)).toEqual([1, 2, 4]);
  });
});

describe('the table reader', () => {
  it('recognizes spreadsheets by name, and pasted text by a header it knows', () => {
    expect(TABLE.recognizes({ name: 'x.csv', text: '' })).toBe(true);
    expect(TABLE.recognizes({ name: 'x.TSV', text: '' })).toBe(true);
    expect(TABLE.recognizes({ name: 'pasted', text: 'name,component\nA,B' })).toBe(true);
    expect(TABLE.recognizes({ name: 'pasted', text: 'from\tto\na\tb' })).toBe(true);
    expect(TABLE.recognizes({ name: 'pasted', text: 'flowchart LR\n a --> b' })).toBe(false);
  });
});
