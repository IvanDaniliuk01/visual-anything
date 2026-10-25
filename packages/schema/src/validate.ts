/**
 * Reading project files: parsing their text and validating it against the published JSON Schema of
 * their kind, generated from `files.ts`. This is a separate entry point of the package, so that only
 * the programs that open project files load Ajv.
 */
import type { DefinedError, ValidateFunction } from 'ajv';
import { Ajv } from 'ajv';
import commentSchema from '../schemas/comment.schema.json' with { type: 'json' };
import modelSchema from '../schemas/model.schema.json' with { type: 'json' };
import packageSchema from '../schemas/package.schema.json' with { type: 'json' };
import projectSchema from '../schemas/project.schema.json' with { type: 'json' };
import scenarioSchema from '../schemas/scenario.schema.json' with { type: 'json' };
import tourSchema from '../schemas/tour.schema.json' with { type: 'json' };
import viewSchema from '../schemas/view.schema.json' with { type: 'json' };
import { SCHEMA_VERSION } from './files';
import type { FileContentByKind, FileKind } from './kinds';

/** A problem found in a project file. */
export interface ValidationError {
  /** A JSON pointer to the value with the problem; empty when it concerns the whole file. */
  path: string;
  message: string;
}

/** The outcome of reading a project file: its contents, or every problem found in it. */
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: ValidationError[] };

/** Parses the text of a project file of the given kind and validates it. */
export function parseFile<K extends FileKind>(
  kind: K,
  text: string,
): ValidationResult<FileContentByKind[K]> {
  const json = text.startsWith('\uFEFF') ? text.slice(1) : text;
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [{ path: '', message: `Not valid JSON: ${reason}` }] };
  }
  return validateFile(kind, data);
}

/**
 * Validates parsed JSON against the JSON Schema of the given kind of project file. The check is
 * structural: whether the ids a file uses resolve to anything is for the core to tell.
 */
export function validateFile<K extends FileKind>(
  kind: K,
  data: unknown,
): ValidationResult<FileContentByKind[K]> {
  // A project from a newer build fails on its version and on whatever it added; only the first says
  // what to do, so it is said alone.
  const newer = kind === 'project' ? newerFormatOf(data) : undefined;
  if (newer !== undefined) {
    return {
      ok: false,
      errors: [
        {
          path: '/schemaVersion',
          message: `This project was saved by a newer Visual Anything, format ${newer}. Update the program to open it.`,
        },
      ],
    };
  }
  const validate = validatorOf(kind);
  if (validate(data)) return { ok: true, value: data as FileContentByKind[K] };
  return { ok: false, errors: validationErrors((validate.errors ?? []) as DefinedError[]) };
}

/**
 * The format version of a project file's contents when it is newer than the one this build reads: an
 * integer above it. `undefined` for anything else, which the schema then checks as usual.
 */
export function newerFormatOf(data: unknown): number | undefined {
  if (typeof data !== 'object' || data === null || !Object.hasOwn(data, 'schemaVersion')) {
    return undefined;
  }
  const version = (data as { schemaVersion: unknown }).schemaVersion;
  return typeof version === 'number' && Number.isInteger(version) && version > SCHEMA_VERSION
    ? version
    : undefined;
}

/** The published JSON Schema of each kind of project file. */
const SCHEMAS = {
  project: projectSchema,
  model: modelSchema,
  package: packageSchema,
  view: viewSchema,
  scenario: scenarioSchema,
  tour: tourSchema,
  comment: commentSchema,
} satisfies Record<FileKind, object>;

let ajv: Ajv | undefined;
const validators = new Map<FileKind, ValidateFunction>();

/** The validator of a kind of project file, compiled from its schema the first time it is needed. */
function validatorOf(kind: FileKind): ValidateFunction {
  let validate = validators.get(kind);
  if (validate === undefined) {
    ajv ??= new Ajv({ strict: true, allErrors: true });
    validate = ajv.compile(SCHEMAS[kind]);
    validators.set(kind, validate);
  }
  return validate;
}

