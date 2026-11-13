/**
 * Commands on explorables and script libraries (ADR 0107). An explorable's definition lives in one of
 * the project's own packages and its text in the project's `explorableTexts`, which the local program
 * mirrors into `explorables/<file>`: so each command that changes a text is one action whose history
 * keeps the text it replaced, and undo gives it back. A script library's definition is sent by the
 * local program alone, for a file it fetched, checked and keeps; the core checks its form and the
 * caps, and never reads the file.
 *
 * Also here: the check, once any command is done, that every explorable an appearance or an
 * explorable shape comes to show is defined, that an explorable shape's element is in the model,
 * and that no explorable or script library still in use goes; and the checks of an explorable
 * shape's and a tour step's explorable.
 */
import type {
  Appearance,
  ExplorableDefinition,
  ExplorableParameter,
  ExplorableShape,
  FreeShape,
  Id,
  JsonValue,
  PackageFile,
  ScriptLibraryDefinition,
  TourExplorable,
} from '@visual-anything/schema';
import { isId } from '../ids';
import { isLicenseId } from '../licenses';
import type { Operation, PackageProperties } from '../operations';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn, modelIndexOf } from '../state';
import { explorableTextHash } from '../explorables/approvals';
import {
  explorableIdOf,
  explorablesIn,
  explorableTextOf,
  explorableUsers,
} from '../explorables/catalog';
import { utf8Length } from '../explorables/frame';
import { LIBRARY_GLOBAL, NPM_NAME, NPM_VERSION } from '../explorables/protocol-messages';
import {
  MAX_PARAMETERS,
  MAX_PARAMETER_TEXT,
  PARAMETER_NAME,
  isParameterValue,
} from '../explorables/messages';
import {
  MAX_EXPLORABLES_PER_PACKAGE,
  MAX_EXPLORABLE_BYTES,
  MAX_SCRIPT_LIBRARIES_BYTES,
  MAX_SCRIPT_LIBRARY_BYTES,
  VA_API,
  type ExplorableText,
} from '../explorables/types';
import { compact, count, reject, type Draft } from './draft';
import type {
  DefineExplorableCommand,
  DefineScriptLibraryCommand,
  RecordExplorableFileCommand,
  RemoveExplorableCommand,
  RemoveScriptLibraryCommand,
  UpdateExplorableCommand,
  WriteExplorableCommand,
} from './types';

const HASH = /^[0-9a-f]{64}$/;
const FILE = /^[a-z0-9][a-z0-9-]{0,62}\.html$/;
/** The most script libraries one explorable uses, and a package defines. */
const MAX_LIBRARIES_PER_EXPLORABLE = 16;
const MAX_LIBRARIES_PER_PACKAGE = 64;
const PARAMETER_BOUND = 1e12;

// ——— Explorables ———

export function defineExplorable(draft: Draft, command: DefineExplorableCommand): string {
  const file = draft.ownPackage(command.package);
  const given = command.explorable as Record<string, unknown> | undefined;
  if (typeof given !== 'object' || given === null || Array.isArray(given)) {
    reject('invalid-command', 'define-explorable needs the explorable to define.');
  }
  for (const key of Object.keys(given)) {
    if (!['id', 'name', 'description', 'file', 'scriptLibraries', 'parameters'].includes(key)) {
      invalid(`An explorable's definition holds no "${key}".`);
    }
  }
  const name = checkedName(given.name);
  const catalog = explorablesIn(draft.state);
  const taken = (id: Id) => catalog.explorables.has(id) || catalog.scriptLibraries.has(id);
  let id: Id;
  if (given.id === undefined) {
    id = draft.newDefinitionId(file.id, name, 'explorable');
    while (taken(id)) id = draft.newDefinitionId(file.id, `${name} ${id}`, 'explorable');
  } else {
    if (!isId(given.id)) reject('invalid-id', `${JSON.stringify(given.id)} is not a valid id.`);
    id = given.id;
    if (!id.startsWith(`${file.id}.`)) {
      reject(
        'id-outside-package',
        `The explorable "${id}" must start with "${file.id}.", the id of its package.`,
        [id],
      );
    }
    if (taken(id) || draft.isTaken(id))
      reject('id-taken', `The id "${id}" is already taken.`, [id]);
  }
  const fileName =
    given.file === undefined ? freeFileName(draft.state, name) : checkedFileName(given.file);
  const owner = catalog.byFile(fileName);
  if (owner) {
    reject(
      'id-taken',
      `The explorable "${owner.definition.name}" keeps its text in "explorables/${fileName}" already.`,
      [owner.definition.id],
    );
  }
  const text = checkedText(command.text);
  const definition: ExplorableDefinition = compact({
    id,
    name,
    description: checkedDescription(given.description),
    file: fileName,
    scriptLibraries: checkedLibraries(draft.state, file, given.scriptLibraries),
    parameters: checkedParameters(given.parameters),
    api: VA_API,
    hash: explorableTextHash(text),
  });
  const explorables = file.explorables ?? [];
  if (explorables.length >= MAX_EXPLORABLES_PER_PACKAGE) {
    reject(
      'explorable-too-large',
      `A package defines at most ${MAX_EXPLORABLES_PER_PACKAGE} explorables.`,
      [file.id],
    );
  }
  setLists(draft, file, { explorables: [...explorables, definition] });
  putText(draft, { id, text });
  draft.created.push(id);
  return `Add the explorable "${name}"`;
}

