/**
 * Opens a project folder: finds its files, parses and validates each one, checks the rules that span
 * files, then checks the whole project against the rules of the core. Opening only reads, and reads
 * only regular files within their kind's size cap, in real folders inside the project folder: a name
 * that is a link, a device, a FIFO or a socket is a problem of its file, and nothing it points to is
 * read.
 */
import { lstat, readdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  builtinPackage,
  checkProject,
  type Problem,
  type ProblemCode,
  type ProjectSnapshot,
} from '@visual-anything/core';
import {
  FILE_EXTENSIONS,
  fileKindOf,
  type FileContentByKind,
  type FileKind,
  type Id,
  type PackageFile,
} from '@visual-anything/schema';
import { parseFile } from '@visual-anything/schema/validate';
import { errorCode, errorReason } from './errors';
import { FOLDERS, type FolderKind } from './layout';
import { toForwardSlashes } from './paths';
import { capOf, readRegularFile } from './regular-files';

/** A problem found in a project folder, reported against the file it concerns. */
export interface ProjectFileProblem {
  /**
   * The file with the problem, relative to the project folder and written with forward slashes; `.`
   * when the problem concerns the folder itself, or no file in particular.
   */
  file: string;
  /** A JSON pointer to the value with the problem; empty when it concerns the whole file. */
  pointer: string;
  message: string;
}

/** Where each file of a project lives: paths relative to the project folder, with forward slashes. */
export interface ProjectFiles {
  project: string;
  model: string;
  /**
   * The file of each package the project uses, by package id. Built-in packages have none: they are
   * never written.
   */
  packages: ReadonlyMap<Id, string>;
  views: ReadonlyMap<Id, string>;
  scenarios: ReadonlyMap<Id, string>;
  /** The package files in `packages/` that the project does not list, by package id. */
  unlistedPackages: ReadonlyMap<Id, string>;
}

/** An open project, with what opening it found. */
export interface LoadedProject {
  project: ProjectSnapshot;
  /** What the project breaks of the rules that only warn. */
  warnings: ProjectFileProblem[];
  files: ProjectFiles;
  /** The bytes of every project file read, by path. */
  contents: ReadonlyMap<string, Buffer>;
}

/** The outcome of opening a project folder: the project, or every problem found in it. */
export type LoadProjectResult =
  ({ ok: true } & LoadedProject) | { ok: false; errors: ProjectFileProblem[] };

/** What a problem concerns: the folder, or a kind of file. Problems are reported in this order. */
type Concern = 'folder' | FileKind;

const REPORT_ORDER: readonly Concern[] = [
  'folder',
  'project',
  'model',
  'package',
  'view',
  'scenario',
];

const FOLDER_KINDS = Object.keys(FOLDERS) as FolderKind[];

const UTF8 = new TextDecoder('utf-8', { fatal: true });

/** A project file that was read and validated. */
interface Read<K extends FileKind> {
  /** Its path relative to the project folder, with forward slashes. */
  file: string;
  bytes: Buffer;
  value: FileContentByKind[K];
}

/**
 * Opens the project in a folder. The folder holds exactly one `.vaproject` and one `.vamodel` file;
 * packages, views and scenarios sit in its `packages/`, `views/` and `scenarios/` folders. Every
 * problem is collected before returning; the core's rules are checked once every file is valid.
 */
