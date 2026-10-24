/**
 * The scenario session of a tab: which scenario is open, where its playback is and how fast it goes,
 * and whether clicks on relations record steps. It lives outside React's state, like the camera, so
 * that the marker can move on every frame without the panels rendering again. The shell keeps one,
 * and gives it to the scenario panel and the canvas.
 *
 * Playing never changes the project. Recording sends one command for each click, and waits for each
 * one's change to come back before it works out the next from the scenario as it is then.
 */
import {
  PLAYBACK_START,
  advance,
  goTo,
  isFinished,
  modelIndexOf,
  next,
  pause,
  play,
  previous,
  recordRelation,
  type Command,
  type Playback,
  type PlaybackMode,
  type ProjectSnapshot,
  type Recorded,
  type Speed,
  type Timeline,
} from '@visual-anything/core';
import type { Id, ScenarioFile } from '@visual-anything/schema';
import { nameOfEnd } from '../canvas/announce';
import { recordedLabel, stepsCommand } from './commands';

/** Sends a command; resolves with whether the local program applied it. */
export type SendScenarioCommand = (command: Command) => Promise<{ ok: boolean; created?: Id[] }>;

/** What the session shows; a new object whenever any of it changes, but not on every frame. */
export interface ScenarioState {
  /** The scenario open in the panel. */
  scenario: Id | undefined;
  /** Whether recording is on. */
  recording: boolean;
  /**
   * Whether clicks on relations record now: recording is on, the scenario's view is the one open, and
   * the project can be changed.
   */
  canRecord: boolean;
  /** The index of the step playback is on, among the scenario's steps. */
  step: number;
  mode: PlaybackMode;
  speed: Speed;
}

/** What the session needs to know of the tab, as the panel sees it. */
export interface SessionContext {
  project: ProjectSnapshot;
  /** The view open on the canvas. */
  viewId: Id | undefined;
  /** Sends commands; absent while the project cannot be changed. */
  send: SendScenarioCommand | undefined;
  /** The open scenario's timeline over its view, when its view is the one open. */
  timeline: Timeline | undefined;
  /** Says something to screen readers, and shows it. */
  announce: (message: string) => void;
}

/** The frames playback moves on with; the browser's by default. */
export interface Clock {
  now(): number;
  request(callback: () => void): number;
  cancel(handle: number): void;
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

/** How many clicks wait for the one before them to come back, at most. */
const MAX_WAITING_CLICKS = 16;
/** How much time one frame moves playback on, at most, in milliseconds. */
const MAX_FRAME_TIME = 100;

interface Click {
  relation: Id;
  simultaneous: boolean;
}

/** A recorded click sent, until its change comes back. */
interface SentClick {
  /** The scenario it was worked out from: it is back once the project holds another. */
  from: ScenarioFile;
  /** Where it recorded, once the local program said it applied it. */
  applied?: { at: number; said: string };
}

const INITIAL: ScenarioState = {
  scenario: undefined,
  recording: false,
  canRecord: false,
  step: 0,
  mode: 'paused',
  speed: 1,
};

export class ScenarioSession {
  private state: ScenarioState = INITIAL;
  private emitted: ScenarioState = INITIAL;
  private playback: Playback = PLAYBACK_START;
  private context: SessionContext | undefined;
  private readonly listeners = new Set<() => void>();
  private readonly frameListeners = new Set<() => void>();
  private frame: number | undefined;
  private lastFrame: number | undefined;
  private clicks: Click[] = [];
  private sent: SentClick | undefined;

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

  /** Where playback is now. */
  get position(): Playback {
    return this.playback;
  }

  /** Whether playback has played the last step to its end. */
  get finished(): boolean {
    const timeline = this.context?.timeline;
    return timeline !== undefined && isFinished(this.playback, timeline);
  }

