/**
 * Project files are read only as regular files within a size cap. A name in a project folder can
 * point anywhere: a link to a key outside the folder, to `/dev/zero`, which never ends, or to a FIFO,
 * which never answers. Such a name is refused as a problem of its file, before anything is read: it is
 * looked at without following links, opened without following one and without waiting, looked at
 * again through its handle, and then exactly as many bytes as it held are read.
 */
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import type { FileKind } from '@visual-anything/schema';
import { errorCode, errorReason } from './errors';

const KIB = 1024;
const MIB = 1024 * KIB;

/** The most bytes a project file of each kind may hold. */
export const SIZE_CAPS: Readonly<Record<FileKind, number>> = {
  project: 1 * MIB,
  model: 64 * MIB,
  package: 8 * MIB,
  view: 64 * MIB,
  scenario: 64 * MIB,
};

/** The most bytes a project file of a kind may hold. */
export function capOf(kind: FileKind): number {
  return SIZE_CAPS[kind];
}

/** Why a file could not be read. */
export type UnreadReason =
  /** Nothing has that name. */
  | 'missing'
  /** The name is a symbolic link or a junction. */
  | 'link'
  /** The name is a folder, a device, a FIFO or a socket. */
  | 'not-regular'
  /** The file holds more bytes than its cap. */
  | 'too-large'
  /** The file could not be opened or read. */
  | 'unreadable';

/** The bytes of a regular file, or why it was not read. */
export type RegularRead =
  { ok: true; bytes: Buffer } | { ok: false; reason: UnreadReason; message: string };

const ONLY_REGULAR = 'Visual Anything opens only regular files inside the project folder.';

/**
 * The flags a file is opened with: for reading, without following a link and without waiting on a
 * FIFO, where the platform knows those flags. Windows has neither; there a FIFO cannot sit in a
 * folder, and `lstat` has already refused a link.
 */
const READ_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

/** Reads a regular file that holds at most `cap` bytes; refuses anything else, and says why. */
export async function readRegularFile(path: string, cap: number): Promise<RegularRead> {
  let kind: 'regular' | 'link' | 'other';
  try {
    const stats = await lstat(path);
    kind = stats.isSymbolicLink() ? 'link' : stats.isFile() ? 'regular' : 'other';
  } catch (error) {
    return failure(error);
  }
  if (kind === 'link') return refuse('link', `The file is a link; ${ONLY_REGULAR}`);
  if (kind === 'other')
    return refuse('not-regular', `The file is not a regular file; ${ONLY_REGULAR}`);

  let handle;
  try {
    handle = await open(path, READ_FLAGS);
  } catch (error) {
    // The name became a link between the two looks.
    if (errorCode(error) === 'ELOOP') return refuse('link', `The file is a link; ${ONLY_REGULAR}`);
    return failure(error);
  }
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) {
      return refuse('not-regular', `The file is not a regular file; ${ONLY_REGULAR}`);
    }
    if (stats.size > cap) {
      return refuse(
        'too-large',
        `The file holds more than ${describeCap(cap)}, the most a file of this kind may hold.`,
      );
    }
    // Exactly as many bytes as the file held when it was looked at: one that grows meanwhile is
    // read only that far, and one that shrinks gives what is left.
    const bytes = Buffer.alloc(stats.size);
    let filled = 0;
    while (filled < bytes.length) {
      const { bytesRead } = await handle.read(bytes, filled, bytes.length - filled, filled);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    return { ok: true, bytes: filled === bytes.length ? bytes : bytes.subarray(0, filled) };
  } catch (error) {
    return failure(error);
  } finally {
    await handle.close().catch(() => {});
  }
}

/** A number of bytes in words: `100 bytes`, `256 KiB`, `64 MiB`, `65.5 MiB`. */
export function describeCap(bytes: number): string {
  if (bytes < KIB) return `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`;
  const [unit, size] = bytes < MIB ? ['KiB', bytes / KIB] : ['MiB', bytes / MIB];
  const rounded = Math.round(size * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ${unit}`;
}

function refuse(reason: Exclude<UnreadReason, 'missing'>, message: string): RegularRead {
  return { ok: false, reason, message };
}

function failure(error: unknown): RegularRead {
  if (errorCode(error) === 'ENOENT') {
    return { ok: false, reason: 'missing', message: 'There is no such file.' };
  }
  return {
    ok: false,
    reason: 'unreadable',
    message: `The file could not be read: ${errorReason(error)}`,
  };
}