export async function loadProject(folder: string): Promise<LoadProjectResult> {
  const given = resolve(folder);
  const problems = new Problems();

  const names = await listFiles(given);
  if (!names.ok) {
    problems.add('folder', {
      file: '.',
      pointer: '',
      message: describeFolderFailure(given, names),
    });
    return { ok: false, errors: problems.list() };
  }
  // Every file is read through the folder's real path, worked out once, so that a link on the way to
  // the folder that changes meanwhile cannot send one read somewhere else.
  const projectFolder = await realFolder(given);

  const [project, model, packages, views, scenarios] = await Promise.all([
    readTopLevelFile(projectFolder, names.names, 'project', problems),
    readTopLevelFile(projectFolder, names.names, 'model', problems),
    readSubfolder(projectFolder, 'package', problems),
    readSubfolder(projectFolder, 'view', problems),
    readSubfolder(projectFolder, 'scenario', problems),
  ]);

  requireUniqueIds(packages, 'package', problems);
  requireUniqueIds(views, 'view', problems);
  requireUniqueIds(scenarios, 'scenario', problems);
  const listedPackages = project ? findListedPackages(project, packages, problems) : [];

  if (!project || !model || problems.size > 0) return { ok: false, errors: problems.list() };

  const snapshot: ProjectSnapshot = {
    project: project.value,
    model: model.value,
    packages: listedPackages.map((listed) => listed.value),
    views: views.map((view) => view.value),
    scenarios: scenarios.map((scenario) => scenario.value),
  };
  const listed = new Set(project.value.packages);
  const files: ProjectFiles = {
    project: project.file,
    model: model.file,
    packages: new Map(
      listedPackages.flatMap(({ value, file }) => (file === undefined ? [] : [[value.id, file]])),
    ),
    views: new Map(views.map(({ value, file }) => [value.id, file])),
    scenarios: new Map(scenarios.map(({ value, file }) => [value.id, file])),
    unlistedPackages: new Map(
      packages
        .filter(({ value }) => !listed.has(value.id))
        .map(({ value, file }) => [value.id, file]),
    ),
  };

  const check = checkProject(snapshot);
  if (check.errors.length > 0) {
    return { ok: false, errors: locateProblems(check.errors, snapshot, files) };
  }
  const contents = new Map<string, Buffer>();
  for (const read of [project, model, ...packages, ...views, ...scenarios]) {
    contents.set(read.file, read.bytes);
  }
  return {
    ok: true,
    project: snapshot,
    warnings: locateProblems(check.warnings, snapshot, files),
    files,
    contents,
  };
}

/**
 * The bytes of every file that opening the project would read, by path: the `.vaproject` and
 * `.vamodel` files at the top, and the files of each kind in its folder. It reads them as they are now
 * and checks nothing; a file that cannot be read is left out, as if it were gone.
 */
export async function readProjectFiles(folder: string): Promise<Map<string, Buffer>> {
  const projectFolder = await realFolder(resolve(folder));
  const top = await listFiles(projectFolder);
  if (!top.ok) return new Map();
  const paths: [path: string, kind: FileKind][] = [
    ...topLevelFilesOf(top.names, 'project').map((path): [string, FileKind] => [path, 'project']),
    ...topLevelFilesOf(top.names, 'model').map((path): [string, FileKind] => [path, 'model']),
  ];
  for (const kind of FOLDER_KINDS) {
    const listing = await listSubfolder(projectFolder, FOLDERS[kind]);
    if (!listing.ok) continue;
    for (const path of folderFilesOf(listing.names, kind)) paths.push([path, kind]);
  }
  const read = await Promise.all(
    paths.map(async ([path, kind]) => {
      const file = await readRegularFile(join(projectFolder, path), capOf(kind));
      return file.ok ? [[path, file.bytes] as const] : [];
    }),
  );
  return new Map(read.flat());
}

/** The real path of a folder, every link resolved; the path as given when it cannot be resolved. */
async function realFolder(folder: string): Promise<string> {
  try {
    return await realpath(folder);
  } catch {
    return folder;
  }
}

/** Writes a problem on one line: `<file> <pointer>: <message>`, without the pointer when it is empty. */
export function formatProjectProblem(problem: ProjectFileProblem): string {
  const pointer = problem.pointer === '' ? '' : ` ${problem.pointer}`;
  return `${problem.file}${pointer}: ${problem.message}`;
}

/** The problems found so far, kept by what they concern so they are reported in a stable order. */
class Problems {
  readonly #byConcern = new Map<Concern, ProjectFileProblem[]>();

