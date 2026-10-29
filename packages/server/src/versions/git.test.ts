/**
 * The git runner (ADR 0071): what it runs, how, with what, and within what limits; and how it finds
 * git. These tests start no git: a fake process stands in for it.
 */
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  findGit,
  fixedOptions,
  Git,
  GitError,
  gitEnvironment,
  parseGitVersion,
  refusedCall,
  startGit,
  type FinderFs,
  type GitProcess,
  type Spawn,
} from './git';

const VERSION = { major: 2, minor: 49, patch: 0, text: '2.49.0' };
const OLD = { major: 2, minor: 40, patch: 0, text: '2.40.0' };

/** A process that answers as a script says, and records how it was started and stopped. */
class FakeProcess extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;
  input = '';

  constructor() {
    super();
    this.stdin.on('data', (chunk: Buffer) => (this.input += chunk.toString('utf8')));
  }

  kill(): boolean {
    this.killed = true;
    setImmediate(() => this.emit('close', null));
    return true;
  }

  /** Writes its output and ends with a code. */
  answer(out: string | Buffer, code = 0, err = ''): void {
    setImmediate(() => {
      if (err !== '') this.stderr.write(err);
      this.stdout.write(out);
      setImmediate(() => this.emit('close', code));
    });
  }
}

interface Started {
  file: string;
  args: readonly string[];
  options: Parameters<Spawn>[2];
  process: FakeProcess;
}

function fakeSpawn(script: (started: Started) => void = (each) => each.process.answer('')) {
  const started: Started[] = [];
  const spawn: Spawn = (file, args, options) => {
    const process = new FakeProcess();
    const each = { file, args, options, process };
    started.push(each);
    script(each);
    return process as unknown as GitProcess;
  };
  return { spawn, started };
}

function gitWith(
  spawn: Spawn,
  more: Partial<ConstructorParameters<typeof Git>[2]> = {},
  version = VERSION,
): Git {
  return new Git('/usr/bin/git', version, { cwd: '/work/project', spawn, env: {}, ...more });
}

