/**
 * A tour step's camera on the canvas (ADR 0077): where the step put it, whether the person has looked
 * around since, and the moves the tour makes for the step after it came.
 *
 * - **Looking around.** The person may pan and zoom during a step. A camera that moves when no move
 *   of the tour's is under way, or that is not where the tour's last move left it once that move
 *   should have ended, was moved by the person: the stage then offers Back to the step, which gives
 *   the step's camera back with the tour's bounded move.
 * - **Following a scenario.** In a step with a camera that plays a scenario, each of the scenario's
 *   steps that falls outside the step's camera comes into view with the same bounded move, and one
 *   inside it takes the camera back to the step's. Once the person looked around, playback leaves
 *   the camera to them until Back to the step.
 *
 * It lives outside React's state, like the tour's transitions, and draws nothing.
 */
import { TOUR_CROSS_FADE } from '@visual-anything/core';
import type { Camera } from '../canvas/camera';
import type { Rect } from '../canvas/geometry';
import { followCamera } from '../scenarios/follow';
import { tourGlide, type CanvasCamera } from '../view-state/canvas';
import type { TransitionTimers } from './transition';

/** What the step's camera needs of the canvas. */
export type StepCanvas = Pick<
  CanvasCamera,
  'camera' | 'viewport' | 'subscribe' | 'glideTo' | 'capture'
>;

/** How the tour's moves go: whether motion is reduced, and whether a cut cross-fades. */
export interface StepMotion {
  reduced: boolean;
  fades: boolean;
}

/** What the stage shows of the step's camera. */
export interface StepCameraState {
  /** Whether the person panned or zoomed since the step came, so that Back to the step is offered. */
  looked: boolean;
  /**
   * How many times the camera stopped where a step, or Back to the step, put it, so that the caption
   * takes its side afresh.
   */
  arrived: number;
  /** How many of the moves following a scenario have stopped, so that the caption looks again. */
  stopped: number;
}

/** How long after a move should have ended the camera may still be finishing it, in milliseconds. */
const SLACK = 50;

const BROWSER_TIMERS: TransitionTimers = {
  now: () => performance.now(),
  after: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
};

const START: StepCameraState = { looked: false, arrived: 0, stopped: 0 };

/** Whether a move of the tour's brings the step's own camera, or follows a scenario's step. */
type MoveKind = 'arrival' | 'follow';

export class StepCamera {
  #state: StepCameraState = START;
  readonly #listeners = new Set<() => void>();
  #canvas: StepCanvas | undefined;
  #stopListening: (() => void) | undefined;
  /** The step's own camera, once it came; none on the way. */
  #home: Camera | undefined;
  /** Where the tour's last move leaves the camera. */
  #expected: Camera | undefined;
  /** Until when the camera's changes are the tour's move. */
  #busyUntil = 0;
  /** While the tour itself asks the canvas to move. */
  #moving = false;
  #check: (() => void) | undefined;

  constructor(private readonly clock: TransitionTimers = BROWSER_TIMERS) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly getState = (): StepCameraState => this.#state;

