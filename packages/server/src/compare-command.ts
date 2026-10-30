/**
 * The command that compares two versions of a project for a pull request (ADR 0070, ADR 0071):
 *
 *   visual-anything compare <folder> --base <ref> [--head <ref>] [--view <id>]... --out <folder>
 *                           [--theme light|dark] [--image-url <prefix>]
 *
 * It reads the base, and the head when one is given, from the project's git repository through the
 * program's git runner: refs the person typed, checked and resolved to commit ids, then the commits'
 * trees and blobs by their ids, read-only. The head is otherwise the files on disk. Both go through the
 * checks of opening a folder. It needs no program running, and writes nothing to the repository.
 *
 * It writes in the out folder only, each file atomically and as a regular file: `summary.md`, the
 * comparison in Markdown, and for each view that changed `<view>.before.svg`, `<view>.after.svg` and
 * `<view>.comparison.svg`, drawn from the same scenes as the canvas. Its names are never a project
 * file's, and the out folder may not be the project folder, one of its kind folders, or inside git's
 * own folder.
 */
import { lstat, mkdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  compareProjects,
  type Change,
  type ChangeStatus,
  type Comparison,
  type ProjectSnapshot,
  type ThemeName,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { svgOfComparison } from '@visual-anything/app/src/export/comparison';
import {
  writeComparisonSummary,
  type SummaryDrawings,
  type SummaryVersion,
} from '@visual-anything/app/src/export/comparison-summary';
import { translatorFor } from '@visual-anything/app/src/i18n';
import { errorCode, errorReason } from './errors';
import { FOLDERS } from './layout';
import { formatProjectProblem, loadProject, loadProjectFrom } from './project';
import { findGit, GitError, GIT_LIMITS, isInsidePath, startGit, type Spawn } from './versions/git';
import {
  commitInfo,
  openRepository,
  readCommit,
  resolveRef,
  type Repository,
} from './versions/repository';
import { comparisonOfView } from './versions/versions';
import { writeFileAtomic } from './writer';

export const COMPARE_USAGE = `Usage: visual-anything compare <folder> --base <ref> [--head <ref>] [--view <id>]...
                              --out <folder> [--theme light|dark] [--image-url <prefix>]

Compares two versions of the project in folder by id, and writes what changed, for a pull request:
summary.md, every change in Markdown, and for each view that changed <view>.before.svg,
<view>.after.svg and <view>.comparison.svg, drawn as the app draws them. The base is a commit of the
project's git repository; the head is the files on disk, or another commit. It needs no Visual
Anything running, reads the repository through git without writing to it, and writes only in the
out folder.

  --base <ref>        The older version: a branch, a tag, a commit or HEAD, as git names it.
  --head <ref>        The newer version, named the same way; the files on disk by default.
  --view <id>         Keep to this view: its drawings, and the changes it draws. Give it again for
                      more views; every view that changed by default.
  --out <folder>      The folder to write in, made when missing. Files of the same names are replaced;
                      nothing else in it is touched.
  --theme <t>         The drawings' colors: light, the default, or dark.
  --image-url <p>     Link the drawings from the summary as <p><file>, such as the address they are
                      uploaded to; by default by their file names, beside the summary.
  -h, --help          Show this help.`;

/** What the compare command line asks for. */
export interface CompareCommandLine {
  folder: string;
  base: string;
  head?: string;
  views: string[];
  out: string;
  theme: ThemeName;
  imageUrl?: string;
}

export type ParsedCompareCommandLine =
  | { ok: true; help: true }
  | { ok: true; help: false; value: CompareCommandLine }
  | { ok: false; message: string };

/** Reads the compare command line. */
export function parseCompareCommandLine(argv: readonly string[]): ParsedCompareCommandLine {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  const { values, positionals } = parsed;
  if (values.help === true) return { ok: true, help: true };
  if (positionals.length !== 1) {
    return {
      ok: false,
      message:
        positionals.length === 0
          ? 'Give the project folder to compare.'
          : `Give one project folder, not ${positionals.length}.`,
    };
  }
  if (values.base === undefined || values.base === '') {
    return { ok: false, message: 'Give the older version with --base <ref>, such as main.' };
  }
  if (values.head === '') return { ok: false, message: 'Give the newer version after --head.' };
  if (values.out === undefined || values.out === '') {
    return { ok: false, message: 'Give the folder to write in with --out <folder>.' };
  }
  const views = values.view ?? [];
  if (views.some((view) => view === '')) {
    return { ok: false, message: 'Give a view’s id after --view.' };
  }
  const theme = values.theme ?? 'light';
  if (theme !== 'light' && theme !== 'dark') {
    return { ok: false, message: `"${theme}" is no theme; give light or dark.` };
  }
  const imageUrl = values['image-url'];
  // eslint-disable-next-line no-control-regex
  if (imageUrl !== undefined && (imageUrl === '' || /[\u0000-\u001f\u007f]/.test(imageUrl))) {
    return {
      ok: false,
      message:
        'Give the start of the drawings’ addresses after --image-url, without control characters.',
    };
  }
  return {
    ok: true,
    help: false,
    value: {
      folder: positionals[0] as string,
      base: values.base,
      ...(values.head === undefined ? {} : { head: values.head }),
      views: [...new Set(views)],
      out: values.out,
      theme,
      ...(imageUrl === undefined ? {} : { imageUrl }),
    },
  };
}

function parse(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      base: { type: 'string' },
      head: { type: 'string' },
      view: { type: 'string', multiple: true },
      out: { type: 'string' },
      theme: { type: 'string' },
      'image-url': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
}

/** Where the compare command says things, and where it runs; tests give their own git. */
export interface CompareEnvironment {
  cwd: string;
  /** Writes a line to standard output: what it wrote. */
  out: (line: string) => void;
  /** Writes a line to standard error: why it could not, and what a drawing lost. */
  err: (line: string) => void;
  /** The environment git is found from and runs with; `process.env` by default. */
  env?: NodeJS.ProcessEnv;
  spawn?: Spawn;
}

/** The file the summary is written to. */
export const SUMMARY_FILE = 'summary.md';

/** The three drawings of a view, in the order they are written. */
const DRAWINGS = ['before', 'after', 'comparison'] as const;

/** A version read, and how the summary names it. */
interface Read {
  project: ProjectSnapshot;
  named: SummaryVersion;
}

/** Thrown to end the command with what it says, and exit code 1. */
class Refusal extends Error {
  readonly lines: readonly string[];
  constructor(lines: readonly string[]) {
    super(lines.join('\n'));
    this.lines = lines;
  }
}

/**
 * Runs the compare command, and resolves with its exit code: 0 when it wrote the comparison, 1 when
 * the project, a version, a view or the out folder would not do, and 2 for a command line it does not
 * understand.
 */
export async function runCompare(
  argv: readonly string[],
  environment: CompareEnvironment,
): Promise<number> {
  const parsed = parseCompareCommandLine(argv);
  if (!parsed.ok) {
    environment.err(parsed.message);
    environment.err(COMPARE_USAGE);
    return 2;
  }
  if (parsed.help) {
    environment.err(COMPARE_USAGE);
    return 0;
  }
  try {
    await compare(parsed.value, environment);
    return 0;
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    for (const line of error.lines) environment.err(line);
    return 1;
  }
}

async function compare(line: CompareCommandLine, environment: CompareEnvironment): Promise<void> {
  const given = resolve(environment.cwd, line.folder);
  let folder: string;
  try {
    folder = await realpath(given);
  } catch {
    throw new Refusal([`The folder ${given} does not exist.`]);
  }
  const out = resolve(environment.cwd, line.out);
  refuseOutFolder(out, folder);

  const repository = await repositoryOf(folder, environment);
  refuseOutFolder(out, folder, repository);
  const older = await readRef(repository, line.base);
  const newer =
    line.head === undefined ? await readDisk(folder) : await readRef(repository, line.head);

  const missing = line.views.filter(
    (view) => !hasView(older.project, view) && !hasView(newer.project, view),
  );
  if (missing.length > 0) {
    const ids = [
      ...new Set([...newer.project.views, ...older.project.views].map((view) => view.id)),
    ];
    throw new Refusal([
      `Neither version has the view${missing.length === 1 ? '' : 's'} ${missing.map((view) => `"${view}"`).join(', ')}.${ids.length === 0 ? ' They have no views.' : ` Their views: ${ids.join(', ')}.`}`,
    ]);
  }

  const whole = compareProjects(older.project, newer.project);
  const byView = new Map<Id, Comparison>();
  const viewsOf = line.views.length > 0 ? line.views : allViews(older.project, newer.project);
  for (const view of viewsOf) {
    byView.set(view, comparisonOfView(whole, older.project, newer.project, view));
  }
  const comparison = line.views.length > 0 ? joined(whole, [...byView.values()]) : whole;
  const changed = viewsOf.filter((view) => (byView.get(view)?.changes.length ?? 0) > 0);

  const real = await outFolder(out, folder, repository);
  const stems = fileStems(changed);
  const drawings: Record<Id, SummaryDrawings> = {};
  const written: string[] = [];
  for (const view of changed) {
    const stem = stems.get(view) as string;
    const links: SummaryDrawings = {};
    for (const drawing of DRAWINGS) {
      const name = `${stem}.${drawing}.svg`;
      const svg = svgOfComparison(older.project, newer.project, view, whole, {
        drawing,
        theme: line.theme,
        title: titleOf(older.named, newer.named),
      });
      // A view one version lacks is drawn empty there, which loses nothing of it.
      const lacks =
        (drawing === 'before' && !hasView(older.project, view)) ||
        (drawing === 'after' && !hasView(newer.project, view));
      if (!lacks) for (const lost of svg.lost) environment.err(`Lost in ${name}: ${lost}`);
      await write(real, name, svg.text);
      written.push(name);
      links[drawing] =
        line.imageUrl === undefined ? name : `${line.imageUrl}${encodeURIComponent(name)}`;
    }
    drawings[view] = links;
  }
  const summary = writeComparisonSummary(older.project, newer.project, comparison, {
    versions: { older: older.named, newer: newer.named },
    drawings,
    t: translatorFor('en'),
  });
  await write(real, SUMMARY_FILE, summary.endsWith('\n') ? summary : `${summary}\n`);
  written.push(SUMMARY_FILE);

  const { counts } = comparison;
  environment.out(
    `Compared ${describe(older.named)} with ${describe(newer.named)}: ${countsText(counts)}.`,
  );
  environment.out(
    `Wrote ${written.length === 1 ? 'the summary' : `the summary and the drawings of ${changed.length === 1 ? 'one view' : `${changed.length} views`}`} in ${real}:`,
  );
  for (const name of written) environment.out(`  ${name}`);
  const unchanged = line.views.filter((view) => !changed.includes(view));
  if (unchanged.length > 0) {
    environment.out(
      `Nothing changed in ${unchanged.map((view) => `"${view}"`).join(', ')}, so no drawing of it was written.`,
    );
  }
}

/** The project folder's repository, with git found and started as the program does. */
async function repositoryOf(folder: string, environment: CompareEnvironment): Promise<Repository> {
  const env = environment.env ?? process.env;
  const found = await findGit({
    projectFolder: folder,
    startedIn: environment.cwd,
    env,
    warn: (line) => environment.err(line),
  });
  if (!found.ok) throw new Refusal([found.why]);
  const started = await startGit(found.path, {
    cwd: folder,
    env,
    ...(environment.spawn === undefined ? {} : { spawn: environment.spawn }),
  });
  if (!started.ok) throw new Refusal([started.why]);
  const opened = await openRepository(started.git);
  if (!opened.ok) throw new Refusal([opened.why]);
  return opened.repository;
}

/** A version a ref names: resolved to its commit, then read by tree and blob ids, within 120 s. */
async function readRef(repository: Repository, ref: string): Promise<Read> {
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(
        new GitError(
          'timeout',
          `Reading the version took longer than ${GIT_LIMITS.readMs / 1000} s, so it was stopped.`,
        ),
      ),
    GIT_LIMITS.readMs,
  );
  try {
    const resolved = await resolveRef(repository, ref, controller.signal);
    if (!resolved.ok) throw new Refusal([`--base or --head ${ref}: ${resolved.why}`]);
    const { commit } = resolved;
    const info = await commitInfo(repository, commit, controller.signal);
    const read = await readCommit(repository, commit, { signal: controller.signal });
    if (!read.ok) {
      throw new Refusal([
        `${ref} (${info.short}) does not open:`,
        ...read.problems.map((problem) => `  ${formatProjectProblem(problem)}`),
      ]);
    }
    const loaded = loadProjectFrom(read.source);
    if (!loaded.ok) {
      throw new Refusal([
        `${ref} (${info.short}) does not open:`,
        ...loaded.errors.map((problem) => `  ${formatProjectProblem(problem)}`),
      ]);
    }
    return { project: loaded.project, named: { name: ref, commit, date: info.time * 1000 } };
  } catch (error) {
    if (error instanceof Refusal) throw error;
    throw new Refusal([`${ref} could not be read: ${errorReason(error)}`]);
  } finally {
    clearTimeout(timer);
  }
}

