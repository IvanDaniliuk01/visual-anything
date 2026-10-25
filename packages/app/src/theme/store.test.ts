import {
  DEFAULT_PREFERENCES,
  type PreferenceChanges,
  type Preferences,
} from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GRID_NOT_CONNECTED,
  HOLD_TIMEOUT_MS,
  LANGUAGE_NOT_CONNECTED,
  LANGUAGE_STORAGE_KEY,
  NOT_CONNECTED,
  SEND_DELAY_MS,
  THEME_STORAGE_KEY,
  appliedPreferences,
  changePreferences,
  holdTheme,
  linkPreferences,
  resetPreferencesForTests,
  startPreferences,
  subscribePreferences,
  type PreferencesAnswer,
  type PreferencesLink,
} from './store';
import { stubSystemTheme } from './testing';

function dataTheme(): string | undefined {
  return document.documentElement.dataset.theme;
}

/** A live session as the store sees it, whose answers the test gives. */
function fakeLink(overrides: Partial<PreferencesLink> = {}) {
  const asked: PreferenceChanges[] = [];
  let answer: (answer: PreferencesAnswer) => void = () => {};
  const link: PreferencesLink = {
    status: 'open',
    preferences: DEFAULT_PREFERENCES,
    setPreferences: vi.fn((changes: PreferenceChanges) => {
      asked.push(changes);
      return new Promise<PreferencesAnswer>((resolve) => {
        answer = resolve;
      });
    }),
    notify: vi.fn(),
    ...overrides,
  };
  return { link, asked, answer: (each: PreferencesAnswer) => answer(each) };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  resetPreferencesForTests();
  vi.useRealTimers();
});

