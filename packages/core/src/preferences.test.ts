import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  MAX_RECENT_COLORS,
  PREFERENCES_VERSION,
  PREFERENCE_NAMES,
  THEME_CHOICES,
  applyPreferenceChanges,
  checkPreferenceChanges,
  formatPreferences,
  readPreferences,
  resolveTheme,
  type PreferenceChanges,
  type Preferences,
} from './preferences';

const hexDigit = fc.constantFrom(...'0123456789abcdefABCDEF'.split(''));
/** A color as a person or a file may write it: #RRGGBB in either case. */
const color = fc
  .array(hexDigit, { minLength: 6, maxLength: 6 })
  .map((digits) => `#${digits.join('')}`);

/** Preferences as this build holds them: colors in capitals, distinct, at most 8. */
const preferences: fc.Arbitrary<Preferences> = fc.record({
  theme: fc.constantFrom(...THEME_CHOICES),
  grid: fc.boolean(),
  snapToGrid: fc.boolean(),
  rulers: fc.boolean(),
  recentColors: fc.uniqueArray(
    color.map((each) => each.toUpperCase()),
    { maxLength: MAX_RECENT_COLORS },
  ),
});

/** Any JSON value, as it reads back from its text (so without -0). */
const json = fc.jsonValue().map((value) => JSON.parse(JSON.stringify(value)) as unknown);

/** Names this build does not know, including some that are object properties in JavaScript. */
const unknownName = fc
  .oneof(
    fc.string({ minLength: 1, maxLength: 12 }),
    fc.constantFrom('__proto__', 'constructor', 'toString', 'hasOwnProperty', '42', '7'),
  )
  .filter((name) => name !== 'schemaVersion' && !(PREFERENCE_NAMES as string[]).includes(name));

const unknownNames = fc.uniqueArray(fc.tuple(unknownName, json), {
  maxLength: 5,
  selector: ([name]) => name,
});

function record(entries: readonly (readonly [string, unknown])[]): Record<string, unknown> {
  return Object.fromEntries(entries);
}

describe('DEFAULT_PREFERENCES', () => {
  it('follows the system, with no grid, snapping on, no rulers and no recent colors', () => {
    expect(DEFAULT_PREFERENCES).toEqual({
      theme: 'system',
      grid: false,
      snapToGrid: true,
      rulers: false,
      recentColors: [],
    });
    expect(PREFERENCE_NAMES).toEqual(Object.keys(DEFAULT_PREFERENCES));
  });

  it('cannot be changed by whoever reads it', () => {
    expect(Object.isFrozen(DEFAULT_PREFERENCES)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PREFERENCES.recentColors)).toBe(true);
  });
});

describe('resolveTheme', () => {
  it('takes a chosen theme as it is, and the system’s for "system"', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });
});

