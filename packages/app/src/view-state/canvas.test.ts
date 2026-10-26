import { describe, expect, it, vi } from 'vitest';
import type { Camera } from '../canvas/camera';
import { GLIDE_TIME, between, canvasCamera, type Frames } from './canvas';

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
