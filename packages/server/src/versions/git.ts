/**
 * The git runner (ADR 0071): the one way the program starts git. It runs the person's own git, found
 * once by its absolute path, with an argument list and never through a shell, only the subcommands
 * that read, every call behind the same options that turn off what could start a program, fetch or
 * write, in a cleaned environment, within its time and output limits.
 *
 * What it runs is built by `repository.ts` from git's own answers only: the prefix `rev-parse` gives,
 * the ids it lists. Nothing from a project file, a page or a message ever reaches an argument.
 */
import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process';
import { constants } from 'node:fs';
import * as fsp from 'node:fs/promises';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { isInside } from '../paths';

const KIB = 1024;
const MIB = 1024 * KIB;

/** The limits of ADR 0071. */
export interface GitLimits {
  /** How long one git call may take, in milliseconds. */
  callMs: number;
  /** How long reading one version may take in all, in milliseconds. */
  readMs: number;
  /** The most bytes of output one listing may give. */
  listingBytes: number;
  /** The most bytes of git's error output kept; the rest is dropped. */
  errorBytes: number;
  /** The most project files one version may hold. */
  files: number;
  /** The most bytes the project files of one version may hold in all. */
  totalBytes: number;
}

export const GIT_LIMITS: Readonly<GitLimits> = {
  callMs: 30_000,
  readMs: 120_000,
  listingBytes: 4 * MIB,
  errorBytes: 64 * KIB,
  files: 50_000,
  totalBytes: 256 * MIB,
};

/** The subcommands the runner runs: each only reads. `config` only with `--get` or `--get-regexp`. */
export const GIT_SUBCOMMANDS = [
  'version',
  'rev-parse',
  'for-each-ref',
  'log',
  'ls-tree',
  'cat-file',
  'config',
] as const;

export type GitSubcommand = (typeof GIT_SUBCOMMANDS)[number];

/** The oldest git the program reads versions with, and the first that has `--no-lazy-fetch`. */
export const OLDEST_GIT = { major: 2, minor: 36 } as const;
export const NO_LAZY_FETCH_GIT = { major: 2, minor: 44 } as const;

/** A git's version, as `git version` says it. */
export interface GitVersion {
  major: number;
  minor: number;
  patch: number;
  /** The version as git wrote it, such as `2.49.0.windows.1`. */
  text: string;
}

/** Whether a git is at least a version. */
export function atLeast(version: GitVersion, wanted: { major: number; minor: number }): boolean {
  return version.major > wanted.major || (version.major === wanted.major && version.minor >= wanted.minor);
}

/**
 * The options every call starts with (ADR 0071), before its subcommand. Two more than the ADR lists
 * turn off what `log` reads by the person's configuration: signatures, which start gpg, and the
 * mailmap, whose file may lie anywhere (ADR 0071's clarification of 2026-10-29).
 */
export function fixedOptions(noLazyFetch: boolean): string[] {
  return [
    '--no-pager',
    '--no-optional-locks',
    '--no-replace-objects',
    '--literal-pathspecs',
    ...(noLazyFetch ? ['--no-lazy-fetch'] : []),
    '-c',
    'core.fsmonitor=false',
    '-c',
    'protocol.allow=never',
    '-c',
    'gc.auto=0',
    '-c',
    'maintenance.auto=false',
    '-c',
    'credential.helper=',
    '-c',
    'log.showSignature=false',
    '-c',
    'log.mailmap=false',
  ];
}

/** Why a call is not one the runner runs, or `undefined` when it is. */
export function refusedCall(args: readonly string[]): string | undefined {
  const [subcommand, mode] = args;
  if (subcommand === undefined || !(GIT_SUBCOMMANDS as readonly string[]).includes(subcommand)) {
    return `git ${JSON.stringify(subcommand ?? '')} is not one of the commands Visual Anything runs, which only read.`;
  }
  if (subcommand === 'config' && mode !== '--get' && mode !== '--get-regexp') {
    return 'git config runs only with --get or --get-regexp, which read.';
  }
  return undefined;
}

