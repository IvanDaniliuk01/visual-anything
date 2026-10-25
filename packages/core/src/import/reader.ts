/**
 * What every import reader shares (ADR-0042): the file it reads, what else it may use, and what it
 * answers. Each reader is pure and strict: it reads the file it is given and nothing else, runs and
 * follows nothing in it, and refuses what it cannot read with reasons, rather than guessing.
 */
import { ESSENCE_ID, RELATES_TO_ID, type Id } from '@visual-anything/schema';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn } from '../state';
import type { ImportRead, ReadOptions as DiagramReadOptions } from './reading';

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
export interface ReadOptions extends DiagramReadOptions {
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
export type ReadResult = ImportRead;

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
  /**
   * Whether what a file holds says, whatever its name, that it is this format, as a Structurizr
   * workspace's model does in a `.json` file; such readers are asked before names are.
   */
  identifies?(input: ImportInput): boolean;
  read(input: ImportInput, options?: ReadOptions): ReadResult;
}

/**
 * A record's own value for a key that comes from a file, or undefined: never what every object
 * inherits, such as `constructor`, `toString` or `__proto__`. Every lookup keyed by text from a file
 * goes through it, or through a `Map`.
 */
export function own<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/**
 * A record of what a file names, keyed by its text, with no prototype: a key such as `__proto__` or
 * `constructor` is an entry like any other, and a key it lacks reads as undefined.
 */
export function recordOf<T>(entries: Iterable<readonly [string, T]>): Record<string, T> {
  const record = Object.create(null) as Record<string, T>;
  for (const [key, value] of entries) {
    Object.defineProperty(record, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return record;
}

/** The one key no attribute may have, since every object reads and writes its prototype through it. */
export const FORBIDDEN_NAME = '__proto__';

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

/**
 * What readers are told the project uses, so that they suggest only that: what the caller
 * says, else the project's components and relation types, Essence and "relates to".
 */
export function usesOf(options: ReadOptions | undefined): ((id: Id) => boolean) | undefined {
  if (options?.uses !== undefined) return options.uses;
  const project = options?.project;
  if (project === undefined) return undefined;
  const definitions = definitionsIn(project);
  return (id) =>
    id === ESSENCE_ID ||
    id === RELATES_TO_ID ||
    definitions.components.has(id) ||
    definitions.relationTypes.has(id);
}
