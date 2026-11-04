/**
 * The kept session (ADR 0099): the session token, kept across restarts of the local program in a
 * private record, so that a tab that had the session reconnects by itself once the program runs
 * again on the same projects folder or project folder, without a new launch address.
 *
 * The record sits beside Claude's (ADR 0029), in the runtime folder, checked as that folder is: in
 * the profile on Windows, the user's own and closed to everyone else elsewhere, each record readable
 * by its user only (ADR 0030). In a container it sits under the preferences on the volume, named by
 * `VISUAL_ANYTHING_SESSIONS`, so that it survives `docker restart`. It is reused only on the port the
 * program had, while it was kept within a day and made within 30 days; any other start makes a new
 * token. It never holds a launch code, and nothing in it is ever printed or put in an address.
 */
import { createHash } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import * as path from 'node:path';
import {
  currentContext,
  privateFolder,
  readPrivateFile,
  runtimeFolder,
  type RuntimeContext,
} from './claude/discovery';
import { writeFileAtomic } from './writer';

/** An absolute folder in this variable keeps the sessions instead of the runtime folder. */
export const SESSIONS_ENV = 'VISUAL_ANYTHING_SESSIONS';

/** How long after it was last kept a session is reused: a day. */
export const KEPT_SESSION_FOR = 24 * 60 * 60_000;

/** How long after it was made a session is reused at most, however often it is kept: 30 days. */
export const KEPT_SESSION_MOST = 30 * 24 * 60 * 60_000;

/** What the program keeps of its session. */
export interface KeptSession {
  format: 1;
  /** What the program had open when it started: home and its projects folder, or a project folder. */
  key: string;
  /** The session token. */
  token: string;
  /** The port it listened on, on 127.0.0.1. */
  port: number;
  /** At home, the real path of the project open when the session was last kept; absent at home. */
  project?: string;
  /** When the token was made, in ISO 8601. */
  madeAt: string;
  /** When the session was last kept, in ISO 8601: at each start, each project opened or closed, and the stop. */
  keptAt: string;
}

/** The token and the port a start resumes. */
export interface ResumedSession {
  token: string;
  port: number;
}

/** The longest record read. */
const SESSION_CAP = 16 * 1024;

/** How far ahead of now a record's times may be, for clocks that disagree a little. */
const CLOCK_SLACK = 2_000;

/** What the private folder's refusals call what it keeps. */
const SECRET = 'the session token';

/** A token as `createToken` makes it: 32 bytes in base64url. */
const TOKEN_FORM = /^[A-Za-z0-9_-]{43}$/;

/**
 * The folder sessions are kept in: an absolute `VISUAL_ANYTHING_SESSIONS`, or else the runtime folder,
 * where Claude's record is (ADR 0029, ADR 0030). A relative value is ignored.
 */
export function sessionsFolder(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  home: string,
): string {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const given = env[SESSIONS_ENV];
  if (given !== undefined && given !== '' && paths.isAbsolute(given)) return given;
  return runtimeFolder(platform, env, home);
}

/** The key of what a program starts on: home with its projects folder, or a project folder. */
export function sessionKey(where: { home: string } | { project: string }): string {
  return 'home' in where
    ? `home:${where.home.replaceAll('\\', '/')}`
    : `project:${where.project.replaceAll('\\', '/')}`;
}

/** The file a session is kept in: a hash of its key, in lower case where names do not tell case apart. */
export function keptSessionName(key: string, platform: NodeJS.Platform = process.platform): string {
  const folded = platform === 'win32' || platform === 'darwin' ? key.toLowerCase() : key;
  return `session-${createHash('sha256').update(folded, 'utf8').digest('hex').slice(0, 24)}.json`;
}

/**
 * The token and the port to resume from a kept session: only on the port it had, when the command
 * line asks for no port or for that one. On another port the token is made anew, so that a token a
 * tab sent to whatever answered on the old port is worth nothing (ADR 0099).
 */
export function resumableSession(
  kept: KeptSession | undefined,
  askedPort: number,
): ResumedSession | undefined {
  if (kept === undefined) return undefined;
  if (askedPort !== 0 && askedPort !== kept.port) return undefined;
  return { token: kept.token, port: kept.port };
}

/** Keeps a session in its folder, made private when needed, readable by its user only. */
export async function keepSession(
  folder: string,
  session: KeptSession,
  context: RuntimeContext = currentContext(),
): Promise<void> {
  const real = await privateFolder(folder, context, { create: true, secret: SECRET });
  const file = path.join(real, keptSessionName(session.key, context.platform));
  await writeFileAtomic(file, Buffer.from(`${JSON.stringify(session, null, 2)}\n`, 'utf8'), {
    mode: 0o600,
  });
}

/**
 * The session kept for a key, if a trusted one is there and still to be reused: kept within a day and
 * made within 30 days. Throws an `UnsafeRuntimeFolderError` for a folder other accounts could reach.
 */
export async function readKeptSession(
  folder: string,
  key: string,
  options: { context?: RuntimeContext; now?: number } = {},
): Promise<KeptSession | undefined> {
  const context = options.context ?? currentContext();
  const now = options.now ?? Date.now();
  try {
    await lstat(folder);
  } catch {
    return undefined;
  }
  const real = await privateFolder(folder, context, { create: false, secret: SECRET });
  const name = keptSessionName(key, context.platform);
  const read = await readPrivateFile(path.join(real, name), real, context, SESSION_CAP);
  if (read === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(read.bytes.toString('utf8'));
  } catch {
    return undefined;
  }
  if (!isKeptSession(value) || keptSessionName(value.key, context.platform) !== name) {
    return undefined;
  }
  const made = Date.parse(value.madeAt);
  const kept = Date.parse(value.keptAt);
  if (Number.isNaN(made) || Number.isNaN(kept)) return undefined;
  if (made > now + CLOCK_SLACK || kept > now + CLOCK_SLACK) return undefined;
  if (now - kept > KEPT_SESSION_FOR || now - made > KEPT_SESSION_MOST) return undefined;
  return value;
}

function isKeptSession(value: unknown): value is KeptSession {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.format === 1 &&
    typeof record.key === 'string' &&
    typeof record.token === 'string' &&
    TOKEN_FORM.test(record.token) &&
    Number.isInteger(record.port) &&
    (record.port as number) > 0 &&
    (record.port as number) <= 65535 &&
    (record.project === undefined || typeof record.project === 'string') &&
    typeof record.madeAt === 'string' &&
    typeof record.keptAt === 'string'
  );
}
