import { STEP_TIME, scenarioTimeline, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, TourFile, ViewFile } from '@visual-anything/schema';
import { describe, expect, it, vi } from 'vitest';
import type { Clock } from '../scenarios/session';
import { loadSample } from '../test/sample';
import { PlaybackSession } from '../viewer/playback';
import { TourPlayer, applyTourKey, tourKeyAction } from './player';
import { ScenarioRange, type RangeSession } from './range';

const sample = loadSample();
const tour = sample.tours[0] as TourFile;

describe('TourPlayer', () => {
  it('starts a tour at a step, moves within it and ends it, telling its listeners', () => {
    const player = new TourPlayer();
    const heard = vi.fn();
    player.subscribe(heard);
    player.start(tour, 1);
    expect(player.getState()).toEqual({ tour: tour.id, step: 1 });
    player.next();
    player.next();
    expect(player.getState().step).toBe(2);
    player.previous();
    player.first();
    expect(player.getState().step).toBe(0);
    player.previous();
    expect(player.getState().step).toBe(0);
    player.last();
    expect(player.getState().step).toBe(tour.steps.length - 1);
    player.end();
    expect(player.getState()).toEqual({ tour: undefined, step: 0 });
    expect(heard).toHaveBeenCalledTimes(6);
  });

  it('plays no tour without steps, and moves nothing while no tour plays', () => {
    const player = new TourPlayer();
    player.start({ ...tour, steps: [] });
    player.next();
    expect(player.playing).toBe(false);
  });

  it('ends a tour deleted while it plays, and stays on a step a changed tour still has', () => {
    const player = new TourPlayer();
    player.start(tour, 2);
    player.sync({ ...sample, tours: [{ ...tour, steps: tour.steps.slice(0, 1) }] });
    expect(player.getState().step).toBe(0);
    player.sync({ ...sample, tours: [] });
    expect(player.playing).toBe(false);
  });
});

describe('the keys of full-screen playback', () => {
  it.each([
    ['ArrowRight', {}, 'next'],
    ['ArrowDown', {}, 'next'],
    ['PageDown', {}, 'next'],
    [' ', {}, 'next'],
    [' ', { shiftKey: true }, 'previous'],
    ['ArrowLeft', {}, 'previous'],
    ['ArrowUp', {}, 'previous'],
    ['PageUp', {}, 'previous'],
    ['Home', {}, 'first'],
    ['End', {}, 'last'],
    ['Escape', {}, 'end'],
  ])('read %j as %s', (key, modifiers, action) => {
    expect(tourKeyAction({ key, ...modifiers })).toBe(action);
  });

  it('leave other keys, and keys with Control, Alt or Meta, to the browser', () => {
    expect(tourKeyAction({ key: 'a' })).toBeUndefined();
    expect(tourKeyAction({ key: 'Enter' })).toBeUndefined();
    expect(tourKeyAction({ key: 'ArrowRight', ctrlKey: true })).toBeUndefined();
    expect(tourKeyAction({ key: 'ArrowLeft', altKey: true })).toBeUndefined();
    expect(tourKeyAction({ key: 'End', metaKey: true })).toBeUndefined();
  });

  it('move the player', () => {
    const player = new TourPlayer();
    player.start(tour);
    applyTourKey(player, 'last');
    expect(player.getState().step).toBe(tour.steps.length - 1);
    applyTourKey(player, 'end');
    expect(player.playing).toBe(false);
  });
});