export function writeExplorable(draft: Draft, command: WriteExplorableCommand): string {
  const { definition, file } = ownExplorable(draft, command.id);
  const text = checkedText(command.text);
  const hash = explorableTextHash(text);
  const kept = explorableTextOf(draft.state, definition.id);
  if (hash === definition.hash && kept?.text === text && kept.read === undefined) {
    return `Write the explorable "${definition.name}"`;
  }
  if (hash !== definition.hash) replaceDefinition(draft, file, { ...definition, hash });
  putText(draft, { id: definition.id, text });
  return `Write the explorable "${definition.name}"`;
}

export function recordExplorableFile(draft: Draft, command: RecordExplorableFileCommand): string {
  programOnly(draft, 'record-explorable-file');
  const { definition, file } = ownExplorable(draft, command.id);
  if (typeof command.text !== 'string') invalid("An explorable's text is text.");
  // The hash is always the text's own, worked out here: no sender names one.
  const hash = explorableTextHash(command.text);
  if (hash !== definition.hash) replaceDefinition(draft, file, { ...definition, hash });
  const kept = explorableTextOf(draft.state, definition.id);
  // A text past its cap is not kept: the explorable is warned about and never runs.
  if (utf8Length(command.text) > MAX_EXPLORABLE_BYTES) {
    if (kept) {
      draft.apply({ op: 'remove', collection: { name: 'explorableTexts' }, key: definition.id });
    }
  } else if (kept?.text !== command.text || kept.read !== true) {
    putText(draft, { id: definition.id, text: command.text, read: true });
  }
  return `The file of "${definition.name}" changed`;
}

/** Refuses a command only the local program runs, for what it read or fetched, from anywhere else. */
function programOnly(draft: Draft, type: string): void {
  if (!draft.program) {
    reject(
      'program-only',
      `Only Visual Anything itself runs ${type}, for a file it read or fetched and checked.`,
    );
  }
}

export function updateExplorable(draft: Draft, command: UpdateExplorableCommand): string {
  const { definition, file } = ownExplorable(draft, command.id);
  const changes = command.changes as Record<string, unknown> | null | undefined;
  if (typeof changes !== 'object' || changes === null || Array.isArray(changes)) {
    reject('invalid-command', 'update-explorable needs the changes to make.');
  }
  for (const key of Object.keys(changes)) {
    if (!['name', 'description', 'scriptLibraries', 'parameters'].includes(key)) {
      reject(
        'invalid-command',
        `update-explorable changes an explorable's name, description, script libraries and parameters, not "${key}".`,
      );
    }
  }
  const next: ExplorableDefinition = { ...definition };
  if (changes.name !== undefined) next.name = checkedName(changes.name);
  if (changes.description === null) delete next.description;
  else if (changes.description !== undefined) {
    next.description = checkedDescription(changes.description);
  }
  if (changes.scriptLibraries === null) delete next.scriptLibraries;
  else if (changes.scriptLibraries !== undefined) {
    const libraries = checkedLibraries(draft.state, file, changes.scriptLibraries);
    if (libraries === undefined) delete next.scriptLibraries;
    else next.scriptLibraries = libraries;
  }
  if (changes.parameters === null) delete next.parameters;
  else if (changes.parameters !== undefined) {
    const parameters = checkedParameters(changes.parameters);
    if (parameters === undefined) delete next.parameters;
    else next.parameters = parameters;
  }
  if (JSON.stringify(next) !== JSON.stringify(definition)) replaceDefinition(draft, file, next);
  const keys = Object.keys(changes).filter((key) => changes[key] !== undefined);
  if (keys.length === 1 && keys[0] === 'name') {
    return `Rename the explorable "${definition.name}" to "${next.name}"`;
  }
  if (keys.length === 1 && keys[0] === 'parameters') {
    return `Change the parameters of the explorable "${next.name}"`;
  }
  if (keys.length === 1 && keys[0] === 'scriptLibraries') {
    return `Change the script libraries of the explorable "${next.name}"`;
  }
  return `Change the explorable "${next.name}"`;
}

