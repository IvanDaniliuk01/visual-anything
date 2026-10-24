import type { ThemeChoice } from '@visual-anything/core';
import { useId, type ComponentType } from 'react';
import { MonitorIcon, MoonIcon, SunIcon } from '../shell/icons';
import { usePreferences } from './usePreferences';

const OPTIONS: readonly { choice: ThemeChoice; label: string; Icon: ComponentType }[] = [
  { choice: 'system', label: 'Match the system', Icon: MonitorIcon },
  { choice: 'light', label: 'Light', Icon: SunIcon },
  { choice: 'dark', label: 'Dark', Icon: MoonIcon },
];

/**
 * The Theme control in the header: three native radios, Match the system, Light and Dark, each shown
 * as an icon. The arrow keys move the choice as in any radio group, each choice applies in the tab at
 * once, and the local program keeps the latest one as the person's preference.
 */
export function ThemeControl() {
  const { preferences, systemTheme, change } = usePreferences();
  const name = useId();
  return (
    <div className="theme-control" role="radiogroup" aria-label="Theme">
      {OPTIONS.map(({ choice, label, Icon }) => (
        <label
          key={choice}
          className="theme-option"
          title={choice === 'system' ? `${label} (${systemTheme} now)` : label}
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
          <span className="visually-hidden">{label}</span>
        </label>
      ))}
    </div>
  );
}
