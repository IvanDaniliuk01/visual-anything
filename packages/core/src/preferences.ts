/**
 * Preferences: the choices a person makes for themselves on this computer, such as the theme. The local
 * program keeps them outside every project, in a file of its own (ADR-0032); they are never in project
 * files, the undo history or Claude's tools. This module holds their shape and their rules, with no I/O:
 * reading the file leniently, checking changes an app sends strictly, and writing the file's text.
 */
import type { Color } from '@visual-anything/schema';
import { checkCodeApprovals, readCodeApprovals, type CodeApproval } from './code/approvals';
import type { Problem } from './problems';

/** The themes the app and the canvas can be drawn in. */
export type ThemeName = 'light' | 'dark';

export const THEME_NAMES: readonly ThemeName[] = Object.freeze(['light', 'dark']);

/** The theme a person chooses: one of the themes, or whichever the system uses. */
export type ThemeChoice = 'system' | ThemeName;

export const THEME_CHOICES: readonly ThemeChoice[] = Object.freeze(['system', 'light', 'dark']);

/** The language a person chooses for the app: English, Spanish, or whichever the browser asks for. */
export type LanguageChoice = 'system' | 'en' | 'es';

export const LANGUAGE_CHOICES: readonly LanguageChoice[] = Object.freeze(['system', 'en', 'es']);

/** Every preference, as this build knows them. */
export interface Preferences {
  /** The theme the app and the canvas are drawn in. */
  theme: ThemeChoice;
  /** The language the app reads in (ADR-0038). */
  language: LanguageChoice;
  /** Whether the grid shows. */
  grid: boolean;
  /** Whether shapes moved or created by hand snap to the grid while it shows. */
  snapToGrid: boolean;
  /** Whether the rulers show. */
  rulers: boolean;
  /** Exact colors picked lately, newest first, in capitals, at most {@link MAX_RECENT_COLORS}. */
  recentColors: Color[];
  /** The package code the person approved, by its hash, newest first (ADR 0054). */
  codeApprovals: CodeApproval[];
}

/** Some preferences, to change. */
export type PreferenceChanges = Partial<Preferences>;

export type PreferenceName = keyof Preferences;

/** The version of the preferences file's format. */
export const PREFERENCES_VERSION = 1;

/** The most recent colors kept. */
export const MAX_RECENT_COLORS = 8;

/**
 * Preferences nobody has chosen: match the system and the browser's language, no grid, snapping on, no
 * rulers, no recent colors.
 */
export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
  theme: 'system',
  language: 'system',
  grid: false,
  snapToGrid: true,
  rulers: false,
  recentColors: Object.freeze([]) as unknown as Color[],
  codeApprovals: Object.freeze([]) as unknown as CodeApproval[],
});

/** The known names, in the order the file writes them. */
export const PREFERENCE_NAMES: readonly PreferenceName[] = Object.freeze([
  'theme',
  'language',
  'grid',
  'snapToGrid',
  'rulers',
  'recentColors',
  'codeApprovals',
]);

/** What the preferences file holds, read leniently. */
export interface PreferencesRead {
  /** Every name this build can read; the default for the rest. */
  preferences: Preferences;
  /**
   * What is kept as found and written back unchanged unless that name is set: names this build does
   * not know, and known names whose value it cannot read, such as a theme added later.
   */
  kept: Record<string, unknown>;
  /** The known names kept because their value could not be read, for the one warning. */
  unread: PreferenceName[];
  /** Whether a later format wrote the file (`schemaVersion` above 1); this build then never writes it. */
  newer: boolean;
}

/** The theme to draw in: the chosen one, or the system's for "system". */
export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): ThemeName {
  if (choice !== 'system') return choice;
  return systemPrefersDark ? 'dark' : 'light';
}

/** Whether a value is one of the theme choices. */
export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (THEME_CHOICES as readonly string[]).includes(value);
}

/** Whether a value is one of the language choices. */
export function isLanguageChoice(value: unknown): value is LanguageChoice {
  return typeof value === 'string' && (LANGUAGE_CHOICES as readonly string[]).includes(value);
}

/**
 * Reads what the preferences file holds, leniently: never fails, gives the default for every name it
 * cannot read, and keeps whatever it cannot use as found. `schemaVersion` is read here and is never kept.
 */
export function readPreferences(value: unknown): PreferencesRead {
  const preferences = copyOf(DEFAULT_PREFERENCES);
  const kept: [string, unknown][] = [];
  const unread: PreferenceName[] = [];
  if (!isRecord(value)) return { preferences, kept: {}, unread, newer: false };
  for (const [name, found] of Object.entries(value)) {
    if (name === 'schemaVersion') continue;
    if (!isPreferenceName(name)) {
      kept.push([name, found]);
      continue;
    }
    const read = LENIENT[name](found);
    if (read === undefined) {
      kept.push([name, found]);
      unread.push(name);
    } else {
      (preferences as Record<PreferenceName, unknown>)[name] = read;
    }
  }
  const version = value.schemaVersion;
  return {
    preferences,
    kept: Object.fromEntries(kept),
    unread,
    newer: typeof version === 'number' && version > PREFERENCES_VERSION,
  };
}

/**
 * Checks preferences an app asks to change, strictly: every name must be known and every value one this
 * build can use. Colors come back in capitals.
 */
