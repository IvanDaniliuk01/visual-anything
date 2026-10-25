/**
 * The language the app reads in now (ADR-0038): the one the person chose, or the browser's. The
 * language context sets it for code outside React, such as announcements, which reads it with
 * {@link currentLanguage}; components read it from the context, through `useT()`.
 */
import type { Preferences } from '@visual-anything/core';
import { LANGUAGES, type Language } from './translate';

/** The language a person chooses: English, Spanish, or whichever the browser asks for. */
export type LanguageChoice = Preferences['language'];

/**
 * The language the browser asks for: the first of the person's languages that the app reads, by its
 * primary subtag, so that any "es-*" is Spanish; English when none is.
 */
export function browserLanguage(languages: readonly string[] | undefined): Language {
  for (const tag of languages ?? []) {
    const primary = tag.split('-')[0]?.toLowerCase();
    const found = LANGUAGES.find((language) => language === primary);
    if (found !== undefined) return found;
  }
  return 'en';
}

/** The language to read in: the chosen one, or the browser's for "system". */
export function resolveLanguage(
  choice: LanguageChoice,
  languages: readonly string[] | undefined,
): Language {
  return choice === 'system' ? browserLanguage(languages) : choice;
}

/** The person's languages as the browser lists them, most wanted first. */
export function navigatorLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  const listed = navigator.languages as readonly string[] | undefined;
  if (listed !== undefined && listed.length > 0) return listed;
  return navigator.language ? [navigator.language] : [];
}

let current: Language = 'en';
const listeners = new Set<() => void>();

/** The language the app reads in now, for code outside React. */
export function currentLanguage(): Language {
  return current;
}

/** Calls `listener` after every change of the current language; returns what stops it. */
export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Makes `language` the current one, and says so on the page: `<html lang>` follows it. */
export function setCurrentLanguage(language: Language): void {
  if (typeof document !== 'undefined') document.documentElement.lang = language;
  if (language === current) return;
  current = language;
  for (const listener of [...listeners]) listener();
}

/** Back to English and no listeners, so that each test starts afresh. */
export function resetLanguageForTests(): void {
  listeners.clear();
  current = 'en';
  if (typeof document !== 'undefined') document.documentElement.lang = 'en';
}
