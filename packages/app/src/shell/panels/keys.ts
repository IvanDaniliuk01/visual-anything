import { IS_APPLE } from '../../live/platform';
import type { PanelSide } from './layout';

/** Each panel's shortcut, as `aria-keyshortcuts` writes it. */
export const PANEL_SHORTCUT: Readonly<Record<PanelSide, string>> = {
  model: 'Alt+Shift+M',
  inspector: 'Alt+Shift+N',
};

/** Each panel's shortcut as the app shows it, on this system. */
export const PANEL_SHORTCUT_SHOWN: Readonly<Record<PanelSide, string>> = IS_APPLE
  ? { model: '⌥⇧M', inspector: '⌥⇧N' }
  : PANEL_SHORTCUT;

/**
 * The keys of the side panels, as the canvas's keyboard help lists them after its own, in English; the
 * help shows them translated.
 */
export const PANEL_KEYS: readonly { keys: string; does: string }[] = [
  {
    keys: 'Alt+Shift+M (⌥⇧M on macOS)',
    does: 'Collapse the model panel, or open it again; these keys work wherever the focus is, except while typing',
  },
  { keys: 'Alt+Shift+N (⌥⇧N on macOS)', does: 'Collapse the inspector, or open it again' },
  {
    keys: 'Left and Right arrows, on the edge of a panel',
    does: 'Move the edge by 16 pixels, making the panel wider or narrower; double-clicking the edge gives back its default width',
  },
  {
    keys: 'Home and End, on the edge of a panel',
    does: 'Make the panel as narrow or as wide as it goes: from 200 pixels to half the window',
  },
  { keys: 'Enter, on the edge of a panel', does: 'Collapse the panel' },
];
