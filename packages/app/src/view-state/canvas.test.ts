import { tourEase } from '@visual-anything/core';
import { describe, expect, it, vi } from 'vitest';
import type { Camera } from '../canvas/camera';
import { FrameCapture } from '../canvas/capture';
import { GLIDE_TIME, between, canvasCamera, tourGlide, type Frames } from './canvas';

const VIEWPORT = { width: 800, height: 600 };

/** A controller whose reveal moves the camera to `revealed`, as the canvas's would. */
function fakeController(start: Camera, revealed: Camera) {
  const renderer = {
    camera: start,
    viewport: VIEWPORT,
    setCamera: vi.fn((camera: Camera) => {
      renderer.camera = camera;
    }),
  };
  return {
    renderer,
    get camera() {
      return renderer.camera;
    },
    reveal: vi.fn(() => {
      renderer.camera = revealed;
    }),
    zoomBy: vi.fn(),
  };
}

/** Frames that run only when the test says so, at the time it gives. */
function manualFrames() {
  let time = 0;
  let waiting: ((time: number) => void) | undefined;
  const frames: Frames = {
    request: (callback) => {
      waiting = callback;
      return 1;
    },
    cancel: () => {
      waiting = undefined;
    },
    now: () => time,
  };
  return {
    frames,
    advance(by: number) {
      time += by;
      const run = waiting;
      waiting = undefined;
      run?.(time);
    },
    get pending() {
      return waiting !== undefined;
    },
  };
}

const cameras = { current: () => undefined, subscribe: () => () => {} };
const FROM: Camera = { x: 0, y: 0, scale: 1 };
const TO: Camera = { x: -1600, y: -1200, scale: 2 };

describe('canvasCamera', () => {
  it('jumps when asked not to glide, as under reduced motion', () => {
    const controller = fakeController(FROM, TO);
    const clock = manualFrames();
    canvasCamera(controller as never, cameras, clock.frames).reveal('a', false);
    expect(controller.renderer.camera).toBe(TO);
    expect(clock.pending).toBe(false);
  });

  it('glides from where the camera was to where the canvas reveals the shape', () => {
    const controller = fakeController(FROM, TO);
    const clock = manualFrames();
    canvasCamera(controller as never, cameras, clock.frames).reveal('a', true);
    expect(controller.reveal).toHaveBeenCalledWith('a');
    expect(controller.renderer.camera).toEqual(FROM);
    clock.advance(GLIDE_TIME / 2);
    const halfway = controller.renderer.camera;
    expect(halfway.scale).toBeGreaterThan(1);
    expect(halfway.scale).toBeLessThan(2);
    clock.advance(GLIDE_TIME);
    expect(controller.renderer.camera).toBe(TO);
    expect(controller.zoomBy).toHaveBeenCalledWith(1);
    expect(clock.pending).toBe(false);
  });

  it('stops gliding once the person moves the camera', () => {
    const controller = fakeController(FROM, TO);
    const clock = manualFrames();
    canvasCamera(controller as never, cameras, clock.frames).reveal('a', true);
    clock.advance(GLIDE_TIME / 4);
    const panned = { x: 5, y: 5, scale: 1 };
    controller.renderer.camera = panned;
    clock.advance(GLIDE_TIME / 4);
    expect(controller.renderer.camera).toBe(panned);
    expect(clock.pending).toBe(false);
  });

  it('does not glide when the shape already shows', () => {
    const controller = fakeController(FROM, FROM);
    const clock = manualFrames();
    canvasCamera(controller as never, cameras, clock.frames).reveal('a', true);
    expect(clock.pending).toBe(false);
  });
});

// How a tour's steps move the camera (ADR 0058).
describe('canvasCamera for tours', () => {
  const WHOLE: Camera = { x: 100, y: 50, scale: 0.5 };

  function withFit(start: Camera) {
    const controller = fakeController(start, TO);
    return Object.assign(controller, {
      renderer: Object.assign(controller.renderer, {
        fit: vi.fn(() => {
          controller.renderer.camera = WHOLE;
        }),
      }),
    });
  }

  it('works out where a reveal or the whole view would take the camera, and stays where it is', () => {
    const controller = withFit(FROM);
    const camera = canvasCamera(controller as never, cameras, manualFrames().frames);
    expect(camera.targetOf({ key: 'a' })).toBe(TO);
    expect(controller.renderer.camera).toBe(FROM);
    expect(camera.targetOf({ whole: true })).toBe(WHOLE);
    expect(controller.renderer.camera).toBe(FROM);
  });

  it('glides to a camera over the time it is given, gently at both ends', () => {
    const controller = withFit(FROM);
    const clock = manualFrames();
    const camera = canvasCamera(controller as never, cameras, clock.frames);
    camera.glideTo(TO, 600);
    expect(controller.renderer.camera).toEqual(FROM);
    clock.advance(60);
    // A tenth of the way in time is far less than a tenth of the way in zoom, as it eases in.
    const early = controller.renderer.camera.scale;
    expect(early).toBeGreaterThan(1);
    expect(early).toBeLessThan(2 ** 0.1);
    clock.advance(540);
    expect(controller.renderer.camera).toBe(TO);
    expect(clock.pending).toBe(false);
  });

  it('cuts when the time is 0', () => {
    const controller = withFit(FROM);
    const clock = manualFrames();
    canvasCamera(controller as never, cameras, clock.frames).glideTo(TO, 0);
    expect(controller.renderer.camera).toBe(TO);
    expect(clock.pending).toBe(false);
  });
});

