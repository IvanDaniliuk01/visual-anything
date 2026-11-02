import {
  drawingOf,
  storedColorsIn,
  type StoredColorsInDark,
  type ThemeName,
} from '@visual-anything/core';
import { useEditor } from '../../editor/EditorContext';
import { usePreferences } from '../../theme/usePreferences';

/**
 * The theme whose colors the inspector shows and compares a pick with: the one the person's
 * preferences draw the canvas in, so that what the inspector shows is what the canvas draws
 * (ADR-0033). The hints still look at both themes.
 */
export function useShownTheme(): ThemeName {
  return usePreferences().theme;
}

/**
 * How the open view's drawing defaults draw the project's stored colors on the dark canvas (ADR
 * 0087), whatever the theme shown: the hints look at the dark canvas as it draws them.
 */
export function useStoredColorsInDark(): StoredColorsInDark {
  const { project, viewId } = useEditor();
  return drawingOf(project, viewId).colors.storedColorsInDark;
}

/**
 * How the theme shown draws the project's stored colors: adapted only on the dark canvas of a view
 * whose drawing defaults ask for it, as stored otherwise. The inspector shows the stored color, which
 * a pick changes and compares with as ADR 0033's A2 says, with the color drawn beside it.
 */
export function useStoredColorsShown(): StoredColorsInDark {
  const theme = useShownTheme();
  const stored = useStoredColorsInDark();
  return storedColorsIn({ colors: { storedColorsInDark: stored } }, theme);
}
