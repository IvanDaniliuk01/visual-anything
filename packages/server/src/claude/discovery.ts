/**
 * How Claude's MCP entry point finds the running local program of a project. Each running program
 * leaves a record in the runtime folder, a folder only its user may read, keyed by the project
 * folder's real path: the program's process, its port and Claude's credential for the Claude
 * endpoint. The record is written when the program listens and removed when it stops.
 *
 * The credential is a secret of its own: it opens only the Claude endpoint, which accepts only what
 * Claude may send, and it is never the session token, which never leaves the program.
 */
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, readdir } from 'node:fs/promises';
import * as path from 'node:path';
import { errorCode } from '../errors';
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
}

/** The longest record file read. */
const RECORD_CAP = 16 * 1024;

/**
 * The runtime folder: `%LOCALAPPDATA%\Visual Anything\run` on Windows,
 * `~/Library/Application Support/Visual Anything/run` on macOS, `$XDG_RUNTIME_DIR/visual-anything`
 * elsewhere, or `$XDG_STATE_HOME/visual-anything/run`, or `~/.local/state/visual-anything/run`.
 * An absolute `VISUAL_ANYTHING_RUNTIME` names another one; relative values are ignored.
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
    const local = absolute(env.LOCALAPPDATA) ?? paths.join(home, 'AppData', 'Local');
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
export async function writeProgramRecord(runtime: string, record: ProgramRecord): Promise<string> {
  await privateFolder(runtime);
  const file = path.join(runtime, recordName(record.folder));
  await writeFileAtomic(file, Buffer.from(`${JSON.stringify(record, null, 2)}\n`, 'utf8'), {
    mode: 0o600,
  });
  return file;
}

/** Removes a record, but only while it still names this process: another may have taken its place. */
export async function removeProgramRecord(file: string, pid: number): Promise<void> {
  const record = await readRecordFile(file);
  if (record?.pid !== pid) return;
  await removeFile(file).catch(() => {});
}

/** The record of the program that has a project folder open, if one left a valid record. */
export async function readProgramRecord(
  runtime: string,
  folder: string,
): Promise<ProgramRecord | undefined> {
  const record = await readRecordFile(path.join(runtime, recordName(folder)));
  return record !== undefined && recordName(record.folder) === recordName(folder)
    ? record
    : undefined;
}

/** Every valid record in the runtime folder. */
export async function listProgramRecords(runtime: string): Promise<ProgramRecord[]> {
  let names: string[];
  try {
    names = await readdir(runtime);
  } catch {
    return [];
  }
  const records = await Promise.all(
    names
      .filter((name) => /^[0-9a-f]{24}\.json$/.test(name))
      .map((name) => readRecordFile(path.join(runtime, name))),
  );
  return records.filter((record) => record !== undefined);
}

/** Whether a process is running; one this user may not signal is running too. */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) === 'EPERM';
  }
}

/** Reads a record file: a regular file of this user, holding a record of this format. */
async function readRecordFile(file: string): Promise<ProgramRecord | undefined> {
  if (process.getuid !== undefined) {
    try {
      if ((await lstat(file)).uid !== process.getuid()) return undefined;
    } catch {
      return undefined;
    }
  }
  const read = await readRegularFile(file, RECORD_CAP);
  if (!read.ok) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(read.bytes.toString('utf8'));
  } catch {
    return undefined;
  }
  return isRecord(value) ? value : undefined;
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

/**
 * Makes the runtime folder if needed, only its user may enter: a real folder, not a link, and on
 * platforms with owners, owned by this user and closed to everyone else.
 */
async function privateFolder(folder: string): Promise<void> {
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const stats = await lstat(folder);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${folder} is not a real folder, so Claude's credential is not written there.`);
  }
  if (process.getuid === undefined) return;
  if (stats.uid !== process.getuid()) {
    throw new Error(
      `${folder} belongs to another user, so Claude's credential is not written there.`,
    );
  }
  if ((stats.mode & 0o077) !== 0) await chmod(folder, 0o700);
}