/** Ajv's errors as validation errors, in the order Ajv found them, each one once. */
function validationErrors(errors: DefinedError[]): ValidationError[] {
  const seen = new Set<string>();
  const result: ValidationError[] = [];
  // What each key that breaks propertyNames fails, by its path and name, to say what keys must be.
  const failedBy = new Map<string, DefinedError[]>();
  for (const error of errors) {
    if (error.propertyName === undefined || error.keyword === 'propertyNames') continue;
    const at = JSON.stringify([error.instancePath, error.propertyName]);
    failedBy.set(at, [...(failedBy.get(at) ?? []), error]);
  }
  for (const { error, message: joined } of withUnionsExplained(errors)) {
    // A key that breaks propertyNames is reported once, by the propertyNames error that names it,
    // not again by the errors of the schema its name failed.
    if (error.propertyName !== undefined && error.keyword !== 'propertyNames') continue;
    const message =
      joined ??
      (error.keyword === 'propertyNames'
        ? keysMessage(
            JSON.stringify(error.params.propertyName),
            failedBy.get(JSON.stringify([error.instancePath, error.params.propertyName])) ?? [],
          )
        : messageOf(error));
    const key = JSON.stringify([error.instancePath, message]);
    if (message === undefined || seen.has(key)) continue;
    seen.add(key);
    result.push({ path: error.instancePath, message });
  }
  return result;
}

/**
 * The keywords by which a value fails a member of a union only because it is another kind of value,
 * such as a string where the member is a list.
 */
const MISMATCHES = new Set<string>(['type', 'const', 'enum', 'anyOf']);

/**
 * Ajv's errors with each failed union (`anyOf`, such as a limit that is a list or `any`) told the way
 * a person reads it. When the value fails a member it is the kind of, only that member's own errors
 * stay, such as "must have at least 1 item"; when it is the kind of no member, the union's errors
 * become one, such as `must be an array or "any"`, given as `message`.
 */
function withUnionsExplained(errors: DefinedError[]): { error: DefinedError; message?: string }[] {
  const unions = new Set(
    errors.filter((error) => error.keyword === 'anyOf').map((error) => error.instancePath),
  );
  const result: { error: DefinedError; message?: string }[] = [];
  const joined = new Set<string>();
  for (const error of errors) {
    const path = error.instancePath;
    if (!unions.has(path) || !MISMATCHES.has(error.keyword)) {
      result.push({ error });
      continue;
    }
    const inside = errors.some(
      (each) =>
        (each.instancePath === path && !MISMATCHES.has(each.keyword)) ||
        each.instancePath.startsWith(`${path}/`),
    );
    if (inside || joined.has(path)) continue;
    joined.add(path);
    const alternatives = errors
      .filter((each) => each.instancePath === path)
      .flatMap((each): string[] => {
        switch (each.keyword) {
          case 'type':
            return [TYPE_NAMES[each.params.type] ?? each.params.type];
          case 'const':
            return [JSON.stringify(each.params.allowedValue)];
          case 'enum':
            return each.params.allowedValues.map((value) => JSON.stringify(value));
          default:
            return [];
        }
      });
    result.push({ error, message: `must be ${[...new Set(alternatives)].join(' or ')}` });
  }
  return result;
}

/** The patterns the schemas use, each with what it means in words. */
const PATTERN_MESSAGES = new Map([
  [
    projectSchema.definitions.Id.pattern,
    'must be an id: 1 to 128 letters, digits, ".", "_" or "-", starting with a letter or digit',
  ],
  [modelSchema.definitions.Color.pattern, 'must be a color written as #RRGGBB'],
  [packageSchema.definitions.PackageVersion.pattern, 'must be a semantic version, such as 1.2.0'],
  [
    packageSchema.definitions.LicenseId.pattern,
    'must be an SPDX license identifier, such as CC0-1.0 or MIT',
  ],
  // Package code (ADR 0054).
  [packageSchema.definitions.CodeLine.pattern, 'must be one line, without a line break'],
  [
    packageSchema.definitions.Capability.pattern,
    'must be "model:read", "time", or "network:" and one web origin, such as "network:https://status.example.com"',
  ],
  // Comments (ADR 0059).
  [
    commentSchema.definitions.CommentTime.pattern,
    'must be a time in UTC as ISO 8601 writes it, such as 2026-10-25T14:03:00.000Z',
  ],
  [
    commentSchema.definitions.PersonAuthor.properties.email.pattern,
    'must be an email address, such as ana@example.com',
  ],
  [
    modelSchema.definitions.ExternalId.pattern,
    'must be an identifier without line breaks or other control characters',
  ],
]);

