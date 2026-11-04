/**
 * A project's media files (ADR 0098): `media/<hash>.<extension>`, where the hash is the SHA-256 of the
 * cleaned file's bytes in lowercase hexadecimal. As solids' files (ADR 0075):
 *
 * - a file is written once, atomically, as a regular file inside the project folder, and never
 *   changed; a name whose bytes are already its own is left as it is;
 * - files are read as regular files within the 32 MiB cap, inside the project folder;
 * - nothing here deletes a file on its own: the files no picture names are listed for the person.
 */
import { lstat, readdir, realpath, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  MEDIA_CAPS,
  mediaFileName,
  mediaFileOf,
  mediaNamedBy,
  type KeptMediaFile,
  type ProjectSnapshot,
  type UnnamedMediaFile,
} from '@visual-anything/core';
import type { MediaFormat } from '@visual-anything/schema';
import { readRegularFile, type RegularRead } from '../regular-files';
import { hashOf } from '../solids/files';
import { writeFileAtomic, type WriteOptions } from '../writer';

/** The folder of a project that holds its pictures' files. */
export const MEDIA_FOLDER = 'media';

const FORMATS: readonly MediaFormat[] = ['png', 'jpeg', 'webp', 'gif', 'svg'];

/** The path of a media file in a project folder. */
export function mediaFilePath(folder: string, hash: string, format: MediaFormat): string {
  return join(folder, MEDIA_FOLDER, mediaFileName({ hash, format }));
}

/** A media file as messages name it: `media/<hash>.<extension>`. */
export function mediaFileLabel(hash: string, format: MediaFormat): string {
  return `${MEDIA_FOLDER}/${mediaFileName({ hash, format })}`;
}

/** Reads a media file as a regular file within its cap, inside the project folder. */
export function readMediaFile(
  folder: string,
  hash: string,
  format: MediaFormat,
): Promise<RegularRead> {
  return readRegularFile(mediaFilePath(folder, hash, format), MEDIA_CAPS.bytes, { inside: folder });
}

/**
 * The format of the media file of `media/` named by a hash, by the extensions it may take, or
 * `undefined` when the project has none. A name that is not a regular file is passed over.
 */
export async function findMediaFile(
  folder: string,
  hash: string,
): Promise<MediaFormat | undefined> {
  for (const format of FORMATS) {
    const info = await lstat(mediaFilePath(folder, hash, format)).catch(() => undefined);
    if (info?.isFile()) return format;
  }
  return undefined;
}

/** Writes a media file, once: a file already there whose bytes are its name's is never written again. */
export async function writeMediaFile(
  folder: string,
  hash: string,
  format: MediaFormat,
  bytes: Uint8Array,
  options: WriteOptions = {},
): Promise<void> {
  const there = await readMediaFile(folder, hash, format);
  if (there.ok && hashOf(there.bytes) === hash) return;
  await writeFileAtomic(mediaFilePath(folder, hash, format), bytes, {
    ...options,
    regularOnly: true,
    inside: folder,
  });
}

/** The files of `media/` that no picture of any view names, with their sizes, in order. */
export async function unnamedMediaFiles(
  folder: string,
  state: ProjectSnapshot,
): Promise<UnnamedMediaFile[]> {
  const named = mediaNamedBy(state.views);
  const at = join(folder, MEDIA_FOLDER);
  const info = await lstat(at).catch(() => undefined);
  if (info === undefined || !info.isDirectory()) return [];
  const entries = await readdir(at, { withFileTypes: true }).catch(() => []);
  const files: UnnamedMediaFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const file = mediaFileOf(entry.name);
    if (file === undefined || named.has(file.hash)) continue;
    const size = await lstat(join(at, entry.name)).catch(() => undefined);
    if (size?.isFile()) files.push({ ...file, bytes: size.size });
  }
  return files.sort((a, b) =>
    a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : a.format < b.format ? -1 : 1,
  );
}

const HASH = /^[0-9a-f]{64}$/;

/**
 * Removes the files of `media/` that no picture names, by their hashes, as the person asks from the
 * view's inspector (ADR 0098); it cannot be undone. Only a regular file named by a hash and one of the
 * extensions, directly in a `media/` that is a folder of its own inside the project folder, is
 * removed, checked again right before each removal, as solids' files are.
 */
export async function removeUnnamedMediaFiles(
  folder: string,
  state: ProjectSnapshot,
  hashes: readonly string[],
): Promise<{ removed: string[]; kept: KeptMediaFile[] }> {
  const removed: string[] = [];
  const kept: KeptMediaFile[] = [];
  const named = mediaNamedBy(state.views);
  const at = join(folder, MEDIA_FOLDER);
  for (const hash of hashes) {
    if (!HASH.test(hash)) {
      kept.push({
        hash,
        message: 'A media file is named by its SHA-256, in lowercase hexadecimal.',
      });
      continue;
    }
    if (named.has(hash)) {
      kept.push({ hash, message: 'A picture names this media file, so it stays.' });
      continue;
    }
    const format = await findMediaFile(folder, hash);
    if (format === undefined) {
      kept.push({ hash, message: 'The project has no such media file.' });
      continue;
    }
    const label = mediaFileLabel(hash, format);
    if (!(await mediaFolderIsOwn(folder, at))) {
      kept.push({
        hash,
        message: `The project's media/ folder is not a folder of its own, so "${label}" stays.`,
      });
      continue;
    }
    try {
      await unlink(mediaFilePath(folder, hash, format));
      removed.push(hash);
    } catch (error) {
      kept.push({
        hash,
        message: `The media file "${label}" could not be removed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  return { removed, kept };
}

/** Whether `media/` is a real folder, not a link, whose real path lies directly in the project's. */
async function mediaFolderIsOwn(folder: string, at: string): Promise<boolean> {
  const info = await lstat(at).catch(() => undefined);
  if (info === undefined || !info.isDirectory()) return false;
  const [real, project] = await Promise.all([
    realpath(at).catch(() => undefined),
    realpath(folder).catch(() => undefined),
  ]);
  return real !== undefined && project !== undefined && real === join(project, MEDIA_FOLDER);
}
