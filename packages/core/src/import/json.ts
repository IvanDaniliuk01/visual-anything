/**
 * The JSON reader (ADR-0042, R35), for two forms:
 *
 * - **A project's own model file** (`.vamodel`, or its JSON), with World, elements and relations,
 *   checked against the published model schema; its components and relation types are its kinds.
 * - **The simple form:** `{ "elements": [...], "relations": [...] }`, whose elements have a `name`
 *   and may have an `id`, a `component`, a `container`, a `description`, `attributes` and `ids`,
 *   its external identifiers by scheme (ADR 0056), and whose
 *   relations have `from` and `to` and may have an `id`, a `relationType`, a `name`, a `description`
 *   and `attributes`. It is checked against `SIMPLE_FORM_SCHEMA`.
 *
 * Strings are kept exactly as written: an entity stays text, and nothing in them is read as markup.
 * Importing again matches elements to the project's by a key, the id by default, as spreadsheets do.
 */
import modelSchema from '@visual-anything/schema/schemas/model.schema.json' with { type: 'json' };
import type {
  Attributes,
  Element,
  ExternalIds,
  JsonValue,
  Relation,
} from '@visual-anything/schema';
import { PastLimits, PlanBuilder } from './builder';
import { IMPORT_LIMITS } from './plan';
import { References, type MatchBy } from './references';
import {
  FORBIDDEN_NAME,
  hasExtension,
  type ImportInput,
  type ImportReader,
  type ReadOptions,
  type ReadResult,
} from './reader';
import { checkAgainstSchema, depthOf } from './schema-check';
import { kindSuggester, type KindSuggester } from './suggest';
import { MAX_IMPORT_TEXT, quote } from './text';

/** The deepest a JSON file to import may nest. */
export const MAX_JSON_DEPTH = 64;

/** The most problems a refusal lists. */
const MAX_PROBLEMS = 10;