describe('readPreferences', () => {
  it('gives the defaults for a value that is not an object of preferences', () => {
    for (const value of [null, 3, 'dark', [], [{ theme: 'dark' }], true]) {
      expect(readPreferences(value)).toEqual({
        preferences: DEFAULT_PREFERENCES,
        kept: {},
        unread: [],
        newer: false,
      });
    }
  });

  it('gives the default for every name the file leaves out', () => {
    expect(readPreferences({ schemaVersion: 1, theme: 'dark' })).toEqual({
      preferences: { ...DEFAULT_PREFERENCES, theme: 'dark' },
      kept: {},
      unread: [],
      newer: false,
    });
  });

  it('reads every name it knows', () => {
    const read = readPreferences({
      schemaVersion: 1,
      theme: 'light',
      grid: true,
      snapToGrid: false,
      rulers: true,
      recentColors: ['#1D4F91', '#dceBff'],
    });
    expect(read.preferences).toEqual({
      theme: 'light',
      grid: true,
      snapToGrid: false,
      rulers: true,
      recentColors: ['#1D4F91', '#DCEBFF'],
    });
    expect(read.unread).toEqual([]);
  });

  it('keeps the names it does not know as they are', () => {
    const read = readPreferences({ schemaVersion: 1, zoomSpeed: 2, panel: { width: 300 } });
    expect(read.kept).toEqual({ zoomSpeed: 2, panel: { width: 300 } });
    expect(read.unread).toEqual([]);
    expect(read.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it('keeps a value it cannot read for a name it knows, such as a theme added later', () => {
    const read = readPreferences({
      schemaVersion: 1,
      theme: 'high-contrast',
      grid: 'yes',
      recentColors: ['#FFFFFF', 'red'],
    });
    expect(read.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(read.kept).toEqual({
      theme: 'high-contrast',
      grid: 'yes',
      recentColors: ['#FFFFFF', 'red'],
    });
    expect(read.unread).toEqual(['theme', 'grid', 'recentColors']);
  });

  it('reads recent colors in capitals, each once, newest first, at most 8', () => {
    const colors = ['#aaaaaa', '#AAAAAA', ...Array.from({ length: 9 }, (_, n) => `#00000${n}`)];
    expect(readPreferences({ recentColors: colors }).preferences.recentColors).toEqual([
      '#AAAAAA',
      ...Array.from({ length: 7 }, (_, n) => `#00000${n}`),
    ]);
  });

  it('never keeps schemaVersion, and reads a file of a later format as newer', () => {
    expect(readPreferences({ schemaVersion: 1 })).toMatchObject({ kept: {}, newer: false });
    expect(readPreferences({ schemaVersion: 2, theme: 'dark' })).toEqual({
      preferences: { ...DEFAULT_PREFERENCES, theme: 'dark' },
      kept: {},
      unread: [],
      newer: true,
    });
    expect(readPreferences({ schemaVersion: 'two' })).toMatchObject({ kept: {}, newer: false });
  });

  it('keeps names that are properties of every JavaScript object as plain names', () => {
    const read = readPreferences(JSON.parse('{"__proto__": {"theme": "dark"}, "constructor": 1}'));
    expect(Object.getPrototypeOf(read.kept)).toBe(Object.prototype);
    expect(Object.keys(read.kept)).toEqual(['__proto__', 'constructor']);
    expect(read.preferences.theme).toBe('system');
  });

  it('never fails, and always gives preferences this build can use', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const { preferences: read } = readPreferences(value);
        expect(checkPreferenceChanges(read)).toEqual({ ok: true, changes: read });
      }),
    );
  });

  it('gives back the preferences and the unknown names that formatPreferences wrote', () => {
    fc.assert(
      fc.property(preferences, unknownNames, (written, entries) => {
        const kept = record(entries);
        const read = readPreferences(JSON.parse(formatPreferences(written, kept)));
        expect(read).toEqual({ preferences: written, kept, unread: [], newer: false });
      }),
    );
  });
});

