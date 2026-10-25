/**
 * Editing in the element list (R42): one cell read as its column's type into a change of its
 * element, and a block of cells pasted from a spreadsheet, tab-separated as spreadsheets copy them,
 * turned into one batch of changes, one for each element, so that one undo takes the whole paste
 * back. Every value goes through the core's checks when the batch runs, as any command's do.
 */
import {
  isExternalId,
  readDestination,
  type BatchCommand,
  type ExternalIdChanges,
  type UpdateElementCommand,
} from '@visual-anything/core';
import type { Attributes, Element, JsonValue } from '@visual-anything/schema';
import { t } from '../i18n';
import { readJson, readNumber } from '../shell/inspector/attributes';
import { cellType, editable, type Column } from './rows';

/** A change to one element, as `update-element` takes it. */
export type ElementChange = UpdateElementCommand['changes'];

/** What a cell's text comes to: the change it makes, or why it makes none. */
export type CellReading = { ok: true; change: ElementChange } | { ok: false; message: string };

/** What a boolean cell takes, in either language, whatever its case. */
const TRUE = new Set(['true', 'yes', 'sí', 'si', '1']);
const FALSE = new Set(['false', 'no', '0']);

/**
 * Reads a cell's text as its column's value: a name, which cannot be empty; an attribute's value by
 * its type, an emptied cell taking the element's own value out; or an identifier, an emptied cell
 * taking it out. `current` is the cell's value now, which types an attribute only elements have.
 */
export function readCell(
  column: Column,
  text: string,
  current: JsonValue | undefined,
): CellReading {
  switch (column.kind) {
    case 'name':
      return text.trim() === ''
        ? { ok: false, message: t('An element needs a name.') }
        : { ok: true, change: { name: text } };
    case 'component':
      return { ok: false, message: t('The component is changed in the inspector.') };
    case 'id': {
      if (text === '') return { ok: true, change: { ids: { [column.scheme]: null } } };
      return isExternalId(text)
        ? { ok: true, change: { ids: { [column.scheme]: text } } }
        : {
            ok: false,
            message: t('An identifier has 1 to {n} characters, without line breaks.', { n: 200 }),
          };
    }
    case 'attribute': {
      if (text === '') return { ok: true, change: { removeAttributes: [column.name] } };
      const value = readValue(cellType(column, current), text);
      return value.ok
        ? { ok: true, change: { attributes: { [column.name]: value.value } } }
        : value;
    }
  }
}

/** A cell's text read as a value of a type. */
function readValue(
  type: ReturnType<typeof cellType>,
  text: string,
): { ok: true; value: JsonValue } | { ok: false; message: string } {
  switch (type) {
    case 'string':
      return { ok: true, value: text };
    case 'number':
      return readNumber(text);
    case 'boolean': {
      const word = text.trim().toLowerCase();
      if (TRUE.has(word)) return { ok: true, value: true };
      if (FALSE.has(word)) return { ok: true, value: false };
      return { ok: false, message: t('Write true or false.') };
    }
    case 'json':
      return readJson(text);
    case 'destination': {
      const read = readJson(text);
      if (!read.ok) return read;
      const destination = readDestination(read.value);
      return destination.ok
        ? { ok: true, value: read.value }
        : {
            ok: false,
            message: t('This is not a destination: {why}', { why: t.message(destination.why) }),
          };
    }
  }
}

/** Two changes to one element, as one: the second's values over the first's. */
function merged(first: ElementChange, second: ElementChange): ElementChange {
  const next: ElementChange = { ...first, ...second };
  if (first.attributes !== undefined || second.attributes !== undefined) {
    const attributes: Attributes = { ...first.attributes, ...second.attributes };
    next.attributes = attributes;
  }
  if (first.removeAttributes !== undefined || second.removeAttributes !== undefined) {
    next.removeAttributes = [...(first.removeAttributes ?? []), ...(second.removeAttributes ?? [])];
  }
  if (first.ids !== undefined || second.ids !== undefined) {
    const ids: ExternalIdChanges = { ...first.ids, ...second.ids };
    next.ids = ids;
  }
  return next;
}

