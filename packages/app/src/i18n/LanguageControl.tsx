import { useId } from 'react';
import { CheckIcon } from '../shell/icons';
import { usePreferences } from '../theme/usePreferences';
import { browserLanguage, navigatorLanguages, type LanguageChoice } from './language';
import type { Language } from './translate';
import { useT } from './useT';

/** Each language by its own name, as people look for it whatever the app reads in now. */
const NAMES: Readonly<Record<Language, string>> = { en: 'English', es: 'Español' };

/**
 * The Language control, in the header's Language and theme (A5): three radios, matching the browser,
 * which says which language that is now, English and Español, the one chosen checked. The choice
 * applies in the tab at once, and the local program keeps the latest one as the person's preference.
 */
export function LanguageControl() {
  const t = useT();
  const { preferences, change } = usePreferences();
  const name = useId();
  const browser = NAMES[browserLanguage(navigatorLanguages())];
  const options: readonly { choice: LanguageChoice; text: string; lang?: Language }[] = [
    { choice: 'system', text: t('Match the browser ({language})', { language: browser }) },
    ...(Object.keys(NAMES) as Language[]).map((language) => ({
      choice: language,
      text: NAMES[language],
      lang: language,
    })),
  ];
  return (
    <div className="language-choices" role="radiogroup" aria-label={t('Language')}>
      {options.map(({ choice, text, lang }) => (
        <label key={choice} className="language-choice">
          <input
            type="radio"
            className="visually-hidden"
            name={name}
            value={choice}
            checked={preferences.language === choice}
            onChange={() => change({ language: choice })}
          />
          <CheckIcon className="language-check" />
          <span {...(lang === undefined ? {} : { lang })}>{text}</span>
        </label>
      ))}
    </div>
  );
}
