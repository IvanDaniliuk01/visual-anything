/**
 * Atomic writes: a file is written to a temporary file in the same folder, flushed to disk, then
 * renamed over the target, so a crash never leaves a half-written file. On Windows a rename or a
 * delete can fail for a moment while another program, such as an antivirus or an editor, holds the
 * file; those are retried with a short backoff.
 */
import { randomBytes } from 'node:crypto';
import * as fsp from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { errorCode } from './errors';

/** The calls the writer makes to the file system; tests replace some of them to simulate failures. */
export interface WriterFs {
  open(path: string, flags: string, mode?: number): Promise<fsp.FileHandle>;
  rename(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  mkdir(path: string, options: { recursive: true }): Promise<string | undefined>;
  /** Looks at a name without following a link; the real `lstat` when left out. */
  lstat?(
    path: string,
  ): Promise<{ isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean }>;
}

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
   * a regular file or over nothing, never over a link, a folder or a device.
   */
  regularOnly?: boolean;
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
  const fs = options.fs ?? fsp;
  const folder = dirname(target);
  await fs.mkdir(folder, { recursive: true });
  if (options.regularOnly) await requireRealFolder(fs, folder);
  const temporary = join(
    folder,
    `.${basename(target)}.${randomBytes(6).toString('hex')}${TEMPORARY_SUFFIX}`,
  );
  const handle = await fs.open(temporary, 'wx', options.mode);
  try {
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (options.regularOnly) await requireRegularOrNothing(fs, target);
    await retrying(() => fs.rename(temporary, target), options.retryDelays);
  } catch (error) {
    await removeFile(temporary, options).catch(() => {});
    throw error;
  }
}

function lstatOf(fs: WriterFs) {
  return fs.lstat ?? ((path: string) => fsp.lstat(path));
}

/** Refuses a folder that is a link, or not a folder at all. */
async function requireRealFolder(fs: WriterFs, folder: string): Promise<void> {
  const stats = await lstatOf(fs)(folder);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new NotRegularFileError(`${basename(folder)} is not a real folder; ${ONLY_REGULAR}`);
  }
}

/** Refuses a target that is anything but a regular file; one that does not exist is fine. */
async function requireRegularOrNothing(fs: WriterFs, target: string): Promise<void> {
  let stats;
  try {
    stats = await lstatOf(fs)(target);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return;
    throw error;
  }
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new NotRegularFileError(`${basename(target)} is not a regular file; ${ONLY_REGULAR}`);
  }
}

/** Deletes a file; one that is already gone is fine. */
export async function removeFile(target: string, options: WriteOptions = {}): Promise<void> {
  const fs = options.fs ?? fsp;
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
