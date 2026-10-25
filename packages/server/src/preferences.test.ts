import * as fsp from 'node:fs/promises';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_PREFERENCES, formatPreferences } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_PREFERENCES_BYTES,
  PREFERENCES_FILE,
  openPreferences,
  preferencesFolder,
  themeHintOf,
} from './preferences';
import type { WriterFs } from './writer';

let folder: string;
let file: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-preferences-'));
  file = join(folder, PREFERENCES_FILE);
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
});

function realFs(overrides: Partial<WriterFs> = {}): WriterFs {
  return {
    open: (path, flags) => fsp.open(path, flags),
    rename: (from, to) => fsp.rename(from, to),
    unlink: (path) => fsp.unlink(path),
    mkdir: (path, options) => fsp.mkdir(path, options),
    ...overrides,
  };
}

describe('preferencesFolder', () => {
  const HOME_WIN = 'C:\\Users\\ana';
  const HOME = '/home/ana';

  it('uses APPDATA on Windows when it is absolute', () => {
    expect(preferencesFolder('win32', { APPDATA: 'D:\\Profiles\\ana\\Roaming' }, HOME_WIN)).toEqual(
      { folder: 'D:\\Profiles\\ana\\Roaming\\Visual Anything' },
    );
  });

  it.each([undefined, '', 'Roaming'])(
    'falls back to the home folder on Windows when APPDATA is %j',
    (appData) => {
      expect(preferencesFolder('win32', { APPDATA: appData }, HOME_WIN)).toEqual({
        folder: 'C:\\Users\\ana\\AppData\\Roaming\\Visual Anything',
      });
    },
  );

  it('uses Application Support on macOS', () => {
    expect(preferencesFolder('darwin', { XDG_CONFIG_HOME: '/x' }, '/Users/ana')).toEqual({
      folder: '/Users/ana/Library/Application Support/Visual Anything',
    });
  });

  it('uses XDG_CONFIG_HOME elsewhere when it is absolute', () => {
    expect(preferencesFolder('linux', { XDG_CONFIG_HOME: '/etc/ana' }, HOME)).toEqual({
      folder: '/etc/ana/visual-anything',
    });
  });

  it.each([undefined, '', 'config'])(
    'falls back to ~/.config elsewhere when XDG_CONFIG_HOME is %j',
    (xdg) => {
      expect(preferencesFolder('freebsd', { XDG_CONFIG_HOME: xdg }, HOME)).toEqual({
        folder: '/home/ana/.config/visual-anything',
      });
    },
  );

  it('takes an absolute VISUAL_ANYTHING_PREFERENCES on any platform', () => {
    expect(
      preferencesFolder('win32', { VISUAL_ANYTHING_PREFERENCES: 'E:\\portable\\prefs' }, HOME_WIN),
    ).toEqual({ folder: 'E:\\portable\\prefs' });
    expect(
      preferencesFolder('linux', { VISUAL_ANYTHING_PREFERENCES: '/media/usb/va' }, HOME),
    ).toEqual({ folder: '/media/usb/va' });
  });

  it('ignores a relative VISUAL_ANYTHING_PREFERENCES, with a warning', () => {
    expect(preferencesFolder('linux', { VISUAL_ANYTHING_PREFERENCES: 'prefs' }, HOME)).toEqual({
      folder: '/home/ana/.config/visual-anything',
      warning:
        'VISUAL_ANYTHING_PREFERENCES is ignored: "prefs" is not an absolute path. Your preferences are kept in /home/ana/.config/visual-anything.',
    });
  });

  it('keeps preferences in memory only when there is no home folder', () => {
    expect(preferencesFolder('linux', {}, '')).toEqual({
      folder: null,
      warning:
        'Your preferences apply until Visual Anything stops: there is no home folder to keep them in.',
    });
  });
});

describe('themeHintOf', () => {
  it('names a chosen theme, and nothing for matching the system', () => {
    expect(themeHintOf({ ...DEFAULT_PREFERENCES, theme: 'dark' })).toBe('dark');
    expect(themeHintOf({ ...DEFAULT_PREFERENCES, theme: 'light' })).toBe('light');
    expect(themeHintOf(DEFAULT_PREFERENCES)).toBeUndefined();
  });
});

