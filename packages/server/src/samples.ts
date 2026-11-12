/**
 * New projects (ADR 0051): from one of the sample projects the local program holds, or empty, written
 * into a folder that holds nothing yet, by `visual-anything new` and by the start screen the app shows
 * when the program runs on an empty folder. The samples are the starter packages' (R38), embedded
 * from `examples/` by `scripts/samples.ts`, so that the single executable holds them too.
 */
import { lstat, mkdir, readdir, realpath } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Id, ModelFile, ProjectFile, ViewFile } from '@visual-anything/schema';
import { SCHEMA_VERSION } from '@visual-anything/schema';
import { formatFile } from '@visual-anything/schema/format';
import { errorCode, errorReason } from './errors';
import { toForwardSlashes } from './paths';
import embedded from './samples/samples.json' with { type: 'json' };
import { removeFile, writeFileAtomic } from './writer';

/** The sample projects a new project can start from, by id, in the order they are offered. */
export const SAMPLE_IDS = [
  'c4-architecture',
  'data-science-pipeline',
  'churn-classifier',
  'spam-filter',
  'quadratic-function',
  'robot-arm',
  'order-process',
  'clinic-claim',
  'workshop-books',
  'bookshop-database',
] as const;

/** A sample project the local program holds. */
export interface Sample {
  id: Id;
  /** Its name, as its project file gives it. */
  name: string;
  /** The packages it uses. */
  packages: Id[];
  /**
   * Every project file of it, by its path in the project folder, as its text, each of its
   * explorables' files (ADR 0107) as its text, and each of its solids' files (ADR 0075) as its bytes.
   */
  files: ReadonlyMap<string, string | Uint8Array>;
}

/**
 * Whether a sample's path is a solid's file, `solids/<hash>.glb`, which the embedded samples hold in
 * base64 and a new project gets as its bytes.
 */
export function isSampleSolidFile(path: string): boolean {
  return /^solids\/[0-9a-f]{64}\.glb$/.test(path);
}

/**
 * Whether a sample's path is an explorable's file, `explorables/<name>.html` (ADR 0107), which the
 * embedded samples hold as its text and a new project gets as it is: its package's definition names
 * it by its hash, so the person approves it the first time it would run, as any other.
 */
export function isSampleExplorableFile(path: string): boolean {
  return /^explorables\/[a-z0-9][a-z0-9-]{0,62}\.html$/.test(path);
}

/** The sample projects the local program holds, in the order they are offered. */
export function samples(): Sample[] {
  const files = embedded as Record<string, Record<string, string> | undefined>;
  return SAMPLE_IDS.flatMap((id) => {
    const each = files[id];
    if (each === undefined) return [];
    const project = JSON.parse(each['project.vaproject'] ?? '{}') as Partial<ProjectFile>;
    return [
      {
        id,
        name: project.name ?? id,
        packages: project.packages ?? [],
        files: new Map(
          Object.entries(each).map(([path, text]) => [
            path,
            isSampleSolidFile(path) ? new Uint8Array(Buffer.from(text, 'base64')) : text,
          ]),
        ),
      },
    ];
  });
}

/** The sample with this id, if the program holds one. */
export function sampleOf(id: string): Sample | undefined {
  return samples().find((sample) => sample.id === id);
}

/** What an empty project is named, and what its first view is called. */
export interface EmptyProjectNames {
  /** The project's name; the folder's name by default. */
  project?: string;
  /** Its first view's name: "Overview" by default, or the app's word for it in its language. */
  view?: string;
}

/**
 * The files of an empty project: it uses the built-in Systems package, holds World alone, and has one
 * view arranged by "is part of".
 */
export function emptyProjectFiles(
  folder: string,
  names: EmptyProjectNames = {},
): Map<string, string> {
  const viewName = names.view?.trim() || 'Overview';
  const project: ProjectFile = {
    schemaVersion: SCHEMA_VERSION,
    name: names.project?.trim() || basename(folder) || 'My project',
    packages: ['systems'],
  };
  const model: ModelFile = {
    world: { id: 'world', component: 'essence', name: 'World' },
    elements: [],
    relations: [],
  };
  const view: ViewFile = {
    id: 'overview',
    name: viewName,
    perspective: { name: viewName },
    nestingRelationTypes: ['systems.is-part-of'],
    positions: [],
    freeShapes: [],
  };
  return new Map([
    ['project.vaproject', formatFile('project', project)],
    ['model.vamodel', formatFile('model', model)],
    ['views/overview.vaview', formatFile('view', view)],
  ]);
}

/** What a folder holds, for a new project: nothing yet, something, or nothing at all is there. */
export type FolderState = 'empty' | 'missing' | 'taken';

/**
 * Whether a folder can take a new project: it does not exist, or holds nothing but entries whose names
 * start with a dot, such as `.git` or `.DS_Store`. A link is never taken for a folder.
 */
export async function folderState(folder: string): Promise<FolderState> {
  let entries: string[];
  try {
    const stat = await lstat(folder);
    if (!stat.isDirectory()) return 'taken';
    entries = await readdir(folder);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return 'missing';
    throw error;
  }
  return entries.every((name) => name.startsWith('.')) ? 'empty' : 'taken';
}

/** The outcome of writing a new project. */
export type NewProjectResult = { ok: true; folder: string } | { ok: false; message: string };

/**
 * Writes a new project's files into a folder that does not exist yet, or that holds nothing but dot
 * entries, each atomically as a regular file inside it: a text in UTF-8, bytes as they are. A write
 * that fails takes back the files it wrote, so that the folder is left as it was found.
 */
export async function writeNewProject(
  folder: string,
  files: ReadonlyMap<string, string | Uint8Array>,
): Promise<NewProjectResult> {
  const shown = toForwardSlashes(folder);
  let state: FolderState;
  try {
    state = await folderState(folder);
  } catch (error) {
    return { ok: false, message: `The folder ${shown} could not be read: ${errorReason(error)}` };
  }
  if (state === 'taken') {
    return {
      ok: false,
      message: `${shown} already holds files, or is no folder; a new project starts in an empty folder.`,
    };
  }
  const written: string[] = [];
  try {
    await mkdir(folder, { recursive: true });
    const real = await realpath(folder);
    for (const [path, contents] of files) {
      const target = join(real, ...path.split('/'));
      const bytes = typeof contents === 'string' ? Buffer.from(contents, 'utf8') : contents;
      await writeFileAtomic(target, bytes, { regularOnly: true, inside: real });
      written.push(target);
    }
    return { ok: true, folder: real };
  } catch (error) {
    for (const target of written.reverse()) await removeFile(target).catch(() => {});
    return {
      ok: false,
      message: `The new project could not be written in ${shown}: ${errorReason(error)}`,
    };
  }
}
