/**
 * The picker's recent colors are the `recentColors` preference, which the local program keeps for each
 * person (ADR-0032): a committed color goes to it through `preferences/set`, as every preference does.
 */
import {
  DEFAULT_PREFERENCES,
  type PreferenceChanges,
  type PreferencesAnswer,
} from '@visual-anything/core';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SEND_DELAY_MS,
  appliedPreferences,
  linkPreferences,
  resetPreferencesForTests,
  startPreferences,
} from '../../theme/store';
import { useColorChoices } from './useColorChoices';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  resetPreferencesForTests();
  vi.useRealTimers();
});

describe('useColorChoices', () => {
  it('sends a committed color to the local program as the recent colors preference', () => {
    startPreferences(window);
    const asked: PreferenceChanges[] = [];
    const setPreferences = vi.fn((changes: PreferenceChanges) => {
      asked.push(changes);
      return new Promise<PreferencesAnswer>(() => {});
    });
    linkPreferences({
      status: 'open',
      preferences: { ...DEFAULT_PREFERENCES, recentColors: ['#112233'] },
      setPreferences,
      notify: vi.fn(),
    });
    const { result } = renderHook(() => useColorChoices());
    expect(result.current.suggestions).toEqual(['#112233']);
    act(() => result.current.remember('#aabbcc'));
    // At once in the tab, and in the program soon after, as every preference.
    expect(appliedPreferences().preferences.recentColors).toEqual(['#AABBCC', '#112233']);
    expect(result.current.suggestions).toEqual(['#AABBCC', '#112233']);
    act(() => {
      vi.advanceTimersByTime(SEND_DELAY_MS);
    });
    expect(asked).toEqual([{ recentColors: ['#AABBCC', '#112233'] }]);
  });

  it('sends nothing for a color that is already the most recent', () => {
    startPreferences(window);
    const setPreferences = vi.fn(() => new Promise<PreferencesAnswer>(() => {}));
    linkPreferences({
      status: 'open',
      preferences: { ...DEFAULT_PREFERENCES, recentColors: ['#AABBCC'] },
      setPreferences,
      notify: vi.fn(),
    });
    const { result } = renderHook(() => useColorChoices());
    act(() => result.current.remember('#aabbcc'));
    act(() => {
      vi.advanceTimersByTime(SEND_DELAY_MS);
    });
    expect(setPreferences).not.toHaveBeenCalled();
  });
});
