/**
 * The view folders (ADR 0101): how the view list files a project's views, as the project file keeps
 * them, read into the list the panel shows, and the changes the panel makes to them, each a new tree
 * that `organize-views` sends whole.
 */
import type { Id, ProjectFile, ViewFile, ViewFolderEntry } from '@visual-anything/schema';

/** A folder as `organize-views` takes it: without an id, a new one the core names. */
export interface OrganizedFolder {
  folder?: Id;
  name: string;
  entries: OrganizedEntry[];
}

/** An entry as `organize-views` takes it. */
export type OrganizedEntry = { view: Id } | OrganizedFolder;

/** An entry of the view list: a view, or a folder of entries, each in the list's order. */
export type ListedEntry =
  | { kind: 'view'; view: ViewFile; folder: Id | undefined }
  | { kind: 'folder'; id: Id; name: string; entries: ListedEntry[]; parent: Id | undefined };

/** Whether an entry is a folder. */
export function isFolder<T extends OrganizedEntry>(
  entry: T,
): entry is Extract<T, { name: string }> {
  return 'entries' in entry;
}

/**
 * The view list: the project's view folders with the views they name, each view once, where it is
 * first named, and an entry for a view that does not exist left out; then every view they do not
 * name, at the top level, in the project's order.
 */
export function listedViews(
  project: Pick<ProjectFile, 'viewFolders'>,
  views: readonly ViewFile[],
): ListedEntry[] {
  const byId = new Map(views.map((view) => [view.id, view]));
  const shown = new Set<Id>();
  const folders = new Set<Id>();
  const read = (entries: readonly ViewFolderEntry[], parent: Id | undefined): ListedEntry[] => {
    const listed: ListedEntry[] = [];
    for (const entry of entries) {
      if (isFolder(entry)) {
        if (folders.has(entry.folder)) continue;
        folders.add(entry.folder);
        listed.push({
          kind: 'folder',
          id: entry.folder,
          name: entry.name,
          entries: read(entry.entries, entry.folder),
          parent,
        });
        continue;
      }
      const view = byId.get(entry.view);
      if (!view || shown.has(view.id)) continue;
      shown.add(view.id);
      listed.push({ kind: 'view', view, folder: parent });
    }
    return listed;
  };
  const listed = read(project.viewFolders ?? [], undefined);
  for (const view of views) {
    if (!shown.has(view.id)) listed.push({ kind: 'view', view, folder: undefined });
  }
  return listed;
}

/**
 * The view folders as the view list shows them, every view filed: the tree the panel's changes start
 * from, so that a view it did not name keeps its place in the list once the tree is sent.
 */
export function folderTree(
  project: Pick<ProjectFile, 'viewFolders'>,
  views: readonly ViewFile[],
): ViewFolderEntry[] {
  const write = (entries: readonly ListedEntry[]): ViewFolderEntry[] =>
    entries.map((entry) =>
      entry.kind === 'view'
        ? { view: entry.view.id }
        : { folder: entry.id, name: entry.name, entries: write(entry.entries) },
    );
  return write(listedViews(project, views));
}

/** Where an entry goes: into a folder, or the top level, before the entry at `index` or last. */
export interface FolderPlace {
  folder?: Id;
  index?: number;
}

/** What an entry of the tree is: a view by its id, or a folder by its id. */
export type EntryRef = { view: Id } | { folder: Id };

function matches(entry: OrganizedEntry, ref: EntryRef): boolean {
  return 'view' in ref
    ? 'view' in entry && entry.view === ref.view
    : isFolder(entry) && entry.folder === ref.folder;
}

/** The tree without the entry, and the entry taken out, if the tree held it. */
export function takenOut(
  tree: readonly OrganizedEntry[],
  ref: EntryRef,
): { tree: OrganizedEntry[]; entry: OrganizedEntry | undefined } {
  let found: OrganizedEntry | undefined;
  const walk = (entries: readonly OrganizedEntry[]): OrganizedEntry[] => {
    const kept: OrganizedEntry[] = [];
    for (const entry of entries) {
      if (found === undefined && matches(entry, ref)) {
        found = entry;
        continue;
      }
      kept.push(isFolder(entry) ? { ...entry, entries: walk(entry.entries) } : entry);
    }
    return kept;
  };
  const tree2 = walk(tree);
  return { tree: tree2, entry: found };
}

