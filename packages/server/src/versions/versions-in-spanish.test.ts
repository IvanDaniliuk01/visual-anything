/**
 * What the program says about versions, in Spanish (ADR-0038): every reason it gives for a listing it
 * could not make, a version it could not read and a comparison it refused, as the code writes them,
 * must read in Spanish through the app's templates. What git itself said stays as it is. A fake git
 * answers here, so that every reason can be reached.
 */
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { untranslatedParts } from '@visual-anything/app/src/i18n/translate';
import { describe, expect, it } from 'vitest';
import { formatProjectProblem, loadProjectFrom } from '../project';
import { findGit, Git, GitError, NO_GIT, refusedCall, startGit, type Spawn } from './git';
import { parseCommitId, parseLog, parseRefs, parseRepositoryPlace, parseTree } from './parse';
import { BatchReader, NOT_A_REPOSITORY, openRepository, readCommit } from './repository';
import { NOT_LISTED } from './versions';

const ID = 'c'.repeat(40);
const TREE = 'd'.repeat(40);
const BLOB = 'e'.repeat(40);

/** A git that answers each call as `answer` says: its output, its code and what it says on errors. */
function fakeGit(
  answer: (args: readonly string[]) => { out?: string; code?: number; err?: string } | 'hang',
  version = { major: 2, minor: 49, patch: 0, text: '2.49.0' },
  limits = {},
): Git {
  const spawn: Spawn = (_file, args) => {
    const process = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: () => {
        setImmediate(() => process.emit('close', null));
        return true;
      },
    });
    const said = answer(args);
    if (said !== 'hang') {
      setImmediate(() => {
        if (said.err !== undefined) process.stderr.write(said.err);
        process.stdout.write(said.out ?? '');
        setImmediate(() => process.emit('close', said.code ?? 0));
      });
    }
    return process;
  };
  return new Git('/usr/bin/git', version, { cwd: '/work/project', spawn, env: {}, limits });
}

const PLACE = { out: `/work\nproject/\nsha1\n` };

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function failureOf(run: () => unknown): Promise<string> {
  try {
    await run();
  } catch (error) {
    return reasonOf(error);
  }
  throw new Error('It did not fail.');
}

/** A tree's entry as `ls-tree -z -l` writes it. */
const entry = (mode: string, type: string, id: string, size: string, path: string) =>
  `${mode} ${type} ${id} ${size.padStart(7)}\t${path}\0`;