/** The variables git gets from the program's environment; every other one is dropped. */
const KEPT = ['PATH', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'XDG_CONFIG_HOME', 'TMPDIR', 'TMP', 'TEMP'];
const KEPT_ON_WINDOWS = ['SystemRoot', 'windir'];

/**
 * The environment git runs in (ADR 0071): the path, the home and profile folders, the temporary
 * folder and, on Windows, `SystemRoot` and `windir`, so that git reads the person's own configuration;
 * then `LC_ALL=C`, so that its messages parse, and the variables that keep it from prompting, writing
 * optional locks or fetching. No `GIT_*` the program inherited reaches it.
 */
export function gitEnvironment(
  inherited: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): Record<string, string> {
  const env: Record<string, string> = {};
  const names = platform === 'win32' ? [...KEPT, ...KEPT_ON_WINDOWS] : KEPT;
  for (const name of names) {
    // Windows reads its variables without case: `Path` is `PATH`.
    const key =
      platform === 'win32'
        ? Object.keys(inherited).find((each) => each.toUpperCase() === name.toUpperCase())
        : name;
    const value = key === undefined ? undefined : inherited[key];
    if (key !== undefined && value !== undefined) env[key] = value;
  }
  return {
    ...env,
    LC_ALL: 'C',
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_NO_LAZY_FETCH: '1',
  };
}

/** What went wrong with a git call. */
export type GitFailure =
  /** The call is not one the runner runs. */
  | 'refused'
  /** Git could not be started. */
  | 'spawn'
  /** Git ended with an error; its code and what it said are kept. */
  | 'exit'
  /** The call, or the read it is part of, took too long and was killed. */
  | 'timeout'
  /** A newer request stopped the read it was part of. */
  | 'stopped'
  /** Git said more than the call takes, or what it said did not read. */
  | 'output';

export class GitError extends Error {
  constructor(
    readonly failure: GitFailure,
    message: string,
    readonly code?: number,
    readonly stderr = '',
  ) {
    super(message);
    this.name = 'GitError';
  }
}

/** The parts of a started process the runner uses. */
export interface GitProcess {
  stdin: Writable | null;
  stdout: Readable | null;
  stderr: Readable | null;
  kill(): boolean;
  once(event: 'error', listener: (error: Error) => void): unknown;
  once(event: 'close', listener: (code: number | null) => void): unknown;
}

/** Starts a process, as `child_process.spawn` does; tests record every call through it. */
export type Spawn = (file: string, args: readonly string[], options: SpawnOptions) => GitProcess;

/** One call of git. */
export interface GitCall {
  /** The subcommand and its arguments, after the fixed options. */
  args: readonly string[];
  /** What git reads from its input, for `cat-file --batch`. */
  input?: string;
  /**
   * Takes git's output as it comes; throwing stops git, and the call fails with what it threw. By
   * default the output is kept, up to `maxOutput` bytes.
   */
  output?: (chunk: Buffer) => void;
  /** The most bytes of output kept by default; the listing's limit when left out. */
  maxOutput?: number;
  /** Stops the call: its reason, a {@link GitError}, is what the call fails with. */
  signal?: AbortSignal;
}

export interface GitOptions {
  /** The real path of the project folder, where git runs. */
  cwd: string;
  /** The environment the program inherited; `process.env` by default. Only what git needs is kept. */
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  spawn?: Spawn;
  limits?: Partial<GitLimits>;
}

/** The person's git, by its absolute path, and how the program runs it. */
export class Git {
  readonly limits: GitLimits;
  readonly #options: GitOptions;
  readonly #env: Record<string, string>;
  readonly #spawn: Spawn;

