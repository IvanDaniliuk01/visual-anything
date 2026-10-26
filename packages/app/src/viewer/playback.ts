/**
 * Playing scenarios in a read-only page: which scenario is open, the step it is on, whether it plays
 * and how fast. It is the app's scenario session without recording (ADR 0031): the same playback, from
 * the core's timeline and playback functions, and the same state, so that the view state, the
 * playback emphasis and the address read it as they read the app's. Nothing it does is stored.
 */
import {
  PLAYBACK_START,
  advance,
  entryOfStep,
  goTo,
  isFinished,
  next,
  pause,
  play,
  previous,
  type Playback,
  type ProjectSnapshot,
  type Speed,
  type Timeline,
} from '@visual-anything/core';
import type { Id, ScenarioFile } from '@visual-anything/schema';
import type { Clock, PlaybackGuidance, ScenarioState } from '../scenarios/session';

/** What the session needs to know of the page. */
export interface PlaybackContext {
  project: ProjectSnapshot;
  /** The view open on the canvas. */
  viewId: Id | undefined;
  /** The open scenario's timeline over its view, when its view is the one open. */
  timeline: Timeline | undefined;
}

const FRAME_CLOCK: Clock = {
  now: () => performance.now(),
  request: (callback) =>
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(callback)
      : (setTimeout(callback, 16) as unknown as number),
  cancel: (handle) => {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
    else clearTimeout(handle);
  },
};

/** How much time one frame moves playback on, at most, in milliseconds. */
const MAX_FRAME_TIME = 100;

const INITIAL: ScenarioState = {
  scenario: undefined,
  recording: false,
  canRecord: false,
  step: 0,
  mode: 'paused',
  speed: 1,
  // The read-only page does not bring the step it plays into view (`scenarios/follow.ts`).
  asks: 0,
};

export class PlaybackSession {
  private state: ScenarioState = INITIAL;
  private emitted: ScenarioState = INITIAL;
  private playback: Playback = PLAYBACK_START;
  private context: PlaybackContext | undefined;
  private readonly listeners = new Set<() => void>();
  private readonly frameListeners = new Set<() => void>();
  private frame: number | undefined;
  private lastFrame: number | undefined;
  /** What an address asked of playback, waiting for the scenario's timeline until the next sync. */
  private guided: PlaybackGuidance | undefined;

  constructor(private readonly clock: Clock = FRAME_CLOCK) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getState = (): ScenarioState => this.state;

  /** Listens to every frame of playback, for the marker. */
  readonly subscribeFrame = (listener: () => void): (() => void) => {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  };

  /** How long the entry playback is on has played, at normal speed. */
  readonly getElapsed = (): number => this.playback.elapsed;

  get position(): Playback {
    return this.playback;
  }

  /** Whether playback has played the last step to its end. */
  get finished(): boolean {
    const timeline = this.context?.timeline;
    return timeline !== undefined && isFinished(this.playback, timeline);
  }

  /** Takes in the page as it is now: the project, the open view, and the open scenario's timeline. */
  sync(context: PlaybackContext): void {
    this.context = context;
    if (!context.timeline) this.playback = pause(this.playback);
    this.publish();
    this.keepMoving();
    this.applyGuided();
  }

  /**
   * Does what an address asks of playback: opens its scenario, which goes to its first step, paused,
   * then goes to the step it names once the scenario's view is open.
   */
  guide(request: PlaybackGuidance): void {
    const opening = request.action === 'open' || this.state.scenario !== request.scenario;
    if (opening) this.open(request.scenario);
    this.guided = request.action === 'open' ? undefined : request;
    if (!opening && this.context?.timeline) this.applyGuided();
  }

  /** Goes to the entry that plays a step, by the step's index among the scenario's steps. */
  goToStep(step: number): void {
    const timeline = this.context?.timeline;
    const entry = timeline ? entryOfStep(timeline, step) : undefined;
    if (entry !== undefined) this.goTo(entry);
  }

