/**
 * Each person's preferences, kept by the local program outside every project (ADR-0032): the theme,
 * whether the grid, snapping and the rulers are on, and the colors picked lately. They live in
 * `preferences.json` in the person's configuration folder, which is worked out once when the program
 * starts and never taken from a message. The file is read leniently: a broken file never stops the
 * program, a value this build cannot read is kept as found, and a file of a newer format is never
 * written. Each change reads the file again and merges by name before writing it atomically, so that
 * two running programs keep each other's changes.
 */
import { readFile, stat } from 'node:fs/promises';
import { join, posix, win32 } from 'node:path';
import {
  DEFAULT_PREFERENCES,
  applyPreferenceChanges,
  formatPreferences,
  readPreferences,
  type PreferenceChanges,
  type Preferences,
  type PreferencesRead,
  type ThemeName,
} from '@visual-anything/core';
import { errorCode, errorReason } from './errors';
import { toForwardSlashes } from './paths';
import { writeFileAtomic, type WriteOptions } from './writer';

/** The name of the preferences file in its folder. */
export const PREFERENCES_FILE = 'preferences.json';

/** The largest preferences file read; a larger one is not a preferences file. */
export const MAX_PREFERENCES_BYTES = 64 * 1024;

/** Where the preferences are kept, and what to say about it when the choice needs saying. */
export interface PreferencesLocation {
  /** The folder of the preferences file; null keeps them in memory only. */
  folder: string | null;
  warning?: string;
}

/**
 * The folder preferences live in on a platform: `%APPDATA%\Visual Anything` on Windows,
 * `~/Library/Application Support/Visual Anything` on macOS, and `$XDG_CONFIG_HOME/visual-anything` or
 * `~/.config/visual-anything` elsewhere. An absolute `VISUAL_ANYTHING_PREFERENCES` names another folder;
 * a relative one is ignored with a warning, as are relative `APPDATA` and `XDG_CONFIG_HOME`.
 */
export function preferencesFolder(
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
  home: string,
): PreferencesLocation {
  const path = platform === 'win32' ? win32 : posix;
  const absolute = (value: string | undefined): value is string =>
    value !== undefined && value !== '' && path.isAbsolute(value);
  const chosen = env.VISUAL_ANYTHING_PREFERENCES;
  if (absolute(chosen)) return { folder: path.normalize(chosen) };

  let folder: string | null = null;
  if (platform === 'win32' && absolute(env.APPDATA)) {
    folder = path.join(env.APPDATA, 'Visual Anything');
  } else if (absolute(home)) {
    if (platform === 'win32') folder = path.join(home, 'AppData', 'Roaming', 'Visual Anything');
    else if (platform === 'darwin') {
      folder = path.join(home, 'Library', 'Application Support', 'Visual Anything');
    } else {
      const config = absolute(env.XDG_CONFIG_HOME)
        ? env.XDG_CONFIG_HOME
        : path.join(home, '.config');
      folder = path.join(config, 'visual-anything');
    }
  }
  if (folder === null) {
    return {
      folder,
      warning:
        'Your preferences apply until Visual Anything stops: there is no home folder to keep them in.',
    };
  }
  if (chosen === undefined || chosen === '') return { folder };
  return {
    folder,
    warning: `VISUAL_ANYTHING_PREFERENCES is ignored: ${JSON.stringify(chosen)} is not an absolute path. Your preferences are kept in ${toForwardSlashes(folder)}.`,
  };
}

/** The theme the address the program opens should carry: the chosen one, none to match the system. */
export function themeHintOf(preferences: Readonly<Preferences>): ThemeName | undefined {
  return preferences.theme === 'system' ? undefined : preferences.theme;
}

/** What a change of preferences came to: the preferences now, and whether they reached the file. */
export type SetPreferencesResult =
  | { preferences: Preferences; saved: true }
  | { preferences: Preferences; saved: false; reason: string };

/** The person's preferences, as the local program keeps them. */
export interface PreferencesStore {
  /** The preferences now. */
  current(): Preferences;
  /**
   * Changes some preferences, already checked with `checkPreferenceChanges`. Changes are applied one
   * at a time, in order, never behind the project's own work. When the file cannot be written the
   * change still applies until the program stops.
   */
  set(changes: PreferenceChanges): Promise<SetPreferencesResult>;
  /** Resolves once the changes already asked for are done. */
  close(): Promise<void>;
}

export interface PreferencesOptions {
  /** How the file is written; tests replace the file system to simulate failures. */
  writer?: WriteOptions;
}

/**
 * Opens the preferences kept in a folder, or in memory only for `null`. It never fails: a missing file
 * gives the defaults and creates nothing, and a file it cannot read gives the defaults and a warning.
 */
