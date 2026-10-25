import type { ThemeName } from '@visual-anything/core';
import { usePreferences } from '../../theme/usePreferences';

/**
 * The theme whose colors the inspector shows and compares a pick with: the one the person's
 * preferences draw the canvas in, so that what the inspector shows is what the canvas draws
 * (ADR-0033). The hints still look at both themes.
 */
export function useShownTheme(): ThemeName {
  return usePreferences().theme;
}
