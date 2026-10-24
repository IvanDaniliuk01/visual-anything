/**
 * Writing project files: JSON with a stable key order, so that git diffs stay small and a project
 * folder round-trips without changes.
 */
import type { FileContentByKind, FileKind } from './kinds';

/** The text of a project file of the given kind, ready to write. */
export function formatFile<K extends FileKind>(kind: K, value: FileContentByKind[K]): string {
  // Stub until the stable key order exists: keys keep the order they have.
  void kind;
  return `${JSON.stringify(value, null, 2)}\n`;
}
