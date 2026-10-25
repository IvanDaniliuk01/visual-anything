/**
 * Checking JSON against a JSON Schema the way Ajv does for the published schemas (draft-07), without
 * Ajv: Ajv compiles each schema into code, which the app's page policy does not allow, and the core
 * runs in the app too. It reads only the keywords the published schemas use, and says what is wrong
 * with each value in the words the schema package's reasons use, so that the app's catalog reads
 * them. The schema is the program's own; the data is from a file, so every key of it is looked up as
 * an own property only.
 */

/** A problem with a value: a JSON pointer to it, empty for the whole file, and what is wrong. */
export interface SchemaProblem {
  path: string;
  message: string;
}

type Schema = Readonly<Record<string, unknown>>;

/** The most problems a check reports; a file with more has those first ones said. */
export const MAX_SCHEMA_PROBLEMS = 50;

/** The patterns the published schemas use, with what each means in words. */
const PATTERN_MESSAGES: ReadonlyMap<string, string> = new Map([
  [
    '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$',
    'must be an id: 1 to 128 letters, digits, ".", "_" or "-", starting with a letter or digit',
  ],
  ['^#[0-9a-fA-F]{6}$', 'must be a color written as #RRGGBB'],
]);

const TYPE_NAMES: Readonly<Record<string, string>> = {
  string: 'a string',
  number: 'a number',
  integer: 'an integer',
  boolean: 'true or false',
  object: 'an object',
  array: 'an array',
  null: 'null',
};

const patterns = new Map<string, RegExp>();

function patternOf(source: string): RegExp {
  let pattern = patterns.get(source);
  if (pattern === undefined) {
    pattern = new RegExp(source, 'u');
    patterns.set(source, pattern);
  }
  return pattern;
}

/** How deep a value nests: 0 for a scalar, 1 for a list or object of scalars. Measured without recursion. */
export function depthOf(value: unknown, stopAt: number): number {
  let deepest = 0;
  const stack: [unknown, number][] = [[value, 0]];
  while (stack.length > 0) {
    const [each, depth] = stack.pop() as [unknown, number];
    if (typeof each !== 'object' || each === null) continue;
    const inner = depth + 1;
    if (inner > deepest) deepest = inner;
    if (deepest > stopAt) return deepest;
    for (const child of Array.isArray(each) ? each : Object.values(each)) {
      if (typeof child === 'object' && child !== null) stack.push([child, inner]);
    }
  }
  return deepest;
}

/**
 * What is wrong with data under a schema, as Ajv says it with every error, unions told the way a
 * person reads them: empty when nothing is. Nesting deeper than the schema's own, such as in attribute
 * values, is followed as deep as the data goes, so the caller bounds the data's depth first.
 */
