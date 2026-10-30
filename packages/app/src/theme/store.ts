/**
 * The preferences this tab applies, and the theme the page is drawn in (ADR-0032). The local program
 * keeps each person's preferences; this tab applies a change at once, sends the latest one half a
 * second after the person's last change (at once when the tab is hidden), and keeps the person's
 * choice over what the program sends until the program answers. Before the program sends anything,
 * the tab starts from the theme in its address or the one it kept, so the first frame is drawn in it.
 *
 * Nothing runs when the module loads: `startPreferences` starts it, once.
 */
import {
  DEFAULT_PREFERENCES,
  THEME_PARAM,
  applyPreferenceChanges,
  isThemeChoice,
  resolveTheme,
  type PreferenceChanges,
  type Preferences,
  type ThemeChoice,
  type ThemeName,
} from '@visual-anything/core';
import { fill } from '../i18n/translate';

/** Where the tab keeps the theme chosen, for a reload and for the script that paints first. */
export const THEME_STORAGE_KEY = 'visual-anything.theme';

/** Where the tab keeps the language chosen, so that a reload starts in it (ADR-0038). */
export const LANGUAGE_STORAGE_KEY = 'visual-anything.language';

/** How long after the person's last change the latest one is sent. */
export const SEND_DELAY_MS = 500;

/** How long a canvas that holds the theme may take to show a new one before the page changes anyway. */
export const HOLD_TIMEOUT_MS = 500;

export const NOT_CONNECTED =
  'Your theme applies to this tab only: Visual Anything is not connected.';

/** What a change of language says while the tab is not connected. */
export const LANGUAGE_NOT_CONNECTED =
  'Your language applies to this tab only: Visual Anything is not connected.';

/** What a change of the grid, snapping or the rulers says while the tab is not connected (A3). */
export const GRID_NOT_CONNECTED =
  'The grid and the rulers apply to this tab only: Visual Anything is not connected.';

/** What an approval of package code says while the tab is not connected (ADR 0054). */
export const APPROVAL_NOT_CONNECTED =
  'Your approval of package code applies to this tab only: Visual Anything is not connected.';

/** What a change of the name the person's comments are signed with says while not connected (ADR 0059). */
export const AUTHOR_NOT_CONNECTED =
  'Your name for comments applies to this tab only: Visual Anything is not connected.';

/** What a change of how tours and scenarios move says while the tab is not connected (ADR 0077). */
export const MOTION_NOT_CONNECTED =
  'Your Motion and Fades apply to this tab only: Visual Anything is not connected.';

/**
 * What a change says while the tab is not connected: about the language, or the grid and the rulers,
 * when it changes only that. The side panels' widths and strips say nothing: they change with every
 * collapse and every drag, and the tab keeps them as they are.
 */