describe('openPreferences', () => {
  it('gives the defaults for a missing file, and creates nothing', async () => {
    const { store, warning } = await openPreferences(folder);
    expect(store.current()).toEqual(DEFAULT_PREFERENCES);
    expect(warning).toBeUndefined();
    await store.close();
    expect(await readdir(folder)).toEqual([]);
  });

  it('creates the folder and the file on the first change', async () => {
    const nested = join(folder, 'Visual Anything');
    const { store } = await openPreferences(nested);
    expect(await store.set({ theme: 'dark' })).toEqual({
      preferences: { ...DEFAULT_PREFERENCES, theme: 'dark' },
      saved: true,
    });
    expect(await readFile(join(nested, PREFERENCES_FILE), 'utf8')).toBe(
      formatPreferences({ ...DEFAULT_PREFERENCES, theme: 'dark' }, {}),
    );
    await store.close();
  });

  it('reads the preferences the file holds', async () => {
    await writeFile(file, JSON.stringify({ schemaVersion: 1, theme: 'light', rulers: true }));
    const { store, warning } = await openPreferences(folder);
    expect(store.current()).toEqual({ ...DEFAULT_PREFERENCES, theme: 'light', rulers: true });
    expect(warning).toBeUndefined();
    await store.close();
  });

  it('reads a file that starts with a byte order mark', async () => {
    await writeFile(file, `\uFEFF${JSON.stringify({ theme: 'dark' })}`);
    const { store, warning } = await openPreferences(folder);
    expect(store.current().theme).toBe('dark');
    expect(warning).toBeUndefined();
  });

  it.each([
    ['not JSON', '{"theme": "dark"', 'it is not JSON'],
    ['not an object', '["dark"]', 'it holds no object of preferences'],
  ])(
    'gives the defaults and one warning for a file that is %s, and leaves it alone',
    async (_, text, reason) => {
      await writeFile(file, text);
      const { store, warning } = await openPreferences(folder);
      expect(store.current()).toEqual(DEFAULT_PREFERENCES);
      expect(warning).toBe(
        `Your preferences in ${file.replaceAll('\\', '/')} could not be read (${reason}), so the defaults apply; the file is left as it is until you change a preference.`,
      );
      await store.close();
      expect(await readFile(file, 'utf8')).toBe(text);
    },
  );

  it('writes over a broken file once a preference changes', async () => {
    await writeFile(file, 'not json');
    const { store } = await openPreferences(folder);
    expect(await store.set({ grid: true })).toMatchObject({ saved: true });
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ grid: true });
  });

  it('refuses a file larger than the cap, and a folder in its place', async () => {
    await writeFile(file, ' '.repeat(MAX_PREFERENCES_BYTES + 1));
    expect((await openPreferences(folder)).warning).toContain('it is larger than 64 KiB');
    await rm(file);
    await mkdir(file);
    expect((await openPreferences(folder)).warning).toContain('it is not a file');
  });

  it('warns once about the known names whose values it cannot read, and keeps them', async () => {
    await writeFile(
      file,
      JSON.stringify({ schemaVersion: 1, theme: 'high-contrast', grid: 'yes', zoomSpeed: 3 }),
    );
    const { store, warning } = await openPreferences(folder);
    expect(warning).toBe(
      `Some of your preferences in ${file.replaceAll('\\', '/')} could not be read, so their defaults apply and the file keeps them as they are: theme and grid.`,
    );
    expect(store.current()).toEqual(DEFAULT_PREFERENCES);
    expect(await store.set({ rulers: true })).toMatchObject({ saved: true });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      schemaVersion: 1,
      ...DEFAULT_PREFERENCES,
      theme: 'high-contrast',
      grid: 'yes',
      rulers: true,
      zoomSpeed: 3,
    });
  });

  it('keeps the language chosen, for the next time the program starts', async () => {
    const { store } = await openPreferences(folder);
    expect(await store.set({ language: 'es' })).toEqual({
      preferences: { ...DEFAULT_PREFERENCES, language: 'es' },
      saved: true,
    });
    const { store: again } = await openPreferences(folder);
    expect(again.current().language).toBe('es');
  });

  it('writes a theme it could not read over only when the theme is set', async () => {
    await writeFile(file, JSON.stringify({ theme: 'sepia' }));
    const { store } = await openPreferences(folder);
    await store.set({ grid: true });
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ theme: 'sepia' });
    await store.set({ theme: 'dark' });
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ theme: 'dark' });
  });

  it('uses what it can read of a newer format, never writes it, and says why', async () => {
    const text = JSON.stringify({ schemaVersion: 2, theme: 'dark', accent: 'teal' });
    await writeFile(file, text);
    const { store, warning } = await openPreferences(folder);
    expect(warning).toBe(
      `Your preferences in ${file.replaceAll('\\', '/')} come from a newer Visual Anything: what this one can read applies, and it never writes the file.`,
    );
    expect(store.current().theme).toBe('dark');
    expect(await store.set({ theme: 'light' })).toEqual({
      preferences: { ...DEFAULT_PREFERENCES, theme: 'light' },
      saved: false,
      reason: 'a newer Visual Anything wrote the preferences file',
    });
    expect(store.current().theme).toBe('light');
    expect(await readFile(file, 'utf8')).toBe(text);
  });

  it('writes atomically, in the fixed key order, and leaves no temporary file', async () => {
    const { store } = await openPreferences(folder);
    await store.set({ recentColors: ['#1D4F91'], theme: 'dark' });
    expect(await readdir(folder)).toEqual([PREFERENCES_FILE]);
    expect(await readFile(file, 'utf8')).toBe(
      [
        '{',
        '  "schemaVersion": 1,',
        '  "theme": "dark",',
        '  "language": "system",',
        '  "grid": false,',
        '  "snapToGrid": true,',
        '  "rulers": false,',
        '  "recentColors": [',
        '    "#1D4F91"',
        '  ],',
        '  "codeApprovals": [],',
        '  "author": null',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('keeps a change another program made on disk since it was read', async () => {
    const { store } = await openPreferences(folder);
    await writeFile(file, JSON.stringify({ schemaVersion: 1, grid: true, plugin: 'kept' }));
    expect(await store.set({ theme: 'dark' })).toEqual({
      preferences: { ...DEFAULT_PREFERENCES, theme: 'dark', grid: true },
      saved: true,
    });
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({
      theme: 'dark',
      grid: true,
      plugin: 'kept',
    });
  });

  it('applies changes one at a time, in the order they came', async () => {
    const { store } = await openPreferences(folder);
    const results = await Promise.all([
      store.set({ theme: 'dark' }),
      store.set({ grid: true }),
      store.set({ theme: 'light' }),
    ]);
    expect(results.map((result) => result.preferences)).toEqual([
      { ...DEFAULT_PREFERENCES, theme: 'dark' },
      { ...DEFAULT_PREFERENCES, theme: 'dark', grid: true },
      { ...DEFAULT_PREFERENCES, theme: 'light', grid: true },
    ]);
    expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ theme: 'light', grid: true });
  });

  it('keeps a change in memory when it cannot be written, and says why', async () => {
    const failing = realFs({
      rename: () => Promise.reject(Object.assign(new Error('EACCES: denied'), { code: 'EACCES' })),
    });
    const { store } = await openPreferences(folder, { writer: { fs: failing, retryDelays: [] } });
    expect(await store.set({ theme: 'dark' })).toEqual({
      preferences: { ...DEFAULT_PREFERENCES, theme: 'dark' },
      saved: false,
      reason: 'EACCES',
    });
    expect(store.current().theme).toBe('dark');
    expect(await readdir(folder)).toEqual([]);
  });

  it('keeps preferences in memory only without a folder', async () => {
    const { store, warning } = await openPreferences(null);
    expect(warning).toBeUndefined();
    expect(await store.set({ theme: 'dark' })).toEqual({
      preferences: { ...DEFAULT_PREFERENCES, theme: 'dark' },
      saved: false,
      reason: 'there is no folder to keep it in',
    });
    expect(store.current().theme).toBe('dark');
  });

  it('gives copies, so that what it hands out cannot change what it keeps', async () => {
    const { store } = await openPreferences(null);
    const result = await store.set({ recentColors: ['#FFFFFF'] });
    result.preferences.recentColors.push('#000000');
    store.current().recentColors.push('#000000');
    expect(store.current().recentColors).toEqual(['#FFFFFF']);
  });

  it('waits for the changes already asked for when it closes', async () => {
    let release: () => void = () => {};
    let renaming = false;
    const slow = realFs({
      rename: async (from, to) => {
        renaming = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        await fsp.rename(from, to);
      },
    });
    const { store } = await openPreferences(folder, { writer: { fs: slow } });
    const pending = store.set({ theme: 'dark' });
    let closed = false;
    const closing = store.close().then(() => {
      closed = true;
    });
    await expect.poll(() => renaming).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(closed).toBe(false);
    release();
    await closing;
    expect(await pending).toMatchObject({ saved: true });
  });
});
