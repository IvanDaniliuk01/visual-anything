/**
 * Text emphasis (ADR 0082): bold, italic, strikethrough, inline code, highlight and underline in a
 * text, written as a small Markdown subset and stored as typed. Texts of several lines (notes,
 * descriptions, captions, reveals, speaker notes) also take Markdown's blocks, as the ADR's
 * clarification of 2026-10-30 says: headings 1 to 3, lists nested to three levels, task items,
 * quotes, rules, fenced code, GitHub tables and links to `http:`, `https:` and `mailto:` addresses.
 *
 * The reader is CommonMark's, simplified: its block structure without setext headings, indented
 * code, HTML blocks, reference links or lazy continuation lines; its delimiter algorithm for `*`
 * and `_`, and the same flanking rules for `~~`, `==` and `++`. It never throws, runs in time linear
 * in the text, and answers at most 4,000 runs and 500 blocks: past them the rest is plain.
 *
 * Nothing it answers is HTML: a reader of runs writes them as text, so a `<u>` in a text is drawn as
 * the three characters it is.
 *
 * It also reads Math (ADR 0106), before emphasis and as a code span is read, by Pandoc's
 * `tex_math_dollars` rule: `$…$` and GitHub's `` $`…`$ `` within a line, `$$…$$` within a line in
 * display style, and, in a text that takes blocks, `$$` on lines of its own, a line that is one
 * `$$…$$`, or a fence whose language is `math` as a math block. At most `MAX_MATH_PER_TEXT`
 * formulas are read; the rest stay text as typed.
 */

import { MAX_MATH_PER_TEXT } from '../math/drawing';

/** The most runs a text is read into; past them the rest of each text is one plain run. */
export const MAX_EMPHASIS_RUNS = 4_000;
/** The most blocks a text is read into; past them the rest is one plain paragraph. */
export const MAX_EMPHASIS_BLOCKS = 500;
/** The most columns a table takes: a wider one is written as the characters it is. */
export const MAX_TABLE_COLUMNS = 12;
/** The most rows a table takes under its head: the lines after them are a paragraph. */
export const MAX_TABLE_ROWS = 50;
/** The deepest a list nests: a list item deeper than that is written as the characters it is. */
export const MAX_LIST_DEPTH = 3;
/** The deepest a quote nests. */
const MAX_QUOTE_DEPTH = 3;
/** The most characters read for a link's address and title, so that reading stays linear. */
const MAX_LINK_TAIL = 2_048;

/** A part of a text drawn one way: its characters and the emphasis they take. */
export interface EmphasisRun {
  text: string;
  bold: boolean;
  italic: boolean;
  strike: boolean;
  underline: boolean;
  code: boolean;
  highlight: boolean;
  /** The address the run opens when clicked: `http:`, `https:` or `mailto:` only. */
  link?: string;
  /**
   * Set on a run that is a formula (ADR 0106): `$…$` or `` $`…`$ `` within a line, `$$…$$` within a
   * line in display style. Its `text` is the TeX as written, with its delimiters, so that what reads
   * runs as plain text reads the notation; it takes no emphasis inside.
   */
  math?: { tex: string; display: boolean };
}

/** Where a table's column puts its text. */
export type TableAlign = 'left' | 'center' | 'right' | 'none';

/** An item of a list: the blocks it holds and, for a task item, whether it is done. */
export interface EmphasisItem {
  /** Set only on a task item (`- [ ]` or `- [x]`). */
  checked?: boolean;
  blocks: EmphasisBlock[];
}

/** A part of a text of several lines, as it is drawn. */
export type EmphasisBlock =
  /** Lines drawn together; each line break is kept as `\n` in its runs. */
  | { kind: 'paragraph'; runs: EmphasisRun[] }
  | { kind: 'heading'; level: 1 | 2 | 3; runs: EmphasisRun[] }
  | { kind: 'list'; ordered: false; items: EmphasisItem[] }
  /** A numbered list starts at its first item's number. */
  | { kind: 'list'; ordered: true; start: number; items: EmphasisItem[] }
  | { kind: 'quote'; blocks: EmphasisBlock[] }
  | { kind: 'rule' }
  /** Fenced code: its text as written, never highlighted as a language and never run. */
  | { kind: 'code'; text: string }
  /** A formula on lines of its own (ADR 0106): `$$…$$` alone, or a fence whose language is `math`. */
  | { kind: 'math'; tex: string }
  /** A GitHub table: a cell is its runs, and a row has as many cells as the head. */
  | { kind: 'table'; align: TableAlign[]; head: EmphasisRun[][]; rows: EmphasisRun[][][] };

/** How to read a text: with blocks for a text of several lines, without for a detail or a name. */
export interface EmphasisOptions {
  /**
   * True for notes, descriptions, captions, reveals and speaker notes. False for a text of one line,
   * such as an attribute's value in a detail: it is one paragraph whose line breaks are spaces, and
   * it takes no headings, lists or links.
   */
  blocks: boolean;
}

/** Reads a text into blocks of runs. It never throws: whatever it cannot read is plain text. */
export function parseEmphasis(text: string, options: EmphasisOptions): EmphasisBlock[] {
  const context: Context = { runs: 0, blocks: 0, math: 0 };
  const normalized = text.replace(/\r\n?/g, '\n');
  try {
    if (!options.blocks) {
      const flat = normalized.replace(/\n/g, ' ');
      return flat === '' ? [] : [{ kind: 'paragraph', runs: readInline(flat, false, context) }];
    }
    const lines = normalized.split('\n');
    // A final line break ends the last line; it does not start one.
    if (lines.length > 1 && lines.at(-1) === '') lines.pop();
    return readBlocks(lines, { list: 0, quote: 0 }, context);
  } catch {
    // A reader that never throws: what it could not read is drawn as written.
    const flat = options.blocks ? normalized.trim() : normalized.replace(/\n/g, ' ');
    return flat === '' ? [] : [{ kind: 'paragraph', runs: [plainRun(flat)] }];
  }
}

