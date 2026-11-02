import type { ThemeChoice } from '@visual-anything/core';
import { useId, type ComponentType } from 'react';
import { useT } from '../i18n';
import { MonitorIcon, MoonIcon, SunIcon } from '../shell/icons';
import { usePreferences } from './usePreferences';

const OPTIONS: readonly { choice: ThemeChoice; label: string; Icon: ComponentType }[] = [
  { choice: 'system', label: 'Match the system', Icon: MonitorIcon },
  { choice: 'light', label: 'Light', Icon: SunIcon },
  { choice: 'dark', label: 'Dark', Icon: MoonIcon },
];

/** The shorter name an option shows beside its icon in the header's menu, whole in its tooltip. */
const SHOWN: Readonly<Record<ThemeChoice, string>> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

/**
 * The Theme control: three native radios, Match the system, Light and Dark, each shown as an icon, and
 * in the header's Language and theme with a short name beside it (`labelled`, A5). The arrow keys move
 * the choice as in any radio group, each choice applies in the tab at once, and the local program
 * keeps the latest one as the person's preference.
 */
export function ThemeControl({ labelled = false }: { labelled?: boolean }) {
  const t = useT();
  const { preferences, systemTheme, change } = usePreferences();
  const name = useId();
  return (
    <div
      className={labelled ? 'theme-control theme-control-labelled' : 'theme-control'}
      role="radiogroup"
      aria-label={t('Theme')}
    >
      {OPTIONS.map(({ choice, label, Icon }) => (
        <label
          key={choice}
          className="theme-option"
          title={
            choice === 'system'
              ? t(
                  systemTheme === 'dark'
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
            checked={preferences.theme === choice}
            onChange={() => change({ theme: choice })}
          />
          <Icon />
          <span className="visually-hidden">{t(label)}</span>
          {labelled && (
            <span className="theme-option-name" aria-hidden="true">
              {t(SHOWN[choice])}
            </span>
          )}
        </label>
      ))}
    </div>
  );
}
