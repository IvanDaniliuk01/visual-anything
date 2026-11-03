/**
 * Hostile repositories (ADR 0071's consequences). In each, the program lists the versions and reads
 * one, as the session does, and then: no program started, no network was reached, nothing outside the
 * repository was read, and nothing was written to the repository. Where a test arms a trap, a control
 * first shows that plain git springs it.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Problem } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testProject, writeText } from '../test-support';
import { Git, GitError, GIT_LIMITS } from './git';
import { BatchReader, openRepository } from './repository';
import {
  GIT,
  NO_GIT,
  matching,
  commitProject,
  expectAllowedCalls,
  fingerprint,
  git,
  gitWithInput,
  recordingSpawn,
  removeFolder,
  temporaryFolder,
  type RecordedCall,
} from './test-repositories';
import { Versions, type VersionRead, type VersionsListing } from './versions';

let root: string;
let repo: string;
let markers: string;
let mark: string;

const SECRET = 'SECRET-OUTSIDE-THE-REPOSITORY';

beforeEach(async () => {
  root = await temporaryFolder('va-hostile-');
  repo = join(root, 'repo');
  markers = join(root, 'markers');
  await mkdir(repo);
  await mkdir(markers);
  await mkdir(join(root, 'outside'));
  await writeFile(join(root, 'outside', 'secret.vaview'), SECRET);
  // A program that leaves a marker named by its argument: what every trap below would start.
  mark = join(root, 'tools', 'mark.sh').replaceAll('\\', '/');
  await writeText(
    root,
    'tools/mark.sh',
    `#!/bin/sh\necho ran > '${markers.replaceAll('\\', '/')}'/"$1"\n`,
  );
  if (process.platform !== 'win32') execFileSync('chmod', ['+x', mark]);
});

afterEach(async () => {
  await removeFolder(root);
});

/** The markers left by programs that ran. */
async function ran(): Promise<string[]> {
  return (await readdir(markers)).sort();
}

async function clearMarkers(): Promise<void> {
  for (const name of await readdir(markers)) await rm(join(markers, name));
}

/** Lists the versions and reads HEAD's, as the session does, with every call recorded. */
async function listAndRead(
  folder: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ listing: VersionsListing; read: VersionRead | undefined; calls: RecordedCall[] }> {
  const { spawn, calls } = recordingSpawn();
  const versions = new Versions(folder, { spawn, env, warn: () => {} });
  const listing = await versions.list();
  const head = listing.versions.find((each) => each.kind === 'head');
  const read = head === undefined ? undefined : await versions.read(head.commit);
  versions.close();
  return { listing, read, calls };
}

function messagesOf(read: VersionRead | undefined): string[] {
  return read?.ok === false ? read.problems.map((each: Problem) => each.message) : [];
}

/** Runs git as a person would, to show that a trap is armed; its failure does not matter. */
function plainGit(cwd: string, ...args: string[]): void {
  try {
    git(cwd, ...args);
  } catch {
    // What matters is whether the trap's program ran.
  }
}

