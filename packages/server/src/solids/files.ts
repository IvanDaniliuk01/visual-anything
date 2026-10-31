/**
 * A project's solid files (ADR 0075): `solids/<hash>.glb`, where the hash is the SHA-256 of the
 * file's bytes in lowercase hexadecimal.
 *
 * - A file is written once, atomically, and never changed: a replaced solid is a new file. A name
 *   whose bytes are already its name's is left as it is; only a name whose bytes are not its own, a
 *   damaged file, is written over, with the bytes the name says.
 * - Files are read as regular files within the 32 MiB cap of a cleaned file, inside the project
 *   folder, as ADR 0030 reads project files.
 * - Opening only looks at each file a package names: it must be a regular file of the size its
 *   definition says, or opening warns `solid-file-missing` and the solid is drawn as its placeholder.
 * - Nothing here deletes a file on its own; the files no package names are listed for the person.
 */
import { createHash } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { SOLID_CAPS, type Problem, type ProjectSnapshot } from '@visual-anything/core';
import type { SolidDefinition } from '@visual-anything/schema';
import { readRegularFile, type RegularRead } from '../regular-files';
import { writeFileAtomic, type WriteOptions } from '../writer';

/** The folder of a project that holds its solids' files. */
export const SOLIDS_FOLDER = 'solids';

/** A solid file's name: the SHA-256 of its bytes, in lowercase hexadecimal, and `.glb`. */
const FILE_NAME = /^([0-9a-f]{64})\.glb$/;

/** The path of a solid's file in a project folder, by its hash. */
export function solidFilePath(folder: string, hash: string): string {
  return join(folder, SOLIDS_FOLDER, `${hash}.glb`);
}

/** A solid's file as messages name it: `solids/<hash>.glb`. */
export function solidFileName(hash: string): string {
  return `${SOLIDS_FOLDER}/${hash}.glb`;
}

/**
 * The SHA-256 of bytes, in lowercase hexadecimal: the core's `solidHash`, worked out by Node.js's own
 * hashing so that a file of 32 MiB never holds up the program's thread.
 */
export function hashOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Reads a solid's file as a regular file within its cap, inside the project folder. */
export function readSolidFile(folder: string, hash: string): Promise<RegularRead> {
  return readRegularFile(solidFilePath(folder, hash), SOLID_CAPS.fileBytes, { inside: folder });
}

/**
 * Writes a solid's file, once: a file already there whose bytes are its name's is never written again.
 * Atomic, and only as a regular file inside the project folder.
 */
export async function writeSolidFile(
  folder: string,
  hash: string,
  bytes: Uint8Array,
  options: WriteOptions = {},
): Promise<void> {
  const there = await readSolidFile(folder, hash);
  if (there.ok && hashOf(there.bytes) === hash) return;
  await writeFileAtomic(solidFilePath(folder, hash), bytes, {
    ...options,
    regularOnly: true,
    inside: folder,
  });
}

/** Every solid a project's packages define, with its package. */
export function definedSolids(
  state: ProjectSnapshot,
): { definition: SolidDefinition; package: string }[] {
  return state.packages.flatMap((file) =>
    (file.solids ?? []).map((definition) => ({ definition, package: file.id })),
  );
}

/**
 * The warnings of opening about the files the packages name: each must be a regular file of the size
 * its definition says (`solid-file-missing`). Opening reads none of them.
 */
export function solidFileWarnings(state: ProjectSnapshot, folder: string): Problem[] {
  const warnings: Problem[] = [];
  for (const { definition } of definedSolids(state)) {
    const name = solidFileName(definition.hash);
    let size: number | undefined;
    let regular = false;
    try {
      const info = lstatSync(solidFilePath(folder, definition.hash));
      regular = info.isFile();
      size = info.size;
    } catch {
      size = undefined;
    }
    if (size === undefined) {
      warnings.push({
        code: 'solid-file-missing',
        message: `The solid "${definition.name}" names the file "${name}", which the project does not have; it is drawn as its placeholder.`,
        subjects: [definition.id],
      });
    } else if (!regular) {
      warnings.push({
        code: 'solid-file-missing',
        message: `The solid "${definition.name}" names "${name}", which is not a regular file; it is drawn as its placeholder.`,
        subjects: [definition.id],
      });
    } else if (size !== definition.bytes) {
      warnings.push({
        code: 'solid-file-missing',
        message: `The solid "${definition.name}" names the file "${name}" of ${definition.bytes} bytes, but it holds ${size}; it is drawn as its placeholder.`,
        subjects: [definition.id],
      });
    }
  }
  return warnings;
}

/**
 * The files in `solids/` that no package names, by hash, in order: the Components tab lists them, and
 * only the person removes them. A name that is no solid file's is passed over.
 */
export async function unnamedSolidFiles(folder: string, state: ProjectSnapshot): Promise<string[]> {
  const named = new Set(definedSolids(state).map(({ definition }) => definition.hash));
  const at = join(folder, SOLIDS_FOLDER);
  const info = await lstat(at).catch(() => undefined);
  if (info === undefined || !info.isDirectory()) return [];
  const entries = await readdir(at, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => FILE_NAME.exec(entry.name)?.[1])
    .filter((hash): hash is string => hash !== undefined && !named.has(hash))
    .sort();
}