/** The runs of a text of one line, as a detail or an attribute's value draws them. */
export function emphasisRuns(text: string): EmphasisRun[] {
  const [first] = parseEmphasis(text, { blocks: false });
  return first?.kind === 'paragraph' ? first.runs : [];
}

/**
 * A text without the markers it was read with: for search, find, filters on text, sorting and what
 * is announced. Blocks are written a line each, a link as its label, and a table's cells with a tab
 * between them. Math keeps its TeX as written, delimiters and all: `$tex$` for a formula within a
 * line, `$$tex$$` for a math block (ADR 0106).
 */
export function plainText(text: string, options: EmphasisOptions = { blocks: true }): string {
  return blocksText(parseEmphasis(text, options));
}

/** The text of runs, without their emphasis. */
export function runsText(runs: readonly EmphasisRun[]): string {
  let text = '';
  for (const run of runs) text += run.text;
  return text;
}

/** The plain text of blocks, as `plainText` writes it. */
export function blocksText(blocks: readonly EmphasisBlock[]): string {
  const lines: string[] = [];
  const add = (list: readonly EmphasisBlock[]) => {
    for (const block of list) {
      switch (block.kind) {
        case 'paragraph':
        case 'heading':
          lines.push(runsText(block.runs));
          break;
        case 'list':
          for (const item of block.items) add(item.blocks);
          break;
        case 'quote':
          add(block.blocks);
          break;
        case 'code':
          lines.push(block.text);
          break;
        case 'math':
          // The TeX as written, so that search and screen readers read the notation (ADR 0106).
          lines.push(`$$${block.tex}$$`);
          break;
        case 'table':
          for (const row of [block.head, ...block.rows]) lines.push(row.map(runsText).join('\t'));
          break;
        case 'rule':
          break;
      }
    }
  };
  add(blocks);
  return lines.join('\n');
}

/**
 * Writes a text so that it is read back exactly as written, with or without blocks: what would be
 * a marker is escaped with a backslash, and nothing else is. Imports write outside text through it.
 * Blank lines and the spaces at a line's ends cannot be escaped: a text of several lines keeps its
 * lines, trimmed, and its paragraphs.
 */
