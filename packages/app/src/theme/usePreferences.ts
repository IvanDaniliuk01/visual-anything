/**
 * The preferences and the theme for components: what the tab applies, how to change it, the link that
 * keeps the local program's preferences and the tab's in step, and the hold a canvas takes on the theme.
 */
import type { PreferenceChanges, Preferences, ThemeName } from '@visual-anything/core';
import { useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { LiveContext, type Live } from '../live/context';
import {
  appliedPreferences,
  changePreferences,
  holdTheme,
  linkPreferences,
  startPreferences,
  subscribePreferences,
  type PreferencesLink,
  type ThemeHold,
} from './store';

function subscribe(listener: () => void): () => void {
  startPreferences(window);
  return subscribePreferences(listener);
}

/** What the tab applies now, and how the person changes it; it works with or without a live session. */
export function usePreferences(): {
  preferences: Preferences;
  /** The theme to draw in. */
  theme: ThemeName;
  /** The system's theme, to say what matching the system means now. */
  systemTheme: ThemeName;
  change: (changes: PreferenceChanges) => void;
} {
  const applied = useSyncExternalStore(subscribe, appliedPreferences, appliedPreferences);
  return { ...applied, change: changePreferences };
}

/**
 * Keeps the local program's preferences and this tab's in step through the live session, while the
 * component that calls it is mounted. The header calls it, so that every screen does.
 */
export function usePreferencesLink(): void {
  const live = useContext(LiveContext);
  const link = useMemo(() => linkOf(live), [live]);
  useEffect(() => {
    startPreferences(window);
    return link === undefined ? undefined : linkPreferences(link);
  }, [link]);
}

/**
 * Holds the theme for a canvas while `active`: a new theme reaches the page when the canvas calls the
 * function this returns with it, so that the panels and the canvas change in the same frame.
 */
export function useThemeHold(active: boolean): (theme: ThemeName) => void {
  const hold = useRef<ThemeHold | undefined>(undefined);
  useEffect(() => {
    if (!active) return;
    const held = holdTheme();
    hold.current = held;
    return () => {
      held.release();
      if (hold.current === held) hold.current = undefined;
    };
  }, [active]);
  return useCallback((theme: ThemeName) => {
    hold.current?.shown(theme);
  }, []);
}

/** What the store needs of a live session that may not carry preferences yet. */
type MaybeWithPreferences = Live & {
  preferences?: Preferences | undefined;
  setPreferences?: PreferencesLink['setPreferences'];
};

function linkOf(live: Live | null): PreferencesLink | undefined {
  if (live === null) return undefined;
  const { status, preferences, setPreferences, notify } = live as MaybeWithPreferences;
  return {
    status,
    preferences,
    setPreferences: typeof setPreferences === 'function' ? setPreferences : undefined,
    notify,
  };
}
