/**
 * What every import reader shares (ADR-0042): the file it reads, what else it may use, and what it
 * answers. Each reader is pure and strict: it reads the file it is given and nothing else, runs and
 * follows nothing in it, and refuses what it cannot read with reasons, rather than guessing.
 */
import type { ProjectSnapshot } from '../snapshot';
import type { ImportPlan } from './plan';

/** A file to import, as the person chose it or pasted it. */
export interface ImportInput {
  /** The file's name, or what the person called pasted text; the import's action is named after it. */
  name: string;
  /** Its content as text, a file's read as UTF-8. */
  text: string;
  /** Its bytes, for formats that are not text, such as a draw.io PNG; absent for pasted text. */
  bytes?: Uint8Array;
}

/** What a reader may use besides the file. */
export interface ReadOptions {
  /**
   * The project the import lands in. Its definitions shape the suggestions, and a spreadsheet matches
   * its rows to the project's elements.
   */
  project?: ProjectSnapshot;
  /**
   * For a spreadsheet: the column whose values match its rows to elements already in the project, as
   * importing again does; the `id` column when there is one, by default.
   */
  key?: string;
}

/** What a reader made of a file: its plan, or why it could not read it. */
export type ReadResult = { ok: true; plan: ImportPlan } | { ok: false; problems: string[] };

/** A reader of one format, as the mapping dialog, the command line and Claude's tools list them. */
export interface ImportReader {
  /** The family of formats it reads, such as `mermaid`; the plans it makes name the exact one. */
  format: string;
  /** What the person calls the format, in English, as the app shows it through its catalog. */
  name: string;
  /** The file name endings it reads, in lower case, such as `.mmd`. */
  extensions: readonly string[];
  /** Whether a file looks like this format, by its name or its first lines. */
  recognizes(input: ImportInput): boolean;
  read(input: ImportInput, options?: ReadOptions): ReadResult;
}

/** Whether a file's name ends with one of the endings, in any case. */
export function hasExtension(name: string, extensions: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return extensions.some((extension) => lower.endsWith(extension));
}

/** The file's name without its last extension, as a view is named after it. */
export function baseName(name: string): string {
  const file = name.split(/[\\/]/).pop() ?? name;
  const dot = file.lastIndexOf('.');
  return dot > 0 ? file.slice(0, dot) : file;
}