export function escapeEmphasis(text: string): string {
  let out = '';
  let lineStart = true;
  for (let at = 0; at < text.length; at++) {
    const char = text[at]!;
    if (char === '\n' || char === '\r') {
      out += char;
      lineStart = true;
      continue;
    }
    if (lineStart && (char === ' ' || char === '\t')) {
      out += char;
      continue;
    }
    const startOfLine = lineStart;
    lineStart = false;
    switch (char) {
      case '\\': {
        const next = text[at + 1];
        out +=
          next === undefined || isAsciiPunctuation(next) || restIsBlank(text, at + 1)
            ? '\\\\'
            : '\\';
        break;
      }
      case '*':
      case '`':
      case '[':
      case '|':
        out += `\\${char}`;
        break;
      case '$': {
        // A dollar that could open Math (ADR 0106): one with a character other than a space or a
        // line break right after it. With none open, no dollar closes one, so SQL's `$1` or
        // `$20 and $30` read back as written.
        const next = text[at + 1];
        out +=
          next === undefined || next === ' ' || next === '\t' || next === '\n' || next === '\r'
            ? '$'
            : '\\$';
        break;
      }
      case '_':
        out += isWordCharacter(text, at - 1, -1) && isWordCharacter(text, at + 1, 1) ? '_' : '\\_';
        break;
      case '~':
      case '=':
      case '+': {
        let length = 1;
        while (text[at + length] === char) length++;
        const run = char.repeat(length);
        if (length === 2) out += `\\${run}`;
        else if (startOfLine && (char === '~' || (char === '+' && length === 1))) {
          out += `\\${char}`.repeat(length);
        } else out += run;
        at += length - 1;
        break;
      }
      case '#':
      case '>':
      case '-':
        out += startOfLine ? `\\${char}` : char;
        break;
      default: {
        if (startOfLine && char >= '0' && char <= '9') {
          let end = at;
          while (end < text.length && text[end]! >= '0' && text[end]! <= '9') end++;
          const after = text[end];
          out += text.slice(at, end);
          if (after === '.' || after === ')') {
            out += `\\${after}`;
            end++;
          }
          at = end - 1;
        } else out += char;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Blocks

interface Context {
  runs: number;
  blocks: number;
  /** The formulas read so far, runs and blocks, in reading order (ADR 0106). */
  math: number;
}

interface Depth {
  list: number;
  quote: number;
}

interface ListMarker {
  ordered: boolean;
  /** The bullet's character, or the number's `.` or `)`: a list goes on while it stays the same. */
  type: string;
  start: number;
  /** The column the item's content starts at: its later lines are indented at least this much. */
  contentIndent: number;
  content: string;
  empty: boolean;
}

function readBlocks(source: readonly string[], depth: Depth, context: Context): EmphasisBlock[] {
  const lines = source.map(expandLeadingTabs);
  const blocks: EmphasisBlock[] = [];
  const add = (block: EmphasisBlock) => {
    context.blocks++;
    blocks.push(block);
  };
  /** A math block or, past the most formulas a text takes, a paragraph of its lines as typed. */
  const addMath = (tex: string, typed: string) => {
    if (context.math < MAX_MATH_PER_TEXT) {
      context.math++;
      add({ kind: 'math', tex });
    } else {
      context.runs++;
      add({ kind: 'paragraph', runs: [plainRun(typed)] });
    }
  };
  let at = 0;
  while (at < lines.length) {
    const line = lines[at]!;
    if (isBlank(line)) {
      at++;
      continue;
    }
    if (context.blocks >= MAX_EMPHASIS_BLOCKS) {
      const rest = lines
        .slice(at)
        .map((part) => trimSpaces(part))
        .filter((part) => part !== '');
      blocks.push({ kind: 'paragraph', runs: [plainRun(rest.join('\n'))] });
      context.runs++;
      break;
    }
    const indent = leadingSpaces(line);
    if (indent < 4) {
      const rest = line.slice(indent);
      const fence = fenceOf(rest);
      if (fence) {
        const code: string[] = [];
        let next = at + 1;
        for (; next < lines.length; next++) {
          const candidate = lines[next]!;
          const candidateIndent = leadingSpaces(candidate);
          if (candidateIndent < 4 && closesFence(candidate.slice(candidateIndent), fence)) {
            next++;
            break;
          }
          code.push(candidate.slice(Math.min(indent, candidateIndent)));
        }
        // A fence whose language is `math` is GitHub's form of a math block (ADR 0106).
        if (fence.math && context.math < MAX_MATH_PER_TEXT) {
          context.math++;
          add({ kind: 'math', tex: code.join('\n') });
        } else add({ kind: 'code', text: code.join('\n') });
        at = next;
        continue;
      }
      const closer = mathCloserOf(lines, at);
      if (closer !== undefined) {
        // `$$` on a line of its own, up to the next: the lines between are the TeX.
        const tex = lines
          .slice(at + 1, closer)
          .map((candidate) => candidate.slice(Math.min(indent, leadingSpaces(candidate))));
        addMath(
          tex.join('\n'),
          lines
            .slice(at, closer + 1)
            .map(trimLeadingSpaces)
            .join('\n'),
        );
        at = closer + 1;
        continue;
      }
      const display = displayLineOf(rest);
      if (display !== undefined) {
        addMath(display, trimSpaces(rest));
        at++;
        continue;
      }
      const heading = headingOf(rest);
      if (heading) {
        add({
          kind: 'heading',
          level: heading.level,
          runs: readInline(heading.text, true, context),
        });
        at++;
        continue;
      }
      if (isRule(rest)) {
        add({ kind: 'rule' });
        at++;
        continue;
      }
      if (depth.quote < MAX_QUOTE_DEPTH && rest.startsWith('>')) {
        const quoted: string[] = [];
        let next = at;
        for (; next < lines.length; next++) {
          const candidate = lines[next]!;
          const candidateIndent = leadingSpaces(candidate);
          if (candidateIndent >= 4 || candidate[candidateIndent] !== '>') break;
          let inner = candidate.slice(candidateIndent + 1);
          if (inner.startsWith(' ') || inner.startsWith('\t')) inner = inner.slice(1);
          quoted.push(inner);
        }
        const block: EmphasisBlock = { kind: 'quote', blocks: [] };
        add(block);
        block.blocks = readBlocks(quoted, { list: depth.list, quote: depth.quote + 1 }, context);
        at = next;
        continue;
      }
      const marker = depth.list < MAX_LIST_DEPTH ? listMarkerOf(line) : undefined;
      if (marker) {
        at = readList(lines, at, marker, depth, context, add);
        continue;
      }
      const table = tableAt(lines, at);
      if (table) {
        add({
          kind: 'table',
          align: table.align,
          head: table.head.map((cell) => readInline(cell, true, context)),
          rows: [],
        });
        const block = blocks.at(-1) as Extract<EmphasisBlock, { kind: 'table' }>;
        let next = at + 2;
        while (
          next < lines.length &&
          block.rows.length < MAX_TABLE_ROWS &&
          !isBlank(lines[next]!) &&
          !interrupts(lines, next, depth)
        ) {
          const cells = cellsOf(lines[next]!);
          block.rows.push(
            table.align.map((_, column) => readInline(cells[column] ?? '', true, context)),
          );
          next++;
        }
        at = next;
        continue;
      }
    }
    // A line's leading spaces go; its trailing ones go at its line break, but not inside code.
    const paragraph = [trimLeadingSpaces(line)];
    let next = at + 1;
    while (next < lines.length && !isBlank(lines[next]!) && !interrupts(lines, next, depth)) {
      paragraph.push(trimLeadingSpaces(lines[next]!));
      next++;
    }
    add({
      kind: 'paragraph',
      runs: readInline(trimSpaces(paragraph.join('\n')), true, context),
    });
    at = next;
  }
  return blocks;
}

/** Reads a list from its first item's line; answers the line after it. */
function readList(
  lines: readonly string[],
  start: number,
  first: ListMarker,
  depth: Depth,
  context: Context,
  add: (block: EmphasisBlock) => void,
): number {
  const items: EmphasisItem[] = [];
  add(
    first.ordered
      ? { kind: 'list', ordered: true, start: first.start, items }
      : { kind: 'list', ordered: false, items },
  );
  let at = start;
  let marker = first;
  for (;;) {
    const itemLines = [marker.content];
    let next = at + 1;
    while (next < lines.length) {
      const line = lines[next]!;
      if (isBlank(line)) {
        if (marker.empty && itemLines.length === 1) break;
        let after = next;
        while (after < lines.length && isBlank(lines[after]!)) after++;
        if (after < lines.length && leadingSpaces(lines[after]!) >= marker.contentIndent) {
          for (; next < after; next++) itemLines.push('');
          continue;
        }
        break;
      }
      if (leadingSpaces(line) < marker.contentIndent) break;
      itemLines.push(line.slice(marker.contentIndent));
      next++;
    }
    const item: EmphasisItem = { blocks: [] };
    const task = /^\[([ xX])\](?:[ \t]|$)/.exec(itemLines[0]!);
    if (task) {
      item.checked = task[1] !== ' ';
      itemLines[0] = itemLines[0]!.slice(3);
    }
    items.push(item);
    item.blocks = readBlocks(itemLines, { list: depth.list + 1, quote: depth.quote }, context);
    at = next;
    let after = at;
    while (after < lines.length && isBlank(lines[after]!)) after++;
    if (after >= lines.length) return after;
    const line = lines[after]!;
    const following = listMarkerOf(line);
    if (!following || following.type !== first.type || isRule(line.slice(leadingSpaces(line)))) {
      return at;
    }
    marker = following;
    at = after;
  }
}

/** Whether a line ends the paragraph or table before it, by starting a block of its own. */
function interrupts(lines: readonly string[], at: number, depth: Depth): boolean {
  const line = lines[at]!;
  const indent = leadingSpaces(line);
  if (indent >= 4) return false;
  const rest = line.slice(indent);
  if (fenceOf(rest) || headingOf(rest) || isRule(rest)) return true;
  if (mathCloserOf(lines, at) !== undefined || displayLineOf(rest) !== undefined) return true;
  if (depth.quote < MAX_QUOTE_DEPTH && rest.startsWith('>')) return true;
  if (depth.list < MAX_LIST_DEPTH) {
    const marker = listMarkerOf(line);
    if (marker && !marker.empty) return true;
  }
  return tableAt(lines, at) !== undefined;
}

function listMarkerOf(line: string): ListMarker | undefined {
  const indent = leadingSpaces(line);
  if (indent >= 4) return undefined;
  const rest = line.slice(indent);
  let width: number;
  let ordered = false;
  let type: string;
  let start = 1;
  const bullet = rest[0];
  if (bullet === '-' || bullet === '+' || bullet === '*') {
    width = 1;
    type = bullet;
  } else {
    const number = /^(\d{1,9})([.)])/.exec(rest);
    if (!number) return undefined;
    width = number[0].length;
    type = number[2]!;
    ordered = true;
    start = Number(number[1]);
  }
  const after = rest.slice(width);
  if (after !== '' && after[0] !== ' ' && after[0] !== '\t') return undefined;
  let spaces = 0;
  let column = indent + width;
  let at = 0;
  while (at < after.length && (after[at] === ' ' || after[at] === '\t')) {
    const step = after[at] === '\t' ? 4 - (column % 4) : 1;
    spaces += step;
    column += step;
    at++;
  }
  const content = after.slice(at);
  const empty = content === '';
  if (empty || spaces >= 5) {
    return {
      ordered,
      type,
      start,
      contentIndent: indent + width + 1,
      content: empty ? '' : ' '.repeat(spaces - 1) + content,
      empty,
    };
  }
  return { ordered, type, start, contentIndent: indent + width + spaces, content, empty };
}

function fenceOf(rest: string): { char: string; length: number; math: boolean } | undefined {
  const char = rest[0];
  if (char !== '`' && char !== '~') return undefined;
  let length = 0;
  while (rest[length] === char) length++;
  if (length < 3) return undefined;
  if (char === '`' && rest.indexOf('`', length) !== -1) return undefined;
  // The info string's first word is its language: `math` makes a math block (ADR 0106).
  const info = trimSpaces(rest.slice(length));
  const math = info.startsWith('math') && (info.length === 4 || isBlank(info[4]!));
  return { char, length, math };
}

/** Whether a line, without its indent, is `$$` alone: it opens or closes a math block. */
function isMathFence(rest: string): boolean {
  return trimSpaces(rest) === '$$';
}

/**
 * When the line at `at` is `$$` alone and opens a math block, the line that closes it: the next
 * line that is `$$` alone, with something other than blank lines between them. Undefined when it
 * opens none: an unclosed `$$` stays text, unlike an unclosed fence, so that a stray `$$` never
 * takes the rest of a text as TeX. Only a container's last `$$` can be unclosed, so the search stays
 * linear in the text.
 */
function mathCloserOf(lines: readonly string[], at: number): number | undefined {
  const line = lines[at]!;
  const indent = leadingSpaces(line);
  if (indent >= 4 || !isMathFence(line.slice(indent))) return undefined;
  let blank = true;
  for (let next = at + 1; next < lines.length; next++) {
    const candidate = lines[next]!;
    const candidateIndent = leadingSpaces(candidate);
    if (candidateIndent < 4 && isMathFence(candidate.slice(candidateIndent))) {
      return blank ? undefined : next;
    }
    if (!isBlank(candidate)) blank = false;
  }
  return undefined;
}

/**
 * The TeX of a line, without its indent, that is one `$$…$$` and nothing else, as the inline reader
 * reads one: a math block in a text that takes blocks. Undefined for any other line.
 */
function displayLineOf(rest: string): string | undefined {
  const line = trimSpaces(rest);
  if (line.length < 5 || !line.startsWith('$$') || line[2] === '$') return undefined;
  let at = 2;
  while (at < line.length) {
    const char = line[at]!;
    if (char === '\\') at += 2;
    else if (char === '$' && line[at + 1] === '$') break;
    else at++;
  }
  if (at !== line.length - 2) return undefined;
  const tex = line.slice(2, at);
  return isBlank(tex) ? undefined : tex;
}

function closesFence(rest: string, fence: { char: string; length: number }): boolean {
  let length = 0;
  while (rest[length] === fence.char) length++;
  return length >= fence.length && isBlank(rest.slice(length));
}

function headingOf(rest: string): { level: 1 | 2 | 3; text: string } | undefined {
  let level = 0;
  while (rest[level] === '#') level++;
  if (level < 1 || level > 3) return undefined;
  const after = rest[level];
  if (after !== undefined && after !== ' ' && after !== '\t') return undefined;
  let text = trimSpaces(rest.slice(level));
  let end = text.length;
  while (end > 0 && text[end - 1] === '#') end--;
  if (end === 0) text = '';
  else if (end < text.length && (text[end - 1] === ' ' || text[end - 1] === '\t')) {
    text = trimSpaces(text.slice(0, end));
  }
  return { level: level as 1 | 2 | 3, text };
}

function isRule(rest: string): boolean {
  let char: string | undefined;
  let count = 0;
  for (const each of rest) {
    if (each === ' ' || each === '\t') continue;
    if (each !== '*' && each !== '-' && each !== '_') return false;
    if (char !== undefined && each !== char) return false;
    char = each;
    count++;
  }
  return count >= 3;
}

/** A table whose head is the line at `at`, with its delimiter row under it. */
function tableAt(
  lines: readonly string[],
  at: number,
): { align: TableAlign[]; head: string[] } | undefined {
  const head = lines[at]!;
  const delimiter = lines[at + 1];
  if (delimiter === undefined || !hasPipe(delimiter) || !hasPipe(head)) return undefined;
  if (leadingSpaces(head) >= 4 || leadingSpaces(delimiter) >= 4) return undefined;
  const delimiters = cellsOf(delimiter);
  if (delimiters.length > MAX_TABLE_COLUMNS) return undefined;
  const align: TableAlign[] = [];
  for (const cell of delimiters) {
    if (!/^:?-+:?$/.test(cell)) return undefined;
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    align.push(left && right ? 'center' : left ? 'left' : right ? 'right' : 'none');
  }
  const cells = cellsOf(head);
  return cells.length === align.length ? { align, head: cells } : undefined;
}

function hasPipe(line: string): boolean {
  for (let at = 0; at < line.length; at++) {
    if (line[at] === '\\') at++;
    else if (line[at] === '|') return true;
  }
  return false;
}

/** A table row's cells, trimmed, with `\|` read as a pipe in them. */
function cellsOf(line: string): string[] {
  let text = trimSpaces(line);
  if (text.startsWith('|')) text = text.slice(1);
  const cells: string[] = [];
  let cell = '';
  let closed = false;
  for (let at = 0; at < text.length; at++) {
    const char = text[at]!;
    closed = false;
    if (char === '\\' && text[at + 1] === '|') {
      cell += '|';
      at++;
    } else if (char === '|') {
      cells.push(trimSpaces(cell));
      cell = '';
      closed = true;
    } else cell += char;
  }
  if (!closed || cells.length === 0) cells.push(trimSpaces(cell));
  return cells;
}

// ---------------------------------------------------------------------------------------------
// Inlines

type Style = 'bold' | 'italic' | 'strike' | 'underline' | 'highlight';

/** A node of a line's tree; siblings are linked both ways, so that wrapping them stays linear. */
interface Node {
  kind: 'text' | 'code' | 'math' | 'break' | 'span' | 'link' | 'edge';
  text: string;
  style?: Style;
  href?: string;
  /** A formula's TeX and style, on a `math` node, whose text is the TeX as written. */
  math?: { tex: string; display: boolean };
  first?: Node;
  last?: Node;
  prev?: Node;
  next?: Node;
}

interface Delimiter {
  node: Node;
  char: string;
  count: number;
  original: number;
  canOpen: boolean;
  canClose: boolean;
  prev?: Delimiter;
  next?: Delimiter;
}

interface Bracket {
  node: Node;
  below: Delimiter | undefined;
}

const SPECIAL = /[\\`*_~=+$[\]\n]/g;

/** Reads a paragraph's, a heading's or a cell's text into runs. */
function readInline(text: string, links: boolean, context: Context): EmphasisRun[] {
  const runs = runsOf(treeOf(text, links, context));
  const room = MAX_EMPHASIS_RUNS - context.runs;
  let kept = runs;
  if (runs.length > Math.max(room, 1)) {
    const keep = Math.max(room - 1, 0);
    kept = [...runs.slice(0, keep), plainRun(runsText(runs.slice(keep)))];
  }
  context.runs += kept.length;
  return kept;
}

function treeOf(text: string, links: boolean, context: Context): Node {
  const start: Node = { kind: 'edge', text: '' };
  const end: Node = { kind: 'edge', text: '' };
  start.next = end;
  end.prev = start;
  const append = (node: Node) => {
    const last = end.prev!;
    last.next = node;
    node.prev = last;
    node.next = end;
    end.prev = node;
  };
  let top: Delimiter | undefined;
  const brackets: Bracket[] = [];
  /** Brackets below this index on the stack are inactive: a link was made after them. */
  let activeFrom = 0;
  const backticks = backtickRuns(text);
  let dollars: ReturnType<typeof dollarRuns> | undefined;
  let lineEnd = -1;
  /** Where the line that holds `from` ends: a cursor that only moves on, as the reading does. */
  const lineEndAfter = (from: number) => {
    if (lineEnd < from) {
      lineEnd = text.indexOf('\n', from);
      if (lineEnd === -1) lineEnd = text.length;
    }
    return lineEnd;
  };
  /**
   * The formula that the run of `length` dollars at `at` opens, by Pandoc's `tex_math_dollars`
   * rule and GitHub's `` $`…`$ ``: where it ends, its TeX and its style. A formula never crosses a
   * line break, and its TeX is never blank.
   */
  const mathAt = (
    at: number,
    length: number,
  ): { end: number; tex: string; display: boolean } | undefined => {
    const end = lineEndAfter(at);
    dollars ??= dollarRuns(text);
    if (length === 2) {
      const closer = dollars.pair(at + 2);
      if (closer === undefined || closer >= end) return undefined;
      const tex = text.slice(at + 2, closer);
      return isBlank(tex) ? undefined : { end: closer + 2, tex, display: true };
    }
    if (text[at + 1] === '`') {
      // GitHub's form: a code span right between two dollars. A dollar before any other code span
      // is text, and the code span is read as one.
      let ticks = 1;
      while (text[at + 1 + ticks] === '`') ticks++;
      const closer = backticks.after(ticks, at + 1 + ticks);
      if (closer === undefined || closer >= end || text[closer + ticks] !== '$') return undefined;
      const tex = codeText(text.slice(at + 1 + ticks, closer));
      return isBlank(tex) ? undefined : { end: closer + ticks + 1, tex, display: false };
    }
    // Pandoc's rule: a non-space right after the opener; the closer is the next dollar not escaped,
    // with a non-space right before it and no digit right after it.
    if (at + 1 >= text.length || isSpace(characterAt(text, at + 1))) return undefined;
    const closer = dollars.single(at + 1);
    if (closer === undefined || closer >= end || isSpace(characterBefore(text, closer))) {
      return undefined;
    }
    const after = text[closer + 1];
    if (after !== undefined && after >= '0' && after <= '9') return undefined;
    return { end: closer + 1, tex: text.slice(at + 1, closer), display: false };
  };
  let buffer = '';
  const flush = () => {
    if (buffer !== '') append({ kind: 'text', text: buffer });
    buffer = '';
  };

  const removeDelimiter = (delimiter: Delimiter) => {
    if (delimiter.prev) delimiter.prev.next = delimiter.next;
    if (delimiter.next) delimiter.next.prev = delimiter.prev;
    else top = delimiter.prev;
  };

  const processEmphasis = (bottom: Delimiter | undefined) => {
    const openersBottom = new Map<string, Delimiter | undefined>();
    let closer: Delimiter | undefined;
    for (let delimiter = top; delimiter && delimiter !== bottom; delimiter = delimiter.prev) {
      closer = delimiter;
    }
    while (closer) {
      if (!closer.canClose) {
        closer = closer.next;
        continue;
      }
      const star = closer.char === '*' || closer.char === '_';
      const key = star
        ? `${closer.char}${closer.canOpen ? 3 : 0}${closer.original % 3}`
        : closer.char;
      const floor = openersBottom.has(key) ? openersBottom.get(key) : bottom;
      let opener = closer.prev;
      let found = false;
      while (opener && opener !== bottom && opener !== floor) {
        if (opener.char === closer.char && opener.canOpen) {
          const oddMatch =
            star &&
            (closer.canOpen || opener.canClose) &&
            (opener.original + closer.original) % 3 === 0 &&
            !(opener.original % 3 === 0 && closer.original % 3 === 0);
          if (!oddMatch) {
            found = true;
            break;
          }
        }
        opener = opener.prev;
      }
      if (!found || !opener) {
        const next = closer.next;
        openersBottom.set(key, closer.prev);
        if (!closer.canOpen) removeDelimiter(closer);
        closer = next;
        continue;
      }
      const use = star ? (closer.count >= 2 && opener.count >= 2 ? 2 : 1) : 2;
      const style: Style = star
        ? use === 2
          ? 'bold'
          : 'italic'
        : closer.char === '~'
          ? 'strike'
          : closer.char === '='
            ? 'highlight'
            : 'underline';
      opener.count -= use;
      closer.count -= use;
      opener.node.text = opener.char.repeat(opener.count);
      closer.node.text = closer.char.repeat(closer.count);
      wrap(opener.node, closer.node, { kind: 'span', text: '', style });
      opener.next = closer;
      closer.prev = opener;
      if (opener.count === 0) {
        unlink(opener.node);
        removeDelimiter(opener);
      }
      if (closer.count === 0) {
        const next = closer.next;
        unlink(closer.node);
        removeDelimiter(closer);
        closer = next;
      }
    }
    while (top && top !== bottom) removeDelimiter(top);
  };

  let at = 0;
  while (at < text.length) {
    SPECIAL.lastIndex = at;
    const found = SPECIAL.exec(text);
    if (!found) {
      buffer += text.slice(at);
      break;
    }
    if (found.index > at) buffer += text.slice(at, found.index);
    at = found.index;
    const char = text[at]!;
    switch (char) {
      case '\\': {
        const next = text[at + 1];
        if (next !== undefined && isAsciiPunctuation(next)) {
          buffer += next;
          at += 2;
        } else if (next === '\n') {
          flush();
          append({ kind: 'break', text: '\n' });
          at += 2;
        } else {
          buffer += '\\';
          at++;
        }
        break;
      }
      case '\n':
        // The spaces that end a line are not drawn.
        buffer = trimSpaces(buffer, 'end');
        flush();
        append({ kind: 'break', text: '\n' });
        at++;
        break;
      case '`': {
        let length = 1;
        while (text[at + length] === '`') length++;
        const closer = backticks.after(length, at + length);
        if (closer === undefined) {
          buffer += '`'.repeat(length);
          at += length;
          break;
        }
        flush();
        append({ kind: 'code', text: codeText(text.slice(at + length, closer)) });
        at = closer + length;
        break;
      }
      case '$': {
        // Math (ADR 0106), read as a code span is: whichever of the two opens first holds what
        // follows as its own, and neither takes emphasis inside.
        let length = 1;
        while (text[at + length] === '$') length++;
        const formula = length <= 2 ? mathAt(at, length) : undefined;
        if (!formula) {
          buffer += '$'.repeat(length);
          at += length;
          break;
        }
        flush();
        const typed = text.slice(at, formula.end);
        if (context.math < MAX_MATH_PER_TEXT) {
          context.math++;
          append({
            kind: 'math',
            text: typed,
            math: { tex: formula.tex, display: formula.display },
          });
        } else append({ kind: 'text', text: typed });
        at = formula.end;
        break;
      }
      case '[':
        if (!links) {
          buffer += '[';
          at++;
          break;
        }
        flush();
        append({ kind: 'text', text: '[' });
        brackets.push({ node: end.prev, below: top });
        at++;
        break;
      case ']': {
        const bracket = brackets.at(-1);
        if (!links || !bracket) {
          buffer += ']';
          at++;
          break;
        }
        const destination = brackets.length - 1 >= activeFrom ? linkTail(text, at + 1) : undefined;
        if (!destination) {
          brackets.pop();
          activeFrom = Math.min(activeFrom, brackets.length);
          buffer += ']';
          at++;
          break;
        }
        flush();
        processEmphasis(bracket.below);
        const link: Node = { kind: 'link', text: '' };
        if (/^(?:https?|mailto):/i.test(destination.href)) link.href = destination.href;
        wrap(bracket.node, end, link);
        unlink(bracket.node);
        brackets.pop();
        activeFrom = brackets.length;
        at = destination.end;
        break;
      }
      default: {
        // `*`, `_`, `~`, `=` or `+`.
        let length = 1;
        while (text[at + length] === char) length++;
        const run = char.repeat(length);
        if ((char === '~' || char === '=' || char === '+') && length !== 2) {
          buffer += run;
          at += length;
          break;
        }
        const before = characterBefore(text, at);
        const after = characterAt(text, at + length);
        const beforeSpace = isSpace(before);
        const afterSpace = isSpace(after);
        const beforePunctuation = isPunctuation(before);
        const afterPunctuation = isPunctuation(after);
        const leftFlanking = !afterSpace && (!afterPunctuation || beforeSpace || beforePunctuation);
        const rightFlanking =
          !beforeSpace && (!beforePunctuation || afterSpace || afterPunctuation);
        const canOpen =
          char === '_' ? leftFlanking && (!rightFlanking || beforePunctuation) : leftFlanking;
        const canClose =
          char === '_' ? rightFlanking && (!leftFlanking || afterPunctuation) : rightFlanking;
        flush();
        const node: Node = { kind: 'text', text: run };
        append(node);
        if (canOpen || canClose) {
          const delimiter: Delimiter = {
            node,
            char,
            count: length,
            original: length,
            canOpen,
            canClose,
            prev: top,
          };
          if (top) top.next = delimiter;
          top = delimiter;
        }
        at += length;
      }
    }
  }
  flush();
  processEmphasis(undefined);
  return start;
}

/** Moves the nodes strictly between `from` and `to` into `parent`, which takes their place. */
function wrap(from: Node, to: Node, parent: Node): void {
  const first = from.next!;
  const last = to.prev!;
  if (first !== to) {
    parent.first = first;
    parent.last = last;
    first.prev = undefined;
    last.next = undefined;
  }
  from.next = parent;
  parent.prev = from;
  parent.next = to;
  to.prev = parent;
}

function unlink(node: Node): void {
  if (node.prev) node.prev.next = node.next;
  if (node.next) node.next.prev = node.prev;
}

/** The runs of a tree, in order, with neighbours of the same emphasis merged. */
function runsOf(start: Node): EmphasisRun[] {
  const runs: EmphasisRun[] = [];
  const depth: Record<Style, number> = {
    bold: 0,
    italic: 0,
    strike: 0,
    underline: 0,
    highlight: 0,
  };
  const links: (string | undefined)[] = [];
  const parents: Node[] = [];
  const emit = (text: string, code: boolean, math: Node['math']) => {
    if (text === '') return;
    const link = links.at(-1);
    const last = runs.at(-1);
    // A formula is a run of its own, never merged with its neighbours.
    if (
      math === undefined &&
      last &&
      last.math === undefined &&
      last.code === code &&
      last.bold === depth.bold > 0 &&
      last.italic === depth.italic > 0 &&
      last.strike === depth.strike > 0 &&
      last.underline === depth.underline > 0 &&
      last.highlight === depth.highlight > 0 &&
      last.link === link
    ) {
      last.text += text;
      return;
    }
    const run: EmphasisRun = {
      text,
      bold: depth.bold > 0,
      italic: depth.italic > 0,
      strike: depth.strike > 0,
      underline: depth.underline > 0,
      code,
      highlight: depth.highlight > 0,
    };
    if (link !== undefined) run.link = link;
    if (math !== undefined) run.math = { tex: math.tex, display: math.display };
    runs.push(run);
  };
  let node: Node | undefined = start.next;
  for (;;) {
    if (!node) {
      const parent = parents.pop();
      if (!parent) break;
      if (parent.kind === 'span') depth[parent.style!]--;
      else links.pop();
      node = parent.next;
      continue;
    }
    if (node.kind === 'span' || node.kind === 'link') {
      if (node.kind === 'span') depth[node.style!]++;
      else links.push(node.href);
      parents.push(node);
      node = node.first;
      continue;
    }
    if (node.kind !== 'edge') emit(node.text, node.kind === 'code', node.math);
    node = node.next;
  }
  return runs;
}

/** Where each run of backticks starts, by its length, to find a code span's closer in linear time. */
function backtickRuns(text: string): {
  after: (length: number, from: number) => number | undefined;
} {
  const starts = new Map<number, number[]>();
  for (let at = 0; at < text.length; at++) {
    if (text[at] !== '`') continue;
    let length = 1;
    while (text[at + length] === '`') length++;
    let list = starts.get(length);
    if (!list) starts.set(length, (list = []));
    list.push(at);
    at += length - 1;
  }
  const cursors = new Map<number, number>();
  return {
    after(length, from) {
      const list = starts.get(length);
      if (!list) return undefined;
      let cursor = cursors.get(length) ?? 0;
      while (cursor < list.length && list[cursor]! < from) cursor++;
      cursors.set(length, cursor);
      return list[cursor];
    },
  };
}

/**
 * Where the dollars no backslash escapes are, alone and as the first of two, to find a formula's
 * closer in linear time: each search moves a cursor on, as the reading does.
 */
function dollarRuns(text: string): {
  single: (from: number) => number | undefined;
  pair: (from: number) => number | undefined;
} {
  const singles: number[] = [];
  const pairs: number[] = [];
  let backslashes = 0;
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (char === '\\') {
      backslashes++;
      continue;
    }
    if (char === '$' && backslashes % 2 === 0) {
      singles.push(at);
      if (text[at + 1] === '$') pairs.push(at);
    }
    backslashes = 0;
  }
  const cursor = (list: readonly number[]) => {
    let at = 0;
    return (from: number) => {
      while (at < list.length && list[at]! < from) at++;
      return list[at];
    };
  };
  return { single: cursor(singles), pair: cursor(pairs) };
}

