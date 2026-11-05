/**
 * The view folders as the app reads them (ADR 0101): the order of the view list, which every list of
 * views shown to the person follows, and which folders one person closed, kept in the browser by
 * project and never in the project.
 */
import { listedViews, type ListedEntry, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import { useCallback, useEffect, useState } from 'react';

/** The project's views in the order the view list shows them, folders opened out. */
export function viewsInListOrder(project: Pick<ProjectSnapshot, 'project' | 'views'>): ViewFile[] {
  const views: ViewFile[] = [];
  const walk = (entries: readonly ListedEntry[]) => {
    for (const entry of entries) {
      if (entry.kind === 'view') views.push(entry.view);
      else walk(entry.entries);
    }
  };
  walk(listedViews(project.project, project.views));
  return views;
}

/** Where the browser keeps the folders one person closed in a project, by the project's name. */
export function closedFoldersKey(project: string): string {
  return `visual-anything.view-folders.closed.${project}`;
}

function readClosed(project: string): ReadonlySet<Id> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(closedFoldersKey(project)) ?? '[]');
    return new Set(
      Array.isArray(stored) ? stored.filter((each) => typeof each === 'string') : undefined,
    );
  } catch {
    return new Set();
  }
}

function keepClosed(project: string, closed: ReadonlySet<Id>): void {
  try {
    if (closed.size === 0) localStorage.removeItem(closedFoldersKey(project));
    else localStorage.setItem(closedFoldersKey(project), JSON.stringify([...closed]));
  } catch {
    // Without storage the folders stay as they are until the tab closes.
  }
}

/** Which folders of the view list are open, and how to open or close one. */
export interface FolderOpenness {
  isOpen: (folder: Id) => boolean;
  setOpen: (folder: Id, open: boolean) => void;
  /** Opens every folder of a list at once. */
  open: (folders: readonly Id[]) => void;
}

/**
 * The folders one person closed in a project: every folder is open until closed, and what is closed
 * is kept in the browser, by the project's name, which is what the app knows of a project that stays.
 */
export function useFolderOpenness(project: string): FolderOpenness {
  const [state, setState] = useState(() => ({ project, closed: readClosed(project) }));
  // Another project reads its own; adjusted while rendering, so its folders draw right at once.
  if (state.project !== project) setState({ project, closed: readClosed(project) });
  const closed = state.project === project ? state.closed : readClosed(project);

  useEffect(() => {
    if (state.project === project) keepClosed(project, state.closed);
  }, [state, project]);

  const change = useCallback(
    (folders: readonly Id[], open: boolean) =>
      setState((current) => {
        const next = new Set(current.closed);
        for (const folder of folders) {
          if (open) next.delete(folder);
          else next.add(folder);
        }
        const same =
          next.size === current.closed.size && [...next].every((each) => current.closed.has(each));
        return same ? current : { ...current, closed: next };
      }),
    [],
  );
  const setOpen = useCallback((folder: Id, open: boolean) => change([folder], open), [change]);
  const open = useCallback((folders: readonly Id[]) => change(folders, true), [change]);

  return { isOpen: (folder) => !closed.has(folder), setOpen, open };
}
