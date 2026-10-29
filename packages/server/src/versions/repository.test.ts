/**
 * Listing a repository's versions and reading a commit's project files, against real repositories
 * made in temporary folders (ADR 0071). They are skipped only where git is missing.
 */

import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { ProjectSnapshot } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadProject, loadProjectFrom } from '../project';
import { testProject, writeText } from '../test-support';
import { Git, startGit, type GitLimits } from './git';
import {
  NOT_A_REPOSITORY,
  listVersions,
  openRepository,
  readCommit,
  refusedRef,
  resolveRef,
  type Repository,
} from './repository';
import {
  GIT,
  NO_GIT,
  commitProject,
  expectAllowedCalls,
  git,
  gitWithInput,
  recordingSpawn,
  removeFolder,
  temporaryFolder,
  type RecordedCall,
} from './test-repositories';

let root: string;

beforeEach(async () => {
  root = await temporaryFolder();
});

afterEach(async () => {
  await removeFolder(root);
});

/** The runner on a folder, with every call recorded. */
async function runnerOn(
  folder: string,
  limits: Partial<GitLimits> = {},
): Promise<{ git: Git; calls: RecordedCall[] }> {
  const { spawn, calls } = recordingSpawn();
  const started = await startGit(GIT ?? '', { cwd: folder, spawn, limits });
  if (!started.ok) throw new Error(started.why);
  return { git: started.git, calls };
}

async function repositoryOf(
  folder: string,
  limits: Partial<GitLimits> = {},
): Promise<{ repository: Repository; calls: RecordedCall[] }> {
  const { git: runner, calls } = await runnerOn(folder, limits);
  const opened = await openRepository(runner);
  if (!opened.ok) throw new Error(opened.why);
  return { repository: opened.repository, calls };
}

/** The project a commit holds, through the loader's checks. */
async function projectAt(repository: Repository, commit: string): Promise<ProjectSnapshot> {
  const read = await readCommit(repository, commit);
  if (!read.ok) throw new Error(JSON.stringify(read.problems));
  const loaded = loadProjectFrom(read.source);
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
  return loaded.project;
}

function renamed(project: ProjectSnapshot, name: string): ProjectSnapshot {
  return { ...project, project: { ...project.project, name } };
}

describe.skipIf(NO_GIT)('the repository of a project folder', () => {
  it('finds the top, the folder’s prefix and the object format', async () => {
    await commitProject(root, testProject(), { prefix: 'examples/shop' });
    const { repository, calls } = await repositoryOf(join(root, 'examples/shop'));
    expect(repository.place.prefix).toBe('examples/shop/');
    expect(repository.place.format).toBe('sha1');
    expect(repository.place.top.replaceAll('\\', '/').toLowerCase()).toBe(
      root.replaceAll('\\', '/').toLowerCase(),
    );
    expectAllowedCalls(calls, {
      git: GIT ?? '',
      cwd: join(root, 'examples/shop'),
      noLazyFetch: repository.git.hasNoLazyFetch,
    });
  });

  it('says a folder outside any repository has no commits to compare with', async () => {
    const { git: runner } = await runnerOn(root);
    expect(await openRepository(runner)).toEqual({ ok: false, why: NOT_A_REPOSITORY });
  });
});

