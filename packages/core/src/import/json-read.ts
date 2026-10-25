/**
 * Reading JSON that a tool made elsewhere, strictly (ADR-0042): parsed once, within the size an
 * import reads, and taken apart by paths, so that a value of the wrong type is refused with where it
 * is. Values are read only as their own properties, never through what every object inherits.
 */
import { MAX_READ_CHARACTERS, refuse } from './reading';

/** A JSON object, read by its own properties only. */
export type JsonObject = { readonly [key: string]: unknown };

/** Parses JSON text, or refuses it as not JSON or too large. */
export function parseJson(text: string): unknown {
  if (text.length > MAX_READ_CHARACTERS) {
    refuse(
      `The file is over ${MAX_READ_CHARACTERS / (1024 * 1024)} MiB, the most an import reads.`,
    );
  }
  try {
    return JSON.parse(text.startsWith('\uFEFF') ? text.slice(1) : text) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) return refuse('The file is not JSON.');
    throw error;
  }
}

/** Takes a file's JSON apart, refusing a value of the wrong type with the path to it. */
export class JsonReader {
  constructor(
    /** How a refusal names the file, such as "workspace" or "LikeC4 model". */
    private readonly what: string,
    private readonly tool: string,
  ) {}

  wrong(path: string): never {
    refuse(`The ${this.what}'s "${path}" is not what ${this.tool} writes.`);
  }

  isObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  object(value: unknown, path: string): JsonObject {
    if (!this.isObject(value)) this.wrong(path);
    return value;
  }

  /** An optional object: absent or null is nothing. */
  objectOr(value: unknown, path: string): JsonObject | undefined {
    return value === undefined || value === null ? undefined : this.object(value, path);
  }

  list(value: unknown, path: string): readonly unknown[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) this.wrong(path);
    return value;
  }

  /** A text, or a number written as one, as ids sometimes are. */
  text(value: unknown, path: string): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return this.wrong(path);
  }

  textOr(value: unknown, path: string): string | undefined {
    return value === undefined || value === null ? undefined : this.text(value, path);
  }

  numberOr(value: unknown, path: string): number | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value);
    }
    return this.wrong(path);
  }
}

/** An object's own property, never one it inherits, such as `constructor`. */
export function own(object: JsonObject | undefined, key: string): unknown {
  return object !== undefined && Object.hasOwn(object, key) ? object[key] : undefined;
}

/** An object's own properties, in the order the file writes them. */
export function ownEntries(object: JsonObject | undefined): [string, unknown][] {
  return object === undefined ? [] : Object.entries(object);
}
