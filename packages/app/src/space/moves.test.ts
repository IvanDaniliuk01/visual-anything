/**
 * The panel's camera moves (ADR 0076): eased over frames from its camera, or from where it last drew
 * when its state gives none; cut as `travel.ts` says; stopped by its panel closing and by any other
 * change of its camera.
 */
import type { SpaceCamera } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { SpacePanelStore } from './store';

const AT: SpaceCamera = { target: { x: 0, y: 0, z: 0 }, azimuth: 0, elevation: 0, distance: 2 };
const TURNED: SpaceCamera = { ...AT, azimuth: 90 };

function setUp() {
  let time = 0;
  const frames = new Map<number, () => void>();
  let next = 0;
  const store = new SpacePanelStore({
    frames: {
      request: (callback) => {
        next += 1;
        frames.set(next, callback);
        return next;
      },
      cancel: (handle) => frames.delete(handle),
    },
    windowWidth: () => 1600,
    now: () => time,
  });
  /** Moves the time on and runs the frames asked for. */
  const tick = (ms: number) => {
    time += ms;
    const due = [...frames.values()];
    frames.clear();
    for (const frame of due) frame();
  };
  return { store, tick, pending: () => frames.size };
}

describe('the panel’s camera moves', () => {
  it('eases from its camera to where it goes over the move’s time', () => {
    const { store, tick } = setUp();
    store.set('v', { root: 'arm', camera: AT });
    const move = store.moves.move('v', TURNED, { reducedMotion: false });
    expect(move).toEqual({ kind: 'ease', duration: 400 });
    expect(store.moves.moving('v')).toBe(true);
    tick(200);
    const halfway = store.state('v')?.camera;
    expect(halfway?.azimuth).toBeCloseTo(45);
    expect(store.state('v')?.root).toBe('arm');
    expect(store.moves.byMove('v', halfway)).toBe(true);
    tick(250);
    expect(store.state('v')?.camera).toBe(TURNED);
    expect(store.moves.moving('v')).toBe(false);
  });

  it('starts where the panel last drew when its state gives no camera', () => {
    const { store, tick } = setUp();
    store.set('v', {});
    store.moves.setDrawn('v', { camera: AT, aspect: 1 });
    expect(store.moves.move('v', TURNED, { reducedMotion: false }).kind).toBe('ease');
    expect(store.state('v')?.camera).toEqual(AT);
    tick(1000);
    expect(store.state('v')?.camera).toBe(TURNED);
  });

  it('cuts from no camera, into another element shown and under reduced motion', () => {
    const { store, pending } = setUp();
    store.set('v', {});
    expect(store.moves.move('v', TURNED, { reducedMotion: false }).kind).toBe('cut');
    expect(store.state('v')?.camera).toBe(TURNED);
    expect(store.moves.move('v', AT, { reducedMotion: true }).kind).toBe('cut');
    expect(store.state('v')?.camera).toBe(AT);
    expect(store.moves.move('v', TURNED, { reducedMotion: false, sameRoot: false }).kind).toBe(
      'cut',
    );
    expect(store.state('v')?.camera).toBe(TURNED);
    expect(pending()).toBe(0);
  });

  it('stops where it is once something else moves the camera, and once the panel closes', () => {
    const { store, tick } = setUp();
    store.set('v', { camera: AT });
    store.moves.move('v', TURNED, { reducedMotion: false });
    tick(100);
    const person: SpaceCamera = { ...AT, distance: 3 };
    store.set('v', { camera: person });
    tick(100);
    expect(store.state('v')?.camera).toBe(person);
    expect(store.moves.moving('v')).toBe(false);
    expect(store.moves.byMove('v', person)).toBe(false);

    store.moves.move('v', TURNED, { reducedMotion: false });
    store.close('v');
    tick(1000);
    expect(store.state('v')).toBeUndefined();
  });

  it('does nothing while the panel is closed', () => {
    const { store } = setUp();
    expect(store.moves.move('v', AT, { reducedMotion: false }).kind).toBe('closed');
    expect(store.state('v')).toBeUndefined();
  });
});
