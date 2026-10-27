import { STEP_TIME, scenarioTimeline } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import type { Clock } from '../scenarios/session';
import { loadSample } from '../test/sample';
import { PlaybackSession } from './playback';
import { PagePreferences, type PreferencesHost } from './preferences';
import { PAGE_LANGUAGE_KEY, PAGE_THEME_KEY } from './keys';

const sample = loadSample();
const scenario = sample.scenarios[0]!;
const timeline = scenarioTimeline(sample, scenario);

/** A clock whose frames run when the test says. */
function testClock() {
  let now = 0;
  let waiting: (() => void) | undefined;
  const clock: Clock = {
    now: () => now,
    request: (callback) => {
      waiting = callback;
      return 1;
    },
    cancel: () => {
      waiting = undefined;
    },
  };
  return {
    clock,
    frame: (passed: number) => {
      now += passed;
      const run = waiting;
      waiting = undefined;
      run?.();
    },
  };
}

describe('Playback in a read-only page', () => {
  it('opens a scenario at its first step, paused, and plays it once its view is open', () => {
    const { clock, frame } = testClock();
    const session = new PlaybackSession(clock);
    session.open(scenario.id);
    session.sync({ project: sample, viewId: scenario.view, timeline });
    expect(session.getState()).toMatchObject({ scenario: scenario.id, step: 0, mode: 'paused' });
    session.play();
    expect(session.getState().mode).toBe('playing');
    for (let at = 0; at < 3; at += 1) frame(100);
    expect(session.getElapsed()).toBe(300);
    // A late frame moves playback on by 100 ms at most.
    frame(STEP_TIME);
    expect(session.getElapsed()).toBe(400);
    for (let at = 0; at < STEP_TIME / 100; at += 1) frame(100);
    expect(session.getState().step).toBeGreaterThan(0);
  });

  it('plays nothing while the scenario’s view is not open', () => {
    const session = new PlaybackSession(testClock().clock);
    session.open(scenario.id);
    session.sync({ project: sample, viewId: 'elsewhere', timeline: undefined });
    session.play();
    expect(session.getState().mode).toBe('paused');
  });

  it('goes to the step an address names once the view is open, and never records', () => {
    const session = new PlaybackSession(testClock().clock);
    session.guide({ scenario: scenario.id, action: 'go-to-step', step: 2 });
    expect(session.getState().step).toBe(0);
    session.sync({ project: sample, viewId: scenario.view, timeline });
    expect(session.getState()).toMatchObject({ step: 2, recording: false, canRecord: false });
    session.close();
    expect(session.getState().scenario).toBeUndefined();
  });

  it('plays the alternative chosen at a decision, stops before it when asked, and says so (ADR 0078)', () => {
    const orders = loadSample('order-process');
    const order = orders.scenarios.find((each) => each.id === 'an-order')!;
    const { clock, frame } = testClock();
    const session = new PlaybackSession(clock);
    const said: string[] = [];
    const sync = () => {
      const { choices } = session.getState();
      session.sync({
        project: orders,
        viewId: order.view,
        timeline: scenarioTimeline(orders, order, undefined, choices),
        choices,
        announce: (text) => said.push(text),
      });
    };
    session.open(order.id);
    sync();
    session.setStopAtDecisions(true);
    session.play();
    for (let at = 0; at < (STEP_TIME * 4) / 100; at += 1) frame(100);
    expect(session.getState()).toMatchObject({ step: 2, mode: 'paused' });
    expect(said.at(-1)).toBe(
      'Paused before “Is every item in stock?”. Choose an alternative, then play on.',
    );
    session.choose({ decision: 'stock-check', alternative: 'out-of-stock' });
    sync();
    expect(said.at(-1)).toBe('“No” plays at “Is every item in stock?”.');
    session.play();
    frame(100);
    expect(session.getState()).toMatchObject({ step: 9, mode: 'playing' });
    // A step of the alternative not chosen chooses it.
    session.goToStep(4);
    sync();
    expect(session.getState()).toMatchObject({ step: 4, choices: { 'stock-check': 'in-stock' } });
    session.open(order.id);
    expect(session.getState().choices).toEqual({});
  });
});

/** A window's storage and system theme, as the page's preferences read them. */
function host(stored: Record<string, string> = {}, dark = false) {
  const items = new Map(Object.entries(stored));
  const attributes = new Map<string, string>();
  const value: PreferencesHost = {
    localStorage: {
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, item) => void items.set(key, item),
      removeItem: (key) => void items.delete(key),
    },
    matchMedia: () => ({
      matches: dark,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    document: {
      documentElement: { setAttribute: (name, item) => void attributes.set(name, item) },
    },
  };
  return { value, items, attributes };
}

describe('The reader’s preferences in a page', () => {
  it('follow the system until the reader chooses, and keep the choice', () => {
    const { value, items, attributes } = host({}, true);
    const preferences = new PagePreferences(value);
    expect(preferences.get()).toMatchObject({ theme: 'system', shownTheme: 'dark' });
    expect(attributes.get('data-theme')).toBe('dark');
    preferences.change({ theme: 'light', language: 'es' });
    expect(preferences.get()).toMatchObject({ shownTheme: 'light', shownLanguage: 'es' });
    expect(items.get(PAGE_THEME_KEY)).toBe('light');
    expect(items.get(PAGE_LANGUAGE_KEY)).toBe('es');
    preferences.change({ theme: 'system', language: 'system' });
    expect(items.has(PAGE_THEME_KEY)).toBe(false);
    expect(items.has(PAGE_LANGUAGE_KEY)).toBe(false);
  });

  it('start from what the reader chose before, and pass over what is not a choice', () => {
    expect(new PagePreferences(host({ [PAGE_THEME_KEY]: 'dark' }).value).get().shownTheme).toBe(
      'dark',
    );
    expect(new PagePreferences(host({ [PAGE_THEME_KEY]: 'sepia' }).value).get().theme).toBe(
      'system',
    );
  });

  it('still work where storage is refused', () => {
    const { value } = host();
    const refusing: PreferencesHost = {
      ...value,
      localStorage: {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('denied');
        },
        removeItem: () => {
          throw new Error('denied');
        },
      },
    };
    const preferences = new PagePreferences(refusing);
    preferences.change({ theme: 'dark' });
    expect(preferences.get().shownTheme).toBe('dark');
  });
});
