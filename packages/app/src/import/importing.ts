/**
 * What the import dialog does besides drawing itself (ADR-0042): reads a chosen file or pasted text,
 * keeps the person's choices of components and relation types, prepares the one batch the core makes
 * of them, and checks that the live connection can carry it. It works on any plan any reader makes, so
 * a reader added to the core's list is imported the same way.
 */
import {
  DRAWING_EXTENSIONS,
  IMPORT_READERS,
  MAX_IMPORT_TEXT,
  parseDelimited,
  prepareImport,
  readImport,
  recordOf,
  suggestMapping,
  type ImportInput,
  type ImportMapping,
  type ImportPlan,
  type ImportReader,
  type PreparedImport,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';

/** The largest message the live connection carries from an app (ADR-0027); a larger one closes it. */
export const LIVE_MESSAGE_LIMIT = 4 * 1024 * 1024;

/**
 * The file name endings the file chooser offers: every reader's, the pictures a draw.io diagram can be
 * kept in, whose own endings, as `.drawio.png`, a file chooser does not match, and HTML, imported as a
 * drawing (ADR 0068).
 */
export const ACCEPTED = [
  ...new Set([
    ...IMPORT_READERS.flatMap((reader) => reader.extensions),
    '.svg',
    '.png',
    ...DRAWING_EXTENSIONS,
  ]),
].join(',');

/** A file read for import, or why it was not. */
export type ReadFile =
  | { ok: true; input: ImportInput }
  | { ok: false; problem: 'too-large' | 'unreadable'; detail?: string };

/** Reads a chosen file whole, as text and as bytes, when it is no larger than an import reads. */
export async function readChosenFile(file: File): Promise<ReadFile> {
  if (file.size > MAX_IMPORT_TEXT) return { ok: false, problem: 'too-large' };
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return {
      ok: true,
      input: { name: file.name, text: new TextDecoder('utf-8').decode(bytes), bytes },
    };
  } catch (error) {
    return {
      ok: false,
      problem: 'unreadable',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** What the person chose: a component or relation type for each kind, the nesting one, and views. */
export interface Choices {
  elements: ReadonlyMap<string, Id>;
  relations: ReadonlyMap<string, Id>;
  nesting: Id | undefined;
  /** Whether to create the views the plan brings. */
  views: boolean;
}

/** The choices the dialog starts with: the suggested mapping, with the plan's views. */
export function suggestedChoices(
  project: ProjectSnapshot,
  plan: ImportPlan,
  view: Id | undefined,
): Choices {
  const mapping = suggestMapping(project, plan, view === undefined ? {} : { view });
  return {
    elements: new Map(Object.entries(mapping.elements)),
    relations: new Map(Object.entries(mapping.relations)),
    nesting: mapping.nesting,
    views: true,
  };
}

/** The choices as the mapping the core reads: records with no prototype, holding the plan's kinds. */
export function mappingOf(choices: Choices): ImportMapping {
  return {
    elements: recordOf(choices.elements),
    relations: recordOf(choices.relations),
    ...(choices.nesting === undefined ? {} : { nesting: choices.nesting }),
  };
}

/** A read file, as the dialog keeps it. */
export interface Reading {
  input: ImportInput;
  reader: ImportReader;
  plan: ImportPlan;
}

/** Reads a file with the reader the person chose, or the one that fits; the key matches rows again. */
export function readInput(
  project: ProjectSnapshot,
  input: ImportInput,
  options: { format?: string; key?: string } = {},
): { ok: true; reading: Reading } | { ok: false; problems: string[] } {
  const read = readImport(input, { project, ...options });
  if (!read.ok) return { ok: false, problems: read.problems };
  if (read.reader === undefined) return { ok: false, problems: [] };
  return { ok: true, reading: { input, reader: read.reader, plan: read.plan } };
}

/** The import a plan and the choices make, or why they cannot make one, and whether it can be sent. */
export type Prepared =
  { ok: true; prepared: PreparedImport; size: number } | { ok: false; problems: string[] };

/** Prepares the one batch, and measures the message that would carry it. */
export function prepare(project: ProjectSnapshot, plan: ImportPlan, choices: Choices): Prepared {
  const chosen = choices.views ? plan : { ...plan, views: [] };
  const prepared = prepareImport(project, chosen, mappingOf(choices));
  if (!prepared.ok) return prepared;
  const size = new TextEncoder().encode(
    JSON.stringify({ type: 'command', requestId: 'request-0000000000', command: prepared.command }),
  ).length;
  return { ok: true, prepared, size };
}

/**
 * The columns or keys rows can be matched by when importing again: the header of a spreadsheet's
 * first table, or a JSON element's id and name.
 */
export function keysOf(reading: Reading): string[] {
  if (reading.reader.format === 'json') return ['id', 'name'];
  if (reading.reader.format !== 'table') return [];
  const first = reading.input.text
    .slice(0, 65_536)
    .split(/\r\n|\r|\n/)
    .find((line) => line.trim() !== '');
  if (first === undefined) return [];
  const delimiter = first.includes('\t')
    ? '\t'
    : first.split(';').length > first.split(',').length
      ? ';'
      : ',';
  const parsed = parseDelimited(first, delimiter);
  if (!parsed.ok) return [];
  return [
    ...new Set(
      (parsed.rows[0]?.cells ?? []).map((cell) => cell.trim()).filter((cell) => cell !== ''),
    ),
  ];
}
