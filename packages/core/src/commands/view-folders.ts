/** The command that files the project's views in folders (ADR 0101), and what other commands do to them. */
import type { Id, ViewFolderEntry } from '@visual-anything/schema';
import { isId, slug } from '../ids';
import { isFolder, type OrganizedEntry } from '../view-folders';
import { reject, requireList, requireName, type Draft } from './draft';
import type { OrganizeViewsCommand } from './types';

/** The most entries, views and folders together, the view folders hold. */
export const VIEW_FOLDER_ENTRIES_LIMIT = 10_000;

export function organizeViews(draft: Draft, command: OrganizeViewsCommand): string {
  const given = requireList(command.viewFolders, 'viewFolders');
  const views = new Set<Id>();
  const asked = new Set<Id>();
  let count = 0;

  // The size, then the folder ids the tree asks for, are checked first, so a new folder never takes
  // one of them.
  const collect = (entries: readonly unknown[]) => {
    for (const entry of entries) {
      count += 1;
      if (count > VIEW_FOLDER_ENTRIES_LIMIT) {
        reject(
          'invalid-command',
          `The view folders hold ${VIEW_FOLDER_ENTRIES_LIMIT} views and folders at most.`,
        );
      }
      if (entry === null || typeof entry !== 'object') continue;
      if ('entries' in entry && 'folder' in entry && entry.folder !== undefined) {
        const id = entry.folder;
        if (typeof id !== 'string' || !isId(id)) {
          const shown = typeof id === 'string' ? id : JSON.stringify(id);
          reject('invalid-id', `"${shown}" is not a valid id.`);
        }
        if (asked.has(id)) reject('invalid-command', `The folder "${id}" is listed twice.`, [id]);
        asked.add(id);
      }
      if ('entries' in entry && Array.isArray(entry.entries)) collect(entry.entries);
    }
  };
  collect(given);

  const read = (entries: readonly unknown[]): ViewFolderEntry[] =>
    entries.map((entry) => {
      if (entry === null || typeof entry !== 'object') {
        reject('invalid-command', 'An entry of the view folders is a view or a folder.');
      }
      if ('entries' in entry) {
        const folder = entry as Partial<OrganizedEntry> & { entries: unknown; name?: unknown };
        const name = requireName(folder.name, 'A folder');
        const inside = requireList(folder.entries as unknown[], 'entries');
        const id =
          'folder' in folder && folder.folder !== undefined
            ? folder.folder
            : draft.newId(slug(name, 'folder'), (each) => asked.has(each));
        asked.add(id);
        return { folder: id, name, entries: read(inside) };
      }
      if (!('view' in entry)) {
        reject('invalid-command', 'An entry of the view folders is a view or a folder.');
      }
      const view = draft.view((entry as { view: Id }).view);
      if (views.has(view.id)) {
        reject('invalid-command', `The view "${view.name}" is filed twice.`, [view.id]);
      }
      views.add(view.id);
      return { view: view.id };
    });

  setViewFolders(draft, read(given));
  return 'Organize the views';
}

/** Sets the project's view folders, leaving them out of the file when they are empty. */
export function setViewFolders(draft: Draft, tree: readonly ViewFolderEntry[]): void {
  const next = { ...draft.state.project };
  if (tree.length === 0) delete next.viewFolders;
  else next.viewFolders = [...tree];
  draft.apply({ op: 'set-project', project: next });
}

/** Files a new view last in a folder of the view folders, which must hold it. */
export function fileNewView(draft: Draft, view: Id, folder: Id): void {
  let filed = false;
  const walk = (entries: readonly ViewFolderEntry[]): ViewFolderEntry[] =>
    entries.map((entry) => {
      if (!isFolder(entry)) return entry;
      if (!filed && entry.folder === folder) {
        filed = true;
        return { ...entry, entries: [...entry.entries, { view }] };
      }
      return { ...entry, entries: walk(entry.entries) };
    });
  const tree = walk(draft.state.project.viewFolders ?? []);
  if (!filed) reject('unknown-folder', `There is no folder "${folder}" of views.`, [folder]);
  setViewFolders(draft, tree);
}

/** Takes a view out of the view folders, wherever they name it; nothing changes when they do not. */
export function unfileView(draft: Draft, view: Id): void {
  const current = draft.state.project.viewFolders;
  if (!current) return;
  let found = false;
  const walk = (entries: readonly ViewFolderEntry[]): ViewFolderEntry[] =>
    entries.flatMap((entry): ViewFolderEntry[] => {
      if (isFolder(entry)) return [{ ...entry, entries: walk(entry.entries) }];
      if (entry.view === view) {
        found = true;
        return [];
      }
      return [entry];
    });
  const tree = walk(current);
  if (found) setViewFolders(draft, tree);
}