describe('startPreferences', () => {
  it('follows the system by default, and draws light where the browser cannot tell', () => {
    startPreferences(window);
    expect(appliedPreferences()).toMatchObject({
      preferences: DEFAULT_PREFERENCES,
      theme: 'light',
    });
    expect(dataTheme()).toBe('light');
  });

  it('follows the system’s dark setting, and its changes while matching the system', () => {
    const system = stubSystemTheme('dark');
    startPreferences(window);
    expect(appliedPreferences().theme).toBe('dark');
    expect(dataTheme()).toBe('dark');
    system.set('light');
    expect(appliedPreferences()).toMatchObject({ theme: 'light', systemTheme: 'light' });
    expect(dataTheme()).toBe('light');
  });

  it('takes the theme hint out of the address, and keeps it for the tab', () => {
    window.history.replaceState(null, '', '/?x=1#theme=dark&view=overview');
    startPreferences(window);
    expect(appliedPreferences().preferences.theme).toBe('dark');
    expect(dataTheme()).toBe('dark');
    expect(window.location.hash).toBe('#view=overview');
    expect(window.location.search).toBe('?x=1');
    expect(window.sessionStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('removes the fragment when the hint was all it held', () => {
    window.history.replaceState(null, '', '/#theme=light');
    startPreferences(window);
    expect(window.location.href).toBe('http://localhost:3000/');
  });

  it('uses the choice the tab kept when the address has none', () => {
    stubSystemTheme('light');
    window.sessionStorage.setItem(THEME_STORAGE_KEY, 'dark');
    startPreferences(window);
    expect(appliedPreferences().preferences.theme).toBe('dark');
    expect(dataTheme()).toBe('dark');
  });

  it.each(['sepia', '', 'constructor', 'system'])(
    'reads only the theme names it knows from the address: %j',
    (hint) => {
      window.history.replaceState(null, '', `/#theme=${hint}`);
      startPreferences(window);
      expect(appliedPreferences().preferences.theme).toBe('system');
    },
  );

  it('starts in the language the tab kept, and keeps a new choice for a reload', () => {
    window.sessionStorage.setItem(LANGUAGE_STORAGE_KEY, 'es');
    startPreferences(window);
    expect(appliedPreferences().preferences.language).toBe('es');
    changePreferences({ language: 'en' });
    expect(window.sessionStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
  });

  it('says that a language chosen while not connected applies to this tab only', () => {
    startPreferences(window);
    const { link } = fakeLink({ status: 'closed' });
    linkPreferences(link);
    changePreferences({ language: 'es' });
    expect(link.notify).toHaveBeenCalledWith('info', LANGUAGE_NOT_CONNECTED);
    changePreferences({ theme: 'dark' });
    expect(link.notify).toHaveBeenLastCalledWith('info', NOT_CONNECTED);
  });

  it('says that the grid, snapping or the rulers turned on while not connected apply to this tab only', () => {
    startPreferences(window);
    const { link } = fakeLink({ status: 'closed' });
    linkPreferences(link);
    changePreferences({ grid: true });
    expect(link.notify).toHaveBeenLastCalledWith('info', GRID_NOT_CONNECTED);
    changePreferences({ rulers: true });
    expect(link.notify).toHaveBeenLastCalledWith('info', GRID_NOT_CONNECTED);
    expect(appliedPreferences().preferences).toMatchObject({ grid: true, rulers: true });
  });

  it('ignores a kept language it does not know', () => {
    window.sessionStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
    startPreferences(window);
    expect(appliedPreferences().preferences.language).toBe('system');
  });

  it('ignores a kept choice it does not know', () => {
    window.sessionStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    startPreferences(window);
    expect(appliedPreferences().preferences.theme).toBe('system');
  });

  it('starts once', () => {
    window.history.replaceState(null, '', '/#theme=dark');
    startPreferences(window);
    changePreferences({ theme: 'light' });
    window.history.replaceState(null, '', '/#theme=dark');
    startPreferences(window);
    expect(appliedPreferences().preferences.theme).toBe('light');
  });

  it('works without session storage or matchMedia', () => {
    const broken = {
      location: window.location,
      history: window.history,
      document,
      get sessionStorage(): Storage {
        throw new DOMException('denied', 'SecurityError');
      },
    };
    expect(() => startPreferences(broken)).not.toThrow();
    changePreferences({ theme: 'dark' });
    expect(dataTheme()).toBe('dark');
  });
});

describe('changePreferences', () => {
  it('applies a change in the tab at once, and keeps the choice for the tab', () => {
    startPreferences(window);
    const listener = vi.fn();
    subscribePreferences(listener);
    changePreferences({ theme: 'dark' });
    expect(appliedPreferences().preferences.theme).toBe('dark');
    expect(dataTheme()).toBe('dark');
    expect(listener).toHaveBeenCalled();
    expect(window.sessionStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('gives the same value until something changes', () => {
    startPreferences(window);
    const first = appliedPreferences();
    expect(appliedPreferences()).toBe(first);
    changePreferences({ theme: 'light' });
    expect(appliedPreferences()).not.toBe(first);
  });

  it('sends the latest change once, half a second after the last one', async () => {
    startPreferences(window);
    const { link, asked } = fakeLink();
    linkPreferences(link);
    changePreferences({ theme: 'dark' });
    vi.advanceTimersByTime(SEND_DELAY_MS - 100);
    changePreferences({ theme: 'light' });
    vi.advanceTimersByTime(SEND_DELAY_MS - 100);
    changePreferences({ theme: 'dark', grid: true });
    expect(asked).toEqual([]);
    vi.advanceTimersByTime(SEND_DELAY_MS);
    await settle();
    expect(asked).toEqual([{ theme: 'dark', grid: true }]);
  });

  it('sends at once when the tab is hidden', () => {
    startPreferences(window);
    const { link, asked } = fakeLink();
    linkPreferences(link);
    changePreferences({ theme: 'dark' });
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    visibility.mockRestore();
    expect(asked).toEqual([{ theme: 'dark' }]);
  });

  it('keeps the person’s choice over what the program sends until it answers', async () => {
    startPreferences(window);
    const { link, asked, answer } = fakeLink();
    linkPreferences(link);
    changePreferences({ theme: 'dark' });
    vi.advanceTimersByTime(SEND_DELAY_MS);
    expect(asked).toHaveLength(1);

    // Another tab's change arrives first: the theme stays, the grid follows.
    linkPreferences({ ...link, preferences: { ...DEFAULT_PREFERENCES, grid: true } });
    expect(appliedPreferences().preferences).toMatchObject({ theme: 'dark', grid: true });

    answer({ ok: true, preferences: { ...DEFAULT_PREFERENCES, theme: 'dark', grid: true } });
    await settle();
    linkPreferences({ ...link, preferences: { ...DEFAULT_PREFERENCES, theme: 'light' } });
    expect(appliedPreferences().preferences.theme).toBe('light');
  });

  it('sends one change at a time, and the next after the answer', async () => {
    startPreferences(window);
    const { link, asked, answer } = fakeLink();
    linkPreferences(link);
    changePreferences({ theme: 'dark' });
    vi.advanceTimersByTime(SEND_DELAY_MS);
    changePreferences({ theme: 'light' });
    vi.advanceTimersByTime(SEND_DELAY_MS * 3);
    expect(asked).toEqual([{ theme: 'dark' }]);
    expect(appliedPreferences().preferences.theme).toBe('light');

    answer({ ok: true, preferences: { ...DEFAULT_PREFERENCES, theme: 'dark' } });
    await settle();
    expect(appliedPreferences().preferences.theme).toBe('light');
    vi.advanceTimersByTime(SEND_DELAY_MS);
    expect(asked).toEqual([{ theme: 'dark' }, { theme: 'light' }]);
  });

  it('puts back the program’s value when it refuses, and says why', async () => {
    startPreferences(window);
    const program: Preferences = { ...DEFAULT_PREFERENCES, theme: 'light' };
    const { link, answer } = fakeLink({ preferences: program });
    linkPreferences(link);
    changePreferences({ theme: 'dark' });
    vi.advanceTimersByTime(SEND_DELAY_MS);
    answer({ ok: false, problems: [{ code: 'invalid-command', message: 'No.' }] });
    await settle();
    expect(appliedPreferences().preferences.theme).toBe('light');
    expect(dataTheme()).toBe('light');
    expect(link.notify).toHaveBeenCalledWith('error', 'Could not change your preferences: No.');
  });

  it('keeps the change in the tab when the connection closes before the answer', async () => {
    startPreferences(window);
    const { link, answer } = fakeLink();
    linkPreferences(link);
    changePreferences({ theme: 'dark' });
    vi.advanceTimersByTime(SEND_DELAY_MS);
    linkPreferences({ ...link, status: 'closed' });
    answer({ ok: false, problems: [{ code: 'connection-closed', message: 'Closed.' }] });
    await settle();
    expect(appliedPreferences().preferences.theme).toBe('dark');
    expect(link.notify).toHaveBeenCalledWith('info', NOT_CONNECTED);
  });

  it('waits while connecting, and sends when the connection opens', () => {
    startPreferences(window);
    const { link, asked } = fakeLink({ status: 'connecting', preferences: undefined });
    linkPreferences(link);
    changePreferences({ theme: 'dark' });
    vi.advanceTimersByTime(SEND_DELAY_MS * 2);
    expect(asked).toEqual([]);
    linkPreferences({ ...link, status: 'open', preferences: DEFAULT_PREFERENCES });
    expect(asked).toEqual([{ theme: 'dark' }]);
    expect(appliedPreferences().preferences.theme).toBe('dark');
  });

  it('says the change applies to this tab only while Visual Anything is not connected', () => {
    startPreferences(window);
    const { link, asked } = fakeLink({ status: 'closed' });
    linkPreferences(link);
    changePreferences({ theme: 'dark' });
    vi.advanceTimersByTime(SEND_DELAY_MS);
    expect(asked).toEqual([]);
    expect(link.notify).toHaveBeenCalledWith('info', NOT_CONNECTED);
    expect(appliedPreferences().preferences.theme).toBe('dark');
  });

  it('keeps the change in the tab, silently, when the session cannot carry preferences', () => {
    startPreferences(window);
    const { link } = fakeLink();
    linkPreferences({ status: 'open', preferences: DEFAULT_PREFERENCES, notify: link.notify });
    changePreferences({ theme: 'dark' });
    vi.advanceTimersByTime(SEND_DELAY_MS);
    expect(link.notify).not.toHaveBeenCalled();
    expect(appliedPreferences().preferences.theme).toBe('dark');
  });

  it('stops using a link once it is let go', () => {
    startPreferences(window);
    const { link, asked } = fakeLink();
    const unlink = linkPreferences(link);
    unlink();
    changePreferences({ theme: 'dark' });
    vi.advanceTimersByTime(SEND_DELAY_MS);
    expect(asked).toEqual([]);
  });
});

describe('the program’s preferences', () => {
  it('replace what the tab started with', () => {
    window.history.replaceState(null, '', '/#theme=dark');
    startPreferences(window);
    linkPreferences(fakeLink({ preferences: { ...DEFAULT_PREFERENCES, rulers: true } }).link);
    expect(appliedPreferences().preferences).toEqual({ ...DEFAULT_PREFERENCES, rulers: true });
    expect(window.sessionStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });
});

describe('holdTheme', () => {
  it('lets a canvas show the new theme first, then changes the page with it', () => {
    startPreferences(window);
    const hold = holdTheme();
    changePreferences({ theme: 'dark' });
    expect(appliedPreferences().theme).toBe('dark');
    expect(dataTheme()).toBe('light');
    hold.shown('light');
    expect(dataTheme()).toBe('light');
    hold.shown('dark');
    expect(dataTheme()).toBe('dark');
  });

  it('changes the page anyway half a second after the choice', () => {
    startPreferences(window);
    holdTheme();
    changePreferences({ theme: 'dark' });
    vi.advanceTimersByTime(HOLD_TIMEOUT_MS - 1);
    expect(dataTheme()).toBe('light');
    vi.advanceTimersByTime(1);
    expect(dataTheme()).toBe('dark');
  });

  it('changes the page at once when no canvas holds the theme', () => {
    startPreferences(window);
    const hold = holdTheme();
    hold.release();
    changePreferences({ theme: 'dark' });
    expect(dataTheme()).toBe('dark');
  });

  it('shows the theme waiting when the last hold is released', () => {
    startPreferences(window);
    const hold = holdTheme();
    changePreferences({ theme: 'dark' });
    hold.release();
    expect(dataTheme()).toBe('dark');
  });
});