  /** Takes in the tab as it is now: the project, the open view, and the open scenario's timeline. */
  sync(context: SessionContext): void {
    this.context = context;
    if (this.state.scenario !== undefined && !this.openScenario()) {
      // The scenario was deleted, here or elsewhere.
      this.reset(undefined);
      return;
    }
    this.landIfBack();
    if (!context.timeline) this.playback = pause(this.playback);
    this.publish();
    this.recordNext();
    this.keepMoving();
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
    if (!timeline) return;
    this.recordingOff();
    this.move(play(this.playback, timeline));
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

  /**
   * Turns recording on or off. Turned on, playback pauses at the last step, so that the steps
   * recorded follow it; choosing another step records after that one instead.
   */
  setRecording(on: boolean): void {
    if (on === this.state.recording) return;
    if (on) {
      const steps = this.openScenario()?.steps.length ?? 0;
      this.playback = { step: Math.max(steps - 1, 0), elapsed: 0, mode: 'paused' };
      this.state = { ...this.state, recording: true };
    } else {
      this.recordingOff();
    }
    this.publish();
    this.emitFrame();
    this.keepMoving();
  }

  /**
   * A click on a relation while recording: with Shift it happens at the same time as the current
   * step; without, it is the next step. A line that stands for several relations records nothing.
   */
  record(relation: Id, simultaneous: boolean): void {
    const context = this.context;
    if (!this.state.canRecord || !context) return;
    if (!modelIndexOf(context.project).relation(relation)) {
      context.announce(
        'That line stands for several relations, so nothing was recorded. Expand the container to record one of them.',
      );
      return;
    }
    if (this.clicks.length >= MAX_WAITING_CLICKS) return;
    this.clicks.push({ relation, simultaneous });
    this.recordNext();
  }

  /** Stops the clock, as when the panel goes; playback goes on once something moves it again. */
  stop(): void {
    if (this.frame !== undefined) this.clock.cancel(this.frame);
    this.frame = undefined;
    this.lastFrame = undefined;
  }

  private openScenario(): ScenarioFile | undefined {
    const { scenario } = this.state;
    if (scenario === undefined) return undefined;
    return this.context?.project.scenarios.find((each) => each.id === scenario);
  }

  private reset(scenario: Id | undefined): void {
    this.stop();
    this.playback = PLAYBACK_START;
    this.clicks = [];
    this.sent = undefined;
    this.state = { ...this.state, scenario, recording: false };
    this.publish();
    this.emitFrame();
  }

  private recordingOff(): void {
    this.clicks = [];
    this.state = { ...this.state, recording: false };
  }

  /** Sends the next click waiting, once no recorded click is on its way. */
  private recordNext(): void {
    while (!this.sent && this.clicks.length > 0) {
      const click = this.clicks.shift() as Click;
      const context = this.context;
      const scenario = this.openScenario();
      const send = context?.send;
      if (!context || !scenario || !send || !this.state.canRecord) {
        this.clicks = [];
        return;
      }
      const index = modelIndexOf(context.project);
      const recorded = recordRelation(
        scenario.steps,
        { ...click, at: this.playback.step },
        (id) => index.relation(id) !== undefined,
      );
      if (recorded.change === 'unchanged') {
        context.announce(
          `Step ${recorded.at + 1} activates only this relation, so it stays in it. To take the step out, delete it.`,
        );
        continue;
      }
      this.sendClick(send, scenario, recorded, sayRecorded(context.project, click, recorded));
    }
  }

  private sendClick(
    send: SendScenarioCommand,
    scenario: ScenarioFile,
    recorded: Recorded,
    said: string,
  ): void {
    const sent: SentClick = { from: scenario };
    this.sent = sent;
    const forget = () => {
      if (this.sent !== sent) return;
      this.sent = undefined;
      this.clicks = [];
    };
    send(stepsCommand(scenario, recorded.steps, recordedLabel(scenario, recorded))).then(
      (result) => {
        if (this.sent !== sent) return;
        if (!result.ok) {
          forget();
          return;
        }
        sent.applied = { at: recorded.at, said };
        this.landIfBack();
        this.recordNext();
      },
      forget,
    );
  }

  /**
   * Once the change of the click sent is in the project, playback goes to the step it recorded, and
   * plays its travel; the next click waiting can then be worked out.
   */
  private landIfBack(): void {
    const sent = this.sent;
    if (!sent?.applied || this.openScenario() === sent.from) return;
    this.sent = undefined;
    this.playback = { step: sent.applied.at, elapsed: 0, mode: 'stepping' };
    this.context?.announce(sent.applied.said);
    this.publish();
    this.emitFrame();
    this.keepMoving();
  }

  /** Moves playback, and keeps the clock going while it plays. */
  private move(playback: Playback): void {
    this.playback = playback;
    this.publish();
    this.emitFrame();
    this.keepMoving();
  }

  /** Works out what the state shows now, and tells the listeners when it changed. */
  private publish(): void {
    const context = this.context;
    const scenario = this.openScenario();
    const canRecord =
      this.state.recording &&
      scenario !== undefined &&
      context?.send !== undefined &&
      context.viewId === scenario.view;
    const { step, mode } = this.playback;
    const shown = this.state;
    if (shown.canRecord !== canRecord || shown.step !== step || shown.mode !== mode) {
      this.state = { ...shown, canRecord, step, mode };
    }
    if (this.state === this.emitted) return;
    this.emitted = this.state;
    for (const listener of this.listeners) listener();
  }

  private emitFrame(): void {
    for (const listener of this.frameListeners) listener();
  }

  /** Asks for the next frame while playback moves. */
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
    // A frame that comes late, as after the tab was hidden, counts as one frame: hidden time never plays.
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

/** What recording a click says: "Recorded step 3: Booking agent communicates with Appointments API." */
function sayRecorded(project: ProjectSnapshot, click: Click, recorded: Recorded): string {
  const sentence = nameOfEnd(project, click.relation);
  const step = recorded.at + 1;
  switch (recorded.change) {
    case 'new-step':
      return `Recorded step ${step}: ${sentence}.`;
    case 'added':
      return `Added to step ${step}, at the same time: ${sentence}.`;
    case 'removed':
    case 'unchanged':
      return `Taken out of step ${step}: ${sentence}.`;
  }
}
