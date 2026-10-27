/**
 * The scenario session of a tab: which scenario is open, where its playback is and how fast it goes,
 * the alternative chosen at each of its decisions, and whether clicks on relations record steps. It
 * lives outside React's state, like the camera, so that the marker can move on every frame without
 * the panels rendering again. The shell keeps one, and gives it to the scenario panel and the canvas.
 *
 * Playing never changes the project, and nor does choosing at a decision (ADR 0078): the choices are
 * the tab's. Recording sends one command for each click, and waits for each one's change to come back
 * before it works out the next from the scenario as it is then.
 */
import {
  PLAYBACK_START,
  STEP_TIME,
  advance,
  entryOfStep,
  goTo,
  isFinished,
  modelIndexOf,
  next,
  pause,
  play,
  playedSteps,
  previous,
  recordRelation,
  type Command,
  type Guidance,
  type Playback,
  type PlaybackMode,
  type ProjectSnapshot,
  type Recorded,
  type Speed,
  type Timeline,
} from '@visual-anything/core';
import type { DecisionChoices, Id, ScenarioFile } from '@visual-anything/schema';
import { nameOfEnd } from '../canvas/announce';
import { t } from '../i18n';
import {
  AFTER_STEP,
  NO_CHOICES,
  choicesReaching,
  decisionAhead,
  hasDecisions,
  sayChosen,
  sayReached,
  sayStopped,
  stepAfterChoice,
  withChoice,
  wordsOf,
  type Chosen,
} from './choosing';
import { recordedLabel, stepsCommand } from './commands';
import {
  decisionHolding,
  recordInDecisions,
  type AlternativeWords,
  type RecordingPlace,
} from './record-decisions';

/** Sends a command; resolves with whether the local program applied it. */
export type SendScenarioCommand = (command: Command) => Promise<{ ok: boolean; created?: Id[] }>;

/**
 * What Claude's guidance asks of playback: to open a scenario, play or pause it, or move it to a
 * step, by the step's index among the scenario's steps, or to the next or the previous one.
 */
export type PlaybackGuidance = Omit<Extract<Guidance, { kind: 'playback' }>, 'kind'>;

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
  /**
   * How many times the person or Claude asked playback for a step: by playing, stepping, going to a
   * step or opening a scenario, from the panel or by guidance. Playback brings the step into view
   * then (`follow.ts`); what an address or a tour plays is quiet, since it places the camera itself.
   */
  asks: number;
  /**
   * The alternative chosen at each decision of the open scenario, by the decision's id; a decision
   * not named plays its default (ADR 0078). The tab's: never written to a file or kept in the history.
   */
  choices: DecisionChoices;
  /** The tab's option Stop at each decision: playing pauses before each decision it reaches. */
  stopAtDecisions: boolean;
  /** The alternative pointed at on the decision card or in the steps' list, which the canvas previews. */
  previewing: Chosen | undefined;
  /** Where the next step recorded goes (`record-decisions.ts`). */
  place: RecordingPlace;
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
  /**
   * The choices the timeline was worked out with, the session's own; until a timeline with the
   * choices made last comes, playback waits for it. None for a timeline without choices.
   */
  choices?: DecisionChoices;
  /** Whether a tour plays, which plays its own range: Stop at each decision waits until it ends. */
  touring?: boolean;
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
  applied?: { at: number; said: string; created?: Chosen };
}

