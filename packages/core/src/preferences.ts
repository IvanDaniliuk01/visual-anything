/**
 * Preferences: the choices a person makes for themselves on this computer, such as the theme. The local
 * program keeps them outside every project, in a file of its own (ADR-0032); they are never in project
 * files, the undo history or Claude's tools. This module holds their shape and their rules, with no I/O:
 * reading the file leniently, checking changes an app sends strictly, and writing the file's text.
 */
import type { Color } from '@visual-anything/schema';
import { checkCodeApprovals, readCodeApprovals, type CodeApproval } from './code/approvals';
import { MAX_AUTHOR_NAME, checkPerson } from './comments/authors';
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

/**
 * How tours and scenario playback move (ADR 0077): as the system says, reduced, where every camera
 * change cuts and travelling markers stay still, or full, whatever the system says.
 */
export type MotionChoice = 'system' | 'reduced' | 'full';

export const MOTION_CHOICES: readonly MotionChoice[] = Object.freeze(['system', 'reduced', 'full']);

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
  /** Who the person's comments are signed as (ADR 0059); none until they say. */
  author: AuthorPreference | null;
  /** How tours and scenario playback move (ADR 0077). */
  motion: MotionChoice;
  /** Whether a tour's stages fade and its cuts cross-fade; with fades off, cuts are plain (ADR 0077). */
  fades: boolean;
  /**
   * Review Claude's changes: whether Claude's changes wait in a proposal for the person to accept,
   * rather than apply at once (ADR 0073). Claude's tools never read or change it.
   */
  reviewClaude: boolean;
}

/** The name, and optional email, a person's comments are signed with (ADR 0059). */
export interface AuthorPreference {
  name: string;
  email?: string;
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
 * rulers, no recent colors, motion as the system says, fades on, and Claude's changes applied at once.
 */
export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
  theme: 'system',
  language: 'system',
  grid: false,
  snapToGrid: true,
  rulers: false,
  recentColors: Object.freeze([]) as unknown as Color[],
  codeApprovals: Object.freeze([]) as unknown as CodeApproval[],
  author: null,
  motion: 'system',
  fades: true,
  reviewClaude: false,
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
  'author',
  'motion',
  'fades',
  'reviewClaude',
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

/** Whether motion is reduced: as the system says for "system", and as the person chose otherwise. */
export function reducedMotionOf(choice: MotionChoice, systemReduces: boolean): boolean {
  if (choice === 'system') return systemReduces;
  return choice === 'reduced';
}

/** Whether a value is one of the motion choices. */
export function isMotionChoice(value: unknown): value is MotionChoice {
  return typeof value === 'string' && (MOTION_CHOICES as readonly string[]).includes(value);
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
      (next as Record<PreferenceName, unknown>)[name] = Array.isArray(value)
        ? [...value]
        : typeof value === 'object' && value !== null
          ? { ...(value as object) }
          : value;
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
  author: (value) => {
    if (value === null) return null;
    const checked = checkAuthor(value);
    return checked.ok ? checked.value : undefined;
  },
  motion: (value) => (isMotionChoice(value) ? value : undefined),
  fades: booleanOrUndefined,
  reviewClaude: booleanOrUndefined,
};

type Checked = { ok: true; value: unknown } | { ok: false; message: string };

/**
 * Checks who the person's comments are signed as: a name, trimmed, of 1 to 200 characters, and an
 * optional email, trimmed and left out when empty, as a comment's author keeps them.
 */
function checkAuthor(value: unknown): Checked {
  if (!isRecord(value)) {
    return { ok: false, message: '"author" must be null, or a name and an email.' };
  }
  if (Object.keys(value).some((key) => key !== 'name' && key !== 'email')) {
    return { ok: false, message: '"author" has a name and an email, and nothing else.' };
  }
  const checked = checkPerson({ kind: 'person', name: value.name, email: value.email });
  if (checked.ok) {
    const { name, email } = checked.author;
    return { ok: true, value: email === undefined ? { name } : { name, email } };
  }
  if (checked.code === 'no-comment-author') return { ok: false, message: '"author" needs a name.' };
  if (typeof value.name === 'string' && value.name.trim().length > MAX_AUTHOR_NAME) {
    return { ok: false, message: '"author" has a name of at most 200 characters.' };
  }
  return {
    ok: false,
    message: `"author" has an email that is not one: ${JSON.stringify(value.email)}.`,
  };
}

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
  author: (value) => (value === null ? { ok: true, value: null } : checkAuthor(value)),
  motion: (value) =>
    isMotionChoice(value)
      ? { ok: true, value }
      : {
          ok: false,
          message: `"motion" must be "system", "reduced" or "full", not ${JSON.stringify(value)}.`,
        },
  fades: (value) => strictBoolean('fades', value),
  reviewClaude: (value) => strictBoolean('reviewClaude', value),
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
    author: preferences.author === null ? null : { ...preferences.author },
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
