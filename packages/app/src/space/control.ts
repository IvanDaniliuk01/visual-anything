/**
 * The physical-space panel's camera while it is open (ADR 0076): where it looks now, kept by the tab
 * for the view in `SpacePanelStore`, and the moves that change it. A drag writes at most one camera a
 * frame; Fit and framing ease to the camera the worker answers over 300 ms, and cut under reduced
 * motion. Moving the camera is never a command, and never enters the history.
 *
 * Before the person moves it, the panel has no camera of its own and the worker frames everything,
 * again as what it shows changes; the camera it drew the newest frame from is where a move starts.
 */
import type { Id, SpaceCamera } from '@visual-anything/schema';
import { eased } from '../canvas/layout/transition';
import type { SpaceDrawing } from '../solids/solid-client';
import { cameraBetween, sameCamera } from './orbit';
import type { SpacePanelFrames, SpacePanelStore } from './store';

/** How long Fit and framing take to move the camera. */
export const SPACE_CAMERA_EASE = 300;

export interface SpaceControlOptions {
  frames?: SpacePanelFrames;
  /** The time in milliseconds, which easing follows. */
  now?: () => number;
}

export class SpaceControl {
  private drawing: SpaceDrawing | undefined;
  private reduced = false;
  private pending: SpaceCamera | undefined;
  private pendingFrame: number | undefined;
  private easing: { frame: number } | undefined;
  private readonly frames: SpacePanelFrames;
  private readonly now: () => number;

  constructor(
    private readonly store: SpacePanelStore,
    readonly viewId: Id,
    options: SpaceControlOptions = {},
  ) {
    this.frames = options.frames ?? {
      request: (callback) => requestAnimationFrame(callback),
      cancel: (handle) => cancelAnimationFrame(handle),
    };
    this.now = options.now ?? (() => performance.now());
  }

  /** The drawing of the panel's frames, while there is one. */
  attach(drawing: SpaceDrawing | undefined): void {
    this.drawing = drawing;
  }

  get space(): SpaceDrawing | undefined {
    return this.drawing;
  }

  /** Whether motion is reduced: moves then cut. */
  setReduced(reduced: boolean): void {
    this.reduced = reduced;
  }

  /** Where the camera looks now: the one being written, the panel's own, or the newest frame's. */
  camera(): SpaceCamera | undefined {
    return this.pending ?? this.store.state(this.viewId)?.camera ?? this.drawing?.frame?.camera;
  }

  /** Moves the camera at once, as a drag or a key does: written at the next frame. */
  setCamera(camera: SpaceCamera): void {
    this.stopEasing();
    this.pending = camera;
    if (this.pendingFrame !== undefined) return;
    let ran = false;
    const handle = this.frames.request(() => {
      ran = true;
      this.pendingFrame = undefined;
      const pending = this.pending;
      this.pending = undefined;
      if (pending) this.write(pending);
    });
    if (!ran) this.pendingFrame = handle;
  }

  /** Eases the camera to `camera`, or cuts there under reduced motion or with nowhere to start from. */
  moveTo(camera: SpaceCamera): void {
    this.flush();
    this.stopEasing();
    const from = this.camera();
    if (this.reduced || !from || sameCamera(from, camera)) {
      this.write(camera);
      return;
    }
    const start = this.now();
    const step = () => {
      const share = Math.min(1, (this.now() - start) / SPACE_CAMERA_EASE);
      this.write(cameraBetween(from, camera, eased(share)));
      if (share < 1) this.easing = { frame: this.frames.request(step) };
      else this.easing = undefined;
    };
    this.easing = { frame: this.frames.request(step) };
  }

  /** Frames these elements, or everything the panel draws; false when the worker cannot say. */
  async fit(elements?: readonly Id[]): Promise<boolean> {
    const drawing = this.drawing;
    if (!drawing) return false;
    const camera = await drawing.fit(elements && elements.length > 0 ? elements : undefined);
    if (!camera || drawing !== this.drawing) return false;
    this.moveTo(camera);
    return true;
  }

  /** Stops what is pending, as the panel closes. */
  dispose(): void {
    this.stopEasing();
    if (this.pendingFrame !== undefined) this.frames.cancel(this.pendingFrame);
    this.pendingFrame = undefined;
    this.pending = undefined;
    this.drawing = undefined;
  }

  /** Writes a pending camera now. */
  private flush(): void {
    if (this.pendingFrame !== undefined) this.frames.cancel(this.pendingFrame);
    this.pendingFrame = undefined;
    const pending = this.pending;
    this.pending = undefined;
    if (pending) this.write(pending);
  }

  private stopEasing(): void {
    if (this.easing) this.frames.cancel(this.easing.frame);
    this.easing = undefined;
  }

  /** Keeps the camera in the tab, for the view, with the rest of what its panel shows. */
  private write(camera: SpaceCamera): void {
    const shown = this.store.state(this.viewId);
    if (!shown) return;
    this.store.set(this.viewId, { ...shown, camera });
  }
}
