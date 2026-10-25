/**
 * External identifiers (ADR 0056): what an element, a component or a relation type is in someone
 * else's catalog, by scheme, such as `{ uberon: 'UBERON:0002135' }`. They are data: search finds by
 * them, importers match by them, and nothing ever follows them. Values arrive from the app, from
 * Claude and from files read by importers, so nothing about them is taken for granted.
 */
import type { Element, ExternalId, ExternalIds, IdScheme } from '@visual-anything/schema';
import { reject } from './commands/draft';
import { problem, type Problem } from './problems';
import { cappedWarnings } from './rules';
import type { ProjectSnapshot } from './snapshot';

/** The longest identifier, in characters, as the published schema counts them. */
export const MAX_EXTERNAL_ID_LENGTH = 200;

/** The most schemes one element, component or relation type holds identifiers in. */
export const MAX_SCHEMES = 32;

/** What a scheme is: a short lowercase name, as the published schema says. */
export const SCHEME_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

/** Control characters, which no identifier holds: they would break lines or hide text. */
const CONTROL = /[\x00-\x1f\x7f]/;

/** Whether a value is a scheme of external identifiers. */
export function isScheme(value: unknown): value is IdScheme {
  return typeof value === 'string' && SCHEME_PATTERN.test(value);
}

/** Whether a value is an external identifier: text of 1 to 200 characters, none of them control. */
export function isExternalId(value: unknown): value is ExternalId {
  if (typeof value !== 'string' || value === '' || CONTROL.test(value)) return false;
  // Characters, as JSON Schema counts them, rather than UTF-16 code units; short-cut for most.
  return value.length <= MAX_EXTERNAL_ID_LENGTH || [...value].length <= MAX_EXTERNAL_ID_LENGTH;
}

