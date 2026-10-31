/**
 * The physical-space panel's keys (ADR 0076): Alt+Shift+P (⌥⇧P on macOS) opens it beside the canvas
 * or closes it, wherever the focus is but where people type, as the side panels' keys do; and the
 * keys of its edge. The canvas's keyboard help lists them after the side panels'.
 */
import { IS_APPLE } from '../live/platform';
import type { ShortcutKeys } from '../live/shortcuts';

/** The panel's shortcut, as `aria-keyshortcuts` writes it. */
export const SPACE_PANEL_SHORTCUT = 'Alt+Shift+P';

/** The panel's shortcut as the app shows it, on this system. */
export const SPACE_PANEL_SHORTCUT_SHOWN = IS_APPLE ? '⌥⇧P' : SPACE_PANEL_SHORTCUT;

/** Whether a key press opens or closes the panel: Alt+Shift+P, by the key or by its place. */
export function spacePanelShortcut(keys: ShortcutKeys): boolean {
  if (!keys.altKey || !keys.shiftKey || keys.ctrlKey || keys.metaKey) return false;
  const typed = keys.key.toLowerCase();
  // Option types another letter on macOS: its place says which key it is.
  return /^[a-z]$/.test(typed) ? typed === 'p' : keys.code === 'KeyP';
}

/** The panel's keys, as the canvas's keyboard help lists them, in English; it shows them translated. */
export const SPACE_KEYS: readonly { keys: string; does: string }[] = [
  {
    keys: 'Alt+Shift+P (⌥⇧P on macOS)',
    does: 'Open the physical-space panel beside the canvas, or close it; these keys work wherever the focus is, except while typing',
  },
  {
    keys: 'Left and Right arrows, on the edge of the physical-space panel',
    does: 'Make the panel wider or narrower by 16 pixels; Home and End make it as narrow or as wide as it goes, from 280 pixels to half the window',
  },
  {
    keys: 'Arrow keys, in the physical-space panel',
    does: 'Turn the space as dragging that way does; with Shift, pan it',
  },
  {
    keys: '+, − and 0, in the physical-space panel',
    does: 'Zoom in, zoom out, and fit everything the panel shows',
  },
  {
    keys: 'Enter, in the physical-space panel',
    does: 'Frame the selection; in the panel’s list, select the row’s element and frame it',
  },
  {
    keys: 'Drag, Shift+drag and the wheel, in the physical-space panel',
    does: 'Turn, pan and zoom; with two fingers, pan and pinch to zoom; a double click frames what is there',
  },
  {
    keys: 'M and R, in the physical-space panel',
    does: 'Choose whether the handles move or rotate the selected posed elements',
  },
  {
    keys: 'Alt while dragging a handle (⌥ on macOS)',
    does: 'Move or rotate without snapping to 1 cm and 15°',
  },
  {
    keys: 'Escape, in the physical-space panel',
    does: 'Let a handle’s gesture go, or clear the selection',
  },
];
