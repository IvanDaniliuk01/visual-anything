import {
  MAX_TOUR_TRANSITION,
  TOUR_CROSS_FADE,
  TOUR_FADE_IN,
  TOUR_FADE_OUT,
  type TourMove,
} from '@visual-anything/core';
import { describe, expect, it, vi } from 'vitest';
import type { Camera } from '../canvas/camera';
import { MAX_CAPTURE_WAIT, type FrameCapture } from '../canvas/capture';
import { TourTransitions, type TransitionTimers } from './transition';

/** Timers that run only as the test moves the clock on. */
function manualTimers() {
  let time = 0;
  let timers: { at: number; run: () => void }[] = [];
  const clock: TransitionTimers = {
    now: () => time,
    after: (ms, run) => {
      const timer = { at: time + Math.max(0, ms), run };
      timers.push(timer);
      return () => {
        timers = timers.filter((each) => each !== timer);
      };
    },
  };
  return {
    clock,
    /** Moves the clock on to `to`, running the timers due on the way, in order. */
    to(to: number) {
      for (;;) {
        const due = timers.filter((each) => each.at <= to).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((each) => each !== due);
        time = Math.max(time, due.at);
        due.run();
      }
      time = to;
    },
  };
}

/** A canvas whose captures say what was asked of them. */
function fakeCanvas() {
  const captures: {
    hold: ReturnType<typeof vi.fn>;
    fadeOut: ReturnType<typeof vi.fn>;
    drop: ReturnType<typeof vi.fn>;
  }[] = [];
  const canvas = {
    setCamera: vi.fn(),
    capture: vi.fn(() => {
      const capture = { hold: vi.fn(), fadeOut: vi.fn(), drop: vi.fn() };
      captures.push(capture);
      return capture as unknown as FrameCapture;
    }),
  };
  return { canvas, captures };
}

const TO: Camera = { x: -400, y: 0, scale: 1 };
const along = (): Camera => TO;
const ease = (duration: number): TourMove => ({
  kind: 'ease',
  duration,
  path: { length: 1, zoomOut: 1, at: () => ({ x: 0, y: 0, zoom: 1 }) },
});
const CUT: TourMove = { kind: 'cut' };

function transitions() {
  const timers = manualTimers();
  const fake = fakeCanvas();
  const made = new TourTransitions(timers.clock);
  const step = (
    options: { cuts?: boolean; moves?: boolean; fades?: boolean; from?: number } = {},
  ) =>
    made.begin({
      target: 'step 1',
      step: 1,
      from: options.from ?? 0,
      kept: ['kept'],
      canvas: fake.canvas,
      fades: options.fades ?? true,
      cuts: options.cuts ?? false,
      moves: options.moves ?? true,
    });
  return { made, timers, ...fake, step };
}

