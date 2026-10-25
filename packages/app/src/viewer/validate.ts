/**
 * The checks a page's project files get against their schemas: the validators Ajv generates for them
 * when the viewer is built (`vite.viewer.config.ts`), which run under the page's policy, where nothing
 * may compile code. A project file of a newer format is said alone, as opening says it.
 */
import { SCHEMA_VERSION, type FileKind } from '@visual-anything/schema';
import type { ValidateFile } from './data';

/** A validator as Ajv generates it: whether the data is valid, and the errors when it is not. */
export interface StandaloneValidator {
  (data: unknown): boolean;
  errors?: readonly { instancePath: string; message?: string }[] | null;
}

/** The validator of each kind of project file, by the name the build exports it under. */
export interface StandaloneValidators {
  projectFile: StandaloneValidator;
  modelFile: StandaloneValidator;
  packageFile: StandaloneValidator;
  viewFile: StandaloneValidator;
  scenarioFile: StandaloneValidator;
  tourFile: StandaloneValidator;
  commentFile: StandaloneValidator;
}

const NAMES: Record<FileKind, keyof StandaloneValidators> = {
  project: 'projectFile',
  model: 'modelFile',
  package: 'packageFile',
  view: 'viewFile',
  scenario: 'scenarioFile',
  tour: 'tourFile',
  comment: 'commentFile',
};

/** Checks files with the generated validators. */
export function standaloneValidate(validators: StandaloneValidators): ValidateFile {
  return ((kind: FileKind, data: unknown) => {
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
    const validator = validators[NAMES[kind]];
    if (validator(data)) return { ok: true, value: data };
    const seen = new Set<string>();
    const errors = (validator.errors ?? []).flatMap(({ instancePath, message }) => {
      const said = message ?? 'is not valid';
      const key = `${instancePath} ${said}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ path: instancePath, message: said }];
    });
    return { ok: false, errors };
  }) as ValidateFile;
}

/** The format of a project file's contents when it is newer than this build reads. */
function newerFormatOf(data: unknown): number | undefined {
  if (typeof data !== 'object' || data === null || !Object.hasOwn(data, 'schemaVersion')) {
    return undefined;
  }
  const version = (data as { schemaVersion: unknown }).schemaVersion;
  return typeof version === 'number' && Number.isInteger(version) && version > SCHEMA_VERSION
    ? version
    : undefined;
}
