/**
 * A tick's marks on the canvas (ADR 0085), drawn like a scenario step's (ADR 0077): the elements a
 * tick marks are highlighted, and the relations it marks too, with a travelling marker along each
 * that the view draws as a line, from its `from` end. The physical-space panel reads the same
 * emphasis, so it shows them as it shows playback (ADR 0076).
 *
 * Markers travel each time a tick's marks change, over at most the time a tick lasts at the run's
 * speed, then stand at their `to` end. Under reduced motion they stand still at their ends.
 *
 * It sets the `simulation` source of the emphasis store itself, frame by frame while a marker
 * travels, so that nothing of React renders for it; and at most once a frame (A4,
 * `docs/designs/benchmark-12.md`): while a frame of its own is coming, a change of the store waits
 * for it. That frame is asked for after the store's own, so that it comes after the store's frame
 * has moved the runs on and shows the tick that frame brought.
 */
import {
  modelIndexOf,
  nestingTypesInView,
  showsPart,
  shownByScope,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import type { Scene } from '../canvas/scene';
import type { Emphasis, EmphasisStore, Marker } from '../editor/emphasis';
import { MARKER_TRAIL_TIME, shownShapes } from '../scenarios/emphasis';
import type { SimulationSpeed } from '@visual-anything/core';
import type { SimulationStore } from './store';
import type { Frames } from './useSimulationStore';

/** The emphasis source a tick's marks are set as. */
export const SIMULATION_SOURCE = 'simulation';

/** The longest a marker travels, in milliseconds, however slowly a run plays. */
export const MARKER_TRAVEL_MAX = 600;

/** What one tick's marks highlight, in the scene's keys, and the relations markers travel along. */
export interface MarkedKeys {
  highlighted: ReadonlySet<string>;
  lines: readonly Id[];
}

/** The keys a tick's marks highlight in a view, and the relations of them drawn as lines. */
export function markedKeys(
  project: ProjectSnapshot,
  view: ViewFile,
  scene: Scene,
  marks: readonly Id[],
): MarkedKeys {
  const { index, shown, nesting, scoped } = lookupOf(project, view, scene);
  const highlighted = new Set<string>();
  const lines: Id[] = [];
  for (const id of marks) {
    const relation = index.relation(id);
    if (relation) {
      if (scoped && !scoped.relation(id)) continue;
      highlighted.add(id);
      if (!nesting.has(relation.relationType)) lines.push(id);
      continue;
    }
    if (index.element(id) !== undefined) for (const key of shown(id)) highlighted.add(key);
  }
  return { highlighted, lines };
}

/** What finding a tick's keys reads of a view drawn, worked out once for every run's marks. */
interface Lookup {
  project: ProjectSnapshot;
  view: ViewFile;
  index: ReturnType<typeof modelIndexOf>;
  shown: ReturnType<typeof shownShapes>;
  nesting: ReadonlySet<Id>;
  scoped: ReturnType<typeof shownByScope> | undefined;
}

const lookups = new WeakMap<Scene, Lookup>();

function lookupOf(project: ProjectSnapshot, view: ViewFile, scene: Scene): Lookup {
  const kept = lookups.get(scene);
  if (kept?.project === project && kept.view === view) return kept;
  const lookup: Lookup = {
    project,
    view,
    index: modelIndexOf(project),
    shown: shownShapes(project, view, scene),
    nesting: new Set(nestingTypesInView(project, view)),
    scoped: showsPart(view) ? shownByScope(project, view) : undefined,
  };
  lookups.set(scene, lookup);
  return lookup;
}

/** How long a marker travels at a speed: a tick's time, at most `MARKER_TRAVEL_MAX`. */
export function travelTime(speed: SimulationSpeed): number {
  return speed === 'max' ? 0 : Math.min(MARKER_TRAVEL_MAX, 1000 / speed);
}

/** Where a marker is after `elapsed` of `travel` milliseconds, easing in and out; 1 at its end. */
export function travelled(elapsed: number, travel: number, reduced: boolean): number {
  if (reduced || travel <= 0) return 1;
  const t = Math.min(Math.max(elapsed / travel, 0), 1);
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** What the marks are drawn over: the open view, drawn, and whether motion is reduced. */
export interface MarksContext {
  project: ProjectSnapshot;
  view: ViewFile;
  scene: Scene;
  reduced: boolean;
}

interface Track {
  marks: readonly Id[];
  /** When its marks last changed. */
  since: number;
  keys?: { scene: Scene; project: ProjectSnapshot; view: ViewFile; marked: MarkedKeys };
}

/** Sets the emphasis of the ticks' marks shown, as they change and while their markers travel. */
export class SimulationMarks {
  private context: MarksContext | undefined;
  private readonly tracks = new Map<Id, Track>();
  private handle: number | undefined;
  /** Whether its next frame is to be asked for once the store's frame has asked for the store's. */
  private asking = false;
  private disposed = false;
  private highlighted: ReadonlySet<string> | undefined;
  private highlightedFrom: readonly MarkedKeys[] = [];
  /** What was set last, and whether its markers stood at their ends. */
  private last: { highlighted: ReadonlySet<string>; lines: string; settled: boolean } | undefined;
  private readonly unhear: () => void;

  constructor(
    private readonly store: SimulationStore,
    private readonly emphasis: Pick<EmphasisStore, 'set'>,
    private readonly frames: Frames,
    private readonly clock: () => number = () => performance.now(),
    /** Runs a function once what runs now, the store's frame among it, is done. */
    private readonly defer: (run: () => void) => void = (run) => queueMicrotask(run),
  ) {
    this.unhear = store.subscribe(() => this.changed());
  }

  /** What the marks are drawn over now; none while no view is drawn. */
  setContext(context: MarksContext | undefined): void {
    this.context = context;
    this.update();
  }

  dispose(): void {
    this.disposed = true;
    this.unhear();
    if (this.handle !== undefined) this.frames.cancel(this.handle);
    this.handle = undefined;
    this.emphasis.set(SIMULATION_SOURCE, undefined);
  }

  /** The store changed: shown now, or by the frame of its own already coming. */
  private changed(): void {
    if (this.handle !== undefined || this.asking) return;
    this.update(true);
  }

  private update(fromStore = false): void {
    const now = this.clock();
    const all = this.store.marks();
    for (const element of [...this.tracks.keys()]) {
      if (!all.has(element)) this.tracks.delete(element);
    }
    for (const [element, marks] of all) {
      const track = this.tracks.get(element);
      if (track?.marks !== marks) this.tracks.set(element, { marks, since: now });
    }
    const context = this.context;
    if (!context || this.tracks.size === 0) {
      this.last = undefined;
      this.emphasis.set(SIMULATION_SOURCE, undefined);
      return;
    }
    const marked: MarkedKeys[] = [];
    const markers: Marker[] = [];
    let travelling = false;
    for (const [element, track] of this.tracks) {
      const keys = this.keysOf(track, context);
      marked.push(keys);
      const run = this.store.get(element);
      const travel = travelTime(run?.speed ?? 5);
      const elapsed = now - track.since;
      const progress = travelled(elapsed, travel, context.reduced);
      if (progress < 1) travelling = true;
      const trail =
        progress < 1 ? travelled(elapsed - MARKER_TRAIL_TIME, travel, context.reduced) : undefined;
      for (const relation of keys.lines) {
        markers.push({
          relation,
          progress,
          ...(trail !== undefined && trail < progress ? { trail } : {}),
        });
      }
    }
    const highlighted = this.unionOf(marked);
    const lines = markers.map((each) => each.relation).join('\n');
    const last = this.last;
    // Marks standing still as they stood need nothing drawn again.
    if (!travelling && last?.settled && last.highlighted === highlighted && last.lines === lines) {
      return;
    }
    const emphasis: Emphasis = { highlighted, ...(markers.length > 0 ? { markers } : {}) };
    this.last = { highlighted, lines, settled: !travelling };
    this.emphasis.set(SIMULATION_SOURCE, emphasis);
    if (travelling) this.askFrame(fromStore);
  }

  /**
   * Asks for a frame of its own, to set the marks again in: after what runs now when the store's
   * change brought it here, so that the store's frame asks for its next frame first.
   */
  private askFrame(later: boolean): void {
    if (this.handle !== undefined || this.asking) return;
    const ask = () => {
      this.asking = false;
      if (this.disposed || this.handle !== undefined) return;
      this.handle = this.frames.request(() => {
        this.handle = undefined;
        this.update();
      });
    };
    if (!later) {
      ask();
      return;
    }
    this.asking = true;
    this.defer(ask);
  }

  private keysOf(track: Track, context: MarksContext): MarkedKeys {
    const kept = track.keys;
    if (
      kept &&
      kept.scene === context.scene &&
      kept.project === context.project &&
      kept.view === context.view
    ) {
      return kept.marked;
    }
    const marked = markedKeys(context.project, context.view, context.scene, track.marks);
    track.keys = { scene: context.scene, project: context.project, view: context.view, marked };
    return marked;
  }

  /** The keys every track highlights: the same set while none of them changed. */
  private unionOf(marked: readonly MarkedKeys[]): ReadonlySet<string> {
    const same =
      this.highlighted !== undefined &&
      marked.length === this.highlightedFrom.length &&
      marked.every((each, at) => each === this.highlightedFrom[at]);
    if (same && this.highlighted) return this.highlighted;
    const union =
      marked.length === 1
        ? (marked[0] as MarkedKeys).highlighted
        : new Set(marked.flatMap((each) => [...each.highlighted]));
    this.highlighted = union;
    this.highlightedFrom = marked;
    return union;
  }
}
