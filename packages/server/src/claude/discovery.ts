/**
 * How Claude's MCP entry point finds the running local program of a project. Each running program
 * leaves a record in the runtime folder, keyed by the project folder's real path: the program's
 * process, its port and Claude's credential for the Claude endpoint. The record is written when the
 * program listens and removed when it stops.
 *
 * The credential is a secret of its own: it opens only the Claude endpoint, which accepts only what
 * Claude may send, and it is never the session token, which never leaves the program. So that no
 * other account on the computer can read it, or plant a record the entry point would trust:
 * - on Windows, the runtime folder lies in the user's own profile, whose inherited access list admits
 *   only the user, SYSTEM and Administrators; a folder named by `VISUAL_ANYTHING_RUNTIME` is refused
 *   unless its real path lies in the profile too;
 * - elsewhere, the folder belongs to the user and is closed to everyone else (0700), and each record
 *   belongs to the user and is readable only by them (0600);
 * - everywhere, a record is trusted only when it is a regular file, reached through no link, inside
 *   that folder, and no older than the start of the program it names.
 */
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, readdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { isInside } from '../paths';
import { readRegularFile } from '../regular-files';
import { removeFile, writeFileAtomic } from '../writer';

/** An absolute folder in this variable names the runtime folder instead, for tests and portable use. */
export const RUNTIME_ENV = 'VISUAL_ANYTHING_RUNTIME';

/** What a running program records for Claude to attach. */
export interface ProgramRecord {
  /** The format of the record. */
  format: 1;
  /** The live protocol the program speaks. */
  protocolVersion: number;
  /** The program's process. */
  pid: number;
  /** The port it listens on, on 127.0.0.1. */
  port: number;
  /** The real path of the project folder it has open. */
  folder: string;
  /** Claude's credential for the Claude endpoint. */
  credential: string;
  /** When it started, in ISO 8601. */
  startedAt: string;
  /**
   * Set while the program is at home, with no project open (ADR 0093, ADR 0099): `folder` is then the
   * projects folder, and the program greets Claude with `project/closed`.
   */
  home?: true;
}

/** Who is asking, and on which platform: the real ones by default; tests give their own. */
export interface RuntimeContext {
  platform: NodeJS.Platform;
  /** The user's profile, or home folder. */
  home: string;
  /** The user's id, on platforms whose files have owners. */
  uid?: number;
}

/** The context of this process. */
export function currentContext(): RuntimeContext {
  const uid = process.getuid?.();
  return { platform: process.platform, home: homedir(), ...(uid === undefined ? {} : { uid }) };
}

/** Raised for a runtime folder that other accounts could read or write. */
export class UnsafeRuntimeFolderError extends Error {
  override name = 'UnsafeRuntimeFolderError';
}

/** The longest record file read. */
const RECORD_CAP = 16 * 1024;

/** How far the clocks of a record's file and its own start may disagree. */
const CLOCK_SLACK = 2_000;

/**
 * The runtime folder: `%LOCALAPPDATA%\Visual Anything\run` on Windows, when that lies in the
 * profile, or `<profile>\AppData\Local\Visual Anything\run`;
 * `~/Library/Application Support/Visual Anything/run` on macOS; `$XDG_RUNTIME_DIR/visual-anything`
 * elsewhere, or `$XDG_STATE_HOME/visual-anything/run`, or `~/.local/state/visual-anything/run`.
 * An absolute `VISUAL_ANYTHING_RUNTIME` names another one, which is checked when it is used;
 * relative values are ignored.
 */
export function runtimeFolder(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  home: string,
): string {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const absolute = (value: string | undefined) =>
    value !== undefined && value !== '' && paths.isAbsolute(value) ? value : undefined;
  const override = absolute(env[RUNTIME_ENV]);
  if (override !== undefined) return override;
  if (platform === 'win32') {
    const given = absolute(env.LOCALAPPDATA);
    const inProfile = given !== undefined && isInsideWith(paths, home, given);
    const local = inProfile ? given : paths.join(home, 'AppData', 'Local');
    return paths.join(local, 'Visual Anything', 'run');
  }
  if (platform === 'darwin') {
    return paths.join(home, 'Library', 'Application Support', 'Visual Anything', 'run');
  }
  const runtime = absolute(env.XDG_RUNTIME_DIR);
  if (runtime !== undefined) return paths.join(runtime, 'visual-anything');
  const state = absolute(env.XDG_STATE_HOME) ?? paths.join(home, '.local', 'state');
  return paths.join(state, 'visual-anything', 'run');
}

