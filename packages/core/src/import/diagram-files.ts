/**
 * Which of the Structurizr, LikeC4 and draw.io readers reads a file, told by what the file holds
 * rather than by its name (ADR-0042), so that the mapping dialog, the command line and Claude's
 * `import_file` hand any file to the same place. A file none of them reads is left to the other
 * readers.
 */
import { readDrawio } from './drawio';
import { isPng } from './drawio-files';
import { decodeUtf8 } from './inflate';
import { parseJson } from './json-read';
import { readLikeC4Json } from './likec4';
import { ReadRefusal, type ImportRead, type ReadOptions } from './reading';
import { readStructurizrJson } from './structurizr';

/** The formats these readers read. */
export type DiagramFormat = 'structurizr' | 'likec4' | 'drawio';

/** How much of a file is looked at to tell XML apart, before any of it is read. */
const HEAD = 64 * 1024;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The format parsed JSON is in: a Structurizr workspace has a model; LikeC4 keeps records. */
function jsonFormat(value: unknown): DiagramFormat | undefined {
  if (isObject(value) && Object.hasOwn(value, 'model') && isObject(value.model)) {
    return 'structurizr';
  }
  const isLikeC4 = (each: unknown) =>
    isObject(each) &&
    Object.hasOwn(each, 'elements') &&
    isObject(each.elements) &&
    (Object.hasOwn(each, '_stage') ||
      Object.hasOwn(each, 'specification') ||
      (Object.hasOwn(each, 'relations') && isObject(each.relations)));
  if (Array.isArray(value) ? value.length > 0 && value.every(isLikeC4) : isLikeC4(value)) {
    return 'likec4';
  }
  return undefined;
}

function withoutMark(text: string): string {
  return text.startsWith('\uFEFF') ? text.slice(1) : text;
}

/** Whether text is XML whose outermost element is draw.io's, or an SVG picture that keeps a diagram. */
function isDrawioText(head: string): boolean {
  const start = withoutMark(head).trimStart();
  if (!start.startsWith('<')) return false;
  if (/<(mxfile|mxGraphModel)[\s>/]/.test(start)) return true;
  const svg = /<svg\b[^>]*>/.exec(start)?.[0];
  return svg !== undefined && /\scontent\s*=/.test(svg);
}

function looksLikeJson(head: string): boolean {
  const start = withoutMark(head).trimStart();
  return start.startsWith('{') || start.startsWith('[');
}

/** Parsed JSON, or undefined when it is not JSON or too large, which other readers then say. */
function parsedOrNothing(text: string): unknown {
  try {
    return parseJson(text);
  } catch (error) {
    if (error instanceof ReadRefusal) return undefined;
    throw error;
  }
}

/**
 * The format a file is in, told by its first characters and, for JSON, its shape; undefined when it
 * is none of these.
 */
export function diagramFormatOf(content: string | Uint8Array): DiagramFormat | undefined {
  if (typeof content !== 'string' && isPng(content)) return 'drawio';
  const head =
    typeof content === 'string' ? content.slice(0, HEAD) : decodeUtf8(content.subarray(0, HEAD));
  if (isDrawioText(head)) return 'drawio';
  if (!looksLikeJson(head)) return undefined;
  return jsonFormat(parsedOrNothing(typeof content === 'string' ? content : decodeUtf8(content)));
}

/**
 * Reads a Structurizr workspace in JSON, a LikeC4 model or a draw.io diagram in any of its files,
 * told by what it holds; undefined when the file is none of these, for the other readers to try.
 * Bytes are read as draw.io's PNG, or as UTF-8 text.
 */
export function readDiagramFile(
  source: string,
  content: string | Uint8Array,
  options?: ReadOptions,
): ImportRead | undefined {
  if (typeof content !== 'string' && isPng(content)) return readDrawio(content, source, options);
  const head =
    typeof content === 'string' ? content.slice(0, HEAD) : decodeUtf8(content.subarray(0, HEAD));
  if (isDrawioText(head)) return readDrawio(content, source, options);
  if (!looksLikeJson(head)) return undefined;
  const parsed = parsedOrNothing(typeof content === 'string' ? content : decodeUtf8(content));
  switch (jsonFormat(parsed)) {
    case 'structurizr':
      return readStructurizrJson(parsed, source, options);
    case 'likec4':
      return readLikeC4Json(parsed, source, options);
    default:
      return undefined;
  }
}
