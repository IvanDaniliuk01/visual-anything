import { useLayoutEffect, useSyncExternalStore, type ReactNode } from 'react';
import { usePreferences } from '../theme/usePreferences';
import { adoptLanguage, navigatorLanguages, resolveLanguage, setCurrentLanguage } from './language';
import type { Language } from './translate';
import { LanguageContext } from './useT';

function subscribeToBrowser(onChange: () => void): () => void {
  window.addEventListener('languagechange', onChange);
  return () => {
    window.removeEventListener('languagechange', onChange);
  };
}

/** The browser's languages as one text, so that the same list is the same snapshot. */
function browserSnapshot(): string {
  return navigatorLanguages().join(',');
}

interface LanguageProviderProps {
  /** A language to read in whatever the person chose, as tests use; absent otherwise. */
  language?: Language | undefined;
  children: ReactNode;
}

/**
 * The language the app reads in, for the components inside: the one the person chose as a
 * preference, or the browser's when they chose none. It keeps `currentLanguage()` and `<html lang>`
 * in step with it.
 */
export function LanguageProvider({ language, children }: LanguageProviderProps) {
  const { preferences } = usePreferences();
  const browser = useSyncExternalStore(subscribeToBrowser, browserSnapshot, () => '');
  const resolved =
    language ?? resolveLanguage(preferences.language, browser === '' ? [] : browser.split(','));
  // Before the components inside render, so that what they call outside React reads in it too.
  adoptLanguage(resolved);
  useLayoutEffect(() => {
    setCurrentLanguage(resolved);
  }, [resolved]);
  return <LanguageContext value={resolved}>{children}</LanguageContext>;
}
