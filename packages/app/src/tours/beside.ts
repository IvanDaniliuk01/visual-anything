/**
 * A tour step's view beside it (ADR 0102): the pane right of the one the tour plays in shows the
 * step's `beside` view state, its view at its camera, or else the whole view, gliding there as steps
 * do within a view and cutting into another; a step without one leaves that pane as the step before
 * left it. As the tour starts, the panes are taken note of, and when it ends they come back exactly
 * as they were: a pane the tour opened closes, and each pane shows its view again at its camera.
 *
 * The pane beside shows the view state's view and camera. What else a view state holds is the
 * active pane's (the selection, which is one for every pane, the scenario open and the physical-space
 * panel) or every pane's of the view (its filters and focus), so the pane beside leaves it as it is.
 */
import type { ViewState } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { Camera } from '../canvas/camera';
import type { PaneLayout, SplitPanes } from '../split/panes';
import { tourGlide, type CanvasCamera } from '../view-state/canvas';
import { cameraFor, cameraOf } from '../view-state/state';

/** What a tour's playback asks of the panes beside it. */
export interface TourBeside {
  /** Takes note of the panes as they are, once, as a tour starts. */
  begin(): void;
  /** Shows a step's view state in the pane right of the tour's. */
  show(state: ViewState): void;
  /** Gives the panes back as they were when the tour started. */
  end(): void;
  /** What the pane right of the active one shows now, its view and camera; none without one. */
  current(): ViewState | undefined;
}

/** A camera move waiting for its pane to show its view and its canvas to have drawn it. */
interface Waiting {
  view: Id | undefined;
  /** Where to: a view camera, a canvas camera to put back, or the whole view. */
  to: { camera: NonNullable<ViewState['camera']> } | { exact: Camera } | { whole: true };
  /** The view the pane showed before, to glide within it; none to cut. */
  from: Id | undefined;
}

/** What the shell says of the panes it drew. */
export interface BesideSettings {
  /** The view a pane shows: the one it names, or the project's first. */
  viewOf: (view: Id | undefined) => Id | undefined;
  /** Whether motion is reduced, so that every move cuts. */
  reduced: boolean;
}

const UNDRAWN: BesideSettings = { viewOf: (view) => view, reduced: false };

export class BesidePanes implements TourBeside {
  readonly #panes: SplitPanes;
  #settings = UNDRAWN;
  #canvases: ReadonlyMap<string, CanvasCamera> = new Map();
  /** The layout the shell drew last, which the canvases show. */
  #drawn: PaneLayout | undefined;
  #before: { layout: PaneLayout; cameras: Map<string, Camera> } | undefined;
  readonly #waiting = new Map<string, Waiting>();
  readonly #watching = new Map<string, () => void>();

  constructor(panes: SplitPanes) {
    this.#panes = panes;
  }

  begin(): void {
    if (this.#before) return;
    const layout = this.#panes.snapshot();
    const cameras = new Map<string, Camera>();
    for (const pane of layout.panes) {
      const camera = this.#canvases.get(pane.id)?.camera();
      if (camera) cameras.set(pane.id, camera);
    }
    this.#before = { layout, cameras };
  }

  show(state: ViewState): void {
    const panes = this.#panes;
    const right = panes.rightOf(panes.active.id);
    const was = right ? this.#settings.viewOf(right.view) : undefined;
    const id = panes.showBeside(state.view);
    if (id === undefined) return;
    this.#waiting.set(id, {
      view: state.view,
      to: state.camera ? { camera: state.camera } : { whole: true },
      from: right?.id === id ? was : undefined,
    });
    this.#move();
  }

  end(): void {
    const before = this.#before;
    this.#before = undefined;
    this.#waiting.clear();
    this.#stopWatching();
    if (!before) return;
    this.#panes.restore(before.layout);
    // The tour's own pane goes back to where it was through the view state; the others, here.
    for (const pane of before.layout.panes) {
      const camera = before.cameras.get(pane.id);
      if (pane.id === before.layout.active || !camera) continue;
      this.#waiting.set(pane.id, { view: pane.view, to: { exact: camera }, from: undefined });
    }
    this.#move();
  }

  current(): ViewState | undefined {
    const right = this.#panes.rightOf(this.#panes.active.id);
    const view = right && this.#settings.viewOf(right.view);
    if (!right || view === undefined) return undefined;
    const canvas = this.#canvases.get(right.id);
    const camera = canvas?.camera();
    const kept = camera && canvas ? cameraOf(camera, canvas.viewport()) : undefined;
    return { view, ...(kept ? { camera: kept } : {}) };
  }

  /**
   * Follows what the shell drew: the layout, the canvas of each pane and how they read. Called after
   * each render that changes them, so that a camera moves only once its pane's canvas shows the view
   * asked for.
   */
  drawn(
    layout: PaneLayout,
    canvases: ReadonlyMap<string, CanvasCamera>,
    settings: BesideSettings,
  ): void {
    this.#drawn = layout;
    this.#canvases = canvases;
    this.#settings = settings;
    this.#move();
  }

  /** Lets go of the canvases, as the shell goes. */
  dispose(): void {
    this.#stopWatching();
    this.#waiting.clear();
  }

  /** Moves each camera waiting whose pane shows its view, drawn, in a canvas that has drawn. */
  #move(): void {
    const drawn = this.#drawn;
    // Until the shell has drawn the panes as they are now, their canvases show what they showed.
    if (drawn === undefined || drawn !== this.#panes.snapshot()) return;
    for (const [id, waiting] of [...this.#waiting]) {
      const pane = drawn.panes.find((each) => each.id === id);
      if (!pane || pane.view !== waiting.view) {
        this.#waiting.delete(id);
        continue;
      }
      const canvas = this.#canvases.get(id);
      if (!canvas) continue;
      const from = canvas.camera();
      if (!from) {
        this.#watch(id, canvas);
        continue;
      }
      this.#waiting.delete(id);
      this.#unwatch(id);
      const viewport = canvas.viewport();
      const { to } = waiting;
      if ('exact' in to) {
        canvas.setCamera(to.exact);
        continue;
      }
      const target =
        'camera' in to ? cameraFor(to.camera, viewport) : canvas.targetOf({ whole: true });
      const glide = tourGlide(from, target, viewport, {
        reducedMotion: this.#settings.reduced,
        sameView: waiting.from !== undefined && waiting.from === waiting.view,
      });
      if (glide.move === 'stay') continue;
      if (glide.move.kind === 'cut') canvas.setCamera(target);
      else {
        canvas.glideTo(target, glide.move.duration, glide.along ? { along: glide.along } : {});
      }
    }
  }

  /** Waits for a canvas to draw its first frame. */
  #watch(id: string, canvas: CanvasCamera): void {
    if (this.#watching.has(id)) return;
    const stop = canvas.subscribe(() => {
      if (canvas.camera()) this.#move();
    });
    this.#watching.set(id, stop);
  }

  #unwatch(id: string): void {
    this.#watching.get(id)?.();
    this.#watching.delete(id);
  }

  #stopWatching(): void {
    for (const stop of this.#watching.values()) stop();
    this.#watching.clear();
  }
}