export function removeExplorable(draft: Draft, command: RemoveExplorableCommand): string {
  const { definition, file } = ownExplorable(draft, command.id);
  const users = explorableUsers(draft.state, definition.id);
  if (users.length > 0) {
    reject(
      'in-use',
      `The explorable "${definition.name}" cannot be removed: ${count(users.length, 'component, element or shape', 'components, elements or shapes')} show it.`,
      users,
    );
  }
  setLists(draft, file, {
    explorables: (file.explorables ?? []).filter((each) => each.id !== definition.id),
  });
  if (explorableTextOf(draft.state, definition.id)) {
    draft.apply({ op: 'remove', collection: { name: 'explorableTexts' }, key: definition.id });
  }
  return `Remove the explorable "${definition.name}"`;
}

/**
 * Removes the texts of explorables no package defines any more, once a command has run: a package
 * that goes takes its explorables' texts with it, in the same action, so undo gives them back (A10's
 * review). The files stay on disk, as a text that goes with its explorable always does.
 */
export function dropTextsWithoutDefinitions(draft: Draft, before: ProjectSnapshot): void {
  if (draft.state.packages === before.packages) return;
  const texts = draft.state.explorableTexts ?? [];
  if (texts.length === 0) return;
  const catalog = explorablesIn(draft.state);
  for (const text of texts) {
    if (catalog.explorable(text.id)) continue;
    draft.apply({ op: 'remove', collection: { name: 'explorableTexts' }, key: text.id });
  }
}

/** The explorable a command names, in one of the project's own packages. */
function ownExplorable(
  draft: Draft,
  id: unknown,
): { definition: ExplorableDefinition; file: PackageFile } {
  const defined = isId(id) ? explorablesIn(draft.state).explorable(id) : undefined;
  if (!defined) {
    reject('unknown-explorable', `No package in use defines the explorable "${String(id)}".`, [
      String(id),
    ]);
  }
  return { definition: defined.definition, file: draft.ownPackage(defined.package) };
}

function replaceDefinition(draft: Draft, file: PackageFile, next: ExplorableDefinition): void {
  const current = draft.state.packages.find((each) => each.id === file.id) ?? file;
  setLists(draft, current, {
    explorables: (current.explorables ?? []).map((each) => (each.id === next.id ? next : each)),
  });
}

/** Sets a package's explorables or script libraries, a list left empty going away. */
function setLists(
  draft: Draft,
  file: PackageFile,
  lists: { explorables?: ExplorableDefinition[]; scriptLibraries?: ScriptLibraryDefinition[] },
): void {
  const current = draft.state.packages.find((each) => each.id === file.id) ?? file;
  const properties: Partial<PackageFile> = { ...current };
  delete properties.components;
  delete properties.relationTypes;
  delete properties.images;
  for (const key of ['explorables', 'scriptLibraries'] as const) {
    const list = lists[key];
    if (list === undefined) continue;
    if (list.length === 0) delete properties[key];
    else (properties as Record<string, unknown>)[key] = list;
  }
  draft.apply({
    op: 'set-package',
    package: file.id,
    properties: properties as PackageProperties,
  });
}

function putText(draft: Draft, text: ExplorableText): void {
  const collection = { name: 'explorableTexts' } as const;
  if (explorableTextOf(draft.state, text.id)) {
    draft.apply({ op: 'replace', collection, item: text });
  } else {
    draft.apply({
      op: 'insert',
      collection,
      index: draft.state.explorableTexts?.length ?? 0,
      item: text,
    });
  }
}

function checkedText(value: unknown): string {
  if (typeof value !== 'string') invalid("An explorable's text is text.");
  const bytes = utf8Length(value);
  if (bytes > MAX_EXPLORABLE_BYTES) {
    reject(
      'explorable-too-large',
      `An explorable's text is at most ${MAX_EXPLORABLE_BYTES} bytes; this one is ${bytes}.`,
    );
  }
  return value;
}

function checkedName(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 200) {
    invalid("An explorable's name is text of 1 to 200 characters, not empty.");
  }
  return value;
}

function checkedDescription(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 1000) {
    invalid("An explorable's description is text of at most 1,000 characters.");
  }
  return value;
}

function checkedFileName(value: unknown): string {
  if (typeof value !== 'string' || !FILE.test(value)) {
    invalid(
      "An explorable's file is named in small letters, digits and hyphens, ending in .html, such as quadratic.html.",
    );
  }
  return value;
}

/** A file name made from an explorable's name that no explorable of the project keeps yet. */
function freeFileName(state: ProjectSnapshot, name: string): string {
  const catalog = explorablesIn(state);
  const base =
    name
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50)
      .replace(/-+$/, '') || 'explorable';
  for (let n = 1; ; n += 1) {
    const file = `${n === 1 ? base : `${base}-${n}`}.html`;
    if (!catalog.byFile(file)) return file;
  }
}