describe('what the program says about versions, in Spanish', () => {
  it('reads every reason in Spanish, but for what git said', async () => {
    const said: string[] = [NOT_A_REPOSITORY, NO_GIT, NOT_LISTED];

    // Finding and starting git.
    const named = await findGit({
      projectFolder: '/work/project',
      env: { VISUAL_ANYTHING_GIT: '/opt/nothing/git' },
      platform: 'linux',
      fs: {
        realpath: () => Promise.reject(new Error('ENOENT')),
        stat: () => Promise.reject(new Error('ENOENT')),
        lstat: () => Promise.reject(new Error('ENOENT')),
        access: () => Promise.resolve(),
      },
    });
    if (!named.ok) said.push(named.why);
    for (const answer of [
      { out: 'git version 2.30.1\n' },
      { out: 'not git\n' },
      { out: '', code: 1 },
    ]) {
      const started = await startGit('/usr/bin/git', {
        cwd: '/w',
        env: {},
        spawn: spawnOf(answer),
      });
      if (!started.ok) said.push(started.why);
    }
    said.push(...[refusedCall(['show']), refusedCall(['config', 'a.b', 'c'])].map(String));

    // The runner's limits and failures.
    said.push(
      await failureOf(() =>
        fakeGit(() => 'hang', undefined, { callMs: 10 }).run({ args: ['log'] }),
      ),
    );
    said.push(
      await failureOf(() =>
        fakeGit(() => ({ out: 'x'.repeat(100) }), undefined, { listingBytes: 10 }).run({
          args: ['log'],
        }),
      ),
    );
    said.push(await failureOf(() => fakeGit(() => ({ code: 1 })).run({ args: ['log'] })));
    said.push(await failureOf(() => fakeGit(() => ({})).run({ args: ['show'] })));

    // Answers that do not read.
    const nothing = Buffer.from('x');
    said.push(await failureOf(() => parseRepositoryPlace(nothing)));
    said.push(await failureOf(() => parseCommitId(nothing, 'sha1')));
    said.push(await failureOf(() => parseTree(nothing, 'sha1')));
    said.push(await failureOf(() => parseLog(Buffer.from('a\0'), 'sha1')));
    said.push(await failureOf(() => parseRefs(Buffer.from('a\n'), 'sha1')));
    said.push(
      await failureOf(() => {
        const batch = new BatchReader([[ID, 1]], new Map());
        batch.write(Buffer.from(`${BLOB} blob 1\n`));
      }),
    );

    // Finding the repository.
    for (const answer of [
      { code: 128, err: 'fatal: not a git repository (or any of the parent directories): .git' },
      { code: 128, err: "fatal: detected dubious ownership in repository at '/work'" },
      { code: 128 },
    ]) {
      const opened = await openRepository(fakeGit(() => answer));
      if (!opened.ok) said.push(opened.why);
    }
    const inside = await openRepository(fakeGit(() => ({ out: '/usr\nproject/\nsha1\n' })));
    if (!inside.ok) said.push(inside.why);
    const partial = await openRepository(
      fakeGit(
        (args) => (args.includes('rev-parse') ? PLACE : { out: 'remote.origin.promisor true\n' }),
        { major: 2, minor: 40, patch: 0, text: '2.40.0' },
      ),
    );
    if (!partial.ok) said.push(partial.why);

    // Reading a commit.
    const commitOf = async (
      tree: (args: readonly string[]) => string,
      limits = {},
      batch = '',
    ): Promise<string[]> => {
      const git = fakeGit(
        (args) => {
          if (args.includes('rev-parse')) return PLACE;
          if (args.includes('cat-file')) return { out: batch };
          return { out: tree(args) };
        },
        undefined,
        limits,
      );
      const opened = await openRepository(git);
      if (!opened.ok) throw new Error(opened.why);
      const read = await readCommit(opened.repository, ID);
      if (!read.ok) return read.problems.map(formatProjectProblem);
      const loaded = loadProjectFrom(read.source);
      return loaded.ok ? [] : loaded.errors.map(formatProjectProblem);
    };
    said.push(...(await commitOf(() => '')));
    said.push(...(await commitOf(() => entry('100644', 'blob', BLOB, '1', 'project'))));
    const folder = (args: readonly string[]) =>
      args.includes('--') ? entry('040000', 'tree', TREE, '-', 'project') : '';
    // Each file's own problem shows in a kind folder, where every file is read on its own.
    const VIEWS = 'a'.repeat(40);
    said.push(
      ...(await commitOf((args) =>
        args.includes(VIEWS)
          ? [
              entry('120000', 'blob', BLOB, '10', 'a.vaview'),
              entry('160000', 'commit', ID, '-', 'b.vaview'),
              entry('100664', 'blob', BLOB, '10', 'c.vaview'),
              entry('100644', 'blob', 'f'.repeat(40), 'BAD', 'd.vaview'),
              entry('100644', 'blob', BLOB, String(65 * 1024 * 1024), 'e.vaview'),
            ].join('')
          : args.includes(TREE)
            ? [
                entry('040000', 'tree', VIEWS, '-', 'views'),
                entry('120000', 'blob', BLOB, '10', 'packages'),
                entry('160000', 'commit', ID, '-', 'comments'),
                entry('040000', 'tree', TREE, '-', 'scenarios'),
                entry('040000', 'tree', TREE, '-', 'Scenarios'),
                entry('100644', 'blob', BLOB, '10', 'tours'),
              ].join('')
            : folder(args),
      )),
    );
    const manyFiles = (args: readonly string[]) =>
      args.includes(TREE)
        ? entry('100644', 'blob', BLOB, '10', 'a.vaproject') +
          entry('100644', 'blob', 'a'.repeat(40), '10', 'b.vamodel')
        : folder(args);
    said.push(...(await commitOf(manyFiles, { files: 1 })));
    said.push(...(await commitOf(manyFiles, { totalBytes: 5 })));

    // What the session and the endpoint refuse.
    said.push(
      'Neither the version nor the project now has the view "overview".',
      'The version could not be compared: A newer request stopped this one.',
      'Another version was asked for, so reading this one stopped.',
      'Reading the version took longer than 120 s, so it was stopped.',
      'Listing the versions took longer than 120 s, so it was stopped.',
      'The repository has no commits yet.',
      'This Visual Anything reads no versions.',
      new GitError('stopped', 'A newer request stopped this one.').message,
    );

    expect(said.length).toBeGreaterThan(40);
    const untranslated = said.flatMap((message) =>
      untranslatedParts('es', message).filter((part) => !part.startsWith('fatal:')),
    );
    expect(untranslated).toEqual([]);
  });
});

/** A spawn that answers one call as given. */
function spawnOf(answer: { out?: string; code?: number; err?: string }): Spawn {
  return () => {
    const process = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: () => true,
    });
    setImmediate(() => {
      process.stdout.write(answer.out ?? '');
      setImmediate(() => process.emit('close', answer.code ?? 0));
    });
    return process;
  };
}