describe('the calls the runner makes', () => {
  it('runs only the subcommands that read, and config only to read', () => {
    for (const allowed of [
      ['version'],
      ['rev-parse', '--show-toplevel'],
      ['for-each-ref'],
      ['log', '-z'],
      ['ls-tree', '-z'],
      ['cat-file', '--batch'],
      ['config', '--get', 'core.bare'],
      ['config', '--get-regexp', '^remote'],
    ]) {
      expect(refusedCall(allowed)).toBeUndefined();
    }
    for (const refused of [
      [],
      ['show', 'HEAD:a'],
      ['checkout', 'main'],
      ['fetch'],
      ['gc'],
      ['worktree', 'add'],
      ['stash'],
      ['notes', 'add'],
      ['update-index', '--refresh'],
      ['diff'],
      ['status'],
      ['config', 'core.bare', 'true'],
      ['config', '--add', 'safe.directory', '*'],
      ['config', '--unset', 'x'],
      ['-c', 'core.pager=x', 'log'],
      ['--exec-path=/tmp', 'log'],
    ]) {
      expect(refusedCall(refused), refused.join(' ')).toMatch(/only read|--get/);
    }
  });

  it('refuses any other call before a process starts', async () => {
    const { spawn, started } = fakeSpawn();
    const git = gitWith(spawn);
    for (const args of [['show', 'HEAD'], ['config', '--add', 'a.b', 'c'], ['fetch']]) {
      await expect(git.run({ args })).rejects.toMatchObject({ failure: 'refused' });
    }
    expect(started).toEqual([]);
  });

  it('starts git by its path, with an argument list, no shell, hidden, in the project folder', async () => {
    const { spawn, started } = fakeSpawn((each) => each.process.answer('ok'));
    const output = await gitWith(spawn).run({ args: ['rev-parse', '--show-prefix'] });
    expect(output.toString()).toBe('ok');
    const [call] = started;
    expect(call?.file).toBe('/usr/bin/git');
    expect(call?.options).toMatchObject({ cwd: '/work/project', shell: false, windowsHide: true });
    expect(call?.args).toEqual([...fixedOptions(true), 'rev-parse', '--show-prefix']);
  });

  it('starts every call with the same options, --no-lazy-fetch where git has it', () => {
    const options = fixedOptions(true);
    expect(options.slice(0, 5)).toEqual([
      '--no-pager',
      '--no-optional-locks',
      '--no-replace-objects',
      '--literal-pathspecs',
      '--no-lazy-fetch',
    ]);
    const settings = options.filter((_, at) => options[at - 1] === '-c');
    expect(settings).toEqual([
      'core.fsmonitor=false',
      'protocol.allow=never',
      'gc.auto=0',
      'maintenance.auto=false',
      'credential.helper=',
      'log.showSignature=false',
      'log.mailmap=false',
    ]);
    expect(fixedOptions(false)).not.toContain('--no-lazy-fetch');
    expect(fixedOptions(false)).toHaveLength(options.length - 1);
  });

  it('runs an older git without --no-lazy-fetch', async () => {
    const { spawn, started } = fakeSpawn();
    await gitWith(spawn, {}, OLD).run({ args: ['version'] });
    expect(started[0]?.args).toEqual([...fixedOptions(false), 'version']);
  });

  it('gives git a cleaned environment: no GIT_* the program inherited reaches it', () => {
    const inherited = {
      PATH: '/usr/bin:/bin',
      HOME: '/home/ada',
      TMPDIR: '/tmp',
      XDG_CONFIG_HOME: '/home/ada/.config',
      GIT_DIR: '/elsewhere/.git',
      GIT_WORK_TREE: '/elsewhere',
      GIT_CONFIG_PARAMETERS: "'core.pager=evil'",
      GIT_EXTERNAL_DIFF: 'evil',
      GIT_CONFIG_GLOBAL: '/elsewhere/config',
      GIT_SSH_COMMAND: 'evil',
      GIT_ASKPASS: 'evil',
      SSH_AUTH_SOCK: '/tmp/agent',
      NODE_OPTIONS: '--require evil',
      LANG: 'es_AR.UTF-8',
      AWS_SECRET_ACCESS_KEY: 'secret',
    };
    expect(gitEnvironment(inherited, 'linux')).toEqual({
      PATH: '/usr/bin:/bin',
      HOME: '/home/ada',
      TMPDIR: '/tmp',
      XDG_CONFIG_HOME: '/home/ada/.config',
      LC_ALL: 'C',
      GIT_TERMINAL_PROMPT: '0',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_NO_LAZY_FETCH: '1',
    });
  });

  it('keeps the Windows variables, read without case', () => {
    const env = gitEnvironment(
      {
        Path: 'C:\\Git\\cmd',
        USERPROFILE: 'C:\\Users\\Ada',
        HOMEDRIVE: 'C:',
        HOMEPATH: '\\Users\\Ada',
        TEMP: 'C:\\Temp',
        TMP: 'C:\\Temp',
        SystemRoot: 'C:\\Windows',
        windir: 'C:\\Windows',
        ComSpec: 'C:\\Windows\\system32\\cmd.exe',
        PATHEXT: '.COM;.EXE;.BAT;.CMD',
        Git_Dir: 'C:\\elsewhere',
      },
      'win32',
    );
    expect(env).toEqual({
      Path: 'C:\\Git\\cmd',
      USERPROFILE: 'C:\\Users\\Ada',
      HOMEDRIVE: 'C:',
      HOMEPATH: '\\Users\\Ada',
      TEMP: 'C:\\Temp',
      TMP: 'C:\\Temp',
      SystemRoot: 'C:\\Windows',
      windir: 'C:\\Windows',
      LC_ALL: 'C',
      GIT_TERMINAL_PROMPT: '0',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_NO_LAZY_FETCH: '1',
    });
  });

  it('passes the cleaned environment to every call', async () => {
    const { spawn, started } = fakeSpawn();
    await gitWith(spawn, { env: { PATH: '/bin', GIT_DIR: '/x' }, platform: 'linux' }).run({
      args: ['version'],
    });
    expect(started[0]?.options.env).toEqual(
      gitEnvironment({ PATH: '/bin', GIT_DIR: '/x' }, 'linux'),
    );
  });

  it('writes git its input and ends it', async () => {
    let process: FakeProcess | undefined;
    const { spawn } = fakeSpawn((each) => {
      process = each.process;
      each.process.answer('');
    });
    await gitWith(spawn).run({ args: ['cat-file', '--batch'], input: 'abc\n' });
    expect(process?.input).toBe('abc\n');
  });
});