describe('formatPreferences', () => {
  it('writes the format version, every known name in order, then the kept names sorted', () => {
    const text = formatPreferences(
      { ...DEFAULT_PREFERENCES, theme: 'dark', recentColors: ['#1D4F91'] },
      { zebra: true, apple: [1, 2] },
    );
    expect(text).toBe(
      [
        '{',
        '  "schemaVersion": 1,',
        '  "theme": "dark",',
        '  "grid": false,',
        '  "snapToGrid": true,',
        '  "rulers": false,',
        '  "recentColors": [',
        '    "#1D4F91"',
        '  ],',
        '  "apple": [',
        '    1,',
        '    2',
        '  ],',
        '  "zebra": true',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('writes a value kept for a known name in place of the one this build holds', () => {
    const text = formatPreferences(DEFAULT_PREFERENCES, { theme: 'high-contrast' });
    expect(JSON.parse(text)).toEqual({
      schemaVersion: PREFERENCES_VERSION,
      ...DEFAULT_PREFERENCES,
      theme: 'high-contrast',
    });
  });

  it('keeps the order it writes even for names that look like numbers', () => {
    const text = formatPreferences(DEFAULT_PREFERENCES, { b: 1, '10': 2, '9': 3 });
    expect(text.split('\n').slice(1, 3)).toEqual(['  "schemaVersion": 1,', '  "theme": "system",']);
    expect(text.indexOf('"10"')).toBeLessThan(text.indexOf('"9"'));
    expect(text.indexOf('"9"')).toBeLessThan(text.indexOf('"b"'));
  });

  it('writes schemaVersion once, even when kept holds it', () => {
    const text = formatPreferences(DEFAULT_PREFERENCES, { schemaVersion: 7 });
    expect(text.match(/schemaVersion/g)).toHaveLength(1);
    expect(JSON.parse(text)).toMatchObject({ schemaVersion: 1 });
  });

  it('writes a value it cannot read back as it was read', () => {
    fc.assert(
      fc.property(preferences, json, (written, value) => {
        const read = readPreferences({ theme: value });
        const again = readPreferences(JSON.parse(formatPreferences(written, read.kept)));
        expect(again.kept).toEqual(read.kept);
        expect(again.unread).toEqual(read.unread);
      }),
    );
  });
});

describe('checkPreferenceChanges', () => {
  it('takes any change to known names with values this build can use', () => {
    fc.assert(
      fc.property(
        preferences,
        fc.subarray([...PREFERENCE_NAMES], { minLength: 1 }),
        (all, names) => {
          const changes: PreferenceChanges = Object.fromEntries(
            names.map((name) => [name, all[name]]),
          );
          expect(checkPreferenceChanges(changes)).toEqual({ ok: true, changes });
        },
      ),
    );
  });

  it('writes the colors it takes in capitals', () => {
    expect(checkPreferenceChanges({ recentColors: ['#dcebff', '#1d4F91'] })).toEqual({
      ok: true,
      changes: { recentColors: ['#DCEBFF', '#1D4F91'] },
    });
  });

  it.each<[string, unknown, string]>([
    [
      'not an object',
      'dark',
      'Preferences to change must be an object, such as {"theme": "dark"}.',
    ],
    ['an array', ['theme'], 'Preferences to change must be an object, such as {"theme": "dark"}.'],
    ['no change', {}, 'There is no preference to change.'],
    ['an unknown name', { zoomSpeed: 2 }, '"zoomSpeed" is not a preference.'],
    [
      'a theme this build has not',
      { theme: 'sepia' },
      '"theme" must be "system", "light" or "dark", not "sepia".',
    ],
    ['a grid that is not true or false', { grid: 'on' }, '"grid" must be true or false, not "on".'],
    [
      'snapping that is not true or false',
      { snapToGrid: 1 },
      '"snapToGrid" must be true or false, not 1.',
    ],
    [
      'rulers that are not true or false',
      { rulers: null },
      '"rulers" must be true or false, not null.',
    ],
    [
      'recent colors that are not a list',
      { recentColors: '#FFFFFF' },
      '"recentColors" must be a list of colors written #RRGGBB.',
    ],
    [
      'a recent color that is not #RRGGBB',
      { recentColors: ['#FFF'] },
      '"recentColors" must hold colors written #RRGGBB, not "#FFF".',
    ],
    [
      'a recent color twice',
      { recentColors: ['#1D4F91', '#1d4f91'] },
      '"recentColors" holds #1D4F91 twice.',
    ],
    [
      'too many recent colors',
      { recentColors: Array.from({ length: 9 }, (_, n) => `#00000${n}`) },
      '"recentColors" holds 9 colors, more than 8.',
    ],
  ])('refuses %s', (_, value, message) => {
    expect(checkPreferenceChanges(value)).toEqual({
      ok: false,
      problems: [{ code: 'invalid-command', message }],
    });
  });

  it('names every problem it finds', () => {
    const checked = checkPreferenceChanges({ theme: 3, grid: 'no', colour: '#FFFFFF' });
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.problems).toHaveLength(3);
  });

  it('refuses names that are properties of every JavaScript object', () => {
    for (const text of ['{"__proto__": {"theme": "dark"}}', '{"constructor": "dark"}']) {
      expect(checkPreferenceChanges(JSON.parse(text))).toMatchObject({ ok: false });
    }
  });
});

describe('applyPreferenceChanges', () => {
  it('sets what the changes name, keeps the rest, and shares no list with either', () => {
    const before: Preferences = { ...DEFAULT_PREFERENCES, recentColors: ['#FFFFFF'] };
    const changes: PreferenceChanges = { theme: 'dark', recentColors: ['#000000'] };
    const after = applyPreferenceChanges(before, changes);
    expect(after).toEqual({ ...DEFAULT_PREFERENCES, theme: 'dark', recentColors: ['#000000'] });
    expect(after.recentColors).not.toBe(changes.recentColors);
    expect(before.recentColors).toEqual(['#FFFFFF']);
  });
});
