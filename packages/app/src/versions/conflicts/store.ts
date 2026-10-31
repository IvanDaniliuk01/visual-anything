/**
 * What the tab keeps of the conflicts in the Changes tab (ADR 0072): the files whose last conflict
 * the person resolved here, each with the note that it can now be added with git, until the note is
 * dismissed; a file that holds conflicts again, after an undo, loses its note. The conflicts
 * themselves are the project's, read from the files.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import { conflictCount, conflictedFiles } from './conflicts';

/** A file whose last conflict was resolved here: its key among the project's files, and its title. */
export interface ResolvedNote {
  key: string;
  title: string;
}

export class ConflictsStore {
  private notes: readonly ResolvedNote[] = [];
  private readonly listeners = new Set<() => void>();

  get = (): readonly ResolvedNote[] => this.notes;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Notes that a file holds no conflict now, so that the person can add it with git. */
  resolved(note: ResolvedNote): void {
    this.set([...this.notes.filter((each) => each.key !== note.key), note]);
  }

  /** Stops showing a file's note. */
  dismiss(key: string): void {
    if (this.notes.some((each) => each.key === key)) {
      this.set(this.notes.filter((each) => each.key !== key));
    }
  }

  private set(notes: readonly ResolvedNote[]): void {
    this.notes = notes;
    for (const listener of [...this.listeners]) listener();
  }
}

/** The tab's conflicts store; null outside the shell. */
export const ConflictsContext = createContext<ConflictsStore | null>(null);

const NONE: readonly ResolvedNote[] = [];
const NO_NOTES = { get: (): readonly ResolvedNote[] => NONE, subscribe: () => () => {} };

/** The notes of files resolved here that hold no conflict now. */
export function useResolvedNotes(project: ProjectSnapshot | undefined): readonly ResolvedNote[] {
  const store = useContext(ConflictsContext) ?? NO_NOTES;
  const notes = useSyncExternalStore(store.subscribe, store.get, store.get);
  const conflicted = useMemo(
    () => new Set(project ? conflictedFiles(project).map((each) => each.key) : []),
    [project],
  );
  return useMemo(() => notes.filter((each) => !conflicted.has(each.key)), [notes, conflicted]);
}

/** Whether the Changes tab has conflicts to show: the project holds some, or a note waits. */
export function useConflictsShown(project: ProjectSnapshot | undefined): boolean {
  const notes = useResolvedNotes(project);
  const count = useMemo(() => (project ? conflictCount(project) : 0), [project]);
  return count > 0 || notes.length > 0;
}
