/**
 * Project files are read only as regular files within a size cap, inside the project folder. A name
 * in a project folder can point anywhere: a link to a key outside the folder, to `/dev/zero`, which
 * never ends, or to a FIFO, which never answers. Such a name is refused as a problem of its file,
 * before anything is read.
 *
 * Each read binds the bytes it returns to what was checked, since a name can be swapped between two
 * looks at it:
 * 1. the name is looked at without following a link (`lstat`), and must be a regular file;
 * 2. it is opened without following a link and without waiting, where the platform has those flags;
 *    Windows has neither, which is why the next two checks exist;
 * 3. the open file, looked at through its handle, must be the very file step 1 saw: the same device
 *    and the same file number;
 * 4. with the project folder given, the name's real path must lie inside it and name that same file,
 *    so that a folder on the way swapped for a link or a junction is caught as well;
 * 5. then exactly as many bytes as the file held are read, through the handle checked.
 */
import { constants, type BigIntStats } from 'node:fs';
import * as fsp from 'node:fs/promises';
import type { FileKind } from '@visual-anything/schema';
import { errorCode, errorReason } from './errors';
import { isInside } from './paths';

const KIB = 1024;
const MIB = 1024 * KIB;

/** The most bytes a project file of each kind may hold. */
export const SIZE_CAPS: Readonly<Record<FileKind, number>> = {
  project: 1 * MIB,
  model: 64 * MIB,
  package: 8 * MIB,
  view: 64 * MIB,
  scenario: 64 * MIB,
  tour: 8 * MIB,
  comment: 1 * MIB,
};

/** The most bytes a project file of a kind may hold. */
export function capOf(kind: FileKind): number {
  return SIZE_CAPS[kind];
}

/** Why a file could not be read. */
export type UnreadReason =
  /** Nothing has that name. */
  | 'missing'
  /** The name is a symbolic link or a junction, or a folder on the way to it leads outside. */
  | 'link'
  /** The name is a folder, a device, a FIFO or a socket. */
  | 'not-regular'
  /** The name came to name another file while it was being opened. */
  | 'changed'
  /** The file holds more bytes than its cap. */
  | 'too-large'
  /** The file could not be opened or read. */
  | 'unreadable';

/** The bytes of a regular file, or why it was not read. */
export type RegularRead =
  { ok: true; bytes: Buffer } | { ok: false; reason: UnreadReason; message: string };

/** The calls a read makes to the file system; tests replace some of them to swap names mid-read. */
export interface ReaderFs {
  lstat(path: string): Promise<BigIntStats>;
  stat(path: string): Promise<BigIntStats>;
  realpath(path: string): Promise<string>;
  open(path: string, flags: number): Promise<fsp.FileHandle>;
}

/** The real file system, with every number as a bigint: Windows file numbers need 64 bits. */
export const REAL_READER_FS: ReaderFs = {
  lstat: (path) => fsp.lstat(path, { bigint: true }),
  stat: (path) => fsp.stat(path, { bigint: true }),
  realpath: (path) => fsp.realpath(path),
  open: (path, flags) => fsp.open(path, flags),
};

/** How a file is read. */
export interface ReadOptions {
  /**
   * The real path of the project folder: the file's real path must lie inside it. Without it, only
   * steps 1 to 3 and 5 are checked.
   */
  inside?: string;
  fs?: ReaderFs;
}

const ONLY_REGULAR = 'Visual Anything opens only regular files inside the project folder.';

/**
 * The flags a file is opened with: for reading, without following a link and without waiting on a
 * FIFO, where the platform knows those flags. Windows has neither: there the identity checks alone
 * catch a name swapped for a link after it was looked at.
 */
const READ_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0);

/** Whether two looks at a name saw the same file: the same device and the same file number. */
export function sameFile(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

/**
 * Reads a regular file that holds at most `cap` bytes, inside the project folder when it is given;
 * refuses anything else, and says why.
 */
export async function readRegularFile(
  path: string,
  cap: number,
  options: ReadOptions = {},
): Promise<RegularRead> {
  const fs = options.fs ?? REAL_READER_FS;
  let seen: BigIntStats;
  try {
    seen = await fs.lstat(path);
  } catch (error) {
    return failure(error);
  }
  if (seen.isSymbolicLink()) return refuse('link', `The file is a link; ${ONLY_REGULAR}`);
  if (!seen.isFile())
    return refuse('not-regular', `The file is not a regular file; ${ONLY_REGULAR}`);

  let handle;
  try {
    handle = await fs.open(path, READ_FLAGS);
  } catch (error) {
    // The name became a link between the two looks.
    if (errorCode(error) === 'ELOOP') return refuse('link', `The file is a link; ${ONLY_REGULAR}`);
    return failure(error);
  }
  try {
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile()) {
      return refuse('not-regular', `The file is not a regular file; ${ONLY_REGULAR}`);
    }
    if (!sameFile(seen, opened)) return changed();
    if (options.inside !== undefined) {
      const real = await fs.realpath(path);
      if (!isInside(options.inside, real)) {
        return refuse('link', `The file lies outside the project folder; ${ONLY_REGULAR}`);
      }
      // The real path must lead to the file opened, not to one swapped back in its place since.
      if (!sameFile(await fs.stat(real), opened)) return changed();
    }
    const size = Number(opened.size);
    if (size > cap) {
      return refuse(
        'too-large',
        `The file holds more than ${describeCap(cap)}, the most a file of this kind may hold.`,
      );
    }
    // Exactly as many bytes as the file held when it was looked at: one that grows meanwhile is
    // read only that far, and one that shrinks gives what is left.
    const bytes = Buffer.alloc(size);
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

function changed(): RegularRead {
  return refuse('changed', `The file changed while it was being opened; ${ONLY_REGULAR}`);
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
