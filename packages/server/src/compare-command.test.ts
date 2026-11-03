/**
 * `visual-anything compare` (ADR 0070, ADR 0071): on a temporary repository with two commits of a
 * sample, it writes the summary and, for each view that changed, the drawings before, after and of the
 * comparison; atomically, in the out folder only, with no program running and nothing written to the
 * repository or the project; and it refuses what would not do.
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  COMPARE_USAGE,
  SUMMARY_FILE,
  fileStems,
  parseCompareCommandLine,
  runCompare,
} from './compare-command';
import { loadProject } from './project';
import { sampleOf, writeNewProject } from './samples';
import { writeProjectFolder } from './test-support';
import {
  GIT,
  NO_GIT,
  expectAllowedCalls,
  fingerprint,
  git,
  recordingSpawn,
  removeFolder,
  temporaryFolder,
} from './versions/test-repositories';
import { NOT_A_REPOSITORY } from './versions/repository';

let root: string;
let repo: string;
let project: string;

beforeEach(async () => {
  root = await temporaryFolder('va-compare-');
  repo = join(root, 'repo');
  project = join(repo, 'examples', 'banking');
});

afterEach(async () => {
  await removeFolder(root);
});

/** Runs the command in `root`, and gives its exit code and what it said. */
async function compare(...argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const recording = recordingSpawn();
  const code = await runCompare(argv, {
    cwd: root,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    spawn: recording.spawn,
  });
  return { code, out, err, calls: recording.calls };
}

/** The project in its folder now, after some commands, written back. */
async function change(...commands: Command[]): Promise<ProjectSnapshot> {
  const loaded = await loadProject(project);
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
  let state = loaded.project;
  for (const command of commands) {
    const outcome = executeCommand(state, command);
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.problems));
    state = outcome.state;
  }
  await writeProjectFolder(project, state);
  return state;
}

function commit(message: string): string {
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', message);
  return git(repo, 'rev-parse', 'HEAD').trim();
}

/**
 * The C4 sample committed twice: as it ships, then with the database moved in the deployment view and
 * the containers view renamed. The system context view does not change.
 */
async function twoCommits(): Promise<{ base: string; head: string }> {
  const sample = sampleOf('c4-architecture');
  if (!sample) throw new Error('No C4 sample.');
  const written = await writeNewProject(project, sample.files);
  if (!written.ok) throw new Error(written.message);
  git(repo, 'init', '-q');
  const base = commit('The C4 sample');
  await change(
    {
      type: 'set-positions',
      view: 'deployment',
      positions: [{ element: 'database', container: 'db-server', x: 200, y: 48 }],
    },
    { type: 'update-view', id: 'containers', changes: { name: 'Containers and components' } },
  );
  const head = commit('Move the database, rename the containers view');
  return { base, head };
}

const DRAWINGS = (view: string) => [
  `${view}.before.svg`,
  `${view}.after.svg`,
  `${view}.comparison.svg`,
];