function checkedLibraries(
  state: ProjectSnapshot,
  file: PackageFile,
  value: unknown,
): Id[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_LIBRARIES_PER_EXPLORABLE) {
    invalid(
      `An explorable uses a list of at most ${MAX_LIBRARIES_PER_EXPLORABLE} script libraries.`,
    );
  }
  if (value.length === 0) return undefined;
  const seen = new Set<Id>();
  const catalog = explorablesIn(state);
  for (const id of value as unknown[]) {
    if (!isId(id)) invalid(`"${String(id)}" is not a valid id.`);
    if (seen.has(id)) invalid(`An explorable uses the script library "${id}" once.`);
    seen.add(id);
    const library = catalog.scriptLibrary(id);
    if (!library || library.package !== file.id) {
      reject(
        'unknown-script-library',
        `The package "${file.name}" defines no script library "${id}"; an explorable uses those of its own package.`,
        [id],
      );
    }
  }
  return [...seen];
}

/** An explorable's parameters, checked: unique names, ranges that hold their defaults. */
export function checkedParameters(value: unknown): ExplorableParameter[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_PARAMETERS) {
    invalid(`An explorable declares a list of at most ${MAX_PARAMETERS} parameters.`);
  }
  if (value.length === 0) return undefined;
  const names = new Set<string>();
  return value.map((given: unknown): ExplorableParameter => {
    if (typeof given !== 'object' || given === null || Array.isArray(given)) {
      invalid('A parameter is an object with its name, kind and default.');
    }
    const each = given as Record<string, unknown>;
    const { name, kind, label } = each;
    if (typeof name !== 'string' || !PARAMETER_NAME.test(name)) {
      invalid(
        `${JSON.stringify(name) ?? 'undefined'} is not a parameter's name: a letter or _, then letters, digits or _.`,
      );
    }
    if (names.has(name)) invalid(`Two parameters are named "${name}".`);
    names.add(name);
    if (label !== undefined && (typeof label !== 'string' || label === '' || label.length > 200)) {
      invalid(`The label of "${name}" is text of 1 to 200 characters.`);
    }
    const keys = (allowed: string[]) => {
      for (const key of Object.keys(each)) {
        if (!['name', 'kind', 'label', ...allowed].includes(key)) {
          invalid(`A ${String(kind)} parameter holds no "${key}".`);
        }
      }
    };
    const base = { name, ...(label === undefined ? {} : { label: label }) };
    switch (kind) {
      case 'number':
      case 'integer': {
        keys(['min', 'max', 'default']);
        const whole = kind === 'integer';
        const bound = (key: 'min' | 'max' | 'default') => {
          const number = each[key];
          if (
            typeof number !== 'number' ||
            !Number.isFinite(number) ||
            Math.abs(number) > PARAMETER_BOUND ||
            (whole && !Number.isInteger(number))
          ) {
            invalid(
              `The ${key} of "${name}" is ${whole ? 'a whole number' : 'a number'} within ±10^12.`,
            );
          }
          return number;
        };
        const min = bound('min');
        const max = bound('max');
        const fallback = bound('default');
        if (min > max) invalid(`The least value of "${name}" is above its greatest.`);
        if (fallback < min || fallback > max) {
          invalid(`The default of "${name}" lies outside ${min} to ${max}.`);
        }
        return { ...base, kind, min, max, default: fallback };
      }
      case 'boolean':
        keys(['default']);
        if (typeof each.default !== 'boolean')
          invalid(`The default of "${name}" is true or false.`);
        return { ...base, kind, default: each.default };
      case 'choice': {
        keys(['choices', 'default']);
        const { choices } = each;
        if (
          !Array.isArray(choices) ||
          choices.length === 0 ||
          choices.length > 50 ||
          !choices.every(
            (choice) => typeof choice === 'string' && choice.length <= MAX_PARAMETER_TEXT,
          ) ||
          new Set(choices).size !== choices.length
        ) {
          invalid(
            `"${name}" lists 1 to 50 different choices, each at most ${MAX_PARAMETER_TEXT} characters.`,
          );
        }
        if (typeof each.default !== 'string' || !(choices as string[]).includes(each.default)) {
          invalid(`The default of "${name}" is one of its choices.`);
        }
        return { ...base, kind, choices: [...(choices as string[])], default: each.default };
      }
      default:
        return invalid(`A parameter's kind is "number", "integer", "boolean" or "choice".`);
    }
  });
}

function invalid(message: string): never {
  return reject('invalid-explorable', message);
}

// ——— Script libraries ———

