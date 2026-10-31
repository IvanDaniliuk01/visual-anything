/**
 * Serving a solid's file to an app (ADR 0075): `solid/get` names a file by its hash, and the program
 * answers with its bytes in pieces of at most 1 MiB in base64 (`solid/piece`), or with why it cannot
 * (`solid/refused`). The file is `solids/<hash>.glb` in the project folder, read as a regular file
 * within the cap on a cleaned file, and served only when its bytes are its name's. Solids add no HTTP
 * route: bytes travel over the live connection only.
 *
 * This is the first seam's program side (M9, Seam 2). The cleaner's task adds the check of a file's
 * canonical form and its description when it is first read, and the import (`solid/prepare`).
 */
import { join } from 'node:path';
import {
  SOLID_CAPS,
  SOLID_PIECE_BYTES,
  encodeBase64,
  solidHash,
  type ServerMessage,
} from '@visual-anything/core';
import { readRegularFile } from '../regular-files';

/** The folder of a project that holds its solids' files. */
export const SOLIDS_FOLDER = 'solids';

/** The path of a solid's file in a project folder, by its hash. */
export function solidFilePath(folder: string, hash: string): string {
  return join(folder, SOLIDS_FOLDER, `${hash}.glb`);
}

/**
 * The messages that answer `solid/get` for a file by its hash, which the core's reader already
 * checked is a SHA-256 in lowercase hexadecimal: its pieces, in order, or one refusal.
 */
export async function solidFileAnswer(
  folder: string,
  requestId: string,
  hash: string,
): Promise<ServerMessage[]> {
  const read = await readRegularFile(solidFilePath(folder, hash), SOLID_CAPS.fileBytes, {
    inside: folder,
  });
  if (!read.ok) {
    return [
      {
        type: 'solid/refused',
        requestId,
        code: 'solid-file-missing',
        message:
          read.reason === 'missing'
            ? `The project has no solid file "solids/${hash}.glb".`
            : `The solid file "solids/${hash}.glb" cannot be read: ${read.message}`,
      },
    ];
  }
  const { bytes } = read;
  // A file whose bytes are not its name's is never served (ADR 0075).
  if (bytes.length === 0 || solidHash(bytes) !== hash) {
    return [
      {
        type: 'solid/refused',
        requestId,
        code: 'solid-not-clean',
        message: `The bytes of the solid file "solids/${hash}.glb" are not the ones its name says.`,
      },
    ];
  }
  const count = Math.ceil(bytes.length / SOLID_PIECE_BYTES);
  const pieces: ServerMessage[] = [];
  for (let index = 0; index < count; index++) {
    const start = index * SOLID_PIECE_BYTES;
    pieces.push({
      type: 'solid/piece',
      requestId,
      hash,
      piece: {
        index,
        count,
        data: encodeBase64(bytes.subarray(start, start + SOLID_PIECE_BYTES)),
      },
    });
  }
  return pieces;
}
