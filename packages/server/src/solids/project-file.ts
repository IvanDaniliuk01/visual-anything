/**
 * A glTF file to import from the project folder (ADR 0075): Claude's `import_solid` names one by its
 * path from the folder, and the program reads it, never Claude, and only as ADR 0030 reads project
 * files: a regular file inside the folder, within the 256 MiB cleaning reads, through no link, no
 * junction and no folder swapped on the way. A path outside the folder, absolute or not, and a name
 * that is no glTF file's are refused before anything is read. What the program reads is then only
 * cleaned: nothing of a file that is not glTF reaches the model, and the cleaner's report names no
 * byte of it beyond what the reader says.
 */
import { basename, isAbsolute, join, resolve } from 'node:path';
import { MAX_SOLID_INPUT_BYTES, type Problem } from '@visual-anything/core';
import { isInside } from '../paths';
import { readRegularFile } from '../regular-files';
import { isSolidFile } from './import';

/** The longest path from the project folder that a file to import may have. */
export const MAX_SOLID_PATH = 1024;

/** The file read, with its own name for the history, or why it was not. */
export type ProjectSolidFile =
  { ok: true; bytes: Uint8Array; fileName: string } | { ok: false; problem: Problem };

const EXAMPLE = 'such as "models/arm.glb"';

/** Reads a glTF file to import, named by its path from the project folder, or says why it cannot. */
export async function readProjectSolidFile(
  folder: string,
  path: string,
): Promise<ProjectSolidFile> {
  const refuse = (message: string): ProjectSolidFile => ({
    ok: false,
    problem: { code: 'invalid-file', message },
  });
  if (path === '' || path.length > MAX_SOLID_PATH || path.includes('\0')) {
    return refuse(
      `A file to import is named by its path from the project folder, of at most ${MAX_SOLID_PATH} characters, ${EXAMPLE}.`,
    );
  }
  // Both separators read alike on every platform, so that a path means one file wherever it runs.
  const given = path.replaceAll('\\', '/');
  if (given.startsWith('/') || /^[A-Za-z]:/.test(given) || isAbsolute(path)) {
    return refuse(
      `"${path}" is not a path from the project folder: name the file by a path from the project folder, ${EXAMPLE}. import_solid reads nothing outside it.`,
    );
  }
  const full = resolve(join(folder, ...given.split('/')));
  if (!isInside(folder, full)) {
    return refuse(
      `"${path}" lies outside the project folder: import_solid reads only a .glb or .gltf file inside it, named by its path from the folder, ${EXAMPLE}.`,
    );
  }
  const fileName = basename(full);
  if (!isSolidFile(fileName)) {
    return refuse(
      `"${path}" is not a glTF file: import_solid imports a .glb file, or a .gltf file whose data is all inside it.`,
    );
  }
  const read = await readRegularFile(full, MAX_SOLID_INPUT_BYTES, { inside: folder });
  if (!read.ok) {
    return refuse(
      read.reason === 'missing'
        ? `The project folder has no file "${path}".`
        : `"${path}" cannot be imported: ${read.message}`,
    );
  }
  return { ok: true, bytes: read.bytes, fileName };
}