/** A code span's text: its line breaks as spaces, and one space taken from each end if both have one. */
function codeText(raw: string): string {
  const text = raw.replace(/\n/g, ' ');
  if (text.length >= 2 && text.startsWith(' ') && text.endsWith(' ') && text.trim() !== '') {
    return text.slice(1, -1);
  }
  return text;
}

/**
 * The `(address "title")` after a link's label, from `(`: its address with escapes read, and where
 * it ends. Undefined when there is none, or when it is longer than a link's tail may be.
 */
function linkTail(text: string, from: number): { href: string; end: number } | undefined {
  if (text[from] !== '(') return undefined;
  const limit = Math.min(text.length, from + MAX_LINK_TAIL);
  let at = skipLinkSpace(text, from + 1, limit);
  let href = '';
  if (text[at] === '<') {
    at++;
    for (; at < limit; at++) {
      const char = text[at]!;
      if (char === '>') break;
      if (char === '\n' || char === '<') return undefined;
      if (char === '\\' && isAsciiPunctuation(text[at + 1] ?? '')) {
        href += text[at + 1];
        at++;
      } else href += char;
    }
    if (text[at] !== '>') return undefined;
    at++;
  } else {
    let depth = 0;
    for (; at < limit; at++) {
      const char = text[at]!;
      if (char <= ' ' || char === '\u007f') break;
      if (char === '\\' && isAsciiPunctuation(text[at + 1] ?? '')) {
        href += text[at + 1];
        at++;
        continue;
      }
      if (char === '(') {
        depth++;
        if (depth > 32) return undefined;
      } else if (char === ')') {
        if (depth === 0) break;
        depth--;
      }
      href += char;
    }
    if (depth !== 0) return undefined;
  }
  const beforeTitle = at;
  at = skipLinkSpace(text, at, limit);
  const quote = text[at];
  if (at > beforeTitle && (quote === '"' || quote === "'" || quote === '(')) {
    const close = quote === '(' ? ')' : quote;
    at++;
    for (; at < limit; at++) {
      const char = text[at]!;
      if (char === '\\') at++;
      else if (char === close) break;
      else if (quote === '(' && char === '(') return undefined;
    }
    if (text[at] !== close) return undefined;
    at = skipLinkSpace(text, at + 1, limit);
  }
  if (text[at] !== ')') return undefined;
  return { href, end: at + 1 };
}

