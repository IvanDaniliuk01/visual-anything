/**
 * The spreadsheet reader (ADR-0042, R35): CSV and TSV, pasted or opened, with element columns and
 * relation columns, as Kumu reads them. A file holds one table or several, separated by a blank line,
 * each with a header row:
 *
 * - **Elements:** `id`, `name` (or `label`), `component` (or `kind`), `container` (or `parent`) and
 *   `description`; `id:<scheme>`, such as `id:uberon`, for the element's identifier in that scheme
 *   (ADR 0056); every other column is an attribute, named by its header.
 * - **Relations:** a table whose header has `from` and `to` (or `source` and `target`), with
 *   `relation type` (or `type`, `kind`), `name` (or `label`) and `id`; every other column is an
 *   attribute.
 *
 * A cell is read as text, exactly as written: no formula runs, and HTML stays text. Importing again
 * matches rows to the project's elements by a key column, the `id` one by default, so that it updates
 * their values and creates only what is new.
 */
import type { Attributes } from '@visual-anything/schema';
import { PastLimits, PlanBuilder } from './builder';
import { IMPORT_LIMITS } from './plan';
import {
  FORBIDDEN_NAME,
  hasExtension,
  own,
  type ImportInput,
  type ImportReader,
  type ReadOptions,
  type ReadResult,
} from './reader';
import { References, type MatchBy } from './references';
import { kindSuggester, type KindSuggester } from './suggest';
import { MAX_IMPORT_TEXT, oneLine } from './text';

/** A record of the file: its cells, and the line it starts on, counted from 1. */
export interface Row {
  cells: string[];
  line: number;
}

/**
 * The most records a spreadsheet may hold: a row for every element and relation an import brings,
 * and room for headers and blank lines.
 */
export const MAX_ROWS = IMPORT_LIMITS.elements + IMPORT_LIMITS.relations + 1_000;

/** The delimiters a spreadsheet may use. */
export type Delimiter = ',' | '\t' | ';';

/** What each column of a table is for. */
type ElementRole = 'id' | 'name' | 'component' | 'container' | 'description';
type RelationRole = 'id' | 'from' | 'to' | 'type' | 'name';

const ELEMENT_HEADERS: Readonly<Record<string, ElementRole>> = {
  id: 'id',
  name: 'name',
  label: 'name',
  title: 'name',
  component: 'component',
  kind: 'component',
  container: 'container',
  parent: 'container',
  description: 'description',
};

const RELATION_HEADERS: Readonly<Record<string, RelationRole>> = {
  id: 'id',
  from: 'from',
  source: 'from',
  to: 'to',
  target: 'to',
  relationtype: 'type',
  type: 'type',
  kind: 'type',
  name: 'name',
  label: 'name',
};

/** A header as columns are matched: without case, spaces, underscores or dashes. */
function normal(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

/** The spreadsheet reader, as the import dialog, the command line and Claude's tools list it. */
export const TABLE: ImportReader = {
  format: 'table',
  name: 'Spreadsheet',
  extensions: ['.csv', '.tsv', '.tab'],
  recognizes: (input) => hasExtension(input.name, TABLE.extensions) || looksLikeTable(input.text),
  read: (input, options) => readTable(input, options),
};

/** Whether pasted text starts with a header row this reader knows. */
function looksLikeTable(text: string): boolean {
  const first = text
    .slice(0, 4096)
    .split(/\r\n|\r|\n/)
    .find((line) => line.trim() !== '');
  if (first === undefined) return false;
  const delimiter = delimiterOf(first, '');
  if (!first.includes(delimiter)) return false;
  const headers = new Set(first.split(delimiter).map((cell) => normal(cell.replaceAll('"', ''))));
  return headers.has('name') || headers.has('label') || (headers.has('from') && headers.has('to'));
}

/** The delimiter a file uses: a tab for `.tsv`, otherwise the one its first line uses most. */
function delimiterOf(firstLine: string, name: string): Delimiter {
  if (hasExtension(name, ['.tsv', '.tab'])) return '\t';
  let quoted = false;
  const counts = { ',': 0, '\t': 0, ';': 0 };
  for (const char of firstLine) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === ',' || char === '\t' || char === ';')) counts[char] += 1;
  }
  if (counts['\t'] > 0 && counts['\t'] >= counts[','] && counts['\t'] >= counts[';']) return '\t';
  return counts[';'] > counts[','] ? ';' : ',';
}