/** The files on disk, through the checks of opening the folder. */
async function readDisk(folder: string): Promise<Read> {
  const loaded = await loadProject(folder);
  if (!loaded.ok) {
    throw new Refusal([
      `The project in ${folder} does not open:`,
      ...loaded.errors.map((problem) => `  ${formatProjectProblem(problem)}`),
    ]);
  }
  return { project: loaded.project, named: { name: 'the files on disk' } };
}

function hasView(project: ProjectSnapshot, view: Id): boolean {
  return project.views.some((each) => each.id === view);
}

/** Every view of either version: the newer version's first, then those only the older has. */
function allViews(older: ProjectSnapshot, newer: ProjectSnapshot): Id[] {
  return [...new Set([...newer.views, ...older.views].map((view) => view.id))];
}

/** The changes of several views' comparisons, each once, in the whole comparison's order. */
function joined(whole: Comparison, parts: readonly Comparison[]): Comparison {
  const kept = new Set<Change>(parts.flatMap((part) => part.changes));
  const changes = whole.changes.filter((change) => kept.has(change));
  const counts: Record<ChangeStatus, number> = { added: 0, removed: 0, changed: 0, moved: 0 };
  for (const change of changes) counts[change.status] += 1;
  const names: Comparison['names'] = {};
  for (const part of parts) Object.assign(names, part.names);
  return { changes, counts, names };
}

