/**
 * The canvas's comparison mode (ADR 0070): what shows while a comparison is drawn on the canvas, kept
 * by the tab, never stored. Whatever opens a comparison, Compare with…, a proposal or a conflict,
 * calls `showComparison` and gets a handle to change or end it.
 *
 * - The canvas draws the open view before, after, or as the comparison, read-only: it selects, pans,
 *   zooms and explores, but does not edit. Escape ends it, as Escape ends a tour.
 * - In the app the newer version is the project now: the mode follows every action, whoever makes
 *   it, by working out the action's operations from the project before and after it and handing
 *   them to `recompare`, which touches only what they name. A comparison whose newer version is
 *   something else, such as a proposal's, is shown with `follows: false`, and changed through its
 *   handle.
 */
import {
  operationsBetween,
  recompare,
  type Comparison,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { createContext, useContext, useSyncExternalStore } from 'react';
import type { ComparisonDrawing } from './scene';

/** What `showComparison` is given. */
export interface ComparisonRequest {
  older: ProjectSnapshot;
  newer: ProjectSnapshot;
  comparison: Comparison;
  /** What the canvas calls the comparison, such as “Compared with main (a1b2c3d)”. */
  title: string;
  /** Called once the comparison ends, from its End button, Escape, or its handle. */
  onEnd?: () => void;
  /**
   * Whether the newer version is the project now, which the comparison then follows through every
   * action; true unless said.
   */
  follows?: boolean;
  /** The drawing it opens on; the comparison unless said. */
  drawing?: ComparisonDrawing;
}

/** A comparison on the canvas, as the mode shows it now. */
export interface ShownComparison {
  /** Counts the comparisons shown, so that a new one is never taken for the one before. */
  serial: number;
  older: ProjectSnapshot;
  newer: ProjectSnapshot;
  comparison: Comparison;
  title: string;
  follows: boolean;
  drawing: ComparisonDrawing;
  /** Whether what is unchanged is drawn faintly; on unless the person turns it off. */
  faint: boolean;
}

/** What `showComparison` gives back, to change the comparison it showed or end it. */
export interface ComparisonHandle {
  /** Changes what it shows, as when a proposal changes; nothing once it ended. */
  update(next: Partial<Pick<ComparisonRequest, 'older' | 'newer' | 'comparison' | 'title'>>): void;
  /** Ends it, if it still shows. */
  end(): void;
  /** Whether it still shows. */
  readonly showing: boolean;
}

/** The tab's comparison mode: at most one comparison at a time. */
export class ComparisonStore {
  private shown: ShownComparison | undefined;
  private onEnd: (() => void) | undefined;
  private serial = 0;
  private readonly listeners = new Set<() => void>();

  /** The comparison shown, or undefined; the same object until something changes. */
  get = (): ShownComparison | undefined => this.shown;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Shows a comparison on the canvas, in place of any shown before, which ends. */
  showComparison = (request: ComparisonRequest): ComparisonHandle => {
    if (this.shown) this.end();
    this.serial += 1;
    const serial = this.serial;
    this.onEnd = request.onEnd;
    this.set({
      serial,
      older: request.older,
      newer: request.newer,
      comparison: request.comparison,
      title: request.title,
      follows: request.follows ?? true,
      drawing: request.drawing ?? 'comparison',
      faint: true,
    });
    const store = this;
    return {
      update(next) {
        const shown = store.shown;
        if (shown?.serial !== serial) return;
        store.set({ ...shown, ...next });
      },
      end() {
        if (store.shown?.serial === serial) store.end();
      },
      get showing() {
        return store.shown?.serial === serial;
      },
    };
  };

  /** Draws the comparison's view before, after or as the comparison. */
  setDrawing(drawing: ComparisonDrawing): void {
    if (this.shown && this.shown.drawing !== drawing) this.set({ ...this.shown, drawing });
  }

  /** Turns the faint drawing of what is unchanged on or off. */
  setFaint(faint: boolean): void {
    if (this.shown && this.shown.faint !== faint) this.set({ ...this.shown, faint });
  }

  /** Ends the comparison shown, if any, and tells whoever showed it. */
  end(): void {
    if (!this.shown) return;
    const onEnd = this.onEnd;
    this.onEnd = undefined;
    this.set(undefined);
    onEnd?.();
  }

  /**
   * Follows the project now: a comparison whose newer version is the project takes in what changed
   * since, through `recompare` with the operations between the two.
   */
  follow(project: ProjectSnapshot): void {
    const shown = this.shown;
    if (!shown?.follows || shown.newer === project) return;
    const operations = operationsBetween(shown.newer, project);
    const comparison =
      operations.length === 0
        ? shown.comparison
        : recompare(shown.comparison, shown.older, project, operations);
    this.set({ ...shown, newer: project, comparison });
  }

  private set(shown: ShownComparison | undefined): void {
    this.shown = shown;
    for (const listener of this.listeners) listener();
  }
}

/** The tab's comparison mode; null outside the shell, where nothing can be compared. */
export const ComparisonContext = createContext<ComparisonStore | null>(null);

const NO_STORE = {
  get: (): ShownComparison | undefined => undefined,
  subscribe: () => () => {},
};

/** The comparison the canvas shows, or undefined. */
export function useShownComparison(): ShownComparison | undefined {
  const store = useContext(ComparisonContext) ?? NO_STORE;
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/**
 * Shows a comparison on the canvas (ADR 0070): `showComparison({ older, newer, comparison, title,
 * onEnd })`. Undefined outside the shell.
 */
export function useShowComparison(): ComparisonStore['showComparison'] | undefined {
  return useContext(ComparisonContext)?.showComparison;
}
