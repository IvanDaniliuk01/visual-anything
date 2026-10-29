/**
 * Installing the merge driver (ADR 0072): only `merge-driver --install`, which the person runs, writes
 * git's configuration, and only the driver's two keys, through `git config` by git's absolute path,
 * with arguments and never a shell. The driver's command names this very program by its absolute
 * path, quoted for git's shell, and `--install` adds the seven lines of `.gitattributes`.
 */
import { spawn as nodeSpawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  git,
  gitHome,
  gitStatus,
  NO_GIT,
  programFromSources,
  removeFolder,
  type GitHome,
} from './merge-driver-git-support';
import {
  ATTRIBUTE_LINES,
  DRIVER_KEYS,
  driverCommand,
  installEnvironment,
  refusedInstallCall,
  runMergeDriver,
  shellQuote,
  thisProgram,
  withAttributes,
  type ProgramCommand,
} from './merge-driver';
import { EXAMPLES } from './samples-source';
import type { Spawn } from './versions/git';

describe('the driver’s command', () => {
  it('quotes each word for the shell git runs it through', () => {
    expect(shellQuote('/opt/visual anything/bin')).toBe("'/opt/visual anything/bin'");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
    expect(shellQuote('$(touch x) `y`')).toBe("'$(touch x) `y`'");
  });

  it('names the single executable alone, by its absolute path', () => {
    const self = thisProgram({
      executable: true,
      execPath: 'C:\\Program Files\\Visual Anything\\visual-anything.exe',
      execArgv: [],
      entry: 'unused',
      tsconfig: 'unused',
      platform: 'win32',
    });
    expect(self).toEqual({
      ok: true,
      program: { env: {}, argv: ['C:/Program Files/Visual Anything/visual-anything.exe'] },
    });
    if (!self.ok) return;
    expect(driverCommand(self.program)).toEqual({
      ok: true,
      command:
        "'C:/Program Files/Visual Anything/visual-anything.exe' merge-driver %O %A %B %P %X %Y",
    });
  });

  it('names Node with its loaders and the entry, and the loader’s own configuration', () => {
    const self = thisProgram({
      executable: false,
      execPath: '/usr/bin/node',
      execArgv: [
        '--require',
        '/home/ada/va/node_modules/tsx/dist/preflight.cjs',
        '--inspect',
        '--import=file:///home/ada/va/node_modules/tsx/dist/loader.mjs',
        '--max-old-space-size=4096',
      ],
      entry: '/home/ada/va/packages/server/src/cli.ts',
      tsconfig: '/home/ada/va/packages/server/tsconfig.json',
      platform: 'linux',
    });
    expect(self).toEqual({
      ok: true,
      program: {
        env: { TSX_TSCONFIG_PATH: '/home/ada/va/packages/server/tsconfig.json' },
        argv: [
          '/usr/bin/node',
          '--require',
          '/home/ada/va/node_modules/tsx/dist/preflight.cjs',
          '--import',
          'file:///home/ada/va/node_modules/tsx/dist/loader.mjs',
          '/home/ada/va/packages/server/src/cli.ts',
        ],
      },
    });
    if (!self.ok) return;
    expect(driverCommand(self.program)).toEqual({
      ok: true,
      command:
        "TSX_TSCONFIG_PATH='/home/ada/va/packages/server/tsconfig.json' '/usr/bin/node' '--require' '/home/ada/va/node_modules/tsx/dist/preflight.cjs' '--import' 'file:///home/ada/va/node_modules/tsx/dist/loader.mjs' '/home/ada/va/packages/server/src/cli.ts' merge-driver %O %A %B %P %X %Y",
    });
  });

  it('refuses a loader named other than by its absolute path, which git would look up in the repository', () => {
    const self = thisProgram({
      executable: false,
      execPath: '/usr/bin/node',
      execArgv: ['--import', 'tsx'],
      entry: '/va/cli.ts',
      tsconfig: '/va/tsconfig.json',
      platform: 'linux',
    });
    expect(self.ok).toBe(false);
    if (!self.ok) expect(self.why).toMatch(/--import tsx, which is not an absolute path/);
  });

  it('refuses a path that holds a % or a control character', () => {
    const odd = (path: string): ProgramCommand => ({ env: {}, argv: [path] });
    const percent = driverCommand(odd('/opt/100%A/va'));
    expect(percent.ok).toBe(false);
    if (!percent.ok) expect(percent.why).toMatch(/holds a control character or a %/);
    const control = driverCommand(odd('/opt/a\nb/va'));
    expect(control.ok).toBe(false);
    if (!control.ok) expect(control.why).toContain('/opt/a\\u{a}b/va');
  });
});

