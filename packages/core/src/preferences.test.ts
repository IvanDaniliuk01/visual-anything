import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  MAX_RECENT_COLORS,
  MAX_SIDE_PANEL_WIDTH,
  MIN_SIDE_PANEL_WIDTH,
  PREFERENCES_VERSION,
  LANGUAGE_CHOICES,
  MOTION_CHOICES,
  PREFERENCE_NAMES,
  THEME_CHOICES,
  applyPreferenceChanges,
  checkPreferenceChanges,
  formatPreferences,
  readPreferences,
  reducedMotionOf,
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
  language: fc.constantFrom(...LANGUAGE_CHOICES),
  grid: fc.boolean(),
  snapToGrid: fc.boolean(),
  rulers: fc.boolean(),
  recentColors: fc.uniqueArray(
    color.map((each) => each.toUpperCase()),
    { maxLength: MAX_RECENT_COLORS },
  ),
  // Approvals of package code (ADR 0054), as this build holds them: capabilities sorted.
  codeApprovals: fc.uniqueArray(
    fc.record({
      hash: fc.stringMatching(/^[0-9a-f]{64}$/),
      package: fc.constantFrom('gauges', 'clinic', 'sensors.v2'),
      capabilities: fc.subarray(['model:read', 'network:https://status.example.com', 'time']),
    }),
    { maxLength: 4, selector: (approval) => approval.hash },
  ),
  // Who the person's comments are signed as (ADR 0059): none, or a name and maybe an email.
  author: fc.option(
    fc.record(
      {
        name: fc.constantFrom('Ana', 'Bruno Díaz', 'Zoë', 'x'.repeat(200)),
        email: fc.constantFrom('ana@example.com', 'b@d'),
      },
      { requiredKeys: ['name'] },
    ),
    { nil: null },
  ),
  // How tours and scenario playback move (ADR 0077).
  motion: fc.constantFrom(...MOTION_CHOICES),
  fades: fc.boolean(),
  reviewClaude: fc.boolean(),
  // The side panels' widths and strips (ADR 0032's clarification of 2026-10-30).
  sidePanels: fc.record({ model: sidePanel(), inspector: sidePanel() }),
  // The packages whose code this computer does not run (ADR 0089's M14.2 clarification), sorted.
  codeTurnedOff: fc
    .uniqueArray(fc.constantFrom('gauges', 'clinic', 'sensors.v2', 'a-b'), { maxLength: 4 })
    .map((ids) => [...ids].sort()),
});

function sidePanel() {
  return fc.record({
    width: fc.integer({ min: MIN_SIDE_PANEL_WIDTH, max: MAX_SIDE_PANEL_WIDTH }),
    collapsed: fc.boolean(),
  });
}

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
  it('follows the system and the browser, with no grid, snapping on, no rulers and no recent colors', () => {
    expect(DEFAULT_PREFERENCES).toEqual({
      theme: 'system',
      language: 'system',
      grid: false,
      snapToGrid: true,
      rulers: false,
      recentColors: [],
      codeApprovals: [],
      author: null,
      motion: 'system',
      fades: true,
      reviewClaude: false,
      sidePanels: {
        model: { width: 288, collapsed: false },
        inspector: { width: 320, collapsed: false },
      },
      codeTurnedOff: [],
    });
    expect(PREFERENCE_NAMES).toEqual(Object.keys(DEFAULT_PREFERENCES));
  });

  it('cannot be changed by whoever reads it', () => {
    expect(Object.isFrozen(DEFAULT_PREFERENCES)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PREFERENCES.recentColors)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PREFERENCES.codeApprovals)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PREFERENCES.sidePanels)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PREFERENCES.sidePanels.model)).toBe(true);
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

