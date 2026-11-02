/**
 * The live protocol's request to read a package file the person chose on this computer, and its
 * answer (ADR 0089's M14.2 clarification). The app sends the file's text, as the browser's picker read
 * it; the local program parses it and checks it against the package file's JSON Schema, running
 * nothing, and answers with the package or with `command/rejected` and what the schema found. The app
 * shows what adding or updating it does, and then sends the commands, which the core checks again.
 *
 * Each reader keeps only what its message holds, or says why it cannot be read; the live protocol
 * turns that into its own error.
 */
import type { PackageFile } from '@visual-anything/schema';

/**
 * The longest text of a package file read this way, in characters. Escaped as JSON, a message holding
 * it stays within the live connection's 5 MiB, even if every character took two.
 */
export const MAX_PACKAGE_FILE_TEXT = 2 * 1024 * 1024;

/** The longest file name such a request names. */
export const MAX_PACKAGE_FILE_NAME = 1000;

/** The most problems the local program says of a file the schema refuses. */
export const MAX_PACKAGE_FILE_PROBLEMS = 20;

/** Asks the local program to read a package file's text. */
export interface PackageReadMessage {
  type: 'package/read';
  requestId: string;
  /** The file's name, as the picker gave it, to say which file a problem is in. */
  name: string;
  /** The file's text, at most {@link MAX_PACKAGE_FILE_TEXT} characters. */
  text: string;
}

/** The package the file holds, as the schema found it valid; nothing in it ran. */
export interface PackageReadAnswerMessage {
  type: 'package/read-answer';
  requestId: string;
  package: PackageFile;
}

/** A message read, or why it could not be. */
export type PackageMessageRead<T> = { ok: true; message: T } | { ok: false; reason: string };

/** Reads an app's request to read a package file. */
export function readPackageRead(
  message: Record<string, unknown>,
  requestId: string,
): PackageMessageRead<PackageReadMessage> {
  const { name, text } = message;
  if (typeof name !== 'string' || name === '' || name.length > MAX_PACKAGE_FILE_NAME) {
    return { ok: false, reason: 'Reading a package file names it, in 1 to 1000 characters.' };
  }
  if (typeof text !== 'string' || text.length > MAX_PACKAGE_FILE_TEXT) {
    return { ok: false, reason: 'Reading a package file needs its text, of at most 2 MiB.' };
  }
  return { ok: true, message: { type: 'package/read', requestId, name, text } };
}

/**
 * Reads the local program's answer: only its envelope, since the program checked the package against
 * the schema, as it checks the project's files it sends.
 */
export function readPackageReadAnswer(
  message: Record<string, unknown>,
  requestId: string,
): PackageMessageRead<PackageReadAnswerMessage> {
  const file = message.package;
  if (
    typeof file !== 'object' ||
    file === null ||
    Array.isArray(file) ||
    typeof (file as Record<string, unknown>).id !== 'string'
  ) {
    return { ok: false, reason: 'The package file Visual Anything read cannot be read.' };
  }
  return {
    ok: true,
    message: { type: 'package/read-answer', requestId, package: file as PackageFile },
  };
}

/**
 * What the schema found in a package file, as problems a person reads: "The package file must have
 * the key "id"." for the whole file, "In the package file, /components/0/name must not be empty."
 * for a part of it, and "The file is not valid JSON." for text that is no JSON. At most
 * {@link MAX_PACKAGE_FILE_PROBLEMS}, the last saying how many more there are.
 */
export function packageFileProblems(
  errors: readonly { path: string; message: string }[],
): string[] {
  const said = errors.map(({ path, message }) =>
    path === ''
      ? message.startsWith('Not valid JSON')
        ? 'The file is not valid JSON.'
        : `The package file ${message}.`
      : `In the package file, ${path} ${message}.`,
  );
  if (said.length <= MAX_PACKAGE_FILE_PROBLEMS) return said;
  const kept = said.slice(0, MAX_PACKAGE_FILE_PROBLEMS - 1);
  return [...kept, `And ${said.length - kept.length} more problems.`];
}
