/**
 * What the comments (ADR 0059) are doing in this tab: the panel's filters, the thread it shows whole,
 * the new thread being written and what it is about, whether the next click on the canvas places a
 * thread on a point, and the requests to bring the comments tab forward or a point into sight. It is
 * the tab's own, as filters are (ADR 0025): nothing here changes the project.
 */
import type { CommentAnchor, Id } from '@visual-anything/schema';
import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import type { GoTo } from '../view-state/applier';

/** Which threads show: open ones, resolved ones, or both. */
export type ThreadsShown = 'open' | 'resolved' | 'all';

export interface CommentFilters {
  /** The threads of the open view, or of the whole project. */
  where: 'view' | 'all';
  state: ThreadsShown;
  /** Only the threads someone wrote in, by `authorKeyOf`; undefined for everyone's. */
  author: string | undefined;
  /** Only the threads about one element, relation or view, as a pin with several asks. */
  about: Id | undefined;
}

export const DEFAULT_FILTERS: Readonly<CommentFilters> = Object.freeze({
  where: 'view',
  state: 'open',
  author: undefined,
  about: undefined,
});

export interface CommentsState {
  readonly filters: Readonly<CommentFilters>;
  /** The thread the panel shows whole; undefined while it lists them. */
  readonly open: Id | undefined;
  /** What a new thread is being written about; undefined while none is. */
  readonly composing: CommentAnchor | undefined;
  /** Whether the next click on the canvas places a new thread on that point. */
  readonly placing: boolean;
  /** Counts the requests to bring the comments tab forward. */
  readonly shown: number;
  /** A point to bring into the middle of the canvas once its view is open, with its request. */
  readonly point: { view: Id; x: number; y: number; request: number } | undefined;
}

const INITIAL: CommentsState = {
  filters: DEFAULT_FILTERS,
  open: undefined,
  composing: undefined,
  placing: false,
  shown: 0,
  point: undefined,
};

/** What the shell lends the comments to move around the project. */
export interface CommentsActions {
  /** Opens a view and selects something in it, bringing it into sight (the view state's `goTo`). */
  goTo?: ((request: GoTo) => void) | undefined;
}

export class CommentsStore {
  private state: CommentsState = INITIAL;
  private readonly listeners = new Set<() => void>();
  /** Set by the shell, which owns the view state. */
  actions: CommentsActions = {};

  getState = (): CommentsState => this.state;

  /** Lends the comments what the shell owns. */
  link(actions: CommentsActions): void {
    this.actions = actions;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  setFilters(changes: Partial<CommentFilters>): void {
    this.update({ filters: { ...this.state.filters, ...changes } });
  }

  /** Shows one thread whole, or the list again with undefined. */
  openThread(id: Id | undefined): void {
    this.update({ open: id, composing: undefined, placing: false });
  }

  /** Starts writing a new thread about something, or stops with undefined. */
  compose(anchor: CommentAnchor | undefined): void {
    this.update({
      composing: anchor,
      open: anchor === undefined ? this.state.open : undefined,
      placing: false,
    });
  }

  /** Waits for a click on the canvas to place a new thread on a point, or stops waiting. */
  setPlacing(placing: boolean): void {
    this.update({ placing, ...(placing ? { composing: undefined } : {}) });
  }

  /** Brings the comments tab forward. */
  show(): void {
    this.update({ shown: this.state.shown + 1 });
  }

  /** Brings a point of a view into the middle of the canvas, opening the view first. */
  goToPoint(view: Id, x: number, y: number): void {
    this.update({ point: { view, x, y, request: (this.state.point?.request ?? 0) + 1 } });
  }

  private update(changes: Partial<CommentsState>): void {
    this.state = { ...this.state, ...changes };
    for (const listener of [...this.listeners]) listener();
  }
}

/** The tab's comments store, which the shell provides. */
export const CommentsContext = createContext<CommentsStore | undefined>(undefined);

/**
 * Calls `onShown` each time something asks for the comments tab to come forward, as a pin chosen on
 * the canvas does; `onShown` should not change from one render to the next.
 */
export function useWhenCommentsShown(onShown: () => void): void {
  const store = useContext(CommentsContext);
  useEffect(() => {
    if (!store) return undefined;
    let last = store.getState().shown;
    return store.subscribe(() => {
      const { shown } = store.getState();
      if (shown === last) return;
      last = shown;
      onShown();
    });
  }, [store, onShown]);
}

const NO_STORE = new CommentsStore();

/** The comments store, and what it holds now; a store of its own outside the shell, as in tests. */
export function useComments(): [CommentsStore, CommentsState] {
  const store = useContext(CommentsContext) ?? NO_STORE;
  const state = useSyncExternalStore(store.subscribe, store.getState);
  return [store, state];
}
