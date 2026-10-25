/**
 * The read-only page's Theme and Language controls, as the app's header shows them, kept by the page
 * itself in the browser (ADR 0041) rather than by the local program.
 */
import type { ThemeChoice } from '@visual-anything/core';
import { useId, type ComponentType } from 'react';
import { useT } from '../i18n';
import { browserLanguage, navigatorLanguages, type LanguageChoice } from '../i18n/language';
import type { Language } from '../i18n/translate';
import { LanguageIcon, MonitorIcon, MoonIcon, SunIcon } from '../shell/icons';
import { usePagePreferences, type PagePreferences } from './preferences';

const THEMES: readonly { choice: ThemeChoice; label: string; Icon: ComponentType }[] = [
  { choice: 'system', label: 'Match the system', Icon: MonitorIcon },
  { choice: 'light', label: 'Light', Icon: SunIcon },
  { choice: 'dark', label: 'Dark', Icon: MoonIcon },
];

/** Each language by its own name, as people look for it whatever the page reads in now. */
const NAMES: Readonly<Record<Language, string>> = { en: 'English', es: 'Español' };

export function ThemeChoiceControl({ preferences }: { preferences: PagePreferences }) {
  const t = useT();
  const shown = usePagePreferences(preferences);
  const name = useId();
  return (
    <div className="theme-control" role="radiogroup" aria-label={t('Theme')}>
      {THEMES.map(({ choice, label, Icon }) => (
        <label
          key={choice}
          className="theme-option"
          title={
            choice === 'system'
              ? t(
                  shown.systemTheme === 'dark'
                    ? 'Match the system (dark now)'
                    : 'Match the system (light now)',
                )
              : t(label)
          }
        >
          <input
            type="radio"
            className="visually-hidden"
            name={name}
            value={choice}
            checked={shown.theme === choice}
            onChange={() => preferences.change({ theme: choice })}
          />
          <Icon />
          <span className="visually-hidden">{t(label)}</span>
        </label>
      ))}
    </div>
  );
}

export function LanguageChoiceControl({ preferences }: { preferences: PagePreferences }) {
  const t = useT();
  const shown = usePagePreferences(preferences);
  const id = useId();
  const browser = NAMES[browserLanguage(navigatorLanguages())];
  return (
    <div className="language-control">
      <label htmlFor={id} title={t('Language')}>
        <LanguageIcon />
        <span className="visually-hidden">{t('Language')}</span>
      </label>
      <select
        id={id}
        value={shown.language}
        onChange={(event) => preferences.change({ language: event.target.value as LanguageChoice })}
      >
        <option value="system">{t('Match the browser ({language})', { language: browser })}</option>
        {(Object.keys(NAMES) as Language[]).map((language) => (
          <option key={language} value={language} lang={language}>
            {NAMES[language]}
          </option>
        ))}
      </select>
    </div>
  );
}