/**
 * The name of the record of a project folder: a hash of its real path, written with forward slashes
 * and, where names do not tell case apart, in lower case.
 */
export function recordName(folder: string, platform: NodeJS.Platform = process.platform): string {
  let key = folder.replaceAll('\\', '/');
  if (platform === 'win32' || platform === 'darwin') key = key.toLowerCase();
  return `${createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 24)}.json`;
}

/** Writes the record of a running program, only its user may read, and returns its path. */
export async function writeProgramRecord(
  runtime: string,
  record: ProgramRecord,
  context: RuntimeContext = currentContext(),
): Promise<string> {
  const real = await privateFolder(runtime, context, { create: true });
  const file = path.join(real, recordName(record.folder, context.platform));
  await writeFileAtomic(file, Buffer.from(`${JSON.stringify(record, null, 2)}\n`, 'utf8'), {
    mode: 0o600,
  });
  return file;
}

/** Removes a record, but only while it still names this process: another may have taken its place. */
export async function removeProgramRecord(
  file: string,
  pid: number,
  context: RuntimeContext = currentContext(),
): Promise<void> {
  let real: string;
  try {
    real = await privateFolder(path.dirname(file), context, { create: false });
  } catch {
    return;
  }
  const record = await readRecordFile(path.join(real, path.basename(file)), real, context);
  if (record?.pid !== pid) return;
  await removeFile(file).catch(() => {});
}

/**
 * The record of the program that has a project folder open, if a trusted one is there. Throws an
 * {@link UnsafeRuntimeFolderError} for a runtime folder other accounts could reach.
 */
export async function readProgramRecord(
  runtime: string,
  folder: string,
  context: RuntimeContext = currentContext(),
): Promise<ProgramRecord | undefined> {
  const real = await openedFolder(runtime, context);
  if (real === undefined) return undefined;
  const name = recordName(folder, context.platform);
  const record = await readRecordFile(path.join(real, name), real, context);
  return record !== undefined && recordName(record.folder, context.platform) === name
    ? record
    : undefined;
}

/**
 * Every trusted record in the runtime folder. Throws an {@link UnsafeRuntimeFolderError} for a
 * runtime folder other accounts could reach.
 */
export async function listProgramRecords(
  runtime: string,
  context: RuntimeContext = currentContext(),
): Promise<ProgramRecord[]> {
  const real = await openedFolder(runtime, context);
  if (real === undefined) return [];
  let names: string[];
  try {
    names = await readdir(real);
  } catch {
    return [];
  }
  const records = await Promise.all(
    names
      .filter((name) => /^[0-9a-f]{24}\.json$/.test(name))
      .map((name) => readRecordFile(path.join(real, name), real, context)),
  );
  return records.filter((record) => record !== undefined);
}

/**
 * Makes the runtime folder if needed and checks it, as writing a record does; returns its real path.
 * Throws an {@link UnsafeRuntimeFolderError} for a folder other accounts could reach.
 */
export function ensureRuntimeFolder(
  runtime: string,
  context: RuntimeContext = currentContext(),
): Promise<string> {
  return privateFolder(runtime, context, { create: true });
}

/** Whether a process is running; one this user may not signal is running too. */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EPERM';
  }
}

/** The real path of an existing runtime folder, checked; `undefined` when there is none yet. */
async function openedFolder(runtime: string, context: RuntimeContext): Promise<string | undefined> {
  try {
    await lstat(runtime);
  } catch {
    return undefined;
  }
  return privateFolder(runtime, context, { create: false });
}