// Each test starts git several times, which took up to four seconds a start on a loaded Windows
// machine, as in versions.test.ts; nothing here is timed.
describe.skipIf(NO_GIT)('comparing two commits', { timeout: 300_000 }, () => {
  it('writes the summary and the three drawings of each view that changed', async () => {
    const { base, head } = await twoCommits();
    const result = await compare(
      'repo/examples/banking',
      '--base',
      'HEAD~1',
      '--head',
      'main',
      '--out',
      'out',
    );
    expect(result.err).toEqual([]);
    expect(result.code).toBe(0);
    const files = (await readdir(join(root, 'out'))).sort();
    expect(files).toEqual(
      [...DRAWINGS('containers'), ...DRAWINGS('deployment'), SUMMARY_FILE].sort(),
    );

    const summary = await readFile(join(root, 'out', SUMMARY_FILE), 'utf8');
    // Markdown escapes the ~ of the ref, as every text the summary takes from elsewhere.
    expect(summary).toContain(`- Older version: HEAD\\~1 · \`${base.slice(0, 12)}\` · `);
    expect(summary).toContain(`- Newer version: main · \`${head.slice(0, 12)}\` · `);
    expect(summary).toMatch(/Containers and components/);
    expect(summary).toContain('[Before](<deployment.before.svg>)');
    expect(summary).toContain('[Comparison](<containers.comparison.svg>)');
    expect(summary).not.toContain('system-context.');

    const comparison = await readFile(join(root, 'out', 'deployment.comparison.svg'), 'utf8');
    expect(comparison).toMatch(/^<svg|^<\?xml/);
    expect(comparison).toContain('data-mark="moved"');
    expect(result.out[0]).toMatch(/^Compared HEAD~1 \([0-9a-f]{12}\) with main \([0-9a-f]{12}\): /);
    expect(result.out).toContain('  summary.md');
  });

  it('runs git only as the program does, and writes nothing to the repository or the project', async () => {
    await twoCommits();
    const before = await fingerprint(repo);
    const result = await compare('repo/examples/banking', '--base', 'HEAD~1', '--out', 'out');
    expect(result.code).toBe(0);
    expect(await fingerprint(repo)).toEqual(before);
    const version = git(repo, 'version');
    const [, major = '0', minor = '0'] = /(\d+)\.(\d+)/.exec(version) ?? [];
    expectAllowedCalls(result.calls, {
      git: GIT ?? '',
      cwd: project,
      noLazyFetch: Number(major) > 2 || (Number(major) === 2 && Number(minor) >= 44),
    });
    // Nothing but the comparison stays in the out folder: no temporary file.
    expect((await readdir(join(root, 'out'))).every((name) => !name.includes('va-tmp'))).toBe(true);
  });

  it('compares with the files on disk when no head is given', async () => {
    await twoCommits();
    await change({ type: 'update-element', id: 'mainframe', changes: { name: 'Core banking' } });
    const result = await compare('repo/examples/banking', '--base', 'HEAD', '--out', 'out');
    expect(result.code).toBe(0);
    const summary = await readFile(join(root, 'out', SUMMARY_FILE), 'utf8');
    expect(summary).toContain('- Newer version: the files on disk');
    expect(summary).toContain('Core banking');
    expect(result.out[0]).toMatch(
      /with the files on disk: 0 added, 0 removed, 1 changed, 0 moved\.$/,
    );
    expect(await readdir(join(root, 'out'))).toEqual(
      expect.arrayContaining(DRAWINGS('system-context')),
    );
  });

  it('keeps to the views given, and says which did not change', async () => {
    await twoCommits();
    const result = await compare(
      'repo/examples/banking',
      '--base',
      'HEAD~1',
      '--head',
      'HEAD',
      '--view',
      'deployment',
      '--view',
      'system-context',
      '--out',
      'out',
    );
    expect(result.code).toBe(0);
    expect((await readdir(join(root, 'out'))).sort()).toEqual(
      [...DRAWINGS('deployment'), SUMMARY_FILE].sort(),
    );
    const summary = await readFile(join(root, 'out', SUMMARY_FILE), 'utf8');
    expect(summary).not.toContain('Containers and components');
    expect(summary).toContain('- Counts: 0 added, 0 removed, 0 changed, 1 moved');
    expect(result.out.at(-1)).toBe(
      'Nothing changed in "system-context", so no drawing of it was written.',
    );
  });

  it('links the drawings from an address, and draws in the dark theme', async () => {
    await twoCommits();
    const light = await compare(
      'repo/examples/banking',
      '--base',
      'HEAD~1',
      '--head',
      'HEAD',
      '--view',
      'deployment',
      '--out',
      'light',
    );
    const dark = await compare(
      'repo/examples/banking',
      '--base',
      'HEAD~1',
      '--head',
      'HEAD',
      '--view',
      'deployment',
      '--out',
      'dark',
      '--theme',
      'dark',
      '--image-url',
      'https://example.com/runs/7/',
    );
    expect([light.code, dark.code]).toEqual([0, 0]);
    const summary = await readFile(join(root, 'dark', SUMMARY_FILE), 'utf8');
    expect(summary).toContain('[After](<https://example.com/runs/7/deployment.after.svg>)');
    const drawn = (folder: string) => readFile(join(root, folder, 'deployment.after.svg'), 'utf8');
    expect(await drawn('dark')).not.toBe(await drawn('light'));
  });

  it('draws a view that only the base has', async () => {
    await twoCommits();
    await rm(join(project, 'views', 'system-context.vaview'));
    const result = await compare('repo/examples/banking', '--base', 'HEAD', '--out', 'out');
    expect(result.err).toEqual([]);
    expect(result.code).toBe(0);
    expect(await readdir(join(root, 'out'))).toEqual(
      expect.arrayContaining(DRAWINGS('system-context')),
    );
    const summary = await readFile(join(root, 'out', SUMMARY_FILE), 'utf8');
    expect(summary).toContain('[Before](<system-context.before.svg>)');
  });

  it('writes a summary alone when nothing changed', async () => {
    await twoCommits();
    const result = await compare('repo/examples/banking', '--base', 'HEAD', '--out', 'out');
    expect(result.code).toBe(0);
    expect(await readdir(join(root, 'out'))).toEqual([SUMMARY_FILE]);
    expect(await readFile(join(root, 'out', SUMMARY_FILE), 'utf8')).toContain('No changes.');
  });

  it('replaces its own files, and leaves the rest of the out folder alone', async () => {
    await twoCommits();
    await mkdir(join(root, 'out'));
    await writeFile(join(root, 'out', SUMMARY_FILE), 'old');
    await writeFile(join(root, 'out', 'notes.txt'), 'mine');
    expect((await compare('repo/examples/banking', '--base', 'HEAD~1', '--out', 'out')).code).toBe(
      0,
    );
    expect(await readFile(join(root, 'out', SUMMARY_FILE), 'utf8')).toMatch(/^# Changes to /);
    expect(await readFile(join(root, 'out', 'notes.txt'), 'utf8')).toBe('mine');
  });
});

describe.skipIf(NO_GIT)('what it refuses', () => {
  it('a ref that names no commit, or that is not a ref', async () => {
    await twoCommits();
    const missing = await compare(
      'repo/examples/banking',
      '--base',
      'no-such-branch',
      '--out',
      'out',
    );
    expect(missing.code).toBe(1);
    expect(missing.err.join('\n')).toMatch(
      /no-such-branch names no commit of the project’s repository/,
    );
    const option = await compare('repo/examples/banking', '--base=--output=x', '--out', 'out');
    expect(option.code).toBe(1);
    expect(option.err.join('\n')).toMatch(/A ref does not start with "-"/);
    const range = await compare('repo/examples/banking', '--base', 'HEAD~1..HEAD', '--out', 'out');
    expect(range.err.join('\n')).toMatch(/A ref has no space, control character/);
    await expect(readdir(join(root, 'out'))).rejects.toThrow();
  });

  it('a folder outside any repository', async () => {
    const sample = sampleOf('c4-architecture');
    if (!sample) throw new Error('No C4 sample.');
    await writeNewProject(project, sample.files);
    const result = await compare('repo/examples/banking', '--base', 'HEAD', '--out', 'out');
    expect(result).toMatchObject({ code: 1, err: [NOT_A_REPOSITORY] });
  });

  it('a view neither version has', async () => {
    await twoCommits();
    const result = await compare(
      'repo/examples/banking',
      '--base',
      'HEAD',
      '--view',
      'nowhere',
      '--out',
      'out',
    );
    expect(result.code).toBe(1);
    expect(result.err[0]).toMatch(/^Neither version has the view "nowhere"\. Their views: /);
  });

  it('an out folder that is the project folder, one of its kind folders, or git’s own', async () => {
    await twoCommits();
    for (const out of [
      'repo/examples/banking',
      'repo/examples/banking/views',
      'repo/examples/banking/views/new',
      'repo/.git/compare',
    ]) {
      const result = await compare('repo/examples/banking', '--base', 'HEAD', '--out', out);
      expect(result.code, out).toBe(1);
      expect(result.err[0], out).toMatch(/give another --out/);
    }
    expect(await readdir(join(repo, '.git'))).not.toContain('compare');
  });

  it('a project that does not open', async () => {
    await twoCommits();
    await writeFile(join(project, 'model.vamodel'), '{');
    const result = await compare('repo/examples/banking', '--base', 'HEAD', '--out', 'out');
    expect(result.code).toBe(1);
    expect(result.err[0]).toMatch(/does not open:$/);
  });
});

describe('its command line', () => {
  it('reads every option, a view given more than once', () => {
    expect(
      parseCompareCommandLine([
        'shop',
        '--base',
        'main',
        '--head',
        'feature',
        '--view',
        'a',
        '--view',
        'b',
        '--view',
        'a',
        '--out',
        'out',
        '--theme',
        'dark',
        '--image-url',
        'https://x/',
      ]),
    ).toEqual({
      ok: true,
      help: false,
      value: {
        folder: 'shop',
        base: 'main',
        head: 'feature',
        views: ['a', 'b'],
        out: 'out',
        theme: 'dark',
        imageUrl: 'https://x/',
      },
    });
  });

  it('refuses what it does not understand, with the usage, and exit code 2', async () => {
    for (const argv of [
      [],
      ['shop', '--out', 'out'],
      ['shop', '--base', 'main'],
      ['shop', 'more', '--base', 'main', '--out', 'out'],
      ['shop', '--base', 'main', '--out', 'out', '--theme', 'blue'],
      ['shop', '--base', 'main', '--out', 'out', '--image-url', 'a\nb'],
      ['shop', '--base', 'main', '--out', 'out', '--format', 'svg'],
    ]) {
      const result = await compare(...argv);
      expect(result.code, argv.join(' ')).toBe(2);
      expect(result.err.at(-1)).toBe(COMPARE_USAGE);
    }
    const help = await compare('--help');
    expect(help).toMatchObject({ code: 0, out: [COMPARE_USAGE] });
  });

  it('names each view’s drawings apart, whatever the file system', () => {
    expect([...fileStems(['overview', 'Overview', 'con', 'overview-2']).values()]).toEqual([
      'overview',
      'Overview-2',
      'con-2',
      'overview-2-2',
    ]);
  });
});
