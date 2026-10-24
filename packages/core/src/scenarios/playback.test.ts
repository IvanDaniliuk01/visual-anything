import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  PLAYBACK_START,
  SPEEDS,
  STEP_TIME,
  TRAVEL_TIME,
  advance,
  currentEntry,
  goTo,
  isFinished,
  markerProgress,
  next,
  pause,
  play,
  previous,
  type Playback,
} from './playback';
import { scenarioProject, theScenario, withSteps } from './test/fixtures';
import { scenarioTimeline, type Timeline } from './timeline';

function timelineOf(collapsed?: string[]): Timeline {
  const project = scenarioProject(collapsed);
  return scenarioTimeline(project, theScenario(project));
}

const flat = timelineOf();
const folded = timelineOf(['system']);
const empty = (() => {
  const project = withSteps(scenarioProject(), []);
  return scenarioTimeline(project, theScenario(project));
})();

describe('playback', () => {
  it('starts paused at the first step, its marker at the start of its relations', () => {
    expect(PLAYBACK_START).toEqual({ step: 0, elapsed: 0, mode: 'paused' });
    expect(currentEntry(PLAYBACK_START, flat)).toBe(0);
    expect(markerProgress(PLAYBACK_START, false)).toBe(0);
  });

  it('moves the marker along while a step plays, then holds it at the end before the next step', () => {
    let playback = play(PLAYBACK_START, flat);
    expect(playback.mode).toBe('playing');
    playback = advance(playback, flat, TRAVEL_TIME / 2, 1);
    expect(markerProgress(playback, false)).toBeCloseTo(0.5);
    playback = advance(playback, flat, TRAVEL_TIME / 2, 1);
    expect(markerProgress(playback, false)).toBe(1);
    expect(currentEntry(playback, flat)).toBe(0);
    playback = advance(playback, flat, STEP_TIME - TRAVEL_TIME, 1);
    expect(playback).toEqual({ step: 1, elapsed: 0, mode: 'playing' });
  });

  it('plays faster or slower with the speed', () => {
    const twice = advance(play(PLAYBACK_START, flat), flat, STEP_TIME / 2, 2);
    expect(twice.step).toBe(1);
    const half = advance(play(PLAYBACK_START, flat), flat, STEP_TIME, 0.5);
    expect(half).toMatchObject({ step: 0, elapsed: STEP_TIME / 2 });
    expect(SPEEDS).toEqual([0.5, 1, 2, 4]);
  });

  it('stops at the end of the last step, and plays again from the first', () => {
    const ended = advance(play(PLAYBACK_START, flat), flat, STEP_TIME * 20, 1);
    expect(ended).toEqual({ step: 4, elapsed: STEP_TIME, mode: 'paused' });
    expect(isFinished(ended, flat)).toBe(true);
    expect(markerProgress(ended, false)).toBe(1);
    expect(play(ended, flat)).toEqual({ step: 0, elapsed: 0, mode: 'playing' });
  });

  it('pauses where it is, and plays on from there', () => {
    const halfway = advance(play(PLAYBACK_START, flat), flat, TRAVEL_TIME / 2, 1);
    const paused = pause(halfway);
    expect(paused.mode).toBe('paused');
    expect(advance(paused, flat, 10_000, 1)).toBe(paused);
    expect(play(paused, flat)).toEqual({ ...halfway, mode: 'playing' });
  });

  it('plays one step’s travel when a step is chosen while paused, then waits there', () => {
    let playback = goTo(PLAYBACK_START, flat, 2);
    expect(playback).toEqual({ step: 2, elapsed: 0, mode: 'stepping' });
    playback = advance(playback, flat, STEP_TIME * 3, 1);
    expect(playback).toEqual({ step: 2, elapsed: TRAVEL_TIME, mode: 'paused' });
  });

  it('keeps playing when a step is chosen while playing', () => {
    const playing = advance(play(PLAYBACK_START, flat), flat, 100, 1);
    expect(goTo(playing, flat, 3)).toEqual({ step: 3, elapsed: 0, mode: 'playing' });
  });

  it('goes to the next and the previous entry, staying within the scenario', () => {
    expect(next(PLAYBACK_START, flat).step).toBe(1);
    const last = goTo(PLAYBACK_START, flat, 4);
    expect(next(last, flat)).toBe(last);
    expect(previous(last, flat).step).toBe(3);
    expect(previous(PLAYBACK_START, flat)).toEqual({ step: 0, elapsed: 0, mode: 'stepping' });
  });

  it('steps over an aggregated step at once, and lands on its first step', () => {
    const second = next(PLAYBACK_START, folded);
    expect(second.step).toBe(1);
    expect(currentEntry(second, folded)).toBe(1);
    expect(next(second, folded).step).toBe(4);
    expect(previous(goTo(PLAYBACK_START, folded, 2), folded).step).toBe(1);
  });

  it('plays an aggregated step for as long as one step', () => {
    const playing = play(goTo(PLAYBACK_START, folded, 1), folded);
    expect(advance(playing, folded, STEP_TIME, 1).step).toBe(4);
  });

  it('follows a container expanded or collapsed mid-step: the steps it stood for are played one by one', () => {
    // Collapsed, the third step plays inside the aggregated one; expanded, it plays on its own.
    const atThird: Playback = { step: 2, elapsed: 300, mode: 'playing' };
    expect(currentEntry(atThird, folded)).toBe(1);
    expect(currentEntry(atThird, flat)).toBe(2);
    expect(advance(atThird, flat, STEP_TIME, 1).step).toBe(3);
    expect(advance(atThird, folded, STEP_TIME, 1).step).toBe(4);
  });

  it('shows the marker at the end it travels to, without moving, when the system asks for reduced motion', () => {
    expect(markerProgress(PLAYBACK_START, true)).toBe(1);
    const halfway = advance(play(PLAYBACK_START, flat), flat, TRAVEL_TIME / 2, 1);
    expect(markerProgress(halfway, true)).toBe(1);
  });

  it('does nothing for a scenario with no steps', () => {
    expect(play(PLAYBACK_START, empty)).toBe(PLAYBACK_START);
    expect(next(PLAYBACK_START, empty)).toBe(PLAYBACK_START);
    expect(goTo(PLAYBACK_START, empty, 3)).toBe(PLAYBACK_START);
    expect(advance({ ...PLAYBACK_START, mode: 'playing' }, empty, 500, 1).mode).toBe('paused');
    expect(currentEntry(PLAYBACK_START, empty)).toBeUndefined();
  });

  it('ignores time that does not count forward', () => {
    const playing = play(PLAYBACK_START, flat);
    expect(advance(playing, flat, -50, 1)).toEqual(playing);
    expect(advance(playing, flat, Number.NaN, 1)).toEqual(playing);
  });
});