/**
 * Checks, and makes when asked, the runtime folder, or another folder that keeps a secret of the
 * program's, such as the kept session (ADR 0099), which `secret` names in what it says; returns its
 * real path. It must be a real folder, not a link. On Windows its real path must lie in the user's profile. Elsewhere it must belong to the
 * user; a folder made here is closed to everyone else, and one others may write in is refused.
 */
export async function privateFolder(
  folder: string,
  context: RuntimeContext,
  how: { create: boolean; secret?: string },
): Promise<string> {
  const secret = how.secret ?? "Claude's credential";
  if (how.create) await mkdir(folder, { recursive: true, mode: 0o700 });
  const stats = await lstat(folder);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new UnsafeRuntimeFolderError(
      `${folder} is not a real folder, so ${secret} is not kept there.`,
    );
  }
  const real = await realpath(folder);
  if (context.platform === 'win32') {
    const profile = await realpath(context.home).catch(() => context.home);
    if (!isInside(profile, real)) {
      throw new UnsafeRuntimeFolderError(
        `${real} lies outside your profile (${profile}), where other accounts on this computer could read ${secret} or leave a record of their own. Choose a runtime folder inside your profile.`,
      );
    }
    return real;
  }
  if (context.uid !== undefined) {
    if (stats.uid !== context.uid) {
      throw new UnsafeRuntimeFolderError(
        `${folder} belongs to another user, so ${secret} is not kept there.`,
      );
    }
    if ((stats.mode & 0o077) !== 0) {
      if (!how.create && (stats.mode & 0o022) !== 0) {
        throw new UnsafeRuntimeFolderError(
          `Other users may write in ${folder}, so no record there is trusted.`,
        );
      }
      await chmod(folder, 0o700);
    }
  }
  return real;
}

/**
 * Reads a record file and trusts it only when it is a regular file reached through no link, inside
 * the runtime folder; of this user and readable by them only, where files have owners; holding a
 * record of this format; and no older than the start of the program it names.
 */
async function readRecordFile(
  file: string,
  realRuntime: string,
  context: RuntimeContext,
): Promise<ProgramRecord | undefined> {
  const read = await readPrivateFile(file, realRuntime, context, RECORD_CAP);
  if (read === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(read.bytes.toString('utf8'));
  } catch {
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  const started = Date.parse(value.startedAt);
  // A record is written once its program listens: one older than that start was left by something else.
  if (Number.isNaN(started) || read.modified + CLOCK_SLACK < started) return undefined;
  return value;
}

/**
 * Reads a file of a private folder, as a record is read: only a regular file reached through no link,
 * inside the folder's real path; of this user and readable by them only, where files have owners; at
 * most `cap` bytes. Gives its bytes and when it was last changed, or undefined.
 */
export async function readPrivateFile(
  file: string,
  realFolder: string,
  context: RuntimeContext,
  cap: number,
): Promise<{ bytes: Buffer; modified: number } | undefined> {
  let modified: number;
  try {
    const stats = await lstat(file);
    if (stats.isSymbolicLink() || !stats.isFile()) return undefined;
    if (context.platform !== 'win32' && context.uid !== undefined) {
      if (stats.uid !== context.uid || (stats.mode & 0o077) !== 0) return undefined;
    }
    modified = stats.mtimeMs;
  } catch {
    return undefined;
  }
  const read = await readRegularFile(file, cap, { inside: realFolder });
  if (!read.ok) return undefined;
  return { bytes: read.bytes, modified };
}

function isRecord(value: unknown): value is ProgramRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.format === 1 &&
    typeof record.protocolVersion === 'number' &&
    Number.isInteger(record.pid) &&
    Number.isInteger(record.port) &&
    (record.port as number) > 0 &&
    (record.port as number) <= 65535 &&
    typeof record.folder === 'string' &&
    typeof record.credential === 'string' &&
    record.credential !== '' &&
    typeof record.startedAt === 'string'
  );
}

/** Whether `inner` lies inside `outer`, for the path rules of a platform. */
function isInsideWith(paths: typeof path.win32, outer: string, inner: string): boolean {
  const relative = paths.relative(outer, inner);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${paths.sep}`) &&
    !paths.isAbsolute(relative)
  );
}
