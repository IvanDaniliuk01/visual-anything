/**
 * Times what M11b's program does with git and files, in Node (ADR 0071, ADR 0072), on the benchmark's
 * project and a newer version of it with 100 changes (`app/src/bench/versions.ts`):
 *
 * - reading the older version from git, in a temporary repository with two commits, the older then
 *   the newer: as the program reads one, through `Versions` from nothing (finding git, its version,
 *   the repository, `ls-tree`, `cat-file --batch` and the loader's checks), and its parts; then the
 *   comparison with the project now, which `version/compare` answers with;
 * - the merge driver on a 10,000-element model file, from its three files to the one it writes.
 *
 * A short check, not a benchmark. Nothing is written outside the system's temporary folder, which is
 * removed at the end; the person's git configuration is neither read for the commits nor written.
 *
 *   pnpm exec tsx packages/server/scripts/versions-timing.ts [elements] [runs]
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareProjects, type ProjectSnapshot } from '@visual-anything/core';
import { syntheticProject } from '@visual-anything/app/src/bench/synthetic';
import { changedVersion, sideOfMerge } from '@visual-anything/app/src/bench/versions';
import { formatFile } from '@visual-anything/schema/format';
import { runMergeDriver } from '../src/merge-driver';
import { loadProjectFrom } from '../src/project';
import { writeProjectFolder } from '../src/test-support';
import { findGit, startGit } from '../src/versions/git';
import { listVersions, openRepository, readCommit } from '../src/versions/repository';
import { Versions } from '../src/versions/versions';

const elements = Number(process.argv[2] ?? 10_000);
const runs = Number(process.argv[3] ?? 10);

const ms = (value: number) => `${value.toFixed(2)} ms`;
const median = (values: readonly number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/** Runs `work` once to warm the code, then `runs` times, each timed after its untimed `prepare`. */
async function time<T>(
  work: () => Promise<T> | T,
  prepare: () => Promise<void> | void = () => {},
): Promise<{ times: number[]; result: T }> {
  await prepare();
  let result = await work();
  const times: number[] = [];
  for (let run = 0; run < runs; run++) {
    await prepare();
    const began = performance.now();
    result = await work();
    times.push(performance.now() - began);
  }
  return { times, result };
}

function say(name: string, times: readonly number[]): void {
  console.log(
    `  ${name.padEnd(58)} median ${ms(median(times)).padStart(11)}, worst ${ms(Math.max(...times)).padStart(11)} (${times.length} runs)`,
  );
}

/** The project files' bytes, as the folder or a commit holds them. */
function sizeOf(project: ProjectSnapshot): number {
  return (
    formatFile('project', project.project).length +
    formatFile('model', project.model).length +
    project.views.reduce((sum, view) => sum + formatFile('view', view).length, 0)
  );
}

const found = await findGit({ projectFolder: await realpath(tmpdir()) });
if (!found.ok) throw new Error(found.why);
const gitPath = found.path;

/** Git for setting the repository up: a fixed author, no signing, no line-ending conversion. */
function git(cwd: string, ...args: string[]): string {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_')),
  );
  return execFileSync(
    gitPath,
    [
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
      ...args,
    ],
    { cwd, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
}

const older = syntheticProject({ elements });
const newer = changedVersion(older, 100);
const root = await realpath(await mkdtemp(join(tmpdir(), 'va-versions-timing-')));
try {
  // ——— Reading a version from git ———

  const repository = join(root, 'repository');
  git(root, 'init', '-q', repository);
  await writeProjectFolder(repository, older);
  git(repository, 'add', '-A');
  git(repository, 'commit', '-q', '-m', 'The benchmark project');
  const commit = git(repository, 'rev-parse', 'HEAD').trim();
  await writeProjectFolder(repository, newer);
  git(repository, 'add', '-A');
  git(repository, 'commit', '-q', '-m', 'A hundred changes');
  console.log(
    `${older.model.elements.length} elements and ${older.model.relations.length} relations, about ${Math.round(sizeOf(older) / 1024)} KiB of project files; git ${git(root, 'version').trim()}`,
  );

  console.log('\nReading the older commit, as `version/compare` does');
  const listed = await time(async () => {
    const versions = new Versions(repository);
    const listing = await versions.list();
    versions.close();
    return listing;
  });
  say('Versions.list, from nothing', listed.times);
  console.log(`    ${listed.result.versions.length} versions listed`);
  // A fresh `Versions` for each read, which keeps the version it read last; listed first, untimed.
  let versions = new Versions(repository);
  const read = await time(
    async () => {
      const outcome = await versions.read(commit);
      versions.close();
      if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
      return outcome.project;
    },
    async () => {
      versions = new Versions(repository);
      await versions.list();
    },
  );
  say('Versions.read, after a listing', read.times);

  const started = await startGit(gitPath, { cwd: repository });
  if (!started.ok) throw new Error(started.why);
  const opened = await openRepository(started.git);
  if (!opened.ok) throw new Error(opened.why);
  say('openRepository: rev-parse', (await time(() => openRepository(started.git))).times);
  say('listVersions', (await time(() => listVersions(opened.repository))).times);
  const commitRead = await time(() => readCommit(opened.repository, commit));
  say('readCommit: ls-tree and cat-file --batch, within the caps', commitRead.times);
  const source = commitRead.result;
  if (!source.ok) throw new Error('The commit did not read.');
  const loaded = await time(() => loadProjectFrom(source.source));
  say('loadProjectFrom: the loader’s checks from bytes', loaded.times);
  if (!loaded.result.ok) throw new Error('The commit did not load.');
  const version = loaded.result.project;
  const compared = await time(() => compareProjects(version, newer));
  say('compareProjects with the project now', compared.times);
  console.log(`    ${compared.result.changes.length} changes`);

  // ——— The merge driver ———

  console.log('\nThe merge driver on the model file');
  const merging = join(root, 'merge');
  git(root, 'init', '-q', merging);
  const ours = sideOfMerge(older.model, 'ours', { changes: 200, additions: 50 });
  const theirs = sideOfMerge(older.model, 'theirs', { changes: 200, additions: 50 });
  await writeFile(join(merging, '.merge_file_O'), formatFile('model', older.model));
  await writeFile(join(merging, '.merge_file_B'), formatFile('model', theirs));
  const oursText = formatFile('model', ours);
  const said: string[] = [];
  const driven = await time(
    () =>
      runMergeDriver(['.merge_file_O', '.merge_file_A', '.merge_file_B', 'model.vamodel'], {
        cwd: merging,
        out: (line) => said.push(line),
        err: (line) => said.push(line),
      }),
    // The driver writes over ours: each run starts from ours again.
    () => writeFile(join(merging, '.merge_file_A'), oursText),
  );
  say('runMergeDriver, 200 changes and 50 additions a side', driven.times);
  console.log(`    exit ${driven.result}${said.length > 0 ? `; it said ${said.at(-1)}` : ''}`);
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 10 });
}