export function defineScriptLibrary(draft: Draft, command: DefineScriptLibraryCommand): string {
  programOnly(draft, 'define-script-library');
  const file = draft.ownPackage(command.package);
  const library = checkedLibrary(command.library);
  if (!library.id.startsWith(`${file.id}.`)) {
    reject(
      'id-outside-package',
      `The script library "${library.id}" must start with "${file.id}.", the id of its package.`,
      [library.id],
    );
  }
  const catalog = explorablesIn(draft.state);
  const defined = catalog.scriptLibrary(library.id);
  if (defined && defined.package !== file.id) {
    reject('defined-twice', `The package "${defined.package}" already defines "${library.id}".`, [
      library.id,
    ]);
  }
  if (!defined && (catalog.explorables.has(library.id) || draft.isTaken(library.id))) {
    reject('id-taken', `The id "${library.id}" is already taken.`, [library.id]);
  }
  const libraries = file.scriptLibraries ?? [];
  const next = defined
    ? libraries.map((each) => (each.id === library.id ? library : each))
    : [...libraries, library];
  if (next.length > MAX_LIBRARIES_PER_PACKAGE) {
    reject(
      'script-library-too-large',
      `A package defines at most ${MAX_LIBRARIES_PER_PACKAGE} script libraries.`,
      [file.id],
    );
  }
  // Files are named by their hashes, so a file two definitions name is kept once.
  const bytes = new Map<string, number>();
  for (const each of draft.state.packages) {
    for (const kept of each.id === file.id ? next : (each.scriptLibraries ?? [])) {
      bytes.set(kept.hash, kept.bytes);
    }
  }
  const total = [...bytes.values()].reduce((sum, each) => sum + each, 0);
  if (total > MAX_SCRIPT_LIBRARIES_BYTES) {
    reject(
      'script-library-too-large',
      `The project's script libraries would take ${total} bytes, past ${MAX_SCRIPT_LIBRARIES_BYTES}.`,
      [library.id],
    );
  }
  setLists(draft, file, { scriptLibraries: next });
  if (!defined) draft.created.push(library.id);
  return defined
    ? `Change the script library "${library.npm}" to ${library.version}`
    : `Add the script library "${library.npm}" ${library.version}`;
}

export function removeScriptLibrary(draft: Draft, command: RemoveScriptLibraryCommand): string {
  const defined = isId(command.id)
    ? explorablesIn(draft.state).scriptLibrary(command.id)
    : undefined;
  if (!defined) {
    reject(
      'unknown-script-library',
      `No package in use defines the script library "${String(command.id)}".`,
      [String(command.id)],
    );
  }
  const file = draft.ownPackage(defined.package);
  const users = (file.explorables ?? [])
    .filter((each) => each.scriptLibraries?.includes(command.id))
    .map((each) => each.id);
  if (users.length > 0) {
    reject(
      'in-use',
      `The script library "${defined.definition.npm}" cannot be removed: ${count(users.length, 'explorable uses', 'explorables use')} it.`,
      users,
    );
  }
  setLists(draft, file, {
    scriptLibraries: (file.scriptLibraries ?? []).filter((each) => each.id !== command.id),
  });
  return `Remove the script library "${defined.definition.npm}"`;
}

/** A script library's definition as the local program sends it, checked field by field. */
function checkedLibrary(given: unknown): ScriptLibraryDefinition {
  if (typeof given !== 'object' || given === null || Array.isArray(given)) {
    reject('invalid-command', 'define-script-library needs the script library to define.');
  }
  const value = given as Record<string, unknown>;
  const keys = [
    'id',
    'npm',
    'version',
    'tarball',
    'integrity',
    'path',
    'license',
    'global',
    'hash',
    'bytes',
  ];
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) invalidLibrary(`A script library's definition holds no "${key}".`);
  }
  const { id, npm, version, tarball, integrity, path, license, global, hash, bytes } = value;
  if (!isId(id)) invalidLibrary(`${JSON.stringify(id) ?? 'undefined'} is not a valid id.`);
  if (typeof npm !== 'string' || npm.length > 214 || !NPM_NAME.test(npm)) {
    invalidLibrary('A script library is an npm package, named as the registry names one.');
  }
  if (typeof version !== 'string' || version.length > 100 || !NPM_VERSION.test(version)) {
    invalidLibrary('A script library is kept at one exact version.');
  }
  if (
    typeof tarball !== 'string' ||
    tarball.length > 1000 ||
    !tarball.startsWith('https://registry.npmjs.org/')
  ) {
    invalidLibrary("A script library's tarball is an address of https://registry.npmjs.org/.");
  }
  if (typeof integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity)) {
    invalidLibrary("A script library's integrity is the registry's sha512- and its base64.");
  }
  if (typeof path !== 'string' || path === '' || path.length > 500) {
    invalidLibrary("A script library's path is the file it keeps, inside its package.");
  }
  if (license !== undefined && !isLicenseId(license)) {
    invalidLibrary(`${JSON.stringify(license)} is not a license written as an SPDX identifier.`);
  }
  if (typeof global !== 'string' || !LIBRARY_GLOBAL.test(global)) {
    invalidLibrary('A script library sets a global named as JavaScript names one.');
  }
  if (typeof hash !== 'string' || !HASH.test(hash)) {
    invalidLibrary("A script library's file is named by its SHA-256, in lowercase hexadecimal.");
  }
  if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes < 1) {
    invalidLibrary("A script library's size is a whole number of bytes.");
  }
  if (bytes > MAX_SCRIPT_LIBRARY_BYTES) {
    reject(
      'script-library-too-large',
      `The script library's file is ${bytes} bytes, past ${MAX_SCRIPT_LIBRARY_BYTES}.`,
    );
  }
  return compact({ id, npm, version, tarball, integrity, path, license, global, hash, bytes });
}

