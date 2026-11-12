/**
 * The explorable panel's place in the tab (ADR 0107): whether it is open, how wide it is while it
 * stands alone beside the canvas, and how tall while it stands below the physical-space panel, one
 * above the other in the same column (ADR 0076). Kept in memory for the tab, as that panel's width
 * is, and never written to a file.
 *
 * It writes `--explorable-panel-width`, `--explorable-panel-height` and `data-explorable-panel` on
 * the shell's element outside React, so that the column changes in the same frame; while the
 * physical-space panel is open too, the column is as wide as that panel says, and this panel's side
 * edge moves that width. Each change of the canvas's size keeps the same point of the view in the
 * canvas's middle, as the side panels do.
 */
import { panBy } from '../canvas/camera';
import type { CanvasCamera } from '../view-state/canvas';
import {
  DEFAULT_SPACE_PANEL_WIDTH,
  MIN_SPACE_PANEL_WIDTH,
  shownSpacePanelWidth,
  type SpacePanelFrames,
} from '../space/store';

/** The narrowest the panel is, as the physical-space panel. */
export const MIN_EXPLORABLE_PANEL_WIDTH = MIN_SPACE_PANEL_WIDTH;
/** The width it opens at. */
export const DEFAULT_EXPLORABLE_PANEL_WIDTH = DEFAULT_SPACE_PANEL_WIDTH;
/** The shortest it is below the physical-space panel, and the shortest it leaves that panel. */
export const MIN_EXPLORABLE_PANEL_HEIGHT = 160;
/** The height it opens at below the physical-space panel. */
export const DEFAULT_EXPLORABLE_PANEL_HEIGHT = 360;
/** How far an arrow key moves an edge. */
export const EXPLORABLE_PANEL_STEP = 16;

export const EXPLORABLE_PANEL_WIDTH = '--explorable-panel-width';
export const EXPLORABLE_PANEL_HEIGHT = '--explorable-panel-height';
export const EXPLORABLE_PANEL_OPEN = 'data-explorable-panel';

/** The height it shows at below the physical-space panel, in a column this tall. */
export function shownExplorablePanelHeight(height: number, columnHeight: number): number {
  const most = Math.max(MIN_EXPLORABLE_PANEL_HEIGHT, columnHeight - MIN_EXPLORABLE_PANEL_HEIGHT);
  return Math.min(most, Math.max(MIN_EXPLORABLE_PANEL_HEIGHT, Math.round(height)));
}

export interface ExplorablePanelSnapshot {
  readonly open: boolean;
  readonly width: number;
  readonly height: number;
  readonly version: number;
}

export interface ExplorablePanelStoreOptions {
  frames?: SpacePanelFrames;
  windowWidth?: () => number;
  /** The height of the column the panels stand in. */
  columnHeight?: () => number;
}