/**
 * The records of delimited text, as RFC 4180 reads them: a cell in double quotes may hold the
 * delimiter, line breaks and quotes written twice. A quote in the middle of a cell is kept as text.
 * An empty line is a record of one empty cell; the line break at the end of the text ends the last
 * record. Refused only when a quote never closes.
 */
export function parseDelimited(
  text: string,
  delimiter: string,
  /** The most records it reads; past them, it stops and says so. */
  limit = Number.POSITIVE_INFINITY,
): { ok: true; rows: Row[] } | { ok: false; problem: string } {
  const rows: Row[] = [];
  const separator = delimiter.charCodeAt(0);
  let cells: string[] = [];
  let cell = '';
  let line = 1;
  let rowLine = 1;
  let at = 0;
  const length = text.length;
  const endRow = () => {
    cells.push(cell);
    rows.push({ cells, line: rowLine });
    cells = [];
    cell = '';
  };
  while (at < length) {
    const code = text.charCodeAt(at);
    if (code === 0x22 && cell === '') {
      // A quoted cell: up to the quote that is not written twice.
      const opened = line;
      at += 1;
      let closed = false;
      while (at < length) {
        const next = text.indexOf('"', at);
        if (next < 0) break;
        const piece = text.slice(at, next);
        cell += piece;
        line += countBreaks(piece);
        if (text.charCodeAt(next + 1) === 0x22) {
          cell += '"';
          at = next + 2;
          continue;
        }
        at = next + 1;
        closed = true;
        break;
      }
      if (!closed)
        return { ok: false, problem: `A quote that opens on line ${opened} never closes.` };
      // Whatever follows the closing quote, up to the delimiter, is kept as text.
      continue;
    }
    if (code === separator) {
      cells.push(cell);
      cell = '';
      at += 1;
      continue;
    }
    if (code === 0x0a || code === 0x0d) {
      if (rows.length >= limit) {
        return {
          ok: false,
          problem: `The file holds more rows than an import brings: at most ${limit.toLocaleString('en')}.`,
        };
      }
      endRow();
      at += code === 0x0d && text.charCodeAt(at + 1) === 0x0a ? 2 : 1;
      line += 1;
      rowLine = line;
      continue;
    }
    // Plain text, up to the next quote, delimiter or line break.
    let end = at + 1;
    while (end < length) {
      const each = text.charCodeAt(end);
      if (each === separator || each === 0x0a || each === 0x0d || each === 0x22) break;
      end += 1;
    }
    cell += text.slice(at, end);
    at = end;
    // A quote inside a cell is text, not the start of a quoted one.
    if (at < length && text.charCodeAt(at) === 0x22) {
      cell += '"';
      at += 1;
    }
  }
  if (cell !== '' || cells.length > 0) endRow();
  return { ok: true, rows };
}

function countBreaks(text: string): number {
  let breaks = 0;
  for (let at = text.indexOf('\n'); at >= 0; at = text.indexOf('\n', at + 1)) breaks += 1;
  for (let at = text.indexOf('\r'); at >= 0; at = text.indexOf('\r', at + 1)) {
    if (text[at + 1] !== '\n') breaks += 1;
  }
  return breaks;
}

/** A table of the file: its header row and the rows under it. */
interface Table {
  header: Row;
  rows: Row[];
}

/** Whether a row is empty: every cell blank. */
function isBlank(row: Row): boolean {
  return row.cells.every((cell) => cell.trim() === '');
}

/** Whether a row reads as a header that starts a table after a blank line. */
function isHeader(row: Row): boolean {
  const headers = new Set(row.cells.map(normal));
  return headers.has('name') || headers.has('label') || (headers.has('from') && headers.has('to'));
}