describe('between', () => {
  it('starts and ends at its two cameras, and zooms evenly in between', () => {
    expect(between(FROM, TO, VIEWPORT, 0)).toEqual(FROM);
    const end = between(FROM, TO, VIEWPORT, 1);
    expect(end.scale).toBeCloseTo(2);
    expect(end.x).toBeCloseTo(-1600);
    expect(end.y).toBeCloseTo(-1200);
    expect(between(FROM, TO, VIEWPORT, 0.5).scale).toBeCloseTo(Math.SQRT2);
  });
});

// The camera along van Wijk and Nuij's path, as tours and playback move it (ADR 0077).
describe('canvasCamera along a path', () => {
  it('follows the path it is given, paced by the sinusoidal ease, and ends where it goes', () => {
    const controller = fakeController(FROM, TO);
    const clock = manualFrames();
    const along = vi.fn((part: number): Camera => ({ x: -1600 * part, y: -1200 * part, scale: 1 }));
    canvasCamera(controller as never, cameras, clock.frames).glideTo(TO, 600, { along });
    clock.advance(60);
    expect(along).toHaveBeenLastCalledWith(tourEase(0.1));
    clock.advance(240);
    expect(along).toHaveBeenLastCalledWith(tourEase(0.5));
    expect(controller.renderer.camera.x).toBeCloseTo(-800);
    expect(controller.renderer.camera.y).toBeCloseTo(-600);
    clock.advance(300);
    expect(controller.renderer.camera).toBe(TO);
    expect(clock.pending).toBe(false);
  });

  it('waits for its stage before it moves, and stops if the person moves the camera meanwhile', () => {
    const controller = fakeController(FROM, TO);
    const clock = manualFrames();
    const camera = canvasCamera(controller as never, cameras, clock.frames);
    camera.glideTo(TO, 600, { delay: 150 });
    clock.advance(100);
    expect(controller.renderer.camera).toEqual(FROM);
    clock.advance(350);
    expect(controller.renderer.camera.scale).toBeCloseTo(Math.SQRT2, 1);
    camera.glideTo(FROM, 600, { delay: 150 });
    const panned = { x: 5, y: 5, scale: 1 };
    controller.renderer.camera = panned;
    clock.advance(100);
    expect(controller.renderer.camera).toBe(panned);
    expect(clock.pending).toBe(false);
  });

  it('lends the canvas’s capture of its last frame, where it can make one', () => {
    const element = document.createElement('canvas');
    const without = fakeController(FROM, TO);
    expect(canvasCamera(without as never, cameras).capture?.()).toBeUndefined();
    const withCapture = Object.assign(fakeController(FROM, TO), {});
    Object.assign(withCapture.renderer, {
      captureFrame: () => element,
      afterNextFrame: () => () => {},
    });
    expect(canvasCamera(withCapture as never, cameras).capture?.()).toBeInstanceOf(FrameCapture);
  });
});

describe('tourGlide', () => {
  const HERE: Camera = { x: 0, y: 0, scale: 1 };

  it('stays where the camera already is', () => {
    expect(
      tourGlide(HERE, { ...HERE }, VIEWPORT, { reducedMotion: false, sameView: true }),
    ).toEqual({ move: 'stay' });
  });

  it('cuts into another view, under reduced motion and from no camera', () => {
    const far: Camera = { x: -400, y: 0, scale: 1 };
    for (const options of [
      { reducedMotion: false, sameView: false },
      { reducedMotion: true, sameView: true },
    ]) {
      expect(tourGlide(HERE, far, VIEWPORT, options).move).toEqual({ kind: 'cut' });
    }
    expect(
      tourGlide(undefined, far, VIEWPORT, { reducedMotion: false, sameView: true }).move,
    ).toEqual({ kind: 'cut' });
  });

  it('moves along the smooth path from the camera to where it goes, zooming out on the way', () => {
    const far: Camera = { x: -1600, y: 0, scale: 1 };
    const glide = tourGlide(HERE, far, VIEWPORT, { reducedMotion: false, sameView: true });
    if (glide.move === 'stay' || glide.move.kind !== 'ease' || !glide.along) {
      throw new Error('The move does not glide.');
    }
    const start = glide.along(0);
    const end = glide.along(1);
    expect(start.x).toBeCloseTo(HERE.x);
    expect(start.scale).toBeCloseTo(1);
    expect(end.x).toBeCloseTo(far.x);
    expect(end.scale).toBeCloseTo(1);
    // A pan at one zoom zooms out on the way, as a straight glide never does.
    expect(glide.along(0.5).scale).toBeLessThan(1);
    expect(between(HERE, far, VIEWPORT, 0.5).scale).toBeCloseTo(1);
  });
});
