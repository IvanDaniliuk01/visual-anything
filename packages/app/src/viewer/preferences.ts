/**
 * The reader's theme and language in a read-only page (ADR 0041): each follows the system, the
 * browser's languages and its light or dark setting, unless the reader chooses one, which the page
 * keeps in the browser's storage as a preference of the page. It is the only thing the page keeps, and
 * a page where storage is refused still works, keeping the choice until it closes.
 */
import { resolveTheme, type ThemeChoice, type ThemeName } from '@visual-anything/core';
import { useSyncExternalStore } from 'react';
import { navigatorLanguages, resolveLanguage, type LanguageChoice } from '../i18n/language';
import type { Language } from '../i18n/translate';
import { PAGE_LANGUAGE_KEY, PAGE_THEME_KEY } from './keys';

/** What the reader chose. */
export interface PageChoices {
  theme: ThemeChoice;
  language: LanguageChoice;
}

/** What the page shows now. */
export interface PageShown extends PageChoices {
  /** The theme drawn now. */
  shownTheme: ThemeName;
  /** The system's theme, to say what matching it means now. */
  systemTheme: ThemeName;
  /** The language read in now. */
  shownLanguage: Language;
}

/** What the store reads and writes of the window. */
export interface PreferencesHost {
  localStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  matchMedia?: (
    query: string,
  ) => Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'>;
  addEventListener?: (type: 'languagechange', listener: () => void) => void;
  document?: { documentElement: { setAttribute(name: string, value: string): void } };
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The reader's preferences in this page, followed as the system and the reader change them. */
export class PagePreferences {
  private choices: PageChoices;
  private shown: PageShown;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly host: PreferencesHost) {
    this.choices = { theme: storedTheme(host), language: storedLanguage(host) };
    this.shown = this.work();
    host.matchMedia?.(DARK_QUERY).addEventListener('change', this.refresh);
    host.addEventListener?.('languagechange', this.refresh);
    this.apply();
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly get = (): PageShown => this.shown;

  /** Changes the reader's choices, and keeps them for the next time the page opens. */
  change(changes: Partial<PageChoices>): void {
    this.choices = { ...this.choices, ...changes };
    keep(
      this.host,
      PAGE_THEME_KEY,
      this.choices.theme === 'system' ? undefined : this.choices.theme,
    );
    keep(
      this.host,
      PAGE_LANGUAGE_KEY,
      this.choices.language === 'system' ? undefined : this.choices.language,
    );
    this.refresh();
  }

  private readonly refresh = (): void => {
    const next = this.work();
    const was = this.shown;
    if (
      next.theme === was.theme &&
      next.language === was.language &&
      next.shownTheme === was.shownTheme &&
      next.systemTheme === was.systemTheme &&
      next.shownLanguage === was.shownLanguage
    ) {
      return;
    }
    this.shown = next;
    this.apply();
    for (const listener of [...this.listeners]) listener();
  };

  private work(): PageShown {
    const systemTheme: ThemeName = this.host.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';
    return {
      ...this.choices,
      systemTheme,
      shownTheme: resolveTheme(this.choices.theme, systemTheme === 'dark'),
      shownLanguage: resolveLanguage(this.choices.language, navigatorLanguages()),
    };
  }

  /** Writes the theme on the page, so that the panels show it with the canvas. */
  private apply(): void {
    this.host.document?.documentElement.setAttribute('data-theme', this.shown.shownTheme);
  }
}

function storedTheme(host: PreferencesHost): ThemeChoice {
  const stored = read(host, PAGE_THEME_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function storedLanguage(host: PreferencesHost): LanguageChoice {
  const stored = read(host, PAGE_LANGUAGE_KEY);
  return stored === 'en' || stored === 'es' ? stored : 'system';
}

function read(host: PreferencesHost, key: string): string | null {
  try {
    return host.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function keep(host: PreferencesHost, key: string, value: string | undefined): void {
  try {
    if (value === undefined) host.localStorage?.removeItem(key);
    else host.localStorage?.setItem(key, value);
  } catch {
    // Without storage the choice lasts until the page closes.
  }
}

/** What the page shows now, and how the reader changes it. */
export function usePagePreferences(store: PagePreferences): PageShown {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