describe('the calls installing makes', () => {
  it('allows the driver’s two keys alone, in the repository’s configuration or the global one', () => {
    for (const scope of ['--local', '--global']) {
      expect(
        refusedInstallCall(['config', scope, DRIVER_KEYS.name, 'Visual Anything']),
      ).toBeUndefined();
      expect(
        refusedInstallCall(['config', scope, DRIVER_KEYS.driver, "'/va' merge-driver"]),
      ).toBeUndefined();
      expect(refusedInstallCall(['config', scope, '--unset', DRIVER_KEYS.driver])).toBeUndefined();
    }
    expect(refusedInstallCall(['rev-parse', '--show-toplevel'])).toBeUndefined();
  });

  it('refuses every other call', () => {
    for (const args of [
      ['config', '--system', DRIVER_KEYS.name, 'x'],
      ['config', '--local', 'core.fsmonitor', 'touch x'],
      ['config', '--local', 'merge.visual-anything.recursive', 'binary'],
      ['config', '--local', DRIVER_KEYS.driver, '--add'],
      ['config', '--local', '--unset', 'core.hooksPath'],
      ['config', '--local', '--remove-section', 'merge.visual-anything'],
      ['config', DRIVER_KEYS.name, 'x'],
      ['config', '--local', DRIVER_KEYS.name, 'x', 'y'],
      ['rev-parse', '--show-toplevel', '--git-dir'],
      ['commit', '-m', 'x'],
      [],
    ]) {
      expect(refusedInstallCall(args), args.join(' ')).toMatch(/is not a call that installing/);
    }
  });

  it('gives git the runner’s environment, and where the person’s git reads its configuration', () => {
    const env = installEnvironment(
      {
        PATH: '/bin',
        HOME: '/home/ada',
        GIT_DIR: '/elsewhere',
        GIT_CONFIG_GLOBAL: '/home/ada/.config/git/mine',
        GIT_CONFIG_NOSYSTEM: '1',
        NODE_OPTIONS: '--require /x.js',
      },
      'linux',
    );
    expect(env).toMatchObject({
      PATH: '/bin',
      HOME: '/home/ada',
      GIT_CONFIG_GLOBAL: '/home/ada/.config/git/mine',
      GIT_CONFIG_NOSYSTEM: '1',
    });
    expect(env).not.toHaveProperty('GIT_DIR');
    expect(env).not.toHaveProperty('NODE_OPTIONS');
  });
});

describe('withAttributes', () => {
  it('adds the seven lines to a file without them, after what it holds', () => {
    const result = withAttributes('* text=auto eol=lf\n');
    expect(result.added).toBe(7);
    expect(result.text.startsWith('* text=auto eol=lf\n\n# ')).toBe(true);
    expect(result.text.endsWith(`${ATTRIBUTE_LINES.join('\n')}\n`)).toBe(true);
  });

  it('adds only the lines missing, and none twice', () => {
    const once = withAttributes(
      '*.vamodel merge=visual-anything\n*.vaview  -diff merge=visual-anything',
    );
    expect(once.added).toBe(5);
    expect(once.text).not.toMatch(/\*\.vamodel merge=visual-anything[\s\S]*\*\.vamodel merge/);
    expect(withAttributes(once.text)).toEqual({ text: once.text, added: 0 });
  });

  it('keeps the line endings the file uses, and starts an empty one', () => {
    const crlf = withAttributes('* text=auto\r\n');
    expect(crlf.text).toMatch(
      /^\* text=auto\r\n\r\n#[^\n]*\r\n\*\.vaproject merge=visual-anything\r\n/,
    );
    expect(crlf.text.replaceAll('\r\n', '')).not.toContain('\n');
    expect(withAttributes('').text.startsWith('# ')).toBe(true);
  });
});

describe('this repository', () => {
  it('names the driver for the seven kinds of project file in its .gitattributes', async () => {
    const text = await readFile(join(EXAMPLES, '..', '.gitattributes'), 'utf8');
    expect(withAttributes(text).added).toBe(0);
  });
});