  constructor(
    readonly path: string,
    readonly version: GitVersion,
    options: GitOptions,
  ) {
    this.#options = options;
    this.limits = { ...GIT_LIMITS, ...options.limits };
    this.#env = gitEnvironment(options.env ?? process.env, options.platform);
    this.#spawn = options.spawn ?? (nodeSpawn as unknown as Spawn);
  }

  /** Whether this git keeps a read from fetching what a partial clone lacks. */
  get hasNoLazyFetch(): boolean {
    return atLeast(this.version, NO_LAZY_FETCH_GIT);
  }

  /** Runs one call; resolves with what git wrote, when it is kept, or fails with a {@link GitError}. */
  run(call: GitCall): Promise<Buffer> {
    return runGit(this.path, fixedOptions(this.hasNoLazyFetch), call, {
      cwd: this.#options.cwd,
      env: this.#env,
      spawn: this.#spawn,
      limits: this.limits,
    });
  }
}

interface RunContext {
  cwd: string;
  env: Record<string, string>;
  spawn: Spawn;
  limits: GitLimits;
}

function runGit(
  path: string,
  options: readonly string[],
  call: GitCall,
  context: RunContext,
): Promise<Buffer> {
  const refused = refusedCall(call.args);
  if (refused !== undefined) return Promise.reject(new GitError('refused', refused));
  if (call.signal?.aborted) return Promise.reject(abortReason(call.signal));
  return new Promise<Buffer>((resolvePromise, reject) => {
    let child: GitProcess;
    try {
      child = context.spawn(path, [...options, ...call.args], {
        cwd: context.cwd,
        env: context.env,
        shell: false,
        windowsHide: true,
        stdio: [call.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      reject(new GitError('spawn', `Git could not be started: ${reasonOf(error)}`));
      return;
    }
    let settled = false;
    let stopped: GitError | undefined;
    const chunks: Buffer[] = [];
    let kept = 0;
    let errors = '';
    let errorBytes = 0;
    const maxOutput = call.maxOutput ?? context.limits.listingBytes;

    const finish = (error: GitError | undefined, output?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      call.signal?.removeEventListener('abort', onAbort);
      if (error === undefined) resolvePromise(output ?? Buffer.alloc(0));
      else reject(error);
    };
    const stop = (error: GitError) => {
      stopped ??= error;
      child.kill();
      finish(stopped);
    };
    const onAbort = () => stop(abortReason(call.signal));
    const timer = setTimeout(
      () =>
        stop(
          new GitError(
            'timeout',
            `git ${call.args[0]} took longer than ${context.limits.callMs / 1000} s, so it was stopped.`,
          ),
        ),
      context.limits.callMs,
    );
    call.signal?.addEventListener('abort', onAbort, { once: true });

    child.once('error', (error) =>
      finish(new GitError('spawn', `Git could not be started: ${reasonOf(error)}`)),
    );
    child.stdout?.on('data', (chunk: Buffer) => {
      if (settled) return;
      if (call.output !== undefined) {
        try {
          call.output(chunk);
        } catch (error) {
          stop(
            error instanceof GitError
              ? error
              : new GitError('output', `What git said did not read: ${reasonOf(error)}`),
          );
        }
        return;
      }
      kept += chunk.length;
      if (kept > maxOutput) {
        stop(
          new GitError(
            'output',
            `git ${call.args[0]} said more than ${describeBytes(maxOutput)}, the most Visual Anything reads of it.`,
          ),
        );
        return;
      }
      chunks.push(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (errorBytes >= context.limits.errorBytes) return;
      const part = chunk.subarray(0, context.limits.errorBytes - errorBytes);
      errorBytes += part.length;
      errors += part.toString('utf8');
    });
    child.once('close', (code) => {
      if (stopped !== undefined) return finish(stopped);
      if (code !== 0) {
        const said = errors.trim();
        return finish(
          new GitError(
            'exit',
            said === '' ? `git ${call.args[0]} failed.` : said,
            code ?? undefined,
            errors,
          ),
        );
      }
      finish(undefined, Buffer.concat(chunks));
    });
    if (call.input !== undefined && child.stdin) {
      // Git may end before it reads everything, as when it fails; that is its answer, not ours.
      child.stdin.on('error', () => {});
      child.stdin.end(call.input);
    }
  });
}

function abortReason(signal: AbortSignal | undefined): GitError {
  const reason: unknown = signal?.reason;
  return reason instanceof GitError
    ? reason
    : new GitError('stopped', 'A newer request stopped this one.');
}

/** A number of bytes in words: `64 KiB`, `4 MiB`. */
export function describeBytes(bytes: number): string {
  if (bytes < KIB) return `${bytes} bytes`;
  if (bytes < MIB) return `${Math.round(bytes / KIB)} KiB`;
  return `${Math.round((bytes / MIB) * 10) / 10} MiB`;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ——— Finding git ———

/** The variable that may name git's absolute path, for tests and portable installs. */
export const GIT_ENV = 'VISUAL_ANYTHING_GIT';

/** The file system calls finding git makes; tests replace them. */
export interface FinderFs {
  realpath(path: string): Promise<string>;
  stat(path: string): Promise<{ isFile(): boolean }>;
  lstat(path: string): Promise<unknown>;
  /** Resolves when the file may be run; rejects otherwise. */
  access(path: string, mode: number): Promise<void>;
}

const REAL_FINDER_FS: FinderFs = {
  realpath: (path) => fsp.realpath(path),
  stat: (path) => fsp.stat(path),
  lstat: (path) => fsp.lstat(path),
  access: (path, mode) => fsp.access(path, mode),
};

export interface FindGitOptions {
  /** The real path of the project folder. */
  projectFolder: string;
  /** The folder the program was started in; the process's current folder by default. */
  startedIn?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  fs?: FinderFs;
  /** Prints a warning, such as about a relative {@link GIT_ENV}. */
  warn?: (line: string) => void;
}

/** Git's absolute path, or why none was found. */
export type FoundGit = { ok: true; path: string } | { ok: false; why: string };

/** Why comparing with a commit cannot run without git. */
export const NO_GIT =
  'Comparing with a commit needs git 2.36 or later, and none was found: install git, or name it with VISUAL_ANYTHING_GIT. Comparing with the project as opened works without it.';

/**
 * Finds the person's git (ADR 0071): {@link GIT_ENV} when it names an absolute path, or else the
 * first `git.exe` on Windows, `git` elsewhere, among the absolute entries of PATH that lie outside
 * the project folder, its repository and the folder the program was started in, and that is a
 * regular file once links are resolved. It never takes a `.bat` or `.cmd`, which would run through
 * `cmd.exe`, and never looks in the current folder.
 */
export async function findGit(options: FindGitOptions): Promise<FoundGit> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const fs = options.fs ?? REAL_FINDER_FS;
  const named = valueOf(env, GIT_ENV, platform);
  if (named !== undefined && named !== '') {
    if (isAbsoluteOn(named, platform)) {
      const real = await runnable(named, fs, platform);
      if (real !== undefined) return { ok: true, path: real };
      return {
        ok: false,
        why: `${GIT_ENV} names ${named}, which is not a regular file that can be run.`,
      };
    }
    options.warn?.(`${GIT_ENV} is not an absolute path, so it is ignored: ${named}`);
  }
  const avoided = [
    options.projectFolder,
    await repositoryFolderOf(options.projectFolder, fs),
    resolve(options.startedIn ?? process.cwd()),
  ].filter((each): each is string => each !== undefined);
  const isAvoided = (path: string) =>
    avoided.some((folder) => samePath(folder, path, platform) || isInside(folder, path));
  const name = platform === 'win32' ? 'git.exe' : 'git';
  const separator = platform === 'win32' ? ';' : delimiter;
  for (const entry of (valueOf(env, 'PATH', platform) ?? '').split(separator)) {
    const folder = platform === 'win32' ? entry.replace(/^"(.*)"$/, '$1') : entry;
    if (folder === '' || !isAbsoluteOn(folder, platform) || isAvoided(folder)) continue;
    const real = await runnable(join(folder, name), fs, platform);
    if (real !== undefined && !isAvoided(real)) return { ok: true, path: real };
  }
  return { ok: false, why: NO_GIT };
}

/** The real path of a regular file that can be run, or `undefined`. */
async function runnable(
  path: string,
  fs: FinderFs,
  platform: NodeJS.Platform,
): Promise<string | undefined> {
  try {
    const real = await fs.realpath(path);
    if (!(await fs.stat(real)).isFile()) return undefined;
    if (platform !== 'win32') await fs.access(real, constants.X_OK);
    return real;
  } catch {
    return undefined;
  }
}

/** The nearest folder at or above the project folder that holds `.git`: its repository's top. */
async function repositoryFolderOf(folder: string, fs: FinderFs): Promise<string | undefined> {
  for (let current = folder; ; current = dirname(current)) {
    try {
      await fs.lstat(join(current, '.git'));
      return current;
    } catch {
      // Not here: look one folder up.
    }
    if (dirname(current) === current) return undefined;
  }
}

function valueOf(
  env: NodeJS.ProcessEnv,
  name: string,
  platform: NodeJS.Platform,
): string | undefined {
  if (platform !== 'win32') return env[name];
  const key = Object.keys(env).find((each) => each.toUpperCase() === name.toUpperCase());
  return key === undefined ? undefined : env[key];
}

function isAbsoluteOn(path: string, platform: NodeJS.Platform): boolean {
  // A Windows path is absolute only with its drive or share: `\git` is relative to the drive.
  return platform === 'win32' ? /^(?:[a-zA-Z]:[\\/]|\\\\)/.test(path) : isAbsolute(path);
}

/** Whether a path is a folder or lies inside it, both resolved, without case on Windows. */
export function isInsidePath(
  folder: string,
  path: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return samePath(folder, path, platform) || isInside(resolve(folder), resolve(path));
}

function samePath(a: string, b: string, platform: NodeJS.Platform): boolean {
  const normal = (path: string) => {
    const resolved = resolve(path).replace(/[\\/]+$/, '');
    return platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normal(a) === normal(b);
}

/** Reads what `git version` says, such as `git version 2.49.0.windows.1`. */
export function parseGitVersion(text: string): GitVersion | undefined {
  const match = /^git version ((\d+)\.(\d+)(?:\.(\d+))?\S*)\s*$/.exec(text);
  if (match === null) return undefined;
  const [, whole = '', major = '', minor = '', patch = '0'] = match;
  return { major: Number(major), minor: Number(minor), patch: Number(patch), text: whole };
}

/**
 * Starts the git found and asks its version, which must be {@link OLDEST_GIT} or later: the git to
 * run, or why there is none.
 */
export async function startGit(
  found: string,
  options: GitOptions,
): Promise<{ ok: true; git: Git } | { ok: false; why: string }> {
  const asking = new Git(found, { major: 0, minor: 0, patch: 0, text: '' }, options);
  let said: string;
  try {
    said = (await asking.run({ args: ['version'], maxOutput: 4 * KIB })).toString('utf8');
  } catch (error) {
    return { ok: false, why: `The git found, ${found}, does not run: ${reasonOf(error)}` };
  }
  const version = parseGitVersion(said);
  if (version === undefined) {
    return { ok: false, why: `The git found, ${found}, does not say its version.` };
  }
  if (!atLeast(version, OLDEST_GIT)) {
    return {
      ok: false,
      why: `Comparing with a commit needs git 2.36 or later, and the git found is ${version.text}. Comparing with the project as opened works without it.`,
    };
  }
  return { ok: true, git: new Git(found, version, options) };
}