/** Names that Windows keeps for devices, which no file may take, whatever its extensions. */
const DEVICE_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/**
 * The stem each view's drawings are named by: its id, or, where two ids differ only in case, which
 * one file system on Windows and macOS takes as one name, or an id is a Windows device's name, the id
 * and a number.
 */
export function fileStems(views: readonly Id[]): Map<Id, string> {
  const stems = new Map<Id, string>();
  const taken = new Set<string>();
  for (const view of views) {
    let stem = view;
    for (let count = 2; taken.has(stem.toLowerCase()) || DEVICE_NAMES.test(stem); count += 1) {
      stem = `${view}-${count}`;
    }
    taken.add(stem.toLowerCase());
    stems.set(view, stem);
  }
  return stems;
}

/**
 * Refuses an out folder that would mix the drawings with the project's files or write into git's
 * own folder: the project folder, one of its kind folders, or a folder inside the repository's
 * `.git`.
 */
function refuseOutFolder(out: string, folder: string, repository?: Repository): void {
  const shown = out;
  if (isInsidePath(out, folder) && isInsidePath(folder, out)) {
    throw new Refusal([
      `${shown} is the project folder: give another --out, such as a folder beside it.`,
    ]);
  }
  for (const kind of Object.values(FOLDERS)) {
    if (isInsidePath(join(folder, kind), out)) {
      throw new Refusal([
        `${shown} is inside the project’s ${kind} folder, which holds project files: give another --out.`,
      ]);
    }
  }
  if (repository !== undefined && isInsidePath(join(repository.place.top, '.git'), out)) {
    throw new Refusal([
      `${shown} is inside git’s own folder, which Visual Anything never writes to: give another --out.`,
    ]);
  }
}