describe.skipIf(NO_GIT)('the versions listed', () => {
  it('lists HEAD, branches, remote-tracking branches, tags and the commits that touched the folder', async () => {
    const project = testProject();
    const first = await commitProject(root, project, { prefix: 'shop', message: 'First shop' });
    git(root, 'tag', 'v1');
    git(root, 'tag', '-a', '-m', 'The second release', 'v2');
    await writeText(root, 'README.md', 'Not the project.');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'Only the readme');
    const third = await commitProject(root, renamed(project, 'Shop 3'), {
      prefix: 'shop',
      init: false,
      message: 'Rename the shop\n\nWith a body that is not shown.',
    });
    git(root, 'branch', 'feature');
    git(root, 'update-ref', 'refs/remotes/origin/main', first);
    git(root, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');

    const { repository, calls } = await repositoryOf(join(root, 'shop'));
    const versions = await listVersions(repository);
    const brief = versions.map(({ kind, name, commit, subject }) => ({ kind, name, commit, subject }));
    expect(brief).toEqual([
      { kind: 'head', name: undefined, commit: third, subject: 'Rename the shop' },
      ...[
        { kind: 'branch', name: 'feature', commit: third, subject: 'Rename the shop' },
        { kind: 'branch', name: 'main', commit: third, subject: 'Rename the shop' },
      ],
      { kind: 'remote', name: 'origin/main', commit: first, subject: 'First shop' },
      // Annotated tags are peeled to their commit.
      ...[
        { kind: 'tag', name: 'v1', commit: first, subject: 'First shop' },
        { kind: 'tag', name: 'v2', commit: first, subject: 'First shop' },
      ],
      // The readme's commit did not touch the project folder.
      { kind: 'commit', name: undefined, commit: third, subject: 'Rename the shop' },
      { kind: 'commit', name: undefined, commit: first, subject: 'First shop' },
    ]);
    const [head] = versions;
    expect(head?.author).toBe('Ada Tester');
    expect(head?.short).toBe(third.slice(0, head?.short.length));
    expect(head?.time).toBeGreaterThan(Date.UTC(2020, 0, 1));
    // The author's email is never read.
    expect(JSON.stringify(versions)).not.toContain('example.com');
    expect(calls.flatMap((call) => call.args).join(' ')).not.toMatch(/%ae|%aE|authoremail|%ce/);
    expectAllowedCalls(calls, {
      git: GIT ?? '',
      cwd: join(root, 'shop'),
      noLazyFetch: repository.git.hasNoLazyFetch,
    });
  });

  it('lists nothing for a repository with no commits yet', async () => {
    git(root, 'init', '-q');
    const { repository } = await repositoryOf(root);
    expect(await listVersions(repository)).toEqual([]);
  });

  it('lists at most 200 recent commits, and cuts a subject at 200 characters', async () => {
    git(root, 'init', '-q');
    // One fast-import makes the 203 commits, each changing the project file.
    const data = (text: string) => `data ${Buffer.byteLength(text)}\n${text}\n`;
    let stream = '';
    for (let i = 0; i < 203; i += 1) {
      stream += `commit refs/heads/main\ncommitter Ada Tester <ada@example.com> ${1_700_000_000 + i} +0000\n`;
      stream += data(`${'Ü'.repeat(300)} ${i}`);
      stream += `M 100644 inline project.vaproject\n${data(String(i))}\n`;
    }
    gitWithInput(root, stream, 'fast-import', '--quiet');
    const { repository } = await repositoryOf(root);
    const versions = await listVersions(repository);
    expect(versions.filter((each) => each.kind === 'commit')).toHaveLength(200);
    for (const each of versions) expect(each.subject).toBe('Ü'.repeat(200));
    expect(versions[0]?.time).toBe((1_700_000_000 + 202) * 1000);
  });
});