export class ExplorablePanelStore {
  readonly #listeners = new Set<() => void>();
  readonly #frames: SpacePanelFrames;
  readonly #windowWidth: () => number;
  readonly #columnHeight: () => number;
  #current: ExplorablePanelSnapshot = {
    open: false,
    width: DEFAULT_EXPLORABLE_PANEL_WIDTH,
    height: DEFAULT_EXPLORABLE_PANEL_HEIGHT,
    version: 0,
  };
  #element: HTMLElement | null = null;
  #canvas: CanvasCamera | undefined;
  #pending: { width?: number; height?: number } | undefined;
  #pendingFrame: number | undefined;

  constructor(options: ExplorablePanelStoreOptions = {}) {
    this.#frames = options.frames ?? {
      request: (callback) => requestAnimationFrame(callback),
      cancel: (handle) => cancelAnimationFrame(handle),
    };
    this.#windowWidth = options.windowWidth ?? (() => window.innerWidth);
    this.#columnHeight =
      options.columnHeight ??
      (() => this.#element?.querySelector<HTMLElement>('.canvas-area')?.clientHeight ?? 800);
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly snapshot = (): ExplorablePanelSnapshot => this.#current;

  get open(): boolean {
    return this.#current.open;
  }

  /** The width it shows at while it stands alone. */
  get width(): number {
    return shownSpacePanelWidth(this.#current.width, this.#windowWidth());
  }

  /** The height it shows at below the physical-space panel. */
  get height(): number {
    return shownExplorablePanelHeight(this.#current.height, this.#columnHeight());
  }

  setOpen(open: boolean): void {
    if (open === this.#current.open) return;
    this.#change({ open });
  }

  toggle(): void {
    this.setOpen(!this.#current.open);
  }

  setWidth(width: number): void {
    this.#dropPending();
    this.#change({ width: shownSpacePanelWidth(width, this.#windowWidth()) });
  }

  setHeight(height: number): void {
    this.#dropPending();
    this.#change({ height: shownExplorablePanelHeight(height, this.#columnHeight()) });
  }

  /** Gives the panel back the width it opens at. */
  reset(): void {
    this.setWidth(DEFAULT_EXPLORABLE_PANEL_WIDTH);
  }

  resetHeight(): void {
    this.setHeight(DEFAULT_EXPLORABLE_PANEL_HEIGHT);
  }

  /** Shows a width or a height while an edge is dragged, at the next frame. */
  preview(width: number): void {
    this.#previewSize({ width });
  }

  previewHeight(height: number): void {
    this.#previewSize({ height });
  }

  /** Marks the shell while an edge is dragged, as the side panels' edges do. */
  setResizing(resizing: boolean): void {
    this.#element?.toggleAttribute('data-panel-resizing', resizing);
  }

  /** The shell's element, which takes the sizes from now on. */
  readonly attach = (element: HTMLElement | null): void => {
    this.#element = element;
    this.#write();
  };

  /** The canvas whose middle stays in place. */
  setCanvas(canvas: CanvasCamera | undefined): void {
    this.#canvas = canvas;
  }

  /** Follows the window's resizing, which bounds the sizes, until the function it returns is called. */
  watch(target: Window): () => void {
    const listener = () => {
      this.#write();
      this.#current = { ...this.#current, version: this.#current.version + 1 };
      for (const each of [...this.#listeners]) each();
    };
    target.addEventListener('resize', listener);
    return () => {
      target.removeEventListener('resize', listener);
      this.#dropPending();
    };
  }

  #previewSize(size: { width?: number; height?: number }): void {
    this.#pending = { ...this.#pending, ...size };
    this.#pendingFrame ??= this.#frames.request(() => {
      this.#pendingFrame = undefined;
      const pending = this.#pending;
      this.#pending = undefined;
      if (pending?.width !== undefined) {
        this.#change({ width: shownSpacePanelWidth(pending.width, this.#windowWidth()) });
      }
      if (pending?.height !== undefined) {
        this.#change({ height: shownExplorablePanelHeight(pending.height, this.#columnHeight()) });
      }
    });
  }

  #change(change: Partial<Omit<ExplorablePanelSnapshot, 'version'>>): void {
    const next = { ...this.#current, ...change };
    if (
      next.open === this.#current.open &&
      next.width === this.#current.width &&
      next.height === this.#current.height
    ) {
      return;
    }
    const canvas = this.#canvas;
    const camera = canvas?.camera();
    const before = camera ? canvas?.viewport() : undefined;
    this.#current = { ...next, version: this.#current.version + 1 };
    this.#write();
    for (const listener of [...this.#listeners]) listener();
    if (!canvas || !camera || !before) return;
    const after = canvas.viewport();
    const dx = (after.width - before.width) / 2;
    const dy = (after.height - before.height) / 2;
    if (dx !== 0 || dy !== 0) canvas.setCamera(panBy(camera, dx, dy));
  }

  #write(): void {
    const element = this.#element;
    if (!element) return;
    element.style.setProperty(EXPLORABLE_PANEL_WIDTH, `${this.width}px`);
    element.style.setProperty(EXPLORABLE_PANEL_HEIGHT, `${this.height}px`);
    element.toggleAttribute(EXPLORABLE_PANEL_OPEN, this.#current.open);
  }

  #dropPending(): void {
    if (this.#pendingFrame !== undefined) this.#frames.cancel(this.#pendingFrame);
    this.#pendingFrame = undefined;
    this.#pending = undefined;
  }
}

/** The width or height a key on an edge gives: the side edge is the panel's left side, the top its top. */
export function keyedSize(
  key: string,
  size: number,
  least: number,
  most: number,
  growsWith: 'ArrowLeft' | 'ArrowUp',
): number | undefined {
  const shrinksWith = growsWith === 'ArrowLeft' ? 'ArrowRight' : 'ArrowDown';
  if (key === growsWith) return Math.min(most, size + EXPLORABLE_PANEL_STEP);
  if (key === shrinksWith) return Math.max(least, size - EXPLORABLE_PANEL_STEP);
  if (key === 'Home') return least;
  if (key === 'End') return most;
  return undefined;
}
