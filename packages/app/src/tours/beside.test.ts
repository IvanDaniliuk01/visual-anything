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

function setUp(reduced = false) {
  const panes = new SplitPanes(memory());
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
    beside.show({ view: 'data', camera: { x: 100, y: 50, zoom: 2 } });
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
    beside.show({ view: 'data', camera: { x: 300, y: 300, zoom: 1 } });
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