describe.skipIf(NO_GIT)('reading a commit', () => {
  it('reads the project as each commit holds it, at the top of the repository', async () => {
    const project = testProject();
    const first = await commitProject(root, project);
    const second = await commitProject(root, renamed(project, 'Second'), { init: false });
    const { repository, calls } = await repositoryOf(root);
    const disk = await loadProject(root);
    expect(disk.ok).toBe(true);
    const atFirst = await projectAt(repository, first);
    expect(atFirst.project.name).toBe(project.project.name);
    expect(isDeepStrictEqual(await projectAt(repository, second), disk.ok && disk.project)).toBe(
      true,
    );
    // The blobs are read by their ids, in one batch for each commit.
    expect(calls.filter((call) => call.args.includes('cat-file'))).toHaveLength(2);
    expectAllowedCalls(calls, { git: GIT ?? '', cwd: root, noLazyFetch: repository.git.hasNoLazyFetch });
  });

  it('reads a project in a folder of the repository, its kind folders matched without case', async () => {
    const project = testProject();
    await commitProject(root, project, { prefix: 'docs/model' });
    git(root, 'mv', 'docs/model/views', 'docs/model/moving');
    git(root, 'mv', 'docs/model/moving', 'docs/model/Views');
    git(root, 'commit', '-q', '-m', 'Capital views');
    const commit = git(root, 'rev-parse', 'HEAD').trim();
    const { repository } = await repositoryOf(join(root, 'docs/model'));
    const read = await projectAt(repository, commit);
    expect(read.views.map((view) => view.id)).toEqual(project.views.map((view) => view.id));
  });

  it('says when a commit has no project folder, which may have had another name then', async () => {
    const first = await commitProject(root, testProject(), { prefix: 'old' });
    git(root, 'mv', 'old', 'new');
    git(root, 'commit', '-q', '-m', 'Rename the folder');
    const { repository } = await repositoryOf(join(root, 'new'));
    expect(await readCommit(repository, first)).toEqual({
      ok: false,
      problems: [
        {
          file: '.',
          pointer: '',
          message:
            'This commit has no folder new: the project folder may have had another name then.',
        },
      ],
    });
  });

  it('says file by file why a commit’s project does not open', async () => {
    await commitProject(root, testProject());
    await writeText(root, 'views/broken.vaview', '{ "id": ');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'Break a view');
    const commit = git(root, 'rev-parse', 'HEAD').trim();
    const { repository } = await repositoryOf(root);
    const read = await readCommit(repository, commit);
    expect(read.ok).toBe(true);
    const loaded = read.ok ? loadProjectFrom(read.source) : undefined;
    expect(loaded?.ok).toBe(false);
    expect(loaded?.ok === false && loaded.errors.map((each) => each.file)).toEqual([
      'views/broken.vaview',
    ]);
  });

  it('refuses a version past the most files or bytes of one version, before reading a blob', async () => {
    const commit = await commitProject(root, testProject());
    const few = await repositoryOf(root, { files: 2 });
    expect(await readCommit(few.repository, commit)).toMatchObject({
      ok: false,
      problems: [{ message: expect.stringMatching(/more than 2 project files/) }],
    });
    const small = await repositoryOf(root, { totalBytes: 100 });
    expect(await readCommit(small.repository, commit)).toMatchObject({
      ok: false,
      problems: [{ message: expect.stringMatching(/more than 100 bytes in all/) }],
    });
    for (const { calls } of [few, small]) {
      expect(calls.some((call) => call.args.includes('cat-file'))).toBe(false);
    }
  });

  it('refuses an id that is not a commit id before git hears of it', async () => {
    await commitProject(root, testProject());
    const { repository, calls } = await repositoryOf(root);
    const before = calls.length;
    for (const commit of ['HEAD', 'main', '--output=x', 'a'.repeat(39), 'A'.repeat(40)]) {
      expect(await readCommit(repository, commit)).toMatchObject({ ok: false });
    }
    expect(calls).toHaveLength(before);
  });
});

describe.skipIf(NO_GIT)('a ref typed on the command line', () => {
  it('is checked as text, then resolved to its commit', async () => {
    const commit = await commitProject(root, testProject());
    git(root, 'tag', 'v1');
    const { repository } = await repositoryOf(root);
    expect(await resolveRef(repository, 'v1')).toEqual({ ok: true, commit });
    expect(await resolveRef(repository, 'main~0')).toEqual({ ok: true, commit });
    expect(await resolveRef(repository, 'nothing')).toMatchObject({ ok: false });
    for (const text of ['', '-n', '--output=x', 'a b', 'a:b', 'a\\b', 'a..b', 'x'.repeat(256), 'a\u0001']) {
      expect(refusedRef(text), JSON.stringify(text)).toBeDefined();
      expect(await resolveRef(repository, text)).toMatchObject({ ok: false });
    }
  });
});
