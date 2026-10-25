/**
 * Every import reader, and the choice of one for a file (ADR-0042): the reader the person names; else
 * the one whose format what the file holds says, as `readDiagramFile` tells a Structurizr workspace, a
 * LikeC4 model and a draw.io diagram apart; else the one whose file name ending it is; else the first
 * whose content it recognizes. The mapping dialog, the command line and Claude's tools all read
 * through here, so a reader added to the list is offered everywhere.
 */
import type { Id } from '@visual-anything/schema';
import { diagramFormatOf, readDiagramFile, type DiagramFormat } from './diagram-files';
import { readDrawio } from './drawio';
import { JSON_READER } from './json';
import { readLikeC4 } from './likec4';
import { MERMAID } from './mermaid';
import type { ImportInput, ImportReader, ReadOptions, ReadResult } from './reader';
import { hasExtension, usesOf } from './reader';
import { readStructurizr } from './structurizr';
import { TABLE } from './table';

/** What a file's content says its format is, found once for each file asked about. */
const sights = new WeakMap<ImportInput, DiagramFormat | null>();

function sightOf(input: ImportInput): DiagramFormat | undefined {
  let sight = sights.get(input);
  if (sight === undefined) {
    sight = diagramFormatOf(input.bytes ?? input.text) ?? null;
    sights.set(input, sight);
  }
  return sight ?? undefined;
}

/** One of the readers that tell their files apart by what they hold (W30). */
function diagramReader(
  format: DiagramFormat,
  name: string,
  extensions: readonly string[],
  read: (input: ImportInput, options: { uses?: (id: Id) => boolean }) => ReadResult,
): ImportReader {
  return {
    format,
    name,
    extensions,
    identifies: (input) => sightOf(input) === format,
    recognizes: (input) => hasExtension(input.name, extensions) || sightOf(input) === format,
    read: (input, options) => {
      const uses = usesOf(options);
      return read(input, uses === undefined ? {} : { uses });
    },
  };
}

/** The Structurizr reader: a workspace in JSON, as the Structurizr CLI exports it. */
export const STRUCTURIZR = diagramReader(
  'structurizr',
  'Structurizr workspace',
  [],
  (input, options) => readStructurizr(input.text, input.name, options),
);

/** The LikeC4 reader: the model `likec4 export json` writes. */
export const LIKEC4 = diagramReader('likec4', 'LikeC4 model', [], (input, options) =>
  readLikeC4(input.text, input.name, options),
);

/** The draw.io reader: plain or compressed, or inside a `.drawio.svg` or `.drawio.png` picture. */
export const DRAWIO = diagramReader(
  'drawio',
  'draw.io file',
  ['.drawio', '.drawio.xml', '.drawio.svg', '.drawio.png', '.xml'],
  (input, options) => readDrawio(input.bytes ?? input.text, input.name, options),
);

/** Every reader, in the order their content is recognized: the most specific first. */
export const IMPORT_READERS: readonly ImportReader[] = [
  STRUCTURIZR,
  LIKEC4,
  DRAWIO,
  JSON_READER,
  MERMAID,
  TABLE,
];

/**
 * The reader for a file: the one named by its format; else the one whose format its content says;
 * else the one its name's ending names; else the first that recognizes its content.
 */
export function readerFor(input: ImportInput, format?: string): ImportReader | undefined {
  if (format !== undefined) return IMPORT_READERS.find((reader) => reader.format === format);
  return (
    IMPORT_READERS.find((reader) => reader.identifies?.(input) === true) ??
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
  if (format === undefined) {
    // What W30's readers read is told apart, and read, with one look at the file.
    const uses = usesOf(rest);
    const read = readDiagramFile(input.name, input.bytes ?? input.text, uses ? { uses } : {});
    if (read !== undefined) {
      const reader = read.ok
        ? IMPORT_READERS.find((each) => read.plan.format.startsWith(each.format))
        : readerFor(input);
      return { ...read, ...(reader === undefined ? {} : { reader }) };
    }
  }
  const reader = readerFor(input, format);
  if (reader === undefined) {
    return {
      ok: false,
      problems: [
        format === undefined
          ? 'Visual Anything cannot tell what this file is: name its format.'
          : `There is no import reader for "${format}".`,
      ],
    };
  }
  return { ...reader.read(input, rest), reader };
}
