/**
 * Where the files of a project live in its folder: one `.vaproject` and one `.vamodel` file at the top,
 * and packages, views and scenarios each in their own folder. Paths are relative to the project folder
 * and written with forward slashes.
 */
import { FILE_EXTENSIONS, fileKindOf, type Id } from '@visual-anything/schema';

/** The folders that hold packages, views and scenarios, inside the project folder. */
export const FOLDERS = { package: 'packages', view: 'views', scenario: 'scenarios' } as const;

/** The kinds of file that live in a folder of their own. */
export type FolderKind = keyof typeof FOLDERS;

const FOLDER_KINDS = Object.keys(FOLDERS) as FolderKind[];

/**
 * The kind of file a folder of the project holds, or `undefined` for any other folder. Case does not
 * matter, as on Windows and macOS, where `Views` is the same folder as `views`.
 */
export function folderKindOf(name: string): FolderKind | undefined {
  const lower = name.toLowerCase();
  return FOLDER_KINDS.find((kind) => FOLDERS[kind] === lower);
}

/**
 * Whether a path may name a project file, or a folder that holds them: what opening the project
 * reads. The project folder itself (an empty path) counts, since a change to it may concern anything.
 */
export function isProjectPath(path: string): boolean {
  const segments = path.split('/').filter((segment) => segment !== '' && segment !== '.');
  const [first, second] = segments;
  if (first === undefined) return true;
  if (second === undefined) {
    const kind = fileKindOf(first);
    return kind === 'project' || kind === 'model' || folderKindOf(first) !== undefined;
  }
  const kind = folderKindOf(first);
  return segments.length === 2 && kind !== undefined && fileKindOf(second) === kind;
}

/**
 * Names that Windows keeps for devices, whatever their extension: a file called `nul.vaview` would be
 * the device, not a file. Only the part before the first dot counts.
 */
const RESERVED_ON_WINDOWS = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/**
 * The path of a new file for a package, view or scenario: `<folder>/<id><extension>`, or with the
 * smallest numeric suffix from 2 on, as in `views/overview-2.vaview`, while `taken` says the name is
 * in use. An id that Windows would read as a device name gets an underscore in front.
 */
export function newFilePath(kind: FolderKind, id: Id, taken: (path: string) => boolean): string {
  const [firstPart = ''] = id.split('.');
  const base = RESERVED_ON_WINDOWS.test(firstPart) ? `_${id}` : id;
  const candidate = (n: number) =>
    `${FOLDERS[kind]}/${base}${n === 1 ? '' : `-${n}`}${FILE_EXTENSIONS[kind]}`;
  let n = 1;
  while (taken(candidate(n))) n += 1;
  return candidate(n);
}
