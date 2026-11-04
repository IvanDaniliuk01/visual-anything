/**
 * Search's index (R25): every element, relation and free shape of a project, with what a search
 * matches in it, ready to test as someone types. It matches names, ids, external identifiers, as
 * `UBERON:0002135` or `uberon:UBERON:0002135` (ADR 0056), components and relation types, by their
 * names in English and, for built-in ones, in Spanish too (ADR-0038), and attribute values, a
 * definition's defaults included, as filters count them (ADR-0025). Case, accents and the
 * spaces around do not count, and every word of a query must match somewhere.
 *
 * An entry is kept while the element, relation or free shape it was made from is the same object and
 * the definitions are the same, so indexing again after an edit costs a lookup for what did not
 * change. A search tests each entry's text once for every word, and works out more only for what it
 * lists, keeping the model's order within each rank, so that it stays within the frame budget at
 * 10,000 elements.
 */
import {
  componentOrEssence,
  plainText,
  relationTypeOrRelatesTo,
  type Definitions,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type {
  AttributeDefinition,
  Attributes,
  Element,
  FreeShape,
  Id,
  JsonValue,
  Relation,
} from '@visual-anything/schema';
import { translatorFor } from '../i18n';

/** What an entry stands for. */
export type FoundKind = 'element' | 'relation' | 'free-shape';

/** Something a search can find, with the forms of it that it matches. */
export interface Entry {
  kind: FoundKind;
  id: Id;
  /** The view a free shape is in; elements and relations are in every view (ADR-0025). */
  view?: Id;
  /** Its name as written: an element's or a relation's own name, a note's text; empty for none. */
  name: string;
  /** Its component or relation type, by id; a free shape has none. */
  definition?: Id;
  /** For a free shape: a note or an arrow. */
  shape?: FreeShape['kind'];
  /** For an element: its external identifiers, by scheme, as written (ADR 0056). */
  externalIds?: readonly (readonly [string, string])[];
  /** What a search compares, normalized. */
  keys: {
    name: string;
    id: string;
    /** Its external identifiers, each as `scheme:identifier`, a line each (ADR 0056). */
    externalIds: string;
    /** The definition's names, in English and, for a built-in one, in Spanish, a line each. */
    definition: string;
    /** The attribute values, a line each. */
    values: string;
    attributes: readonly { name: string; value: string; key: string }[];
  };
  /** Every key on a line of its own, so that one test tells whether a word is anywhere in it. */
  text: string;
}

/** A project's entries, in the model's order: elements, then relations, then each view's free shapes. */
export interface FindIndex {
  entries: readonly Entry[];
}

/** Where a query matched something, besides its name, for saying why it was found. */
export type Matched =
  | { field: 'name' }
  | { field: 'id' }
  | { field: 'external-id'; scheme: string; identifier: string }
  | { field: 'definition' }
  | { field: 'attribute'; attribute: string; value: string };

/** Something found, how well it matched, and where. */
export interface Found {
  entry: Entry;
  /** 0 for a name that is the query, then a name that starts with it, holds it, holds its words, … */
  rank: number;
  matched: Matched;
}

/** The most found things a search lists. */
export const MOST_FOUND = 200;

/** What separates the keys in an entry's text: a line break, which no normalized key holds. */
const LINE = '\n';

/** Text as a search compares it: lowercase, without accents, its spaces collapsed and trimmed. */
export function normalized(text: string): string {
  // Plain ASCII needs no decomposition, which is most of the time spent otherwise.
  const plain = /^[\x20-\x7e]*$/.test(text) ? text : text.normalize('NFKD').replace(/\p{M}/gu, '');
  // Control characters count as spaces, so that no key holds the separators of the index's text.
  return plain.toLowerCase().replace(SPACES, ' ').trim();
}

/** White space and the control characters, which a search counts as spaces. */
// eslint-disable-next-line no-control-regex
const SPACES = /[\s\u0000-\u001f]+/g;

/** Entries kept by what they were made from, for each set of definitions. */
const kept = new WeakMap<Definitions, WeakMap<object, Entry>>();

/** The index of a project, reusing the entries of what did not change since it was last indexed. */
export function indexProject(project: ProjectSnapshot, definitions: Definitions): FindIndex {
  const builder = new IndexBuilder(project, definitions);
  builder.step(Number.POSITIVE_INFINITY);
  return builder.index as FindIndex;
}

/** How many items an index builder makes entries for between two looks at the clock. */
const ITEMS_PER_LOOK = 32;

/**
 * Builds the index of a project a slice at a time, so that indexing a large project the first time
 * never holds a frame for long: each `step` works for about as long as it is given.
 */
export class IndexBuilder {
  readonly #cache: WeakMap<object, Entry>;
  readonly #names: DefinitionNames;
  readonly #project: ProjectSnapshot;
  readonly #entries: Entry[] = [];
  /** Where it is: elements, then relations, then each view's free shapes. */
  #part: 'elements' | 'relations' | 'free-shapes' = 'elements';
  #at = 0;
  #view = 0;
  #index: FindIndex | undefined;

  constructor(project: ProjectSnapshot, definitions: Definitions) {
    let cache = kept.get(definitions);
    if (!cache) {
      cache = new WeakMap();
      kept.set(definitions, cache);
    }
    this.#cache = cache;
    this.#names = new DefinitionNames(definitions);
    this.#project = project;
  }

  /** The index, once it is whole. */
  get index(): FindIndex | undefined {
    return this.#index;
  }

  /** Makes entries for about `budget` milliseconds; true once the index is whole. */
  step(budget: number, now: () => number = () => performance.now()): boolean {
    if (this.#index) return true;
    const until = now() + budget;
    while (!this.#slice()) {
      if (now() >= until) return false;
    }
    this.#index = { entries: this.#entries };
    return true;
  }

  /** Makes entries for a few items; true once there are none left. */
  #slice(): boolean {
    const { elements, relations } = this.#project.model;
    const names = this.#names;
    const cache = this.#cache;
    const entries = this.#entries;
    const end = this.#at + ITEMS_PER_LOOK;
    if (this.#part === 'elements') {
      for (; this.#at < end && this.#at < elements.length; this.#at++) {
        const element = elements[this.#at] as Element;
        let entry = cache.get(element);
        if (!entry) cache.set(element, (entry = elementEntry(element, names)));
        entries.push(entry);
      }
      if (this.#at < elements.length) return false;
      this.#part = 'relations';
      this.#at = 0;
      return false;
    }
    if (this.#part === 'relations') {
      for (; this.#at < end && this.#at < relations.length; this.#at++) {
        const relation = relations[this.#at] as Relation;
        let entry = cache.get(relation);
        if (!entry) cache.set(relation, (entry = relationEntry(relation, names)));
        entries.push(entry);
      }
      if (this.#at < relations.length) return false;
      this.#part = 'free-shapes';
      this.#at = 0;
      return false;
    }
    const { views } = this.#project;
    for (; this.#view < views.length; this.#view++) {
      const view = views[this.#view] as ProjectSnapshot['views'][number];
      for (; this.#at < view.freeShapes.length; this.#at++) {
        const shape = view.freeShapes[this.#at] as FreeShape;
        let entry = cache.get(shape);
        if (!entry) cache.set(shape, (entry = freeShapeEntry(shape, view.id)));
        entries.push(entry);
      }
      this.#at = 0;
    }
    return true;
  }
}

/**
 * What a query finds: at most `limit`, the best matches first, in the model's order within each
 * rank, and how many it found in all. Each entry is tested once for every word; only the ones it
 * lists are worked out further.
 */
export function find(
  index: FindIndex,
  query: string,
  limit: number = MOST_FOUND,
): { found: Found[]; total: number } {
  const whole = normalized(query);
  if (whole === '') return { found: [], total: 0 };
  const words = whole.split(' ');
  const { entries } = index;
  const { text, starts } = joinedText(index);
  // The longest word is the rarest, as a rule: the text is searched for it, and only the entries
  // it is in are tested further.
  const rarest = words.reduce((longest, word) => (word.length > longest.length ? word : longest));
  const ranks: number[][] = [[], [], [], [], [], [], [], []];
  const others = words.length > 1 ? words : undefined;
  let total = 0;
  // Matches come in the text's order, so the entry that holds each is found by moving on.
  let at = 0;
  for (let from = text.indexOf(rarest); from >= 0;) {
    while (at + 1 < starts.length && (starts[at + 1] as number) <= from) at += 1;
    const entry = entries[at] as Entry;
    if (others === undefined || holdsAll(entry.text, others)) {
      total += 1;
      (ranks[rankOf(entry, whole, words)] as number[]).push(at);
    }
    from = at + 1 < starts.length ? text.indexOf(rarest, starts[at + 1]) : -1;
  }
  const found: Found[] = [];
  for (let rank = 0; rank < ranks.length && found.length < limit; rank++) {
    for (const at of ranks[rank] as number[]) {
      if (found.length === limit) break;
      const entry = entries[at] as Entry;
      found.push({ entry, rank, matched: matchedIn(entry, rank, words) });
    }
  }
  return { found, total };
}

/** What separates the entries in an index's joined text, which no key holds either. */
const ENTRY = '\u0001';

/** Every entry's text, joined, and where each one starts in it; made once per index, when first asked. */
const joined = new WeakMap<FindIndex, { text: string; starts: Int32Array }>();

function joinedText(index: FindIndex): { text: string; starts: Int32Array } {
  let made = joined.get(index);
  if (!made) {
    const starts = new Int32Array(index.entries.length);
    let length = 0;
    index.entries.forEach((entry, at) => {
      starts[at] = length;
      length += entry.text.length + ENTRY.length;
    });
    made = { text: index.entries.map((entry) => entry.text).join(ENTRY), starts };
    joined.set(index, made);
  }
  return made;
}

/** The ranks, best first: the name is the query, starts with it, holds it, holds its words, … */
const NAME_IS = 0;
const NAME_STARTS = 1;
const NAME_HOLDS = 2;
const NAME_WORDS = 3;
const ID_WORDS = 4;
const DEFINITION_WORDS = 5;
const VALUE_WORDS = 6;
const ANYWHERE = 7;

function holdsAll(text: string, words: readonly string[]): boolean {
  for (const word of words) if (!text.includes(word)) return false;
  return true;
}

/** How well an entry that holds every word matches. */
function rankOf(entry: Entry, whole: string, words: readonly string[]): number {
  const { name, id, externalIds, definition, values } = entry.keys;
  if (name === whole) return NAME_IS;
  if (name.startsWith(whole)) return NAME_STARTS;
  if (name.includes(whole)) return NAME_HOLDS;
  if (holdsAll(name, words)) return NAME_WORDS;
  if (holdsAll(id, words) || holdsAll(externalIds, words)) return ID_WORDS;
  if (holdsAll(definition, words)) return DEFINITION_WORDS;
  if (holdsAll(values, words)) return VALUE_WORDS;
  return ANYWHERE;
}

const NAME: Matched = { field: 'name' };
const ID: Matched = { field: 'id' };
const DEFINITION: Matched = { field: 'definition' };

/** Where an entry matched: its name, or else the first other field that holds a word. */
function matchedIn(entry: Entry, rank: number, words: readonly string[]): Matched {
  if (rank <= NAME_WORDS) return NAME;
  if (rank === ID_WORDS)
    return holdsAll(entry.keys.id, words) ? ID : externalIdMatched(entry, words);
  if (rank === DEFINITION_WORDS) return DEFINITION;
  const { name, id, externalIds, definition, attributes } = entry.keys;
  for (const word of words) {
    if (rank === ANYWHERE) {
      if (name.includes(word)) continue;
      if (id.includes(word)) return ID;
      if (externalIds.includes(word)) return externalIdMatched(entry, [word]);
      if (definition.includes(word)) return DEFINITION;
    }
    const valued = attributes.find((each) => each.key.includes(word));
    if (valued) return { field: 'attribute', attribute: valued.name, value: valued.value };
  }
  return NAME;
}

/** The external identifier an entry matched by: the first whose `scheme:identifier` holds a word. */
function externalIdMatched(entry: Entry, words: readonly string[]): Matched {
  const lines = entry.keys.externalIds.split(LINE);
  const at = lines.findIndex((line) => words.some((word) => line.includes(word)));
  const [scheme, identifier] = entry.externalIds?.[at < 0 ? 0 : at] ?? ['', ''];
  return { field: 'external-id', scheme, identifier };
}

/** What find reads of a definition: its names and its attributes' defaults and formats. */
interface DefinitionKeys {
  names: string;
  defaults: ReadonlyMap<string, JsonValue>;
  /** The attributes that take text emphasis (ADR 0082), matched by their plain text. */
  emphasised: ReadonlySet<string>;
}

/** The names of definitions, normalized in both languages, and their attributes' defaults. */
class DefinitionNames {
  readonly #definitions: Definitions;
  readonly #names = new Map<Id, string>();
  readonly #defaults = new Map<Id, ReadonlyMap<string, JsonValue>>();
  readonly #emphasised = new Map<Id, ReadonlySet<string>>();

  constructor(definitions: Definitions) {
    this.#definitions = definitions;
  }

  component(id: Id): DefinitionKeys {
    const component = componentOrEssence(this.#definitions, id);
    return {
      names: this.#namesOf(id, component.id, component.name),
      defaults: this.#defaultsOf(id, component.attributes),
      emphasised: this.#emphasisedOf(id, component.attributes),
    };
  }

  relationType(id: Id): DefinitionKeys {
    const type = relationTypeOrRelatesTo(this.#definitions, id);
    return {
      names: this.#namesOf(id, type.id, type.name),
      defaults: this.#defaultsOf(id, type.attributes),
      emphasised: this.#emphasisedOf(id, type.attributes),
    };
  }

  #emphasisedOf(
    asked: Id,
    attributes: readonly AttributeDefinition[] | undefined,
  ): ReadonlySet<string> {
    let names = this.#emphasised.get(asked);
    if (!names) {
      names = new Set(
        (attributes ?? []).filter((each) => each.format === 'emphasis').map((each) => each.name),
      );
      this.#emphasised.set(asked, names);
    }
    return names;
  }

  #namesOf(asked: Id, id: Id, name: string): string {
    let names = this.#names.get(asked);
    if (names === undefined) {
      const english = normalized(name);
      const spanish = normalized(translatorFor('es').definition(id, name));
      names = spanish === english ? english : `${english}${LINE}${spanish}`;
      this.#names.set(asked, names);
    }
    return names;
  }

  #defaultsOf(
    asked: Id,
    attributes: readonly AttributeDefinition[] | undefined,
  ): ReadonlyMap<string, JsonValue> {
    let defaults = this.#defaults.get(asked);
    if (!defaults) {
      const found = new Map<string, JsonValue>();
      for (const each of attributes ?? []) {
        if (each.default !== undefined) found.set(each.name, each.default);
      }
      defaults = found;
      this.#defaults.set(asked, defaults);
    }
    return defaults;
  }
}

function elementEntry(element: Element, names: DefinitionNames): Entry {
  const { names: definition, defaults, emphasised } = names.component(element.component);
  const externalIds = Object.entries(element.ids ?? {});
  return {
    kind: 'element',
    id: element.id,
    name: element.name,
    definition: element.component,
    externalIds,
    ...keysOf(
      element.name,
      element.id,
      definition,
      attributesOf(element.attributes, defaults, emphasised),
      externalIds,
    ),
  };
}

function relationEntry(relation: Relation, names: DefinitionNames): Entry {
  const { names: definition, defaults, emphasised } = names.relationType(relation.relationType);
  const name = relation.name ?? '';
  return {
    kind: 'relation',
    id: relation.id,
    name,
    definition: relation.relationType,
    ...keysOf(
      name,
      relation.id,
      definition,
      attributesOf(relation.attributes, defaults, emphasised),
    ),
  };
}

function freeShapeEntry(shape: FreeShape, view: Id): Entry {
  // A note's text takes text emphasis (ADR 0082): find reads it without its markers.
  // A picture is found by its name (ADR 0098).
  const text =
    shape.kind === 'note'
      ? plainText(shape.text)
      : shape.kind === 'picture'
        ? (shape.name ?? '')
        : '';
  return {
    kind: 'free-shape',
    id: shape.id,
    view,
    name: text,
    shape: shape.kind,
    ...keysOf(text, shape.id, '', []),
  };
}

/** An entry's keys, and its text: every key on a line of its own. */
function keysOf(
  name: string,
  id: Id,
  definition: string,
  attributes: Entry['keys']['attributes'],
  externalIds: readonly (readonly [string, string])[] = [],
): Pick<Entry, 'keys' | 'text'> {
  const values = attributes.map((each) => each.key).join(LINE);
  const external = externalIds
    .map(([scheme, identifier]) => normalized(`${scheme}:${identifier}`))
    .join(LINE);
  const keys = {
    name: normalized(name),
    id: normalized(id),
    externalIds: external,
    definition,
    values,
    attributes,
  };
  // Without identifiers, as most entries are, the text is as it was without them.
  const parts =
    external === ''
      ? [keys.name, keys.id, definition, values]
      : [keys.name, keys.id, external, definition, values];
  return { keys, text: parts.join(LINE) };
}

/** Attribute values as a search matches them: the item's own, then the defaults it does not set. */
function attributesOf(
  own: Attributes | undefined,
  defaults: ReadonlyMap<string, JsonValue>,
  emphasised: ReadonlySet<string>,
): Entry['keys']['attributes'] {
  const values: { name: string; value: string; key: string }[] = [];
  const add = (name: string, value: JsonValue) => {
    if (value === null || value === '') return;
    const text =
      typeof value !== 'string'
        ? JSON.stringify(value)
        : emphasised.has(name)
          ? plainText(value, { blocks: false })
          : value;
    values.push({ name, value: text, key: normalized(text) });
  };
  for (const [name, value] of Object.entries(own ?? {})) add(name, value);
  for (const [name, value] of defaults) if (own?.[name] === undefined) add(name, value);
  return values;
}
