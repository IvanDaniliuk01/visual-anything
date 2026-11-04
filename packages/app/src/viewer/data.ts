/**
 * The project a read-only page holds, as data (ADR 0041): its project file, its model, the packages of
 * its own, its views and its scenarios, as the program reads them from the project's files, and the
 * view state the page opens at. Built-in packages are named by id, as a project file names them, and
 * come with the viewer, as they come with the program.
 *
 * Writing keeps images only as the core cleans them, so that what cleaning drops, such as a photo's
 * position, never travels in a page, and leaves out package code and what it asks to reach (ADR 0054),
 * which no page runs. Reading makes the same checks as opening a project: each file
 * against its kind's schema, the ids of packages, views and scenarios once each, the packages the
 * project lists, then the core's rules. A page whose data was changed by hand opens only when it is
 * still a valid project.
 */
import {
  MAX_VIEW_STATE_ADDRESS,
  MEDIA_CAPS,
  builtinPackage,
  checkMediaFile,
  checkProject,
  cleanedImage,
  decodeBase64,
  picturesOf,
  solidsIn,
  type Problem,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type {
  FileContentByKind,
  FileKind,
  ImageDefinition,
  ModelFile,
  PackageFile,
  ProjectFile,
  ScenarioFile,
  TourFile,
  ViewFile,
} from '@visual-anything/schema';
import type { ValidationResult } from '@visual-anything/schema/validate';
import { readPageSolids, type PageSolids } from './solids';

/** The version of the page's data format; a page of a later one is refused with what to do. */
export const PAGE_FORMAT = 1;

/** The id of the element that holds a page's data. */
export const PAGE_DATA_ID = 'visual-anything-project';

/** What a read-only page holds of its project. */
export interface PageData {
  /** The version of this format. */
  format: typeof PAGE_FORMAT;
  /** The view state the page opens at, as a view address's fragment writes it, without `#`. */
  start?: string;
  /** When the page was made, as an ISO 8601 time. */
  made?: string;
  project: ProjectFile;
  model: ModelFile;
  /**
   * The packages of the project's own that it lists, with their images as cleaning gives them, and
   * without their code and capabilities.
   */
  packages: PackageFile[];
  views: ViewFile[];
  scenarios: ScenarioFile[];
  /**
   * Its tours, which the page plays full screen (ADR 0058), without their steps' speaker notes,
   * which are the presenter's own; left out when it has none. Threads of comments never travel in a
   * page: they are often remarks still being worked out, and they name people (ADR 0059).
   */
  tours?: TourFile[];
  /**
   * What it holds of the solids its views show (ADR 0075): their files, or only their pictures; left
   * out when its views show none. Data, never fetched and never run.
   */
  solids?: PageSolids;
  /**
   * The media files its views' pictures show (ADR 0098), by hash, in base64; left out when they show
   * none. Data, never fetched and never run: each is checked on opening against its name and its
   * reader, and one that fails is drawn as a missing picture.
   */
  media?: Record<string, string>;
}

/** What else a page's data says, besides the project. */
export interface PageDataOptions {
  start?: string;
  made?: Date;
  /** The solids its views show, as the export gathered them; none for a page without solids. */
  solids?: PageSolids;
  /** The media files its pictures show, by hash, in base64 (ADR 0098). */
  media?: Record<string, string>;
}

/** The data of a page made from a project as it is open. */
export function pageDataOf(project: ProjectSnapshot, options: PageDataOptions = {}): PageData {
  return {
    format: PAGE_FORMAT,
    ...(options.start === undefined || options.start === '' ? {} : { start: options.start }),
    ...(options.made === undefined ? {} : { made: options.made.toISOString() }),
    project: withoutConflicts(project.project),
    model: withoutConflicts(project.model),
    packages: project.packages
      .filter((pkg) => builtinPackage(pkg.id) === undefined)
      .map((pkg) => withCleanedImages(withoutCode(withoutConflicts(pkg)))),
    views: project.views.map(withoutConflicts),
    scenarios: project.scenarios.map(withoutConflicts),
    ...(project.tours.length === 0
      ? {}
      : { tours: project.tours.map((tour) => withoutNotes(withoutConflicts(tour))) }),
    ...(options.solids === undefined ? {} : { solids: options.solids }),
    ...(options.media === undefined || Object.keys(options.media).length === 0
      ? {}
      : { media: options.media }),
  };
}

/**
 * A file without the conflicts a git merge left in it (ADR 0072): a page shows what each file keeps,
 * and carries neither side's other values, which may hold package code, speaker notes or images that
 * were never cleaned (ADR 0041's clarification of 2026-10-26).
 */
function withoutConflicts<T extends { conflicts?: unknown }>(file: T): T {
  if (file.conflicts === undefined) return file;
  const kept = { ...file };
  delete kept.conflicts;
  return kept;
}

/** Whether any file of a project holds conflicts a git merge left, which a page leaves out. */
export function holdsConflicts(project: ProjectSnapshot): boolean {
  return (
    project.project.conflicts !== undefined ||
    project.model.conflicts !== undefined ||
    project.packages.some((each) => each.conflicts !== undefined) ||
    project.views.some((each) => each.conflicts !== undefined) ||
    project.scenarios.some((each) => each.conflicts !== undefined) ||
    project.tours.some((each) => each.conflicts !== undefined) ||
    project.comments.some((each) => each.conflicts !== undefined)
  );
}

/** A tour without its speaker notes: a page is shared, and the notes are the presenter's (ADR 0058). */
function withoutNotes(tour: TourFile): TourFile {
  if (tour.steps.every((step) => step.notes === undefined)) return tour;
  return {
    ...tour,
    steps: tour.steps.map((step) => {
      if (step.notes === undefined) return step;
      const shared = { ...step };
      delete shared.notes;
      return shared;
    }),
  };
}

/** A package without its code and the capabilities its code asks for: nothing of it runs in a page. */
function withoutCode(pkg: PackageFile): PackageFile {
  if (pkg.code === undefined && pkg.capabilities === undefined) return pkg;
  const read: PackageFile = { ...pkg };
  delete read.code;
  delete read.capabilities;
  return read;
}

/** A package with its images as cleaning gives them, and without those cleaning refuses. */
function withCleanedImages(pkg: PackageFile): PackageFile {
  if (pkg.images === undefined) return pkg;
  const images = pkg.images.flatMap((image): ImageDefinition[] => {
    const cleaned = cleanedImage(image);
    return cleaned ? [{ ...cleaned }] : [];
  });
  const cleaned: PackageFile = { ...pkg, images };
  if (images.length === 0) delete cleaned.images;
  return cleaned;
}

/** Checks a file's contents against its kind's schema, as `@visual-anything/schema/validate` does. */
export type ValidateFile = <K extends FileKind>(
  kind: K,
  data: unknown,
) => ValidationResult<FileContentByKind[K]>;

/** What reading a page's data gives: the project, or every problem that keeps it from opening. */
export type PageRead =
  | {
      ok: true;
      project: ProjectSnapshot;
      start?: string;
      made?: string;
      /** What the project breaks of the rules that only warn. */
      warnings: Problem[];
      /** What it holds of its solids, read strictly; none for a page without solids. */
      solids?: PageSolids;
      /** The media files it holds that passed their checks, by hash (ADR 0098). */
      media?: Record<string, Uint8Array>;
    }
  | { ok: false; problems: string[] };

/** The words for a page's data that is not a project at all. */
export const NOT_A_PROJECT = 'This page’s data is not a project.';

/**
 * Reads a page's data, with the checks opening a project makes. `validate` checks each file against
 * its kind's schema: Ajv's compiled validators in Node, the ones generated when the viewer is built in
 * a page, whose policy lets nothing compile code.
 */
export function readPageData(text: string, validate: ValidateFile): PageRead {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, problems: [`This page’s data is not valid JSON: ${reason}`] };
  }
  if (!isRecord(data) || typeof data.format !== 'number') return refused(NOT_A_PROJECT);
  if (Number.isInteger(data.format) && data.format > PAGE_FORMAT) {
    return refused(
      `This page was made by a newer Visual Anything, format ${data.format}. Make it again with this version, or open it with a newer one.`,
    );
  }
  const { start, made } = data;
  if (
    data.format !== PAGE_FORMAT ||
    !Array.isArray(data.packages) ||
    !Array.isArray(data.views) ||
    !Array.isArray(data.scenarios) ||
    (data.tours !== undefined && !Array.isArray(data.tours)) ||
    (start !== undefined && (typeof start !== 'string' || start.length > MAX_VIEW_STATE_ADDRESS)) ||
    (made !== undefined && typeof made !== 'string')
  ) {
    return refused(NOT_A_PROJECT);
  }

  const problems: string[] = [];
  const check = <K extends FileKind>(kind: K, value: unknown, where: string) => {
    const result = validate(kind, value);
    if (result.ok) return result.value;
    for (const error of result.errors) {
      problems.push(`${where}, ${error.path === '' ? '/' : error.path}: ${error.message}`);
    }
    return undefined;
  };
  const project = check('project', data.project, 'The project file');
  const model = check('model', data.model, 'The model');
  const packages = data.packages.flatMap((pkg: unknown, at) => {
    const read = check('package', pkg, `Package ${at + 1}`);
    return read ? [read] : [];
  });
  const views = data.views.flatMap((view: unknown, at) => {
    const read = check('view', view, `View ${at + 1}`);
    return read ? [read] : [];
  });
  const scenarios = data.scenarios.flatMap((scenario: unknown, at) => {
    const read = check('scenario', scenario, `Scenario ${at + 1}`);
    return read ? [read] : [];
  });
  const tours = ((data.tours ?? []) as unknown[]).flatMap((tour, at) => {
    const read = check('tour', tour, `Tour ${at + 1}`);
    return read ? [read] : [];
  });
  const solids = data.solids === undefined ? undefined : readPageSolids(data.solids);
  if (solids && !solids.ok) problems.push(solids.problem);
  if (!project || !model || problems.length > 0) return { ok: false, problems };

  onceEach(packages, 'package', problems);
  onceEach(views, 'view', problems);
  onceEach(scenarios, 'scenario', problems);
  onceEach(tours, 'tour', problems);
  const listed = listedPackages(project, packages, problems);
  if (problems.length > 0) return { ok: false, problems };

  // The page carries no comments, which name people (ADR 0059).
  const snapshot: ProjectSnapshot = {
    project,
    model,
    packages: listed,
    views,
    scenarios,
    tours,
    comments: [],
  };
  // A page holds the files of solids its packages define, and no other file.
  if (solids?.ok && solids.solids.form === 'files') {
    const defined = new Set(
      [...solidsIn(snapshot).solids.values()].map((each) => each.definition.hash),
    );
    for (const hash of Object.keys(solids.solids.files)) {
      if (!defined.has(hash))
        problems.push(`The page holds a solid file "${hash}" no package names.`);
    }
    if (problems.length > 0) return { ok: false, problems };
  }
  // A page holds the media files its pictures name, and no other file (ADR 0098).
  const media = readPageMedia(data.media, views, problems);
  if (problems.length > 0) return { ok: false, problems };
  const checked = checkProject(snapshot);
  if (checked.errors.length > 0) {
    return { ok: false, problems: checked.errors.map((error) => error.message) };
  }
  return {
    ok: true,
    project: snapshot,
    ...(start === undefined ? {} : { start }),
    ...(made === undefined ? {} : { made }),
    warnings: [...checked.warnings, ...media.warnings],
    ...(solids?.ok ? { solids: solids.solids } : {}),
    ...(Object.keys(media.files).length === 0 ? {} : { media: media.files }),
  };
}

