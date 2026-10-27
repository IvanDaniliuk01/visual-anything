/** A tour step's camera: the person looking around, Back to the step, and following (ADR 0077). */
import { TOUR_CROSS_FADE } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Camera } from '../canvas/camera';
import type { FrameCapture } from '../canvas/capture';
import type { GlideOptions } from '../view-state/canvas';
import { StepCamera, type StepCanvas } from './step-camera';

const VIEWPORT = { width: 1000, height: 600 };
const HOME: Camera = { x: 0, y: 0, scale: 1 };
const STILL = { reduced: false, fades: true };

/** A canvas whose camera moves as asked, at once, and as the person moves it. */
function fakeCanvas() {
  let camera: Camera | undefined = HOME;
  const listeners = new Set<() => void>();
  const tell = () => {
    for (const listener of listeners) listener();
  };
  const captures: { fadeOut: ReturnType<typeof vi.fn> }[] = [];
  const glides: { to: Camera; duration: number; options?: GlideOptions }[] = [];
  const canvas: StepCanvas & { person: (to: Camera) => void } = {
    camera: () => camera,
    viewport: () => VIEWPORT,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    glideTo: (to, duration, options) => {
      glides.push({ to, duration, ...(options ? { options } : {}) });
      camera = to;
      tell();
    },
    capture: () => {
      const capture = { fadeOut: vi.fn() };
      captures.push(capture);
      return capture as unknown as FrameCapture;
    },
    person: (to) => {
      camera = to;
      tell();
    },
  };
  return { canvas, glides, captures };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('StepCamera', () => {
  it('offers Back to the step once the person pans or zooms, and gives the step’s camera back', () => {
    const { canvas, glides } = fakeCanvas();
    const step = new StepCamera();
    step.attach(canvas);
    const heard = vi.fn();
    step.subscribe(heard);
    step.arrive(HOME, 0);
    vi.advanceTimersByTime(100);
    expect(step.getState().looked).toBe(false);
    canvas.person({ x: -300, y: 0, scale: 1 });
    expect(step.getState().looked).toBe(true);
    expect(heard).toHaveBeenCalled();

    step.back(STILL);
    expect(glides.at(-1)?.to).toEqual(HOME);
    // The move eases along the bounded path, as a tour's step does.
    expect(glides.at(-1)?.duration).toBeGreaterThan(0);
    expect(step.getState().looked).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(step.getState().looked).toBe(false);
  });

  it('tells the tour’s own moves from the person’s', () => {
    const { canvas } = fakeCanvas();
    const step = new StepCamera();
    step.attach(canvas);
    // The step's camera glides there for 600 ms: what moves the camera meanwhile is the tour's.
    step.arrive({ x: -200, y: 0, scale: 1 }, 600);
    canvas.person({ x: -100, y: 0, scale: 1 });
    canvas.person({ x: -200, y: 0, scale: 1 });
    vi.advanceTimersByTime(700);
    expect(step.getState().looked).toBe(false);
  });

  it('sees the person move the camera during the tour’s move, once the move should have ended', () => {
    const { canvas } = fakeCanvas();
    const step = new StepCamera();
    step.attach(canvas);
    step.arrive({ x: -200, y: 0, scale: 1 }, 600);
    canvas.person({ x: 50, y: 0, scale: 1.5 });
    vi.advanceTimersByTime(700);
    expect(step.getState().looked).toBe(true);
  });

  it('sees nothing while the step has no camera of its own yet, as on its way to another view', () => {
    const { canvas } = fakeCanvas();
    const step = new StepCamera();
    step.attach(canvas);
    step.arrive(HOME, 0);
    vi.advanceTimersByTime(100);
    step.leave();
    canvas.person({ x: 400, y: 0, scale: 0.5 });
    expect(step.getState().looked).toBe(false);
    step.back(STILL);
    expect(step.getState().looked).toBe(false);
  });

  it('cuts back with a cross-fade under reduced motion, and plainly with fades off', () => {
    const { canvas, glides, captures } = fakeCanvas();
    const step = new StepCamera();
    step.attach(canvas);
    step.arrive(HOME, 0);
    vi.advanceTimersByTime(100);
    canvas.person({ x: -300, y: 0, scale: 1 });
    step.back({ reduced: true, fades: true });
    expect(glides.at(-1)?.duration).toBe(0);
    expect(captures.at(-1)?.fadeOut).toHaveBeenCalledWith(TOUR_CROSS_FADE, { afterFrame: true });
    vi.advanceTimersByTime(100);
    canvas.person({ x: -300, y: 0, scale: 1 });
    const before = captures.length;
    step.back({ reduced: true, fades: false });
    expect(captures).toHaveLength(before);
  });

  describe('following the scenario a step with a camera plays', () => {
    it('brings a scenario’s step outside the step’s camera into view, and back inside it', () => {
      const { canvas, glides } = fakeCanvas();
      const step = new StepCamera();
      step.attach(canvas);
      step.arrive(HOME, 0);
      vi.advanceTimersByTime(100);
      // Inside the step's camera: nothing moves.
      step.follow({ x: 100, y: 100, width: 200, height: 100 }, STILL);
      expect(glides).toHaveLength(0);
      // Outside it: the camera brings it into view, at the same zoom.
      step.follow({ x: 1500, y: 100, width: 200, height: 100 }, STILL);
      expect(glides).toHaveLength(1);
      expect(glides[0]?.to.scale).toBe(1);
      vi.advanceTimersByTime(1000);
      expect(step.getState().looked).toBe(false);
      // Back inside the step's camera: it goes back to it.
      step.follow({ x: 100, y: 100, width: 200, height: 100 }, STILL);
      expect(glides.at(-1)?.to).toEqual(HOME);
    });

    it('leaves the camera to the person once they looked around, until Back to the step', () => {
      const { canvas, glides } = fakeCanvas();
      const step = new StepCamera();
      step.attach(canvas);
      step.arrive(HOME, 0);
      vi.advanceTimersByTime(100);
      canvas.person({ x: 0, y: -400, scale: 1 });
      step.follow({ x: 1500, y: 100, width: 200, height: 100 }, STILL);
      expect(glides).toHaveLength(0);
      step.back(STILL);
      vi.advanceTimersByTime(1000);
      step.follow({ x: 1500, y: 100, width: 200, height: 100 }, STILL);
      expect(glides).toHaveLength(2);
    });

    it('counts each time the step’s camera comes, and each time a move following it stops', () => {
      const { canvas } = fakeCanvas();
      const step = new StepCamera();
      step.attach(canvas);
      step.arrive(HOME, 0);
      vi.advanceTimersByTime(100);
      expect(step.getState()).toEqual({ looked: false, arrived: 1, stopped: 0 });
      step.follow({ x: 1500, y: 100, width: 200, height: 100 }, STILL);
      vi.advanceTimersByTime(1000);
      expect(step.getState()).toEqual({ looked: false, arrived: 1, stopped: 1 });
      canvas.person({ x: 0, y: -900, scale: 1 });
      step.back(STILL);
      vi.advanceTimersByTime(1000);
      expect(step.getState()).toEqual({ looked: false, arrived: 2, stopped: 1 });
    });
  });

  it('lets everything go when the tour ends', () => {
    const { canvas } = fakeCanvas();
    const step = new StepCamera();
    step.attach(canvas);
    step.arrive(HOME, 0);
    vi.advanceTimersByTime(100);
    canvas.person({ x: -300, y: 0, scale: 1 });
    step.end();
    expect(step.getState().looked).toBe(false);
    step.attach(undefined);
    canvas.person({ x: 0, y: 0, scale: 2 });
    expect(step.getState().looked).toBe(false);
  });
});
