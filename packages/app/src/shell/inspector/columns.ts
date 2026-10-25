/**
 * Reads columns typed or pasted into a table's inspector: a list typed by hand, one column a line or
 * separated by commas, or a `CREATE TABLE` statement as Postgres, MySQL or SQLite dump it. Pure, and it
 * never throws: what it cannot read is listed, with why, and never guessed.
 *
 * - Commas inside parentheses, as in `numeric(10, 2)`, do not separate columns; without any comma
 *   outside parentheses, each line is a column.
 * - `CREATE TABLE … (` and what follows its closing parenthesis are left out, and so are `--` and
 *   `/* … *\/` comments.
 * - Names may be quoted, backticked or bracketed. A column's type is every word up to the first
 *   constraint keyword.
 * - A column reads `PRIMARY KEY` or `PK`, `NOT NULL`, `UNIQUE` and `REFERENCES t[(c)] [ON DELETE …]`,
 *   and skips `DEFAULT`, `CHECK`, `COLLATE`, `GENERATED`, `IDENTITY` and `AUTO_INCREMENT`.
 * - The table reads `[CONSTRAINT n] PRIMARY KEY (a, b)`, `FOREIGN KEY (a) REFERENCES t(b)` and
 *   `UNIQUE (a)`.
 */

/** What happens to the records that refer to one that is deleted, as "references" says it. */
export type OnDelete = 'no action' | 'restrict' | 'cascade' | 'set null' | 'set default';

/** A column read from the text. */
export interface ParsedColumn {
  name: string;
  type?: string;
  primaryKey?: true;
  notNull?: true;
  unique?: true;
  /** The table it refers to, by name, and the column there, when the text names one. */
  references?: { table: string; column?: string; onDelete?: OnDelete };
}

/** What a text says: its columns in order, and what was skipped, with why. */
export interface ParsedColumns {
  /** The table a `CREATE TABLE` names. */
  table?: string;
  columns: ParsedColumn[];
  skipped: { text: string; reason: string }[];
}

/** Reads columns from a text; see the module's comment. */
export function parseColumns(text: string): ParsedColumns {
  try {
    return parse(text);
  } catch {
    const shown = collapse(text);
    return {
      columns: [],
      skipped: shown === '' ? [] : [{ text: shown, reason: 'could not be read' }],
    };
  }
}

interface Token {
  kind: 'word' | 'quoted' | 'string' | 'group' | 'other';
  /** The token as written. */
  text: string;
  /** A quoted name without its quotes; a word as written. */
  value: string;
  /** Whether it follows the token before it with no space between. */
  attached: boolean;
}

/** The words that end a column's type and start its constraints. */
const CONSTRAINT_WORDS = new Set([
  'PRIMARY',
  'PK',
  'NOT',
  'NULL',
  'UNIQUE',
  'REFERENCES',
  'DEFAULT',
  'CHECK',
  'COLLATE',
  'GENERATED',
  'IDENTITY',
  'AUTO_INCREMENT',
  'AUTOINCREMENT',
  'CONSTRAINT',
  'ON',
  'COMMENT',
]);

const ON_DELETE: Readonly<Record<string, OnDelete>> = {
  CASCADE: 'cascade',
  RESTRICT: 'restrict',
  'NO ACTION': 'no action',
  'SET NULL': 'set null',
  'SET DEFAULT': 'set default',
};

/** A clause of the table rather than a column, kept until every column is read. */
type TableClause =
  | { kind: 'primary'; columns: string[] }
  | { kind: 'foreign'; columns: string[]; table: string; targets: string[]; onDelete?: OnDelete }
  | { kind: 'unique'; columns: string[] };

