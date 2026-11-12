/**
 * What the tab keeps of explorables while it shows a project (ADR 0107): the explorable whose
 * approval dialog is open, the frames the watchdog stopped, by the hash of what they ran, and the
 * marks that keep an explorable that hung the tab from starting by itself after a reload. Kept
 * outside React, as the panels' stores are; the shell makes one and hands it down by context.
 */
import type { Id } from '@visual-anything/schema';
import { createContext, useContext, useSyncExternalStore } from 'react';
import { HangMarks, type MarkStorage } from './hang-marks';
import type { FrameEnd } from './host';

/** Why a frame is not running though it may: the watchdog stopped it, or it hung the tab before. */
export type FrameStop = FrameEnd | 'hung';

export interface ExplorableSessionSnapshot {
  /** The explorable whose approval dialog is open. */
  readonly reviewing: Id | undefined;
  /** A number that changes with every change. */
  readonly version: number;
}

function tabStorage(): MarkStorage | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

export class ExplorableSession {
  readonly marks: HangMarks;
  readonly #stopped = new Map<string, FrameEnd>();
  readonly #listeners = new Set<() => void>();
  #current: ExplorableSessionSnapshot = { reviewing: undefined, version: 0 };

  constructor(storage: MarkStorage | undefined = tabStorage()) {
    this.marks = new HangMarks(storage);
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly snapshot = (): ExplorableSessionSnapshot => this.#current;

  /** Opens the approval dialog of an explorable, or closes it. */
  review(id: Id | undefined): void {
    if (this.#current.reviewing === id) return;
    this.#changed({ reviewing: id });
  }

  /** Why the frames of this hash are not running, if they were stopped. */
  stopped(hash: string): FrameStop | undefined {
    return this.#stopped.get(hash) ?? (this.marks.hung(hash) ? 'hung' : undefined);
  }

  /** The watchdog stopped a frame of this hash: the explorable shows its card until run again. */
  stop(hash: string, end: FrameEnd): void {
    this.#stopped.set(hash, end);
    this.#changed({});
  }

  /** The person runs it again. */
  run(hash: string): void {
    this.#stopped.delete(hash);
    this.marks.forgive(hash);
    this.#changed({});
  }

  #changed(change: Partial<ExplorableSessionSnapshot>): void {
    this.#current = { ...this.#current, ...change, version: this.#current.version + 1 };
    for (const listener of [...this.#listeners]) listener();
  }
}

/** The tab's explorables; none outside the shell, where no explorable runs. */
export const ExplorableSessionContext = createContext<ExplorableSession | null>(null);

export function useExplorableSession(): ExplorableSession | null {
  const session = useContext(ExplorableSessionContext);
  useSyncExternalStore(
    session?.subscribe ?? noSubscribe,
    session?.snapshot ?? noSnapshot,
    session?.snapshot ?? noSnapshot,
  );
  return session;
}

const NO_SNAPSHOT: ExplorableSessionSnapshot = { reviewing: undefined, version: 0 };
const noSubscribe = () => () => {};
const noSnapshot = () => NO_SNAPSHOT;
