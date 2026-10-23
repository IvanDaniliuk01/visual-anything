import type { FileContentByKind, FileKind } from './kinds';

/** A problem found in a project file. */
export interface ValidationError {
  /** A JSON pointer to the value with the problem; empty when it concerns the whole file. */
  path: string;
  message: string;
}

/** The outcome of reading a project file: its contents, or every problem found in it. */
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: ValidationError[] };

/** Parses the text of a project file of the given kind and validates it. */
export function parseFile<K extends FileKind>(
  kind: K,
  text: string,
): ValidationResult<FileContentByKind[K]> {
  const json = text.startsWith('﻿') ? text.slice(1) : text;
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [{ path: '', message: `Not valid JSON: ${reason}` }] };
  }
  return validateFile(kind, data);
}

/** Validates parsed JSON against the JSON Schema of the given kind of project file. */
export function validateFile<K extends FileKind>(
  kind: K,
  data: unknown,
): ValidationResult<FileContentByKind[K]> {
  // Stub until the JSON Schema is generated: accepts any data.
  void kind;
  return { ok: true, value: data as FileContentByKind[K] };
}
