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
  /**
   * Relations whose lines are drawn dashed, as those only the alternatives not chosen at a decision
   * use (ADR 0078); a line that stands for several is dashed when all of them are.
   */
  dashed?: ReadonlySet<string>;
  /** Drawn marked, as the relations of a scenario step and their ends. */
  highlighted?: ReadonlySet<string>;
  /**
   * Of what it highlights, what is drawn in its own style rather than with a halo, as a tour's step
   * with the emphasis `style` marks (ADR 0100): a line heavier, in the canvas's emphasis color, an
   * element with a stronger border and a soft lift; nothing is drawn over it.
   */
  styled?: ReadonlySet<string>;
  /**
   * Present when what is drawn in its own style moves (ADR 0100): its lines' dashes flow from their
   * `from` end to their `to` end, and its shapes breathe once as they come in. Left out under reduced
   * motion, which keeps the restyle alone.
   */
  styleMoves?: true;
  /** Markers travelling along relations. */
  markers?: readonly Marker[];
  /**
   * Of what it highlights, what fades in by the opacity of its marks, over `duration` milliseconds
   * from when the canvas is given it, as a tour's step brings in its marks (ADR 0077). The same
   * object goes on fading; a new one fades in from the start.
   */
  arriving?: Arriving;
}

/** Highlighted keys that fade in, and how long they take. */
export interface Arriving {
  keys: ReadonlySet<string>;
  duration: number;
  /**
   * Present when the lines among them draw from their start rather than fade in, over this many
   * milliseconds from when the canvas is given them (ADR 0084).
   */
  draw?: number;
}

/**
 * A marker on a relation's line: at its `from` end at 0, at its `to` end at 1. With `trail`, it
 * leaves a fading trail behind it from where it was a moment before, which shows which way it goes
 * (ADR 0077); a marker standing still has none.
 */
export interface Marker {
  relation: Id;
  progress: number;
  trail?: number;
}

const NOTHING: Emphasis = {};

/** The emphasis of every source, and their union. */
export class EmphasisStore {
  private readonly sources = new Map<string, Emphasis>();
  private readonly listeners = new Set<() => void>();
  private union: Emphasis = NOTHING;
  /** What arrived last, kept while no source asks for another, so that its fade goes on. */
  private arrived: { from: readonly Arriving[]; arriving: Arriving } | undefined;

  /** Sets what one source emphasizes; undefined takes it away. */
  set(source: string, emphasis: Emphasis | undefined): void {
    if (emphasis === undefined) {
      if (!this.sources.delete(source)) return;
    } else {
      if (this.sources.get(source) === emphasis) return;
      this.sources.set(source, emphasis);
    }
    this.union = this.keepArriving(unionOf([...this.sources.values()]));
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

  /**
   * The union with what arrives as it was while the sources ask for the same, so that a change of
   * another source, such as a marker moving each frame, does not start its fade again.
   */
  private keepArriving(union: Emphasis): Emphasis {
    const { arriving } = union;
    if (arriving === undefined) {
      this.arrived = undefined;
      return union;
    }
    const from = [...this.sources.values()].flatMap((emphasis) => emphasis.arriving ?? []);
    const was = this.arrived;
    if (
      was &&
      was.from.length === from.length &&
      was.from.every((each, at) => each === from[at]) &&
      was.arriving.duration === arriving.duration &&
      was.arriving.draw === arriving.draw &&
      sameKeys(was.arriving.keys, arriving.keys)
    ) {
      return arriving === was.arriving ? union : { ...union, arriving: was.arriving };
    }
    this.arrived = { from, arriving };
    return union;
  }
}

function sameKeys(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const key of a) if (!b.has(key)) return false;
  return true;
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
  const dashed = sets((emphasis) => emphasis.dashed);
  const highlighted = sets((emphasis) => emphasis.highlighted);
  const styled = sets((emphasis) => emphasis.styled);
  const styleMoves = all.some((emphasis) => emphasis.styleMoves === true);
  const markers = all.flatMap((emphasis) => emphasis.markers ?? []);
  const arriving = arrivingOf(all);
  return {
    ...(hidden ? { hidden } : {}),
    ...(dimmed ? { dimmed } : {}),
    ...(dashed ? { dashed } : {}),
    ...(highlighted ? { highlighted } : {}),
    ...(styled ? { styled } : {}),
    ...(styleMoves ? { styleMoves: true as const } : {}),
    ...(markers.length > 0 ? { markers } : {}),
    ...(arriving ? { arriving } : {}),
  };
}

/**
 * What arrives among several sources: what any of them says arrives, but what another highlights
 * without saying so, which shows already. A source's own when it is the only one and nothing else
 * shows its keys.
 */
function arrivingOf(all: readonly Emphasis[]): Arriving | undefined {
  const asking = all.filter((emphasis) => emphasis.arriving !== undefined);
  if (asking.length === 0) return undefined;
  const shown = new Set<string>();
  for (const emphasis of all) {
    for (const key of emphasis.highlighted ?? []) {
      if (!emphasis.arriving?.keys.has(key)) shown.add(key);
    }
  }
  const only = asking.length === 1 ? asking[0]?.arriving : undefined;
  if (only && ![...only.keys].some((key) => shown.has(key))) return only;
  const keys = new Set<string>();
  let duration = 0;
  let draw = 0;
  for (const emphasis of asking) {
    const each = emphasis.arriving as Arriving;
    duration = Math.max(duration, each.duration);
    draw = Math.max(draw, each.draw ?? 0);
    for (const key of each.keys) if (!shown.has(key)) keys.add(key);
  }
  return keys.size === 0 ? undefined : { keys, duration, ...(draw > 0 ? { draw } : {}) };
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
