/**
 * Every import reader, and the choice of one for a file (ADR-0042): the reader the person names, else
 * the one whose file name ending it is, else the first whose content it recognizes. The mapping
 * dialog, the command line and Claude's tools all read through here, so a reader added to the list
 * is offered everywhere. A reader of JSON that holds something more specific than a model, such as a
 * Structurizr workspace, goes before `JSON_READER`, which recognizes any JSON object.
 */
import { JSON_READER } from './json';
import { MERMAID } from './mermaid';
import type { ImportInput, ImportReader, ReadOptions, ReadResult } from './reader';
import { hasExtension } from './reader';
import { TABLE } from './table';

/** Every reader, in the order their content is recognized. */
export const IMPORT_READERS: readonly ImportReader[] = [JSON_READER, MERMAID, TABLE];

/** The readers' names joined as English joins a list: "A, B and C". */
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

/** The reader for a file: the one named by its format, else by its name's ending, else by its content. */
export function readerFor(input: ImportInput, format?: string): ImportReader | undefined {
  if (format !== undefined) return IMPORT_READERS.find((reader) => reader.format === format);
  return (
    IMPORT_READERS.find((reader) => hasExtension(input.name, reader.extensions)) ??
    IMPORT_READERS.find((reader) => reader.recognizes(input))
  );
}

/** Reads a file with the reader its format names, or the one that fits it. */
export function readImport(
  input: ImportInput,
  options: ReadOptions & { format?: string } = {},
): ReadResult & { reader?: ImportReader } {
  const { format, ...rest } = options;
  const reader = readerFor(input, format);
  if (reader === undefined) {
    return {
      ok: false,
      problems: [
        format === undefined
          ? `Visual Anything cannot tell how to read this file. It imports these formats: ${listed(IMPORT_READERS.map((each) => each.name))}.`
          : `There is no import reader for "${format}".`,
      ],
    };
  }
  return { ...reader.read(input, rest), reader };
}
