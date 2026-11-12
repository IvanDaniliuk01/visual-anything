/**
 * A project's script libraries' files (ADR 0107): `script-libraries/<hash>.js`, where the hash is
 * the SHA-256 of the file's bytes in lowercase hexadecimal, with the license text of the tarball it
 * came from beside it as `script-libraries/<hash>.license.txt`. As solids' and pictures' files:
 *
 * - a file is written once, atomically, as a regular file inside the project folder, and never
 *   changed; a name whose bytes are already its own is left as it is;
 * - files are read as regular files within 16 MiB, inside the project folder;
 * - opening only looks at each file a package names: it must be a regular file within its cap, or
 *   the explorables that use it show their cards;
 * - nothing here deletes a file on its own: the files no package names are listed for the person,
 *   who removes them.
 */
import { lstatSync } from 'node:fs';
import { lstat, readdir, realpath, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  MAX_SCRIPT_LIBRARY_BYTES,
  explorablesIn,
  type ExplorableFileFinding,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { readRegularFile, type RegularRead } from '../regular-files';
import { hashOf } from '../solids/files';
import { writeFileAtomic, type WriteOptions } from '../writer';

/** The folder of a project that holds its script libraries' files. */
export const SCRIPT_LIBRARIES_FOLDER = 'script-libraries';

/** A script library's file name: its hash and `.js`. */
const FILE_NAME = /^([0-9a-f]{64})\.js$/;
const HASH = /^[0-9a-f]{64}$/;

/** The path of a script library's file in a project folder, by its hash. */
export function scriptLibraryFilePath(folder: string, hash: string): string {
  return join(folder, SCRIPT_LIBRARIES_FOLDER, `${hash}.js`);
}

/** The path of the license text kept beside a script library's file. */
export function scriptLibraryLicensePath(folder: string, hash: string): string {
  return join(folder, SCRIPT_LIBRARIES_FOLDER, `${hash}.license.txt`);
}

/** Reads a script library's file as a regular file within 16 MiB, inside the project folder. */
export function readScriptLibraryFile(folder: string, hash: string): Promise<RegularRead> {
  return readRegularFile(scriptLibraryFilePath(folder, hash), MAX_SCRIPT_LIBRARY_BYTES, {
    inside: folder,
  });
}

/**
 * Writes a script library's file and its license text, once: a file already there whose bytes are
 * its name's is never written again. Atomic, and only as regular files inside the project folder.
 */
export async function writeScriptLibraryFile(
  folder: string,
  hash: string,
  bytes: Uint8Array,
  license: Uint8Array | undefined,
  options: WriteOptions = {},
): Promise<void> {
  const how = { ...options, regularOnly: true, inside: folder };
  if (license !== undefined) {
    await writeFileAtomic(scriptLibraryLicensePath(folder, hash), license, how);
  }
  const there = await readScriptLibraryFile(folder, hash);
  if (there.ok && hashOf(there.bytes) === hash) return;
  await writeFileAtomic(scriptLibraryFilePath(folder, hash), bytes, how);
}

/** The hashes of the script libraries the project's packages define. */
function namedHashes(state: ProjectSnapshot): Set<string> {
  return new Set(
    [...explorablesIn(state).scriptLibraries.values()].map(({ definition }) => definition.hash),
  );
}

/**
 * What opening finds of each file the packages name, by hash, for `explorableFileProblems`: missing,
 * not a regular file, or past 16 MiB. Opening reads none of them.
 */
export function scriptLibraryFindings(
  state: ProjectSnapshot,
  folder: string,
): Map<string, Exclude<ExplorableFileFinding, 'not-text'>> {
  const findings = new Map<string, Exclude<ExplorableFileFinding, 'not-text'>>();
  for (const hash of namedHashes(state)) {
    try {
      const info = lstatSync(scriptLibraryFilePath(folder, hash));
      if (!info.isFile()) findings.set(hash, 'missing');
      else if (info.size > MAX_SCRIPT_LIBRARY_BYTES) findings.set(hash, 'too-large');
    } catch {
      findings.set(hash, 'missing');
    }
  }
  return findings;
}

/** A file of `script-libraries/` that no package names, with its size. */
export interface UnnamedScriptLibraryFile {
  hash: string;
  bytes: number;
}

/** A file of `script-libraries/` that stays when asked to be removed, and why. */
export interface KeptScriptLibraryFile {
  hash: string;
  message: string;
}

/**
 * The files of `script-libraries/` that no package names, by hash, each with its size, in order: the
 * Components tab lists them, and only the person removes them.
 */
export async function unnamedScriptLibraryFiles(
  folder: string,
  state: ProjectSnapshot,
): Promise<UnnamedScriptLibraryFile[]> {
  const named = namedHashes(state);
  const at = join(folder, SCRIPT_LIBRARIES_FOLDER);
  const info = await lstat(at).catch(() => undefined);
  if (info === undefined || !info.isDirectory()) return [];
  const entries = await readdir(at, { withFileTypes: true }).catch(() => []);
  const hashes = entries
    .filter((entry) => entry.isFile())
    .map((entry) => FILE_NAME.exec(entry.name)?.[1])
    .filter((hash): hash is string => hash !== undefined && !named.has(hash))
    .sort();
  const files: UnnamedScriptLibraryFile[] = [];
  for (const hash of hashes) {
    const file = await lstat(scriptLibraryFilePath(folder, hash)).catch(() => undefined);
    if (file?.isFile()) files.push({ hash, bytes: file.size });
  }
  return files;
}

/**
 * Removes files of `script-libraries/` that no package names, by their hashes, with the license text
 * beside each, as the person asks; it cannot be undone. Only a regular file named by a hash, directly
 * in a `script-libraries/` that is a folder of the project's own, is removed: never a link, a folder,
 * a file of another name or one a package names now. That the folder is the project's own is checked
 * again right before each file is removed.
 */
export async function removeUnnamedScriptLibraryFiles(
  folder: string,
  state: ProjectSnapshot,
  hashes: readonly string[],
): Promise<{ removed: string[]; kept: KeptScriptLibraryFile[] }> {
  const removed: string[] = [];
  const kept: KeptScriptLibraryFile[] = [];
  const named = namedHashes(state);
  const at = join(folder, SCRIPT_LIBRARIES_FOLDER);
  for (const hash of hashes) {
    const name = `${SCRIPT_LIBRARIES_FOLDER}/${hash}.js`;
    if (typeof hash !== 'string' || !HASH.test(hash)) {
      kept.push({
        hash: String(hash),
        message: 'A script library’s file is named by its SHA-256, in lowercase hexadecimal.',
      });
      continue;
    }
    if (named.has(hash)) {
      kept.push({ hash, message: `A package names the file "${name}", so it stays.` });
      continue;
    }
    if (!(await folderIsOwn(folder, at))) {
      kept.push({
        hash,
        message: `The project's ${SCRIPT_LIBRARIES_FOLDER}/ folder is not a folder of its own, so "${name}" stays.`,
      });
      continue;
    }
    const path = scriptLibraryFilePath(folder, hash);
    const info = await lstat(path).catch(() => undefined);
    if (info === undefined) {
      kept.push({ hash, message: `The project has no file "${name}".` });
      continue;
    }
    if (!info.isFile()) {
      kept.push({ hash, message: `"${name}" is not a regular file, so it stays.` });
      continue;
    }
    try {
      await unlink(path);
      removed.push(hash);
    } catch (error) {
      kept.push({
        hash,
        message: `The file "${name}" could not be removed: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }
    const license = scriptLibraryLicensePath(folder, hash);
    if ((await lstat(license).catch(() => undefined))?.isFile() === true) {
      await unlink(license).catch(() => {});
    }
  }
  return { removed, kept };
}

/**
 * Whether the folder is a real folder, not a link, whose real path lies directly in the project
 * folder's: a folder linked from elsewhere, or one the project folder reaches through a link, is not.
 */
async function folderIsOwn(folder: string, at: string): Promise<boolean> {
  const info = await lstat(at).catch(() => undefined);
  if (info === undefined || !info.isDirectory()) return false;
  const [real, project] = await Promise.all([
    realpath(at).catch(() => undefined),
    realpath(folder).catch(() => undefined),
  ]);
  return (
    real !== undefined && project !== undefined && real === join(project, SCRIPT_LIBRARIES_FOLDER)
  );
}