/** The tables of the records: a blank line followed by a header starts another. */
function tablesOf(rows: readonly Row[]): Table[] {
  const tables: Table[] = [];
  let current: Table | undefined;
  let afterBlank = false;
  for (const row of rows) {
    if (isBlank(row)) {
      afterBlank = true;
      continue;
    }
    if (current === undefined || (afterBlank && isHeader(row))) {
      current = { header: row, rows: [] };
      tables.push(current);
    } else current.rows.push(row);
    afterBlank = false;
  }
  return tables;
}

/** The columns of a table: the role of each, or the attribute it holds, or nothing to read. */
interface Columns<Role extends string> {
  roles: Map<Role, number>;
  attributes: Map<number, string>;
  /** The columns that hold external identifiers, with their scheme: `id:uberon` holds `uberon`'s. */
  schemes: Map<number, string>;
  /** Columns that are not read, with why, reported at the first value they hold. */
  unread: Map<number, string>;
}

/** A header that names a scheme of external identifiers, such as `id:uberon`. */
const SCHEME_HEADER = /^id:\s*([a-z][a-z0-9_-]{0,31})$/i;

function columnsOf<Role extends string>(
  header: Row,
  known: Readonly<Record<string, Role>>,
  withSchemes = false,
): Columns<Role> {
  const roles = new Map<Role, number>();
  const attributes = new Map<number, string>();
  const schemes = new Map<number, string>();
  const unread = new Map<number, string>();
  const named = new Set<string>();
  header.cells.forEach((cell, at) => {
    const name = oneLine(cell);
    if (name === '') {
      unread.set(at, 'This column has no header, so it is not read.');
      return;
    }
    const role = own(known, normal(name));
    if (role !== undefined && !roles.has(role)) {
      roles.set(role, at);
      return;
    }
    const scheme = withSchemes ? SCHEME_HEADER.exec(name)?.[1]?.toLowerCase() : undefined;
    if (scheme !== undefined) {
      if ([...schemes.values()].includes(scheme)) {
        unread.set(at, `This column repeats the scheme "${scheme}", so it is not read.`);
      } else schemes.set(at, scheme);
      return;
    }
    if (name === FORBIDDEN_NAME) {
      unread.set(at, `No attribute may be named "${FORBIDDEN_NAME}", so this column is not read.`);
      return;
    }
    if (named.has(name)) {
      unread.set(at, `This column repeats the header "${name}", so it is not read.`);
      return;
    }
    named.add(name);
    attributes.set(at, name);
  });
  return { roles, attributes, schemes, unread };
}

/** Reads a spreadsheet into a plan, or says why it cannot. */
export function readTable(input: ImportInput, options: ReadOptions = {}): ReadResult {
  if (input.text.length > MAX_IMPORT_TEXT) {
    return {
      ok: false,
      problems: ['The file is larger than 32 MiB; an import reads at most 32 MiB.'],
    };
  }
  const text = input.text.startsWith('\uFEFF') ? input.text.slice(1) : input.text;
  const firstLine =
    text
      .slice(0, 65_536)
      .split(/\r\n|\r|\n/)
      .find((line) => line.trim() !== '') ?? '';
  const delimiter = delimiterOf(firstLine, input.name);
  const parsed = parseDelimited(text, delimiter, MAX_ROWS);
  if (!parsed.ok) return { ok: false, problems: [parsed.problem] };
  const tables = tablesOf(parsed.rows);
  if (tables.length === 0) return { ok: false, problems: ['The spreadsheet holds no table.'] };
  const builder = new PlanBuilder(delimiter === '\t' ? 'tsv' : 'csv', input.name);
  try {
    const problems = new TableReading(builder, options).read(tables);
    if (problems.length > 0) return { ok: false, problems };
  } catch (error) {
    if (error instanceof PastLimits) return { ok: false, problems: [error.message] };
    throw error;
  }
  return { ok: true, plan: builder.build() };
}

