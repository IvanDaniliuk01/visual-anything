/** A tour step's view beside it, in the pane right of the tour's (ADR 0102). */
import { describe, expect, it, vi } from 'vitest';
import type { Camera } from '../canvas/camera';
import { SplitPanes, type PaneStorage } from '../split/panes';
import type { CanvasCamera } from '../view-state/canvas';
import { cameraFor, cameraOf } from '../view-state/state';
import { BesidePanes } from './beside';

const VIEWPORT = { width: 800, height: 600 };
const WHOLE: Camera = { x: 5, y: 5, scale: 0.5 };

function memory(): PaneStorage {
  const kept = new Map<string, string>();
  return {
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => void kept.set(key, value),
    removeItem: (key) => void kept.delete(key),
  };
}

/** A pane's canvas, its camera absent until it has drawn, telling who listens when it moves. */
function canvasAt(at: Camera | undefined) {
  let camera = at;
  const listeners = new Set<() => void>();
  const move = (to: Camera) => {
    camera = to;
    for (const listener of [...listeners]) listener();
  };
  const canvas = {
    camera: () => camera,
    viewport: () => VIEWPORT,
    setCamera: vi.fn<CanvasCamera['setCamera']>(move),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reveal: vi.fn(),
    targetOf: vi.fn<CanvasCamera['targetOf']>(() => WHOLE),
    glideTo: vi.fn<CanvasCamera['glideTo']>(move),
  } satisfies CanvasCamera;
  return { canvas, draw: move };
}

function setUp(reduced = false, storage = memory()) {
  const panes = new SplitPanes(storage, {
    name: 'Clinic',
    views: ['first', 'data', 'other', 'more'],
  });
  const beside = new BesidePanes(panes);
  const canvases = new Map<string, CanvasCamera>();
  const first = canvasAt({ x: 0, y: 0, scale: 1 });
  canvases.set('pane-1', first.canvas);
  /** The shell draws the panes as they are now, with these canvases. */
  const draw = () =>
    beside.drawn(panes.snapshot(), new Map(canvases), {
      viewOf: (view) => view ?? 'first',
      reduced,
    });
  draw();
  return { panes, beside, canvases, draw };
}

