/**
 * What the canvas emphasizes besides the selection: what a filter hides, what lies outside a focus
 * and is dimmed, what a scenario step or Claude's guidance highlights, and markers travelling along
 * relations during playback. Several parts of the app set it at once, each as its own source; the
 * canvas draws their union. Things are named by the keys the scene uses: an element shape's key, a
 * relation's id, a free shape's id.
 */
import type { Id } from '@visual-anything/schema';
import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';

export interface Emphasis {
  /** Not drawn, as a filter hides them; nothing else moves. */
  hidden?: ReadonlySet<string>;
  /** Drawn faintly, as outside a focus. */
  dimmed?: ReadonlySet<string>;
  /** Drawn marked, as the relations of a scenario step and their ends. */
  highlighted?: ReadonlySet<string>;
  /** Markers travelling along relations. */
  markers?: readonly Marker[];
}

/** A marker on a relation's line: at its `from` end at 0, at its `to` end at 1. */
export interface Marker {
  relation: Id;
  progress: number;
}

const NOTHING: Emphasis = {};

/** The emphasis of every source, and their union. */
export class EmphasisStore {
  private readonly sources = new Map<string, Emphasis>();
  private readonly listeners = new Set<() => void>();
  private union: Emphasis = NOTHING;

  /** Sets what one source emphasizes; undefined takes it away. */
  set(source: string, emphasis: Emphasis | undefined): void {
    if (emphasis === undefined) {
      if (!this.sources.delete(source)) return;
    } else {
      if (this.sources.get(source) === emphasis) return;
      this.sources.set(source, emphasis);
    }
    this.union = unionOf([...this.sources.values()]);
    for (const listener of this.listeners) listener();
  }

  /** The union of every source; the same object until a source changes. */
  get = (): Emphasis => this.union;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

function unionOf(all: readonly Emphasis[]): Emphasis {
  if (all.length === 0) return NOTHING;
  if (all.length === 1) return all[0] as Emphasis;
  const sets = (pick: (emphasis: Emphasis) => ReadonlySet<string> | undefined) => {
    const given = all.flatMap((emphasis) => pick(emphasis) ?? []);
    return given.length === 0 ? undefined : new Set(given.flatMap((set) => [...set]));
  };
  const hidden = sets((emphasis) => emphasis.hidden);
  const dimmed = sets((emphasis) => emphasis.dimmed);
  const highlighted = sets((emphasis) => emphasis.highlighted);
  const markers = all.flatMap((emphasis) => emphasis.markers ?? []);
  return {
    ...(hidden ? { hidden } : {}),
    ...(dimmed ? { dimmed } : {}),
    ...(highlighted ? { highlighted } : {}),
    ...(markers.length > 0 ? { markers } : {}),
  };
}

/** The store of the open project, which the shell provides. */
export const EmphasisContext = createContext<EmphasisStore | null>(null);

/** Sets what one source emphasizes while the component that calls it is mounted. */
export function useEmphasisSource(source: string, emphasis: Emphasis | undefined): void {
  const store = useContext(EmphasisContext);
  useEffect(() => {
    store?.set(source, emphasis);
  }, [store, source, emphasis]);
  useEffect(
    () => () => {
      store?.set(source, undefined);
    },
    [store, source],
  );
}

/** The union of every source, for the canvas to draw. */
export function useEmphasis(): Emphasis {
  const store = useContext(EmphasisContext);
  return useSyncExternalStore(store?.subscribe ?? noSubscription, store?.get ?? nothing);
}

const noSubscription = () => () => undefined;
const nothing = () => NOTHING;
