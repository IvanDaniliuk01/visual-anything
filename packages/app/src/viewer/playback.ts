/**
 * Playing scenarios in a read-only page: which scenario is open, the step it is on, whether it plays
 * and how fast, and the alternative chosen at each of its decisions (ADR 0078). It is the app's
 * scenario session without recording (ADR 0031): the same playback, from the core's timeline and
 * playback functions, and the same state, so that the view state, the playback emphasis and the
 * address read it as they read the app's. Nothing it does is stored.
 */
import {
  PLAYBACK_START,
  STEP_TIME,
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
import type { DecisionChoices, Id, ScenarioFile } from '@visual-anything/schema';
import {
  AFTER_STEP,
  NO_CHOICES,
  alternativesChanged,
  choicesReaching,
  decisionAhead,
  sayChosen,
  sayReached,
  sayStopped,
  stepAfterChoice,
  withChoice,
  wordsOf,
  type Chosen,
} from '../scenarios/choosing';
import type { Clock, PlaybackGuidance, ScenarioState } from '../scenarios/session';

/** What the session needs to know of the page. */
export interface PlaybackContext {
  project: ProjectSnapshot;
  /** The view open on the canvas. */
  viewId: Id | undefined;
  /** The open scenario's timeline over its view, when its view is the one open. */
  timeline: Timeline | undefined;
  /** The choices the timeline was worked out with, the session's own; none for none. */
  choices?: DecisionChoices;
  /** Whether a tour plays, which plays its own range: Stop at each decision waits until it ends. */
  touring?: boolean;
  /** Says something to screen readers. */
  announce?: (message: string) => void;
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
  choices: NO_CHOICES,
  stopAtDecisions: false,
  previewing: undefined,
  place: AFTER_STEP,
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
  /** The step Stop at each decision last paused after, which playing on from there passes. */
  private stoppedAfter: number | undefined;

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
    const timeline = this.timeline();
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
   * Does what an address or a tour's step asks of playback: opens its scenario, which goes to its
   * first step, paused, then goes to the step it names once the scenario's view is open. The choices
   * it gives replace the page's, a decision they do not name playing its default (ADR 0078).
   */
  guide(request: PlaybackGuidance): void {
    const opening = request.action === 'open' || this.state.scenario !== request.scenario;
    if (opening) this.open(request.scenario);
    if (request.choices !== undefined && request.action !== 'choose') {
      this.replaceChoices(request.choices);
    }
    this.guided = request.action === 'open' ? undefined : request;
    if (!opening && this.timeline()) this.applyGuided();
  }

  /** Makes these the choices, and says which alternatives they change; a new timeline comes next. */
  private replaceChoices(choices: DecisionChoices): void {
    const scenario = this.openScenario();
    const before = this.state.choices;
    const changed = scenario ? alternativesChanged(scenario, before, choices) : [];
    const same =
      Object.keys(before).length === Object.keys(choices).length &&
      Object.entries(choices).every(([decision, alternative]) => before[decision] === alternative);
    if (same) return;
    this.setChoices(Object.keys(choices).length === 0 ? NO_CHOICES : { ...choices });
    if (scenario && changed.length > 0) this.context?.announce?.(sayReached(scenario, changed));
    this.publish();
  }

  /**
   * Goes to the entry that plays a step, by the step's index among the scenario's steps. A step of an
   * alternative not chosen makes the choices that reach it, and says so (ADR 0078).
   */
  goToStep(step: number): void {
    const scenario = this.openScenario();
    const at = Math.trunc(step);
    const reaching =
      scenario && this.timeline() ? choicesReaching(scenario, at, this.state.choices) : undefined;
    if (scenario && reaching) {
      this.stoppedAfter = undefined;
      this.setChoices(reaching.choices);
      this.context?.announce?.(sayReached(scenario, reaching.changed));
      this.move({
        step: at,
        elapsed: 0,
        mode: this.playback.mode === 'playing' ? 'playing' : 'stepping',
      });
      return;
    }
    const timeline = this.timeline();
    const entry = timeline ? entryOfStep(timeline, step) : undefined;
    if (entry !== undefined) this.goTo(entry);
  }

  /**
   * The index of the timeline entry that plays a step, by the step's index: under a collapsed
   * container, one entry plays several steps. None while the scenario's view is not open.
   */
  entryOf(step: number): number | undefined {
    const timeline = this.timeline();
    return timeline ? entryOfStep(timeline, step) : undefined;
  }

  /** Opens a scenario, at its first step, paused, each of its decisions playing its default. */
  open(id: Id): void {
    this.reset(id);
  }

  close(): void {
    this.reset(undefined);
  }

  play(): void {
    const timeline = this.timeline();
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
    const timeline = this.timeline();
    this.stoppedAfter = undefined;
    if (timeline) this.move(next(this.playback, timeline));
  }

  previous(): void {
    const timeline = this.timeline();
    this.stoppedAfter = undefined;
    if (timeline) this.move(previous(this.playback, timeline));
  }

  /** Goes to an entry of the timeline. */
  goTo(entry: number): void {
    const timeline = this.timeline();
    this.stoppedAfter = undefined;
    if (timeline) this.move(goTo(this.playback, timeline, entry));
  }

  /**
   * Chooses an alternative at a decision, and says so: playback stays on its step while the choices
   * still play it, and otherwise goes to the first step of the alternative chosen, or past it.
   */
  choose(chosen: Chosen): void {
    const scenario = this.openScenario();
    if (!scenario || !wordsOf(scenario, chosen)) return;
    const choices = withChoice(this.state.choices, chosen);
    const step = stepAfterChoice(scenario, choices, this.playback.step, chosen.decision);
    this.setChoices(choices);
    this.context?.announce?.(sayChosen(scenario, chosen));
    if (step === this.playback.step) {
      this.publish();
      return;
    }
    this.stoppedAfter = undefined;
    this.move({
      step,
      elapsed: 0,
      mode: this.playback.mode === 'playing' ? 'playing' : 'stepping',
    });
  }

  /** Points at an alternative, whose relations the canvas then previews; none stops. */
  preview(chosen: Chosen | undefined): void {
    const was = this.state.previewing;
    if (was?.decision === chosen?.decision && was?.alternative === chosen?.alternative) return;
    this.state = { ...this.state, previewing: chosen };
    this.publish();
  }

  /** Turns the page's option Stop at each decision on or off. */
  setStopAtDecisions(on: boolean): void {
    if (on === this.state.stopAtDecisions) return;
    this.stoppedAfter = undefined;
    this.state = { ...this.state, stopAtDecisions: on };
    this.publish();
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

  /** The open scenario's timeline, once it was worked out with the choices made last. */
  private timeline(): Timeline | undefined {
    const context = this.context;
    if (!context?.timeline) return undefined;
    const { choices } = this.state;
    const current =
      context.choices === undefined
        ? Object.keys(choices).length === 0
        : context.choices === choices;
    return current ? context.timeline : undefined;
  }

  private setChoices(choices: DecisionChoices): void {
    if (choices !== this.state.choices) this.state = { ...this.state, choices };
  }

  private applyGuided(): void {
    const guided = this.guided;
    if (!guided) return;
    this.guided = undefined;
    const scenario = this.openScenario();
    if (scenario?.id !== guided.scenario || !this.timeline()) return;
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
    this.stoppedAfter = undefined;
    this.state = { ...this.state, scenario, choices: NO_CHOICES, previewing: undefined };
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
    if (this.playback.mode === 'paused' || !this.timeline()) {
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
    const timeline = this.timeline();
    if (!timeline) {
      this.stop();
      return;
    }
    const before = this.playback;
    const after = advance(before, timeline, passed, this.state.speed);
    this.playback = this.stopAtDecision(before, after, timeline);
    this.publish();
    this.emitFrame();
    if (this.playback.mode === 'paused') this.lastFrame = undefined;
    else this.frame = this.clock.request(this.onFrame);
  };

  /** As the app's session does: pauses before a decision with Stop at each decision on. */
  private stopAtDecision(before: Playback, after: Playback, timeline: Timeline): Playback {
    if (!this.state.stopAtDecisions || this.context?.touring) return after;
    if (before.mode !== 'playing' || after.step === before.step) return after;
    const scenario = this.openScenario();
    const at = entryOfStep(timeline, before.step);
    const entry = at === undefined ? undefined : timeline.entries[at];
    if (!scenario || !entry) return after;
    const last = entry.first + entry.count - 1;
    if (this.stoppedAfter === last) {
      this.stoppedAfter = undefined;
      return after;
    }
    const ahead = decisionAhead(scenario, this.state.choices, last);
    if (!ahead) return after;
    this.stoppedAfter = last;
    this.context?.announce?.(sayStopped(scenario, ahead));
    return { step: before.step, elapsed: STEP_TIME, mode: 'paused' };
  }
}
