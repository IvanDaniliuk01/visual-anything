import { describe, expect, it, vi } from 'vitest';
import { FrameCapture, MAX_CAPTURE_WAIT, type CaptureClock } from './capture';

/** Frames and timers that run only when the test moves the clock on. */
function manualClock() {
  let time = 0;
  let frames: { handle: number; run: (time: number) => void }[] = [];
  let timers: { at: number; run: () => void }[] = [];
  let handles = 0;
  const clock: CaptureClock = {
    now: () => time,
    request: (run) => {
      handles += 1;
      frames.push({ handle: handles, run });
      return handles;
    },
    cancel: (handle) => {
      frames = frames.filter((each) => each.handle !== handle);
    },
    after: (ms, run) => {
      const timer = { at: time + ms, run };
      timers.push(timer);
      return () => {
        timers = timers.filter((each) => each !== timer);
      };
    },
  };
  return {
    clock,
    /** Moves the clock on to `to`, running the timers due on the way, then one frame. */
    advance(by: number) {
      time += by;
      for (;;) {
        const due = timers.filter((each) => each.at <= time).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((each) => each !== due);
        due.run();
      }
      const now = frames;
      frames = [];
      for (const frame of now) frame.run(time);
    },
    get frames() {
      return frames.length;
    },
  };
}

/** A canvas that draws a frame when the test says so. */
function drawnFrames() {
  const listeners = new Set<() => void>();
  return {
    drawn: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    draw: () => {
      const told = [...listeners];
      listeners.clear();
      for (const listener of told) listener();
    },
    get waiting() {
      return listeners.size;
    },
  };
}

function captured() {
  const host = document.createElement('div');
  const element = document.createElement('canvas');
  host.append(element);
  const manual = manualClock();
  const canvas = drawnFrames();
  const capture = new FrameCapture(element, manual.clock, canvas.drawn);
  return { host, element, manual, canvas, capture };
}

describe('FrameCapture', () => {
  it('fades out over the time it is given, then lets the frame go', () => {
    const { host, element, manual, capture } = captured();
    capture.fadeOut(200);
    manual.advance(0);
    expect(element.style.opacity).toBe('1');
    manual.advance(100);
    expect(Number(element.style.opacity)).toBeCloseTo(0.5);
    manual.advance(100);
    expect(host.contains(element)).toBe(false);
    expect(capture.gone).toBe(true);
    expect(manual.frames).toBe(0);
  });

  it('holds where it is, and fades on from there when asked', () => {
    const { element, manual, capture } = captured();
    capture.fadeOut(200);
    manual.advance(0);
    manual.advance(50);
    capture.hold();
    manual.advance(500);
    expect(Number(element.style.opacity)).toBeCloseTo(0.75);
    capture.fadeOut(300);
    manual.advance(0);
    manual.advance(150);
    expect(Number(element.style.opacity)).toBeCloseTo(0.375);
  });

  it('waits after a cut for the canvas to draw a frame, and for its stage, before it fades', () => {
    const { element, manual, canvas, capture } = captured();
    const started = vi.fn();
    capture.fadeOut(200, { afterFrame: true, notBefore: 150, started });
    manual.advance(100);
    canvas.draw();
    expect(started).not.toHaveBeenCalled();
    manual.advance(60);
    expect(started).toHaveBeenCalledTimes(1);
    manual.advance(100);
    expect(Number(element.style.opacity)).toBeLessThan(0.75);
    expect(canvas.waiting).toBe(0);
  });

  it('fades anyway once it has waited its longest for a frame', () => {
    const { manual, canvas, capture } = captured();
    const started = vi.fn();
    capture.fadeOut(200, { afterFrame: true, started });
    manual.advance(MAX_CAPTURE_WAIT - 1);
    expect(started).not.toHaveBeenCalled();
    manual.advance(1);
    expect(started).toHaveBeenCalledTimes(1);
    expect(canvas.waiting).toBe(0);
    manual.advance(200);
    expect(capture.gone).toBe(true);
  });

  it('goes at once when dropped, and at once when it has no time to fade', () => {
    const first = captured();
    first.capture.fadeOut(200, { afterFrame: true });
    first.capture.drop();
    expect(first.host.contains(first.element)).toBe(false);
    expect(first.canvas.waiting).toBe(0);
    const second = captured();
    const started = vi.fn();
    second.capture.fadeOut(0, { started });
    expect(started).toHaveBeenCalled();
    expect(second.capture.gone).toBe(true);
    // Gone, it does nothing more.
    second.capture.fadeOut(200);
    second.capture.hold();
    expect(second.manual.frames).toBe(0);
  });
});