/** One reading of a spreadsheet's tables into a builder. */
class TableReading {
  readonly #builder: PlanBuilder;
  readonly #matching: boolean;
  readonly #key: string | undefined;
  readonly #suggest: KindSuggester;
  readonly #references: References;
  readonly #containers: { key: string; container: string }[] = [];
  readonly #relations: {
    from: string;
    to: string;
    relation: { sourceId?: string; kind: string; name?: string; attributes?: Attributes };
  }[] = [];

  constructor(builder: PlanBuilder, options: ReadOptions) {
    this.#builder = builder;
    this.#matching = options.project !== undefined;
    this.#key = options.key;
    this.#suggest = kindSuggester(options.project);
    this.#references = new References(
      builder,
      options.project?.model.elements,
      'the row is left out',
    );
  }

  read(tables: readonly Table[]): string[] {
    const kinds: ('elements' | 'relations')[] = [];
    for (const table of tables) {
      const headers = new Set(table.header.cells.map(normal));
      const relations =
        (headers.has('from') || headers.has('source')) &&
        (headers.has('to') || headers.has('target'));
      const elements = ['id', 'name', 'label', 'title'].some((header) => headers.has(header));
      if (!relations && !elements) {
        return [
          `The table that starts on line ${table.header.line} has no name or id column for elements, and no from and to columns for relations.`,
        ];
      }
      kinds.push(relations ? 'relations' : 'elements');
    }
    if (this.#key !== undefined) {
      const wanted = normal(this.#key);
      const has = tables.some(
        (table, at) =>
          kinds[at] === 'elements' && table.header.cells.some((cell) => normal(cell) === wanted),
      );
      if (!has) return [`The spreadsheet has no column "${this.#key}" to match its rows by.`];
    }
    tables.forEach((table, at) => {
      if (kinds[at] === 'elements') this.#readElements(table);
    });
    tables.forEach((table, at) => {
      if (kinds[at] === 'relations') this.#readRelations(table);
    });
    const references = this.#references;
    for (const { key, container } of this.#containers) {
      const found = references.resolve(
        container,
        `"${container}" names no element of the file or the project, so this row sits in no container.`,
      );
      if (found !== undefined) this.#builder.contain(key, found);
    }
    for (const { from, to, relation } of this.#relations) {
      const why = (end: string) =>
        `"${end}" names no element of the file or the project, so the row is left out.`;
      const start = references.resolve(from, why(from));
      if (start === undefined) continue;
      const end = references.resolve(to, why(to));
      if (end === undefined) continue;
      const suggested = this.#suggest.relationType(relation.kind);
      this.#builder.relate(
        { ...relation, from: start, to: end },
        { label: relation.kind, ...(suggested === undefined ? {} : { suggested }) },
      );
    }
    return [];
  }

  #readElements(table: Table): void {
    const builder = this.#builder;
    const references = this.#references;
    const columns = columnsOf(table.header, ELEMENT_HEADERS, true);
    const keyColumn = this.#keyColumn(table.header, columns);
    for (const row of table.rows) {
      const cell = (at: number | undefined) =>
        at === undefined ? '' : (row.cells[at] ?? '').trim();
      this.#reportUnread(columns, row);
      const id = cell(columns.roles.get('id'));
      const written = cell(columns.roles.get('name'));
      if (id === '' && written === '') {
        if (!isBlank(row)) {
          builder.report(row.cells.join(' '), 'This row has no name or id, so it is left out.');
        }
        continue;
      }
      if (id !== '' && references.hasId(id)) {
        builder.report(id, `The id "${id}" is given to an earlier row, so this row is left out.`);
        continue;
      }
      const match =
        keyColumn === undefined ? undefined : references.match(keyColumn.how, cell(keyColumn.at));
      if (match === 'several') continue;
      const kind = cell(columns.roles.get('component'));
      const attributes = attributesIn(columns, cell);
      // Checked, and matched to the project's elements, by `matchByExternalIds` (ADR 0056).
      const ids = Object.fromEntries(
        [...columns.schemes].flatMap(([at, scheme]) => {
          const identifier = cell(at);
          return identifier === '' ? [] : [[scheme, identifier] as const];
        }),
      );
      const key = this.#keyFor(id, written, row.line);
      const name = builder.name(written === '' ? (match?.name ?? id) : written, id || key);
      const description = builder.description(cell(columns.roles.get('description')) || undefined);
      const suggested = this.#suggest.component(kind);
      builder.add(
        {
          key,
          ...(match === undefined ? (id === '' ? {} : { sourceId: id }) : {}),
          name,
          kind,
          ...(description === undefined ? {} : { description }),
          ...(attributes === undefined ? {} : { attributes }),
          ...(Object.keys(ids).length === 0 ? {} : { ids }),
          ...(match === undefined ? {} : { existing: match.id }),
        },
        { label: kind, ...(suggested === undefined ? {} : { suggested }) },
      );
      references.register(key, id, written);
      const container = cell(columns.roles.get('container'));
      // A row that matched an element changes its values only: its containers stay as they are.
      if (container !== '' && match === undefined) this.#containers.push({ key, container });
    }
  }

  #readRelations(table: Table): void {
    const columns = columnsOf(table.header, RELATION_HEADERS);
    for (const row of table.rows) {
      const cell = (at: number | undefined) =>
        at === undefined ? '' : (row.cells[at] ?? '').trim();
      this.#reportUnread(columns, row);
      const from = cell(columns.roles.get('from'));
      const to = cell(columns.roles.get('to'));
      if (from === '' || to === '') {
        if (!isBlank(row)) {
          this.#builder.report(
            row.cells.join(' '),
            'This row has no from or no to, so it is left out.',
          );
        }
        continue;
      }
      const attributes = attributesIn(columns, cell);
      const id = cell(columns.roles.get('id'));
      const written = cell(columns.roles.get('name'));
      const name = written === '' ? '' : this.#builder.name(written, '');
      this.#relations.push({
        from,
        to,
        relation: {
          ...(id === '' ? {} : { sourceId: id }),
          kind: cell(columns.roles.get('type')),
          ...(name === '' ? {} : { name }),
          ...(attributes === undefined ? {} : { attributes }),
        },
      });
    }
  }

  /** Reports each column not read once, quoting the first value it holds. */
  #reportUnread(columns: Columns<string>, row: Row): void {
    for (const [at, why] of columns.unread) {
      const value = (row.cells[at] ?? '').trim();
      if (value === '') continue;
      this.#builder.report(value, why);
      columns.unread.delete(at);
    }
  }

  /** The column rows are matched by, and what it matches: the id, the name or an attribute. */
  #keyColumn(header: Row, columns: Columns<ElementRole>): { at: number; how: MatchBy } | undefined {
    if (!this.#matching) return undefined;
    if (this.#key === undefined) {
      const at = columns.roles.get('id');
      return at === undefined ? undefined : { at, how: { by: 'id' } };
    }
    const wanted = normal(this.#key);
    const at = header.cells.findIndex((cell) => normal(cell) === wanted);
    if (at < 0) return undefined;
    if (columns.roles.get('id') === at) return { at, how: { by: 'id' } };
    if (columns.roles.get('name') === at) return { at, how: { by: 'name' } };
    return {
      at,
      how: { by: 'attribute', name: columns.attributes.get(at) ?? oneLine(header.cells[at] ?? '') },
    };
  }

  /** A key for a row's element: its id, else its name, else its name and line. */
  #keyFor(id: string, name: string, line: number): string {
    const free = (key: string) =>
      key !== '' && this.#builder.element(key) === undefined && !/^relation \d+$/.test(key);
    if (free(id)) return id;
    if (id === '' && free(name)) return name;
    return `${id || name} (line ${line})`;
  }
}

/** A row's attributes: each column read as one, with a value. */
function attributesIn(
  columns: Columns<string>,
  cell: (at: number | undefined) => string,
): Attributes | undefined {
  const entries: [string, string][] = [];
  for (const [at, name] of columns.attributes) {
    const value = cell(at);
    if (value !== '') entries.push([name, value]);
  }
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}
