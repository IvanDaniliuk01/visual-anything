/**
 * An image file to add as a picture from the project folder (ADR 0098): Claude's `add_picture` names
 * one by its path from the folder, as `import_solid` names a glTF file (ADR 0075), and the program
 * reads it, never Claude, only as a regular file inside the folder within the 32 MiB a picture takes.
 * A path outside the folder and a name that is no image file's are refused before anything is read.
 */
import { basename, isAbsolute, join, resolve } from 'node:path';
import { MEDIA_CAPS, type Problem } from '@visual-anything/core';
import { isInside } from '../paths';
import { readRegularFile } from '../regular-files';

/** The longest path from the project folder that an image file to add may have. */
export const MAX_PICTURE_PATH = 1024;

/** The names an image file to add may end with. */
const PICTURE_NAME = /\.(png|jpe?g|webp|gif|svg)$/i;

export type ProjectPictureFile =
  { ok: true; bytes: Uint8Array; fileName: string } | { ok: false; problem: Problem };

const EXAMPLE = 'such as "photos/front-desk.jpg"';

/** Reads an image file to add, named by its path from the project folder, or says why it cannot. */
export async function readProjectPictureFile(
  folder: string,
  path: string,
): Promise<ProjectPictureFile> {
  const refuse = (message: string): ProjectPictureFile => ({
    ok: false,
    problem: { code: 'invalid-file', message },
  });
  if (path === '' || path.length > MAX_PICTURE_PATH || path.includes('\0')) {
    return refuse(
      `An image file is named by its path from the project folder, of at most ${MAX_PICTURE_PATH} characters, ${EXAMPLE}.`,
    );
  }
  const given = path.replaceAll('\\', '/');
  if (given.startsWith('/') || /^[A-Za-z]:/.test(given) || isAbsolute(path)) {
    return refuse(
      `"${path}" is not a path from the project folder: name the file by a path from the project folder, ${EXAMPLE}. add_picture reads nothing outside it.`,
    );
  }
  const full = resolve(join(folder, ...given.split('/')));
  if (!isInside(folder, full)) {
    return refuse(
      `"${path}" lies outside the project folder: add_picture reads only an image file inside it, ${EXAMPLE}.`,
    );
  }
  const fileName = basename(full);
  if (!PICTURE_NAME.test(fileName)) {
    return refuse(
      `"${path}" is not an image file: add_picture takes a PNG, JPEG, WebP, GIF or SVG file.`,
    );
  }
  const read = await readRegularFile(full, MEDIA_CAPS.bytes, { inside: folder });
  if (!read.ok) {
    return refuse(
      read.reason === 'missing'
        ? `The project folder has no file "${path}".`
        : `"${path}" cannot be added: ${read.message}`,
    );
  }
  return { ok: true, bytes: read.bytes, fileName };
}
