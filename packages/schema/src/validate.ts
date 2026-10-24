/**
 * Reading project files: parsing their text and validating it against the published JSON Schema of
 * their kind, generated from `files.ts`. This is a separate entry point of the package, so that only
 * the programs that open project files load Ajv.
 */
import type { DefinedError, ValidateFunction } from 'ajv';
import { Ajv } from 'ajv';
import modelSchema from '../schemas/model.schema.json' with { type: 'json' };
import packageSchema from '../schemas/package.schema.json' with { type: 'json' };
import projectSchema from '../schemas/project.schema.json' with { type: 'json' };
import scenarioSchema from '../schemas/scenario.schema.json' with { type: 'json' };
import viewSchema from '../schemas/view.schema.json' with { type: 'json' };
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
  const validate = validatorOf(kind);
  if (validate(data)) return { ok: true, value: data as FileContentByKind[K] };
  return { ok: false, errors: validationErrors((validate.errors ?? []) as DefinedError[]) };
}

/** The published JSON Schema of each kind of project file. */
const SCHEMAS = {
  project: projectSchema,
  model: modelSchema,
  package: packageSchema,
  view: viewSchema,
  scenario: scenarioSchema,
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
  for (const error of errors) {
    const message = messageOf(error);
    const key = JSON.stringify([error.instancePath, message]);
    if (message === undefined || seen.has(key)) continue;
    seen.add(key);
    result.push({ path: error.instancePath, message });
  }
  return result;
}

/** The patterns the schemas use, each with what it means in words. */
const PATTERN_MESSAGES = new Map([
  [
    projectSchema.definitions.Id.pattern,
    'must be an id: 1 to 128 letters, digits, ".", "_" or "-", starting with a letter or digit',
  ],
  [modelSchema.definitions.Color.pattern, 'must be a color written as #rrggbb'],
]);

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