function invalid(message: string): never {
  reject('invalid-external-id', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Why a scheme or an identifier given for `of` is not one; nothing when it is. */
function checkPair(scheme: string, identifier: unknown, of: string): void {
  if (!isScheme(scheme)) {
    invalid(
      `The external identifiers of ${of} are by scheme, a short lowercase name such as "uberon"; "${scheme}" is not one.`,
    );
  }
  if (!isExternalId(identifier)) {
    invalid(
      `The ${scheme} identifier of ${of} must be text of 1 to ${MAX_EXTERNAL_ID_LENGTH} characters, without line breaks.`,
    );
  }
}

/** Identifiers by scheme, sorted by scheme, in an object that reaches no prototype. */
function sortedIds(entries: Iterable<readonly [IdScheme, ExternalId]>): ExternalIds | undefined {
  const list = [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  if (list.length === 0) return undefined;
  if (list.length > MAX_SCHEMES) {
    invalid(`Something holds identifiers in at most ${MAX_SCHEMES} schemes, not ${list.length}.`);
  }
  return Object.fromEntries(list);
}

/**
 * The external identifiers a command gives `of` whole, checked; `undefined` for an empty map, which
 * is none. Refused with `invalid-external-id` otherwise.
 */
export function checkedExternalIds(value: unknown, of: string): ExternalIds | undefined {
  if (!isRecord(value)) {
    invalid(
      `The external identifiers of ${of} must be an object of identifiers by scheme, such as { "uberon": "UBERON:0002135" }.`,
    );
  }
  const entries: [IdScheme, ExternalId][] = [];
  for (const scheme of Object.keys(value)) {
    const identifier = value[scheme];
    checkPair(scheme, identifier, of);
    entries.push([scheme, identifier as ExternalId]);
  }
  return sortedIds(entries);
}

/**
 * External identifiers after changes by scheme: a text sets one, `null` takes it out, and `null` for
 * the whole takes them all out. `undefined` when none is left.
 */
export function changedExternalIds(
  current: ExternalIds | undefined,
  changes: unknown,
  of: string,
): ExternalIds | undefined {
  if (changes === null) return undefined;
  if (!isRecord(changes)) {
    invalid(
      `The changes to the external identifiers of ${of} must be an object of identifiers, or null, by scheme.`,
    );
  }
  const next = new Map<IdScheme, ExternalId>(Object.entries(current ?? {}));
  for (const scheme of Object.keys(changes)) {
    const identifier = changes[scheme];
    if (identifier === null) {
      if (!isScheme(scheme)) checkPair(scheme, '', of);
      next.delete(scheme);
      continue;
    }
    checkPair(scheme, identifier, of);
    next.set(scheme, identifier as ExternalId);
  }
  return sortedIds(next);
}

/** Whether two sets of identifiers are the same, whatever the order of their schemes. */
export function sameExternalIds(a: ExternalIds | undefined, b: ExternalIds | undefined): boolean {
  const left = Object.entries(a ?? {});
  return (
    left.length === Object.keys(b ?? {}).length &&
    left.every(([scheme, identifier]) => b !== undefined && b[scheme] === identifier)
  );
}

/**
 * What an attribute name of Claude's `find_elements` asks for when it is `id:<scheme>`, as `id:uberon`:
 * the elements with an identifier in that scheme. Anything else is an ordinary attribute's name.
 */
export function externalIdQuery(name: string): { scheme: IdScheme } | undefined {
  if (!name.startsWith('id:')) return undefined;
  const scheme = name.slice(3);
  return isScheme(scheme) ? { scheme } : undefined;
}

/** Whether an element has an identifier in a scheme, and that one when `identifier` is given. */
export function matchesExternalId(
  item: { ids?: ExternalIds },
  scheme: IdScheme,
  identifier?: ExternalId,
): boolean {
  const ids = item.ids;
  if (ids === undefined || !Object.hasOwn(ids, scheme)) return false;
  return identifier === undefined || ids[scheme] === identifier;
}

/** Where each identifier is used, by scheme and identifier, worked out once per model. */
interface ExternalIdIndex {
  /** The elements with each identifier, by `scheme identifier`, in model order. */
  bySchemed: ReadonlyMap<string, readonly Element[]>;
  /** The elements with each identifier in any scheme, in model order, each once. */
  byIdentifier: ReadonlyMap<ExternalId, readonly Element[]>;
}

const INDEXES = new WeakMap<ProjectSnapshot['model'], ExternalIdIndex>();

function schemedKey(scheme: IdScheme, identifier: ExternalId): string {
  return `${scheme} ${identifier}`;
}

function indexOf(state: ProjectSnapshot): ExternalIdIndex {
  const known = INDEXES.get(state.model);
  if (known !== undefined) return known;
  const bySchemed = new Map<string, Element[]>();
  const byIdentifier = new Map<ExternalId, Element[]>();
  for (const element of [state.model.world, ...state.model.elements]) {
    const ids = element.ids;
    if (ids === undefined) continue;
    for (const scheme of Object.keys(ids)) {
      const identifier = ids[scheme];
      if (typeof identifier !== 'string') continue;
      const key = schemedKey(scheme, identifier);
      bySchemed.set(key, [...(bySchemed.get(key) ?? []), element]);
      const same = byIdentifier.get(identifier) ?? [];
      if (same.at(-1) !== element) byIdentifier.set(identifier, [...same, element]);
    }
  }
  const index = { bySchemed, byIdentifier };
  INDEXES.set(state.model, index);
  return index;
}

/** The elements with an identifier, in a scheme or in any, in model order. */
export function elementsWithExternalId(
  state: ProjectSnapshot,
  identifier: ExternalId,
  scheme?: IdScheme,
): readonly Element[] {
  const index = indexOf(state);
  return (
    (scheme === undefined
      ? index.byIdentifier.get(identifier)
      : index.bySchemed.get(schemedKey(scheme, identifier))) ?? []
  );
}

/** A list of names as English writes it: "A", "A and B", "A, B and C". */
function namesOf(elements: readonly Element[]): string {
  const names = elements.map((element) => `"${element.name}"`);
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1) as string}`;
}

/**
 * Warnings about elements that share an identifier in one scheme, which importers cannot tell apart:
 * at most 20, and a summary of the rest.
 */
export function duplicateExternalIdWarnings(state: ProjectSnapshot): Problem[] {
  const warnings: Problem[] = [];
  for (const [key, elements] of indexOf(state).bySchemed) {
    if (elements.length < 2) continue;
    const at = key.indexOf(' ');
    const scheme = key.slice(0, at);
    const identifier = key.slice(at + 1);
    warnings.push(
      problem(
        'shared-external-id',
        `${namesOf(elements)} have the same ${scheme} identifier, "${identifier}".`,
        elements.map((element) => element.id),
      ),
    );
  }
  return cappedWarnings(
    warnings,
    'shared-external-id',
    (rest) => `…and ${rest} more identifiers are shared by several elements.`,
  );
}
