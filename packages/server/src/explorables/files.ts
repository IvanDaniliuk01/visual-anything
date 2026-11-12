/**
 * The files of `explorables/` beside a project (ADR 0107): each explorable's text, one HTML file
 * named by its definition, which the person may edit in their own editor.
 *
 * - **Reading.** A file is read as any project file is: a regular file inside the project folder,
 *   within a cap (ADR 0030's checks, `readRegularFile`). It must be UTF-8. Its text is the project's
 *   `explorableTexts` entry, `{ id, text, read: true }`, when it hashes to its definition's `hash`;
 *   otherwise the program records it as the person's action "The file of … changed". A file past
 *   512 KiB is recorded by its hash and never runs; one past {@link MAX_READ_BYTES} is not read.
 * - **Writing.** The program writes what `explorableFileWrites` says after an action, atomically
 *   (temporary file, then rename), only over a file whose bytes are those it last read or wrote, so
 *   that a change the person saved meanwhile is never lost. It never deletes a file.
 */
import { join } from 'node:path';
import {
  MAX_EXPLORABLE_BYTES,
  explorableTextHash,
  explorablesIn,
  type ExplorableFileFinding,
  type ExplorableText,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { readRegularFile } from '../regular-files';
import { writeFileAtomic, type WriteOptions } from '../writer';

/** The folder of a project that holds its explorables' files. */
export const EXPLORABLES_FOLDER = 'explorables';

/**
 * The most bytes of a file read to record its hash: past 512 KiB a text is kept, warned about and
 * never runs, but its hash is still recorded, up to here.
 */
export const MAX_READ_BYTES = 8 * 1024 * 1024;

/** A file's path in the project folder: `explorables/<file>`. */
export function explorableFilePath(folder: string, file: string): string {
  return join(folder, EXPLORABLES_FOLDER, file);
}

/** What one file of `explorables/` holds now, as the program read it. */
export type ExplorableFileRead =
  | { kind: 'text'; bytes: Buffer; text: string }
  | { kind: 'missing' }
  /** Past {@link MAX_READ_BYTES}, a link, a folder or a file that could not be read. */
  | { kind: 'unread'; finding: ExplorableFileFinding }
  /** Not UTF-8. */
  | { kind: 'not-text'; bytes: Buffer };

const UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** Reads one file of `explorables/` as a regular file inside the project folder. */
export async function readExplorableFile(
  folder: string,
  file: string,
): Promise<ExplorableFileRead> {
  const read = await readRegularFile(explorableFilePath(folder, file), MAX_READ_BYTES, {
    inside: folder,
  });
  if (!read.ok) {
    if (read.reason === 'missing') return { kind: 'missing' };
    return { kind: 'unread', finding: read.reason === 'too-large' ? 'too-large' : 'missing' };
  }
  let text: string;
  try {
    text = UTF8.decode(read.bytes);
  } catch {
    return { kind: 'not-text', bytes: read.bytes };
  }
  return { kind: 'text', bytes: read.bytes, text };
}

/** A file whose text no longer hashes to its definition: the action that records it is to run. */
export interface ChangedExplorableFile {
  id: Id;
  text: string;
}

/** What reading every explorable's file came to. */
export interface ExplorableFilesRead {
  /** The project with each text that hashes to its definition, `read: true`, in definition order. */
  state: ProjectSnapshot;
  /** The texts that do not, to record as "The file of … changed". */
  changed: ChangedExplorableFile[];
  /** What is wrong with a file, by its name, for `explorableFileProblems`. */
  findings: Map<string, ExplorableFileFinding>;
  /** The bytes of each file as read, by its name; `null` for a file that is not there. */
  bytes: Map<string, Buffer | null>;
}

/**
 * Reads the file of every explorable the project's packages define (ADR 0107), as the project opens
 * or is read again: the project holds the texts that hash to their definitions; the others are to be
 * recorded. Texts the project held before are replaced by what the files hold now.
 */
export async function readExplorableFiles(
  folder: string,
  state: ProjectSnapshot,
): Promise<ExplorableFilesRead> {
  const texts: ExplorableText[] = [];
  const changed: ChangedExplorableFile[] = [];
  const findings = new Map<string, ExplorableFileFinding>();
  const bytes = new Map<string, Buffer | null>();
  const seen = new Set<string>();
  for (const { definition } of explorablesIn(state).explorables.values()) {
    // Two explorables that name one file: only the first runs, as the core's check warns.
    if (seen.has(definition.file)) continue;
    seen.add(definition.file);
    const read = await readExplorableFile(folder, definition.file);
    const found = readFinding(read);
    if (found !== undefined) findings.set(definition.file, found);
    bytes.set(
      definition.file,
      read.kind === 'text' || read.kind === 'not-text' ? read.bytes : null,
    );
    if (read.kind !== 'text') continue;
    if (explorableTextHash(read.text) !== definition.hash) {
      changed.push({ id: definition.id, text: read.text });
    } else if (read.bytes.length <= MAX_EXPLORABLE_BYTES) {
      texts.push({ id: definition.id, text: read.text, read: true });
    }
  }
  const next: ProjectSnapshot = { ...state };
  if (texts.length > 0) next.explorableTexts = texts;
  else delete next.explorableTexts;
  return { state: next, changed, findings, bytes };
}

/** What a file read says is wrong with it, if anything. */
export function readFinding(read: ExplorableFileRead): ExplorableFileFinding | undefined {
  switch (read.kind) {
    case 'missing':
      return 'missing';
    case 'unread':
      return read.finding;
    case 'not-text':
      return 'not-text';
    case 'text':
      return read.bytes.length > MAX_EXPLORABLE_BYTES ? 'too-large' : undefined;
  }
}

/** Writes an explorable's text to its file, atomically, as a regular file inside the project folder. */
export async function writeExplorableFile(
  folder: string,
  file: string,
  bytes: Buffer,
  options: WriteOptions = {},
): Promise<void> {
  await writeFileAtomic(explorableFilePath(folder, file), bytes, {
    ...options,
    regularOnly: true,
    inside: folder,
  });
}