/**
 * Reads a page's media files strictly (ADR 0098): an object of base64 by hash, each hash one a picture
 * of its views names, each file within 32 MiB. A file whose bytes are not its name's, or are not what
 * cleaning writes, is left out with a warning, and its pictures draw as missing ones.
 */
function readPageMedia(
  value: unknown,
  views: readonly ViewFile[],
  problems: string[],
): { files: Record<string, Uint8Array>; warnings: Problem[] } {
  const files: Record<string, Uint8Array> = {};
  const warnings: Problem[] = [];
  if (value === undefined) return { files, warnings };
  if (!isRecord(value)) {
    problems.push('The page’s media files are not an object of files by hash.');
    return { files, warnings };
  }
  const named = new Map(
    views.flatMap((view) => picturesOf(view).map((picture) => [picture.media.hash, picture.media])),
  );
  const most = Math.ceil(MEDIA_CAPS.bytes / 3) * 4;
  for (const [hash, text] of Object.entries(value)) {
    const ref = named.get(hash);
    if (ref === undefined) {
      problems.push(`The page holds a media file "${hash}" no picture names.`);
      continue;
    }
    const bytes = typeof text === 'string' && text.length <= most ? decodeBase64(text) : undefined;
    if (bytes === undefined) {
      problems.push(`The page’s media file "${hash}" is not base64 of at most 32 MiB.`);
      continue;
    }
    const check = checkMediaFile(bytes, hash, ref.format);
    if (check.ok) files[hash] = bytes;
    else warnings.push(check.problem);
  }
  return { files, warnings };
}

