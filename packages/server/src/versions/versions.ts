/**
 * The versions of the open project that the program reads from git (ADR 0071), for the apps and for
 * Claude: it finds git once, lists the versions, keeps the commits of its last five listings within ten
 * minutes, whoever asked for them, and reads one of them at a time, a new read stopping the one under
 * way. A version lives only in memory.
 */
import {
  compareView,
  itemKey,
  type Change,
  type ChangeStatus,
  type Comparison,
  type ListedVersion,
  type Problem,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { formatProjectProblem, loadProjectFrom } from '../project';
import {
  findGit,
  GitError,
  GIT_LIMITS,
  startGit,
  type Git,
  type GitLimits,
  type Spawn,
} from './git';
import { listVersions, openRepository, readCommit, type Repository } from './repository';

/** How the program finds and runs git; tests give their own. */
export interface VersionsOptions {
  /** The environment the program inherited; `process.env` by default. */
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  /** The folder the program was started in; the process's current folder by default. */
  startedIn?: string;
  spawn?: Spawn;
  limits?: Partial<GitLimits>;
  /** Prints a warning, such as about a relative `VISUAL_ANYTHING_GIT`. */
  warn?: (line: string) => void;
  /** The time now, in milliseconds since 1970, which tells how old a listing is; tests give their own. */
  now?: () => number;
}

/** How many of the program's latest listings name the commits a version may name (ADR 0071). */
export const RECENT_LISTINGS = 5;

/** How long a listing's commits may be named after it was made: ten minutes. */
export const LISTING_KEPT_MS = 10 * 60_000;

/** The versions listed, or why none could be. */
export interface VersionsListing {
  versions: ListedVersion[];
  why?: string;
}

/** A version read: its project, or why it cannot be compared. */
export type VersionRead =
  { ok: true; project: ProjectSnapshot } | { ok: false; problems: Problem[] };

/** Why a commit is refused before git hears of it. */
export const NOT_LISTED =
  'That commit is not one the program listed in its recent listings of versions: list them again, then choose one.';

export class Versions {
  readonly #folder: string;
  readonly #options: VersionsOptions;
  #git: Promise<{ ok: true; git: Git } | { ok: false; why: string }> | undefined;
  /**
   * The commits of the recent listings, oldest first, with when each was made: the only ones a version
   * may name, while their listing is one of the last {@link RECENT_LISTINGS} and younger than
   * {@link LISTING_KEPT_MS}.
   */
  #listings: { commits: ReadonlySet<string>; at: number }[] = [];
  /** The read under way, which a newer one stops. */
  #reading: AbortController | undefined;
  /** The version read last, kept to compare with again. */
  #last: { commit: string; project: ProjectSnapshot } | undefined;
  #closed = false;

  /** `folder` is the real path of the project folder, where git runs. */
  constructor(folder: string, options: VersionsOptions = {}) {
    this.#folder = folder;
    this.#options = options;
  }

  /**
   * Whether a commit is one a version may name: one of the program's last five listings, made within
   * ten minutes, holds it, whether an app or Claude asked for that listing.
   */
  isListed(commit: string): boolean {
    return this.#recent().some((listing) => listing.commits.has(commit));
  }

  /**
   * Lists the versions, and keeps their commits among those a version may name. A listing that fails
   * keeps none, and leaves the earlier ones as they were.
   */
  async list(): Promise<VersionsListing> {
    // A listing is not a read of a version: it keeps the whole limit, whatever a read is given.
    const timeout = this.#deadline(GIT_LIMITS.readMs, 'Listing the versions');
    try {
      const opened = await this.#repository(timeout.signal);
      if (!opened.ok) return { versions: [], why: opened.why };
      const versions = await listVersions(opened.repository, timeout.signal);
      this.#listings = [
        ...this.#recent(),
        { commits: new Set(versions.map((each) => each.commit)), at: this.#now() },
      ].slice(-RECENT_LISTINGS);
      return versions.length === 0
        ? { versions, why: 'The repository has no commits yet.' }
        : { versions };
    } catch (error) {
      return { versions: [], why: reasonOf(error) };
    } finally {
      timeout.done();
    }
  }

  /**
   * Reads a commit of the recent listings, through the same checks as opening a folder. Any other
   * commit is refused before git hears of it. A newer read stops this one.
   */
  async read(commit: string): Promise<VersionRead> {
    if (!this.isListed(commit)) return refused('invalid-command', NOT_LISTED);
    if (this.#last?.commit === commit) return { ok: true, project: this.#last.project };
    this.#reading?.abort(
      new GitError('stopped', 'Another version was asked for, so reading this one stopped.'),
    );
    const timeout = this.#deadline(
      this.#options.limits?.readMs ?? GIT_LIMITS.readMs,
      'Reading the version',
    );
    this.#reading = timeout.controller;
    try {
      const opened = await this.#repository(timeout.signal);
      if (!opened.ok) return refused('program-failed', opened.why);
      const read = await readCommit(opened.repository, commit, { signal: timeout.signal });
      if (!read.ok) return { ok: false, problems: read.problems.map(fileProblem) };
      const loaded = loadProjectFrom(read.source);
      if (!loaded.ok) return { ok: false, problems: loaded.errors.map(fileProblem) };
      this.#last = { commit, project: loaded.project };
      return { ok: true, project: loaded.project };
    } catch (error) {
      return refused('program-failed', reasonOf(error));
    } finally {
      timeout.done();
      if (this.#reading === timeout.controller) this.#reading = undefined;
    }
  }

  /** Stops the read under way; later ones are refused. */
  close(): void {
    this.#closed = true;
    this.#reading?.abort(new GitError('stopped', 'The project is closed.'));
  }

  /** The listings whose commits may still be named: the last five, made within ten minutes. */
  #recent(): { commits: ReadonlySet<string>; at: number }[] {
    const now = this.#now();
    return this.#listings
      .filter((listing) => now - listing.at <= LISTING_KEPT_MS)
      .slice(-RECENT_LISTINGS);
  }

  #now(): number {
    return (this.#options.now ?? Date.now)();
  }

  /** The project folder’s repository, with git found and started once. */
  async #repository(
    signal: AbortSignal,
  ): Promise<{ ok: true; repository: Repository } | { ok: false; why: string }> {
    if (this.#closed) return { ok: false, why: 'The project is closed.' };
    this.#git ??= this.#startGit();
    const started = await this.#git;
    if (!started.ok) return started;
    return openRepository(started.git, signal);
  }

  async #startGit(): Promise<{ ok: true; git: Git } | { ok: false; why: string }> {
    const { env, platform, startedIn, spawn, limits, warn } = this.#options;
    const found = await findGit({
      projectFolder: this.#folder,
      ...(env === undefined ? {} : { env }),
      ...(platform === undefined ? {} : { platform }),
      ...(startedIn === undefined ? {} : { startedIn }),
      ...(warn === undefined ? {} : { warn }),
    });
    if (!found.ok) return found;
    return startGit(found.path, {
      cwd: this.#folder,
      ...(env === undefined ? {} : { env }),
      ...(platform === undefined ? {} : { platform }),
      ...(spawn === undefined ? {} : { spawn }),
      ...(limits === undefined ? {} : { limits }),
    });
  }

  /** A read's or a listing's whole time, after which it is stopped. */
  #deadline(
    ms: number,
    what: string,
  ): { controller: AbortController; signal: AbortSignal; done: () => void } {
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        controller.abort(
          new GitError('timeout', `${what} took longer than ${ms / 1000} s, so it was stopped.`),
        ),
      ms,
    );
    return { controller, signal: controller.signal, done: () => clearTimeout(timer) };
  }
}

