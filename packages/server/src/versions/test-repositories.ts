/**
 * What the tests of versions share: the person's git, found as the program finds it; repositories
 * made in temporary folders; a spawn that records every call the runner makes; and the check that
 * each call is one ADR 0071 allows.
 */
import { execFileSync, spawn as nodeSpawn, type SpawnOptions } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import type { ProjectSnapshot } from '@visual-anything/core';
import { expect } from 'vitest';
import { writeProjectFolder } from '../test-support';
import { findGit, fixedOptions, GIT_SUBCOMMANDS, type GitProcess, type Spawn } from './git';

/** The person's git, found as the program finds it, or `undefined` where there is none. */
export const GIT: string | undefined = await (async () => {
  const found = await findGit({ projectFolder: await realpath(tmpdir()) });
  return found.ok ? found.path : undefined;
})();

/** Why the tests that need git are skipped. */
export const NO_GIT = GIT === undefined;

/** The environment setup commands run in: the program's, without any `GIT_*`. */
function setupEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_')),
  );
}

/**
 * Runs git to set a test repository up: never through the runner, and with a fixed author, no
 * signing and no line-ending conversion, so that each test makes the same repository.
 */
export function git(cwd: string, ...args: string[]): string {
  if (GIT === undefined) throw new Error('No git.');
  return execFileSync(
    GIT,
    [
      '-c',
      'user.name=Ada Tester',
      '-c',
      'user.email=ada@example.com',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'tag.gpgsign=false',
      '-c',
      'core.autocrlf=false',
      '-c',
      'init.defaultBranch=main',
      ...args,
    ],
    { cwd, env: setupEnv(), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
}

/** Runs git to set up with input, such as `hash-object --stdin`. */
export function gitWithInput(cwd: string, input: string | Buffer, ...args: string[]): string {
  if (GIT === undefined) throw new Error('No git.');
  return execFileSync(GIT, args, { cwd, env: setupEnv(), input, encoding: 'utf8' });
}

/** Makes a temporary folder, its real path. */
export async function temporaryFolder(prefix = 'va-versions-'): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), prefix)));
}

export async function removeFolder(folder: string): Promise<void> {
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
}

/** A new repository in `root`, with the project written at `prefix` and committed. */
export async function commitProject(
  root: string,
  project: ProjectSnapshot,
  options: { prefix?: string; message?: string; init?: boolean } = {},
): Promise<string> {
  if (options.init !== false) git(root, 'init', '-q');
  const folder = options.prefix === undefined ? root : join(root, options.prefix);
  await writeProjectFolder(folder, project);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '--allow-empty', '-m', options.message ?? 'Write the project');
  return git(root, 'rev-parse', 'HEAD').trim();
}

/** One call the runner made. */
export interface RecordedCall {
  file: string;
  args: readonly string[];
  options: SpawnOptions;
  /** What it gave git to read. */
  input: string;
}

/** A spawn that starts git as the program does, and records each call. */
export function recordingSpawn(): { spawn: Spawn; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const spawn: Spawn = (file, args, options) => {
    const call: RecordedCall = { file, args, options, input: '' };
    calls.push(call);
    const child = nodeSpawn(file, args, options);
    const write = child.stdin?.write.bind(child.stdin);
    const end = child.stdin?.end.bind(child.stdin);
    if (child.stdin && write && end) {
      child.stdin.end = ((chunk?: unknown, ...rest: unknown[]) => {
        if (typeof chunk === 'string') call.input += chunk;
        return (end as (...each: unknown[]) => unknown)(chunk, ...rest);
      }) as typeof child.stdin.end;
    }
    return child as unknown as GitProcess;
  };
  return { spawn, calls };
}

/** The variables git may get: those ADR 0071 keeps, and the four it sets. */
const ALLOWED_ENV = new Set([
  'PATH',
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'XDG_CONFIG_HOME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'SYSTEMROOT',
  'WINDIR',
  'LC_ALL',
  'GIT_TERMINAL_PROMPT',
  'GIT_OPTIONAL_LOCKS',
  'GIT_NO_LAZY_FETCH',
]);

/**
 * Checks every call against ADR 0071: git by its absolute path, an argument list without a shell,
 * hidden, in the project folder; the fixed options first, then one of the read subcommands, with
 * `config` only reading; every ref after `--end-of-options` and every path after `--`; and only the
 * variables allowed.
 */
export function expectAllowedCalls(
  calls: readonly RecordedCall[],
  expected: { git: string; cwd: string; noLazyFetch: boolean },
): void {
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    // Asking git its version comes before the program knows whether it has --no-lazy-fetch.
    const asksVersion = call.args.at(-1) === 'version';
    const fixed = fixedOptions(expected.noLazyFetch && !asksVersion);
    expect(call.file).toBe(expected.git);
    expect(call.options.shell).toBe(false);
    expect(call.options.windowsHide).toBe(true);
    expect(call.options.cwd).toBe(expected.cwd);
    for (const name of Object.keys(call.options.env ?? {})) {
      expect(ALLOWED_ENV.has(name.toUpperCase()), name).toBe(true);
    }
    expect(call.options.env?.LC_ALL).toBe('C');
    expect(call.options.env?.GIT_TERMINAL_PROMPT).toBe('0');
    expect(call.options.env?.GIT_NO_LAZY_FETCH).toBe('1');
    expect(call.args.slice(0, fixed.length)).toEqual(fixed);
    const [subcommand, ...rest] = call.args.slice(fixed.length);
    expect(GIT_SUBCOMMANDS as readonly string[]).toContain(subcommand);
    if (subcommand === 'config') expect(['--get', '--get-regexp']).toContain(rest[0]);
    // What names a ref or a path comes after the marker that ends git's options.
    const refAt = rest.indexOf('--end-of-options');
    const pathsAt = rest.indexOf('--');
    for (const [at, arg] of rest.entries()) {
      const isOption = arg.startsWith('-');
      const afterMarkers = (refAt >= 0 && at > refAt) || (pathsAt >= 0 && at > pathsAt);
      if (!isOption && !afterMarkers) {
        // Only the values of options, fixed by the program, sit before the markers.
        expect(['--get', '--get-regexp'].includes(rest[at - 1] ?? '') || /^\d+$/.test(arg)).toBe(
          true,
        );
      }
    }
  }
}

/** Every file under a folder with a hash of its bytes, size and time: to see that nothing changed. */
export async function fingerprint(folder: string): Promise<Map<string, string>> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  const prints = new Map<string, string>();
  for (const entry of entries) {
    const path = join(entry.parentPath, entry.name);
    const info = await stat(path);
    const key = relative(folder, path).replaceAll('\\', '/');
    if (entry.isFile()) {
      const hash = createHash('sha256')
        .update(await readFile(path))
        .digest('hex');
      prints.set(key, `${hash} ${info.size} ${info.mtimeMs}`);
    } else {
      prints.set(key, `${entry.isDirectory() ? 'folder' : 'other'} ${info.mtimeMs}`);
    }
  }
  return prints;
}
