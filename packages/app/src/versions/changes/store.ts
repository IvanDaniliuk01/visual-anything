/**
 * What the Changes tab of the model panel lists (ADR 0070): the changes of whatever is open, a
 * comparison, a proposal or the project's conflicts. While nothing is opened here and a comparison
 * shows on the canvas, the tab lists that one, as it follows the project.
 *
 * Compare with…, proposals and conflicts open what they show with `openChanges`, and keep the handle
 * it gives back to change it, as a proposal changes, or to close it.
 */
import type { Change, Comparison, ProjectSnapshot } from '@visual-anything/core';
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';

/** What a list of changes can be about. */
export type ChangesKind = 'comparison' | 'proposal' | 'conflicts';

/**
 * Ticks beside each change, where a proposal asks for them: by the key `changeKey` gives a change.
 * Ticking a change asks `onTick`, which decides what else it ticks, such as what the change needs.
 */
export interface ChangeTicks {
  ticked: ReadonlySet<string>;
  onTick(keys: readonly string[], ticked: boolean): void;
}

/** A list of changes, as whatever opens it gives it. */
export interface OpenedChanges {
  kind: ChangesKind;
  /** What the list is called, above its counts. */
  title: string;
  older: ProjectSnapshot;
  newer: ProjectSnapshot;
  comparison: Comparison;
  ticks?: ChangeTicks;
  /** What each change offers besides showing it, such as a conflict's two values to keep. */
  actions?: (change: Change) => ReactNode;
}

/** What `openChanges` gives back. */
export interface ChangesHandle {
  /** Changes what the list shows; nothing once it closed. */
  update(next: Partial<OpenedChanges>): void;
  /** Closes it, if it still shows. */
  close(): void;
  readonly open: boolean;
}

/** What the Changes tab reads of its store. */
export interface ChangesSnapshot {
  opened: OpenedChanges | undefined;
  /** Counts the times something asked to bring the tab forward. */
  forward: number;
  /** What the tab said last, and how many times it spoke, so that the same words are heard again. */
  said: { text: string; count: number };
}

/** The Changes tab's list: one at a time, and the times it was asked to come forward. */
export class ChangesStore {
  private opened: (OpenedChanges & { serial: number }) | undefined;
  private serial = 0;
  /** Counts the times something asked to bring the tab forward. */
  private forward = 0;
  private readonly listeners = new Set<() => void>();
  private said = { text: '', count: 0 };
  private snapshot: ChangesSnapshot = { opened: undefined, forward: 0, said: this.said };

  get = (): ChangesSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Opens a list in the Changes tab, in place of the one before, and brings the tab forward. */
  openChanges = (changes: OpenedChanges): ChangesHandle => {
    this.serial += 1;
    const serial = this.serial;
    this.opened = { ...changes, serial };
    this.forward += 1;
    this.changed();
    const store = this;
    return {
      update(next) {
        if (store.opened?.serial !== serial) return;
        store.opened = { ...store.opened, ...next, serial };
        store.changed();
      },
      close() {
        if (store.opened?.serial !== serial) return;
        store.opened = undefined;
        store.changed();
      },
      get open() {
        return store.opened?.serial === serial;
      },
    };
  };

  /** Brings the Changes tab forward, as a comparison shown on the canvas does. */
  bringForward(): void {
    this.forward += 1;
    this.changed();
  }

  /** Says something to screen readers from the Changes tab, such as where a change was shown. */
  say(text: string): void {
    this.said = { text, count: this.said.count + 1 };
    this.changed();
  }

  private changed(): void {
    this.snapshot = { opened: this.opened, forward: this.forward, said: this.said };
    for (const listener of this.listeners) listener();
  }
}

/** What the Changes tab reads, and how a change chosen in it is shown on the canvas. */
export interface ChangesHost {
  store: ChangesStore;
  /** Shows a change on the canvas, in the first view that draws it, as search does. */
  show(change: Change, changes: OpenedChanges): void;
}

/** The tab's Changes host; null outside the shell. */
export const ChangesContext = createContext<ChangesHost | null>(null);

const NO_STORE = new ChangesStore();

/** What the Changes tab lists now, and how many times it was asked to come forward. */
export function useOpenedChanges(): ChangesSnapshot {
  const store = useContext(ChangesContext)?.store ?? NO_STORE;
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/** Opens a list of changes in the Changes tab; undefined outside the shell. */
export function useOpenChanges(): ChangesStore['openChanges'] | undefined {
  return useContext(ChangesContext)?.store.openChanges;
}
