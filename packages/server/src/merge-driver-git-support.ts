/**
 * What the merge driver's tests with a real git share: git in a home of its own, which never reads or
 * writes the person's configuration, and the driver's command as `--install` would write it.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CLI_ENTRY, OWN_TSCONFIG, thisProgram, type ProgramCommand } from './merge-driver';
import { GIT } from './versions/test-repositories';

export { GIT, NO_GIT } from './versions/test-repositories';

/** A temporary folder for a home, and the environment that keeps every git a test starts inside it. */
export interface GitHome {
  home: string;
  /** The file git reads and writes as the global configuration. */
  globalConfig: string;
  env: NodeJS.ProcessEnv;
}

export async function gitHome(): Promise<GitHome> {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'va-merge-home-')));
  await mkdir(join(home, '.config'), { recursive: true });
  const globalConfig = join(home, 'gitconfig');
  const kept = Object.fromEntries(
    Object.entries(process.env).filter(([name]) =>
      ['PATH', 'SYSTEMROOT', 'WINDIR', 'TMP', 'TEMP', 'TMPDIR'].includes(name.toUpperCase()),
    ),
  );
  return {
    home,
    globalConfig,
    env: {
      ...kept,
      HOME: home,
      USERPROFILE: home,
      XDG_CONFIG_HOME: join(home, '.config'),
      GIT_CONFIG_GLOBAL: globalConfig,
      GIT_CONFIG_NOSYSTEM: '1',
    },
  };
}

export async function removeFolder(folder: string): Promise<void> {
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
}

/** The fixed options every git a test starts with: an author, no signing, no line-ending changes. */
const SETUP = [
  '-c',
  'user.name=Ada Tester',
  '-c',
  'user.email=ada@example.com',
  '-c',
  'commit.gpgsign=false',
  '-c',
  'core.autocrlf=false',
  '-c',
  'init.defaultBranch=main',
];

/** Runs git in a test's home, and gives what it wrote; fails when git does. */
export function git(home: GitHome, cwd: string, ...args: string[]): string {
  if (GIT === undefined) throw new Error('No git.');
  return execFileSync(GIT, [...SETUP, ...args], {
    cwd,
    env: home.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Runs git in a test's home, and gives its status and output whatever it is. */
export function gitStatus(
  home: GitHome,
  cwd: string,
  ...args: string[]
): { status: number | null; stdout: string; stderr: string } {
  if (GIT === undefined) throw new Error('No git.');
  const result = spawnSync(GIT, [...SETUP, ...args], {
    cwd,
    env: home.env,
    encoding: 'utf8',
    timeout: 300_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** This program from its sources, as `--install` names it when run with `pnpm exec tsx`. */
export function programFromSources(): ProgramCommand {
  const loader = createRequire(import.meta.url).resolve('tsx');
  const self = thisProgram({
    executable: false,
    execPath: process.execPath,
    execArgv: ['--import', pathToFileURL(loader).href],
    entry: CLI_ENTRY,
    tsconfig: OWN_TSCONFIG,
    platform: process.platform,
  });
  if (!self.ok) throw new Error(self.why);
  return self.program;
}