describe('a view beside a tour’s step', () => {
  it('opens a pane right of the tour’s, and puts its camera there once its canvas has drawn', () => {
    const { panes, beside, canvases, draw } = setUp();
    beside.begin();
    // Opening a pane narrows the tour's: the step's own camera waits for the panes to be laid out.
    expect(beside.show({ view: 'data', camera: { x: 100, y: 50, zoom: 2 } })).toBe(true);
    expect(panes.snapshot().panes.map((pane) => pane.view)).toEqual([undefined, 'data']);
    expect(panes.active.id).toBe('pane-1');
    // Its canvas is made, then draws its first frame: only then does the camera go there.
    const made = canvasAt(undefined);
    canvases.set('pane-2', made.canvas);
    draw();
    expect(made.canvas.setCamera).not.toHaveBeenCalled();
    made.draw(WHOLE);
    expect(made.canvas.setCamera).toHaveBeenLastCalledWith(
      cameraFor({ x: 100, y: 50, zoom: 2 }, VIEWPORT),
    );
    expect(made.canvas.glideTo).not.toHaveBeenCalled();
  });

  it('glides within the view the pane beside shows, cuts into another, and shows a view whole without a camera', () => {
    const { panes, beside, canvases, draw } = setUp();
    panes.openBeside('data', 'first');
    const pane = canvasAt({ x: 0, y: 0, scale: 1 });
    canvases.set('pane-2', pane.canvas);
    draw();
    beside.begin();
    expect(beside.show({ view: 'data', camera: { x: 300, y: 300, zoom: 1 } })).toBe(false);
    // The pane shows that view already: the camera glides there at once.
    expect(pane.canvas.glideTo).toHaveBeenCalledTimes(1);
    expect(pane.canvas.glideTo.mock.calls[0]?.[1]).toBeGreaterThan(0);
    beside.show({ view: 'other' });
    expect(pane.canvas.targetOf).not.toHaveBeenCalled();
    draw();
    expect(pane.canvas.targetOf).toHaveBeenCalledWith({ whole: true });
    expect(pane.canvas.setCamera).toHaveBeenLastCalledWith(WHOLE);
    expect(pane.canvas.glideTo).toHaveBeenCalledTimes(1);
  });

  it('cuts within a view too under reduced motion', () => {
    const { panes, beside, canvases, draw } = setUp(true);
    panes.openBeside('data', 'first');
    const pane = canvasAt({ x: 0, y: 0, scale: 1 });
    canvases.set('pane-2', pane.canvas);
    draw();
    beside.show({ view: 'data', camera: { x: 300, y: 300, zoom: 1 } });
    expect(pane.canvas.glideTo).not.toHaveBeenCalled();
    expect(pane.canvas.setCamera).toHaveBeenCalledTimes(1);
  });

  it('gives the panes back as they were when the tour ends, each at its camera', () => {
    const { panes, beside, canvases, draw } = setUp();
    panes.openBeside('data', 'first');
    const where: Camera = { x: 7, y: 8, scale: 1.25 };
    const pane = canvasAt(where);
    canvases.set('pane-2', pane.canvas);
    draw();
    const before = panes.snapshot();
    beside.begin();
    beside.show({ view: 'other', camera: { x: 1, y: 1, zoom: 1 } });
    draw();
    expect(pane.canvas.setCamera).toHaveBeenCalledTimes(1);
    // Taking note again, as for a step played again, changes nothing.
    beside.begin();
    beside.end();
    expect(panes.snapshot()).toEqual(before);
    draw();
    expect(pane.canvas.setCamera).toHaveBeenLastCalledWith(where);
  });

  it('closes the pane the tour opened when it ends', () => {
    const { panes, beside, canvases, draw } = setUp();
    beside.begin();
    beside.show({ view: 'data' });
    canvases.set('pane-2', canvasAt(WHOLE).canvas);
    draw();
    beside.end();
    expect(panes.snapshot().panes).toHaveLength(1);
    // Ending a tour it took no note for changes nothing.
    beside.show({ view: 'data' });
    beside.end();
    expect(panes.snapshot().panes).toHaveLength(2);
  });

  it('says what the pane right of the active one shows, its view and camera', () => {
    const { panes, beside, canvases, draw } = setUp();
    expect(beside.current()).toBeUndefined();
    panes.openBeside('data', 'first');
    expect(beside.current()).toEqual({ view: 'data' });
    const where: Camera = { x: 40, y: 20, scale: 2 };
    canvases.set('pane-2', canvasAt(where).canvas);
    draw();
    expect(beside.current()).toEqual({ view: 'data', camera: cameraOf(where, VIEWPORT) });
  });
});

