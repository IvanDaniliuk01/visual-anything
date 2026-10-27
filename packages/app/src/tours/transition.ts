/**
 * A tour's transition on the canvas, stage by stage (ADR 0077), as the core's `tourTransition` times
 * it:
 *
 * - **Out:** a capture of the frame before fades out over what the new step hides or dims, and the
 *   old caption fades out.
 * - **Camera:** the camera waits for the out stage, then moves along its path; or, where it cuts,
 *   a capture of the frame as the out stage left it is held over the cut until the canvas has drawn
 *   where it went, and then cross-fades. Into another view, or under reduced motion, the frame before
 *   is held from the start.
 * - **In:** the step's marks fade in by the opacity of their halos, and the new caption fades in.
 *
 * A press during a transition finishes it at once, the camera where it goes, before the next starts:
 * transitions never queue. A reveal fades its marks in; taking one away fades out a capture of the
 * frame that showed it. With fades off, the fades take no time and a cut is plain.
 *
 * It lives outside React's state, like the tour player: the tour's playback tells it when a step or a
 * reveal comes and how the camera moves, and reads where its caption and marks are.
 */
import {
  TOUR_CROSS_FADE,
  TOUR_FADE_IN,
  TOUR_FADE_OUT,
  tourTransition,
  type TourMove,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { Camera } from '../canvas/camera';
import { MAX_CAPTURE_WAIT, type FrameCapture } from '../canvas/capture';
import type { TravelGlide } from '../view-state/applier';
import type { CanvasCamera } from '../view-state/canvas';

/** Where the card's caption is: fading out, away until the in stage, fading in, or shown. */
export type CaptionPhase = 'out' | 'away' | 'in' | 'shown';

/** Where the step's marks are: waiting for the in stage, fading in, or in. */
export type MarksPhase = 'waiting' | 'arriving' | 'in';

/** Where a transition is. */
export interface TransitionState {
  /** What it goes to, as its caller names a step and its reveals; none outside a tour. */
  target: string | undefined;
  /** The step whose caption shows: the one left while it fades out, then the one come to. */
  caption: number | undefined;
  phase: CaptionPhase;
  /** How long the caption's fade takes now, in milliseconds. */
  fade: number;
  marks: MarksPhase;
  /** How long the marks take to fade in while they arrive, in milliseconds. */
  arriving: number;
  /** What was marked before that the step marks too, which stays as it is meanwhile. */
  kept: readonly Id[];
}

/** The clock a transition goes by: the browser's by default. */
export interface TransitionTimers {
  now(): number;
  /** Runs `run` in `ms` milliseconds; the function it returns cancels it. */
  after(ms: number, run: () => void): () => void;
}

/** What a transition needs of the canvas. */
export type TransitionCanvas = Pick<CanvasCamera, 'capture' | 'setCamera'>;

/** A step a tour comes to. */
export interface StepRequest {
  target: string;
  /** The index of the step come to, and of the one left: none for the first step shown. */
  step: number;
  from?: number;
  kept: readonly Id[];
  canvas: TransitionCanvas | undefined;
  fades: boolean;
  /** Whether the camera cuts whatever its move: into another view, or under reduced motion. */
  cuts: boolean;
  /** Whether a move of the camera will come: not when the step's view is gone, or without a canvas. */
  moves: boolean;
}

/** A reveal a tour's step brings in, or takes away. */
export interface RevealRequest {
  target: string;
  step: number;
  kept: readonly Id[];
  canvas: TransitionCanvas | undefined;
  fades: boolean;
  /** Whether it brings a reveal in, rather than taking the last one away. */
  forward: boolean;
  /** Whether what is dimmed changes with it, as with `dimRest`. */
  dims: boolean;
}

const IDLE: TransitionState = {
  target: undefined,
  caption: undefined,
  phase: 'shown',
  fade: 0,
  marks: 'in',
  arriving: 0,
  kept: [],
};

const BROWSER_TIMERS: TransitionTimers = {
  now: () => performance.now(),
  after: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
};

/** A step's transition waiting for its move. */
interface Pending {
  /** When its out stage started. */
  start: number;
  fades: boolean;
  canvas: TransitionCanvas | undefined;
}

export class TourTransitions {
  #state: TransitionState = IDLE;
  readonly #listeners = new Set<() => void>();
  #timers: (() => void)[] = [];
  #captures: FrameCapture[] = [];
  /** The frame before, held from the start for a cut sure to come. */
  #held: FrameCapture | undefined;
  #pending: Pending | undefined;
  /** Where the camera glides, until when, and on which canvas, to finish it at once. */
  #glide: { to: Camera; until: number; canvas: TransitionCanvas } | undefined;
  /** The step come to, and whether its caption showed from the start. */
  #step = 0;
  #first = false;

  constructor(private readonly clock: TransitionTimers = BROWSER_TIMERS) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly getState = (): TransitionState => this.#state;

  /** A step's transition starts now, finishing the one under way. */
  begin(request: StepRequest): void {
    this.finish();
    const { fades, canvas, from } = request;
    const now = this.clock.now();
    const out = fades ? TOUR_FADE_OUT : 0;
    this.#step = request.step;
    this.#first = from === undefined;
    this.#set({
      target: request.target,
      caption: this.#first || out === 0 ? request.step : from,
      phase: this.#first ? 'shown' : out > 0 ? 'out' : 'away',
      fade: this.#first ? 0 : out,
      marks: 'waiting',
      arriving: 0,
      kept: request.kept,
    });
    if (!this.#first) {
      const capture = fades ? this.#capture(canvas) : undefined;
      if (capture && request.cuts) {
        capture.hold();
        this.#held = capture;
      } else capture?.fadeOut(out);
      if (out > 0) {
        this.#after(out, () => {
          if (this.#state.phase === 'out') {
            this.#set({ ...this.#state, caption: this.#step, phase: 'away', fade: 0 });
          }
        });
      }
    }
    // The first step has nothing to fade out: its camera moves at once.
    this.#pending = { start: this.#first ? now - out : now, fades, canvas };
    if (!request.moves) {
      this.#settle('stay', undefined, undefined);
      return;
    }
    // A move that never comes, as when the canvas cannot draw the step, does not keep it waiting.
    this.#after(out + MAX_CAPTURE_WAIT, () => {
      if (this.#pending) this.#settle('stay', undefined, undefined);
    });
  }

  /**
   * How the camera gets to the step, once the canvas knows where it goes: it waits for the out stage
   * and moves along `along`, or cuts under a capture that cross-fades once the canvas has drawn
   * there. Outside a step's transition, as when the tours panel shows a step, it moves at once.
   */
  move(
    move: TourMove | 'stay',
    to: Camera,
    options: {
      along?: (part: number) => Camera;
      canvas?: TransitionCanvas | undefined;
      fades: boolean;
    },
  ): TravelGlide {
    const { along } = options;
    if (this.#pending) return this.#settle(move, to, along);
    if (move === 'stay') return { duration: 0 };
    if (move.kind === 'ease') return { duration: move.duration, ...(along ? { along } : {}) };
    if (options.fades) options.canvas?.capture?.()?.fadeOut(TOUR_CROSS_FADE, { afterFrame: true });
    return { duration: 0 };
  }

  /** A reveal comes in, or the last one goes, finishing what is under way. */
  reveal(request: RevealRequest): void {
    this.finish();
    const { fades, forward } = request;
    this.#step = request.step;
    this.#first = false;
    const duration = fades ? (forward ? TOUR_FADE_IN : TOUR_FADE_OUT) : 0;
    // What goes, and dimming that changes, fade under the frame that showed them.
    if (duration > 0 && (!forward || request.dims))
      this.#capture(request.canvas)?.fadeOut(duration);
    const arriving = forward && duration > 0;
    this.#set({
      target: request.target,
      caption: request.step,
      phase: 'shown',
      fade: 0,
      marks: arriving ? 'arriving' : 'in',
      arriving: arriving ? duration : 0,
      kept: request.kept,
    });
    if (arriving)
      this.#after(duration, () => this.#set({ ...this.#state, marks: 'in', arriving: 0 }));
  }

  /** Finishes at once what is under way: the camera where it goes, the captures gone, all shown. */
  finish(): void {
    for (const stop of this.#timers.splice(0)) stop();
    for (const capture of this.#captures.splice(0)) capture.drop();
    this.#held = undefined;
    this.#pending = undefined;
    const glide = this.#glide;
    this.#glide = undefined;
    if (glide && this.clock.now() < glide.until) glide.canvas.setCamera(glide.to);
    const state = this.#state;
    if (state.target === undefined) return;
    if (
      state.caption !== this.#step ||
      state.phase !== 'shown' ||
      state.marks !== 'in' ||
      state.fade !== 0
    ) {
      this.#set({
        ...state,
        caption: this.#step,
        phase: 'shown',
        fade: 0,
        marks: 'in',
        arriving: 0,
      });
    }
  }

  /** The tour ended: everything goes. */
  end(): void {
    this.finish();
    this.#set(IDLE);
  }

  /** Times the camera's and the in stage from the move now known. */
  #settle(
    move: TourMove | 'stay',
    to: Camera | undefined,
    along: ((part: number) => Camera) | undefined,
  ): TravelGlide {
    const pending = this.#pending as Pending;
    this.#pending = undefined;
    const now = this.clock.now();
    const plan = tourTransition(move, { fades: pending.fades });
    const cameraStart = Math.max(pending.start + plan.camera.start, now);
    const inAfter = plan.in.start - plan.camera.start;
    const comeIn = () => this.#in(plan.in.duration);
    const held = this.#held;
    this.#held = undefined;
    if (move !== 'stay' && move.kind === 'cut') {
      const capture = pending.fades ? (held ?? this.#capture(pending.canvas)) : undefined;
      if (capture) {
        capture.fadeOut(plan.camera.duration, {
          notBefore: cameraStart,
          afterFrame: true,
          started: () => this.#at(this.clock.now() + inAfter, comeIn),
        });
      } else this.#at(cameraStart + inAfter, comeIn);
      return { duration: 0 };
    }
    // A frame held for a cut that did not come fades as the out stage would have faded it.
    held?.fadeOut(Math.max(0, pending.start + plan.out.duration - now));
    this.#at(cameraStart + inAfter, comeIn);
    if (move === 'stay') return { duration: 0 };
    if (to && pending.canvas) {
      this.#glide = { to, until: cameraStart + move.duration, canvas: pending.canvas };
    }
    return { duration: move.duration, delay: cameraStart - now, ...(along ? { along } : {}) };
  }

  /** The in stage: the marks and the new caption fade in. */
  #in(duration: number): void {
    const fading = duration > 0;
    this.#set({
      ...this.#state,
      caption: this.#step,
      phase: this.#first || !fading ? 'shown' : 'in',
      fade: this.#first || !fading ? 0 : duration,
      marks: fading ? 'arriving' : 'in',
      arriving: fading ? duration : 0,
    });
    if (fading) {
      this.#after(duration, () =>
        this.#set({ ...this.#state, phase: 'shown', fade: 0, marks: 'in', arriving: 0 }),
      );
    }
  }

  #capture(canvas: TransitionCanvas | undefined): FrameCapture | undefined {
    const capture = canvas?.capture?.();
    if (capture) this.#captures.push(capture);
    return capture;
  }

  #after(ms: number, run: () => void): void {
    this.#timers.push(this.clock.after(ms, run));
  }

  /** Runs `run` at a time of the clock: at once when it has come. */
  #at(time: number, run: () => void): void {
    const wait = time - this.clock.now();
    if (wait > 0) this.#after(wait, run);
    else run();
  }

  #set(state: TransitionState): void {
    if (state === this.#state) return;
    this.#state = state;
    for (const listener of this.#listeners) listener();
  }
}
