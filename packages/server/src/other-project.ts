/**
 * Following a destination to another project (ADR 0056). The app asks, once the person agreed in its
 * tab; the local program works out the folder the destination names against this project's folder,
 * refuses one that leads out of the folder holding it (through `..` or through a link) or that holds
 * no project, and then opens that project in a tab of its own program, starting one when none runs
 * there, as `visual-anything open` and Claude's `open_app` do (ADR 0044). One program owns one
 * project's model and history (ADR 0016), so this program never opens the other project itself.
 *
 * The checks on opening use the same reading of paths, without starting anything: a destination to a
 * folder that holds no project is kept and flagged.
 */
import { readdirSync, statSync } from 'node:fs';
import { readdir, realpath, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  definitionsIn,
  projectDestinationPaths,
  projectPathProblem,
  resolveProjectPath,
  viewStateProblems,
  type Problem,
  type ProjectSnapshot,
  type ViewState,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import {
  ProgramBridge,
  ProgramUnavailableError,
  type Program,
  type StartProgram,
} from './claude/bridge';
import { errorReason } from './errors';
import { isInside, toForwardSlashes } from './paths';

/** What the app asks: the project, as the destination names it, and the view to open there. */
export interface OtherProjectRequest {
  project: string;
  view?: Id;
}

/** How opening another project went: its name, or why it did not open. */
export type OtherProjectOutcome = { ok: true; name: string } | { ok: false; problems: Problem[] };

/** Opens another project from this project's folder, as the session asks for an app. */
export type OpenOtherProject = (
  from: string,
  request: OtherProjectRequest,
) => Promise<OtherProjectOutcome>;

/** Where a destination's project is, or why it is not one to open. */
export type LocatedProject = { ok: true; folder: string } | { ok: false; problem: Problem };

function refused(code: Problem['code'], message: string): LocatedProject {
  return { ok: false, problem: { code, message } };
}

/**
 * The real folder a destination's project path names from this project's folder, checked: the path
 * must be one (`projectPathProblem`), lead to a folder that exists, stay inside the folder holding
 * this project's folder once every link on the way is resolved, and hold a `.vaproject` file.
 */
export async function locateOtherProject(folder: string, path: string): Promise<LocatedProject> {
  const why = projectPathProblem(path);
  const named = resolveProjectPath(toForwardSlashes(folder), path);
  if (why !== undefined || named === undefined) {
    return refused('invalid-destination', why ?? `"${path}" is not a path to a project.`);
  }
  let parent: string;
  let real: string;
  try {
    parent = await realpath(dirname(folder));
  } catch (error) {
    return refused(
      'program-failed',
      `The folder holding this project cannot be read (${errorReason(error)}).`,
    );
  }
  try {
    real = await realpath(named);
  } catch {
    return refused(
      'broken-destination',
      `There is no folder ${named} for this destination to open.`,
    );
  }
  if (real !== parent && !isInside(parent, real)) {
    return refused(
      'invalid-destination',
      `${named} leads, through a link, out of the folder that holds this project, so it does not open.`,
    );
  }
  try {
    if (!(await stat(real)).isDirectory()) {
      return refused('broken-destination', `${named} is not a folder, so it holds no project.`);
    }
    const names = await readdir(real, { withFileTypes: true });
    if (!names.some((entry) => entry.isFile() && entry.name.endsWith('.vaproject'))) {
      return refused('broken-destination', `${named} holds no project: it has no .vaproject file.`);
    }
  } catch (error) {
    return refused('broken-destination', `${named} cannot be read (${errorReason(error)}).`);
  }
  return { ok: true, folder: toForwardSlashes(real) };
}

/** A program attached to a project, for as long as it takes to open a tab there. */
export type AttachedProgram = Pick<Program, 'project' | 'openApp'> & { close(): void };

/** How the local program reaches the program of another project. */
export interface OtherProjectOptions {
  /** The runtime folder where programs leave their records; without one, no other project opens. */
  runtime: string | null | undefined;
  /** Whether a program started for the other project serves the app from its sources. */
  dev?: boolean;
  /** How to start that program; by default a background process of this one's own command line. */
  start?: StartProgram;
  /** How to attach to it, for tests; a {@link ProgramBridge} by default. */
  attach?: (folder: string) => AttachedProgram;
}

/**
 * Opens another project in a tab of its own program, at its view when the destination names one:
 * the program that runs there, or one started there, which stops once idle as one Claude starts does.
 */
export function otherProjectOpener(options: OtherProjectOptions): OpenOtherProject {
  return async (from, request) => {
    const located = await locateOtherProject(from, request.project);
    if (!located.ok) return { ok: false, problems: [located.problem] };
    const { runtime } = options;
    if (runtime === undefined || runtime === null) {
      return {
        ok: false,
        problems: [
          {
            code: 'program-failed',
            message:
              'This Visual Anything keeps no runtime folder, so it cannot reach the program of another project.',
          },
        ],
      };
    }
    const program =
      options.attach?.(located.folder) ??
      new ProgramBridge({
        folder: located.folder,
        runtime,
        ...(options.dev === undefined ? {} : { dev: options.dev }),
        ...(options.start === undefined ? {} : { start: options.start }),
      });
    try {
      let project: ProjectSnapshot;
      try {
        project = await program.project();
      } catch (error) {
        if (!(error instanceof ProgramUnavailableError)) throw error;
        return { ok: false, problems: [{ code: 'program-failed', message: error.message }] };
      }
      const state: ViewState | undefined =
        request.view === undefined ? undefined : { view: request.view };
      const problems = state === undefined ? [] : viewStateProblems(project, state);
      if (problems.length > 0) {
        return {
          ok: false,
          problems: problems.map((message) => ({
            code: 'unknown-view' as const,
            message: `"${project.project.name}" cannot open there: ${message}`,
          })),
        };
      }
      try {
        await program.openApp(state);
      } catch (error) {
        if (!(error instanceof ProgramUnavailableError)) throw error;
        return { ok: false, problems: [{ code: 'program-failed', message: error.message }] };
      }
      return { ok: true, name: project.project.name };
    } finally {
      program.close();
    }
  };
}

/**
 * Whether a folder holds a project, read at once, for the checks on opening: a folder with a
 * `.vaproject` file in it.
 */
function holdsProject(folder: string): boolean {
  try {
    if (!statSync(folder).isDirectory()) return false;
    return readdirSync(folder, { withFileTypes: true }).some(
      (entry) => entry.isFile() && entry.name.endsWith('.vaproject'),
    );
  } catch {
    return false;
  }
}

/** The most destinations to other projects the checks on opening look at, and warn about. */
const MAX_CHECKED_PROJECTS = 20;

/**
 * Warnings about destinations to other projects whose folder holds no project, as the project is
 * opened: each is kept and flagged, as a broken step is. At most 20 paths are looked at; links are
 * left for the time a destination is followed, which checks them again.
 */
export function projectDestinationWarnings(state: ProjectSnapshot, folder: string): Problem[] {
  const warnings: Problem[] = [];
  const paths = projectDestinationPaths(state, definitionsIn(state));
  for (const { path, subjects } of paths.slice(0, MAX_CHECKED_PROJECTS)) {
    const named = resolveProjectPath(toForwardSlashes(folder), path);
    if (named === undefined || holdsProject(named)) continue;
    warnings.push({
      code: 'broken-destination',
      message: `A destination opens the project in ${path}, but ${named} holds no project; it is kept, and opens nothing until a project is there.`,
      subjects: [...subjects],
    });
  }
  return warnings;
}