/**
 * What the keys of an object must be, in words, told by what a key that is not one fails: a scheme of
 * external identifiers, an external identifier, or else an id.
 */
function keysMessage(key: string, failed: readonly DefinedError[]): string {
  const pattern = (wanted: string) =>
    failed.some((each) => each.keyword === 'pattern' && each.params.pattern === wanted);
  if (pattern(modelSchema.definitions.ExternalIds.propertyNames.pattern)) {
    return `must have schemes as its keys, short lowercase names such as "uberon", and ${key} is not one`;
  }
  if (
    pattern(modelSchema.definitions.ExternalId.pattern) ||
    failed.some((each) => each.keyword === 'minLength' || each.keyword === 'maxLength')
  ) {
    return `must have identifiers as its keys, and ${key} is not one`;
  }
  return `must have ids as its keys, and ${key} is not one`;
}

const TYPE_NAMES: Record<string, string> = {
  string: 'a string',
  number: 'a number',
  integer: 'an integer',
  boolean: 'true or false',
  object: 'an object',
  array: 'an array',
  null: 'null',
};

const COMPARISONS = { '<': 'less than', '<=': 'at most', '>': 'greater than', '>=': 'at least' };

/**
 * What is wrong with the value at the error's path. `undefined` when the error only repeats others:
 * a failed `if` fails because of errors already reported for the member it applied.
 */
function messageOf(error: DefinedError): string | undefined {
  switch (error.keyword) {
    case 'required':
      return `must have the key ${JSON.stringify(error.params.missingProperty)}`;
    case 'additionalProperties':
      return `must not have the key ${JSON.stringify(error.params.additionalProperty)}`;
    case 'type': {
      const types = error.params.type.split(',').map((type) => TYPE_NAMES[type] ?? type);
      return `must be ${types.join(' or ')}`;
    }
    case 'const':
      return `must be ${JSON.stringify(error.params.allowedValue)}`;
    case 'enum': {
      const values = error.params.allowedValues.map((value) => JSON.stringify(value));
      return `must be one of ${values.join(', ')}`;
    }
    case 'pattern':
      return (
        PATTERN_MESSAGES.get(error.params.pattern) ??
        `must match the pattern ${error.params.pattern}`
      );
    case 'minLength':
      return error.params.limit === 1
        ? 'must not be empty'
        : `must have at least ${error.params.limit} characters`;
    case 'minItems':
      return `must have at least ${error.params.limit} item${error.params.limit === 1 ? '' : 's'}`;
    case 'maxItems':
      return `must have at most ${error.params.limit} item${error.params.limit === 1 ? '' : 's'}`;
    case 'maxLength':
      return `must have at most ${error.params.limit} character${error.params.limit === 1 ? '' : 's'}`;
    case 'minProperties':
      return error.params.limit === 1
        ? 'must not be empty'
        : `must have at least ${error.params.limit} keys`;
    case 'propertyNames':
      return keysMessage(JSON.stringify(error.params.propertyName), []);
    case 'uniqueItems':
      return `must not have duplicate items (items ${error.params.j} and ${error.params.i} are the same)`;
    case 'minimum':
    case 'maximum':
    case 'exclusiveMinimum':
    case 'exclusiveMaximum':
      return `must be ${COMPARISONS[error.params.comparison]} ${error.params.limit}`;
    case 'if':
      return undefined;
    default:
      return error.message ?? `does not satisfy "${error.keyword}"`;
  }
}
