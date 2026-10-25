import { useId } from 'react';
import { LanguageIcon } from '../shell/icons';
import { usePreferences } from '../theme/usePreferences';
import { browserLanguage, navigatorLanguages, type LanguageChoice } from './language';
import type { Language } from './translate';
import { useT } from './useT';

/** Each language by its own name, as people look for it whatever the app reads in now. */
const NAMES: Readonly<Record<Language, string>> = { en: 'English', es: 'Español' };

/**
 * The Language control in the header: English, Español, or matching the browser, which says which
 * language that is now. The choice applies in the tab at once, and the local program keeps the latest
 * one as the person's preference.
 */
export function LanguageControl() {
  const t = useT();
  const { preferences, change } = usePreferences();
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
        value={preferences.language}
        onChange={(event) => change({ language: event.target.value as LanguageChoice })}
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