describe('ScenarioRange', () => {
  function fakeSession(start: ReturnType<RangeSession['getState']>) {
    let state = start;
    const session: RangeSession & { set: (next: Partial<typeof state>) => void } = {
      getState: () => state,
      play: vi.fn(() => {
        state = { ...state, mode: 'playing' };
      }),
      pause: vi.fn(() => {
        state = { ...state, mode: 'paused' };
      }),
      goToStep: vi.fn((step: number) => {
        state = { ...state, step };
      }),
      // One entry of the timeline for each step, as when no container is collapsed.
      entryOf: (step: number) => (state.scenario === undefined ? undefined : step),
      set: (next) => {
        state = { ...state, ...next };
      },
    };
    return session;
  }
  const PAUSED = {
    scenario: undefined,
    recording: false,
    canRecord: false,
    step: 0,
    mode: 'paused' as const,
    speed: 1 as const,
    asks: 0,
  };

  it('plays once the scenario is open at its first step, and pauses back on its last', () => {
    const session = fakeSession(PAUSED);
    const range = new ScenarioRange(session);
    range.start({ scenario: 'booking', from: 1, to: 2 });
    expect(session.play).not.toHaveBeenCalled();
    session.set({ scenario: 'booking', step: 1 });
    range.check();
    expect(session.play).toHaveBeenCalledTimes(1);
    session.set({ step: 2 });
    range.check();
    expect(session.pause).not.toHaveBeenCalled();
    session.set({ step: 3 });
    range.check();
    expect(session.pause).toHaveBeenCalledTimes(1);
    expect(session.goToStep).toHaveBeenCalledWith(2);
  });

  it('lets go once the person pauses or closes the scenario', () => {
    const session = fakeSession(PAUSED);
    const range = new ScenarioRange(session);
    range.start({ scenario: 'booking', from: 0, to: 4 });
    session.set({ scenario: 'booking' });
    range.check();
    session.set({ mode: 'paused' });
    range.check();
    session.set({ mode: 'playing', step: 9 });
    range.check();
    expect(session.pause).not.toHaveBeenCalled();
  });

  describe('under a collapsed container, where one entry plays several steps', () => {
    /** The sample with its first view collapsing Scheduling, and a session on its scenario. */
    function collapsed() {
      const [view, ...rest] = sample.views;
      const folded: ViewFile & { collapsed?: Id[] } = {
        ...(view as ViewFile),
        collapsed: ['scheduling'],
      };
      const project: ProjectSnapshot = { ...sample, views: [folded, ...rest] };
      const scenario = project.scenarios[0];
      if (!scenario) throw new Error('The sample has no scenario.');
      const timeline = scenarioTimeline(project, scenario);
      const aggregated = timeline.entries.findIndex((entry) => entry.kind === 'aggregated');
      const entry = timeline.entries[aggregated];
      if (!entry || entry.count < 2) throw new Error('Nothing is aggregated.');
      let frame: (() => void) | undefined;
      let now = 0;
      const clock: Clock = {
        now: () => now,
        request: (callback) => {
          frame = callback;
          return 1;
        },
        cancel: () => {
          frame = undefined;
        },
      };
      const session = new PlaybackSession(clock);
      session.open(scenario.id);
      session.sync({ project, viewId: scenario.view, timeline });
      const run = (ms: number) => {
        for (let passed = 0; passed < ms; passed += 50) {
          now += 50;
          const next = frame;
          frame = undefined;
          next?.();
        }
      };
      return { session, scenario, timeline, aggregated, entry, run };
    }

    it('plays from a step inside an aggregated step, where going to it lands', () => {
      const { session, scenario, entry, timeline } = collapsed();
      const inside = entry.first + 1;
      // The step's view state opens the scenario at the step it plays from: its entry's first.
      session.goToStep(inside);
      expect(session.getState().step).toBe(entry.first);
      const range = new ScenarioRange(session);
      range.start({ scenario: scenario.id, from: inside, to: timeline.steps - 1 });
      expect(session.getState().mode).toBe('playing');
    });

    it('stops after the aggregated step its last step is in, and pauses back on it', () => {
      const { session, scenario, entry, aggregated, run } = collapsed();
      const range = new ScenarioRange(session);
      session.goToStep(0);
      range.start({ scenario: scenario.id, from: 0, to: entry.first + 1 });
      expect(session.getState().mode).toBe('playing');
      // Each entry plays for STEP_TIME; past the aggregated one, the range pauses back on it.
      for (let at = 0; at <= aggregated + 1 && session.getState().mode === 'playing'; at += 1) {
        run(STEP_TIME / 4);
        range.check();
        run(STEP_TIME / 4);
        range.check();
        run(STEP_TIME / 4);
        range.check();
        run(STEP_TIME / 4);
        range.check();
      }
      expect(session.getState()).toMatchObject({ mode: 'paused', step: entry.first });
    });
  });
});
