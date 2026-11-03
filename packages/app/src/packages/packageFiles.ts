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
  type Command,
  type PackageCode,
  type ProjectSnapshot,
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

/** How updating a package changes its code, by the hash an approval is given to. */
export type CodeChange = 'same' | 'changed' | 'added' | 'removed' | 'none';

/**
 * What changed in code whose hash changed, the first of: its text, the capabilities it declares, or
 * what it adds to the app (ADR 0089). Any of them asks for approval again.
 */
export type ChangedPart = 'code' | 'capabilities' | 'extensions';

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
      code: CodeChange;
      /** For code that changed, what in it did: its text, what it may reach, or what it adds. */
      changed?: ChangedPart;
    }
  /** What a file holds that cannot come in this way, in English. */
  | { ok: false; message: string };

/**
 * The command a package file sends, as one action: `add-package`, or `replace-package` for a package
 * the project has of its own with the same id. Each takes the whole file, its code, capabilities, what
 * the code adds and its crosswalks included (ADR 0089's M14.3 clarification). A file with solids or
 * with conflicts from a merge cannot come this way: solids need their files beside the project, and
 * conflicts are resolved where the file was merged.
 */
export function packagePlanOf(project: ProjectSnapshot, file: PackageFile): PackagePlan {
  const name = JSON.stringify(file.name);
  if (file.solids !== undefined) {
    return {
      ok: false,
      message: `The package ${name} holds solids, whose files a package file does not carry: add it from its project’s folder instead.`,
    };
  }
  if (file.conflicts !== undefined) {
    return {
      ok: false,
      message: `The package ${name} holds conflicts from a merge: resolve them in its own project first.`,
    };
  }
  const current =
    builtinPackage(file.id) === undefined
      ? project.packages.find((each) => each.id === file.id)
      : undefined;
  if (current === undefined) {
    return { ok: true, kind: 'add', file, command: { type: 'add-package', package: file } };
  }
  const code = codeChangeOf(current, file);
  const changed = code === 'changed' ? changedPartOf(current, file) : undefined;
  return {
    ok: true,
    kind: 'update',
    file,
    current,
    command: { type: 'replace-package', package: file },
    code,
    ...(changed === undefined ? {} : { changed }),
  };
}

/**
 * How updating the package `current` to `file` changes its code, by the hash an approval is given
 * to: "Packages…" and "Update from another project" (ADR 0051) both say it before anything changes.
 */
export function codeChangeOf(current: PackageFile, file: PackageFile): CodeChange {
  const before = packageCodeOf(current);
  const after = packageCodeOf(file);
  if (before === undefined) return after === undefined ? 'none' : 'added';
  if (after === undefined) return 'removed';
  return before.hash === after.hash ? 'same' : 'changed';
}

/** What changed in code whose hash changed; undefined when its hash did not. */
export function changedPartOf(current: PackageFile, file: PackageFile): ChangedPart | undefined {
  const before = packageCodeOf(current);
  const after = packageCodeOf(file);
  if (before === undefined || after === undefined || before.hash === after.hash) return undefined;
  if (before.text !== after.text) return 'code';
  const declared = (each: PackageCode) => JSON.stringify([...new Set(each.declared)].sort());
  return declared(before) !== declared(after) ? 'capabilities' : 'extensions';
}