const timelines = [flat, folded, timelineOf(['store']), timelineOf(['store', 'system'])];
const somePlayback = fc.record({
  step: fc.integer({ min: -2, max: 7 }),
  elapsed: fc.double({ min: 0, max: STEP_TIME, noNaN: true }),
  mode: fc.constantFrom('playing' as const, 'stepping' as const, 'paused' as const),
});
const someTimeline = fc.constantFrom(...timelines);
const someSpeed = fc.constantFrom(...SPEEDS);
const someTime = fc.double({ min: 0, max: STEP_TIME * 8, noNaN: true });

describe('playback, for any position and any time', () => {
  it('stays on a step of the scenario, its marker between the two ends', () => {
    fc.assert(
      fc.property(somePlayback, someTimeline, someTime, someSpeed, (start, timeline, ms, speed) => {
        const after = advance(start, timeline, ms, speed);
        expect(after.step).toBeGreaterThanOrEqual(0);
        expect(after.step).toBeLessThan(timeline.steps);
        expect(after.elapsed).toBeGreaterThanOrEqual(0);
        expect(after.elapsed).toBeLessThanOrEqual(STEP_TIME);
        const progress = markerProgress(after, false);
        expect(progress).toBeGreaterThanOrEqual(0);
        expect(progress).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('never goes back while it plays, and counts time the same in one go or in two', () => {
    fc.assert(
      fc.property(
        somePlayback,
        someTimeline,
        someTime,
        someTime,
        someSpeed,
        (start, timeline, a, b, speed) => {
          const playing = play(goTo(start, timeline, start.step), timeline);
          const once = advance(playing, timeline, a + b, speed);
          const twice = advance(advance(playing, timeline, a, speed), timeline, b, speed);
          expect(twice.step).toBe(once.step);
          expect(twice.mode).toBe(once.mode);
          expect(twice.elapsed).toBeCloseTo(once.elapsed, 6);
          expect(once.step).toBeGreaterThanOrEqual(Math.min(playing.step, timeline.steps - 1));
        },
      ),
    );
  });

  it('plays every entry in turn, ending paused at the last', () => {
    fc.assert(
      fc.property(someTimeline, (timeline) => {
        let playback = play(PLAYBACK_START, timeline);
        const seen: number[] = [];
        for (let frame = 0; frame < 400 && playback.mode === 'playing'; frame++) {
          const entry = currentEntry(playback, timeline);
          if (entry !== undefined && seen.at(-1) !== entry) seen.push(entry);
          playback = advance(playback, timeline, STEP_TIME / 7, 1);
        }
        expect(seen).toEqual(timeline.entries.map((_, at) => at));
        expect(isFinished(playback, timeline)).toBe(true);
      }),
    );
  });

  it('never changes the scenario it plays', () => {
    const project = scenarioProject(['system']);
    const before = JSON.stringify(project);
    const timeline = scenarioTimeline(project, theScenario(project));
    let playback = play(PLAYBACK_START, timeline);
    for (let frame = 0; frame < 50; frame++) playback = advance(playback, timeline, 100, 2);
    void next(previous(playback, timeline), timeline);
    expect(JSON.stringify(project)).toBe(before);
  });
});
