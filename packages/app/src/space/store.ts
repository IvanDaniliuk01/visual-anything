/**
 * The physical-space panel's place in the tab (ADR 0076): for each view, whether the panel is open and,
 * while it is, what it shows and where it looks, as a view state's `space` says (`ViewSpace`); and how
 * wide the panel is. Kept in memory, as the canvas's cameras are, and never written to a file; the
 * view state and the addresses read it and set it through `state`, `open`, `set` and `close`.
 *
 * The width is written onto the shell's element as `--space-panel-width`, and `data-space-panel`
 * while the open view's panel is open, outside React, so that the column changes in the same frame
 * and a drag draws again only the edge and the canvas; a drag shows its width once a frame. Each
 * change of the canvas's size, as the panel opens, closes or is resized, keeps the same point of the
 * view in the canvas's middle, as the side panels do.
 */
import type { ViewSpace } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { panBy } from '../canvas/camera';
import type { CanvasCamera } from '../view-state/canvas';

/** The narrowest the panel is, in CSS pixels. */
export const MIN_SPACE_PANEL_WIDTH = 280;
/** The width the panel opens at, and gets back with a double click on its edge. */
export const DEFAULT_SPACE_PANEL_WIDTH = 480;
/** How far an arrow key moves the panel's edge. */
export const SPACE_PANEL_STEP = 16;

/** The custom property, on the shell, that the panel's column takes. */
export const SPACE_PANEL_WIDTH = '--space-panel-width';
/** The attribute the shell has while the open view's panel is open. */
export const SPACE_PANEL_OPEN = 'data-space-panel';

/** The widest the panel is in a window this wide: half of it, never less than the narrowest. */
export function maxSpacePanelWidth(windowWidth: number): number {
  return Math.max(MIN_SPACE_PANEL_WIDTH, Math.floor(windowWidth / 2));
}

/** The width the panel shows at: the width chosen, in whole pixels, within what the window allows. */
export function shownSpacePanelWidth(width: number, windowWidth: number): number {
  return Math.min(
    maxSpacePanelWidth(windowWidth),
    Math.max(MIN_SPACE_PANEL_WIDTH, Math.round(width)),
  );
}

/** The frames a drag waits for: the browser's by default. */
export interface SpacePanelFrames {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

export interface SpacePanelStoreOptions {
  frames?: SpacePanelFrames;
  /** The window's width in CSS pixels, of which the panel takes half at most. */
  windowWidth?: () => number;
}

/** What the panel's controls show: its width, and a number that changes with every change. */
export interface SpacePanelSnapshot {
  readonly width: number;
  readonly version: number;
}

/** Works out what the panel shows when it opens with nothing chosen, for a view (`root.ts`). */
export type SpaceChooser = (viewId: Id) => ViewSpace;

/**
 * A request to frame elements in a view's panel, as Show in physical space makes for an element in
 * physical space under World: the panel takes it up once, frames them, and drops it with `framed`.
 * No elements frames everything the panel draws.
 */
export interface SpaceFraming {
  readonly elements: readonly Id[];
  /** A number above zero, new for each request, so that the same elements asked again are framed again. */
  readonly serial: number;
}

export class SpacePanelStore {
  private readonly byView = new Map<Id, ViewSpace>();
  private readonly framings = new Map<Id, SpaceFraming>();
  private framingSerial = 0;
  private readonly listeners = new Set<() => void>();
  private readonly frames: SpacePanelFrames;
  private readonly windowWidth: () => number;
  private chooser: SpaceChooser | undefined;
  private current: SpacePanelSnapshot = { width: DEFAULT_SPACE_PANEL_WIDTH, version: 0 };
  private element: HTMLElement | null = null;
  private openView: Id | undefined;
  private canvas: CanvasCamera | undefined;
  private pending: number | undefined;
  private pendingFrame: number | undefined;