function invalidLibrary(message: string): never {
  return reject('invalid-script-library', message);
}

// ——— A package shared between projects (ADR 0051) ———

/**
 * The script libraries of a package that `add-package` or `replace-package` carries, each checked as
 * `define-script-library` checks one, within a package's 64 and the project's 128 MiB, counting each
 * file once by its hash (A10's review). The files stay beside the project they came from: one this
 * project's folder lacks is reported as missing, as a solid's is, and its explorables do not run.
 */
export function packageScriptLibraries(
  state: ProjectSnapshot,
  packageId: Id,
  given: unknown,
): ScriptLibraryDefinition[] | undefined {
  if (given === undefined) return undefined;
  if (!Array.isArray(given)) reject('invalid-command', 'A package’s script libraries are a list.');
  const libraries = (given as unknown[]).map((each) => checkedLibrary(each));
  if (libraries.length > MAX_LIBRARIES_PER_PACKAGE) {
    reject(
      'script-library-too-large',
      `A package defines at most ${MAX_LIBRARIES_PER_PACKAGE} script libraries.`,
      [packageId],
    );
  }
  const bytes = new Map<string, number>();
  for (const each of state.packages) {
    if (each.id === packageId) continue;
    for (const kept of each.scriptLibraries ?? []) bytes.set(kept.hash, kept.bytes);
  }
  for (const each of libraries) bytes.set(each.hash, each.bytes);
  const total = [...bytes.values()].reduce((sum, each) => sum + each, 0);
  if (total > MAX_SCRIPT_LIBRARIES_BYTES) {
    reject(
      'script-library-too-large',
      `The project's script libraries would take ${total} bytes, past ${MAX_SCRIPT_LIBRARIES_BYTES}.`,
      [packageId],
    );
  }
  return libraries.length === 0 ? undefined : libraries;
}

/**
 * The explorables of a package that `add-package` or `replace-package` carries, each checked as
 * `define-explorable` checks one (A10's review): its name, description, file, parameters, the `va`
 * API it was written for, and script libraries of the package's own. The texts are not in a package
 * file; they live in `explorables/` beside the project. So an explorable this project holds a text
 * for keeps that text, its file and the text's hash, and one it holds none for keeps the hash the
 * file gives and shows its card, "its file is missing", until the program reads its file; it never
 * runs before the person approves what was read.
 */
export function packageExplorables(
  state: ProjectSnapshot,
  packageId: Id,
  packageName: string,
  given: unknown,
  libraries: readonly ScriptLibraryDefinition[],
): ExplorableDefinition[] | undefined {
  if (given === undefined) return undefined;
  if (!Array.isArray(given)) reject('invalid-command', 'A package’s explorables are a list.');
  if (given.length > MAX_EXPLORABLES_PER_PACKAGE) {
    reject(
      'explorable-too-large',
      `A package defines at most ${MAX_EXPLORABLES_PER_PACKAGE} explorables.`,
      [packageId],
    );
  }
  const catalog = explorablesIn(state);
  const ownLibraries = new Set(libraries.map((each) => each.id));
  const files = new Map<string, Id>();
  const explorables = (given as unknown[]).map((each): ExplorableDefinition => {
    if (typeof each !== 'object' || each === null || Array.isArray(each)) {
      invalid("An explorable's definition is an object.");
    }
    const value = each as Record<string, unknown>;
    const keys = ['id', 'name', 'description', 'file', 'scriptLibraries', 'parameters', 'api'];
    for (const key of Object.keys(value)) {
      if (![...keys, 'hash'].includes(key))
        invalid(`An explorable's definition holds no "${key}".`);
    }
    if (!isId(value.id)) reject('invalid-id', `${JSON.stringify(value.id)} is not a valid id.`);
    const id = value.id;
    const name = checkedName(value.name);
    if (value.api !== VA_API) {
      invalid(
        `The explorable "${name}" was written for version ${JSON.stringify(value.api)} of the va API; this Visual Anything runs version ${VA_API}.`,
      );
    }
    if (typeof value.hash !== 'string' || !HASH.test(value.hash)) {
      invalid(`The hash of "${name}" is a SHA-256 in lowercase hexadecimal.`);
    }
    // An explorable this project defines already keeps its file, where its text is.
    const current = catalog.explorable(id);
    const file =
      current?.package === packageId ? current.definition.file : checkedFileName(value.file);
    const elsewhere = catalog.byFile(file);
    if (elsewhere !== undefined && elsewhere.package !== packageId) {
      reject(
        'id-taken',
        `The explorable "${elsewhere.definition.name}" keeps its text in "explorables/${file}" already.`,
        [elsewhere.definition.id],
      );
    }
    const twice = files.get(file);
    if (twice !== undefined) {
      reject(
        'id-taken',
        `The package "${packageName}" keeps two explorables in "explorables/${file}": "${twice}" and "${id}".`,
        [twice, id],
      );
    }
    files.set(file, id);
    const used = value.scriptLibraries;
    if (used !== undefined) {
      if (!Array.isArray(used) || used.length > MAX_LIBRARIES_PER_EXPLORABLE) {
        invalid(
          `An explorable uses a list of at most ${MAX_LIBRARIES_PER_EXPLORABLE} script libraries.`,
        );
      }
      for (const library of used as unknown[]) {
        if (!isId(library) || !ownLibraries.has(library)) {
          reject(
            'unknown-script-library',
            `The explorable "${name}" uses the script library ${JSON.stringify(library)}, which the package "${packageName}" does not define.`,
            [id],
          );
        }
      }
      if (new Set(used).size !== used.length) {
        invalid(`The explorable "${name}" uses a script library twice.`);
      }
    }
    const held = explorableTextOf(state, id);
    return compact({
      id,
      name,
      description: checkedDescription(value.description),
      file,
      scriptLibraries: used === undefined || used.length === 0 ? undefined : [...(used as Id[])],
      parameters: checkedParameters(value.parameters),
      api: VA_API,
      // The text beside the project is what runs: its hash wins over the one the file gives.
      hash: held === undefined ? value.hash : explorableTextHash(held.text),
    });
  });
  return explorables.length === 0 ? undefined : explorables;
}