// Each test starts git several times, which took up to four seconds a start on a loaded Windows
// machine, as in versions.test.ts; nothing here is timed.
describe.skipIf(NO_GIT)('a hostile repository', { timeout: 300_000 }, () => {
  it('starts no program from its configuration or attributes', async () => {
    const project = testProject();
    await commitProject(repo, project);
    // A second commit that changes a view, so that a diff would have something to show.
    const changed = {
      ...project,
      views: project.views.map((view) => ({ ...view, name: `${view.name} again` })),
    };
    await commitProject(repo, changed, { init: false });
    const command = (name: string) => `'${mark}' ${name}`;
    const settings: [string, string][] = [
      ['core.fsmonitor', command('fsmonitor')],
      ['core.pager', command('pager')],
      ['pager.log', command('pager-log')],
      ['diff.external', command('external')],
      ['diff.hostile.textconv', command('textconv')],
      ['filter.hostile.smudge', command('smudge')],
      ['filter.hostile.clean', command('clean')],
      ['filter.hostile.process', command('process')],
      ['gpg.program', command('gpg')],
      ['log.showSignature', 'true'],
      ['credential.helper', command('credential')],
      ['core.askPass', command('askpass')],
      ['core.sshCommand', command('ssh')],
      ['remote.origin.url', 'ssh://example.invalid/shop.git'],
      ['core.hooksPath', join(root, 'tools').replaceAll('\\', '/')],
      ['mailmap.file', join(root, 'outside', 'mailmap').replaceAll('\\', '/')],
      ['log.mailmap', 'true'],
      ['color.ui', 'always'],
      ['core.quotePath', 'true'],
    ];
    for (const [key, value] of settings) git(repo, 'config', key, value);
    await writeText(root, 'outside/mailmap', `${SECRET} <ada@example.com>\n`);
    await writeText(repo, '.gitattributes', '*.vaview diff=hostile\n*.vaproject filter=hostile\n');
    // HEAD becomes a commit with a signature, which `log --show-signature` hands to gpg.
    const tree = git(repo, 'rev-parse', 'HEAD^{tree}').trim();
    const parent = git(repo, 'rev-parse', 'HEAD').trim();
    const signed = [
      `tree ${tree}`,
      `parent ${parent}`,
      'author Ada Tester <ada@example.com> 1700000000 +0000',
      'committer Ada Tester <ada@example.com> 1700000000 +0000',
      'gpgsig -----BEGIN PGP SIGNATURE-----',
      ' ',
      ' iQEzBAABCAAdFiEEnotarealsignature',
      ' -----END PGP SIGNATURE-----',
      '',
      'A signed commit',
      '',
    ].join('\n');
    const head = gitWithInput(repo, signed, 'hash-object', '-t', 'commit', '-w', '--stdin').trim();
    git(repo, 'update-ref', 'refs/heads/main', head);

    // The controls: plain git springs the traps. Which filters a status runs depends on what the
    // index remembers, so only those that always run are counted on.
    plainGit(repo, 'status');
    plainGit(repo, 'log', '-n', '1', '--show-signature');
    plainGit(repo, 'log', '-p', '-n', '1', '--ext-diff', `${head}^`);
    plainGit(repo, '-c', 'diff.external=', 'log', '-p', '-n', '1', `${head}^`);
    expect(await ran()).toEqual(expect.arrayContaining(['external', 'fsmonitor', 'textconv']));
    await clearMarkers();

    const before = await fingerprint(repo);
    const { listing, read, calls } = await listAndRead(repo);
    expect(listing.why).toBeUndefined();
    expect(listing.versions.find((each) => each.kind === 'head')?.subject).toBe('A signed commit');
    expect(JSON.stringify(listing)).not.toContain(SECRET);
    expect(read?.ok).toBe(true);
    expect(await ran()).toEqual([]);
    expect(await fingerprint(repo)).toEqual(before);
    expectAllowedCalls(calls, { git: GIT ?? '', cwd: repo, noLazyFetch: true });
  });

  it('passes names that look like options to git never, and shows them as text', async () => {
    const commit = await commitProject(repo, testProject());
    git(repo, 'update-ref', 'refs/heads/--output=x', commit);
    git(repo, 'update-ref', 'refs/tags/--exec=x', commit);
    git(repo, 'update-ref', 'refs/remotes/-c/core.pager=x', commit);
    const before = await fingerprint(repo);
    const { listing, read, calls } = await listAndRead(repo);
    expect(listing.versions.map((each) => each.name).filter(Boolean)).toEqual(
      expect.arrayContaining(['--output=x', '--exec=x', '-c/core.pager=x']),
    );
    expect(read?.ok).toBe(true);
    for (const call of calls) {
      expect(call.args.join(' ')).not.toMatch(/--output=x|--exec=x|core\.pager=x/);
    }
    expect(await fingerprint(repo)).toEqual(before);
    expect(await readdir(repo)).not.toContain('x');
  });

  it('reads no link and no submodule, where project files or kind folders belong', async () => {
    const project = testProject();
    const commit = await commitProject(repo, project);
    const link = gitWithInput(
      repo,
      '../../outside/secret.vaview',
      'hash-object',
      '-w',
      '--stdin',
    ).trim();
    const folderLink = gitWithInput(repo, '../outside', 'hash-object', '-w', '--stdin').trim();
    git(repo, 'rm', '-q', '-r', '--cached', 'packages', 'scenarios', 'model.vamodel');
    for (const [mode, id, path] of [
      ['120000', link, 'views/link.vaview'],
      ['160000', commit, 'views/sub.vaview'],
      ['120000', link, 'model.vamodel'],
      ['120000', folderLink, 'packages'],
      ['160000', commit, 'scenarios'],
    ] as const) {
      git(repo, 'update-index', '--add', '--cacheinfo', `${mode},${id},${path}`);
    }
    git(repo, 'commit', '-q', '-m', 'Links and submodules');

    const before = await fingerprint(repo);
    const { read, calls } = await listAndRead(repo);
    expect(read?.ok).toBe(false);
    const messages = messagesOf(read);
    expect(messages).toEqual(
      expect.arrayContaining([
        'model.vamodel: In this commit, the file is a link; Visual Anything reads only regular files.',
        'packages: In this commit, packages is a link; Visual Anything reads only real folders and regular files.',
        'scenarios: In this commit, scenarios is a submodule; Visual Anything reads only real folders and regular files.',
        'views/link.vaview: In this commit, the file is a link; Visual Anything reads only regular files.',
        'views/sub.vaview: In this commit, the file is a submodule; Visual Anything reads only regular files.',
      ]),
    );
    expect(JSON.stringify(read)).not.toContain(SECRET);
    // Nothing a link or a submodule names was asked for.
    const asked = calls.map((call) => call.input).join('');
    expect(asked).not.toContain(link);
    expect(asked).not.toContain(folderLink);
    expect(asked).not.toContain(commit);
    for (const call of calls) expect(call.args).not.toContain(folderLink);
    expect(await fingerprint(repo)).toEqual(before);
  });

  it('reads no byte of a file past its kind’s cap', async () => {
    await commitProject(repo, testProject());
    await writeText(repo, 'comments/huge.vacomment', 'x'.repeat(1024 * 1024 + 1));
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'A huge thread');
    const huge = git(repo, 'rev-parse', 'HEAD:comments/huge.vacomment').trim();
    const { read, calls } = await listAndRead(repo);
    expect(messagesOf(read)).toEqual([
      'comments/huge.vacomment: The file holds more than 1 MiB, the most a file of this kind may hold.',
    ]);
    expect(calls.map((call) => call.input).join('')).not.toContain(huge);
  });

  it('fetches nothing a partial clone lacks, and starts no transport', async () => {
    const source = join(root, 'source');
    await mkdir(source);
    await commitProject(source, testProject());
    git(source, 'config', 'uploadpack.allowFilter', 'true');
    const clone = join(root, 'clone');
    git(
      root,
      'clone',
      '-q',
      '--no-checkout',
      '--filter=blob:none',
      pathToFileURL(source).href,
      clone,
    );
    const missing = git(clone, 'rev-parse', 'HEAD:project.vaproject').trim();
    // Its remote now starts a program on a fetch, which it is allowed to.
    git(clone, 'config', 'remote.origin.url', `ext::sh ${mark} ext`);
    git(clone, 'config', 'protocol.allow', 'always');
    git(clone, 'config', 'protocol.ext.allow', 'always');
    plainGit(clone, 'cat-file', '-p', missing);
    expect(await ran()).toEqual(['ext']);
    await clearMarkers();

    const before = await fingerprint(clone);
    const { listing, read } = await listAndRead(clone);
    expect(listing.why).toBeUndefined();
    expect(messagesOf(read)).toContain(
      'project.vaproject: This commit’s copy of the file is not in the repository, which is a partial clone: fetch it with git, then compare again.',
    );
    expect(await ran()).toEqual([]);
    expect(await fingerprint(clone)).toEqual(before);
    // The blob is still missing: nothing was fetched.
    expect(() =>
      execFileSync(GIT ?? '', ['--no-lazy-fetch', 'cat-file', '-e', missing], {
        cwd: clone,
        stdio: 'ignore',
      }),
    ).toThrow();
  });

  it('refuses a partial clone with a git that cannot keep a read from fetching', async () => {
    const source = join(root, 'source');
    await mkdir(source);
    await commitProject(source, testProject());
    git(source, 'config', 'uploadpack.allowFilter', 'true');
    const clone = join(root, 'clone');
    git(
      root,
      'clone',
      '-q',
      '--no-checkout',
      '--filter=blob:none',
      pathToFileURL(source).href,
      clone,
    );
    const older = new Git(
      GIT ?? '',
      { major: 2, minor: 40, patch: 0, text: '2.40.0' },
      { cwd: clone },
    );
    expect(await openRepository(older)).toMatchObject({
      ok: false,
      why: matching(/partial clone.*needs git 2\.44 or later/),
    });
  });

  it('finds the repository from the project folder alone, whatever GIT_DIR the program has', async () => {
    const project = testProject();
    const mine = await commitProject(repo, project);
    const other = join(root, 'other');
    await mkdir(other);
    await commitProject(other, { ...project, project: { ...project.project, name: 'Other' } });
    const { listing, read } = await listAndRead(repo, {
      ...process.env,
      GIT_DIR: join(other, '.git'),
      GIT_WORK_TREE: other,
      GIT_CONFIG_PARAMETERS: `'core.pager=${mark} env'`,
      GIT_EXTERNAL_DIFF: `${mark} env-diff`,
    });
    expect(listing.versions.find((each) => each.kind === 'head')?.commit).toBe(mine);
    expect(read?.ok && read.project.project.name).toBe(project.project.name);
    expect(await ran()).toEqual([]);
  });
});