function parse(text: string): ParsedColumns {
  const plain = withoutComments(text);
  const { table, body } = tableBody(plain);
  const items = splitItems(body);
  const columns: ParsedColumn[] = [];
  const skipped: { at: number; text: string; reason: string }[] = [];
  const clauses: { at: number; text: string; clause: TableClause }[] = [];

  items.forEach((item, at) => {
    const shown = collapse(item);
    if (!/[\p{L}\p{N}_]/u.test(shown)) return;
    let tokens = tokenize(item);
    if (upper(tokens[0]) === 'CONSTRAINT') tokens = tokens.slice(2);
    const first = upper(tokens[0]);
    const second = upper(tokens[1]);
    if (first === 'PRIMARY' && second === 'KEY') {
      clauses.push({ at, text: shown, clause: { kind: 'primary', columns: namesIn(tokens[2]) } });
    } else if (first === 'FOREIGN' && second === 'KEY') {
      const foreign = foreignKey(tokens.slice(2));
      if (foreign) clauses.push({ at, text: shown, clause: foreign });
      else skipped.push({ at, text: shown, reason: 'a foreign key it cannot read' });
    } else if (first === 'UNIQUE') {
      const group = tokens.find((token) => token.kind === 'group');
      clauses.push({ at, text: shown, clause: { kind: 'unique', columns: namesIn(group) } });
    } else if (
      first === 'KEY' ||
      first === 'INDEX' ||
      first === 'FULLTEXT' ||
      first === 'SPATIAL'
    ) {
      skipped.push({ at, text: shown, reason: 'an index, not a column' });
    } else if (first === 'CHECK') {
      skipped.push({ at, text: shown, reason: 'a check, not a column' });
    } else if (first === 'EXCLUDE' || first === 'LIKE' || first === 'PERIOD') {
      skipped.push({ at, text: shown, reason: 'not a column' });
    } else {
      const column = columnOf(tokens);
      if (column) columns.push(column);
      else skipped.push({ at, text: shown, reason: 'not a column' });
    }
  });

  const byName = (name: string) =>
    columns.find((column) => column.name.toLowerCase() === name.toLowerCase());
  for (const { at, text: shown, clause } of clauses) {
    const missing = clause.columns.filter((name) => byName(name) === undefined);
    if (clause.columns.length === 0) {
      skipped.push({ at, text: shown, reason: 'names no column' });
      continue;
    }
    if (clause.kind === 'unique' && clause.columns.length > 1) {
      skipped.push({ at, text: shown, reason: 'a unique key over several columns' });
      continue;
    }
    for (const name of missing)
      skipped.push({ at, text: shown, reason: `no column named “${name}”` });
    clause.columns.forEach((name, index) => {
      const column = byName(name);
      if (!column) return;
      if (clause.kind === 'primary') column.primaryKey = true;
      else if (clause.kind === 'unique') column.unique = true;
      else {
        const target = clause.targets[index];
        column.references = {
          table: clause.table,
          ...(target === undefined ? {} : { column: target }),
          ...(clause.onDelete === undefined ? {} : { onDelete: clause.onDelete }),
        };
      }
    });
  }
  skipped.sort((a, b) => a.at - b.at);
  return {
    ...(table === undefined ? {} : { table }),
    columns,
    skipped: skipped.map(({ text: shown, reason }) => ({ text: shown, reason })),
  };
}

/** A column from its tokens: its name, its type, and the constraints it reads. */
function columnOf(tokens: readonly Token[]): ParsedColumn | undefined {
  const [first] = tokens;
  if (!first || (first.kind !== 'word' && first.kind !== 'quoted') || first.value === '') {
    return undefined;
  }
  const column: ParsedColumn = { name: first.value };
  let at = 1;
  let type = '';
  for (; at < tokens.length; at++) {
    const token = tokens[at] as Token;
    if (token.kind === 'word' && CONSTRAINT_WORDS.has(token.value.toUpperCase())) break;
    if (token.kind === 'group') type += token.text;
    else if (token.kind === 'word' || token.kind === 'quoted') {
      type += type === '' ? token.value : ` ${token.value}`;
    } else break;
  }
  if (type !== '') column.type = type;
  while (at < tokens.length) {
    const word = upper(tokens[at]);
    at += 1;
    if (word === 'PRIMARY' && upper(tokens[at]) === 'KEY') {
      column.primaryKey = true;
      at += 1;
    } else if (word === 'PK') column.primaryKey = true;
    else if (word === 'NOT' && upper(tokens[at]) === 'NULL') {
      column.notNull = true;
      at += 1;
    } else if (word === 'UNIQUE') column.unique = true;
    else if (word === 'REFERENCES') {
      const reference = referenceAt(tokens, at);
      at = reference.next;
      if (reference.table !== undefined) {
        column.references = {
          table: reference.table,
          ...(reference.column === undefined ? {} : { column: reference.column }),
          ...(reference.onDelete === undefined ? {} : { onDelete: reference.onDelete }),
        };
      }
    } else if (word === 'DEFAULT' || word === 'COLLATE' || word === 'CONSTRAINT') {
      at = afterValue(tokens, at);
    } else if (word === 'CHECK' && tokens[at]?.kind === 'group') at += 1;
  }
  return column;
}

