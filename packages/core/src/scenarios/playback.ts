/**
 * Playing a scenario: where playback is, whether it plays, and how its time passes. Each entry of the
 * timeline plays for the same time: a marker travels along its relations, then holds at their far end
 * before the next entry. Choosing a step while paused plays its travel once. Everything here is pure:
 * the app keeps a playback per tab and moves it on with the clock; playing changes no file.
 */
import { entryOfStep, type Timeline } from './timeline';

/** How fast playback can go, as factors of the normal speed. */
export const SPEEDS = [0.5, 1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

/** How long the marker takes to travel along a step's relations at normal speed, in milliseconds. */
export const TRAVEL_TIME = 1200;
/** How long each step plays at normal speed, travel and hold together, in milliseconds. */
export const STEP_TIME = 2400;

/**
 * Whether time passes: `playing` goes from step to step; `stepping` plays the travel of the step it is
 * on, then pauses; `paused` holds still.
 */
export type PlaybackMode = 'playing' | 'stepping' | 'paused';

/** Where playback is. */
export interface Playback {
  /**
   * The index of the step it is on, among the scenario's steps. Inside an aggregated step it is one of
   * the steps that one stands for, so that expanding the container lands among them.
   */
  step: number;
  /** How long the entry it is on has played, at normal speed, from 0 to `STEP_TIME`. */
  elapsed: number;
  mode: PlaybackMode;
}

/** Playback before it starts: paused at the first step, the marker at the start of its relations. */
export const PLAYBACK_START: Playback = { step: 0, elapsed: 0, mode: 'paused' };

/** The index of the timeline entry playback is on; undefined when the scenario has no steps. */
export function currentEntry(playback: Playback, timeline: Timeline): number | undefined {
  return entryOfStep(timeline, playback.step);
}

/** Moves playback on by `ms` milliseconds of the clock, at a speed. */
export function advance(
  playback: Playback,
  timeline: Timeline,
  ms: number,
  speed: number,
): Playback {
  const entry = currentEntry(playback, timeline);
  if (entry === undefined) {
    const still = playback.step === 0 && playback.elapsed === 0 && playback.mode === 'paused';
    return still ? playback : { step: 0, elapsed: 0, mode: 'paused' };
  }
  let step = clampStep(playback.step, timeline);
  const start = Math.min(Math.max(playback.elapsed, 0), STEP_TIME);
  const passed = Number.isFinite(ms) && ms > 0 && Number.isFinite(speed) ? ms * speed : 0;
  if (playback.mode === 'paused' || passed <= 0) {
    const same = step === playback.step && start === playback.elapsed;
    return same ? playback : { ...playback, step, elapsed: start };
  }
  let elapsed = start + passed;

  if (playback.mode === 'stepping') {
    if (elapsed < TRAVEL_TIME) return { step, elapsed, mode: 'stepping' };
    return { step, elapsed: Math.max(TRAVEL_TIME, start), mode: 'paused' };
  }

  let at = entry;
  const last = timeline.entries.length - 1;
  while (elapsed >= STEP_TIME) {
    if (at >= last) return { step, elapsed: STEP_TIME, mode: 'paused' };
    elapsed -= STEP_TIME;
    at += 1;
    step = (timeline.entries[at] as Timeline['entries'][number]).first;
  }
  return { step, elapsed, mode: 'playing' };
}

/** Plays from where playback is; from the first step again once it has played to the end. */
export function play(playback: Playback, timeline: Timeline): Playback {
  if (timeline.steps === 0) return playback;
  if (isFinished(playback, timeline)) return { step: 0, elapsed: 0, mode: 'playing' };
  return { ...playback, step: clampStep(playback.step, timeline), mode: 'playing' };
}

/** Holds playback still where it is. */
export function pause(playback: Playback): Playback {
  return playback.mode === 'paused' ? playback : { ...playback, mode: 'paused' };
}

/**
 * Goes to the start of an entry of the timeline, the nearest one for an index outside it: playing on
 * when it was playing, and otherwise playing the entry's travel once.
 */
export function goTo(playback: Playback, timeline: Timeline, entry: number): Playback {
  const last = timeline.entries.length - 1;
  if (last < 0) return playback;
  const at = Math.min(Math.max(Math.trunc(entry) || 0, 0), last);
  const first = (timeline.entries[at] as Timeline['entries'][number]).first;
  return { step: first, elapsed: 0, mode: playback.mode === 'playing' ? 'playing' : 'stepping' };
}

/** Goes to the next entry; at the last one, stays. */
export function next(playback: Playback, timeline: Timeline): Playback {
  const entry = currentEntry(playback, timeline);
  if (entry === undefined || entry >= timeline.entries.length - 1) return playback;
  return goTo(playback, timeline, entry + 1);
}

/** Goes to the previous entry; at the first one, plays it again from its start. */
export function previous(playback: Playback, timeline: Timeline): Playback {
  const entry = currentEntry(playback, timeline);
  if (entry === undefined) return playback;
  return goTo(playback, timeline, Math.max(entry - 1, 0));
}

/** Whether playback has played the last step to its end. */
export function isFinished(playback: Playback, timeline: Timeline): boolean {
  const entry = currentEntry(playback, timeline);
  return (
    entry !== undefined && entry === timeline.entries.length - 1 && playback.elapsed >= STEP_TIME
  );
}

/**
 * Where the markers are along the relations of the entry playback is on: 0 at their `from` end, 1 at
 * their `to` end, easing in and out. When the system asks for reduced motion they do not travel: they
 * stand at the end they travel to.
 */
export function markerProgress(playback: Playback, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  const t = Math.min(Math.max(playback.elapsed / TRAVEL_TIME, 0), 1);
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function clampStep(step: number, timeline: Timeline): number {
  return Math.min(Math.max(Math.trunc(step) || 0, 0), Math.max(timeline.steps - 1, 0));
}