  /** Follows this canvas's camera from now on, or none. */
  attach(canvas: StepCanvas | undefined): void {
    if (canvas === this.#canvas) return;
    this.#stopListening?.();
    this.#stopListening = undefined;
    this.#canvas = canvas;
    if (canvas) this.#stopListening = canvas.subscribe(() => this.#moved());
  }

  /** The tour leaves the step: until the next one's camera comes, nothing the camera does is looked at. */
  leave(): void {
    this.#home = undefined;
    this.#expected = undefined;
    this.#cancelCheck();
    this.#set({ ...this.#state, looked: false });
  }

  /** The step's move takes the camera to `home`, and is over `within` milliseconds from now. */
  arrive(home: Camera, within: number): void {
    this.#home = home;
    this.#set({ ...this.#state, looked: false });
    this.#busy(home, this.clock.now() + Math.max(0, within), 'arrival');
  }

  /**
   * A scenario's step the step plays is at `bounds` now: it comes into view when it falls outside the
   * step's camera, and the camera goes back to the step's when it falls inside, unless the person
   * looked around.
   */
  follow(bounds: Rect | undefined, motion: StepMotion): void {
    const home = this.#home;
    const canvas = this.#canvas;
    const camera = canvas?.camera();
    if (!home || !canvas || !camera || !bounds || this.#state.looked) return;
    const viewport = canvas.viewport();
    const inside = followCamera(home, viewport, bounds) === undefined;
    const to = inside
      ? nearlySame(camera, home)
        ? undefined
        : home
      : followCamera(camera, viewport, bounds);
    if (to) this.#move(to, motion, 'follow');
  }

  /** Back to the step: the step's camera, with the tour's bounded move. */
  back(motion: StepMotion): void {
    const home = this.#home;
    if (!home) return;
    this.#set({ ...this.#state, looked: false });
    const camera = this.#canvas?.camera();
    if (camera && nearlySame(camera, home)) {
      this.#expected = home;
      this.#set({ ...this.#state, arrived: this.#state.arrived + 1 });
      return;
    }
    this.#move(home, motion, 'arrival');
  }

  /** The tour ended: the step's camera is let go. */
  end(): void {
    this.leave();
  }

  #move(to: Camera, motion: StepMotion, kind: MoveKind): void {
    const canvas = this.#canvas;
    if (!canvas) return;
    const viewport = canvas.viewport();
    const { move, along } = tourGlide(canvas.camera(), to, viewport, {
      reducedMotion: motion.reduced,
      sameView: true,
    });
    if (move === 'stay') return;
    const duration = move.kind === 'ease' ? move.duration : 0;
    // A cut cross-fades from the frame before, once the canvas has drawn where it went.
    if (move.kind === 'cut' && motion.fades) {
      canvas.capture?.()?.fadeOut(TOUR_CROSS_FADE, { afterFrame: true });
    }
    this.#busy(to, this.clock.now() + duration, kind);
    this.#moving = true;
    try {
      canvas.glideTo(to, duration, along ? { along } : undefined);
    } finally {
      this.#moving = false;
    }
  }

  /** The tour's move leaves the camera at `to` by `until`: then it looks whether it is there. */
  #busy(to: Camera, until: number, kind: MoveKind): void {
    this.#expected = to;
    this.#busyUntil = until + SLACK;
    this.#cancelCheck();
    const wait = Math.max(0, this.#busyUntil - this.clock.now());
    this.#check = this.clock.after(wait, () => {
      this.#check = undefined;
      const camera = this.#canvas?.camera();
      if (!this.#home || !camera || !this.#expected) return;
      if (!nearlySame(camera, this.#expected)) {
        this.#set({ ...this.#state, looked: true });
      } else if (kind === 'arrival') {
        this.#set({ ...this.#state, arrived: this.#state.arrived + 1 });
      } else {
        this.#set({ ...this.#state, stopped: this.#state.stopped + 1 });
      }
    });
  }

  /** The camera moved: unless the tour moved it, or still does, the person did. */
  #moved(): void {
    if (this.#moving || !this.#home || this.#state.looked) return;
    if (this.clock.now() < this.#busyUntil) return;
    const camera = this.#canvas?.camera();
    if (camera && this.#expected && !nearlySame(camera, this.#expected)) {
      this.#set({ ...this.#state, looked: true });
    }
  }

  #cancelCheck(): void {
    this.#check?.();
    this.#check = undefined;
  }

  #set(state: StepCameraState): void {
    const now = this.#state;
    if (
      state.looked === now.looked &&
      state.arrived === now.arrived &&
      state.stopped === now.stopped
    ) {
      return;
    }
    this.#state = state;
    for (const listener of [...this.#listeners]) listener();
  }
}

/** Whether two cameras show the same, within half a pixel and a thousandth of their zoom. */
function nearlySame(a: Camera, b: Camera): boolean {
  return (
    Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.scale / b.scale - 1) < 1e-3
  );
}
