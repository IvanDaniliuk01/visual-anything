import { describe, expect, it, vi } from 'vitest';
import type { Camera } from '../../canvas/camera';
import type { CanvasCamera } from '../../view-state/canvas';
import { DEFAULT_LAYOUT, type PanelLayout } from './layout';
import type { PanelStorage } from './storage';
import { PanelLayoutStore } from './store';

const WINDOW = 1600;
const HEIGHT = 900;
/** The strip a collapsed panel leaves, as the stylesheet makes it. */
const STRIP = 44;

/** The frames the store waits for, run by hand. */
function manualFrames() {
  const waiting = new Map<number, () => void>();
  let next = 1;
  return {
    request: vi.fn((callback: () => void) => {
      waiting.set(next, callback);
      return next++;
    }),
    cancel: vi.fn((handle: number) => void waiting.delete(handle)),
    get pending() {
      return waiting.size;
    },
    run() {
      const callbacks = [...waiting.values()];
      waiting.clear();
      for (const callback of callbacks) callback();
    },
  };
}

/** A storage that keeps what it is given, and records what it was asked to keep. */
interface MemoryStorage extends PanelStorage {
  kept: PanelLayout;
  written: PanelLayout[];
  /** A change made elsewhere, as by another tab. */
  elsewhere(layout: PanelLayout): void;
}