  get size(): number {
    let size = 0;
    for (const problems of this.#byConcern.values()) size += problems.length;
    return size;
  }

  add(concern: Concern, ...problems: ProjectFileProblem[]): void {
    const list = this.#byConcern.get(concern) ?? [];
    list.push(...problems);
    this.#byConcern.set(concern, list);
  }

  /** Every problem: by concern, then by file; a file's own problems keep the order they were found in. */
  list(): ProjectFileProblem[] {
    return REPORT_ORDER.flatMap((concern) =>
      [...(this.#byConcern.get(concern) ?? [])].sort((a, b) => compareText(a.file, b.file)),
    );
  }
}

type Listing =
  { ok: true; names: string[] } | { ok: false; code: string | undefined; reason: string };

/**
 * The names of everything directly in a folder that is not a folder, sorted: files, but also links,
 * devices, FIFOs and sockets, so that one of those with a project file's name is reported as a
 * problem rather than silently passed over.
 */
async function listFiles(folder: string): Promise<Listing> {
  try {
    const entries = await readdir(folder, { withFileTypes: true });
    const names = entries
      .filter((entry) => !entry.isDirectory())
      .map((entry) => entry.name)
      .sort(compareText);
    return { ok: true, names };
  } catch (error) {
    return { ok: false, code: errorCode(error), reason: errorReason(error) };
  }
}

/**
 * Lists the folder of packages, views or scenarios, which must be a real folder: a link to one is
 * refused with the code `ELINK`, and what it points to is never listed.
 */
async function listSubfolder(projectFolder: string, subfolder: string): Promise<Listing> {
  const path = join(projectFolder, subfolder);
  try {
    if ((await lstat(path)).isSymbolicLink()) {
      return { ok: false, code: 'ELINK', reason: 'it is a link' };
    }
  } catch (error) {
    return { ok: false, code: errorCode(error), reason: errorReason(error) };
  }
  return listFiles(path);
}

/** The names of the files of a kind among those directly in the project folder. */
function topLevelFilesOf(names: readonly string[], kind: 'project' | 'model'): string[] {
  return names.filter((name) => fileKindOf(name) === kind);
}

/** The paths of the files of a kind among the names in its folder. */
function folderFilesOf(names: readonly string[], kind: FolderKind): string[] {
  return names
    .filter((name) => fileKindOf(name) === kind)
    .map((name) => `${FOLDERS[kind]}/${name}`);
}

function describeFolderFailure(
  projectFolder: string,
  listing: Extract<Listing, { ok: false }>,
): string {
  const folder = toForwardSlashes(projectFolder);
  if (listing.code === 'ENOENT') return `The folder ${folder} does not exist.`;
  if (listing.code === 'ENOTDIR') return `${folder} is not a folder.`;
  return `The folder ${folder} could not be read: ${listing.reason}`;
}

/** Reads the one file of a kind that sits directly in the project folder. */
async function readTopLevelFile<K extends 'project' | 'model'>(
  projectFolder: string,
  names: string[],
  kind: K,
  problems: Problems,
): Promise<Read<K> | undefined> {
  const extension = FILE_EXTENSIONS[kind];
  const files = topLevelFilesOf(names, kind);
  const [file, ...others] = files;
  if (file === undefined || others.length > 0) {
    const found =
      file === undefined
        ? `no ${extension} file`
        : `${files.length} ${extension} files (${files.join(', ')})`;
    problems.add('folder', {
      file: '.',
      pointer: '',
      message: `The folder has ${found}; a project has exactly one.`,
    });
    return undefined;
  }
  return readProjectFile(projectFolder, file, kind, problems);
}

/** Reads every file of a kind in its folder, sorted by path. A missing folder holds none. */
async function readSubfolder<K extends FolderKind>(
  projectFolder: string,
  kind: K,
  problems: Problems,
): Promise<Read<K>[]> {
  const subfolder = FOLDERS[kind];
  const listing = await listSubfolder(projectFolder, subfolder);
  if (!listing.ok) {
    if (listing.code !== 'ENOENT') {
      const message =
        listing.code === 'ENOTDIR'
          ? `${subfolder} is not a folder; ${FILE_EXTENSIONS[kind]} files go in ${subfolder}/.`
          : listing.code === 'ELINK'
            ? `${subfolder} is a link; Visual Anything opens only real folders and regular files inside the project folder.`
            : `The folder ${subfolder}/ could not be read: ${listing.reason}`;
      problems.add(kind, { file: subfolder, pointer: '', message });
    }
    return [];
  }
  const read = await Promise.all(
    folderFilesOf(listing.names, kind).map((file) =>
      readProjectFile(projectFolder, file, kind, problems),
    ),
  );
  return read.filter((file) => file !== undefined);
}

/**
 * Reads a project file, which must be a regular file within its kind's cap, as UTF-8, then parses and
 * validates it as its kind.
 */
async function readProjectFile<K extends FileKind>(
  projectFolder: string,
  file: string,
  kind: K,
  problems: Problems,
): Promise<Read<K> | undefined> {
  const fail = (message: string): undefined => {
    problems.add(kind, { file, pointer: '', message });
    return undefined;
  };
  const read = await readRegularFile(join(projectFolder, file), capOf(kind));
  if (!read.ok) {
    return fail(read.reason === 'missing' ? 'The file could not be read: ENOENT' : read.message);
  }
  const { bytes } = read;
  let text: string;
  try {
    text = UTF8.decode(bytes);
  } catch {
    return fail('The file is not valid UTF-8.');
  }
  const parsed = parseFile(kind, text);
  if (!parsed.ok) {
    problems.add(
      kind,
      ...parsed.errors.map((error) => ({ file, pointer: error.path, message: error.message })),
    );
    return undefined;
  }
  return { file, bytes, value: parsed.value };
}

/** Reports every file whose id an earlier file of the same kind already uses. */
function requireUniqueIds(files: Read<FolderKind>[], kind: FolderKind, problems: Problems): void {
  const firstFileWithId = new Map<string, string>();
  for (const { file, value } of files) {
    const first = firstFileWithId.get(value.id);
    if (first === undefined) {
      firstFileWithId.set(value.id, file);
    } else {
      problems.add(kind, {
        file,
        pointer: '/id',
        message: `The ${kind} id "${value.id}" is already used by ${first}.`,
      });
    }
  }
}

/** A package the project lists, and its file; a built-in package has none. */
interface ListedPackage {
  value: PackageFile;
  file?: string;
}

/**
 * The packages the project lists, in its order. Each comes from the project's packages/ folder or, if
 * none there has its id, from the packages built into Visual Anything. A package of the project may not
 * take the id of a built-in one. The schema already refuses a package listed twice.
 */
function findListedPackages(
  project: Read<'project'>,
  packages: Read<'package'>[],
  problems: Problems,
): ListedPackage[] {
  const packageWithId = new Map<string, Read<'package'>>();
  for (const read of packages) {
    if (builtinPackage(read.value.id)) {
      problems.add('package', {
        file: read.file,
        pointer: '/id',
        message: `The package "${read.value.id}" is built into Visual Anything; give this one another id.`,
      });
    } else if (!packageWithId.has(read.value.id)) {
      packageWithId.set(read.value.id, read);
    }
  }
  const listed: ListedPackage[] = [];
  project.value.packages.forEach((id, index) => {
    const own = packageWithId.get(id);
    const builtin = builtinPackage(id);
    if (own !== undefined) {
      listed.push({ value: own.value, file: own.file });
    } else if (builtin !== undefined) {
      listed.push({ value: builtin });
    } else {
      problems.add('project', {
        file: project.file,
        pointer: `/packages/${index}`,
        message: `The package "${id}" is listed, but neither packages/ nor the built-in packages hold it.`,
      });
    }
  });
  return listed;
}

/**
 * The codes of problems about definitions: their subjects are looked up among the components and
 * relation types first, since an element may share the id of a definition.
 */
const DEFINITION_CODES: ReadonlySet<ProblemCode> = new Set<ProblemCode>([
  'defined-twice',
  'id-outside-package',
  'unknown-parent',
  'derivation-cycle',
]);

/**
 * Reports problems of the core against the files they concern, found from their subjects: element and
 * relation ids in the model file, view and scenario ids in their files, and component and relation
 * type ids in the files of their packages. A problem about several files is reported against each;
 * one about nothing the project holds, against the folder (`.`). The pointer leads to the subject when
 * the problem has a single one in that file.
 */
export function locateProblems(
  problems: readonly Problem[],
  snapshot: ProjectSnapshot,
  files: ProjectFiles,
): ProjectFileProblem[] {
  const locations = new Locations(snapshot, files);
  const located = new Problems();
  for (const each of problems) {
    for (const { concern, file, pointer } of locations.of(each)) {
      located.add(concern, { file, pointer, message: each.message });
    }
  }
  return located.list();
}

/** Where something sits: a file, and a JSON pointer inside it. */
interface Location {
  concern: Concern;
  file: string;
  pointer: string;
}

/** Where each id of a project sits in its files. */
class Locations {
  readonly #model = new Map<Id, Location[]>();
  readonly #definitions = new Map<Id, Location[]>();
  readonly #files = new Map<Id, Location[]>();

  constructor(snapshot: ProjectSnapshot, files: ProjectFiles) {
    const { world, elements, relations } = snapshot.model;
    const inModel = (pointer: string): Location => ({
      concern: 'model',
      file: files.model,
      pointer,
    });
    add(this.#model, world.id, inModel('/world'));
    elements.forEach((element, i) => add(this.#model, element.id, inModel(`/elements/${i}`)));
    relations.forEach((relation, i) => add(this.#model, relation.id, inModel(`/relations/${i}`)));

    for (const file of snapshot.packages) {
      const path = files.packages.get(file.id);
      if (path === undefined) continue;
      const inPackage = (pointer: string): Location => ({
        concern: 'package',
        file: path,
        pointer,
      });
      file.components.forEach((component, i) =>
        add(this.#definitions, component.id, inPackage(`/components/${i}`)),
      );
      file.relationTypes.forEach((relationType, i) =>
        add(this.#definitions, relationType.id, inPackage(`/relationTypes/${i}`)),
      );
    }

    const wholeFiles: [Concern, ReadonlyMap<Id, string>][] = [
      ['view', files.views],
      ['scenario', files.scenarios],
      ['package', files.packages],
    ];
    for (const [concern, paths] of wholeFiles) {
      for (const [id, file] of paths) add(this.#files, id, { concern, file, pointer: '' });
    }
  }

  /** The files a problem concerns, each with the pointer to report it at. */
  of(problem: Problem): Location[] {
    const byFile = new Map<string, { concern: Concern; pointers: Set<string> }>();
    const aboutDefinitions = DEFINITION_CODES.has(problem.code);
    for (const subject of problem.subjects ?? []) {
      for (const { concern, file, pointer } of this.#find(subject, aboutDefinitions)) {
        const entry = byFile.get(file) ?? { concern, pointers: new Set<string>() };
        entry.pointers.add(pointer);
        byFile.set(file, entry);
      }
    }
    if (byFile.size === 0) return [{ concern: 'folder', file: '.', pointer: '' }];
    return [...byFile].map(([file, { concern, pointers }]) => {
      const [only] = pointers;
      return { concern, file, pointer: pointers.size === 1 && only !== undefined ? only : '' };
    });
  }

  /** Where an id sits; an id found among several kinds of thing is taken as the first kind. */
  #find(id: Id, aboutDefinitions: boolean): readonly Location[] {
    const kinds = aboutDefinitions
      ? [this.#definitions, this.#model, this.#files]
      : [this.#model, this.#files, this.#definitions];
    for (const kind of kinds) {
      const found = kind.get(id);
      if (found !== undefined) return found;
    }
    return [];
  }
}

function add<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Compares by UTF-16 code units, the same on every machine and locale. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