  /** Opens a scenario, at its first step, paused. */
  open(id: Id): void {
    this.reset(id);
  }

  close(): void {
    this.reset(undefined);
  }

  play(): void {
    const timeline = this.context?.timeline;
    if (timeline) this.move(play(this.playback, timeline));
  }

  pause(): void {
    this.move(pause(this.playback));
  }

  /** Plays when paused, and pauses when playing. */
  toggle(): void {
    if (this.playback.mode === 'playing') this.pause();
    else this.play();
  }

  next(): void {
    const timeline = this.context?.timeline;
    if (timeline) this.move(next(this.playback, timeline));
  }

  previous(): void {
    const timeline = this.context?.timeline;
    if (timeline) this.move(previous(this.playback, timeline));
  }

  /** Goes to an entry of the timeline. */
  goTo(entry: number): void {
    const timeline = this.context?.timeline;
    if (timeline) this.move(goTo(this.playback, timeline, entry));
  }

  setSpeed(speed: Speed): void {
    if (speed === this.state.speed) return;
    this.state = { ...this.state, speed };
    this.publish();
  }

  /** Stops the clock, as when the page's controls go; playback goes on once something moves it. */
  stop(): void {
    if (this.frame !== undefined) this.clock.cancel(this.frame);
    this.frame = undefined;
    this.lastFrame = undefined;
  }

  /** The scenario open, as the project holds it. */
  openScenario(): ScenarioFile | undefined {
    const { scenario } = this.state;
    if (scenario === undefined) return undefined;
    return this.context?.project.scenarios.find((each) => each.id === scenario);
  }

  private applyGuided(): void {
    const guided = this.guided;
    if (!guided) return;
    this.guided = undefined;
    const scenario = this.openScenario();
    if (scenario?.id !== guided.scenario || !this.context?.timeline) return;
    switch (guided.action) {
      case 'open':
        return;
      case 'play':
        this.play();
        return;
      case 'pause':
        this.pause();
        return;
      case 'go-to-step':
        this.goToStep(guided.step ?? 0);
        return;
      case 'next-step':
        this.next();
        return;
      case 'previous-step':
        this.previous();
        return;
    }
  }

  private reset(scenario: Id | undefined): void {
    this.stop();
    this.playback = PLAYBACK_START;
    this.guided = undefined;
    this.state = { ...this.state, scenario };
    this.publish();
    this.emitFrame();
  }

  private move(playback: Playback): void {
    this.playback = playback;
    this.publish();
    this.emitFrame();
    this.keepMoving();
  }

  private publish(): void {
    const { step, mode } = this.playback;
    const shown = this.state;
    if (shown.step !== step || shown.mode !== mode) this.state = { ...shown, step, mode };
    if (this.state === this.emitted) return;
    this.emitted = this.state;
    for (const listener of this.listeners) listener();
  }

  private emitFrame(): void {
    for (const listener of this.frameListeners) listener();
  }

  private keepMoving(): void {
    if (this.playback.mode === 'paused' || !this.context?.timeline) {
      this.stop();
      return;
    }
    if (this.frame !== undefined) return;
    this.lastFrame ??= this.clock.now();
    this.frame = this.clock.request(this.onFrame);
  }

  private readonly onFrame = (): void => {
    this.frame = undefined;
    const now = this.clock.now();
    // A frame that comes late, as after the tab was hidden, counts as one frame.
    const passed = Math.min(now - (this.lastFrame ?? now), MAX_FRAME_TIME);
    this.lastFrame = now;
    const timeline = this.context?.timeline;
    if (!timeline) {
      this.stop();
      return;
    }
    this.playback = advance(this.playback, timeline, passed, this.state.speed);
    this.publish();
    this.emitFrame();
    if (this.playback.mode === 'paused') this.lastFrame = undefined;
    else this.frame = this.clock.request(this.onFrame);
  };
}