describe('TourTransitions, from one step to the next', () => {
  it('comes in three stages: out, the camera along its path, then in', () => {
    const { made, timers, captures, step } = transitions();
    step();
    expect(made.getState()).toEqual({
      target: 'step 1',
      caption: 0,
      phase: 'out',
      fade: TOUR_FADE_OUT,
      marks: 'waiting',
      arriving: 0,
      kept: ['kept'],
    });
    // What the step hides or dims fades out under the frame before.
    expect(captures).toHaveLength(1);
    expect(captures[0]?.fadeOut).toHaveBeenCalledWith(TOUR_FADE_OUT);
    timers.to(5);
    // The camera waits for the out stage.
    expect(made.move(ease(500), TO, { along, fades: true })).toEqual({
      duration: 500,
      delay: TOUR_FADE_OUT - 5,
      along,
    });
    timers.to(TOUR_FADE_OUT);
    expect(made.getState()).toEqual(expect.objectContaining({ caption: 1, phase: 'away' }));
    timers.to(TOUR_FADE_OUT + 499);
    expect(made.getState().marks).toBe('waiting');
    timers.to(TOUR_FADE_OUT + 500);
    expect(made.getState()).toEqual(
      expect.objectContaining({
        caption: 1,
        phase: 'in',
        fade: TOUR_FADE_IN,
        marks: 'arriving',
        arriving: TOUR_FADE_IN,
      }),
    );
    timers.to(TOUR_FADE_OUT + 500 + TOUR_FADE_IN);
    expect(made.getState()).toEqual(
      expect.objectContaining({ phase: 'shown', fade: 0, marks: 'in' }),
    );
  });

  it('never lasts past 1.1 s: the marks come in before the longest move stops', () => {
    const { made, timers, step } = transitions();
    step();
    made.move(ease(800), TO, { along, fades: true });
    const arrives = TOUR_FADE_OUT + 800 + TOUR_FADE_IN - MAX_TOUR_TRANSITION;
    timers.to(TOUR_FADE_OUT + 800 - arrives - 1);
    expect(made.getState().marks).toBe('waiting');
    timers.to(TOUR_FADE_OUT + 800 - arrives);
    expect(made.getState().marks).toBe('arriving');
    timers.to(MAX_TOUR_TRANSITION);
    expect(made.getState().marks).toBe('in');
  });

  it('cross-fades where the camera cuts, once the canvas has drawn, and brings the marks in after', () => {
    const { made, timers, captures, step } = transitions();
    step();
    timers.to(10);
    expect(made.move(CUT, TO, { fades: true })).toEqual({ duration: 0 });
    // The frame as the out stage leaves it, held under the one still fading, until its stage.
    expect(captures).toHaveLength(2);
    const [, cut] = captures;
    expect(cut?.fadeOut).toHaveBeenCalledWith(TOUR_CROSS_FADE, {
      notBefore: TOUR_FADE_OUT,
      afterFrame: true,
      started: expect.any(Function) as () => void,
    });
    timers.to(400);
    expect(made.getState().marks).toBe('waiting');
    // The canvas drew where the camera went at 300 ms: the cross-fade starts then.
    const { started } = (cut?.fadeOut.mock.calls[0] as [number, { started: () => void }])[1];
    started();
    timers.to(400 + TOUR_CROSS_FADE - 1);
    expect(made.getState().marks).toBe('waiting');
    timers.to(400 + TOUR_CROSS_FADE);
    expect(made.getState().marks).toBe('arriving');
  });

  it('holds the frame before from the start into another view, until the cut has drawn', () => {
    const { made, captures, step } = transitions();
    step({ cuts: true });
    expect(captures).toHaveLength(1);
    expect(captures[0]?.hold).toHaveBeenCalled();
    expect(captures[0]?.fadeOut).not.toHaveBeenCalled();
    made.move(CUT, TO, { fades: true });
    expect(captures).toHaveLength(1);
    expect(captures[0]?.fadeOut).toHaveBeenCalledWith(
      TOUR_CROSS_FADE,
      expect.objectContaining({ notBefore: TOUR_FADE_OUT, afterFrame: true }),
    );
  });

  it('stays where two steps share their view state: only the marks and the caption change', () => {
    const { made, timers, canvas, step } = transitions();
    step();
    expect(made.move('stay', TO, { fades: true })).toEqual({ duration: 0 });
    timers.to(TOUR_FADE_OUT);
    expect(made.getState()).toEqual(expect.objectContaining({ phase: 'in', marks: 'arriving' }));
    expect(canvas.setCamera).not.toHaveBeenCalled();
  });

  it('lets a held frame fade as the out stage would where the camera stays after all', () => {
    const { made, timers, captures, step } = transitions();
    step({ cuts: true });
    timers.to(50);
    made.move('stay', TO, { fades: true });
    expect(captures[0]?.fadeOut).toHaveBeenCalledWith(TOUR_FADE_OUT - 50);
  });

  it('finishes at once when pressed during it, the camera where it goes, and starts the next', () => {
    const { made, timers, canvas, captures, step } = transitions();
    step();
    made.move(ease(500), TO, { along, fades: true });
    timers.to(300);
    made.finish();
    expect(canvas.setCamera).toHaveBeenCalledWith(TO);
    expect(captures[0]?.drop).toHaveBeenCalled();
    expect(made.getState()).toEqual(
      expect.objectContaining({ caption: 1, phase: 'shown', fade: 0, marks: 'in' }),
    );
    // Nothing of it goes on afterwards, and nothing queues.
    timers.to(5000);
    expect(made.getState()).toEqual(expect.objectContaining({ phase: 'shown', marks: 'in' }));
    step({ from: 1 });
    expect(made.getState().phase).toBe('out');
    expect(canvas.setCamera).toHaveBeenCalledTimes(1);
  });

  it('leaves the camera where it is when finished once it has arrived', () => {
    const { made, timers, canvas, step } = transitions();
    step();
    made.move(ease(300), TO, { along, fades: true });
    timers.to(TOUR_FADE_OUT + 300);
    made.finish();
    expect(canvas.setCamera).not.toHaveBeenCalled();
  });

  it('is instant with fades off, and its cut is plain', () => {
    const { made, captures, step } = transitions();
    step({ fades: false });
    expect(captures).toHaveLength(0);
    expect(made.getState()).toEqual(expect.objectContaining({ caption: 1, phase: 'away' }));
    expect(made.move(CUT, TO, { fades: false })).toEqual({ duration: 0 });
    expect(captures).toHaveLength(0);
    expect(made.getState()).toEqual(
      expect.objectContaining({ phase: 'shown', marks: 'in', arriving: 0 }),
    );
  });

  it('still moves the camera with fades off', () => {
    const { made, step } = transitions();
    step({ fades: false });
    expect(made.move(ease(400), TO, { along, fades: false })).toEqual({
      duration: 400,
      delay: 0,
      along,
    });
  });

  it('comes in after its out stage when the step moves no camera', () => {
    const { made, timers, step } = transitions();
    step({ moves: false });
    timers.to(TOUR_FADE_OUT);
    expect(made.getState().marks).toBe('arriving');
  });

  it('comes in anyway when the move it waits for never comes', () => {
    const { made, timers, captures, step } = transitions();
    step({ cuts: true });
    timers.to(TOUR_FADE_OUT + MAX_CAPTURE_WAIT - 1);
    expect(made.getState().marks).toBe('waiting');
    timers.to(TOUR_FADE_OUT + MAX_CAPTURE_WAIT);
    expect(made.getState().marks).toBe('arriving');
    expect(captures[0]?.fadeOut).toHaveBeenCalled();
  });

  it('shows the first step’s caption at once, with nothing to fade from', () => {
    const { made, timers, captures } = transitions();
    const fake = fakeCanvas();
    made.begin({
      target: 'step 0',
      step: 0,
      kept: [],
      canvas: fake.canvas,
      fades: true,
      cuts: false,
      moves: true,
    });
    expect(made.getState()).toEqual(
      expect.objectContaining({ caption: 0, phase: 'shown', marks: 'waiting' }),
    );
    expect(captures).toHaveLength(0);
    expect(fake.captures).toHaveLength(0);
    made.move(ease(300), TO, { along, fades: true });
    timers.to(300);
    expect(made.getState()).toEqual(expect.objectContaining({ phase: 'shown', marks: 'arriving' }));
  });

  it('lets everything go when the tour ends', () => {
    const { made, captures, step } = transitions();
    step();
    made.end();
    expect(captures[0]?.drop).toHaveBeenCalled();
    expect(made.getState().target).toBeUndefined();
  });
});