/** A storage that keeps what it is given, and tells its listeners when it changes elsewhere. */
function memory(initial: PanelLayout = DEFAULT_LAYOUT): MemoryStorage {
  const listeners = new Set<() => void>();
  const storage: MemoryStorage = {
    kept: initial,
    written: [] as PanelLayout[],
    read: () => storage.kept,
    write: (layout: PanelLayout) => {
      storage.written.push(layout);
      storage.kept = layout;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    elsewhere(layout: PanelLayout) {
      storage.kept = layout;
      for (const listener of [...listeners]) listener();
    },
  };
  return storage;
}

/** The width a column of the shell takes, as the stylesheet reads what the store writes. */
function column(shell: HTMLElement, side: 'model' | 'inspector'): number {
  const collapsed =
    side === 'model'
      ? 'modelPanelCollapsed' in shell.dataset
      : 'inspectorCollapsed' in shell.dataset;
  if (collapsed) return STRIP;
  const name = side === 'model' ? '--model-panel-width' : '--inspector-width';
  return Number.parseFloat(shell.style.getPropertyValue(name));
}

/** A canvas between the two panels, whose size follows the shell's columns as a browser lays them out. */
function fakeCanvas(
  shell: HTMLElement,
  at: Camera,
): CanvasCamera & { at: Camera; moves: ReturnType<typeof vi.fn> } {
  const moves = vi.fn((camera: Camera) => {
    canvas.at = camera;
  });
  const canvas = {
    at,
    moves,
    camera: () => canvas.at,
    viewport: () => ({
      width: WINDOW - column(shell, 'model') - column(shell, 'inspector'),
      height: HEIGHT,
    }),
    setCamera: moves,
    subscribe: () => () => {},
    reveal: () => {},
    targetOf: () => at,
    glideTo: () => {},
  };
  return canvas;
}

/** The point of the scene in the canvas's middle. */
function middleOf(canvas: CanvasCamera): { x: number; y: number } {
  const camera = canvas.camera();
  if (!camera) throw new Error('The canvas has no camera.');
  const { width, height } = canvas.viewport();
  return {
    x: (width / 2 - camera.x) / camera.scale,
    y: (height / 2 - camera.y) / camera.scale,
  };
}

function setUp() {
  const frames = manualFrames();
  const storage = memory();
  const store = new PanelLayoutStore({ storage, frames, windowWidth: () => WINDOW });
  const shell = document.createElement('div');
  store.attach(shell);
  return { frames, storage, store, shell };
}

describe('the side panels’ store', () => {
  it('writes each panel’s width on the shell, and whether it is collapsed', () => {
    const { store, shell } = setUp();
    expect(shell.style.getPropertyValue('--model-panel-width')).toBe('288px');
    expect(shell.style.getPropertyValue('--inspector-width')).toBe('320px');
    store.setWidth('inspector', 410);
    expect(shell.style.getPropertyValue('--inspector-width')).toBe('410px');
    store.toggle('model');
    expect(shell.dataset.modelPanelCollapsed).toBe('');
    expect(store.snapshot().layout.model).toEqual({ width: 288, collapsed: true });
    store.toggle('model');
    expect('modelPanelCollapsed' in shell.dataset).toBe(false);
  });

  it('keeps each change, and starts from what it kept', () => {
    const { store, storage } = setUp();
    store.setWidth('model', 333);
    store.toggle('inspector');
    expect(storage.kept).toEqual({
      model: { width: 333, collapsed: false },
      inspector: { width: 320, collapsed: true },
    });
    expect(storage.written).toHaveLength(2);
    const again = new PanelLayoutStore({ storage, windowWidth: () => WINDOW });
    expect(again.snapshot().layout).toEqual(storage.kept);
  });

  it('follows what is kept as it changes elsewhere, keeping the middle, but not during a drag', () => {
    const { store, storage, shell, frames } = setUp();
    const stop = store.watch(window);
    const canvas = fakeCanvas(shell, { x: 10, y: 10, scale: 2 });
    store.setCanvas(canvas);
    const middle = middleOf(canvas);
    const elsewhere = {
      model: { width: 400, collapsed: false },
      inspector: { width: 320, collapsed: true },
    };
    storage.elsewhere(elsewhere);
    expect(store.snapshot().layout).toEqual(elsewhere);
    expect(shell.style.getPropertyValue('--model-panel-width')).toBe('400px');
    expect(shell).toHaveAttribute('data-inspector-collapsed');
    expect(middleOf(canvas)).toEqual(middle);
    // Following it writes nothing back.
    expect(storage.written).toEqual([]);

    store.setResizing(true);
    store.preview('model', 450);
    storage.elsewhere(DEFAULT_LAYOUT);
    frames.run();
    expect(store.snapshot().layout.model.width).toBe(450);
    store.setResizing(false);
    store.commit('model', 460);
    expect(storage.kept.model.width).toBe(460);
    stop();
    storage.elsewhere(DEFAULT_LAYOUT);
    expect(store.snapshot().layout.model.width).toBe(460);
  });

  it('opens a collapsed panel when asked to, and leaves an open one as it is', () => {
    const { store, storage } = setUp();
    store.open('model');
    expect(storage.written).toEqual([]);
    store.toggle('model');
    store.open('model');
    expect(store.snapshot().layout.model.collapsed).toBe(false);
    expect(store.snapshot().announcement).toMatchObject({ side: 'model', collapsed: false });
  });

  it('keeps the widths within 200 px and half the window, and gives back the default', () => {
    const { store } = setUp();
    store.setWidth('model', 50);
    expect(store.snapshot().layout.model.width).toBe(200);
    store.setWidth('model', 5000);
    expect(store.snapshot().layout.model.width).toBe(800);
    store.reset('model');
    expect(store.snapshot().layout.model).toEqual(DEFAULT_LAYOUT.model);
  });

  it('opens a collapsed panel at the default width when its edge asks for it', () => {
    const { store } = setUp();
    store.setWidth('inspector', 500);
    store.toggle('inspector');
    store.reset('inspector');
    expect(store.snapshot().layout.inspector).toEqual({ width: 320, collapsed: true });
  });

  it('resizes the shell once a frame while a panel’s edge is dragged, and keeps it at the end', () => {
    const { store, shell, frames, storage } = setUp();
    for (const width of [300, 310, 320, 330]) store.preview('model', width);
    // No pointer move resizes anything by itself: the frame does, once.
    expect(shell.style.getPropertyValue('--model-panel-width')).toBe('288px');
    expect(frames.request).toHaveBeenCalledTimes(1);
    frames.run();
    expect(shell.style.getPropertyValue('--model-panel-width')).toBe('330px');
    // What a drag shows is kept only when it ends.
    expect(storage.written).toEqual([]);
    store.preview('model', 340);
    store.preview('model', 350);
    expect(frames.request).toHaveBeenCalledTimes(2);
    store.commit('model', 360);
    expect(frames.pending).toBe(0);
    expect(shell.style.getPropertyValue('--model-panel-width')).toBe('360px');
    expect(storage.written.map((layout) => layout.model.width)).toEqual([360]);
  });

  it('keeps the same point of the view in the canvas’s middle as a panel opens, closes or changes width', () => {
    const { store, shell, frames } = setUp();
    const canvas = fakeCanvas(shell, { x: -120, y: 40, scale: 0.75 });
    store.setCanvas(canvas);
    const middle = middleOf(canvas);
    store.setWidth('model', 420);
    expect(middleOf(canvas)).toEqual(middle);
    store.toggle('inspector');
    expect(middleOf(canvas)).toEqual(middle);
    store.toggle('inspector');
    expect(middleOf(canvas)).toEqual(middle);
    store.preview('inspector', 501);
    frames.run();
    expect(middleOf(canvas)).toEqual(middle);
    store.reset('model');
    expect(middleOf(canvas)).toEqual(middle);
    store.toggle('model');
    expect(middleOf(canvas)).toEqual(middle);
    expect(canvas.moves).toHaveBeenCalledTimes(6);
  });

  it('leaves the camera alone when nothing changes size', () => {
    const { store, shell } = setUp();
    const canvas = fakeCanvas(shell, { x: 0, y: 0, scale: 1 });
    store.setCanvas(canvas);
    store.setWidth('model', 288);
    expect(canvas.moves).not.toHaveBeenCalled();
  });

  it('follows the window, showing a panel no wider than half of it, and keeping the width chosen', () => {
    let width = WINDOW;
    const frames = manualFrames();
    const store = new PanelLayoutStore({ storage: memory(), frames, windowWidth: () => width });
    const shell = document.createElement('div');
    store.attach(shell);
    store.setWidth('inspector', 700);
    width = 1000;
    store.followWindow();
    frames.run();
    expect(shell.style.getPropertyValue('--inspector-width')).toBe('500px');
    expect(store.snapshot().windowWidth).toBe(1000);
    width = WINDOW;
    store.followWindow();
    frames.run();
    expect(shell.style.getPropertyValue('--inspector-width')).toBe('700px');
  });

  it('says what it collapsed or opened, and tells its listeners', () => {
    const { store } = setUp();
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    store.toggle('model');
    expect(store.snapshot().announcement).toEqual({ side: 'model', collapsed: true, times: 1 });
    store.toggle('model');
    expect(store.snapshot().announcement).toEqual({ side: 'model', collapsed: false, times: 2 });
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    store.toggle('model');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('hands the focus to the control that takes the place of the one it was on', () => {
    const { store, shell } = setUp();
    document.body.append(shell);
    const panel = document.createElement('aside');
    panel.className = 'model-panel';
    const inside = document.createElement('button');
    panel.append(inside);
    shell.append(panel);
    inside.focus();
    store.toggle('model');
    expect(store.takeFocus('model', 'open')).toBe(true);
    expect(store.takeFocus('model', 'open')).toBe(false);
    // Opened from elsewhere, the focus stays where it is.
    inside.blur();
    store.toggle('model');
    expect(store.takeFocus('model', 'collapse')).toBe(false);
    shell.remove();
  });
});