describe('the batch’s answer', () => {
  const id = 'a'.repeat(40);
  const other = 'b'.repeat(40);

  function readBatch(blobs: [string, number][], ...chunks: string[]): Map<string, Buffer> {
    const read = new Map<string, Buffer>();
    const batch = new BatchReader(blobs, read);
    for (const chunk of chunks) batch.write(Buffer.from(chunk, 'latin1'));
    batch.end();
    return read;
  }

  it('reads each blob asked for, in whatever chunks it comes', () => {
    const read = readBatch(
      [
        [id, 5],
        [other, 0],
      ],
      `${id} blob 5\nhe`,
      'llo',
      `\n${other} blob 0\n\n`,
    );
    expect(read.get(id)?.toString()).toBe('hello');
    expect(read.get(other)?.length).toBe(0);
  });

  it('leaves out a blob the repository lacks', () => {
    expect(readBatch([[id, 5]], `${id} missing\n`).has(id)).toBe(false);
  });

  it('stops at a header that names another blob, another type or another size', () => {
    for (const header of [
      `${other} blob 5\n`,
      `${id} tree 5\n`,
      `${id} blob 6\n`,
      `${id} ambiguous\n`,
    ]) {
      expect(() => readBatch([[id, 5]], header), header).toThrow(GitError);
    }
  });

  it('stops at more than was asked for, a header too long, or an answer cut short', () => {
    expect(() => readBatch([[id, 1]], `${id} blob 1\nx\n${id} blob 1\nx\n`)).toThrow(GitError);
    expect(() => readBatch([[id, 1]], 'x'.repeat(GIT_LIMITS.errorBytes))).toThrow(GitError);
    expect(() => readBatch([[id, 5]], `${id} blob 5\nhel`)).toThrow(GitError);
    expect(() => readBatch([[id, 1]], `${id} blob 1\nxy`)).toThrow(GitError);
  });
});