/** The JSON Schema of the simple form, which the reader checks files against and people can use. */
export const SIMPLE_FORM_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'Elements and relations to import into Visual Anything',
  type: 'object',
  properties: {
    $schema: { type: 'string' },
    elements: { type: 'array', items: { $ref: '#/definitions/Element' } },
    relations: { type: 'array', items: { $ref: '#/definitions/Relation' } },
  },
  additionalProperties: false,
  definitions: {
    Text: { type: 'string', minLength: 1 },
    Attributes: { type: 'object' },
    Element: {
      type: 'object',
      properties: {
        id: { $ref: '#/definitions/Text' },
        name: { $ref: '#/definitions/Text' },
        component: { $ref: '#/definitions/Text' },
        container: { $ref: '#/definitions/Text' },
        description: { type: 'string' },
        attributes: { $ref: '#/definitions/Attributes' },
        ids: { type: 'object' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    Relation: {
      type: 'object',
      properties: {
        id: { $ref: '#/definitions/Text' },
        from: { $ref: '#/definitions/Text' },
        to: { $ref: '#/definitions/Text' },
        relationType: { $ref: '#/definitions/Text' },
        name: { $ref: '#/definitions/Text' },
        description: { type: 'string' },
        attributes: { $ref: '#/definitions/Attributes' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
  },
} as const;

const NEITHER =
  'The file holds neither a model, with world, elements and relations, nor a list of elements and relations.';

/** The JSON reader, as the import dialog, the command line and Claude's tools list it. */
export const JSON_READER: ImportReader = {
  format: 'json',
  name: 'JSON',
  extensions: ['.json', '.vamodel'],
  recognizes: (input) =>
    hasExtension(input.name, JSON_READER.extensions) ||
    (/^\uFEFF?\s*\{/.test(input.text.slice(0, 1024)) &&
      /"(world|elements|relations)"\s*:/.test(input.text.slice(0, 65_536))),
  read: (input, options) => readJson(input, options),
};

/** Reads a JSON file of either form into a plan, or says why it cannot. */
export function readJson(input: ImportInput, options: ReadOptions = {}): ReadResult {
  if (input.text.length > MAX_IMPORT_TEXT) {
    return {
      ok: false,
      problems: ['The file is larger than 32 MiB; an import reads at most 32 MiB.'],
    };
  }
  let data: unknown;
  try {
    data = JSON.parse(input.text.startsWith('\uFEFF') ? input.text.slice(1) : input.text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, problems: [`The file is not valid JSON: ${reason}`] };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, problems: [NEITHER] };
  }
  const model = Object.hasOwn(data, 'world');
  if (!model && !Object.hasOwn(data, 'elements') && !Object.hasOwn(data, 'relations')) {
    return { ok: false, problems: [NEITHER] };
  }
  // The limits come before anything that grows with the file: checking it, and ordering relations.
  const listed = (key: string) => {
    const list = Object.hasOwn(data, key) ? (data as Record<string, unknown>)[key] : undefined;
    return Array.isArray(list) ? list.length : 0;
  };
  const count = (amount: number) => amount.toLocaleString('en');
  if (listed('elements') > IMPORT_LIMITS.elements) {
    return {
      ok: false,
      problems: [
        `The file holds more than ${count(IMPORT_LIMITS.elements)} elements; an import brings at most ${count(IMPORT_LIMITS.elements)}.`,
      ],
    };
  }
  if (listed('relations') > IMPORT_LIMITS.relations) {
    return {
      ok: false,
      problems: [
        `The file holds more than ${count(IMPORT_LIMITS.relations)} relations, those that put one thing inside another included; an import brings at most ${count(IMPORT_LIMITS.relations)}.`,
      ],
    };
  }
  if (depthOf(data, MAX_JSON_DEPTH) > MAX_JSON_DEPTH) {
    return { ok: false, problems: [`The file nests more than ${MAX_JSON_DEPTH} levels deep.`] };
  }
  const problems = checkAgainstSchema(model ? modelSchema : SIMPLE_FORM_SCHEMA, data);
  if (problems.length > 0) {
    return {
      ok: false,
      problems: problems
        .slice(0, MAX_PROBLEMS)
        .map((problem) =>
          problem.path === ''
            ? `The file as a whole ${problem.message}.`
            : `${problem.path} in the file ${problem.message}.`,
        ),
    };
  }
  const builder = new PlanBuilder(model ? 'vamodel' : 'json', input.name);
  try {
    const reading = new JsonReading(builder, options);
    if (model) reading.model(data as { elements: Element[]; relations: Relation[] });
    else reading.simple(data);
  } catch (error) {
    if (error instanceof PastLimits) return { ok: false, problems: [error.message] };
    throw error;
  }
  return { ok: true, plan: builder.build() };
}

interface SimpleElement {
  id?: string;
  name: string;
  component?: string;
  container?: string;
  description?: string;
  attributes?: Attributes;
  /** Checked by `matchByExternalIds`, which reports what is not an identifier. */
  ids?: ExternalIds;
}

interface SimpleRelation {
  id?: string;
  from: string;
  to: string;
  relationType?: string;
  name?: string;
  description?: string;
  attributes?: Attributes;
}

interface SimpleForm {
  elements?: SimpleElement[];
  relations?: SimpleRelation[];
}

/** One reading of a checked JSON file into a builder. */
class JsonReading {
  readonly #builder: PlanBuilder;
  readonly #references: References;
  readonly #suggest: KindSuggester;
  readonly #matching: boolean;
  readonly #how: MatchBy;

  constructor(builder: PlanBuilder, options: ReadOptions) {
    this.#builder = builder;
    this.#references = new References(builder, options.project?.model.elements, 'it is left out');
    this.#suggest = kindSuggester(options.project);
    this.#matching = options.project !== undefined;
    const key = options.key ?? 'id';
    this.#how =
      key === 'id'
        ? { by: 'id' }
        : key === 'name'
          ? { by: 'name' }
          : { by: 'attribute', name: key };
  }

  /** A project's own model: its elements but World, and its relations, ends first. */
  model(file: { elements: Element[]; relations: Relation[] }): void {
    const builder = this.#builder;
    const elements = new Set<string>();
    for (const element of file.elements) {
      if (elements.has(element.id)) {
        builder.report(
          element.id,
          `The id "${element.id}" is given to an earlier element, so this one is left out.`,
        );
        continue;
      }
      elements.add(element.id);
      const match = this.#match(element.id, element.name, element.attributes);
      if (match === 'several') continue;
      const description = builder.description(element.description);
      const attributes = this.#attributes(element.attributes, element.name);
      builder.add(
        {
          key: element.id,
          ...(match === undefined ? { sourceId: element.id } : {}),
          name: builder.name(element.name, element.id),
          kind: element.component,
          ...(description === undefined ? {} : { description }),
          ...(attributes === undefined ? {} : { attributes }),
          ...(element.ids === undefined ? {} : { ids: element.ids }),
          ...(match === undefined ? {} : { existing: match.id }),
        },
        { label: element.component, suggested: element.component },
      );
      if (element.appearance !== undefined) {
        builder.report(
          element.name,
          'Its own appearance is left out: an import brings no appearances.',
        );
      }
    }
    this.#modelRelations(file, elements);
  }

  /**
   * A model's relations, each after the relations it ends on, in one topological sort; those that end
   * on World, on nothing the file holds, on a relation left out, or on a cycle of relations are
   * reported.
   */
  #modelRelations(
    file: { relations: Relation[]; world?: Element },
    elements: ReadonlySet<string>,
  ): void {
    const builder = this.#builder;
    const world = file.world?.id;
    const byId = new Map<string, Relation>();
    for (const relation of file.relations) {
      if (byId.has(relation.id)) {
        builder.report(
          relation.id,
          `The id "${relation.id}" is given to an earlier relation, so this one is left out.`,
        );
        continue;
      }
      byId.set(relation.id, relation);
    }
    const leftOut = new Set<string>();
    const kept: Relation[] = [];
    for (const relation of byId.values()) {
      if (relation.from === world || relation.to === world) {
        builder.report(
          relation.id,
          'It ends on World, which an import does not bring, so it is left out.',
        );
        leftOut.add(relation.id);
        continue;
      }
      const missing = [relation.from, relation.to].find(
        (end) => !elements.has(end) && !byId.has(end),
      );
      if (missing !== undefined) {
        builder.report(
          relation.id,
          `It ends on "${quote(missing)}", which the file does not hold, so it is left out.`,
        );
        leftOut.add(relation.id);
        continue;
      }
      kept.push(relation);
    }
    // How many relations each one waits for, and who waits for each: those it ends on come first.
    const waiting = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    const ready: Relation[] = [];
    for (const relation of kept) {
      const ends = new Set([relation.from, relation.to].filter((end) => !elements.has(end)));
      waiting.set(relation.id, ends.size);
      for (const end of ends) {
        const list = dependents.get(end);
        if (list === undefined) dependents.set(end, [relation.id]);
        else list.push(relation.id);
      }
      if (ends.size === 0) ready.push(relation);
    }
    const keys = new Map<string, string>();
    const keyOf = (end: string) => (elements.has(end) ? end : (keys.get(end) ?? end));
    for (let at = 0; at < ready.length; at++) {
      const relation = ready[at] as Relation;
      keys.set(relation.id, this.#modelRelation(relation, keyOf));
      for (const dependent of dependents.get(relation.id) ?? []) {
        const left = (waiting.get(dependent) ?? 1) - 1;
        waiting.set(dependent, left);
        const next = byId.get(dependent);
        if (left === 0 && next !== undefined) ready.push(next);
      }
    }
    // What never came: behind a relation left out, or in a cycle of relations.
    const behind = new Set<string>();
    const queue = [...leftOut];
    for (let at = 0; at < queue.length; at++) {
      for (const dependent of dependents.get(queue[at] as string) ?? []) {
        if (behind.has(dependent)) continue;
        behind.add(dependent);
        queue.push(dependent);
      }
    }
    for (const relation of kept) {
      if (keys.has(relation.id)) continue;
      builder.report(
        relation.id,
        behind.has(relation.id)
          ? 'It ends on a relation that is left out, so it is left out too.'
          : 'It ends on a relation that ends on it in turn, so it is left out.',
      );
    }
  }

  /** Plans one relation of a model, its ends given as keys, and gives its key. */
  #modelRelation(relation: Relation, keyOf: (end: string) => string): string {
    const builder = this.#builder;
    const label = relation.name ?? relation.id;
    const attributes = this.#attributes(relation.attributes, label);
    const description = builder.description(relation.description);
    return builder.relate(
      {
        sourceId: relation.id,
        from: keyOf(relation.from),
        to: keyOf(relation.to),
        kind: relation.relationType,
        ...(relation.name === undefined ? {} : { name: builder.name(relation.name, relation.id) }),
        ...(description === undefined ? {} : { description }),
        ...(attributes === undefined ? {} : { attributes }),
      },
      { label: relation.relationType, suggested: relation.relationType },
    ).key;
  }

  /** The simple form: its elements, then what sits inside what, then its relations. */
  simple(file: SimpleForm): void {
    const builder = this.#builder;
    const references = this.#references;
    const containers: { key: string; container: string }[] = [];
    (file.elements ?? []).forEach((element, at) => {
      const id = element.id ?? '';
      if (id !== '' && references.hasId(id)) {
        builder.report(
          id,
          `The id "${id}" is given to an earlier element, so this one is left out.`,
        );
        return;
      }
      const match = this.#match(id, element.name, element.attributes);
      if (match === 'several') return;
      const kind = element.component ?? '';
      const key = this.#keyFor(id, element.name, at + 1);
      const description = builder.description(element.description);
      const attributes = this.#attributes(element.attributes, element.name);
      const suggested = this.#suggest.component(kind);
      builder.add(
        {
          key,
          ...(match === undefined && id !== '' ? { sourceId: id } : {}),
          name: builder.name(element.name, id || key),
          kind,
          ...(description === undefined ? {} : { description }),
          ...(attributes === undefined ? {} : { attributes }),
          ...(element.ids === undefined ? {} : { ids: element.ids }),
          ...(match === undefined ? {} : { existing: match.id }),
        },
        { label: kind, ...(suggested === undefined ? {} : { suggested }) },
      );
      references.register(key, id, element.name);
      if (element.container !== undefined && match === undefined) {
        containers.push({ key, container: element.container });
      }
    });
    for (const { key, container } of containers) {
      const found = references.resolve(
        container,
        `"${container}" names no element of the file or the project, so this element sits in no container.`,
      );
      if (found !== undefined) builder.contain(key, found);
    }
    for (const relation of file.relations ?? []) {
      const why = (end: string) =>
        `"${end}" names no element of the file or the project, so the relation is left out.`;
      const from = references.resolve(relation.from, why(relation.from));
      if (from === undefined) continue;
      const to = references.resolve(relation.to, why(relation.to));
      if (to === undefined) continue;
      const kind = relation.relationType ?? '';
      const label = relation.name ?? relation.id ?? `${relation.from} → ${relation.to}`;
      const attributes = this.#attributes(relation.attributes, label);
      const description = builder.description(relation.description);
      const suggested = this.#suggest.relationType(kind);
      builder.relate(
        {
          ...(relation.id === undefined ? {} : { sourceId: relation.id }),
          from,
          to,
          kind,
          ...(relation.name === undefined ? {} : { name: builder.name(relation.name, '') }),
          ...(description === undefined ? {} : { description }),
          ...(attributes === undefined ? {} : { attributes }),
        },
        { label: kind, ...(suggested === undefined ? {} : { suggested }) },
      );
    }
  }

  /** The element of the project this one matches by the key, when importing into a project. */
  #match(
    id: string,
    name: string,
    attributes: Attributes | undefined,
  ): { id: string; name: string } | 'several' | undefined {
    if (!this.#matching) return undefined;
    const how = this.#how;
    const value =
      how.by === 'id'
        ? id
        : how.by === 'name'
          ? name
          : textOf(
              attributes !== undefined && Object.hasOwn(attributes, how.name)
                ? attributes[how.name]
                : undefined,
            );
    return this.#references.match(how, value);
  }

  /** Attribute values as the file gives them, without the one name no attribute may have. */
  #attributes(attributes: Attributes | undefined, of: string): Attributes | undefined {
    if (attributes === undefined) return undefined;
    const entries = Object.entries(attributes).filter(([name]) => {
      if (name !== FORBIDDEN_NAME) return true;
      this.#builder.report(of, `No attribute may be named "${FORBIDDEN_NAME}", so it is left out.`);
      return false;
    });
    return entries.length === 0 ? undefined : Object.fromEntries<JsonValue>(entries);
  }

  /** A key for an element: its id, else its name, else its name and place in the list. */
  #keyFor(id: string, name: string, place: number): string {
    const free = (key: string) =>
      key !== '' && this.#builder.element(key) === undefined && !/^relation \d+$/.test(key);
    if (free(id)) return id;
    if (id === '' && free(name)) return name;
    return `${id || name} (element ${place})`;
  }
}

/** An attribute's value as text, to match by; empty when there is none. */
function textOf(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}
