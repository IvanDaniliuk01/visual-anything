/**
 * The undo history: one for the whole project, shared by the user and Claude. Every action records
 * who did it, and undo steps back one action at a time, whoever did it.
 */
import { applyOperations, type Operation } from './operations';
import type { ProjectSnapshot } from './snapshot';

/** Who did an action. */
export type Author = 'user' | 'claude';

/** One action in the history. */
export interface HistoryEntry {
  /** How the history names it, such as "Create “Booking agent”". */
  label: string;
  author: Author;
  /** What it changed, in order. */
  operations: readonly Operation[];
  /** What undoes it, in the order to apply them. */
  inverse: readonly Operation[];
}

/** The actions that can be undone, oldest first, and the ones that can be redone, newest last. */
export interface History {
  readonly done: readonly HistoryEntry[];
  readonly undone: readonly HistoryEntry[];
}

/** What the next undo and redo would do, as the app shows it. */
export interface HistorySummary {
  undo?: { label: string; author: Author };
  redo?: { label: string; author: Author };
}

/** A history with nothing in it. */
export const EMPTY_HISTORY: History = { done: [], undone: [] };

/** How many actions the history keeps; older ones can no longer be undone. */
export const HISTORY_LIMIT = 500;

/** Records a new action. Whatever was undone can no longer be redone. */
export function record(history: History, entry: HistoryEntry): History {
  return { done: [...history.done, entry].slice(-HISTORY_LIMIT), undone: [] };
}

/** The result of undoing or redoing an action. */
export interface Step {
  state: ProjectSnapshot;
  history: History;
  /** The action undone or redone. */
  entry: HistoryEntry;
  /** The operations applied to the project, to send to every open app. */
  operations: readonly Operation[];
}

/** Undoes the newest action, or returns `undefined` when there is none. */
export function undo(state: ProjectSnapshot, history: History): Step | undefined {
  const entry = history.done.at(-1);
  if (!entry) return undefined;
  return {
    state: applyOperations(state, entry.inverse).state,
    history: { done: history.done.slice(0, -1), undone: [...history.undone, entry] },
    entry,
    operations: entry.inverse,
  };
}

/** Redoes the newest undone action, or returns `undefined` when there is none. */
export function redo(state: ProjectSnapshot, history: History): Step | undefined {
  const entry = history.undone.at(-1);
  if (!entry) return undefined;
  return {
    state: applyOperations(state, entry.operations).state,
    history: { done: [...history.done, entry], undone: history.undone.slice(0, -1) },
    entry,
    operations: entry.operations,
  };
}

/** What the next undo and redo would do. */
export function summarize(history: History): HistorySummary {
  const undoable = history.done.at(-1);
  const redoable = history.undone.at(-1);
  return {
    ...(undoable ? { undo: { label: undoable.label, author: undoable.author } } : {}),
    ...(redoable ? { redo: { label: redoable.label, author: redoable.author } } : {}),
  };
}