describe('reducedMotionOf', () => {
  it('follows the system for "system", and the person’s choice otherwise (ADR 0077)', () => {
    expect(reducedMotionOf('system', true)).toBe(true);
    expect(reducedMotionOf('system', false)).toBe(false);
    expect(reducedMotionOf('reduced', false)).toBe(true);
    expect(reducedMotionOf('full', true)).toBe(false);
    expect(MOTION_CHOICES).toEqual(['system', 'reduced', 'full']);
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
      language: 'es',
      grid: true,
      snapToGrid: false,
      rulers: true,
      recentColors: ['#1D4F91', '#dceBff'],
      codeApprovals: [{ hash: 'c'.repeat(64), package: 'gauges', capabilities: ['time'] }],
      author: { name: ' Ana ', email: 'ana@example.com' },
      motion: 'reduced',
      fades: false,
      reviewClaude: true,
      sidePanels: {
        model: { width: 200, collapsed: true },
        inspector: { width: 2000, collapsed: false },
      },
      codeTurnedOff: ['gauges', 'clinic', 'gauges'],
    });
    expect(read.preferences).toEqual({
      theme: 'light',
      language: 'es',
      grid: true,
      snapToGrid: false,
      rulers: true,
      recentColors: ['#1D4F91', '#DCEBFF'],
      codeApprovals: [{ hash: 'c'.repeat(64), package: 'gauges', capabilities: ['time'] }],
      author: { name: 'Ana', email: 'ana@example.com' },
      motion: 'reduced',
      fades: false,
      reviewClaude: true,
      sidePanels: {
        model: { width: 200, collapsed: true },
        inspector: { width: 2000, collapsed: false },
      },
      codeTurnedOff: ['clinic', 'gauges'],
    });
    expect(read.unread).toEqual([]);
  });

  it('keeps side panels it cannot read as they are, and uses the default widths', () => {
    for (const value of [
      'wide',
      { model: { width: 288, collapsed: false } },
      { model: { width: 150, collapsed: false }, inspector: { width: 320, collapsed: false } },
      { model: { width: 288.5, collapsed: false }, inspector: { width: 320, collapsed: false } },
      { model: { width: 288, collapsed: 'no' }, inspector: { width: 320, collapsed: false } },
    ]) {
      const read = readPreferences({ sidePanels: value });
      expect(read.preferences.sidePanels).toEqual(DEFAULT_PREFERENCES.sidePanels);
      expect(read.kept).toEqual({ sidePanels: value });
      expect(read.unread).toEqual(['sidePanels']);
    }
  });

  it('reads an author without an email, and keeps one it cannot read as it is', () => {
    expect(readPreferences({ author: { name: 'Ana', email: '' } }).preferences.author).toEqual({
      name: 'Ana',
    });
    const read = readPreferences({ author: { name: '', nickname: 'A' } });
    expect(read.preferences.author).toBeNull();
    expect(read.kept).toEqual({ author: { name: '', nickname: 'A' } });
    expect(read.unread).toEqual(['author']);
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
      language: 'fr',
      grid: 'yes',
      recentColors: ['#FFFFFF', 'red'],
    });
    expect(read.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(read.kept).toEqual({
      theme: 'high-contrast',
      language: 'fr',
      grid: 'yes',
      recentColors: ['#FFFFFF', 'red'],
    });
    expect(read.unread).toEqual(['theme', 'language', 'grid', 'recentColors']);
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
        '  "language": "system",',
        '  "grid": false,',
        '  "snapToGrid": true,',
        '  "rulers": false,',
        '  "recentColors": [',
        '    "#1D4F91"',
        '  ],',
        '  "codeApprovals": [],',
        '  "author": null,',
        '  "motion": "system",',
        '  "fades": true,',
        '  "reviewClaude": false,',
        '  "sidePanels": {',
        '    "model": {',
        '      "width": 288,',
        '      "collapsed": false',
        '    },',
        '    "inspector": {',
        '      "width": 320,',
        '      "collapsed": false',
        '    }',
        '  },',
        '  "codeTurnedOff": [],',
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

  it('takes an author trimmed, without an empty email, and null to forget it', () => {
    expect(checkPreferenceChanges({ author: { name: ' Ana ', email: ' ' } })).toEqual({
      ok: true,
      changes: { author: { name: 'Ana' } },
    });
    expect(checkPreferenceChanges({ author: null })).toEqual({
      ok: true,
      changes: { author: null },
    });
  });

  it('keeps the packages turned off sorted, by id (ADR 0089)', () => {
    expect(checkPreferenceChanges({ codeTurnedOff: ['sensors.v2', 'clinic'] })).toEqual({
      ok: true,
      changes: { codeTurnedOff: ['clinic', 'sensors.v2'] },
    });
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
    [
      'a language this build has not',
      { language: 'fr' },
      '"language" must be "system", "en" or "es", not "fr".',
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
    [
      'a motion this build has not',
      { motion: 'slow' },
      '"motion" must be "system", "reduced" or "full", not "slow".',
    ],
    [
      'fades that are not true or false',
      { fades: 'on' },
      '"fades" must be true or false, not "on".',
    ],
    [
      'side panels that are not an object',
      { sidePanels: 'wide' },
      '"sidePanels" must hold "model" and "inspector", and nothing else.',
    ],
    [
      'side panels without the inspector',
      { sidePanels: { model: { width: 288, collapsed: false } } },
      '"sidePanels" must hold "model" and "inspector", and nothing else.',
    ],
    [
      'a side panel with more than a width and whether it is collapsed',
      {
        sidePanels: {
          model: { width: 288, collapsed: false, side: 'left' },
          inspector: { width: 320, collapsed: false },
        },
      },
      '"sidePanels.model" must hold "width" and "collapsed", and nothing else.',
    ],
    [
      'a side panel narrower than 200 pixels',
      {
        sidePanels: {
          model: { width: 288, collapsed: false },
          inspector: { width: 199, collapsed: false },
        },
      },
      '"sidePanels.inspector.width" must be a whole number of pixels from 200 to 2000, not 199.',
    ],
    [
      'a side panel width that is not whole',
      {
        sidePanels: {
          model: { width: 300.5, collapsed: false },
          inspector: { width: 320, collapsed: false },
        },
      },
      '"sidePanels.model.width" must be a whole number of pixels from 200 to 2000, not 300.5.',
    ],
    [
      'a side panel collapsed that is not true or false',
      {
        sidePanels: {
          model: { width: 288, collapsed: 'yes' },
          inspector: { width: 320, collapsed: false },
        },
      },
      '"sidePanels.model.collapsed" must be true or false, not "yes".',
    ],
    [
      'an author that is no object',
      { author: 'Ana' },
      '"author" must be null, or a name and an email.',
    ],
    [
      'an author with more than a name and an email',
      { author: { name: 'Ana', role: 'admin' } },
      '"author" has a name and an email, and nothing else.',
    ],
    ['an author with no name', { author: { name: '  ' } }, '"author" needs a name.'],
    [
      'an author with a long name',
      { author: { name: 'x'.repeat(201) } },
      '"author" has a name of at most 200 characters.',
    ],
    [
      'an author with an email that is not one',
      { author: { name: 'Ana', email: 'ana at example' } },
      '"author" has an email that is not one: "ana at example".',
    ],
    [
      'packages turned off that are not a list',
      { codeTurnedOff: 'gauges' },
      '"codeTurnedOff" must be a list of package ids.',
    ],
    [
      'a package turned off that is no id',
      { codeTurnedOff: ['gauges', 'not an id'] },
      '"codeTurnedOff" must be a list of package ids.',
    ],
    [
      'a package turned off twice',
      { codeTurnedOff: ['gauges', 'gauges'] },
      '"codeTurnedOff" names gauges twice.',
    ],
    [
      'too many packages turned off',
      { codeTurnedOff: Array.from({ length: 257 }, (_, n) => `p${n}`) },
      '"codeTurnedOff" holds 257 packages, more than 256.',
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

  it('shares no author with the changes', () => {
    const changes: PreferenceChanges = { author: { name: 'Ana' } };
    const after = applyPreferenceChanges(DEFAULT_PREFERENCES, changes);
    expect(after.author).toEqual({ name: 'Ana' });
    expect(after.author).not.toBe(changes.author);
    expect(applyPreferenceChanges(after, { author: null }).author).toBeNull();
  });

  it('shares no side panel with the changes or the preferences before', () => {
    const changes: PreferenceChanges = {
      sidePanels: {
        model: { width: 400, collapsed: true },
        inspector: { width: 320, collapsed: false },
      },
    };
    const after = applyPreferenceChanges(DEFAULT_PREFERENCES, changes);
    expect(after.sidePanels).toEqual(changes.sidePanels);
    expect(after.sidePanels.model).not.toBe(changes.sidePanels?.model);
    const again = applyPreferenceChanges(after, {});
    expect(again.sidePanels.inspector).not.toBe(after.sidePanels.inspector);
  });
});
