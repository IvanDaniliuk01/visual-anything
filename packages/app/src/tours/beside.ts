/**
 * A tour step's view beside it (ADR 0102): the pane right of the one the tour plays in (or, with three
 * open and the tour's rightmost, the rightmost but the tour's) shows the step's `beside` view state,
 * its view at its camera, or else the whole view, gliding there as steps do within a view and cutting
 * into another, or always for a step that always cuts. A step without one shows what the nearest step
 * before it with one shows beside it, so that a step reads the same whichever way it is come to, and
 * with none before it the pane as the tour found it. As the tour starts, the panes are taken note of
 * and held, so that the tab keeps them as they were while it plays (`SplitPanes.hold`); when it ends,
 * if a step showed a view beside it, they come back exactly as they were, but for views deleted
 * since: a pane the tour opened closes, and each pane shows its view again at its camera.
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
  /** Takes note of the panes as they are, and holds them, once, as a tour starts. */
  begin(): void;
  /**
   * Shows a step's view state in the pane beside the tour's, cutting there with `cut`; with none, the
   * pane as the tour found it. Whether it opened or closed a pane, so that the tour's pane changed its
   * width and the step's own camera is worked out once the panes are laid out again.
   */
  show(state: ViewState | undefined, options?: { cut?: boolean }): boolean;
  /** Gives the panes back as they were when the tour started. */
  end(): void;
  /** What the pane beside the active one shows now, its view and camera; none without one. */
  current(): ViewState | undefined;
}

/** A camera move waiting for its pane to show its view and its canvas to have drawn it. */
interface Waiting {
  view: Id | undefined;
  /** Where to: a view camera, a canvas camera to put back, or the whole view. */
  to: { camera: NonNullable<ViewState['camera']> } | { exact: Camera } | { whole: true };
  /** The view the pane showed before, to glide within it; none to cut. */
  from: Id | undefined;
  /** Whether it cuts whatever its move, as a step that always cuts does (ADR 0084). */
  cut?: boolean;
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
  /** The cameras of the panes as the tour found them, while it plays. */
  #before: { cameras: Map<string, Camera> } | undefined;
  /** Whether a step showed a view beside it in the tour playing, so that the panes come back. */
  #touched = false;
  /** Whether the pane beside shows a step's view now, rather than as the tour found it. */
  #showing = false;
  readonly #waiting = new Map<string, Waiting>();
  readonly #watching = new Map<string, () => void>();

  constructor(panes: SplitPanes) {
    this.#panes = panes;
  }

  begin(): void {
    if (this.#before) return;
    const cameras = new Map<string, Camera>();
    for (const pane of this.#panes.snapshot().panes) {
      const camera = this.#canvases.get(pane.id)?.camera();
      if (camera) cameras.set(pane.id, camera);
    }
    this.#panes.hold(cameras);
    this.#before = { cameras };
    this.#touched = false;
    this.#showing = false;
  }

  show(state: ViewState | undefined, options: { cut?: boolean } = {}): boolean {
    const panes = this.#panes;
    const count = panes.snapshot().panes.length;
    if (state) {
      const beside = panes.besidePane();
      const was = beside ? this.#settings.viewOf(beside.view) : undefined;
      const id = panes.showBeside(state.view);
      if (id === undefined) return false;
      this.#touched = true;
      this.#showing = true;
      this.#waiting.set(id, {
        view: state.view,
        to: state.camera ? { camera: state.camera } : { whole: true },
        from: beside?.id === id ? was : undefined,
        ...(options.cut ? { cut: true } : {}),
      });
    } else {
      // The pane beside as the tour found it, the tour's own pane showing the step's view.
      const noted = this.#before && this.#showing ? panes.heldLayout() : undefined;
      if (!noted) return false;
      this.#showing = false;
      const active = panes.active;
      panes.restore({
        active: noted.active,
        panes: noted.panes.map((pane) =>
          pane.id === noted.active ? { ...pane, view: active.view } : pane,
        ),
      });
      this.#putBack(noted);
    }
    this.#move();
    return panes.snapshot().panes.length !== count;
  }

  end(): void {
    const before = this.#before;
    this.#before = undefined;
    this.#waiting.clear();
    this.#stopWatching();
    if (!before) return;
    const touched = this.#touched;
    this.#touched = false;
    this.#showing = false;
    // A tour that showed nothing beside it leaves the panes as they are now.
    this.#panes.release(touched);
    if (!touched) return;
    this.#putBack(this.#panes.snapshot(), before.cameras);
    this.#move();
  }

  current(): ViewState | undefined {
    const beside = this.#panes.besidePane();
    const view = beside && this.#settings.viewOf(beside.view);
    if (!beside || view === undefined) return undefined;
    const canvas = this.#canvases.get(beside.id);
    const camera = canvas?.camera();
    const kept = camera && canvas ? cameraOf(camera, canvas.viewport()) : undefined;
    return { view, ...(kept ? { camera: kept } : {}) };
  }

  /**
   * Puts the cameras of a layout's panes back where the tour found them, once each pane shows its
   * view again; the tour's own pane goes back through the view state.
   */
  #putBack(layout: PaneLayout, cameras = this.#before?.cameras): void {
    for (const pane of layout.panes) {
      const camera = cameras?.get(pane.id);
      if (pane.id === layout.active || !camera) continue;
      this.#waiting.set(pane.id, { view: pane.view, to: { exact: camera }, from: undefined });
    }
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

  /** Lets go of the canvases as the shell goes, giving the panes back if a tour still plays. */
  dispose(): void {
    if (this.#before) this.end();
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
        reducedMotion: this.#settings.reduced || waiting.cut === true,
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
