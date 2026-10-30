/**
 * The side panels' layout: how wide the model panel, left of the canvas, and the inspector, right of
 * it, are, and whether each is collapsed to a strip. Each panel takes the width the person gives its
 * inner edge, from 200 px to half the window. The layout is kept per browser in local storage, never
 * in the project: every read and write is guarded, and anything it cannot read gives the defaults.
 */
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
export const MIN_PANEL_WIDTH = 200;

/** How far an arrow key moves a panel's edge. */
export const PANEL_STEP = 16;

/** The width each panel opens at, and gets back with a double click on its edge: 18rem and 20rem. */
export const DEFAULT_PANEL_WIDTH: Readonly<Record<PanelSide, number>> = {
  model: 288,
  inspector: 320,
};

export const DEFAULT_LAYOUT: PanelLayout = {
  model: { width: DEFAULT_PANEL_WIDTH.model, collapsed: false },
  inspector: { width: DEFAULT_PANEL_WIDTH.inspector, collapsed: false },
};

/** Where the layout is kept in local storage. */
export const PANEL_STORAGE_KEY = 'visual-anything.side-panels';

const FORMAT_VERSION = 1;

/** The widest a side panel is in a window this wide: half of it, and never less than the narrowest. */
export function maxPanelWidth(windowWidth: number): number {
  return Math.max(MIN_PANEL_WIDTH, Math.floor(windowWidth / 2));
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

/** The layout kept in this browser, or the defaults for whatever is missing or cannot be read. */
export function readLayout(storage: Pick<Storage, 'getItem'> | undefined): PanelLayout {
  let text: string | null;
  try {
    text = storage?.getItem(PANEL_STORAGE_KEY) ?? null;
  } catch {
    return DEFAULT_LAYOUT;
  }
  if (text === null) return DEFAULT_LAYOUT;
  let kept: unknown;
  try {
    kept = JSON.parse(text);
  } catch {
    return DEFAULT_LAYOUT;
  }
  if (!isRecord(kept)) return DEFAULT_LAYOUT;
  return { model: panelOf(kept.model, 'model'), inspector: panelOf(kept.inspector, 'inspector') };
}

/** Keeps the layout in this browser; when storage refuses, the layout lasts as long as the tab. */
export function writeLayout(
  storage: Pick<Storage, 'setItem'> | undefined,
  layout: PanelLayout,
): void {
  const kept = {
    version: FORMAT_VERSION,
    model: { width: layout.model.width, collapsed: layout.model.collapsed },
    inspector: { width: layout.inspector.width, collapsed: layout.inspector.collapsed },
  };
  try {
    storage?.setItem(PANEL_STORAGE_KEY, JSON.stringify(kept));
  } catch {
    // Storage that is full, blocked or gone keeps nothing; the panels stay as they are in the tab.
  }
}

/** This browser's local storage, or none where reading it throws, as a blocked one does. */
export function browserStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function panelOf(kept: unknown, side: PanelSide): PanelState {
  const fallback = DEFAULT_LAYOUT[side];
  if (!isRecord(kept)) return fallback;
  const { width, collapsed } = kept;
  return {
    width:
      typeof width === 'number' && Number.isFinite(width)
        ? Math.max(MIN_PANEL_WIDTH, Math.round(width))
        : fallback.width,
    collapsed: typeof collapsed === 'boolean' ? collapsed : fallback.collapsed,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
