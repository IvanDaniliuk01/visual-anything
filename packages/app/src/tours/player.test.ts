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
    expect(player.getState()).toEqual({ tour: tour.id, step: 1, reveal: 0 });
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
    expect(player.getState()).toEqual({ tour: undefined, step: 0, reveal: 0 });
    expect(heard).toHaveBeenCalledTimes(6);
  });

  // Reveals, one press at a time (ADR 0077).
  const revealing: TourFile = {
    ...tour,
    steps: tour.steps.map((step, at) =>
      at === 1
        ? { ...step, reveal: [{ marks: ['booking-agent'] }, { marks: ['appointments-api'] }] }
        : step,
    ),
  };

  it('goes through a step’s reveals one press at a time, and back through them', () => {
    const player = new TourPlayer();
    player.start(revealing);
    const at = () => [player.getState().step, player.getState().reveal];
    const seen: number[][] = [];
    for (let press = 0; press < 4; press++) {
      player.next();
      seen.push(at());
    }
    expect(seen).toEqual([
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 0],
    ]);
    // Back into a step, it shows the step with all it reveals, then takes them away one at a time.
    player.previous();
    expect(at()).toEqual([1, 2]);
    player.previous();
    player.previous();
    expect(at()).toEqual([1, 0]);
    player.previous();
    expect(at()).toEqual([0, 0]);
  });

  it('goes to a step, the first and the last at their start, and stays at the end of the last', () => {
    const player = new TourPlayer();
    player.start(revealing, 1);
    player.next();
    player.goTo(1);
    expect(player.getState().reveal).toBe(0);
    player.last();
    expect(player.getState()).toEqual({ tour: tour.id, step: 2, reveal: 0 });
    const heard = vi.fn();
    player.subscribe(heard);
    player.next();
    expect(heard).not.toHaveBeenCalled();
  });

  it('keeps a reveal that a changed step still has', () => {
    const player = new TourPlayer();
    player.start(revealing, 1);
    player.next();
    player.next();
    const fewer = revealing.steps.map((step, at) =>
      at === 1 ? { ...step, reveal: step.reveal?.slice(0, 1) } : step,
    );
    player.sync({ ...sample, tours: [{ ...revealing, steps: fewer }] });
    expect(player.getState().reveal).toBe(1);
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
    // ADR 0077: Enter goes forward too, and the letters open the index, pause, replay and go back.
    ['Enter', {}, 'next'],
    ['Enter', { shiftKey: true }, 'previous'],
    ['i', {}, 'index'],
    ['I', { shiftKey: true }, 'index'],
    ['p', {}, 'pause'],
    ['P', {}, 'pause'],
    ['r', {}, 'replay'],
    ['b', {}, 'back'],
  ])('read %j as %s', (key, modifiers, action) => {
    expect(tourKeyAction({ key, ...modifiers })).toBe(action);
  });

  it('leave other keys, and keys with Control, Alt or Meta, to the browser', () => {
    expect(tourKeyAction({ key: 'a' })).toBeUndefined();
    expect(tourKeyAction({ key: 'Tab' })).toBeUndefined();
    expect(tourKeyAction({ key: 'ArrowRight', ctrlKey: true })).toBeUndefined();
    expect(tourKeyAction({ key: 'ArrowLeft', altKey: true })).toBeUndefined();
    expect(tourKeyAction({ key: 'End', metaKey: true })).toBeUndefined();
    expect(tourKeyAction({ key: 'r', ctrlKey: true })).toBeUndefined();
    expect(tourKeyAction({ key: 'p', metaKey: true })).toBeUndefined();
    expect(tourKeyAction({ key: 'Enter', altKey: true })).toBeUndefined();
  });

  it('a wireless presenter’s Page Down and Page Up go through reveals one at a time', () => {
    const player = new TourPlayer();
    const revealing: TourFile = {
      ...tour,
      steps: tour.steps.map((step, at) =>
        at === 0 ? { ...step, reveal: [{ marks: ['booking-agent'] }] } : step,
      ),
    };
    player.start(revealing);
    for (const key of ['PageDown', 'PageDown', 'PageUp']) {
      const action = tourKeyAction({ key });
      if (action) applyTourKey(player, action);
    }
    expect(player.getState()).toMatchObject({ step: 0, reveal: 1 });
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
    expect(range.getState()).toBe('let-go');
    session.set({ mode: 'playing', step: 9 });
    range.check();
    expect(session.pause).not.toHaveBeenCalled();
  });

  // ADR 0077: a pause asked for from the card keeps the range.
  it('keeps its range through a pause from the card, and still stops at its last step', () => {
    const session = fakeSession(PAUSED);
    const range = new ScenarioRange(session);
    const heard = vi.fn();
    range.subscribe(heard);
    range.start({ scenario: 'booking', from: 0, to: 2 });
    expect(range.getState()).toBe('opening');
    session.set({ scenario: 'booking', step: 0 });
    range.check();
    expect(range.getState()).toBe('playing');
    session.set({ step: 1 });
    range.pause();
    range.check();
    expect(range.getState()).toBe('paused');
    expect(session.getState().mode).toBe('paused');
    range.resume();
    expect(range.getState()).toBe('playing');
    expect(session.play).toHaveBeenCalledTimes(2);
    session.set({ step: 3 });
    range.check();
    expect(range.getState()).toBe('ended');
    expect(session.goToStep).toHaveBeenLastCalledWith(2);
    expect(heard).toHaveBeenCalled();
  });

  it('plays its range again from its first step', () => {
    const session = fakeSession(PAUSED);
    const range = new ScenarioRange(session);
    range.start({ scenario: 'booking', from: 1, to: 2 });
    session.set({ scenario: 'booking', step: 1 });
    range.check();
    session.set({ step: 3 });
    range.check();
    expect(range.getState()).toBe('ended');
    range.replay();
    expect(session.goToStep).toHaveBeenLastCalledWith(1);
    expect(range.getState()).toBe('playing');
    expect(session.getState()).toMatchObject({ step: 1, mode: 'playing' });
  });

  it('ends when the scenario itself stops on the range’s last step', () => {
    const session = fakeSession(PAUSED);
    const range = new ScenarioRange(session);
    range.start({ scenario: 'booking', from: 0, to: 4 });
    session.set({ scenario: 'booking', step: 0 });
    range.check();
    // The scenario's last step played to its end: playback pauses there by itself.
    session.set({ step: 4, mode: 'paused' });
    range.check();
    expect(range.getState()).toBe('ended');
  });

  it('waits for its scenario when paused before it opened, and plays once resumed', () => {
    const session = fakeSession(PAUSED);
    const range = new ScenarioRange(session);
    range.start({ scenario: 'booking', from: 0, to: 2 });
    range.pause();
    session.set({ scenario: 'booking', step: 0 });
    range.check();
    expect(session.play).not.toHaveBeenCalled();
    expect(range.getState()).toBe('paused');
    range.resume();
    expect(session.play).toHaveBeenCalledTimes(1);
    expect(range.getState()).toBe('playing');
  });

  it('does nothing without a range', () => {
    const session = fakeSession(PAUSED);
    const range = new ScenarioRange(session);
    range.pause();
    range.resume();
    range.replay();
    expect(range.getState()).toBe('none');
    expect(session.play).not.toHaveBeenCalled();
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
