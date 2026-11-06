/**
 * Writing project files: JSON with a stable key order, so that git diffs stay small and a project
 * folder round-trips without changes.
 *
 * The order comes from the published JSON Schema of each kind of file, generated from `files.ts`. The
 * keys a schema lists come in the order it lists them, which is the order in which `files.ts` declares
 * them; any other key comes after them, sorted by UTF-16 code units. So the keys of free-form objects,
 * such as attributes and the data in and out of a step, are all sorted, at any depth. Arrays keep their
 * order, and the text is laid out as `JSON.stringify(value, null, 2)` lays it out, with a final newline.
 */
import commentSchema from '../schemas/comment.schema.json' with { type: 'json' };
import modelSchema from '../schemas/model.schema.json' with { type: 'json' };
import packageSchema from '../schemas/package.schema.json' with { type: 'json' };
import projectSchema from '../schemas/project.schema.json' with { type: 'json' };
import scenarioSchema from '../schemas/scenario.schema.json' with { type: 'json' };
import tourSchema from '../schemas/tour.schema.json' with { type: 'json' };
import viewSchema from '../schemas/view.schema.json' with { type: 'json' };
import type { FileContentByKind, FileKind } from './kinds';

/**
 * The text of a project file of the given kind, ready to write. Formatting its text again, once
 * parsed, gives the same text, and parsing it gives back the same values. Contents that do not match
 * the schema of the kind are written too, with the keys the schema cannot place sorted; contents that
 * JSON cannot write at all, such as undefined, throw a TypeError.
 */
export function formatFile<K extends FileKind>(kind: K, value: FileContentByKind[K]): string {
  if (isLeftOut(value)) throw new TypeError(`The contents of a ${kind} file must be JSON.`);
  const writer = new JsonWriter(SCHEMAS[kind]);
  writer.write(value, SCHEMAS[kind], 0);
  return `${writer.text()}\n`;
}

/**
 * The parts of a JSON Schema (draft-07) that decide in which order the keys of a value are written:
 * which keys an object lists, and which schema describes each value inside it.
 */
interface Schema {
  $ref?: string;
  definitions?: Record<string, Schema>;
  type?: string | string[];
  properties?: Record<string, Schema>;
  additionalProperties?: boolean | Schema;
  items?: Schema;
  anyOf?: Schema[];
  oneOf?: Schema[];
  allOf?: Schema[];
  if?: Schema;
  then?: Schema;
  required?: string[];
  const?: unknown;
  enum?: unknown[];
}

/** The published JSON Schema of each kind of project file. */
const SCHEMAS: Record<FileKind, Schema> = {
  project: projectSchema,
  model: modelSchema,
  package: packageSchema,
  view: viewSchema,
  scenario: scenarioSchema,
  tour: tourSchema,
  comment: commentSchema,
};

/** Whether JSON leaves a value out, as JSON.stringify leaves out undefined, functions and symbols. */
function isLeftOut(value: unknown): boolean {
  return value === undefined || typeof value === 'function' || typeof value === 'symbol';
}

/**
 * Writes JSON text laid out as `JSON.stringify(value, null, 2)` lays it out, with the keys of each
 * object in the order its plan gives. The value is JSON data, as JSON.parse returns it, so only the
 * own keys of its objects are written and no `toJSON` is called.
 */
class JsonWriter {
  /** The text written so far, in pieces. */
  private readonly pieces: string[] = [];

  /** `fileSchema` is the schema of the whole file, whose definitions every `$ref` leads into. */
  constructor(private readonly fileSchema: Schema) {}

  /** The text written so far. */
  text(): string {
    return this.pieces.join('');
  }

