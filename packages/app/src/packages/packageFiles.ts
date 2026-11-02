/**
 * Packages added or updated from files on this computer (ADR 0089's M14.2 clarification): which
 * package files a chosen folder holds, and the commands that add a package a file holds to the
 * project, or update the project's own package of the same id from it. The local program read the
 * file and checked it against the schema; the core checks the commands as it checks any, and cleans
 * the images again. Nothing a file holds runs: its code waits for the person's approval, by its hash.
 */
import {
  MAX_PACKAGE_FILE_TEXT,
  builtinPackage,
  packageCodeOf,
  type BatchCommand,
  type Command,
  type ProjectSnapshot,
  type SetPackageCodeCommand,
} from '@visual-anything/core';
import type { PackageFile } from '@visual-anything/schema';
import type { ChosenFile } from '../shell/definitions/sharedPackages';

/** The largest package file read, in bytes: no larger text reaches the local program. */
export const MAX_PACKAGE_FILE_BYTES = MAX_PACKAGE_FILE_TEXT;

/** The most package files a folder offers. */
export const MAX_FOLDER_PACKAGES = 32;

/** A package file's extension. */
export const PACKAGE_EXTENSION = '.vapackage';

/**
 * The package files of a folder the person chose, as a folder picker lists its files: those at its
 * top and in its `packages/` folder, so that a folder of packages and a project's folder both offer
 * theirs, sorted by path, at most {@link MAX_FOLDER_PACKAGES}. Every other file is passed over, unread.
 */
export function packageFilesIn(files: readonly ChosenFile[]): ChosenFile[] {
  const found = files.filter((each) => {
    const parts = each.path.split('/').filter(Boolean);
    if (!parts.at(-1)?.toLowerCase().endsWith(PACKAGE_EXTENSION)) return false;
    // The folder chosen is the first part: its files, and those of its packages/ folder.
    return parts.length === 2 || (parts.length === 3 && parts[1]?.toLowerCase() === 'packages');
  });
  return found
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .slice(0, MAX_FOLDER_PACKAGES);
}

/** What a package file does to the project: adds a package, or updates one of its own. */
export type PackagePlan =
  | {
      ok: true;
      kind: 'add';
      file: PackageFile;
      command: Command;
    }
  | {
      ok: true;
      kind: 'update';
      file: PackageFile;
      /** The project's own package it updates. */
      current: PackageFile;
      command: Command;
      /** How its code changes: approved by another hash from now on, or not. */
      code: 'same' | 'changed' | 'added' | 'removed' | 'none';
    }
  /** What a file holds that cannot come in this way, in English. */
  | { ok: false; message: string };

/** The keys `add-package` and `replace-package` take of a package file. */
const DEFINITION_KEYS = [
  'id',
  'name',
  'description',
  'version',
  'license',
  'attribution',
  'components',
  'relationTypes',
  'images',
] as const satisfies readonly (keyof PackageFile)[];

/**
 * The commands a package file sends: `add-package`, or `replace-package` for a package the project
 * has of its own with the same id, then `set-package-code` with its code, capabilities and what the
 * code adds, as one action. A file with solids, crosswalks or conflicts from a merge cannot come this
 * way: solids need their files beside the project, crosswalks have no command yet, and conflicts are
 * resolved where the file was merged.
 */
export function packagePlanOf(project: ProjectSnapshot, file: PackageFile): PackagePlan {
  const name = JSON.stringify(file.name);
  if (file.solids !== undefined) {
    return {
      ok: false,
      message: `The package ${name} holds solids, whose files a package file does not carry: add it from its project’s folder instead.`,
    };
  }
  if (file.crosswalks !== undefined) {
    return {
      ok: false,
      message: `The package ${name} holds crosswalks, which cannot be added from a file yet.`,
    };
  }
  if (file.conflicts !== undefined) {
    return {
      ok: false,
      message: `The package ${name} holds conflicts from a merge: resolve them in its own project first.`,
    };
  }
  const definitions = Object.fromEntries(
    DEFINITION_KEYS.filter((key) => file[key] !== undefined).map((key) => [key, file[key]]),
  ) as unknown as PackageFile;
  const current =
    builtinPackage(file.id) === undefined
      ? project.packages.find((each) => each.id === file.id)
      : undefined;
  if (current === undefined) {
    const commands: Command[] = [{ type: 'add-package', package: definitions }];
    if (file.code !== undefined) commands.push(codeCommand(file));
    return {
      ok: true,
      kind: 'add',
      file,
      command: oneAction(commands, `Add the package ${name}`),
    };
  }
  // replace-package keeps none of the code, so the code is set again even when it is the same.
  const commands: Command[] = [{ type: 'replace-package', package: definitions }];
  if (file.code !== undefined) commands.push(codeCommand(file));
  else if (current.code !== undefined)
    commands.push({ type: 'set-package-code', package: file.id, code: null });
  return {
    ok: true,
    kind: 'update',
    file,
    current,
    command: oneAction(commands, `Update the package ${JSON.stringify(current.name)}`),
    code: codeChange(current, file),
  };
}

/** Sets the code a file holds, with its capabilities and what it adds, or none of them. */
function codeCommand(file: PackageFile): SetPackageCodeCommand {
  return {
    type: 'set-package-code',
    package: file.id,
    code: file.code ?? null,
    capabilities: file.capabilities ?? null,
    extensions: file.extensions ?? null,
  };
}

function oneAction(commands: Command[], label: string): Command {
  const [only] = commands;
  if (commands.length === 1 && only !== undefined) return only;
  const batch: BatchCommand = { type: 'batch', label, commands };
  return batch;
}

/** How updating a package changes its code, by the hash an approval is given to. */
function codeChange(
  current: PackageFile,
  file: PackageFile,
): 'same' | 'changed' | 'added' | 'removed' | 'none' {
  const before = packageCodeOf(current);
  const after = packageCodeOf(file);
  if (before === undefined) return after === undefined ? 'none' : 'added';
  if (after === undefined) return 'removed';
  return before.hash === after.hash ? 'same' : 'changed';
}
