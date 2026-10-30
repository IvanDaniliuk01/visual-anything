/**
 * The side panels' store: the layout the shell's model panel and inspector are in, written onto the
 * shell's element as it changes, outside React, so that resizing a panel draws again only its edge
 * and the canvas, never the panels or the shell. The stylesheet makes the columns from what it writes:
 * `--model-panel-width` and `--inspector-width`, and `data-model-panel-collapsed` and
 * `data-inspector-collapsed` while each is a strip.
 *
 * A drag shows its width once a frame, never on each pointer move, and keeps it where it ends. Each
 * change keeps the same point of the view in the canvas's middle: the camera moves by half of what the
 * canvas gained or lost, in the change that resizes it, before the browser draws the frame.
 *
 * The layout is kept through a `PanelStorage`, the person's preference by default: written once a
 * change is done, and followed when it changes elsewhere, as in another tab, but not during a drag.
 */
import { panBy } from '../../canvas/camera';
import type { CanvasCamera } from '../../view-state/canvas';
import {
  DEFAULT_PANEL_WIDTH,
  PANEL_SIDES,
  sameLayout,
  shownWidth,
  type PanelLayout,
  type PanelSide,
} from './layout';
import { PREFERENCE_STORAGE, type PanelStorage } from './storage';

/** The frames a drag and the window's resizing wait for: the browser's by default. */
export interface PanelFrames {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

const BROWSER_FRAMES: PanelFrames = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

export interface PanelStoreOptions {
  /** Where the layout is kept: the person's preference by default. */
  storage?: PanelStorage;
  frames?: PanelFrames;
  /** The window's width in CSS pixels, of which a panel takes half at most. */
  windowWidth?: () => number;
}

/** What a panel's collapsing or opening says, each time anew. */
export interface PanelAnnouncement {
  side: PanelSide;
  collapsed: boolean;
  times: number;
}

/** What the panels' controls show. */
export interface PanelSnapshot {
  layout: PanelLayout;
  windowWidth: number;
  announcement: PanelAnnouncement | undefined;
}

/** The two controls that take each other's place: the edge's Collapse and the strip's Open. */
export type PanelControl = 'collapse' | 'open';

/** What holds the focus that belongs to each panel: the panel, its edge, or its strip. */
const PANEL_PARTS: Readonly<Record<PanelSide, string>> = {
  model: '.model-panel, [data-panel-edge="model"], [data-panel-strip="model"]',
  inspector: '.inspector, [data-panel-edge="inspector"], [data-panel-strip="inspector"]',
};

const COLLAPSED_ATTRIBUTE: Readonly<Record<PanelSide, string>> = {
  model: 'data-model-panel-collapsed',
  inspector: 'data-inspector-collapsed',
};

const WIDTH_PROPERTY: Readonly<Record<PanelSide, string>> = {
  model: '--model-panel-width',
  inspector: '--inspector-width',
};

export class PanelLayoutStore {
  private readonly storage: PanelStorage;
  private readonly frames: PanelFrames;
  private readonly windowWidth: () => number;
  private state: PanelSnapshot;
  private readonly listeners = new Set<() => void>();
  private element: HTMLElement | null = null;
  private canvas: CanvasCamera | undefined;
  /** The width a drag shows next, and the frame that shows it. */
  private pending: { side: PanelSide; width: number } | undefined;
  private frame: number | undefined;
  private windowFrame: number | undefined;
  private focusWanted: { side: PanelSide; control: PanelControl } | undefined;
  /** Whether an edge is being dragged, while what is kept elsewhere waits. */
  private resizing = false;