function fileProblem(problem: Parameters<typeof formatProjectProblem>[0]): Problem {
  return { code: 'invalid-file', message: formatProjectProblem(problem) };
}

function refused(code: Problem['code'], message: string): VersionRead {
  return { ok: false, problems: [{ code, message }] };
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * A comparison kept to what one view draws (ADR 0070): the view's own changes and those of its
 * shapes, and the changes of every element and relation it draws in either version, with their
 * counts and names.
 */
export function comparisonOfView(
  comparison: Comparison,
  older: ProjectSnapshot,
  newer: ProjectSnapshot,
  view: Id,
): Comparison {
  const { states } = compareView(comparison, older, newer, view);
  const inView = (change: Change) =>
    change.items.some(
      (ref) =>
        ('view' in ref && ref.view === view) ||
        ((ref.kind === 'element' || ref.kind === 'relation') && states.has(itemKey(ref))),
    );
  const changes = comparison.changes.filter(inView);
  const counts: Record<ChangeStatus, number> = { added: 0, removed: 0, changed: 0, moved: 0 };
  const mentioned = new Set<string>();
  for (const change of changes) {
    counts[change.status] += 1;
    for (const ref of change.items) {
      for (const [key, value] of Object.entries(ref)) {
        if (key !== 'kind' && typeof value === 'string') mentioned.add(value);
      }
    }
  }
  const names = Object.fromEntries(
    Object.entries(comparison.names).filter(([id]) => mentioned.has(id)),
  );
  return { changes, counts, names };
}
