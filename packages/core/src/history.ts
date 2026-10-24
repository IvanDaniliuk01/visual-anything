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

/**
 * How much the history keeps besides its count: the strings in its actions' operations and inverses,
 * in UTF-16 code units. Images make single actions large, and 500 of them could hold gigabytes.
 */
export const HISTORY_WEIGHT_LIMIT = 64 * 1024 * 1024;

/**
 * Records a new action. Whatever was undone can no longer be redone. The oldest actions go while the
 * history holds more than {@link HISTORY_LIMIT} actions or weighs more than
 * {@link HISTORY_WEIGHT_LIMIT}; the newest is always kept.
 */
export function record(history: History, entry: HistoryEntry): History {
  const done = [...history.done, entry].slice(-HISTORY_LIMIT);
  let total = 0;
  for (const each of done) total += actionWeight(each);
  let oldest = 0;
  while (total > HISTORY_WEIGHT_LIMIT && oldest < done.length - 1) {
    total -= actionWeight(done[oldest] as HistoryEntry);
    oldest += 1;
  }
  return { done: oldest === 0 ? done : done.slice(oldest), undone: [] };
}

const weights = new WeakMap<HistoryEntry, number>();

/** What an action weighs: the length of every string in its operations and inverses. */
export function actionWeight(entry: HistoryEntry): number {
  let weight = weights.get(entry);
  if (weight === undefined) {
    weight = stringLength(entry.operations) + stringLength(entry.inverse);
    weights.set(entry, weight);
  }
  return weight;
}

/** The length of every string in a value, keys left out, walked without recursion. */
function stringLength(value: unknown): number {
  let length = 0;
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const next = pending.pop();
    if (typeof next === 'string') length += next.length;
    else if (Array.isArray(next)) for (const item of next) pending.push(item);
    else if (typeof next === 'object' && next !== null) {
      for (const item of Object.values(next)) pending.push(item);
    }
  }
  return length;
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
