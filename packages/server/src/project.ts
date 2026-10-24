/**
 * Opens a project folder: finds its files, parses and validates each one, and checks the rules that
 * span files. Opening only reads; writing the files back is the job of project I/O in M1.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { builtinPackage, type ProjectSnapshot } from '@visual-anything/core';
import {
  FILE_EXTENSIONS,
  fileKindOf,
  type FileContentByKind,
  type FileKind,
  type PackageFile,
} from '@visual-anything/schema';
import { parseFile } from '@visual-anything/schema/validate';
import { errorCode, errorReason } from './errors';
import { toForwardSlashes } from './paths';

/** A problem found while opening a project folder. */
export interface ProjectFileError {
  /**
   * The file with the problem, relative to the project folder and written with forward slashes; `.`
   * when the problem concerns the folder itself.
   */
  file: string;
  /** A JSON pointer to the value with the problem; empty when it concerns the whole file. */
  pointer: string;
  message: string;
}

/** The outcome of opening a project folder: the project, or every problem found in it. */
export type LoadProjectResult =
  { ok: true; project: ProjectSnapshot } | { ok: false; errors: ProjectFileError[] };

/** The folders that hold packages, views and scenarios, inside the project folder. */
const SUBFOLDERS = { package: 'packages', view: 'views', scenario: 'scenarios' } as const;

/** The order problems are reported in: the folder first, then each kind of file. */
const REPORT_ORDER: readonly ('folder' | FileKind)[] = [
  'folder',
  'project',
  'model',
  'package',
  'view',
  'scenario',
];

const UTF8 = new TextDecoder('utf-8', { fatal: true });

/** A project file that was read and validated. */
interface Read<K extends FileKind> {
  /** Its path relative to the project folder, with forward slashes. */
  file: string;
  value: FileContentByKind[K];
}

/**
 * Opens the project in a folder. The folder holds exactly one `.vaproject` and one `.vamodel` file;
 * packages, views and scenarios sit in its `packages/`, `views/` and `scenarios/` folders. Every
 * problem is collected before returning.
 */
export async function loadProject(folder: string): Promise<LoadProjectResult> {
  const projectFolder = resolve(folder);
  const problems = new Problems();

  const names = await listFiles(projectFolder);
  if (!names.ok) {
    problems.add('folder', {
      file: '.',
      pointer: '',
      message: describeFolderFailure(projectFolder, names),
    });
    return { ok: false, errors: problems.list() };
  }

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
  return {
    ok: true,
    project: {
      project: project.value,
      model: model.value,
      packages: listedPackages,
      views: views.map((view) => view.value),
      scenarios: scenarios.map((scenario) => scenario.value),
    },
  };
}

/** Writes a problem on one line: `<file> <pointer>: <message>`, without the pointer when it is empty. */
export function formatProjectError(error: ProjectFileError): string {
  const pointer = error.pointer === '' ? '' : ` ${error.pointer}`;
  return `${error.file}${pointer}: ${error.message}`;
}

/** The problems found so far, kept by what they concern so they are reported in a stable order. */
class Problems {
  readonly #byConcern = new Map<'folder' | FileKind, ProjectFileError[]>();

  get size(): number {
    let size = 0;
    for (const errors of this.#byConcern.values()) size += errors.length;
    return size;
  }

  add(concern: 'folder' | FileKind, ...errors: ProjectFileError[]): void {
    const list = this.#byConcern.get(concern) ?? [];
    list.push(...errors);
    this.#byConcern.set(concern, list);
  }

  /** Every problem: by concern, then by file; a file's own problems keep the order they were found in. */
  list(): ProjectFileError[] {
    return REPORT_ORDER.flatMap((concern) =>
      [...(this.#byConcern.get(concern) ?? [])].sort((a, b) => compareText(a.file, b.file)),
    );
  }
}

type Listing =
  { ok: true; names: string[] } | { ok: false; code: string | undefined; reason: string };

/** The names of the files directly in a folder, sorted; folders inside it are left out. */
async function listFiles(folder: string): Promise<Listing> {
  try {
    const entries = await readdir(folder, { withFileTypes: true });
    const names = entries
      .filter((entry) => entry.isFile() || entry.isSymbolicLink())
      .map((entry) => entry.name)
      .sort(compareText);
    return { ok: true, names };
  } catch (error) {
    return { ok: false, code: errorCode(error), reason: errorReason(error) };
  }
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
  const files = names.filter((name) => fileKindOf(name) === kind);
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
async function readSubfolder<K extends keyof typeof SUBFOLDERS>(
  projectFolder: string,
  kind: K,
  problems: Problems,
): Promise<Read<K>[]> {
  const subfolder = SUBFOLDERS[kind];
  const listing = await listFiles(join(projectFolder, subfolder));
  if (!listing.ok) {
    if (listing.code !== 'ENOENT') {
      const message =
        listing.code === 'ENOTDIR'
          ? `${subfolder} is not a folder; ${FILE_EXTENSIONS[kind]} files go in ${subfolder}/.`
          : `The folder ${subfolder}/ could not be read: ${listing.reason}`;
      problems.add(kind, { file: subfolder, pointer: '', message });
    }
    return [];
  }
  const files = listing.names
    .filter((name) => fileKindOf(name) === kind)
    .map((name) => `${subfolder}/${name}`);
  const read = await Promise.all(
    files.map((file) => readProjectFile(projectFolder, file, kind, problems)),
  );
  return read.filter((file) => file !== undefined);
}

/** Reads a project file as UTF-8, then parses and validates it as its kind. */
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
  let bytes: Uint8Array;
  try {
    bytes = await readFile(join(projectFolder, file));
  } catch (error) {
    return fail(`The file could not be read: ${errorReason(error)}`);
  }
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
  return { file, value: parsed.value };
}

/** Reports every file whose id an earlier file of the same kind already uses. */
function requireUniqueIds(
  files: Read<keyof typeof SUBFOLDERS>[],
  kind: keyof typeof SUBFOLDERS,
  problems: Problems,
): void {
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

/**
 * The packages the project lists, in its order. Each comes from the project's packages/ folder or, if
 * none there has its id, from the packages built into Visual Anything. A package of the project may not
 * take the id of a built-in one. The schema already refuses a package listed twice.
 */
function findListedPackages(
  project: Read<'project'>,
  packages: Read<'package'>[],
  problems: Problems,
): PackageFile[] {
  const packageWithId = new Map<string, PackageFile>();
  for (const { file, value } of packages) {
    if (builtinPackage(value.id)) {
      problems.add('package', {
        file,
        pointer: '/id',
        message: `The package "${value.id}" is built into Visual Anything; give this one another id.`,
      });
    } else if (!packageWithId.has(value.id)) {
      packageWithId.set(value.id, value);
    }
  }
  const listed: PackageFile[] = [];
  project.value.packages.forEach((id, index) => {
    const found = packageWithId.get(id) ?? builtinPackage(id);
    if (found === undefined) {
      problems.add('project', {
        file: project.file,
        pointer: `/packages/${index}`,
        message: `The package "${id}" is listed, but neither packages/ nor the built-in packages hold it.`,
      });
    } else {
      listed.push(found);
    }
  });
  return listed;
}

/** Compares by UTF-16 code units, the same on every machine and locale. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