describe('the limits of a call', () => {
  it('kills a call that takes too long', async () => {
    const { spawn, started } = fakeSpawn(() => {});
    const git = gitWith(spawn, { limits: { callMs: 20 } });
    await expect(git.run({ args: ['log'] })).rejects.toMatchObject({
      failure: 'timeout',
      message: expect.stringMatching(/took longer than 0\.02 s/),
    });
    expect(started[0]?.process.killed).toBe(true);
  });

  it('kills a call that says more than its limit', async () => {
    const { spawn, started } = fakeSpawn((each) => each.process.answer('x'.repeat(100)));
    await expect(
      gitWith(spawn, { limits: { listingBytes: 10 } }).run({ args: ['log'] }),
    ).rejects.toMatchObject({ failure: 'output' });
    expect(started[0]?.process.killed).toBe(true);
  });

  it('keeps at most 64 KiB of what git says on its error output', async () => {
    const { spawn } = fakeSpawn((each) =>
      each.process.answer('', 128, `fatal: ${'e'.repeat(100_000)}`),
    );
    const error = await gitWith(spawn)
      .run({ args: ['log'] })
      .catch((each: unknown) => each);
    expect(error).toBeInstanceOf(GitError);
    expect((error as GitError).failure).toBe('exit');
    expect((error as GitError).code).toBe(128);
    expect((error as GitError).stderr.length).toBe(64 * 1024);
  });

  it('stops a call when its read is stopped, with the read’s reason', async () => {
    const { spawn, started } = fakeSpawn(() => {});
    const controller = new AbortController();
    const running = gitWith(spawn).run({ args: ['log'], signal: controller.signal });
    controller.abort(new GitError('stopped', 'A newer request stopped this one.'));
    await expect(running).rejects.toMatchObject({ failure: 'stopped' });
    expect(started[0]?.process.killed).toBe(true);
    await expect(gitWith(spawn).run({ args: ['log'], signal: controller.signal })).rejects.toMatchObject(
      { failure: 'stopped' },
    );
    expect(started).toHaveLength(1);
  });

  it('stops git when what it says does not read', async () => {
    const { spawn, started } = fakeSpawn((each) => each.process.answer('nonsense'));
    await expect(
      gitWith(spawn).run({
        args: ['cat-file', '--batch'],
        output: () => {
          throw new GitError('output', 'It did not read.');
        },
      }),
    ).rejects.toMatchObject({ failure: 'output', message: 'It did not read.' });
    expect(started[0]?.process.killed).toBe(true);
  });

  it('fails when git cannot be started', async () => {
    const spawn: Spawn = () => {
      const process = new FakeProcess();
      setImmediate(() => process.emit('error', new Error('spawn ENOENT')));
      return process as unknown as GitProcess;
    };
    await expect(gitWith(spawn).run({ args: ['version'] })).rejects.toMatchObject({
      failure: 'spawn',
    });
  });
});