/** Skips spaces, tabs and at most one line break. */
function skipLinkSpace(text: string, from: number, limit: number): number {
  let at = from;
  let breaks = 0;
  while (at < limit) {
    const char = text[at];
    if (char === ' ' || char === '\t') at++;
    else if (char === '\n' && breaks === 0) {
      breaks++;
      at++;
    } else break;
  }
  return at;
}

// ---------------------------------------------------------------------------------------------
// Characters

function plainRun(text: string): EmphasisRun {
  return {
    text,
    bold: false,
    italic: false,
    strike: false,
    underline: false,
    code: false,
    highlight: false,
  };
}

const ASCII_PUNCTUATION = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~');

function isAsciiPunctuation(char: string): boolean {
  return ASCII_PUNCTUATION.has(char);
}

const PUNCTUATION = /[\p{P}\p{S}]/u;
const SPACE = /\s/u;
const WORD = /[\p{L}\p{N}]/u;

/** The character before `at`, a whole code point; a line's start reads as a space. */
function characterBefore(text: string, at: number): string {
  if (at === 0) return '\n';
  const low = text.charCodeAt(at - 1);
  if (low >= 0xdc00 && low <= 0xdfff && at >= 2) return text.slice(at - 2, at);
  return text[at - 1]!;
}

/** The character at `at`, a whole code point; a line's end reads as a space. */
function characterAt(text: string, at: number): string {
  if (at >= text.length) return '\n';
  const point = text.codePointAt(at)!;
  return String.fromCodePoint(point);
}