  constructor(options: SpacePanelStoreOptions = {}) {
    this.frames = options.frames ?? {
      request: (callback) => requestAnimationFrame(callback),
      cancel: (handle) => cancelAnimationFrame(handle),
    };
    this.windowWidth = options.windowWidth ?? (() => window.innerWidth);
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly snapshot = (): SpacePanelSnapshot => this.current;

  // For each view -------------------------------------------------------------------------------

  /** The panel of a view: what it shows and where it looks while it is open; none while it is closed. */
  state(viewId: Id): ViewSpace | undefined {
    return this.byView.get(viewId);
  }

  /** Opens the panel of a view on `space`, or on what the chooser picks when none is given. */
  open(viewId: Id, space?: ViewSpace): void {
    this.set(viewId, space ?? this.chooser?.(viewId) ?? {});
  }

  /** Closes the panel of a view; what it showed, and a framing it had not taken up, are forgotten. */
  close(viewId: Id): void {
    if (!this.byView.has(viewId)) return;
    this.framings.delete(viewId);
    this.resizing(() => this.byView.delete(viewId));
  }

  /** Sets what the panel of a view shows and where it looks, opening it if it was closed. */
  set(viewId: Id, space: ViewSpace): void {
    if (this.byView.get(viewId) === space) return;
    this.resizing(() => this.byView.set(viewId, space));
  }

  /** Opens the panel of a view as `open` does, or closes it. */
  toggle(viewId: Id): void {
    if (this.byView.has(viewId)) this.close(viewId);
    else this.open(viewId);
  }

  /**
   * Asks the open panel of a view to frame `elements`, or everything it draws when none are given;
   * the panel takes the request up with `framing` and drops it with `framed`. A newer request
   * replaces one not taken up yet. A view whose panel is closed keeps none.
   */
  frame(viewId: Id, elements: readonly Id[] = []): void {
    if (!this.byView.has(viewId)) return;
    this.framingSerial += 1;
    this.framings.set(viewId, { elements: [...elements], serial: this.framingSerial });
    for (const listener of [...this.listeners]) listener();
  }

  /** The framing the panel of a view was asked for and has not done yet. */
  framing(viewId: Id): SpaceFraming | undefined {
    return this.framings.get(viewId);
  }

  /** Drops a framing once the panel did it; a newer one asked meanwhile stays. */
  framed(viewId: Id, serial: number): void {
    if (this.framings.get(viewId)?.serial !== serial) return;
    this.framings.delete(viewId);
    for (const listener of [...this.listeners]) listener();
  }

  /** Gives the store what picks the panel's element when it opens with nothing chosen. */
  setChooser(chooser: SpaceChooser | undefined): void {
    this.chooser = chooser;
  }

  // Its width -----------------------------------------------------------------------------------

  /** The width the panel shows at now. */
  get width(): number {
    return shownSpacePanelWidth(this.current.width, this.windowWidth());
  }

  /** Gives the panel a width, kept from now on. */
  setWidth(width: number): void {
    this.dropPending();
    this.changeWidth(width);
  }

  /** Gives the panel back the width it opens at. */
  reset(): void {
    this.setWidth(DEFAULT_SPACE_PANEL_WIDTH);
  }

  /** Shows a width while the edge is dragged, at the next frame. */
  preview(width: number): void {
    this.pending = width;
    this.pendingFrame ??= this.frames.request(() => {
      this.pendingFrame = undefined;
      const pending = this.pending;
      this.pending = undefined;
      if (pending !== undefined) this.changeWidth(pending);
    });
  }

  /** Marks the shell while the edge is dragged, as the side panels' edges do. */
  setResizing(resizing: boolean): void {
    this.element?.toggleAttribute('data-panel-resizing', resizing);
  }

  // The shell and the canvas --------------------------------------------------------------------

  /** The shell's element, which takes the width from now on; none once the shell is gone. */
  readonly attach = (element: HTMLElement | null): void => {
    this.element = element;
    this.write();
  };

  /** The canvas whose middle stays in place; absent until it is made. */
  setCanvas(canvas: CanvasCamera | undefined): void {
    this.canvas = canvas;
  }

  /** The view the tab shows, whose panel the shell's column is for. */
  setOpenView(viewId: Id | undefined): void {
    if (this.openView === viewId) return;
    this.openView = viewId;
    this.write();
  }

  /** Whether the open view's panel is open. */
  get shown(): boolean {
    return this.openView !== undefined && this.byView.has(this.openView);
  }

  /** Follows the window's resizing, which bounds the panel's width, until the function it returns is called. */
  watch(target: Window): () => void {
    const listener = () => {
      this.write();
      this.current = { ...this.current, version: this.current.version + 1 };
      for (const each of [...this.listeners]) each();
    };
    target.addEventListener('resize', listener);
    return () => {
      target.removeEventListener('resize', listener);
      this.dropPending();
    };
  }

  private changeWidth(width: number): void {
    const shown = shownSpacePanelWidth(width, this.windowWidth());
    if (shown === this.current.width) return;
    this.resizing(() => {
      this.current = { ...this.current, width: shown };
    });
  }

  /**
   * Runs a change that may resize the canvas, writes the width and tells the listeners, and moves the
   * canvas's camera so that its middle shows what it did.
   */
  private resizing(change: () => void): void {
    const canvas = this.canvas;
    const camera = canvas?.camera();
    const before = camera ? canvas?.viewport() : undefined;
    change();
    this.current = { ...this.current, version: this.current.version + 1 };
    this.write();
    for (const listener of [...this.listeners]) listener();
    if (!canvas || !camera || !before) return;
    const after = canvas.viewport();
    const dx = (after.width - before.width) / 2;
    const dy = (after.height - before.height) / 2;
    if (dx !== 0 || dy !== 0) canvas.setCamera(panBy(camera, dx, dy));
  }

  private write(): void {
    this.element?.style.setProperty(SPACE_PANEL_WIDTH, `${this.width}px`);
    this.element?.toggleAttribute(SPACE_PANEL_OPEN, this.shown);
  }

  private dropPending(): void {
    if (this.pendingFrame !== undefined) this.frames.cancel(this.pendingFrame);
    this.pendingFrame = undefined;
    this.pending = undefined;
  }
}

/** The width a key on the panel's edge gives it; the edge is the panel's left side. */
export function keyedSpacePanelWidth(
  key: string,
  width: number,
  windowWidth: number,
): number | undefined {
  if (key === 'ArrowLeft') return shownSpacePanelWidth(width + SPACE_PANEL_STEP, windowWidth);
  if (key === 'ArrowRight') return shownSpacePanelWidth(width - SPACE_PANEL_STEP, windowWidth);
  if (key === 'Home') return MIN_SPACE_PANEL_WIDTH;
  if (key === 'End') return maxSpacePanelWidth(windowWidth);
  return undefined;
}