export function checkPreferenceChanges(
  value: unknown,
): { ok: true; changes: PreferenceChanges } | { ok: false; problems: Problem[] } {
  if (!isRecord(value)) {
    return refused(['Preferences to change must be an object, such as {"theme": "dark"}.']);
  }
  const names = Object.keys(value);
  if (names.length === 0) return refused(['There is no preference to change.']);
  const messages: string[] = [];
  const changes: Record<string, unknown> = {};
  for (const name of names) {
    if (!isPreferenceName(name)) {
      messages.push(`${JSON.stringify(name)} is not a preference.`);
      continue;
    }
    const checked = STRICT[name](value[name]);
    if (checked.ok) changes[name] = checked.value;
    else messages.push(checked.message);
  }
  if (messages.length > 0) return refused(messages);
  return { ok: true, changes };
}

/** Preferences with some changed; it shares no list with either. */
export function applyPreferenceChanges(
  preferences: Readonly<Preferences>,
  changes: PreferenceChanges,
): Preferences {
  const next = copyOf(preferences);
  for (const name of PREFERENCE_NAMES) {
    const value = changes[name];
    if (value !== undefined) {
      (next as Record<PreferenceName, unknown>)[name] = Array.isArray(value) ? [...value] : value;
    }
  }
  return next;
}

/**
 * The text of the preferences file: `schemaVersion`, then each known name, from `kept` when it holds it
 * and from `preferences` otherwise, then the other kept names sorted. Two spaces, LF, a final newline.
 */
export function formatPreferences(
  preferences: Readonly<Preferences>,
  kept: Readonly<Record<string, unknown>>,
): string {
  const entries: [string, unknown][] = [['schemaVersion', PREFERENCES_VERSION]];
  for (const name of PREFERENCE_NAMES) {
    entries.push([name, Object.hasOwn(kept, name) ? kept[name] : preferences[name]]);
  }
  const others = Object.keys(kept)
    .filter((name) => name !== 'schemaVersion' && !isPreferenceName(name))
    .sort(compareText);
  for (const name of others) entries.push([name, kept[name]]);
  // Written by hand rather than from an object, which would put names like "10" first.
  const members = entries.map(
    ([name, value]) =>
      `  ${JSON.stringify(name)}: ${JSON.stringify(value, null, 2).replaceAll('\n', '\n  ')}`,
  );
  return `{\n${members.join(',\n')}\n}\n`;
}

const COLOR = /^#[0-9a-fA-F]{6}$/;

type Lenient = (value: unknown) => unknown;

/** How each known name is read from the file: its value, or `undefined` when it cannot be read. */
const LENIENT: Record<PreferenceName, Lenient> = {
  theme: (value) => (isThemeChoice(value) ? value : undefined),
  language: (value) => (isLanguageChoice(value) ? value : undefined),
  grid: booleanOrUndefined,
  snapToGrid: booleanOrUndefined,
  rulers: booleanOrUndefined,
  recentColors: (value) => {
    if (!Array.isArray(value)) return undefined;
    const colors: Color[] = [];
    for (const each of value) {
      if (typeof each !== 'string' || !COLOR.test(each)) return undefined;
      const color = each.toUpperCase();
      if (!colors.includes(color)) colors.push(color);
    }
    return colors.slice(0, MAX_RECENT_COLORS);
  },
  codeApprovals: readCodeApprovals,
};

type Checked = { ok: true; value: unknown } | { ok: false; message: string };

/** How each known name is checked in a change: its value as stored, or why it is refused. */
const STRICT: Record<PreferenceName, (value: unknown) => Checked> = {
  theme: (value) =>
    isThemeChoice(value)
      ? { ok: true, value }
      : {
          ok: false,
          message: `"theme" must be "system", "light" or "dark", not ${JSON.stringify(value)}.`,
        },
  language: (value) =>
    isLanguageChoice(value)
      ? { ok: true, value }
      : {
          ok: false,
          message: `"language" must be "system", "en" or "es", not ${JSON.stringify(value)}.`,
        },
  grid: (value) => strictBoolean('grid', value),
  snapToGrid: (value) => strictBoolean('snapToGrid', value),
  rulers: (value) => strictBoolean('rulers', value),
  recentColors: (value) => {
    if (!Array.isArray(value)) {
      return { ok: false, message: '"recentColors" must be a list of colors written #RRGGBB.' };
    }
    const colors: Color[] = [];
    for (const each of value) {
      if (typeof each !== 'string' || !COLOR.test(each)) {
        return {
          ok: false,
          message: `"recentColors" must hold colors written #RRGGBB, not ${JSON.stringify(each)}.`,
        };
      }
      const color = each.toUpperCase();
      if (colors.includes(color)) {
        return { ok: false, message: `"recentColors" holds ${color} twice.` };
      }
      colors.push(color);
    }
    if (colors.length > MAX_RECENT_COLORS) {
      return {
        ok: false,
        message: `"recentColors" holds ${colors.length} colors, more than ${MAX_RECENT_COLORS}.`,
      };
    }
    return { ok: true, value: colors };
  },
  codeApprovals: checkCodeApprovals,
};

function booleanOrUndefined(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function strictBoolean(name: PreferenceName, value: unknown): Checked {
  return typeof value === 'boolean'
    ? { ok: true, value }
    : { ok: false, message: `"${name}" must be true or false, not ${JSON.stringify(value)}.` };
}

function refused(messages: readonly string[]): { ok: false; problems: Problem[] } {
  // A preference change is a message the program cannot use, as an unreadable command is.
  return { ok: false, problems: messages.map((message) => ({ code: 'invalid-command', message })) };
}

function copyOf(preferences: Readonly<Preferences>): Preferences {
  return {
    ...preferences,
    recentColors: [...preferences.recentColors],
    codeApprovals: [...preferences.codeApprovals],
  };
}

function isPreferenceName(name: string): name is PreferenceName {
  return (PREFERENCE_NAMES as readonly string[]).includes(name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Compares by UTF-16 code units, the same on every machine and locale. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