function isSpace(char: string): boolean {
  return SPACE.test(char);
}

function isPunctuation(char: string): boolean {
  return PUNCTUATION.test(char);
}

/** Whether the character next to `at`, in the given direction, is a letter or a digit. */
function isWordCharacter(text: string, at: number, direction: -1 | 1): boolean {
  if (at < 0 || at >= text.length) return false;
  const char = direction < 0 ? characterBefore(text, at + 1) : characterAt(text, at);
  return WORD.test(char);
}

/** Whether only spaces and tabs come from `from` to the end of its line. */
function restIsBlank(text: string, from: number): boolean {
  for (let at = from; at < text.length; at++) {
    const char = text[at];
    if (char === '\n' || char === '\r') return true;
    if (char !== ' ' && char !== '\t') return false;
  }
  return true;
}

function isBlank(line: string): boolean {
  for (const char of line) if (char !== ' ' && char !== '\t') return false;
  return true;
}

function leadingSpaces(line: string): number {
  let count = 0;
  while (line[count] === ' ') count++;
  return count;
}

function trimLeadingSpaces(text: string): string {
  return trimSpaces(text, 'start');
}

/** A text without the spaces and tabs at its ends, or at one of them; a loop, never a regex. */
function trimSpaces(text: string, ends: 'both' | 'start' | 'end' = 'both'): string {
  let start = 0;
  let end = text.length;
  if (ends !== 'end') {
    while (start < end && (text[start] === ' ' || text[start] === '\t')) start++;
  }
  if (ends !== 'start') {
    while (end > start && (text[end - 1] === ' ' || text[end - 1] === '\t')) end--;
  }
  return text.slice(start, end);
}

/** A line with the tabs at its start turned into spaces, to the next multiple of four columns. */
function expandLeadingTabs(line: string): string {
  if (
    !line.startsWith('\t') &&
    !line.startsWith(' \t') &&
    !line.startsWith('  \t') &&
    !line.startsWith('   \t')
  ) {
    return line;
  }
  let column = 0;
  let at = 0;
  for (; at < line.length; at++) {
    if (line[at] === ' ') column++;
    else if (line[at] === '\t') column += 4 - (column % 4);
    else break;
  }
  return ' '.repeat(column) + line.slice(at);
}
