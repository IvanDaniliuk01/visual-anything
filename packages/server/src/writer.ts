/**
 * Atomic writes: a file is written to a temporary file in the same folder, flushed to disk, then
 * renamed over the target, so a crash never leaves a half-written file. On Windows a rename or a
 * delete can fail for a moment while another program, such as an antivirus or an editor, holds the
 * file; those are retried with a short backoff.
 *
 * A project file is written only as a regular file inside the project folder (`regularOnly`), even
 * when a folder on the way is swapped for a link while it is written:
 * 1. at the start, the folder must be a real folder, not a link, whose real path lies in the project
 *    folder; its device and file number are kept, and where the platform has `O_DIRECTORY` and
 *    `O_NOFOLLOW` it is also opened with them and must be that same folder;
 * 2. just before the rename, the folder must still be that folder, and the target a regular file or
 *    nothing; a regular target gets a hard link beside it, a backup of what the name held;
 * 3. after the rename, the target's real path must lie inside the project folder and be the file
 *    written. If not, the backup is put back over the name, or what was written is removed, and the
 *    write is refused.
 */
import { randomBytes } from 'node:crypto';
import { constants, type BigIntStats } from 'node:fs';
import * as fsp from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { errorCode } from './errors';
import { isInside } from './paths';
import { sameFile } from './regular-files';

/** The calls the writer makes to the file system; tests replace some of them to simulate failures. */
export interface WriterFs {
  open(path: string, flags: string | number, mode?: number): Promise<fsp.FileHandle>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  mkdir(path: string, options: { recursive: true }): Promise<string | undefined>;
  /** Looks at a name without following a link; the real `lstat` when left out. */
  lstat?: (path: string) => Promise<BigIntStats>;
  /** Looks at what a name leads to; the real `stat` when left out. */
  stat?: (path: string) => Promise<BigIntStats>;
  /** The real path of a name; the real `realpath` when left out. */
  realpath?: (path: string) => Promise<string>;
  /** Gives a file a second name; the real `link` when left out. */
  link?: (existing: string, path: string) => Promise<void>;
}

/** The real file system, looking at names with every number as a bigint. */
const REAL_WRITER_FS: Required<WriterFs> = {
  open: (path, flags, mode) => fsp.open(path, flags, mode),
  rename: (from, to) => fsp.rename(from, to),
  unlink: (path) => fsp.unlink(path),
  mkdir: (path, options) => fsp.mkdir(path, options),
  lstat: (path) => fsp.lstat(path, { bigint: true }),
  stat: (path) => fsp.stat(path, { bigint: true }),
  realpath: (path) => fsp.realpath(path),
  link: (existing, path) => fsp.link(existing, path),
};

/** How the writer works. */
export interface WriteOptions {
  /** The file system; the real one by default. */
  fs?: WriterFs;
  /**
   * How long to wait, in milliseconds, before each new attempt at a rename or a delete that another
   * program blocks; there are as many retries as delays.
   */
  retryDelays?: readonly number[];
  /**
   * For project files: write only into a real folder, never one that is a link, and rename only over
   * a regular file or over nothing, never over a link, a folder or a device; see the steps above.
   */
  regularOnly?: boolean;
  /**
   * With `regularOnly`, the real path of the project folder: the folder written into, and the file
   * written, must lie in it.
   */
  inside?: string;
  /** The permissions a new file gets, such as 0o600 for a file only its owner may read. */
  mode?: number;
}

/** Raised for a write that would go through a link or replace something other than a regular file. */
export class NotRegularFileError extends Error {
  override name = 'NotRegularFileError';
}

const ONLY_REGULAR = 'Visual Anything writes only regular files inside the project folder.';

/** The waits between attempts: about 0.6 seconds in all, before giving up. */
export const RETRY_DELAYS: readonly number[] = [10, 20, 40, 80, 160, 320];

/** The failures that waiting can fix: another program holds the file for a moment. */
const RETRIED_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

/**
 * The end of every temporary file's name. It is no project file extension, so neither opening a
 * project nor watching it ever takes a temporary file for a project file.
 */
const TEMPORARY_SUFFIX = '.va-tmp';

/** Whether a file name is one of the writer's temporary files. */
export function isTemporaryFile(name: string): boolean {
  return name.endsWith(TEMPORARY_SUFFIX);
}

/**
 * Writes bytes to a file atomically, creating the folders it needs. When it fails, the file keeps its
 * old content and no temporary file is left behind.
 */
export async function writeFileAtomic(
  target: string,
  data: Uint8Array,
  options: WriteOptions = {},
): Promise<void> {
  const fs = options.fs ?? REAL_WRITER_FS;
  if (options.regularOnly) return writeRegularFile(fs, target, data, options);
  const folder = dirname(target);
  await fs.mkdir(folder, { recursive: true });
  const temporary = temporaryNameFor(target);
  const handle = await fs.open(temporary, 'wx', options.mode);
  try {
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await retrying(() => fs.rename(temporary, target), options.retryDelays);
  } catch (error) {
    await removeFile(temporary, options).catch(() => {});
    throw error;
  }
}

/** A temporary file's name beside the target, which no other write takes. */
function temporaryNameFor(target: string): string {
  return join(
    dirname(target),
    `.${basename(target)}.${randomBytes(6).toString('hex')}${TEMPORARY_SUFFIX}`,
  );
}

/** The calls the guarded write makes beyond the basic ones, from the fs given or the real one. */
function lookups(fs: WriterFs) {
  return {
    lstat: fs.lstat ?? REAL_WRITER_FS.lstat,
    stat: fs.stat ?? REAL_WRITER_FS.stat,
    realpath: fs.realpath ?? REAL_WRITER_FS.realpath,
    link: fs.link ?? REAL_WRITER_FS.link,
  };
}

