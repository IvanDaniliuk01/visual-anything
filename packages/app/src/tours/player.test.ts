import type { TourFile } from '@visual-anything/schema';
import { describe, expect, it, vi } from 'vitest';
import { loadSample } from '../test/sample';
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
});