/** The tree with an entry put at a place; a folder the tree does not hold puts it at the top level. */
export function putAt(
  tree: readonly OrganizedEntry[],
  entry: OrganizedEntry,
  place: FolderPlace,
): OrganizedEntry[] {
  const insert = (entries: readonly OrganizedEntry[]): OrganizedEntry[] => {
    const next = [...entries];
    const index =
      place.index === undefined ? next.length : Math.max(0, Math.min(place.index, next.length));
    next.splice(index, 0, entry);
    return next;
  };
  if (place.folder === undefined) return insert(tree);
  let put = false;
  const walk = (entries: readonly OrganizedEntry[]): OrganizedEntry[] =>
    entries.map((each) => {
      if (!isFolder(each)) return each;
      if (!put && each.folder === place.folder) {
        put = true;
        return { ...each, entries: insert(each.entries) };
      }
      return { ...each, entries: walk(each.entries) };
    });
  const next = walk(tree);
  return put ? next : insert(tree);
}

/**
 * The tree with an entry moved to a place, or `undefined` when it cannot go there: a folder into
 * itself or into a folder it holds. A place inside the same list counts its index before the move.
 */
export function moved(
  tree: readonly OrganizedEntry[],
  ref: EntryRef,
  place: FolderPlace,
): OrganizedEntry[] | undefined {
  if ('folder' in ref && place.folder !== undefined) {
    if (place.folder === ref.folder || foldersInside(tree, ref.folder).has(place.folder)) {
      return undefined;
    }
  }
  const at = placeOf(tree, ref);
  const out = takenOut(tree, ref);
  if (!out.entry) return undefined;
  let { index } = place;
  if (at && index !== undefined && at.folder === place.folder && at.index < index) index -= 1;
  return putAt(out.tree, out.entry, {
    ...(place.folder === undefined ? {} : { folder: place.folder }),
    ...(index === undefined ? {} : { index }),
  });
}

/** The folder an entry sits in, none at the top level, and its index there. */
export function placeOf(
  tree: readonly OrganizedEntry[],
  ref: EntryRef,
): { folder: Id | undefined; index: number } | undefined {
  const walk = (
    entries: readonly OrganizedEntry[],
    folder: Id | undefined,
  ): { folder: Id | undefined; index: number } | undefined => {
    for (const [index, entry] of entries.entries()) {
      if (matches(entry, ref)) return { folder, index };
      if (isFolder(entry)) {
        const inside = walk(entry.entries, entry.folder);
        if (inside) return inside;
      }
    }
    return undefined;
  };
  return walk(tree, undefined);
}

/** The ids of the folders a folder holds, however deep. */
export function foldersInside(tree: readonly OrganizedEntry[], folder: Id): Set<Id> {
  const inside = new Set<Id>();
  const collect = (entries: readonly OrganizedEntry[]) => {
    for (const entry of entries) {
      if (!isFolder(entry)) continue;
      if (entry.folder !== undefined) inside.add(entry.folder);
      collect(entry.entries);
    }
  };
  const find = (entries: readonly OrganizedEntry[]): boolean => {
    for (const entry of entries) {
      if (!isFolder(entry)) continue;
      if (entry.folder === folder) {
        collect(entry.entries);
        return true;
      }
      if (find(entry.entries)) return true;
    }
    return false;
  };
  find(tree);
  return inside;
}

/** The tree with a folder deleted: what it held takes its place, in its order. */
export function withoutFolder(tree: readonly OrganizedEntry[], folder: Id): OrganizedEntry[] {
  const walk = (entries: readonly OrganizedEntry[]): OrganizedEntry[] =>
    entries.flatMap((entry) => {
      if (!isFolder(entry)) return [entry];
      if (entry.folder === folder) return walk(entry.entries);
      return [{ ...entry, entries: walk(entry.entries) }];
    });
  return walk(tree);
}

/** The tree with a folder renamed. */
export function renamedFolder(
  tree: readonly OrganizedEntry[],
  folder: Id,
  name: string,
): OrganizedEntry[] {
  const walk = (entries: readonly OrganizedEntry[]): OrganizedEntry[] =>
    entries.map((entry) =>
      isFolder(entry)
        ? {
            ...entry,
            ...(entry.folder === folder ? { name } : {}),
            entries: walk(entry.entries),
          }
        : entry,
    );
  return walk(tree);
}

/** Every folder of the tree, in its order, with the names of the folders it sits in, outermost first. */
export function folderPaths(
  tree: readonly ViewFolderEntry[],
): { folder: Id; name: string; path: string[] }[] {
  const paths: { folder: Id; name: string; path: string[] }[] = [];
  const walk = (entries: readonly ViewFolderEntry[], path: string[]) => {
    for (const entry of entries) {
      if (!isFolder(entry)) continue;
      paths.push({ folder: entry.folder, name: entry.name, path });
      walk(entry.entries, [...path, entry.name]);
    }
  };
  walk(tree, []);
  return paths;
}