/**
 * Refuses a `replace-package` that drops an explorable something in the project still shows, saying
 * what shows it, as one that drops a solid is refused (A10's review). Its text goes with it.
 */
export function checkRemovedExplorables(
  draft: Draft,
  current: PackageFile,
  next: PackageFile,
): void {
  const kept = new Set((next.explorables ?? []).map((each) => each.id));
  for (const removed of current.explorables ?? []) {
    if (kept.has(removed.id)) continue;
    const users = explorableUsers(draft.state, removed.id);
    if (users.length > 0) {
      reject(
        'in-use',
        `The update of "${current.name}" removes the explorable "${removed.name}", which ${count(users.length, 'component, element or shape shows', 'components, elements or shapes show')}; change what shows it first.`,
        users,
      );
    }
  }
}

// ——— What shows an explorable ———

/** An explorable shape's own parts as a command gives them, checked; existence is checked after. */
export function checkedExplorableShape(
  shape: Partial<ExplorableShape> & { kind: 'explorable' },
  id: Id,
  viewName: string,
  number: (value: unknown, what: string, positive?: boolean) => number,
): ExplorableShape {
  const loose = shape as Record<string, unknown>;
  if (loose.fill !== undefined || loose.stroke !== undefined || loose.media !== undefined) {
    reject(
      'invalid-appearance',
      `An explorable shape has no colors or file of its own; one in "${viewName}" shows its explorable.`,
    );
  }
  if (!isId(shape.explorable)) {
    reject('invalid-command', 'An explorable shape needs the explorable it shows, by its id.');
  }
  if (shape.element !== undefined && !isId(shape.element)) {
    reject('invalid-command', 'An explorable shape reads an element named by its id.');
  }
  const name = shape.name === undefined || shape.name === '' ? undefined : shape.name;
  if (name !== undefined && (typeof name !== 'string' || name.length > 200)) {
    reject('invalid-command', "An explorable shape's name is text of at most 200 characters.");
  }
  return compact({
    kind: 'explorable' as const,
    id,
    x: number(shape.x, 'x'),
    y: number(shape.y, 'y'),
    width: number(shape.width, 'A width', true),
    height: number(shape.height, 'A height', true),
    explorable: shape.explorable,
    element: shape.element,
    name,
  });
}

/**
 * Checks what a command did to what shows explorables, once it is done, whichever commands it ran:
 * every explorable an appearance or an explorable shape comes to show must be one a package in use
 * defines, and every element a shape comes to read one the model holds; and no explorable that
 * something still shows, and no script library an explorable still uses, may go, with its package
 * or on its own. Tour steps are not checked here: a step whose explorable goes becomes a broken step.
 */