/** A `FOREIGN KEY (a) REFERENCES t (b)` clause, from the tokens after `FOREIGN KEY`. */
function foreignKey(tokens: readonly Token[]): TableClause | undefined {
  const columns = namesIn(tokens[0]);
  if (upper(tokens[1]) !== 'REFERENCES') return undefined;
  const reference = referenceAt(tokens, 2);
  if (reference.table === undefined) return undefined;
  return {
    kind: 'foreign',
    columns,
    table: reference.table,
    targets: reference.columns,
    ...(reference.onDelete === undefined ? {} : { onDelete: reference.onDelete }),
  };
}

/** What a `REFERENCES` at `at` names: a table, its columns, and what a deletion does. */
function referenceAt(
  tokens: readonly Token[],
  at: number,
): { table?: string; column?: string; columns: string[]; onDelete?: OnDelete; next: number } {
  const name = nameAt(tokens, at);
  let next = name.next;
  let columns: string[] = [];
  if (tokens[next]?.kind === 'group') {
    columns = namesIn(tokens[next]);
    next += 1;
  }
  let onDelete: OnDelete | undefined;
  while (upper(tokens[next]) === 'ON') {
    const what = upper(tokens[next + 1]);
    const first = upper(tokens[next + 2]);
    const pair = `${first} ${upper(tokens[next + 3])}`;
    const action = ON_DELETE[pair] ?? ON_DELETE[first];
    if (what === 'DELETE' && action !== undefined) onDelete = action;
    next += ON_DELETE[pair] !== undefined ? 4 : 3;
  }
  const [column] = columns;
  return {
    ...(name.name === undefined ? {} : { table: name.name }),
    ...(column === undefined ? {} : { column }),
    columns,
    ...(onDelete === undefined ? {} : { onDelete }),
    next,
  };
}

/** A name that may be qualified, as `public.users` or `"public"."users"`: its last part. */
function nameAt(tokens: readonly Token[], at: number): { name?: string; next: number } {
  const parts: string[] = [];
  let next = at;
  for (; next < tokens.length; next++) {
    const token = tokens[next] as Token;
    if (next > at && !token.attached) break;
    if (token.kind === 'quoted') parts.push(token.value);
    else if (token.kind === 'word') parts.push(...token.value.split('.'));
    else break;
  }
  const name = parts.filter((part) => part !== '').at(-1);
  return { ...(name === undefined ? {} : { name }), next };
}

/** Skips a value, such as a default: the token at `at` and every token attached to it. */
function afterValue(tokens: readonly Token[], at: number): number {
  let next = at + 1;
  while (tokens[next]?.attached) next += 1;
  return next;
}

/** The names a parenthesized list holds, unquoted. */
function namesIn(group: Token | undefined): string[] {
  if (group?.kind !== 'group') return [];
  return splitTop(group.text.slice(1, -1), ',')
    .map((part) => {
      const [first] = tokenize(part);
      return first && (first.kind === 'word' || first.kind === 'quoted') ? first.value : '';
    })
    .filter((name) => name !== '');
}

function upper(token: Token | undefined): string {
  return token?.kind === 'word' ? token.value.toUpperCase() : '';
}

/** The text without `--` and `/* … *\/` comments, leaving quoted text alone. */
function withoutComments(text: string): string {
  let out = '';
  let at = 0;
  while (at < text.length) {
    const char = text[at] as string;
    if (char === '-' && text[at + 1] === '-') {
      const end = text.indexOf('\n', at);
      at = end === -1 ? text.length : end;
      continue;
    }
    if (char === '/' && text[at + 1] === '*') {
      const end = text.indexOf('*/', at + 2);
      at = end === -1 ? text.length : end + 2;
      out += ' ';
      continue;
    }
    const close = closingQuote(char);
    if (close !== undefined) {
      const end = text.indexOf(close, at + 1);
      const stop = end === -1 ? text.length : end + 1;
      out += text.slice(at, stop);
      at = stop;
      continue;
    }
    out += char;
    at += 1;
  }
  return out;
}