const INITIAL: ScenarioState = {
  scenario: undefined,
  recording: false,
  canRecord: false,
  step: 0,
  mode: 'paused',
  speed: 1,
  asks: 0,
  choices: NO_CHOICES,
  stopAtDecisions: false,
  previewing: undefined,
  place: AFTER_STEP,
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
  /**
   * Whether the open scenario has been in the project: one just created may be opened before the
   * project holding it comes, and only one that was there and is gone was deleted.
   */
  private seen = false;
  /** What Claude asked of playback, waiting for the scenario's timeline until the next sync. */
  private guided: PlaybackGuidance | undefined;
  /** Whether what is guided is quiet: an address's, which places the camera itself. */
  private guidedQuietly = false;
  /** While true, what playback is asked does not count as asked for (`ScenarioState.asks`). */
  private quiet = false;
  private asks = 0;
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

  /** Where playback is now. */
  get position(): Playback {
    return this.playback;
  }

  /** Whether playback has played the last step to its end. */
  get finished(): boolean {
    const timeline = this.timeline();
    return timeline !== undefined && isFinished(this.playback, timeline);
  }

  /** Takes in the tab as it is now: the project, the open view, and the open scenario's timeline. */
  sync(context: SessionContext): void {
    this.context = context;
    if (this.openScenario()) {
      this.seen = true;
    } else if (this.state.scenario !== undefined && this.seen) {
      // The scenario was deleted, here or elsewhere.
      this.reset(undefined);
      return;
    }
    this.landIfBack();
    if (!context.timeline) this.playback = pause(this.playback);
    this.publish();
    this.recordNext();
    this.keepMoving();
    this.applyGuided();
  }

  /**
   * Does what Claude's guidance asks of playback, as the person would from the panel: opening the
   * scenario first when it is not the open one, which also goes to its first step, paused. What needs
   * the timeline happens at once when the scenario's view is open, and otherwise with the next sync,
   * once the tab has opened the scenario and its view; when the timeline has not come by then, it is
   * forgotten. The person can pause, step or close the scenario at any time, as ever.
   */
  guide(request: PlaybackGuidance, { quiet = false }: { quiet?: boolean } = {}): void {
    const opening = request.action === 'open' || this.state.scenario !== request.scenario;
    this.quietly(quiet, () => {
      if (opening) this.open(request.scenario);
    });
    this.guided = request.action === 'open' ? undefined : request;
    this.guidedQuietly = quiet;
    if (!opening && this.timeline()) this.applyGuided();
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
      this.asked();
      this.leavePlace();
      this.setChoices(reaching.choices);
      this.context?.announce(sayReached(scenario, reaching.changed));
      const mode = this.playback.mode === 'playing' ? 'playing' : 'stepping';
      this.move({ step: at, elapsed: 0, mode });
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
    this.asked();
    this.reset(id);
  }

  close(): void {
    this.reset(undefined);
  }

  play(): void {
    const timeline = this.timeline();
    if (!timeline) return;
    this.recordingOff();
    this.asked();
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
    const timeline = this.timeline();
    if (!timeline) return;
    this.asked();
    this.leavePlace();
    this.move(next(this.playback, timeline));
  }

  previous(): void {
    const timeline = this.timeline();
    if (!timeline) return;
    this.asked();
    this.leavePlace();
    this.move(previous(this.playback, timeline));
  }

  /** Goes to an entry of the timeline. */
  goTo(entry: number): void {
    const timeline = this.timeline();
    if (!timeline) return;
    this.asked();
    this.leavePlace();
    this.move(goTo(this.playback, timeline, entry));
  }

  /**
   * Chooses an alternative at a decision, and says so. Playback stays on its step while the choices
   * still play it, and otherwise goes to the first step of the alternative chosen, or past the
   * decision when it has none (ADR 0078).
   */
  choose(chosen: Chosen): void {
    const scenario = this.openScenario();
    if (!scenario || !wordsOf(scenario, chosen)) return;
    const choices = withChoice(this.state.choices, chosen);
    const step = stepAfterChoice(scenario, choices, this.playback.step, chosen.decision);
    this.setChoices(choices);
    this.context?.announce(sayChosen(scenario, chosen));
    if (step === this.playback.step) {
      this.publish();
      return;
    }
    this.asked();
    this.leavePlace();
    const mode = this.playback.mode === 'playing' ? 'playing' : 'stepping';
    this.move({ step, elapsed: 0, mode });
  }

  /** Points at an alternative, whose relations the canvas then previews; none stops. */
  preview(chosen: Chosen | undefined): void {
    const was = this.state.previewing;
    if (was?.decision === chosen?.decision && was?.alternative === chosen?.alternative) return;
    this.state = { ...this.state, previewing: chosen };
    this.publish();
  }

  /** Turns the tab's option Stop at each decision on or off. */
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

  /**
   * Turns recording on or off. Turned on, playback pauses at the last step that plays, so that the
   * steps recorded follow it; choosing another step records after that one instead.
   */
  setRecording(on: boolean): void {
    if (on === this.state.recording) return;
    if (on) {
      const scenario = this.openScenario();
      const last = scenario ? playedSteps(scenario, this.state.choices).at(-1) : undefined;
      this.playback = { step: last ?? 0, elapsed: 0, mode: 'paused' };
      this.state = { ...this.state, recording: true, place: AFTER_STEP };
    } else {
      this.recordingOff();
    }
    this.publish();
    this.emitFrame();
    this.keepMoving();
  }

  /**
   * Add an alternative here: the next click records the first step of a new alternative after a step,
   * by its index, the current one by default. It joins the decision that starts right after that
   * step, or starts a new one whose first alternative keeps the steps that followed (ADR 0078).
   * Recording turns on, at that step.
   */
  addAlternative(words: AlternativeWords, after: number = this.playback.step): void {
    const scenario = this.openScenario();
    if (!scenario?.steps[after]) return;
    if (!this.state.recording) this.setRecording(true);
    if (after !== this.playback.step) this.playback = { step: after, elapsed: 0, mode: 'paused' };
    this.state = { ...this.state, place: { kind: 'new-alternative', after, words } };
    this.context?.announce(
      t('Click the first relation of “{label}” on the canvas.', { label: words.label }),
    );
    this.publish();
    this.emitFrame();
  }

  /**
   * End the alternative: the next click records after the decision whose alternative holds the step
   * playback is on, whichever way it went.
   */
  endAlternative(): void {
    const scenario = this.openScenario();
    const decision = scenario ? decisionHolding(scenario, this.playback.step) : undefined;
    if (!scenario || decision === undefined) return;
    this.state = { ...this.state, place: { kind: 'after-decision', decision } };
    const question = scenario.blocks?.find((each) => each.id === decision)?.question ?? '';
    this.context?.announce(t('The next click records after “{question}”.', { question }));
    this.publish();
  }

  /** Records after the current step again, as before Add an alternative here or End the alternative. */
  cancelPlace(): void {
    if (this.state.place.kind === 'after-step') return;
    this.state = { ...this.state, place: AFTER_STEP };
    this.publish();
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
        t(
          'That line stands for several relations, so nothing was recorded. Expand the container to record one of them.',
        ),
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

  /**
   * The open scenario's timeline, once it was worked out with the choices made last; until then
   * none, and playback waits for it.
   */
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

  /** Makes these the choices; a new timeline comes with the next sync. */
  private setChoices(choices: DecisionChoices): void {
    if (choices === this.state.choices) return;
    this.state = { ...this.state, choices };
  }

  /**
   * The person moves playback to another step: recording goes back to recording after the current
   * step, and Stop at each decision stops again at a decision it stopped before.
   */
  private leavePlace(): void {
    this.stoppedAfter = undefined;
    if (this.state.place.kind !== 'after-step') this.state = { ...this.state, place: AFTER_STEP };
  }

  /** Does what Claude asked of playback, if the timeline is the open scenario's, then forgets it. */
  private applyGuided(): void {
    const guided = this.guided;
    if (!guided) return;
    this.guided = undefined;
    const scenario = this.openScenario();
    const timeline = this.timeline();
    if (scenario?.id !== guided.scenario || !timeline || !isTimelineOf(timeline, scenario)) return;
    this.quietly(this.guidedQuietly, () => this.applyAction(guided));
  }

  /** Does what guidance asks of the open scenario. */
  private applyAction(guided: PlaybackGuidance): void {
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
    this.clicks = [];
    this.sent = undefined;
    this.guided = undefined;
    this.stoppedAfter = undefined;
    this.state = {
      ...this.state,
      scenario,
      recording: false,
      choices: NO_CHOICES,
      previewing: undefined,
      place: AFTER_STEP,
    };
    this.seen = this.openScenario() !== undefined;
    this.publish();
    this.emitFrame();
  }

  private recordingOff(): void {
    this.clicks = [];
    this.state = { ...this.state, recording: false, place: AFTER_STEP };
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
      const { place } = this.state;
      // A click in an alternative, after a decision, or that starts an alternative keeps the
      // decisions whole; a Shift+click changes only the current step.
      if (place.kind !== 'after-step' || (!click.simultaneous && hasDecisions(scenario))) {
        this.recordInDecisions(context, send, scenario, click, place);
        continue;
      }
      const index = modelIndexOf(context.project);
      const recorded = recordRelation(
        scenario.steps,
        { ...click, at: this.playback.step },
        (id) => index.relation(id) !== undefined,
      );
      if (recorded.change === 'unchanged') {
        context.announce(
          t(
            'Step {n} activates only this relation, so it stays in it. To take the step out, delete it.',
            { n: recorded.at + 1 },
          ),
        );
        continue;
      }
      this.sendClick(
        send,
        scenario,
        stepsCommand(scenario, recorded.steps, recordedLabel(scenario, recorded)),
        { at: recorded.at, said: sayRecorded(context.project, click, recorded) },
      );
    }
  }

  /** Records a click into a scenario's decisions, or as the first step of a new alternative. */
  private recordInDecisions(
    context: SessionContext,
    send: SendScenarioCommand,
    scenario: ScenarioFile,
    click: Click,
    place: RecordingPlace,
  ): void {
    const recorded = recordInDecisions(
      context.project,
      scenario,
      click.relation,
      place,
      this.playback.step,
    );
    if (!recorded || 'refused' in recorded) {
      // Nothing is sent: what would not hold together is said, in the core's words.
      if (recorded)
        context.announce(t('Nothing was recorded: {why}', { why: t.message(recorded.refused) }));
      this.clicks = [];
      this.state = { ...this.state, place: AFTER_STEP };
      this.publish();
      return;
    }
    const sentence = nameOfEnd(context.project, click.relation);
    const n = recorded.at + 1;
    const said =
      recorded.created && place.kind === 'new-alternative'
        ? t('Recorded step {n}, the first of “{label}”: {sentence}.', {
            n,
            label: place.words.label,
            sentence,
          })
        : t('Recorded step {n}: {sentence}.', { n, sentence });
    this.sendClick(send, scenario, recorded.command, {
      at: recorded.at,
      said,
      ...(recorded.created ? { created: recorded.created } : {}),
    });
  }

  private sendClick(
    send: SendScenarioCommand,
    scenario: ScenarioFile,
    command: Command,
    applied: NonNullable<SentClick['applied']>,
  ): void {
    const sent: SentClick = { from: scenario };
    this.sent = sent;
    const forget = () => {
      if (this.sent !== sent) return;
      this.sent = undefined;
      this.clicks = [];
    };
    send(command).then((result) => {
      if (this.sent !== sent) return;
      if (!result.ok) {
        forget();
        return;
      }
      sent.applied = applied;
      this.landIfBack();
      this.recordNext();
    }, forget);
  }

  /**
   * Once the change of the click sent is in the project, playback goes to the step it recorded, and
   * plays its travel, choosing the alternative it is in when that does not play; the next click
   * waiting can then be worked out.
   */
  private landIfBack(): void {
    const sent = this.sent;
    const scenario = this.openScenario();
    if (!sent?.applied || scenario === sent.from) return;
    this.sent = undefined;
    const { at, said, created } = sent.applied;
    let choices = created ? withChoice(this.state.choices, created) : this.state.choices;
    if (scenario) choices = choicesReaching(scenario, at, choices)?.choices ?? choices;
    this.setChoices(choices);
    this.state = { ...this.state, place: AFTER_STEP };
    this.playback = { step: at, elapsed: 0, mode: 'stepping' };
    this.context?.announce(said);
    this.publish();
    this.emitFrame();
    this.keepMoving();
  }

  /** Counts a step asked for, unless quiet, which `publish` says. */
  private asked(): void {
    if (!this.quiet) this.asks += 1;
  }

  /** Runs `act`, quietly when `quiet` is true. */
  private quietly(quiet: boolean, act: () => void): void {
    const was = this.quiet;
    this.quiet = was || quiet;
    try {
      act();
    } finally {
      this.quiet = was;
    }
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
    const { asks } = this;
    const shown = this.state;
    if (
      shown.canRecord !== canRecord ||
      shown.step !== step ||
      shown.mode !== mode ||
      shown.asks !== asks
    ) {
      this.state = { ...shown, canRecord, step, mode, asks };
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
    // A frame that comes late, as after the tab was hidden, counts as one frame: hidden time never plays.
    const passed = Math.min(now - (this.lastFrame ?? now), MAX_FRAME_TIME);
    this.lastFrame = now;
    const timeline = this.timeline();
    if (!timeline) {
      this.stop();
      return;
    }
    this.playback = this.stopAtDecision(
      this.playback,
      advance(this.playback, timeline, passed, this.state.speed),
      timeline,
    );
    this.publish();
    this.emitFrame();
    if (this.playback.mode === 'paused') this.lastFrame = undefined;
    else this.frame = this.clock.request(this.onFrame);
  };

  /**
   * With Stop at each decision on, playing that goes on from a step to the next pauses at the end of
   * the first instead when a decision comes between them, and says so; playing on from there passes
   * it. A tour plays its own range.
   */
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
    this.context?.announce(sayStopped(scenario, ahead));
    return { step: before.step, elapsed: STEP_TIME, mode: 'paused' };
  }
}

/** Whether a timeline plays this scenario's steps, as they are now. */
function isTimelineOf(timeline: Timeline, scenario: ScenarioFile): boolean {
  return (
    timeline.steps === scenario.steps.length &&
    timeline.entries.every((entry) =>
      entry.steps.every((id, at) => scenario.steps[entry.first + at]?.id === id),
    )
  );
}

/** What recording a click says: "Recorded step 3: Booking agent communicates with Appointments API." */
function sayRecorded(project: ProjectSnapshot, click: Click, recorded: Recorded): string {
  const sentence = nameOfEnd(project, click.relation);
  const step = recorded.at + 1;
  switch (recorded.change) {
    case 'new-step':
      return t('Recorded step {n}: {sentence}.', { n: step, sentence });
    case 'added':
      return t('Added to step {n}, at the same time: {sentence}.', { n: step, sentence });
    case 'removed':
    case 'unchanged':
      return t('Taken out of step {n}: {sentence}.', { n: step, sentence });
  }
}
