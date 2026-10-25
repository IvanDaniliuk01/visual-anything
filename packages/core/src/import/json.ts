/**
 * The JSON reader (ADR-0042, R35), for two forms:
 *
 * - **A project's own model file** (`.vamodel`, or its JSON), with World, elements and relations,
 *   checked against the published model schema; its components and relation types are its kinds.
 * - **The simple form:** `{ "elements": [...], "relations": [...] }`, whose elements have a `name`
 *   and may have an `id`, a `component`, a `container`, a `description` and `attributes`, and whose
 *   relations have `from` and `to` and may have an `id`, a `relationType`, a `name`, a `description`
 *   and `attributes`. It is checked against `SIMPLE_FORM_SCHEMA`.
 *
 * Strings are kept exactly as written: an entity stays text, and nothing in them is read as markup.
 * Importing again matches elements to the project's by a key, the id by default, as spreadsheets do.
 */
import modelSchema from '@visual-anything/schema/schemas/model.schema.json' with { type: 'json' };
import type { Attributes, Element, JsonValue, Relation } from '@visual-anything/schema';
import { PastLimits, PlanBuilder } from './builder';
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

const DESCRIPTION_KEPT =
  'An import gives a relation no description, so its description is kept as its attribute "description".';

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
  if (depthOf(data, MAX_JSON_DEPTH) > MAX_JSON_DEPTH) {
    return { ok: false, problems: [`The file nests more than ${MAX_JSON_DEPTH} levels deep.`] };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, problems: [NEITHER] };
  }
  const model = Object.hasOwn(data, 'world');
  if (!model && !Object.hasOwn(data, 'elements') && !Object.hasOwn(data, 'relations')) {
    return { ok: false, problems: [NEITHER] };
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
    // A relation that ends on a relation comes after it; what never can is reported.
    const keys = new Map<string, string>();
    const world = (file as { world?: Element }).world?.id;
    let waiting = file.relations.filter((relation) => {
      const end = [relation.from, relation.to].find((each) => each === world);
      if (end === undefined) return true;
      builder.report(
        relation.id,
        'It ends on World, which an import does not bring, so it is left out.',
      );
      return false;
    });
    const ids = new Set(file.relations.map((relation) => relation.id));
    for (const relation of [...waiting]) {
      const missing = [relation.from, relation.to].find(
        (end) => !elements.has(end) && !ids.has(end),
      );
      if (missing === undefined) continue;
      builder.report(
        relation.id,
        `It ends on "${quote(missing)}", which the file does not hold, so it is left out.`,
      );
      waiting = waiting.filter((each) => each !== relation);
    }
    for (let progress = true; progress && waiting.length > 0;) {
      progress = false;
      waiting = waiting.filter((relation) => {
        const end = (id: string) => (elements.has(id) ? id : keys.get(id));
        const from = end(relation.from);
        const to = end(relation.to);
        if (from === undefined || to === undefined) return true;
        const attributes = this.#attributes(
          relation.description === undefined
            ? relation.attributes
            : { ...relation.attributes, description: relation.description },
          relation.name ?? relation.id,
        );
        if (relation.description !== undefined)
          builder.report(relation.name ?? relation.id, DESCRIPTION_KEPT);
        const planned = builder.relate(
          {
            sourceId: relation.id,
            from,
            to,
            kind: relation.relationType,
            ...(relation.name === undefined
              ? {}
              : { name: builder.name(relation.name, relation.id) }),
            ...(attributes === undefined ? {} : { attributes }),
          },
          { label: relation.relationType, suggested: relation.relationType },
        );
        keys.set(relation.id, planned.key);
        progress = true;
        return false;
      });
    }
    for (const relation of waiting) {
      builder.report(
        relation.id,
        'It ends on a relation that ends on it in turn, so it is left out.',
      );
    }
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
      if (relation.description !== undefined) builder.report(label, DESCRIPTION_KEPT);
      const attributes = this.#attributes(
        relation.description === undefined
          ? relation.attributes
          : { ...relation.attributes, description: relation.description },
        label,
      );
      const suggested = this.#suggest.relationType(kind);
      builder.relate(
        {
          ...(relation.id === undefined ? {} : { sourceId: relation.id }),
          from,
          to,
          kind,
          ...(relation.name === undefined ? {} : { name: builder.name(relation.name, '') }),
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