  constructor(options: PanelStoreOptions = {}) {
    this.storage = options.storage ?? PREFERENCE_STORAGE;
    this.frames = options.frames ?? BROWSER_FRAMES;
    this.windowWidth = options.windowWidth ?? (() => window.innerWidth);
    this.state = {
      layout: this.storage.read(),
      windowWidth: this.windowWidth(),
      announcement: undefined,
    };
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly snapshot = (): PanelSnapshot => this.state;

  /** The shell's element, which takes the layout from now on; none once the shell is gone. */
  readonly attach = (element: HTMLElement | null): void => {
    this.element = element;
    this.write();
  };

  /** The canvas whose middle stays in place; absent until it is made. */
  setCanvas(canvas: CanvasCamera | undefined): void {
    this.canvas = canvas;
  }

  /** Gives a panel a width, kept from now on. */
  setWidth(side: PanelSide, width: number): void {
    this.dropPending();
    this.change(this.withWidth(side, width), true);
  }

  /** Gives a panel back the width it opens at. */
  reset(side: PanelSide): void {
    this.setWidth(side, DEFAULT_PANEL_WIDTH[side]);
  }

  /** Shows a width while a panel's edge is dragged, at the next frame, and keeps nothing yet. */
  preview(side: PanelSide, width: number): void {
    this.pending = { side, width };
    this.frame ??= this.frames.request(() => {
      this.frame = undefined;
      const pending = this.pending;
      this.pending = undefined;
      if (pending) this.change(this.withWidth(pending.side, pending.width), false);
    });
  }

  /** Ends a drag at a width, which is kept. */
  commit(side: PanelSide, width: number): void {
    this.setWidth(side, width);
  }

  /** Marks the shell while an edge is dragged, so that the pointer shows it and no text is selected. */
  setResizing(resizing: boolean): void {
    this.resizing = resizing;
    this.element?.toggleAttribute('data-panel-resizing', resizing);
  }

  /**
   * Opens a collapsed panel, as whatever brings content forward in it does: the Changes tab, a comment
   * thread, a definition opened in the inspector. An open panel stays as it is.
   */
  open(side: PanelSide): void {
    if (this.state.layout[side].collapsed) this.toggle(side);
  }

  /**
   * Collapses a panel to its strip, or opens it again, and says so. The focus on the control that goes
   * away, or anywhere in a panel that collapses, moves to the control that takes its place.
   */
  toggle(side: PanelSide): void {
    this.dropPending();
    const collapsed = !this.state.layout[side].collapsed;
    const focused = this.focusIn(side);
    this.focusWanted = focused ? { side, control: collapsed ? 'open' : 'collapse' } : undefined;
    const layout = { ...this.state.layout, [side]: { ...this.state.layout[side], collapsed } };
    const times = (this.state.announcement?.times ?? 0) + 1;
    this.change(layout, true, { side, collapsed, times });
  }

  /** Whether `control` of `side` should take the focus now that it shows; asked once. */
  takeFocus(side: PanelSide, control: PanelControl): boolean {
    const wanted = this.focusWanted;
    if (wanted?.side !== side || wanted.control !== control) return false;
    this.focusWanted = undefined;
    return true;
  }

  /** Follows a change of the window's width, at the next frame. */
  followWindow(): void {
    this.windowFrame ??= this.frames.request(() => {
      this.windowFrame = undefined;
      const windowWidth = this.windowWidth();
      if (windowWidth === this.state.windowWidth) return;
      this.state = { ...this.state, windowWidth };
      this.write();
      this.notify();
    });
  }

  /**
   * Follows the window's resizing, and the layout kept as it changes elsewhere, until the function it
   * returns is called.
   */
  watch(target: Window): () => void {
    const listener = () => this.followWindow();
    target.addEventListener('resize', listener);
    const stopFollowing = this.storage.subscribe(() => this.followKept());
    this.followKept();
    return () => {
      stopFollowing();
      target.removeEventListener('resize', listener);
      if (this.windowFrame !== undefined) this.frames.cancel(this.windowFrame);
      this.windowFrame = undefined;
      this.dropPending();
    };
  }

  /** Takes the layout kept, as another tab or the program left it, except while an edge is dragged. */
  private followKept(): void {
    if (this.resizing || this.pending !== undefined) return;
    const kept = this.storage.read();
    if (!sameLayout(kept, this.state.layout)) this.change(kept, false);
  }

  private withWidth(side: PanelSide, width: number): PanelLayout {
    const shown = shownWidth(width, this.state.windowWidth);
    return { ...this.state.layout, [side]: { ...this.state.layout[side], width: shown } };
  }

  private dropPending(): void {
    if (this.frame !== undefined) this.frames.cancel(this.frame);
    this.frame = undefined;
    this.pending = undefined;
  }

  private change(layout: PanelLayout, keep: boolean, announcement?: PanelAnnouncement): void {
    if (!sameLayout(layout, this.state.layout) || announcement !== undefined) {
      this.state = { ...this.state, layout, announcement: announcement ?? this.state.announcement };
      this.keepingTheMiddle(() => this.write());
      this.notify();
    }
    // A drag's frames showed its width without keeping it: its end keeps it.
    const shown = this.state.layout;
    if (keep && !sameLayout(shown, this.storage.read())) this.storage.write(shown);
  }

  /** Runs a change of the canvas's size, and moves the camera so that its middle shows what it did. */
  private keepingTheMiddle(resize: () => void): void {
    const canvas = this.canvas;
    const camera = canvas?.camera();
    const before = camera ? canvas?.viewport() : undefined;
    resize();
    if (!canvas || !camera || !before) return;
    // Reading the size lays the page out with the new columns, once, in this frame.
    const after = canvas.viewport();
    const dx = (after.width - before.width) / 2;
    const dy = (after.height - before.height) / 2;
    if (dx !== 0 || dy !== 0) canvas.setCamera(panBy(camera, dx, dy));
  }

  /** Writes the layout onto the shell's element, for the stylesheet. */
  private write(): void {
    const element = this.element;
    if (!element) return;
    const { layout, windowWidth } = this.state;
    for (const side of PANEL_SIDES) {
      const { width, collapsed } = layout[side];
      element.style.setProperty(WIDTH_PROPERTY[side], `${shownWidth(width, windowWidth)}px`);
      element.toggleAttribute(COLLAPSED_ATTRIBUTE[side], collapsed);
    }
  }

  private focusIn(side: PanelSide): boolean {
    const focused = this.element?.ownerDocument.activeElement;
    return focused instanceof Element && focused.closest(PANEL_PARTS[side]) !== null;
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