function refused(problem: string): PageRead {
  return { ok: false, problems: [problem] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Says so of every id an earlier file of the same kind already has. */
function onceEach(
  files: readonly { id: string }[],
  kind: 'package' | 'view' | 'scenario' | 'tour',
  problems: string[],
): void {
  const seen = new Set<string>();
  const said = new Set<string>();
  for (const { id } of files) {
    if (!seen.has(id)) seen.add(id);
    else if (!said.has(id)) {
      said.add(id);
      problems.push(`The ${kind} id "${id}" is used twice.`);
    }
  }
}

/**
 * The packages the project lists, in its order: each from the page, or else built in. A package of
 * the page may not take a built-in package's id, as one in a project folder may not.
 */
function listedPackages(
  project: ProjectFile,
  packages: readonly PackageFile[],
  problems: string[],
): PackageFile[] {
  const own = new Map<string, PackageFile>();
  for (const pkg of packages) {
    const builtin = builtinPackage(pkg.id);
    if (builtin) {
      problems.push(
        `The page holds a package with the id "${pkg.id}", which Visual Anything keeps for its built-in ${builtin.name} package.`,
      );
    } else if (!own.has(pkg.id)) own.set(pkg.id, pkg);
  }
  return project.packages.flatMap((id) => {
    const found = own.get(id) ?? builtinPackage(id);
    if (found) return [found];
    problems.push(
      `The package "${id}" is listed, but neither this page nor the built-in packages hold it.`,
    );
    return [];
  });
}