describe.skipIf(NO_GIT)('installing in a repository', () => {
  let home: GitHome;
  let repository: string;
  let out: string[];
  let err: string[];
  let calls: { file: string; args: readonly string[]; shell: unknown }[];
  const program = programFromSources();

  beforeEach(async () => {
    home = await gitHome();
    repository = join(home.home, 'shop');
    git(home, home.home, 'init', '-q', repository);
    await writeFile(join(repository, '.gitattributes'), '* text=auto eol=lf\n');
    out = [];
    err = [];
    calls = [];
  });

  afterEach(async () => {
    // Every call was git by its absolute path, never through a shell, and one installing makes.
    for (const call of calls) {
      expect(isAbsolute(call.file)).toBe(true);
      expect(call.shell).toBe(false);
    }
    await removeFolder(home.home);
  });

  const spawn: Spawn = (file, args, options) => {
    calls.push({ file, args, shell: options.shell });
    return nodeSpawn(file, args, options);
  };

  function run(argv: string[], cwd = repository): Promise<number> {
    return runMergeDriver(argv, {
      cwd,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
      install: { env: home.env, program, spawn },
    });
  }

  const local = (key: string) => gitStatus(home, repository, 'config', '--local', '--get', key);

  it('defines the driver in the repository’s configuration, and names it in .gitattributes', async () => {
    expect(await run(['--install'])).toBe(0);
    const command = driverCommand(program);
    if (!command.ok) throw new Error(command.why);
    expect(local(DRIVER_KEYS.driver).stdout.trim()).toBe(command.command);
    expect(local(DRIVER_KEYS.name).stdout.trim()).toBe(
      'Visual Anything: project files merged by id',
    );
    const attributes = await readFile(join(repository, '.gitattributes'), 'utf8');
    expect(attributes.startsWith('* text=auto eol=lf\n')).toBe(true);
    for (const line of ATTRIBUTE_LINES) expect(attributes).toContain(`${line}\n`);
    expect(out.join('\n')).toMatch(/Added 7 lines to/);
    // Nothing reached the global configuration.
    await expect(readFile(home.globalConfig, 'utf8')).rejects.toThrow();
    // A second install changes nothing more.
    out = [];
    expect(await run(['--install'])).toBe(0);
    expect(await readFile(join(repository, '.gitattributes'), 'utf8')).toBe(attributes);
    expect(out.join('\n')).toMatch(/already names the driver/);
  });

  it('runs only the calls installing makes', async () => {
    expect(await run(['--install'])).toBe(0);
    expect(await run(['--uninstall'])).toBe(0);
    const made = calls.map((call) => {
      const start = call.args.findIndex((each) => each === 'config' || each === 'rev-parse');
      return call.args.slice(start);
    });
    for (const args of made) expect(refusedInstallCall(args)).toBeUndefined();
    expect(made.map((args) => args.slice(0, 3).join(' '))).toEqual([
      'rev-parse --show-toplevel',
      `config --local ${DRIVER_KEYS.name}`,
      `config --local ${DRIVER_KEYS.driver}`,
      'rev-parse --show-toplevel',
      'config --local --unset',
      'config --local --unset',
    ]);
  });

  it('works from a folder inside the repository, adding the lines at its top', async () => {
    const inside = join(repository, 'projects', 'shop');
    await mkdir(inside, { recursive: true });
    expect(await run(['--install'], inside)).toBe(0);
    expect(await readFile(join(repository, '.gitattributes'), 'utf8')).toContain(
      ATTRIBUTE_LINES[1],
    );
  });

  it('leaves .gitattributes alone with --no-attributes', async () => {
    expect(await run(['--install', '--no-attributes'])).toBe(0);
    expect(await readFile(join(repository, '.gitattributes'), 'utf8')).toBe('* text=auto eol=lf\n');
    expect(local(DRIVER_KEYS.driver).status).toBe(0);
  });

  it('defines it in the person’s global configuration with --global, and only there', async () => {
    expect(await run(['--install', '--global', '--no-attributes'])).toBe(0);
    const global = await readFile(home.globalConfig, 'utf8');
    expect(global).toContain('[merge "visual-anything"]');
    expect(local(DRIVER_KEYS.driver).status).not.toBe(0);
    expect(await run(['--uninstall', '--global'])).toBe(0);
    expect(
      gitStatus(home, repository, 'config', '--global', '--get', DRIVER_KEYS.driver).status,
    ).not.toBe(0);
  });

  it('takes the definition out again with --uninstall, and leaves .gitattributes', async () => {
    expect(await run(['--install'])).toBe(0);
    const attributes = await readFile(join(repository, '.gitattributes'), 'utf8');
    expect(await run(['--uninstall'])).toBe(0);
    expect(local(DRIVER_KEYS.driver).status).not.toBe(0);
    expect(local(DRIVER_KEYS.name).status).not.toBe(0);
    expect(await readFile(join(repository, '.gitattributes'), 'utf8')).toBe(attributes);
    // Uninstalling what is not installed is fine.
    expect(await run(['--uninstall'])).toBe(0);
  });

  it('refuses to install in no repository without --global', async () => {
    const nowhere = await mkdtemp(join(tmpdir(), 'va-merge-nowhere-'));
    try {
      expect(await run(['--install'], nowhere)).toBe(1);
      expect(err.join('\n')).toMatch(/in no git repository/);
      expect(await run(['--install', '--global'], nowhere)).toBe(0);
      expect(out.join('\n')).toMatch(/No \.gitattributes was changed/);
    } finally {
      await removeFolder(nowhere);
    }
  });
});
