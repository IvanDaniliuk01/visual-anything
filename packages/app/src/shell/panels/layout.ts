/**
 * The side panels' layout: how wide the model panel, left of the canvas, and the inspector, right of
 * it, are, and whether each is collapsed to a strip. Each panel takes the width the person gives its
 * inner edge, from 200 px to half the window. The layout is the person's preference `sidePanels`,
 * which the local program keeps, never the project (ADR 0032's clarification of 2026-10-30).
 */
import {
  DEFAULT_PREFERENCES,
  MAX_SIDE_PANEL_WIDTH,
  MIN_SIDE_PANEL_WIDTH,
} from '@visual-anything/core';
import type { ShortcutKeys } from '../../live/shortcuts';

/** The side panels, by the side of the canvas they are on: the model panel left, the inspector right. */
export type PanelSide = 'model' | 'inspector';

export const PANEL_SIDES: readonly PanelSide[] = ['model', 'inspector'];

/** One side panel: the width the person gave it, in CSS pixels, and whether it is collapsed. */
export interface PanelState {
  readonly width: number;
  readonly collapsed: boolean;
}

export type PanelLayout = Readonly<Record<PanelSide, PanelState>>;

/** The narrowest a side panel is. */
export const MIN_PANEL_WIDTH = MIN_SIDE_PANEL_WIDTH;

/** How far an arrow key moves a panel's edge. */
export const PANEL_STEP = 16;

export const DEFAULT_LAYOUT: PanelLayout = DEFAULT_PREFERENCES.sidePanels;

/** The width each panel opens at, and gets back with a double click on its edge: 18rem and 20rem. */
export const DEFAULT_PANEL_WIDTH: Readonly<Record<PanelSide, number>> = {
  model: DEFAULT_LAYOUT.model.width,
  inspector: DEFAULT_LAYOUT.inspector.width,
};

/**
 * The widest a side panel is in a window this wide: half of it, never less than the narrowest, and
 * never more than the widest the preference keeps.
 */
export function maxPanelWidth(windowWidth: number): number {
  return Math.min(MAX_SIDE_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, Math.floor(windowWidth / 2)));
}

/** Whether two layouts are the same, panel by panel. */
export function sameLayout(a: PanelLayout, b: PanelLayout): boolean {
  return PANEL_SIDES.every(
    (side) => a[side].width === b[side].width && a[side].collapsed === b[side].collapsed,
  );
}

/** The width a panel shows at: the width chosen, in whole pixels, within what the window allows now. */
export function shownWidth(width: number, windowWidth: number): number {
  return Math.min(maxPanelWidth(windowWidth), Math.max(MIN_PANEL_WIDTH, Math.round(width)));
}

/**
 * The width a key on a panel's edge gives it: the arrows move the edge by 16 px, towards the canvas or
 * away from it, and Home and End take it to the narrowest and the widest. Other keys give nothing.
 */
export function keyedWidth(
  side: PanelSide,
  key: string,
  width: number,
  windowWidth: number,
): number | undefined {
  // The model panel's edge is its right side, and the inspector's its left side.
  const wider = side === 'model' ? 'ArrowRight' : 'ArrowLeft';
  const narrower = side === 'model' ? 'ArrowLeft' : 'ArrowRight';
  if (key === wider) return shownWidth(width + PANEL_STEP, windowWidth);
  if (key === narrower) return shownWidth(width - PANEL_STEP, windowWidth);
  if (key === 'Home') return MIN_PANEL_WIDTH;
  if (key === 'End') return maxPanelWidth(windowWidth);
  return undefined;
}

/** The key, with Alt and Shift, that collapses each panel or opens it again. */
export const PANEL_SHORTCUT_LETTER: Readonly<Record<PanelSide, string>> = {
  model: 'm',
  inspector: 'n',
};

/**
 * The panel a key press collapses or opens: Alt+Shift+M the model panel, Alt+Shift+N the inspector
 * (⌥⇧M and ⌥⇧N on macOS). Not Alt+Shift+I, which opens the feedback form of Chrome and Edge.
 */
export function panelShortcut(keys: ShortcutKeys): PanelSide | undefined {
  if (!keys.altKey || !keys.shiftKey || keys.ctrlKey || keys.metaKey) return undefined;
  const letter = letterOf(keys);
  return PANEL_SIDES.find((side) => PANEL_SHORTCUT_LETTER[side] === letter);
}

/** The letter a key is: the key itself on Latin layouts, and its place where Option types another. */
function letterOf({ key, code }: ShortcutKeys): string {
  const typed = key.toLowerCase();
  if (/^[a-z]$/.test(typed)) return typed;
  return /^Key([A-Z])$/.exec(code)?.[1]?.toLowerCase() ?? typed;
}