function notConnected(changes: PreferenceChanges): string | undefined {
  if (Object.keys(changes).every((name) => name === 'sidePanels')) return undefined;
  if (changes.codeApprovals !== undefined) return APPROVAL_NOT_CONNECTED;
  if (changes.author !== undefined) return AUTHOR_NOT_CONNECTED;
  if (changes.theme !== undefined) return NOT_CONNECTED;
  if (changes.language !== undefined) return LANGUAGE_NOT_CONNECTED;
  if (changes.motion !== undefined || changes.fades !== undefined) return MOTION_NOT_CONNECTED;
  if (
    changes.grid !== undefined ||
    changes.snapToGrid !== undefined ||
    changes.rulers !== undefined
  ) {
    return GRID_NOT_CONNECTED;
  }
  return NOT_CONNECTED;
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** What the store uses of the window. */
export type PreferencesWindow = Pick<
  Window,
  'location' | 'history' | 'sessionStorage' | 'document'
> & {
  matchMedia?: Window['matchMedia'] | undefined;
};

/** How the local program answered a change of preferences. */
export type PreferencesAnswer =
  | { ok: true; preferences: Preferences }
  | { ok: false; problems: readonly { code?: string; message: string }[] };

/** What the store needs of the live session to keep the program's preferences and this tab's in step. */
export interface PreferencesLink {
  status: 'connecting' | 'open' | 'closed' | 'failed';
  /** The program's preferences as it last sent them; absent until it does. */
  preferences: Preferences | undefined;
  /** Sends a change; absent while the live session cannot carry preferences. */
  setPreferences?: ((changes: PreferenceChanges) => Promise<PreferencesAnswer>) | undefined;
  notify: (level: 'info' | 'warning' | 'error', message: string) => void;
}

/** What the tab applies now. */
export interface AppliedPreferences {
  readonly preferences: Preferences;
  /** The theme to draw in: the one chosen, or the system's. */
  readonly theme: ThemeName;
  /** The system's theme, to say what matching the system means now. */
  readonly systemTheme: ThemeName;
}

/**
 * A canvas holding the theme: while one is held, a new theme reaches the page when the canvas says it
 * shows it, or {@link HOLD_TIMEOUT_MS} after it was chosen, so that the panels and the canvas change in
 * the same frame.
 */
export interface ThemeHold {
  shown(theme: ThemeName): void;
  release(): void;
}

interface State {
  target: PreferencesWindow | undefined;
  /** The program's preferences, or what the tab started with until the program sends its own. */
  base: Preferences;
  /** The last preferences the program sent, as received. */
  program: Preferences | undefined;
  /** Changes made in this tab and not sent yet. */
  unsent: PreferenceChanges;
  /** The change sent and not answered yet. */
  sent: PreferenceChanges | undefined;
  systemDark: boolean;
  applied: AppliedPreferences;
  link: PreferencesLink | undefined;
  /** The live session's status as last linked, kept while no link is held. */
  status: PreferencesLink['status'] | undefined;
  sendTimer: ReturnType<typeof setTimeout> | undefined;
  holds: Set<ThemeHold>;
  /** The theme `data-theme` says now. */
  shown: ThemeName | undefined;
  holdTimer: ReturnType<typeof setTimeout> | undefined;
  stop: (() => void) | undefined;
  listeners: Set<() => void>;
}

function initialState(): State {
  return {
    target: undefined,
    base: applyPreferenceChanges(DEFAULT_PREFERENCES, {}),
    program: undefined,
    unsent: {},
    sent: undefined,
    systemDark: false,
    applied: {
      preferences: applyPreferenceChanges(DEFAULT_PREFERENCES, {}),
      theme: 'light',
      systemTheme: 'light',
    },
    link: undefined,
    status: undefined,
    sendTimer: undefined,
    holds: new Set(),
    shown: undefined,
    holdTimer: undefined,
    stop: undefined,
    listeners: new Set(),
  };
}

let state = initialState();

/**
 * Starts the preferences of this tab, once: takes the theme hint out of the address, reads the choice
 * the tab kept, follows the system's setting, and writes the theme on the page.
 */
export function startPreferences(target: PreferencesWindow): void {
  if (state.target !== undefined) return;
  state.target = target;
  const choice = takeThemeHint(target) ?? recallTheme(target);
  if (choice !== undefined) state.base = applyPreferenceChanges(state.base, { theme: choice });
  const language = recallLanguage(target);
  if (language !== undefined) state.base = applyPreferenceChanges(state.base, { language });

  const media = darkQuery(target);
  state.systemDark = media?.matches ?? false;
  const onSystemChange = (event: MediaQueryListEvent) => {
    state.systemDark = event.matches;
    update();
  };
  const onVisibility = () => {
    if (target.document.visibilityState === 'hidden') send();
  };
  media?.addEventListener('change', onSystemChange);
  target.document.addEventListener('visibilitychange', onVisibility);
  state.stop = () => {
    media?.removeEventListener('change', onSystemChange);
    target.document.removeEventListener('visibilitychange', onVisibility);
  };
  update();
}

/** What the tab applies now: the same value until something changes. */
export function appliedPreferences(): AppliedPreferences {
  return state.applied;
}

/** Calls `listener` after every change of what the tab applies; returns what stops it. */
export function subscribePreferences(listener: () => void): () => void {
  const { listeners } = state;
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A change the person made in this tab: it applies at once, and goes to the program soon after. */
export function changePreferences(changes: PreferenceChanges): void {
  state.unsent = { ...state.unsent, ...changes };
  update();
  const { link } = state;
  if (link?.setPreferences === undefined) return;
  if (link.status === 'closed' || link.status === 'failed') {
    const said = notConnected(changes);
    if (said !== undefined) link.notify('info', said);
    return;
  }
  sendSoon();
}

/**
 * Links the store to the live session as it is now: its status, the program's preferences and how to
 * send a change. Call it again whenever the session changes; returns what lets it go.
 */
export function linkPreferences(link: PreferencesLink): () => void {
  const opened = link.status === 'open' && state.status !== 'open';
  state.link = link;
  state.status = link.status;
  if (link.preferences !== undefined && link.preferences !== state.program) {
    state.program = link.preferences;
    state.base = applyPreferenceChanges(link.preferences, {});
    update();
  }
  // A change made while connecting goes as soon as the connection opens.
  if (opened) send();
  return () => {
    if (state.link === link) state.link = undefined;
  };
}

/** Holds the theme for a canvas; see {@link ThemeHold}. */
export function holdTheme(): ThemeHold {
  const hold: ThemeHold = {
    shown(theme) {
      if (state.holds.has(hold) && theme === state.applied.theme) setDataTheme(theme);
    },
    release() {
      if (state.holds.delete(hold) && state.holds.size === 0) showTheme();
    },
  };
  state.holds.add(hold);
  return hold;
}

/** Forgets everything, so that each test starts afresh: listeners, timers, holds and `data-theme`. */
export function resetPreferencesForTests(): void {
  state.stop?.();
  clearTimeout(state.sendTimer);
  clearTimeout(state.holdTimer);
  state.target?.document.documentElement.removeAttribute('data-theme');
  state = initialState();
}

/** Works out what the tab applies, tells the listeners when it changed, and shows the theme. */
function update(): void {
  const preferences = applyPreferenceChanges(
    applyPreferenceChanges(state.base, state.sent ?? {}),
    state.unsent,
  );
  const systemTheme: ThemeName = state.systemDark ? 'dark' : 'light';
  const theme = resolveTheme(preferences.theme, state.systemDark);
  const previous = state.applied;
  if (
    previous.theme !== theme ||
    previous.systemTheme !== systemTheme ||
    !samePreferences(previous.preferences, preferences)
  ) {
    state.applied = { preferences, theme, systemTheme };
    if (previous.preferences.theme !== preferences.theme) rememberTheme(preferences.theme);
    if (previous.preferences.language !== preferences.language) {
      remember(LANGUAGE_STORAGE_KEY, preferences.language);
    }
    for (const listener of [...state.listeners]) listener();
  }
  showTheme();
}

/** Writes the theme on the page: at once, or once a canvas that holds it shows it. */
function showTheme(): void {
  if (state.target === undefined) return;
  const wanted = state.applied.theme;
  if (state.shown === undefined || state.holds.size === 0) {
    setDataTheme(wanted);
    return;
  }
  if (wanted === state.shown) {
    clearTimeout(state.holdTimer);
    state.holdTimer = undefined;
    return;
  }
  state.holdTimer ??= setTimeout(() => {
    state.holdTimer = undefined;
    setDataTheme(state.applied.theme);
  }, HOLD_TIMEOUT_MS);
}

function setDataTheme(theme: ThemeName): void {
  clearTimeout(state.holdTimer);
  state.holdTimer = undefined;
  state.shown = theme;
  state.target?.document.documentElement.setAttribute('data-theme', theme);
}

function sendSoon(): void {
  clearTimeout(state.sendTimer);
  state.sendTimer = setTimeout(send, SEND_DELAY_MS);
}

/** Sends the changes not sent yet, one request at a time, while the connection is open. */
function send(): void {
  clearTimeout(state.sendTimer);
  state.sendTimer = undefined;
  const { link } = state;
  if (link?.setPreferences === undefined || link.status !== 'open') return;
  if (state.sent !== undefined || Object.keys(state.unsent).length === 0) return;
  const changes = state.unsent;
  state.unsent = {};
  state.sent = changes;
  link.setPreferences(changes).then(
    (answer) => {
      answered(link, changes, answer);
    },
    (error: unknown) => {
      answered(link, changes, { ok: false, problems: [{ message: String(error) }] });
    },
  );
}

function answered(link: PreferencesLink, changes: PreferenceChanges, answer: PreferencesAnswer) {
  // Forgotten meanwhile, as between tests.
  if (state.sent !== changes) return;
  state.sent = undefined;
  if (answer.ok) {
    state.program = answer.preferences;
    state.base = applyPreferenceChanges(answer.preferences, {});
  } else if (answer.problems.some((problem) => problem.code === 'connection-closed')) {
    // The program may never have heard of it: it stays in this tab, under any newer change.
    state.unsent = { ...changes, ...state.unsent };
    const said = notConnected(changes);
    if (said !== undefined) (state.link ?? link).notify('info', said);
  } else {
    const why = answer.problems.map((problem) => problem.message).join(' ');
    link.notify('error', fill('Could not change your preferences: {why}', { why }));
  }
  update();
  if (Object.keys(state.unsent).length > 0 && state.link?.status === 'open') sendSoon();
}

/** The theme in the address's fragment, which the local program adds for a chosen theme; removed. */
function takeThemeHint(target: PreferencesWindow): ThemeChoice | undefined {
  const { location, history } = target;
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (!fragment.has(THEME_PARAM)) return undefined;
  const hint = fragment.get(THEME_PARAM);
  fragment.delete(THEME_PARAM);
  const rest = fragment.toString();
  try {
    history.replaceState(
      history.state,
      '',
      `${location.pathname}${location.search}${rest === '' ? '' : `#${rest}`}`,
    );
  } catch {
    // The hint stays in the address; it does no harm there.
  }
  return hint === 'light' || hint === 'dark' ? hint : undefined;
}

function recallTheme(target: PreferencesWindow): ThemeChoice | undefined {
  try {
    const kept = target.sessionStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(kept) ? kept : undefined;
  } catch {
    return undefined;
  }
}

function rememberTheme(choice: ThemeChoice): void {
  remember(THEME_STORAGE_KEY, choice);
}

function recallLanguage(target: PreferencesWindow): Preferences['language'] | undefined {
  try {
    const kept = target.sessionStorage.getItem(LANGUAGE_STORAGE_KEY);
    return kept === 'system' || kept === 'en' || kept === 'es' ? kept : undefined;
  } catch {
    return undefined;
  }
}

function remember(key: string, choice: string): void {
  try {
    state.target?.sessionStorage.setItem(key, choice);
  } catch {
    // Without session storage only a reload of the tab loses the choice, until the program sends it.
  }
}

function darkQuery(target: PreferencesWindow): MediaQueryList | undefined {
  if (typeof target.matchMedia !== 'function') return undefined;
  try {
    return target.matchMedia(DARK_QUERY);
  } catch {
    return undefined;
  }
}

function samePreferences(a: Preferences, b: Preferences): boolean {
  return (
    a.theme === b.theme &&
    a.language === b.language &&
    a.grid === b.grid &&
    a.snapToGrid === b.snapToGrid &&
    a.rulers === b.rulers &&
    a.recentColors.length === b.recentColors.length &&
    a.recentColors.every((color, index) => color === b.recentColors[index]) &&
    // Approvals of package code (ADR 0054).
    a.codeApprovals.length === b.codeApprovals.length &&
    a.codeApprovals.every((approval, index) => {
      const other = b.codeApprovals[index];
      return (
        other !== undefined &&
        approval.hash === other.hash &&
        approval.package === other.package &&
        approval.capabilities.join(' ') === other.capabilities.join(' ')
      );
    }) &&
    // Who the person's comments are signed as (ADR 0059).
    a.author?.name === b.author?.name &&
    a.author?.email === b.author?.email &&
    // How tours and scenarios move (ADR 0077).
    a.motion === b.motion &&
    a.fades === b.fades &&
    // The side panels' widths and strips (ADR 0032's clarification of 2026-10-30).
    a.sidePanels.model.width === b.sidePanels.model.width &&
    a.sidePanels.model.collapsed === b.sidePanels.model.collapsed &&
    a.sidePanels.inspector.width === b.sidePanels.inspector.width &&
    a.sidePanels.inspector.collapsed === b.sidePanels.inspector.collapsed
  );
}