describe('finding git', () => {
  /** A file system of the files named, each a regular file that can be run. */
  function filesystem(files: string[], links: Record<string, string> = {}, folders: string[] = []) {
    const normal = (path: string) => path.replaceAll('\\', '/');
    const real = (path: string) => links[normal(path)] ?? normal(path);
    const fs: FinderFs = {
      realpath: (path) => {
        const resolved = real(path);
        return files.includes(resolved)
          ? Promise.resolve(resolved)
          : Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      },
      stat: (path) => Promise.resolve({ isFile: () => files.includes(normal(path)) }),
      lstat: (path) =>
        folders.includes(normal(path))
          ? Promise.resolve({})
          : Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
      access: () => Promise.resolve(),
    };
    return fs;
  }

  it('takes VISUAL_ANYTHING_GIT when it names an absolute path', async () => {
    const found = await findGit({
      projectFolder: '/work/project',
      env: { VISUAL_ANYTHING_GIT: '/opt/git/bin/git', PATH: '/usr/bin' },
      platform: 'linux',
      fs: filesystem(['/opt/git/bin/git', '/usr/bin/git']),
    });
    expect(found).toEqual({ ok: true, path: '/opt/git/bin/git' });
  });

  it('ignores a relative VISUAL_ANYTHING_GIT, with a warning', async () => {
    const warnings: string[] = [];
    const found = await findGit({
      projectFolder: '/work/project',
      startedIn: '/home/ada',
      env: { VISUAL_ANYTHING_GIT: 'tools/git', PATH: '/usr/bin' },
      platform: 'linux',
      fs: filesystem(['/usr/bin/git', '/work/project/tools/git']),
      warn: (line) => warnings.push(line),
    });
    expect(found).toEqual({ ok: true, path: '/usr/bin/git' });
    expect(warnings).toEqual([
      'VISUAL_ANYTHING_GIT is not an absolute path, so it is ignored: tools/git',
    ]);
  });

  it('takes only absolute PATH entries outside the project, its repository and where it started', async () => {
    const found = await findGit({
      projectFolder: '/work/repo/project',
      startedIn: '/home/ada/start',
      env: {
        PATH: [
          '',
          '.',
          'bin',
          '/work/repo/project/bin',
          '/work/repo/tools',
          '/home/ada/start',
          '/usr/local/bin',
        ].join(':'),
      },
      platform: 'linux',
      fs: filesystem(
        [
          '/work/repo/project/bin/git',
          '/work/repo/tools/git',
          '/home/ada/start/git',
          '/usr/local/bin/git',
        ],
        {},
        ['/work/repo/.git'],
      ),
    });
    expect(found).toEqual({ ok: true, path: '/usr/local/bin/git' });
  });

  it('skips a git whose link leads into the project folder', async () => {
    const found = await findGit({
      projectFolder: '/work/project',
      startedIn: '/home/ada',
      env: { PATH: '/usr/local/bin:/usr/bin' },
      platform: 'linux',
      fs: filesystem(['/work/project/git', '/usr/bin/git'], {
        '/usr/local/bin/git': '/work/project/git',
      }),
    });
    expect(found).toEqual({ ok: true, path: '/usr/bin/git' });
  });

  it('takes git.exe on Windows, never a .cmd or .bat, and never the current folder', async () => {
    const found = await findGit({
      projectFolder: 'C:/work/project',
      startedIn: 'C:/Users/Ada',
      env: { Path: 'C:/Tools;"C:/Program Files/Git/cmd";C:/Windows' },
      platform: 'win32',
      fs: filesystem([
        'C:/Tools/git.cmd',
        'C:/Tools/git.bat',
        'C:/Program Files/Git/cmd/git.exe',
        'C:/work/project/git.exe',
      ]),
    });
    expect(found).toEqual({ ok: true, path: 'C:/Program Files/Git/cmd/git.exe' });
  });

  it('says what is needed when there is no git', async () => {
    const found = await findGit({
      projectFolder: '/work/project',
      startedIn: '/home/ada',
      env: { PATH: '/usr/bin' },
      platform: 'linux',
      fs: filesystem([]),
    });
    expect(found).toMatchObject({ ok: false, why: expect.stringMatching(/needs git 2\.36/) });
  });

  it('reads the version git says, and refuses one older than 2.36', async () => {
    expect(parseGitVersion('git version 2.49.0.windows.1\n')).toEqual({
      major: 2,
      minor: 49,
      patch: 0,
      text: '2.49.0.windows.1',
    });
    expect(parseGitVersion('git version 2.36\n')).toMatchObject({ major: 2, minor: 36, patch: 0 });
    expect(parseGitVersion('hub version 2.14')).toBeUndefined();

    const old = fakeSpawn((each) => each.process.answer('git version 2.30.1\n'));
    expect(await startGit('/usr/bin/git', { cwd: '/w', spawn: old.spawn, env: {} })).toMatchObject({
      ok: false,
      why: expect.stringMatching(/needs git 2\.36 or later, and the git found is 2\.30\.1/),
    });
    const recent = fakeSpawn((each) => each.process.answer('git version 2.45.2\n'));
    const started = await startGit('/usr/bin/git', { cwd: '/w', spawn: recent.spawn, env: {} });
    expect(started.ok && started.git.hasNoLazyFetch).toBe(true);
    expect(recent.started[0]?.args).toEqual([...fixedOptions(false), 'version']);
  });
});