  /**
   * Appends a value that JSON does not leave out, described by a schema. `depth` is how many objects
   * and arrays hold the value: its keys or items are indented by two spaces for each, and one more.
   */
  write(value: unknown, schema: Schema | undefined, depth: number): void {
    if (typeof value !== 'object' || value === null) {
      this.pieces.push(JSON.stringify(value));
      return;
    }
    const plan = planFor(schema, value, this.fileSchema);
    const inner = lineBreak(depth + 1);
    if (Array.isArray(value)) {
      const items = value as unknown[];
      if (items.length === 0) {
        this.pieces.push('[]');
        return;
      }
      for (let index = 0; index < items.length; index += 1) {
        this.pieces.push(index === 0 ? '[' : ',', inner);
        const item = items[index];
        if (isLeftOut(item)) this.pieces.push('null');
        else this.write(item, plan.items, depth + 1);
      }
      this.pieces.push(lineBreak(depth), ']');
      return;
    }
    const record = value as Record<string, unknown>;
    let written = 0;
    for (const listed of plan.listed) {
      const item = record[listed.key];
      if (isLeftOut(item) || !isOwnKey(record, listed.key)) continue;
      this.pieces.push(written === 0 ? '{' : ',', inner, listed.text);
      this.write(item, listed.schema, depth + 1);
      written += 1;
    }
    let others: string[] | undefined;
    for (const key in record) {
      if (!plan.keys.has(key) && isOwnKey(record, key)) (others ??= []).push(key);
    }
    for (const key of others?.sort(byCodeUnits) ?? []) {
      const item = record[key];
      if (isLeftOut(item)) continue;
      this.pieces.push(written === 0 ? '{' : ',', inner, JSON.stringify(key), ': ');
      this.write(item, plan.others, depth + 1);
      written += 1;
    }
    if (written === 0) this.pieces.push('{}');
    else this.pieces.push(lineBreak(depth), '}');
  }
}

/** A line break followed by the indentation of each depth, made once. */
const LINE_BREAKS: string[] = [];

/** A line break followed by the indentation of a depth: two spaces for each level. */
function lineBreak(depth: number): string {
  return (LINE_BREAKS[depth] ??= `\n${'  '.repeat(depth)}`);
}

/** Whether a key is one of an object's own keys that JSON writes: an own, enumerable one. */
function isOwnKey(record: object, key: string): boolean {
  return Object.prototype.propertyIsEnumerable.call(record, key);
}

