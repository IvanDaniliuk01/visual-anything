import { createContext, useContext, useSyncExternalStore } from 'react';
import { currentLanguage, subscribeLanguage } from './language';
import { translatorFor, type Translator } from './t';
import type { Language } from './translate';

/** The language the components inside a `LanguageProvider` read in; null outside one. */
export const LanguageContext = createContext<Language | null>(null);

/**
 * Translates the app's texts into the language it reads in, and re-renders the component when that
 * changes. Outside a `LanguageProvider` it follows `currentLanguage()`.
 */
export function useT(): Translator {
  const provided = useContext(LanguageContext);
  const current = useSyncExternalStore(subscribeLanguage, currentLanguage, currentLanguage);
  return translatorFor(provided ?? current);
}
