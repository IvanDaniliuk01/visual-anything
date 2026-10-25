/**
 * The colors the picker offers and the ones it remembers: the person's recent colors, kept as the
 * `recentColors` preference by the local program (ADR-0032), then the colors the open project stores.
 */
import { MAX_RECENT_COLORS } from '@visual-anything/core';
import type { Color } from '@visual-anything/schema';
import { useContext } from 'react';
import { EditorContext } from '../../editor/EditorContext';
import { appliedPreferences, changePreferences } from '../../theme/store';
import { usePreferences } from '../../theme/usePreferences';
import { suggestedColors, withRecentColor } from './colors';

export interface ColorChoices {
  /** The swatches to offer: recent colors first, then the project's. */
  suggestions: readonly Color[];
  /** Puts a color the person committed first among the recent colors. */
  remember: (color: Color) => void;
}

export function useColorChoices(): ColorChoices {
  const editor = useContext(EditorContext);
  const recent = usePreferences().preferences.recentColors;
  return {
    suggestions: editor
      ? suggestedColors(recent, editor.project)
      : recent.slice(0, MAX_RECENT_COLORS),
    remember: rememberColor,
  };
}

/** Puts a color first among the recent colors, as they are when it is committed. */
function rememberColor(color: Color): void {
  const recent = appliedPreferences().preferences.recentColors;
  const next = withRecentColor(recent, color);
  if (next.length === recent.length && next.every((each, at) => each === recent[at])) return;
  changePreferences({ recentColors: next });
}