/** Orders strings by their UTF-16 code units, as `<` does: the same on every machine and locale. */
function byCodeUnits(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** How the schemas that describe a value have its keys or items written. */
interface Plan {
  /** The keys the schemas list, in order, each with its text before the value and its schema. */
  listed: readonly { key: string; text: string; schema: Schema }[];
  /** The keys the schemas list. */
  keys: ReadonlySet<string>;
  /** The schema of the values of every other key, if the schemas give one. */
  others: Schema | undefined;
  /** The schema of the items of an array, if the schemas give one. */
  items: Schema | undefined;
}

/** The plan of a value no schema describes: every key sorted, and nothing known about the values. */
const NO_PLAN = planOf([]);

/**
 * The plans made once for each schema. Unless an `if` applies, the schemas that describe a value
 * depend only on whether it is an object or an array, so a schema has one plan for each. A plan for
 * which an `if` was applied depends on the value itself, and is made again for every value.
 */
const plans = new WeakMap<Schema, { object?: Plan; array?: Plan }>();

/** The plan for writing an object or an array that a schema of the file describes. */
function planFor(schema: Schema | undefined, value: object, fileSchema: Schema): Plan {
  const resolved = dereference(schema, fileSchema);
  if (resolved === undefined) return NO_PLAN;
  const type = Array.isArray(value) ? 'array' : 'object';
  const known = plans.get(resolved);
  const cached = known?.[type];
  if (cached !== undefined) return cached;
  const description = { schemas: [] as Schema[], appliedIf: false };
  addDescribingSchemas(resolved, value, fileSchema, description);
  const plan = planOf(description.schemas);
  if (!description.appliedIf) plans.set(resolved, { ...known, [type]: plan });
  return plan;
}

/** The plan of the schemas that describe a value, most specific first. */
function planOf(schemas: readonly Schema[]): Plan {
  const listed: { key: string; text: string; schema: Schema }[] = [];
  const keys = new Set<string>();
  for (const schema of schemas) {
    for (const [key, keySchema] of Object.entries(schema.properties ?? {})) {
      if (keys.has(key)) continue;
      keys.add(key);
      listed.push({ key, text: `${JSON.stringify(key)}: `, schema: keySchema });
    }
  }
  const others = schemas
    .map((schema) => schema.additionalProperties)
    .find((each): each is Schema => typeof each === 'object');
  const items = schemas.find((schema) => schema.items !== undefined)?.items;
  return { listed, keys, others, items };
}

/**
 * Adds the schemas that describe an object or an array, most specific first. A `$ref` leads into the
 * `definitions` of the file's schema; a union (`anyOf` or `oneOf`) adds its first member that admits
 * the value's JSON type and whose required keys the value holds, or else its first that admits that
 * type, so that a union of objects told apart by their keys, such as a view folder's entries, adds
 * the member the value is; `allOf` adds each of its members; and an `if` adds its `then` when the value
 * meets it, which is how a union tagged with `@discriminator`, such as FreeShape, adds the member
 * whose discriminator the value names.
 */
function addDescribingSchemas(
  schema: Schema | undefined,
  value: object,
  fileSchema: Schema,
  description: { schemas: Schema[]; appliedIf: boolean },
): void {
  const resolved = dereference(schema, fileSchema);
  if (resolved === undefined) return;
  const union = resolved.anyOf ?? resolved.oneOf;
  if (union !== undefined) {
    const admitting = union.filter((each) => admits(dereference(each, fileSchema), value));
    const member =
      admitting.find((each) => holdsRequired(dereference(each, fileSchema), value)) ?? admitting[0];
    addDescribingSchemas(member, value, fileSchema, description);
  }
  for (const member of resolved.allOf ?? []) {
    addDescribingSchemas(member, value, fileSchema, description);
  }
  const condition = dereference(resolved.if, fileSchema);
  if (condition !== undefined) {
    description.appliedIf = true;
    if (meets(value, condition))
      addDescribingSchemas(resolved.then, value, fileSchema, description);
  }
  description.schemas.push(resolved);
}

/** A `$ref` to a definition of the file's schema. */
const DEFINITION_REF = /^#\/definitions\/(.+)$/;

/** Where each schema that holds a `$ref` leads. */
const references = new WeakMap<Schema, Schema | undefined>();

/** A schema with its `$ref` followed, `undefined` when there is none or it leads nowhere. */
function dereference(schema: Schema | undefined, fileSchema: Schema): Schema | undefined {
  if (schema?.$ref === undefined) return schema;
  if (references.has(schema)) return references.get(schema);
  const definitions = fileSchema.definitions ?? {};
  let resolved: Schema | undefined = schema;
  // A chain of references that is longer than the definitions it goes through goes round in a loop.
  for (let hops = 0; resolved?.$ref !== undefined; hops += 1) {
    const name: string | undefined = DEFINITION_REF.exec(resolved.$ref)?.[1];
    resolved =
      name === undefined || hops > Object.keys(definitions).length
        ? undefined
        : definitions[decodeURIComponent(name)];
  }
  references.set(schema, resolved);
  return resolved;
}

/** Whether a value holds every key a schema requires; an array or a schema that requires none does. */
function holdsRequired(schema: Schema | undefined, value: object): boolean {
  const required = schema?.required ?? [];
  return (
    Array.isArray(value) || required.every((key) => isOwnKey(value as Record<string, unknown>, key))
  );
}

/** Whether a schema admits an object or an array, as far as its `type` tells. */
function admits(schema: Schema | undefined, value: object): boolean {
  if (schema === undefined) return false;
  if (schema.type === undefined) return true;
  const type = Array.isArray(value) ? 'array' : 'object';
  return typeof schema.type === 'string' ? schema.type === type : schema.type.includes(type);
}

/**
 * Whether a value meets the `if` of a discriminated union: it is an object with the keys the `if`
 * requires, and those of its keys that the `if` describes have the value it names with `const` or
 * `enum`.
 */
function meets(value: object, condition: Schema): boolean {
  if (Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const required = condition.required ?? [];
  if (!required.every((key) => isOwnKey(record, key))) return false;
  return Object.entries(condition.properties ?? {}).every(([key, test]) => {
    if (!isOwnKey(record, key)) return true;
    if ('const' in test && record[key] !== test.const) return false;
    return test.enum === undefined || test.enum.includes(record[key]);
  });
}
