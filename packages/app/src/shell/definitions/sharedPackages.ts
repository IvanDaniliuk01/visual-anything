/**
 * Packages from another project (R39, ADR 0051): reading the project folder the person chooses, in the
 * browser, for its own packages, and the commands that add one to the open project or update one of
 * its packages from it. The folder's files are only read as text and parsed as JSON here; the core
 * checks everything a package holds, and cleans its images, when the command runs, as it checks any
 * command.
 *
 * A package's solids (ADR 0075) keep their files beside the project, in `solids/`, named by their
 * hash: the files the folder chosen holds for the package's solids are copied into this project's
 * `solids/` through the local program, which checks each as it checks a file of `solids/` and runs
 * nothing (ADR 0089's M14.6 clarification), before the package comes in.
 */
import {
  SOLID_CAPS,
  type Command,
  type SolidImportOptions,
  type SolidPreparedMessage,
} from '@visual-anything/core';
import type { Id, PackageFile, ProjectFile, SolidDefinition } from '@visual-anything/schema';

/** A file of the folder chosen: its path inside the folder, with forward slashes, its size, and how to read it. */
export interface ChosenFile {
  path: string;
  size: number;
  text: () => Promise<string>;
  /** Its bytes, for a solid's file. */
  bytes?: () => Promise<Uint8Array>;
}

/** The largest package file read: one change carries at most 4 MiB to the local program. */
export const MAX_SHARED_PACKAGE = 4 * 1024 * 1024;

/** A package found in the folder chosen. */
export interface FoundPackage {
  /** Its file, inside the folder. */
  path: string;
  file: PackageFile;
}

/** What the folder chosen holds, for sharing its packages. */
export interface ChosenProject {
  /** The project's name, from its project file; absent when the folder holds none. */
  name?: string;
  /** Its own packages, in the order of their files. */
  packages: FoundPackage[];
  /** The package files that could not be read, each with why, in English. */
  problems: { path: string; message: string }[];
  /** The files of its `solids/` folder named by a hash, by that hash, unread. */
  solids: Map<string, ChosenFile>;
}

const SOLID_FILE = /^([0-9a-f]{64})\.glb$/;

/**
 * Reads the project folder the person chose, given as the files a folder picker lists: the project
 * file at its top, and the package files in its `packages/` folder. Every other file is passed over,
 * unread. A folder chosen above a project, as `parent/project/…`, is read from where its project file
 * sits.
 */
export async function readChosenProject(files: readonly ChosenFile[]): Promise<ChosenProject> {
  const paths = files.map((each) => ({ ...each, parts: each.path.split('/').filter(Boolean) }));
  // The top of the project: where the one project file sits, the folder's own first.
  const projectFiles = paths
    .filter((each) => each.parts.at(-1)?.endsWith('.vaproject') === true)
    .sort((a, b) => a.parts.length - b.parts.length);
  const top = projectFiles[0]?.parts.slice(0, -1) ?? paths[0]?.parts.slice(0, 1) ?? [];
  const inside = (each: (typeof paths)[number], depth: number) =>
    each.parts.length === top.length + depth && top.every((part, at) => each.parts[at] === part);

  const result: ChosenProject = { packages: [], problems: [], solids: new Map() };
  for (const each of paths) {
    if (!inside(each, 2) || each.parts[top.length] !== 'solids') continue;
    const hash = SOLID_FILE.exec(each.parts.at(-1) ?? '')?.[1];
    if (hash !== undefined) result.solids.set(hash, each);
  }
  const project = projectFiles.find((each) => inside(each, 1));
  if (project !== undefined && project.size <= MAX_SHARED_PACKAGE) {
    try {
      const parsed = JSON.parse(await project.text()) as Partial<ProjectFile>;
      if (typeof parsed.name === 'string') result.name = parsed.name;
    } catch {
      // A project file that cannot be read only leaves the project unnamed.
    }
  }
  const packageFiles = paths
    .filter(
      (each) =>
        inside(each, 2) &&
        each.parts[top.length]?.toLowerCase() === 'packages' &&
        each.parts.at(-1)?.endsWith('.vapackage') === true,
    )
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const each of packageFiles) {
    const path = each.parts.slice(top.length).join('/');
    if (each.size > MAX_SHARED_PACKAGE) {
      result.problems.push({ path, message: 'The file is over 4 MiB.' });
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(await each.text());
    } catch {
      result.problems.push({ path, message: 'The file is not valid JSON.' });
      continue;
    }
    if (!isPackageLike(value)) {
      result.problems.push({ path, message: 'The file holds no package.' });
      continue;
    }
    result.packages.push({ path, file: value });
  }
  return result;
}

