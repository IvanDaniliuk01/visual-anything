/**
 * The physical-space panel's place in the tab (ADR 0076): kept for each view, opened on what the
 * chooser picks when nothing is chosen, its width within 280 pixels and half the window, written on
 * the shell with the attribute its column follows, and the canvas's middle kept as it opens.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Camera } from '../canvas/camera';
import {
  MIN_SPACE_PANEL_WIDTH,
  SPACE_PANEL_OPEN,
  SPACE_PANEL_WIDTH,
  SpacePanelStore,
  keyedSpacePanelWidth,
  shownSpacePanelWidth,
} from './store';

function setUp(windowWidth = 1600) {
  const frames: (() => void)[] = [];
  const store = new SpacePanelStore({
    frames: {
      request: (callback) => frames.push(callback),
      cancel: (handle) => {
        frames[handle - 1] = () => {};
      },
    },
    windowWidth: () => windowWidth,
  });
  const shell = document.createElement('div');
  store.attach(shell);
  const tick = () => {
    for (const frame of frames.splice(0)) frame();
  };
  return { store, shell, tick };
}

describe('the physical-space panel’s place', () => {
  it('keeps for each view whether it is open, and what it shows and where it looks', () => {
    const { store } = setUp();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.state('a')).toBeUndefined();
    store.open('a', { root: 'arm' });
    store.set('b', {
      camera: { target: { x: 0, y: 0, z: 0 }, azimuth: 0, elevation: 0, distance: 1 },
    });
    expect(store.state('a')).toEqual({ root: 'arm' });
    expect(store.state('b')?.camera?.distance).toBe(1);
    store.close('a');
    expect(store.state('a')).toBeUndefined();
    expect(store.state('b')).toBeDefined();
    expect(listener).toHaveBeenCalledTimes(3);
    // Closing a closed panel changes nothing.
    store.close('a');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('opens on what the chooser picks when nothing is chosen, and on World without one', () => {
    const { store } = setUp();
    store.open('a');
    expect(store.state('a')).toEqual({});
    store.close('a');
    store.setChooser((view) => (view === 'a' ? { root: 'spare' } : {}));
    store.toggle('a');
    expect(store.state('a')).toEqual({ root: 'spare' });
    store.toggle('a');
    expect(store.state('a')).toBeUndefined();
  });

  it('marks the shell while the open view’s panel is open, with its width', () => {
    const { store, shell } = setUp();
    expect(shell.style.getPropertyValue(SPACE_PANEL_WIDTH)).toBe('480px');
    store.open('b');
    expect(shell.hasAttribute(SPACE_PANEL_OPEN)).toBe(false);
    store.setOpenView('a');
    expect(shell.hasAttribute(SPACE_PANEL_OPEN)).toBe(false);
    store.open('a');
    expect(shell.hasAttribute(SPACE_PANEL_OPEN)).toBe(true);
    store.setOpenView('b');
    expect(shell.hasAttribute(SPACE_PANEL_OPEN)).toBe(true);
    store.close('b');
    expect(shell.hasAttribute(SPACE_PANEL_OPEN)).toBe(false);
  });

  it('takes widths from 280 pixels to half the window, a drag’s once a frame', () => {
    const { store, shell, tick } = setUp(1000);
    store.setWidth(100);
    expect(store.width).toBe(MIN_SPACE_PANEL_WIDTH);
    store.setWidth(900);
    expect(store.width).toBe(500);
    store.preview(320);
    store.preview(330);
    expect(store.width).toBe(500);
    tick();
    expect(store.width).toBe(330);
    expect(shell.style.getPropertyValue(SPACE_PANEL_WIDTH)).toBe('330px');
    store.reset();
    expect(store.width).toBe(480);
    expect(shownSpacePanelWidth(300.4, 400)).toBe(MIN_SPACE_PANEL_WIDTH);
  });

  it('moves its edge by the keys: left widens the panel, right narrows it', () => {
    expect(keyedSpacePanelWidth('ArrowLeft', 400, 1600)).toBe(416);
    expect(keyedSpacePanelWidth('ArrowRight', 400, 1600)).toBe(384);
    expect(keyedSpacePanelWidth('Home', 400, 1600)).toBe(280);
    expect(keyedSpacePanelWidth('End', 400, 1600)).toBe(800);
    expect(keyedSpacePanelWidth('a', 400, 1600)).toBeUndefined();
  });

  it('keeps the canvas’s middle in place as the panel opens', () => {
    const { store, shell } = setUp();
    const camera: Camera = { x: 0, y: 0, scale: 1 };
    const setCamera = vi.fn();
    // The canvas is as wide as the shell's columns leave it, which follow the attribute at once.
    store.setCanvas({
      camera: () => camera,
      viewport: () => ({ width: shell.hasAttribute(SPACE_PANEL_OPEN) ? 520 : 1000, height: 600 }),
      setCamera,
      onMove: () => () => {},
    } as never);
    store.setOpenView('a');
    store.open('a');
    expect(setCamera).toHaveBeenCalledTimes(1);
    expect(setCamera.mock.calls[0]?.[0]).toEqual({ x: -240, y: 0, scale: 1 });
    // Another view's panel leaves the canvas as it is.
    store.open('b');
    expect(setCamera).toHaveBeenCalledTimes(1);
  });
});
