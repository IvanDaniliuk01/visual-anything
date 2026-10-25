/**
 * What the Structurizr, LikeC4 and draw.io readers share (ADR-0042): how a reader refuses a file, the
 * options it takes, how it suggests a component or relation type for a kind, and how it makes names
 * and quotes from what a file writes, within limits, as plain text.
 */
import {
  ESSENCE_ID,
  RELATES_TO_ID,
  type Attributes,
  type Id,
  type JsonValue,
} from '@visual-anything/schema';
import { BUILTIN_PACKAGES } from '../builtin';
import type { ImportPlan, PlannedKind } from './plan';

/** What reading a file gives: its plan, or why it is refused, as whole sentences. */
export type ImportRead = { ok: true; plan: ImportPlan } | { ok: false; problems: string[] };

/** What a reader may be told about the project the plan is for. */
export interface ReadOptions {
  /**
   * Whether the project uses a component or a relation type, so that suggestions name only those. A
   * reader told nothing suggests what the built-in packages define.
   */
  uses?: (id: Id) => boolean;
}

/** The most characters a file, or the text inside a compressed one, may hold: ADR-0042's 32 MiB. */
export const MAX_READ_CHARACTERS = 32 * 1024 * 1024;

/** The longest name a reader keeps; a longer one is cut there and reported. */
export const MAX_IMPORTED_NAME = 1_000;

/** The longest quote of the file in what matched nothing. */
const MAX_QUOTE = 160;

/** How many things that matched nothing a plan lists, before saying how many more there were. */
export const MAX_UNMATCHED = 500;

/** Thrown inside a reader to refuse the file; {@link reading} turns it into the outcome. */
export class ReadRefusal extends Error {
  override name = 'ReadRefusal';
}

/** Refuses the file being read, with why, as a whole sentence. */
export function refuse(message: string): never {
  throw new ReadRefusal(message);
}

/** Runs a reader, turning a refusal into its outcome. */
export function reading(read: () => ImportPlan): ImportRead {
  try {
    return { ok: true, plan: read() };
  } catch (error) {
    if (error instanceof ReadRefusal) return { ok: false, problems: [error.message] };
    // A file so deeply nested that walking it runs out of stack is refused, not thrown.
    if (error instanceof RangeError && /call stack/i.test(error.message)) {
      return { ok: false, problems: ['The file nests too deeply to be read.'] };
    }
    throw error;
  }
}

const BUILT_IN_DEFINITIONS: ReadonlySet<Id> = new Set([
  ESSENCE_ID,
  RELATES_TO_ID,
  ...BUILTIN_PACKAGES.flatMap((file) => [
    ...file.components.map((each) => each.id),
    ...file.relationTypes.map((each) => each.id),
  ]),
]);

/**
 * The first of the candidates that suits the project: one it uses, when the reader was told what it
 * uses; otherwise one a built-in package defines. Candidates that name what no package defines yet,
 * such as a starter package's, are passed over until one does.
 */
export function suggestionFor(
  candidates: readonly Id[],
  options: ReadOptions | undefined,
): Id | undefined {
  const uses = options?.uses;
  return candidates.find((id) => (uses ? uses(id) : BUILT_IN_DEFINITIONS.has(id)));
}

/** Counts the kinds a plan's elements or relations use, in the order first met. */
export class KindCounter {
  readonly #kinds = new Map<string, PlannedKind>();
  readonly #suggest: (kind: string) => Id | undefined;

  constructor(suggest: (kind: string) => Id | undefined) {
    this.#suggest = suggest;
  }

  /**
   * Counts one more thing of a kind, labelled as the file names it, and gives the key the plan names
   * the kind by: {@link safeKind}'s.
   */
  add(name: string, label: string = name): string {
    const kind = safeKind(name);
    const known = this.#kinds.get(kind);
    if (known) {
      known.count += 1;
      return kind;
    }
    const suggested = this.#suggest(name);
    this.#kinds.set(kind, {
      kind,
      label,
      count: 1,
      ...(suggested === undefined ? {} : { suggested }),
    });
    return kind;
  }

  list(): PlannedKind[] {
    return [...this.#kinds.values()];
  }
}

/**
 * A kind's key, safe to look up in a plain object such as a mapping: a name that every object
 * inherits, such as `constructor`, `toString` or `__proto__`, is quoted, so that it never finds what
 * the prototype holds. Its label keeps the name as the file writes it.
 */
export function safeKind(name: string): string {
  return name in Object.prototype ? `"${name}"` : name;
}

/**
 * Attributes from what a file gives, by name, as properties of their own whatever the names, so that
 * `__proto__` is an attribute like any other; none when the file gives none.
 */
export function attributesFrom(
  entries: ReadonlyMap<string, JsonValue> | readonly (readonly [string, JsonValue])[],
): Attributes | undefined {
  const list = [...entries];
  return list.length === 0 ? undefined : Object.fromEntries<JsonValue>(list);
}

/** Collects what matched nothing, quoting the file within limits, and counts what is past the list. */
export class Unmatched {
  readonly #list: { text: string; why: string }[] = [];
  #more = 0;

  add(text: string, why: string): void {
    if (this.#list.length >= MAX_UNMATCHED) {
      this.#more += 1;
      return;
    }
    this.#list.push({ text: quote(text), why });
  }

  list(): { text: string; why: string }[] {
    if (this.#more === 0) return [...this.#list];
    return [
      ...this.#list,
      {
        text: `${this.#more.toLocaleString('en')} more`,
        why:
          this.#more === 1
            ? 'One more thing matched nothing; the list stops here.'
            : `${this.#more.toLocaleString('en')} more things matched nothing; the list stops here.`,
      },
    ];
  }
}

/** A quote of the file, as plain text, cut short when it is long. */
export function quote(text: string): string {
  const plain = cleanText(text);
  return plain.length <= MAX_QUOTE ? plain : `${plain.slice(0, MAX_QUOTE - 1)}…`;
}

/**
 * Characters that change how text reads without being seen: controls, zero-width characters and the
 * marks that reorder text from right to left.
 */
const INVISIBLE =
  // eslint-disable-next-line no-control-regex -- controls are what it removes.
  /[\u0000-\u0008\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/gu;

/** Text as one line: invisible characters dropped, every run of spaces and line breaks one space. */
export function cleanText(text: string): string {
  return text.replace(INVISIBLE, '').replace(/\s+/gu, ' ').trim();
}

/**
 * A name from what the file writes, as one line of plain text, or the fallback when it writes none; a
 * name over {@link MAX_IMPORTED_NAME} characters is cut there and reported.
 */
export function nameFrom(text: string | undefined, fallback: string, unmatched: Unmatched): string {
  const plain = cleanText(text ?? '');
  if (plain === '') return fallback;
  if (plain.length <= MAX_IMPORTED_NAME) return plain;
  unmatched.add(
    plain,
    `The name is over ${MAX_IMPORTED_NAME.toLocaleString('en')} characters; it is cut there.`,
  );
  return `${plain.slice(0, MAX_IMPORTED_NAME - 1)}…`;
}

/** A description from what the file writes, as plain text, or nothing when it writes none. */
export function descriptionFrom(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const plain = text
    .replace(INVISIBLE, '')
    .replace(/[^\S\n]+/gu, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
  return plain === '' ? undefined : plain;
}

/** A web address the file gives, kept as text when it is one; anything else is nothing. */
export function webAddress(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const plain = cleanText(text);
  return /^https?:\/\/[^\s]+$/i.test(plain) && plain.length <= 2048 ? plain : undefined;
}

/** A coordinate rounded to hundredths, so that files keep short numbers. */
export function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}