/**
 * Whether a value has what every package has: an id, a name and lists of components and relation
 * types. The rest is the core's to check, when a command carries it.
 */
function isPackageLike(value: unknown): value is PackageFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const file = value as Record<string, unknown>;
  return (
    typeof file.id === 'string' &&
    typeof file.name === 'string' &&
    Array.isArray(file.components) &&
    Array.isArray(file.relationTypes)
  );
}

/** The files a folder picker lists, as `readChosenProject` reads them. */
export function chosenFilesOf(list: Iterable<File>): ChosenFile[] {
  return [...list].map((file) => ({
    path: (file.webkitRelativePath || file.name).replaceAll('\\', '/'),
    size: file.size,
    text: () => file.text(),
    bytes: async () => new Uint8Array(await file.arrayBuffer()),
  }));
}

/** The solids of a package as the folder chosen holds their files: those to copy, and those it lacks. */
export interface SolidFiles {
  /** The files to copy into this project's `solids/`, each once, by the hash it is named by. */
  copy: { hash: string; file: ChosenFile }[];
  /** The solids whose file the folder does not hold: they draw their placeholders until it is there. */
  missing: SolidDefinition[];
}

/**
 * The solid files a package needs from the folder chosen: those of its solids that the project names
 * nowhere yet, since a file named by its hash is the same file wherever it is, and the solids whose
 * file the folder lacks.
 */
export function solidFilesOf(
  chosen: ChosenProject,
  file: PackageFile,
  named: ReadonlySet<string>,
): SolidFiles {
  const copy: SolidFiles['copy'] = [];
  const missing: SolidDefinition[] = [];
  const taken = new Set<string>();
  for (const solid of file.solids ?? []) {
    if (named.has(solid.hash) || taken.has(solid.hash)) continue;
    const found = chosen.solids.get(solid.hash);
    if (found === undefined) {
      missing.push(solid);
      continue;
    }
    taken.add(solid.hash);
    copy.push({ hash: solid.hash, file: found });
  }
  return { copy, missing };
}

/** The hashes of the solid files a project's packages name. */
export function namedSolidFiles(packages: readonly PackageFile[]): Set<string> {
  return new Set(packages.flatMap((each) => (each.solids ?? []).map((solid) => solid.hash)));
}

/** How a file is sent to the local program, as the live connection's `prepareSolid` does. */
export type SendSolidFile = (
  fileName: string,
  bytes: Uint8Array,
  options: SolidImportOptions,
) => Promise<
  { ok: true; answer: SolidPreparedMessage } | { ok: false; problems: { message: string }[] }
>;

/**
 * Copies a package's solid files into this project's `solids/` through the local program, one at a
 * time, each kept as it is under its hash, checked there and never run; stops at the first refused,
 * with why, in English. A file past the cleaned file's cap is refused unread.
 */
export async function copySolidFiles(
  copy: SolidFiles['copy'],
  send: SendSolidFile,
): Promise<{ ok: true } | { ok: false; message: string }> {
  for (const { hash, file } of copy) {
    const name = `${hash}.glb`;
    if (file.size > SOLID_CAPS.fileBytes || file.bytes === undefined) {
      return {
        ok: false,
        message: `The solid file "solids/${name}" is over ${SOLID_CAPS.fileBytes} bytes, the most a cleaned file holds.`,
      };
    }
    const sent = await send(name, await file.bytes(), { keep: hash });
    if (!sent.ok) {
      return {
        ok: false,
        message:
          sent.problems.map((each) => each.message).join(' ') || `"solids/${name}" was refused.`,
      };
    }
  }
  return { ok: true };
}

/** Adds a copy of a package from another project, keeping its ids. */
export function addPackageCommand(file: PackageFile): Command {
  return { type: 'add-package', package: file };
}

/** Updates the project's own package of the same id to the version given. */
export function updatePackageCommand(file: PackageFile): Command {
  return { type: 'replace-package', package: file };
}

/** The package of the folder chosen with this id, if it holds one. */
export function packageWithId(chosen: ChosenProject, id: Id): FoundPackage | undefined {
  return chosen.packages.find((each) => each.file.id === id);
}