export async function openPreferences(
  folder: string | null,
  options: PreferencesOptions = {},
): Promise<{ store: PreferencesStore; warning?: string }> {
  if (folder === null) return { store: new Store(null, DEFAULT_PREFERENCES, options) };
  const file = join(folder, PREFERENCES_FILE);
  const found = await readPreferencesFile(file);
  const preferences = found.state === 'read' ? found.read.preferences : DEFAULT_PREFERENCES;
  const store = new Store(file, preferences, options);
  const warning = warningFor(file, found);
  return warning === undefined ? { store } : { store, warning };
}

class Store implements PreferencesStore {
  readonly #file: string | null;
  readonly #options: PreferencesOptions;
  #preferences: Preferences;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(
    file: string | null,
    preferences: Readonly<Preferences>,
    options: PreferencesOptions,
  ) {
    this.#file = file;
    this.#options = options;
    this.#preferences = applyPreferenceChanges(preferences, {});
  }

  current(): Preferences {
    return applyPreferenceChanges(this.#preferences, {});
  }

  set(changes: PreferenceChanges): Promise<SetPreferencesResult> {
    const run = this.#queue.then(() => this.#set(changes));
    this.#queue = run.catch(() => undefined);
    return run;
  }

  close(): Promise<void> {
    return this.#queue.then(() => undefined);
  }

  async #set(changes: PreferenceChanges): Promise<SetPreferencesResult> {
    if (this.#file === null) return this.#unsaved(changes, 'there is no folder to keep it in');
    // Read again, so that a change another program made since is kept.
    const found = await readPreferencesFile(this.#file);
    if (found.state === 'read' && found.read.newer) {
      return this.#unsaved(changes, 'a newer Visual Anything wrote the preferences file');
    }
    const base: Pick<PreferencesRead, 'preferences' | 'kept'> =
      found.state === 'read' ? found.read : { preferences: this.#preferences, kept: {} };
    const next = applyPreferenceChanges(base.preferences, changes);
    const kept = Object.fromEntries(
      Object.entries(base.kept).filter(([name]) => !Object.hasOwn(changes, name)),
    );
    this.#preferences = next;
    try {
      await writeFileAtomic(
        this.#file,
        Buffer.from(formatPreferences(next, kept), 'utf8'),
        this.#options.writer,
      );
    } catch (error) {
      return { preferences: this.current(), saved: false, reason: errorReason(error) };
    }
    return { preferences: this.current(), saved: true };
  }

  #unsaved(changes: PreferenceChanges, reason: string): SetPreferencesResult {
    this.#preferences = applyPreferenceChanges(this.#preferences, changes);
    return { preferences: this.current(), saved: false, reason };
  }
}

/** What the preferences file holds: nothing, something that is not preferences, or preferences. */
type FileRead =
  | { state: 'missing' }
  | { state: 'unreadable'; reason: string }
  | { state: 'read'; read: PreferencesRead };

async function readPreferencesFile(file: string): Promise<FileRead> {
  let bytes: Buffer;
  try {
    const info = await stat(file);
    if (!info.isFile()) return { state: 'unreadable', reason: 'it is not a file' };
    if (info.size > MAX_PREFERENCES_BYTES) return tooLarge();
    bytes = await readFile(file);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return { state: 'missing' };
    return { state: 'unreadable', reason: errorReason(error) };
  }
  // The file may have grown between the two calls.
  if (bytes.length > MAX_PREFERENCES_BYTES) return tooLarge();
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  } catch {
    return { state: 'unreadable', reason: 'it is not JSON' };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { state: 'unreadable', reason: 'it holds no object of preferences' };
  }
  return { state: 'read', read: readPreferences(value) };
}

function tooLarge(): FileRead {
  return {
    state: 'unreadable',
    reason: `it is larger than ${MAX_PREFERENCES_BYTES / 1024} KiB`,
  };
}

/** The one warning to print about the file as found, if any. */
function warningFor(file: string, found: FileRead): string | undefined {
  const where = toForwardSlashes(file);
  if (found.state === 'missing') return undefined;
  if (found.state === 'unreadable') {
    return `Your preferences in ${where} could not be read (${found.reason}), so the defaults apply; the file is left as it is until you change a preference.`;
  }
  const { newer, unread } = found.read;
  if (newer) {
    return `Your preferences in ${where} come from a newer Visual Anything: what this one can read applies, and it never writes the file.`;
  }
  if (unread.length > 0) {
    return `Some of your preferences in ${where} could not be read, so their defaults apply and the file keeps them as they are: ${listOf(unread)}.`;
  }
  return undefined;
}

/** Names in words: "a", "a and b", "a, b and c". */
function listOf(names: readonly string[]): string {
  const last = names.at(-1);
  if (last === undefined) return '';
  return names.length === 1 ? last : `${names.slice(0, -1).join(', ')} and ${last}`;
}