export function checkAgainstSchema(root: object, data: unknown): SchemaProblem[] {
  const problems: SchemaProblem[] = [];
  new Checker(root as Schema, problems).check(root, data, '');
  const seen = new Set<string>();
  return problems
    .filter((problem) => {
      const key = JSON.stringify([problem.path, problem.message]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_SCHEMA_PROBLEMS);
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function fitsType(value: unknown, type: string): boolean {
  switch (type) {
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number';
    case 'object':
      return typeOf(value) === 'object';
    default:
      return typeOf(value) === type;
  }
}

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(
    (key) =>
      Object.hasOwn(b, key) &&
      equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

/** A value as JSON with its keys in order, so that two equal values write the same text. */
function canonical(value: unknown): string {
  if (typeof value !== 'object' || value === null) return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

/** A JSON pointer's next part. */
function pointer(path: string, key: string | number): string {
  return `${path}/${String(key).replaceAll('~', '~0').replaceAll('/', '~1')}`;
}

/** Characters as Ajv counts them for lengths: by code point. */
function lengthOf(text: string): number {
  let length = 0;
  for (let at = 0; at < text.length; at++) {
    const code = text.charCodeAt(at);
    const before = at > 0 ? text.charCodeAt(at - 1) : 0;
    // A surrogate pair is one character, as Ajv counts it; a lone surrogate is one too.
    if (code >= 0xdc00 && code <= 0xdfff && before >= 0xd800 && before <= 0xdbff) continue;
    length += 1;
  }
  return length;
}

/** A schema keyword's value, read as the schema's own key only. */
function keyword(rule: Schema, name: string): unknown {
  return Object.hasOwn(rule, name) ? rule[name] : undefined;
}

/** What each `$ref` of each root schema names, found once. */
const resolved = new WeakMap<Schema, Map<string, unknown>>();

class Checker {
  readonly #root: Schema;
  readonly #problems: SchemaProblem[];

  constructor(root: Schema, problems: SchemaProblem[]) {
    this.#root = root;
    this.#problems = problems;
  }

  /** Adds the problems of data under a schema; returns whether it had none. */
  check(schema: unknown, data: unknown, path: string): boolean {
    if (schema === true || schema === undefined) return true;
    if (schema === false) return this.#fail(path, 'must not be here');
    if (typeof schema !== 'object' || schema === null) return true;
    if (this.#problems.length >= MAX_SCHEMA_PROBLEMS * 4) return false;
    const rule = schema as Schema;
    const before = this.#problems.length;

    const ref = keyword(rule, '$ref');
    if (typeof ref === 'string') return this.check(this.#resolve(ref), data, path);

    const type = keyword(rule, 'type');
    if (type !== undefined) {
      const types = Array.isArray(type) ? (type as string[]) : [type as string];
      if (!types.some((each) => fitsType(data, each))) {
        return this.#fail(
          path,
          `must be ${types.map((each) => TYPE_NAMES[each] ?? each).join(' or ')}`,
        );
      }
    }
    if (Object.hasOwn(rule, 'const') && !equal(data, rule.const)) {
      this.#fail(path, `must be ${JSON.stringify(rule.const)}`);
    }
    const choices = keyword(rule, 'enum');
    if (Array.isArray(choices) && !choices.some((each) => equal(data, each))) {
      this.#fail(path, `must be one of ${choices.map((each) => JSON.stringify(each)).join(', ')}`);
    }
    if (typeof data === 'string') this.#string(rule, data, path);
    if (typeof data === 'number') this.#number(rule, data, path);
    if (Array.isArray(data)) this.#array(rule, data, path);
    else if (typeOf(data) === 'object') this.#object(rule, data as Record<string, unknown>, path);

    const anyOf = keyword(rule, 'anyOf');
    if (Array.isArray(anyOf)) this.#anyOf(anyOf, data, path);
    const allOf = keyword(rule, 'allOf');
    if (Array.isArray(allOf)) for (const each of allOf) this.check(each, data, path);
    const condition = keyword(rule, 'if');
    if (condition !== undefined) {
      const quiet = new Checker(this.#root, []);
      if (quiet.check(condition, data, path)) this.check(keyword(rule, 'then'), data, path);
      else this.check(keyword(rule, 'else'), data, path);
    }
    return this.#problems.length === before;
  }

  #fail(path: string, message: string): false {
    this.#problems.push({ path, message });
    return false;
  }

  /** The schema a `$ref` names, found once for each schema and kept. */
  #resolve(ref: string): unknown {
    let known = resolved.get(this.#root);
    if (known === undefined) {
      known = new Map();
      resolved.set(this.#root, known);
    }
    if (known.has(ref)) return known.get(ref);
    let at: unknown = this.#root;
    if (!ref.startsWith('#/')) at = true;
    else {
      for (const part of ref.slice(2).split('/')) {
        const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
        if (typeof at !== 'object' || at === null || !Object.hasOwn(at, key)) {
          at = true;
          break;
        }
        at = (at as Record<string, unknown>)[key];
      }
    }
    known.set(ref, at);
    return at;
  }

  #string(rule: Schema, data: string, path: string): void {
    const minLength = rule.minLength;
    if (typeof minLength === 'number' && lengthOf(data) < minLength) {
      this.#fail(
        path,
        minLength === 1 ? 'must not be empty' : `must have at least ${minLength} characters`,
      );
    }
    const maxLength = rule.maxLength;
    if (typeof maxLength === 'number' && lengthOf(data) > maxLength) {
      this.#fail(path, `must have at most ${maxLength} character${maxLength === 1 ? '' : 's'}`);
    }
    const pattern = rule.pattern;
    if (typeof pattern === 'string' && !patternOf(pattern).test(data)) {
      this.#fail(path, PATTERN_MESSAGES.get(pattern) ?? `must match the pattern ${pattern}`);
    }
  }

  #number(rule: Schema, data: number, path: string): void {
    const bounds: [string, (limit: number) => boolean, string][] = [
      ['minimum', (limit) => data >= limit, 'at least'],
      ['maximum', (limit) => data <= limit, 'at most'],
      ['exclusiveMinimum', (limit) => data > limit, 'greater than'],
      ['exclusiveMaximum', (limit) => data < limit, 'less than'],
    ];
    for (const [keyword, holds, words] of bounds) {
      const limit = Object.hasOwn(rule, keyword) ? rule[keyword] : undefined;
      if (typeof limit === 'number' && !holds(limit)) this.#fail(path, `must be ${words} ${limit}`);
    }
  }

  #array(rule: Schema, data: readonly unknown[], path: string): void {
    const minItems = rule.minItems;
    if (typeof minItems === 'number' && data.length < minItems) {
      this.#fail(path, `must have at least ${minItems} item${minItems === 1 ? '' : 's'}`);
    }
    const maxItems = rule.maxItems;
    if (typeof maxItems === 'number' && data.length > maxItems) {
      // A list past its length is not read further: its items could be any number of them.
      this.#fail(path, `must have at most ${maxItems} item${maxItems === 1 ? '' : 's'}`);
      return;
    }
    if (rule.uniqueItems === true) {
      // As Ajv finds them: the last item that repeats an earlier one, with the latest such earlier
      // one; found in one pass, by each item's canonical JSON.
      const last = new Map<string, number>();
      let pair: [number, number] | undefined;
      data.forEach((item, at) => {
        const key = canonical(item);
        const earlier = last.get(key);
        if (earlier !== undefined) pair = [earlier, at];
        last.set(key, at);
      });
      if (pair !== undefined) {
        this.#fail(
          path,
          `must not have duplicate items (items ${pair[0]} and ${pair[1]} are the same)`,
        );
      }
    }
    if (Object.hasOwn(rule, 'items') && !Array.isArray(rule.items)) {
      data.forEach((item, at) => this.check(rule.items, item, pointer(path, at)));
    }
  }

  #object(rule: Schema, data: Record<string, unknown>, path: string): void {
    const required = rule.required;
    if (Array.isArray(required)) {
      for (const key of required as string[]) {
        if (!Object.hasOwn(data, key)) this.#fail(path, `must have the key ${JSON.stringify(key)}`);
      }
    }
    const minProperties = rule.minProperties;
    if (typeof minProperties === 'number' && Object.keys(data).length < minProperties) {
      this.#fail(
        path,
        minProperties === 1 ? 'must not be empty' : `must have at least ${minProperties} keys`,
      );
    }
    const properties = (
      typeof rule.properties === 'object' && rule.properties !== null ? rule.properties : {}
    ) as Record<string, unknown>;
    const names = Object.hasOwn(rule, 'propertyNames') ? rule.propertyNames : undefined;
    for (const key of Object.keys(data)) {
      if (
        names !== undefined &&
        !new Checker(this.#root, []).check(names, key, pointer(path, key))
      ) {
        this.#fail(path, `must have ids as its keys, and ${JSON.stringify(key)} is not one`);
        continue;
      }
      const value = data[key];
      if (Object.hasOwn(properties, key)) {
        this.check(properties[key], value, pointer(path, key));
        continue;
      }
      const additional = Object.hasOwn(rule, 'additionalProperties')
        ? rule.additionalProperties
        : undefined;
      if (additional === false) this.#fail(path, `must not have the key ${JSON.stringify(key)}`);
      else if (additional !== undefined) this.check(additional, value, pointer(path, key));
    }
  }

  /**
   * A union, told as the schema package tells it: when the value is the kind of some member, that
   * member's own problems; when it is the kind of none, one problem naming what it may be.
   */
  #anyOf(members: readonly unknown[], data: unknown, path: string): void {
    const outcomes = members.map((member) => {
      const problems: SchemaProblem[] = [];
      const fits = new Checker(this.#root, problems).check(member, data, path);
      return { member, problems, fits };
    });
    if (outcomes.some((outcome) => outcome.fits)) return;
    const mismatch = (problem: SchemaProblem) =>
      problem.path === path && /^must be (one of )?/.test(problem.message);
    const ofKind = outcomes.find((outcome) => !outcome.problems.every(mismatch));
    if (ofKind !== undefined) {
      this.#problems.push(...ofKind.problems.filter((problem) => !mismatch(problem)));
      return;
    }
    const alternatives = members.flatMap((member) => this.#alternativesOf(member));
    this.#fail(path, `must be ${[...new Set(alternatives)].join(' or ')}`);
  }

  /** What a member of a union takes, in words: its value, its values, or its kinds of value. */
  #alternativesOf(member: unknown): string[] {
    let schema = member;
    for (let hops = 0; hops < 16; hops++) {
      if (typeof schema !== 'object' || schema === null) return [];
      const ref = Object.hasOwn(schema, '$ref') ? (schema as Schema).$ref : undefined;
      if (typeof ref !== 'string') break;
      schema = this.#resolve(ref);
    }
    if (typeof schema !== 'object' || schema === null) return [];
    const rule = schema as Schema;
    // As Ajv reports them: the kinds of value first, then the value or values.
    const type = rule.type;
    const types = Array.isArray(type) ? (type as string[]) : typeof type === 'string' ? [type] : [];
    const words = types.map((each) => TYPE_NAMES[each] ?? each);
    if (Object.hasOwn(rule, 'const')) words.push(JSON.stringify(rule.const));
    if (Array.isArray(rule.enum)) words.push(...rule.enum.map((each) => JSON.stringify(each)));
    return words;
  }
}