describe('a view beside a tour’s step, as the review asked', () => {
  it('glides in the middle pane, and reads it, when the tour plays in the rightmost of three', () => {
    const { panes, beside, canvases, draw } = setUp();
    panes.openBeside('data', 'first');
    panes.openBeside('other', 'first');
    const [, middle, right] = panes.snapshot().panes;
    panes.activate(right!.id);
    const pane = canvasAt({ x: 0, y: 0, scale: 1 });
    canvases.set(middle!.id, pane.canvas);
    draw();
    expect(beside.current()).toEqual({
      view: 'other',
      camera: cameraOf({ x: 0, y: 0, scale: 1 }, VIEWPORT),
    });
    beside.begin();
    beside.show({ view: 'other', camera: { x: 300, y: 300, zoom: 1 } });
    expect(pane.canvas.glideTo).toHaveBeenCalledTimes(1);
  });

  it('cuts the pane beside for a step that always cuts', () => {
    const { panes, beside, canvases, draw } = setUp();
    panes.openBeside('data', 'first');
    const pane = canvasAt({ x: 0, y: 0, scale: 1 });
    canvases.set('pane-2', pane.canvas);
    draw();
    beside.begin();
    beside.show({ view: 'data', camera: { x: 300, y: 300, zoom: 1 } }, { cut: true });
    expect(pane.canvas.glideTo).not.toHaveBeenCalled();
    expect(pane.canvas.setCamera).toHaveBeenCalledTimes(1);
  });

  it('shows the pane as the tour found it for a step with nothing beside it before it', () => {
    const { panes, beside, canvases, draw } = setUp();
    panes.openBeside('data', 'first');
    const where: Camera = { x: 7, y: 8, scale: 1.25 };
    const pane = canvasAt(where);
    canvases.set('pane-2', pane.canvas);
    draw();
    beside.begin();
    // Before any step showed a view beside it, nothing moves.
    expect(beside.show(undefined)).toBe(false);
    expect(pane.canvas.setCamera).not.toHaveBeenCalled();
    // The tour's own pane shows its step's view; the pane beside, another.
    panes.setView('pane-1', 'more');
    beside.show({ view: 'other', camera: { x: 1, y: 1, zoom: 1 } });
    draw();
    beside.show(undefined);
    expect(panes.snapshot().panes.map((each) => each.view)).toEqual(['more', 'data']);
    draw();
    expect(pane.canvas.setCamera).toHaveBeenLastCalledWith(where);
  });

  it('leaves the panes and their cameras as they are when no step showed a view beside it', () => {
    const { panes, beside, canvases, draw } = setUp();
    panes.openBeside('data', 'first');
    const pane = canvasAt({ x: 7, y: 8, scale: 1.25 });
    canvases.set('pane-2', pane.canvas);
    draw();
    beside.begin();
    pane.draw({ x: 50, y: 50, scale: 1 });
    panes.openBeside('other', 'first');
    beside.end();
    draw();
    expect(panes.snapshot().panes.map((each) => each.view)).toEqual(['first', 'other', 'data']);
    expect(pane.canvas.setCamera).not.toHaveBeenCalled();
  });

  it('brings back a pane the person closed during the tour, and not one the tour opened', () => {
    const { panes, beside, canvases, draw } = setUp();
    panes.openBeside('data', 'first');
    canvases.set('pane-2', canvasAt(WHOLE).canvas);
    draw();
    const before = panes.snapshot();
    beside.begin();
    beside.show({ view: 'other' });
    panes.close('pane-2');
    beside.end();
    expect(panes.snapshot()).toEqual(before);

    const one = setUp();
    one.beside.begin();
    one.beside.show({ view: 'data' });
    one.panes.close('pane-2');
    one.beside.end();
    expect(one.panes.snapshot().panes).toHaveLength(1);
  });

  it('comes back without a pane whose view was deleted during the tour', () => {
    const { panes, beside, canvases, draw } = setUp();
    panes.openBeside('data', 'first');
    canvases.set('pane-2', canvasAt(WHOLE).canvas);
    draw();
    beside.begin();
    beside.show({ view: 'other' });
    panes.setProject({ name: 'Clinic', views: ['first', 'other', 'more'] });
    beside.end();
    expect(panes.snapshot().panes.map((each) => each.view)).toEqual(['first']);
  });

  it('holds the panes in the tab while a tour plays, and gives them back as the shell goes', () => {
    const storage = memory();
    const { panes, beside } = setUp(false, storage);
    beside.begin();
    beside.show({ view: 'data' });
    expect(panes.snapshot().panes).toHaveLength(2);
    const reloaded = new SplitPanes(storage, { name: 'Clinic', views: ['first', 'data'] });
    expect(reloaded.snapshot().panes).toHaveLength(1);
    beside.dispose();
    expect(panes.held).toBe(false);
    expect(panes.snapshot().panes).toHaveLength(1);
  });
});