/** What pasting a block of cells comes to: one batch, how many cells it sets, and what it left. */
export interface Pasted {
  /** The batch, one change for each element; absent when no cell could be pasted. */
  command?: BatchCommand;
  cells: number;
  /** The cells it could not read, each said in words. */
  problems: string[];
}

/**
 * The one batch a block of cells pasted at a cell comes to: each cell of the block on the element
 * of its row and the column of its column, counted from that cell, in the order the list shows them.
 * Cells outside the list, and in the component's column, are left out; cells that cannot be read are
 * said in `problems`, and the rest pasted.
 */
export function pasteCommand(
  elements: readonly Element[],
  columns: readonly Column[],
  at: { row: number; column: number },
  cells: readonly (readonly string[])[],
): Pasted {
  const changes = new Map<Element, ElementChange>();
  const problems: string[] = [];
  let count = 0;
  cells.forEach((row, down) => {
    const element = elements[at.row + down];
    if (element === undefined) return;
    row.forEach((text, across) => {
      const column = columns[at.column + across];
      if (column === undefined || !editable(column)) return;
      const current = column.kind === 'attribute' ? element.attributes?.[column.name] : undefined;
      const read = readCell(column, text, current);
      if (!read.ok) {
        problems.push(
          t('“{name}”, {column}: {why}', {
            name: element.name,
            column:
              column.kind === 'attribute'
                ? column.name
                : column.kind === 'id'
                  ? column.scheme
                  : t('Name'),
            why: read.message,
          }),
        );
        return;
      }
      count += 1;
      changes.set(element, merged(changes.get(element) ?? {}, read.change));
    });
  });
  if (changes.size === 0) return { cells: 0, problems };
  return {
    command: {
      type: 'batch',
      label:
        count === 1
          ? 'Paste 1 cell into the element list'
          : `Paste ${count} cells into the element list`,
      commands: [...changes].map(([element, change]) => ({
        type: 'update-element',
        id: element.id,
        changes: change,
      })),
    },
    cells: count,
    problems,
  };
}

/**
 * The rows and cells of tab-separated text, as spreadsheets copy them: rows end at a line break, a
 * last empty line counting for none; cells end at a tab; a cell that starts with a quote runs to its
 * closing quote, across tabs and lines, with two quotes standing for one. Empty text is one empty
 * cell, which pastes as emptying it.
 */
export function parseCells(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let at = 0;
  let quoted = false;
  let fresh = true;
  const endCell = () => {
    row.push(cell);
    cell = '';
    fresh = true;
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };
  while (at < text.length) {
    const char = text[at] as string;
    if (quoted) {
      if (char === '"') {
        if (text[at + 1] === '"') {
          cell += '"';
          at += 2;
          continue;
        }
        quoted = false;
        at += 1;
        continue;
      }
      cell += char;
      at += 1;
      continue;
    }
    if (char === '"' && fresh) {
      quoted = true;
      fresh = false;
      at += 1;
      continue;
    }
    if (char === '\t') {
      endCell();
      at += 1;
      continue;
    }
    if (char === '\r' || char === '\n') {
      endRow();
      at += char === '\r' && text[at + 1] === '\n' ? 2 : 1;
      continue;
    }
    cell += char;
    fresh = false;
    at += 1;
  }
  // A last line break ends the last row; otherwise the last row ends with the text.
  const endedWithBreak = /[\r\n]$/.test(text);
  if (!endedWithBreak || rows.length === 0) endRow();
  return rows;
}

/** A cell as tab-separated text writes it: quoted when it holds a quote, a tab or a line break. */
function cellOut(cell: string, alone: boolean): string {
  if (/["\t\r\n]/.test(cell) || (alone && cell === '')) return `"${cell.replaceAll('"', '""')}"`;
  return cell;
}

/** Cells as tab-separated text, which {@link parseCells} reads back, as spreadsheets take them. */
export function cellsText(cells: readonly (readonly string[])[]): string {
  return cells
    .map((row) => row.map((cell) => cellOut(cell, row.length === 1)).join('\t'))
    .join('\n');
}