/** Makes the out folder when missing, and gives its real path, checked again once links resolve. */
async function outFolder(out: string, folder: string, repository: Repository): Promise<string> {
  try {
    const found = await lstat(out).catch((error: unknown) => {
      if (errorCode(error) === 'ENOENT') return undefined;
      throw error;
    });
    if (found !== undefined && !found.isDirectory() && !found.isSymbolicLink()) {
      throw new Refusal([`${out} is not a folder: give a folder to write in with --out.`]);
    }
    await mkdir(out, { recursive: true });
    const real = await realpath(out);
    refuseOutFolder(real, folder, repository);
    return real;
  } catch (error) {
    if (error instanceof Refusal) throw error;
    throw new Refusal([`${out} could not be made: ${errorReason(error)}`]);
  }
}

/** Writes one file of the comparison atomically, as a regular file inside the out folder. */
async function write(folder: string, name: string, text: string): Promise<void> {
  const target = join(folder, name);
  try {
    await writeFileAtomic(target, new TextEncoder().encode(text), {
      regularOnly: true,
      inside: folder,
    });
  } catch (error) {
    throw new Refusal([`${target} could not be written: ${errorReason(error)}`]);
  }
}

/** How the drawings' legend calls the comparison, such as “Compared main (a1b2c3d4e5f6) with …”. */
function titleOf(older: SummaryVersion, newer: SummaryVersion): string {
  return `Compared ${describe(older)} with ${describe(newer)}`;
}

/** A version in a line: its name and the first 12 digits of its commit. */
function describe(version: SummaryVersion): string {
  const name = version.name ?? 'a version';
  return version.commit === undefined ? name : `${name} (${version.commit.slice(0, 12)})`;
}

function countsText(counts: Record<ChangeStatus, number>): string {
  const total = counts.added + counts.removed + counts.changed + counts.moved;
  if (total === 0) return 'no changes';
  return `${counts.added} added, ${counts.removed} removed, ${counts.changed} changed, ${counts.moved} moved`;
}