/** The part of a `CREATE TABLE` inside its parentheses, and its table's name; otherwise the whole text. */
function tableBody(text: string): { table?: string; body: string } {
  const create =
    /\bcreate\s+(?:(?:global|local)\s+)?(?:temp(?:orary)?\s+)?(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?/i.exec(
      text,
    );
  if (!create) return { body: text };
  const start = create.index + create[0].length;
  const open = indexOutsideQuotes(text, '(', start);
  if (open === -1) return { body: '' };
  const name = nameAt(tokenize(text.slice(start, open)), 0).name;
  const close = matching(text, open);
  const body = text.slice(open + 1, close === -1 ? text.length : close);
  return { ...(name === undefined ? {} : { table: name }), body };
}

/** The items of a list: separated by commas outside parentheses, or, with none, by lines. */
function splitItems(body: string): string[] {
  const byComma = splitTop(body, ',');
  return byComma.length > 1 ? byComma : splitTop(body, '\n');
}

/** Splits a text at a separator that is outside parentheses and quotes. */
function splitTop(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  let at = 0;
  while (at < text.length) {
    const char = text[at] as string;
    const close = closingQuote(char);
    if (close !== undefined) {
      const end = text.indexOf(close, at + 1);
      at = end === -1 ? text.length : end + 1;
      continue;
    }
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (char === separator && depth === 0) {
      parts.push(text.slice(from, at));
      from = at + 1;
    }
    at += 1;
  }
  parts.push(text.slice(from));
  return parts;
}

/** Where the parenthesis that closes the one at `open` is, outside quotes; -1 when none does. */
function matching(text: string, open: number): number {
  let depth = 0;
  let at = open;
  while (at < text.length) {
    const char = text[at] as string;
    const close = closingQuote(char);
    if (close !== undefined) {
      const end = text.indexOf(close, at + 1);
      at = end === -1 ? text.length : end + 1;
      continue;
    }
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return at;
    }
    at += 1;
  }
  return -1;
}

function indexOutsideQuotes(text: string, wanted: string, from: number): number {
  let at = from;
  while (at < text.length) {
    const char = text[at] as string;
    if (char === wanted) return at;
    const close = closingQuote(char);
    if (close !== undefined) {
      const end = text.indexOf(close, at + 1);
      at = end === -1 ? text.length : end + 1;
      continue;
    }
    at += 1;
  }
  return -1;
}

/** The character that closes a quote opened by `char`, if it opens one. */
function closingQuote(char: string): string | undefined {
  switch (char) {
    case '"':
      return '"';
    case '`':
      return '`';
    case '[':
      return ']';
    case "'":
      return "'";
    default:
      return undefined;
  }
}

/** The tokens of one item: words, quoted names, strings, parenthesized groups and the rest. */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  let spaced = true;
  const push = (kind: Token['kind'], raw: string, value: string) => {
    tokens.push({ kind, text: raw, value, attached: !spaced && tokens.length > 0 });
    spaced = false;
  };
  while (at < text.length) {
    const char = text[at] as string;
    if (/\s/.test(char)) {
      spaced = true;
      at += 1;
      continue;
    }
    if (char === '(') {
      const close = matching(text, at);
      const end = close === -1 ? text.length : close + 1;
      push('group', text.slice(at, end), text.slice(at, end));
      at = end;
      continue;
    }
    const close = closingQuote(char);
    if (close !== undefined) {
      const end = text.indexOf(close, at + 1);
      const stop = end === -1 ? text.length : end + 1;
      const raw = text.slice(at, stop);
      const inner = text.slice(at + 1, end === -1 ? text.length : end);
      push(char === "'" ? 'string' : 'quoted', raw, inner);
      at = stop;
      continue;
    }
    if (char === ')' || char === ',' || char === ';') {
      push('other', char, char);
      at += 1;
      continue;
    }
    let end = at;
    while (end < text.length && !/[\s()"'`[\],;]/.test(text[end] as string)) end += 1;
    if (end === at) {
      // A closing bracket with none open before it.
      push('other', char, char);
      at += 1;
      continue;
    }
    const word = text.slice(at, end);
    push('word', word, word);
    at = end;
  }
  return tokens;
}

/** A text on one line, its runs of spaces made one. */
function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