export function checkExplorableReferences(
  before: ProjectSnapshot,
  after: ProjectSnapshot,
  operations: readonly Operation[],
): void {
  if (operations.length === 0) return;
  const catalog = explorablesIn(after);
  const elements = new Set<Id>();
  const components = new Set<Id>();
  const shapes: FreeShape[] = [];
  let project = false;
  for (const operation of operations) {
    if (operation.op === 'set-world') elements.add(operation.world.id);
    if (operation.op === 'set-project') project = true;
    if (operation.op === 'insert' || operation.op === 'replace' || operation.op === 'replace-all') {
      const items = operation.op === 'replace-all' ? operation.items : [operation.item];
      const name = operation.collection.name;
      if (name === 'elements') for (const item of items) elements.add((item as { id: Id }).id);
      if (name === 'components') for (const item of items) components.add((item as { id: Id }).id);
      if (name === 'freeShapes') shapes.push(...(items as FreeShape[]));
    }
  }
  const shown = (
    appearance: Appearance | undefined,
    was: Appearance | undefined,
    owner: string,
    subject: Id,
  ) => {
    const id = explorableIdOf(appearance);
    if (id === undefined || id === explorableIdOf(was) || catalog.explorable(id)) return;
    reject(
      'unknown-explorable',
      `${owner} cannot show the explorable "${id}": no package in use defines it.`,
      [subject],
    );
  };
  if (elements.size > 0) {
    const now = modelIndexOf(after);
    const then = modelIndexOf(before);
    for (const id of elements) {
      const element = now.element(id);
      if (element)
        shown(
          element.appearance,
          then.element(id)?.appearance,
          `The element "${element.name}"`,
          id,
        );
    }
  }
  if (components.size > 0) {
    const now = definitionsIn(after).components;
    const then = definitionsIn(before).components;
    for (const id of components) {
      const component = now.get(id)?.definition;
      if (component) {
        shown(
          component.appearance,
          then.get(id)?.definition.appearance,
          `The component "${component.name}"`,
          id,
        );
      }
    }
  }
  if (project) {
    const was = before.project.appearances?.components ?? {};
    for (const [id, appearance] of Object.entries(after.project.appearances?.components ?? {})) {
      shown(
        appearance,
        Object.hasOwn(was, id) ? was[id] : undefined,
        `The project appearance of "${id}"`,
        id,
      );
    }
  }
  if (shapes.length > 0) {
    const index = modelIndexOf(after);
    const previous = new Map<Id, FreeShape>();
    for (const view of before.views)
      for (const shape of view.freeShapes) previous.set(shape.id, shape);
    for (const shape of shapes) {
      if (shape.kind !== 'explorable') continue;
      const was = previous.get(shape.id);
      const old = was?.kind === 'explorable' ? was : undefined;
      if (shape.explorable !== old?.explorable && !catalog.explorable(shape.explorable)) {
        reject(
          'unknown-explorable',
          `An explorable shape cannot show "${shape.explorable}": no package in use defines it.`,
          [shape.id],
        );
      }
      if (
        shape.element !== undefined &&
        shape.element !== old?.element &&
        !index.element(shape.element)
      ) {
        reject(
          'unknown-element',
          `An explorable shape cannot read "${shape.element}": the model holds no such element.`,
          [shape.id],
        );
      }
    }
  }

  if (before.packages === after.packages) return;
  const then = explorablesIn(before);
  for (const id of then.explorables.keys()) {
    if (catalog.explorable(id)) continue;
    const users = explorableUsers(after, id);
    if (users.length > 0) {
      reject(
        'in-use',
        `The explorable "${then.explorable(id)?.definition.name ?? id}" cannot go: ${count(users.length, 'component, element or shape', 'components, elements or shapes')} show it.`,
        users,
      );
    }
  }
  for (const id of then.scriptLibraries.keys()) {
    if (catalog.scriptLibrary(id)) continue;
    const users = [...catalog.explorables.values()]
      .filter((each) => each.definition.scriptLibraries?.includes(id))
      .map((each) => each.definition.id);
    if (users.length > 0) {
      reject(
        'in-use',
        `The script library "${id}" cannot go: ${count(users.length, 'explorable uses', 'explorables use')} it.`,
        users,
      );
    }
  }
}

/** A tour step's explorable as a command gives it, checked for its form; what it names is checked by the step's problems. */
export function checkedTourExplorable(value: unknown, where: string): TourExplorable | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    reject(
      'invalid-command',
      `${where} shows an explorable: an object with its id and parameters.`,
    );
  }
  const { id, parameters, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length > 0) {
    reject('invalid-command', `${where}'s explorable holds its id and parameters, nothing else.`);
  }
  if (!isId(id)) reject('invalid-id', `"${String(id)}" is not a valid id.`);
  if (parameters === undefined) return { id };
  if (typeof parameters !== 'object' || parameters === null || Array.isArray(parameters)) {
    reject('invalid-command', `${where} sets its explorable's parameters by name.`);
  }
  const names = Object.keys(parameters);
  if (names.length > MAX_PARAMETERS) {
    reject('invalid-command', `${where} sets at most ${MAX_PARAMETERS} parameters.`);
  }
  const set: Record<string, JsonValue> = {};
  for (const name of names) {
    const each = (parameters as Record<string, unknown>)[name];
    if (!PARAMETER_NAME.test(name) || !isParameterValue(each)) {
      reject(
        'invalid-parameter',
        `${where} sets "${name}" to ${JSON.stringify(each) ?? 'nothing'}: a parameter takes a number, true or false, or short text.`,
      );
    }
    Object.defineProperty(set, name, {
      value: each,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return names.length === 0 ? { id } : { id, parameters: set };
}