describe('TourTransitions, from one reveal to the next', () => {
  it('fades the reveal’s marks in, under a capture when the dimming changes', () => {
    const { made, timers, canvas, captures } = transitions();
    made.reveal({
      target: 'step 1 r1',
      step: 1,
      kept: ['a'],
      canvas,
      fades: true,
      forward: true,
      dims: false,
    });
    expect(captures).toHaveLength(0);
    expect(made.getState()).toEqual(
      expect.objectContaining({ marks: 'arriving', arriving: TOUR_FADE_IN, kept: ['a'] }),
    );
    timers.to(TOUR_FADE_IN);
    expect(made.getState().marks).toBe('in');
    made.reveal({
      target: 'step 1 r2',
      step: 1,
      kept: ['a'],
      canvas,
      fades: true,
      forward: true,
      dims: true,
    });
    expect(captures[0]?.fadeOut).toHaveBeenCalledWith(TOUR_FADE_IN);
  });

  it('takes the last reveal away by fading out the frame that showed it', () => {
    const { made, canvas, captures } = transitions();
    made.reveal({
      target: 'step 1 r0',
      step: 1,
      kept: [],
      canvas,
      fades: true,
      forward: false,
      dims: false,
    });
    expect(captures[0]?.fadeOut).toHaveBeenCalledWith(TOUR_FADE_OUT);
    expect(made.getState().marks).toBe('in');
  });

  it('is instant with fades off', () => {
    const { made, canvas, captures } = transitions();
    made.reveal({
      target: 'step 1 r1',
      step: 1,
      kept: [],
      canvas,
      fades: false,
      forward: true,
      dims: true,
    });
    expect(captures).toHaveLength(0);
    expect(made.getState().marks).toBe('in');
  });
});

describe('TourTransitions, outside a step’s transition', () => {
  it('moves as asked, and cross-fades a cut, as when the tours panel shows a step', () => {
    const { made, canvas, captures } = transitions();
    expect(made.move(ease(300), TO, { along, canvas, fades: true })).toEqual({
      duration: 300,
      along,
    });
    expect(made.move(CUT, TO, { canvas, fades: true })).toEqual({ duration: 0 });
    expect(captures[0]?.fadeOut).toHaveBeenCalledWith(TOUR_CROSS_FADE, { afterFrame: true });
    expect(made.move('stay', TO, { canvas, fades: true })).toEqual({ duration: 0 });
  });
});