/** The flags that open a folder only when it is a real folder, where the platform has them. */
const REAL_FOLDER_FLAGS =
  constants.O_DIRECTORY !== undefined && constants.O_NOFOLLOW !== undefined
    ? constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
    : undefined;

/** Writes a project file as a regular file inside the project folder: the steps at the top. */
async function writeRegularFile(
  fs: WriterFs,
  target: string,
  data: Uint8Array,
  options: WriteOptions,
): Promise<void> {
  const look = lookups(fs);
  const folder = dirname(target);
  await fs.mkdir(folder, { recursive: true });
  const folderSeen = await checkFolder(fs, folder, options.inside);

  const temporary = temporaryNameFor(target);
  const handle = await fs.open(temporary, 'wx', options.mode);
  let written: BigIntStats;
  let backup: string | undefined;
  try {
    try {
      await handle.writeFile(data);
      await handle.sync();
      written = await handle.stat({ bigint: true });
    } finally {
      await handle.close();
    }
    // Just before the rename: the same folder, and a regular file or nothing under the name.
    const now = await look.lstat(folder);
    if (now.isSymbolicLink() || !sameFile(now, folderSeen)) throw folderChanged(folder, target);
    if (await isRegularTarget(look, target)) backup = await backUp(look, target);
    await retrying(() => fs.rename(temporary, target), options.retryDelays);
  } catch (error) {
    await removeFile(temporary, options).catch(() => {});
    if (backup !== undefined) await removeFile(backup, options).catch(() => {});
    throw error;
  }

  // After the rename: the name must lead, inside the project folder, to the file just written.
  if (!(await landedInside(look, target, written, options.inside))) {
    if (backup !== undefined) {
      // Puts back what the name held, wherever it now leads; should that fail, the backup keeps it.
      const restored = await retrying(() => fs.rename(backup, target), options.retryDelays)
        .then(() => true)
        .catch(() => false);
      if (!restored) await removeFile(target, options).catch(() => {});
    } else {
      await removeFile(target, options).catch(() => {});
    }
    throw folderChanged(folder, target);
  }
  if (backup !== undefined) await removeFile(backup, options).catch(() => {});
}

/**
 * Checks the folder a project file goes in: a real folder whose real path lies in the project folder,
 * or is it. Returns what it saw, to compare with later.
 */
async function checkFolder(
  fs: WriterFs,
  folder: string,
  inside: string | undefined,
): Promise<BigIntStats> {
  const look = lookups(fs);
  const seen = await look.lstat(folder);
  if (seen.isSymbolicLink() || !seen.isDirectory()) {
    throw new NotRegularFileError(`${basename(folder)} is not a real folder; ${ONLY_REGULAR}`);
  }
  if (inside !== undefined) {
    const real = await look.realpath(folder);
    if ((real !== inside && !isInside(inside, real)) || !sameFile(await look.stat(real), seen)) {
      throw new NotRegularFileError(
        `${basename(folder)} lies outside the project folder; ${ONLY_REGULAR}`,
      );
    }
  }
  if (REAL_FOLDER_FLAGS !== undefined) {
    let handle;
    try {
      handle = await fs.open(folder, REAL_FOLDER_FLAGS);
    } catch {
      throw new NotRegularFileError(`${basename(folder)} is not a real folder; ${ONLY_REGULAR}`);
    }
    try {
      if (!sameFile(await handle.stat({ bigint: true }), seen)) {
        throw new NotRegularFileError(`${basename(folder)} changed; ${ONLY_REGULAR}`);
      }
    } finally {
      await handle.close().catch(() => {});
    }
  }
  return seen;
}

/** Whether the target is a regular file; nothing there is fine, and anything else is refused. */
async function isRegularTarget(look: ReturnType<typeof lookups>, target: string): Promise<boolean> {
  let stats;
  try {
    stats = await look.lstat(target);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false;
    throw error;
  }
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new NotRegularFileError(`${basename(target)} is not a regular file; ${ONLY_REGULAR}`);
  }
  return true;
}

/**
 * Gives the target a second name beside it, so that what it holds can be put back; `undefined` where
 * hard links cannot be made, as on some network or FAT volumes.
 */
async function backUp(
  look: ReturnType<typeof lookups>,
  target: string,
): Promise<string | undefined> {
  const backup = temporaryNameFor(target);
  try {
    await look.link(target, backup);
    return backup;
  } catch {
    return undefined;
  }
}

/** Whether the target now leads, inside the project folder when it is given, to the file written. */
async function landedInside(
  look: ReturnType<typeof lookups>,
  target: string,
  written: BigIntStats,
  inside: string | undefined,
): Promise<boolean> {
  try {
    const real = await look.realpath(target);
    if (inside !== undefined && !isInside(inside, real)) return false;
    return sameFile(await look.stat(real), written);
  } catch {
    return false;
  }
}

function folderChanged(folder: string, target: string): NotRegularFileError {
  return new NotRegularFileError(
    `${basename(folder)} changed while ${basename(target)} was written, so nothing was written there; ${ONLY_REGULAR}`,
  );
}

/** Deletes a file; one that is already gone is fine. */
export async function removeFile(target: string, options: WriteOptions = {}): Promise<void> {
  const fs = options.fs ?? REAL_WRITER_FS;
  try {
    await retrying(() => fs.unlink(target), options.retryDelays);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
}

/** Runs an action, and runs it again after each delay while it fails in a way waiting can fix. */
async function retrying<T>(
  action: () => Promise<T>,
  delays: readonly number[] = RETRY_DELAYS,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await action();
    } catch (error) {
      const delay = delays[attempt];
      if (delay === undefined || !RETRIED_CODES.has(errorCode(error) ?? '')) throw error;
      await sleep(delay);
    }
  }
}
