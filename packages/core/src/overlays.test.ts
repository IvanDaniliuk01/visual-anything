/**
 * Overlays (ADR 0055): what each mapping gives each channel, the first overlay that sets a channel
 * winning, the legend and its warnings, the commands that keep a view's overlays, and what a file's
 * overlays break as it opens.
 */
import fc from 'fast-check';
import type { Color, JsonValue, Overlay, ViewFile } from '@visual-anything/schema';
import { formatFile } from '@visual-anything/schema/format';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { checkProject } from './check';
import { executeCommand, type Command } from './commands';
import { applyOperations } from './operations';
import { fadedColor, legendOf, mixColors, overlayLookOf, overlayValue } from './overlays';
import type { ProblemCode } from './problems';
import type { ProjectSnapshot } from './snapshot';
import { definitionsIn } from './state';
import { sequentialIds, testProject } from './test/fixtures';

const latency: Overlay = {
  id: 'latency',
  name: 'Latency',
  of: 'elements',
  attribute: 'latency',
  channel: 'fill',
  mapping: {
    kind: 'continuous',
    stops: [
      { at: 0, color: '#00FF00' },
      { at: 100, color: '#FF0000' },
    ],
  },
};

const owner: Overlay = {
  id: 'owner',
  of: 'elements',
  attribute: 'owner',
  channel: 'fill',
  mapping: {
    kind: 'discrete',
    cases: [
      { value: 'billing', color: '#1D4ED8', label: 'Billing team' },
      { value: 'Care', color: '#B45309' },
    ],
    otherwise: '#6B7280',
  },
};

describe('overlayValue', () => {
  it('maps values one by one as filters compare them, and any other value to otherwise', () => {
    expect(overlayValue(owner, 'billing')).toBe('#1D4ED8');
    expect(overlayValue(owner, '  CARE ')).toBe('#B45309');
    expect(overlayValue(owner, 'ops')).toBe('#6B7280');
    expect(overlayValue(owner, undefined)).toBe('#6B7280');
    const counts: Overlay = {
      ...owner,
      channel: 'badge',
      mapping: {
        kind: 'discrete',
        cases: [
          { value: '12', text: 'XII' },
          { value: 'true', text: 'yes' },
        ],
      },
    };
    expect(overlayValue(counts, 12)).toBe('XII');
    expect(overlayValue(counts, '12.0')).toBe('XII');
    expect(overlayValue(counts, true)).toBe('yes');
    // Without otherwise, a value no case names keeps its own.
    expect(overlayValue(counts, 13)).toBeUndefined();
  });

  it('maps numbers along a range, up to and from its ends', () => {
    expect(overlayValue(latency, -5)).toBe('#00FF00');
    expect(overlayValue(latency, 0)).toBe('#00FF00');
    expect(overlayValue(latency, 50)).toBe('#808000');
    expect(overlayValue(latency, '100')).toBe('#FF0000');
    expect(overlayValue(latency, 1e9)).toBe('#FF0000');
    expect(overlayValue(latency, 'slow')).toBeUndefined();
    expect(overlayValue(latency, undefined)).toBeUndefined();
    const size: Overlay = {
      ...latency,
      channel: 'size',
      mapping: {
        kind: 'continuous',
        stops: [
          { at: 10, size: 0.5 },
          { at: 20, size: 1 },
          { at: 40, size: 2 },
        ],
      },
    };
    expect(overlayValue(size, 15)).toBe(0.75);
    expect(overlayValue(size, 30)).toBe(1.5);
    const opacity: Overlay = {
      ...latency,
      channel: 'opacity',
      mapping: { kind: 'discrete', cases: [{ value: 'retired', opacity: 0.2 }], otherwise: 1 },
    };
    expect(overlayValue(opacity, 'Retired')).toBe(0.2);
    expect(overlayValue(opacity, 'live')).toBe(1);
  });

  it('reads stops out of order in order of where they are', () => {
    const shuffled: Overlay = {
      ...latency,
      mapping: {
        kind: 'continuous',
        stops: [
          { at: 100, color: '#FF0000' },
          { at: 0, color: '#00FF00' },
        ],
      },
    };
    expect(overlayValue(shuffled, 50)).toBe('#808000');
  });

  it('takes the value itself as a color or as a badge', () => {
    const color: Overlay = { ...owner, mapping: { kind: 'passthrough' } };
    expect(overlayValue(color, '#abcdef')).toBe('#ABCDEF');
    expect(overlayValue(color, 'red')).toBeUndefined();
    const badge: Overlay = { ...owner, channel: 'badge', mapping: { kind: 'passthrough' } };
    expect(overlayValue(badge, ' p95 ')).toBe('p95');
    expect(overlayValue(badge, 42)).toBe('42');
    expect(overlayValue(badge, 'a very long value indeed')).toBe('a very long…');
    expect(overlayValue(badge, '')).toBeUndefined();
    expect(overlayValue(badge, false)).toBeUndefined();
    expect(overlayValue(badge, null)).toBeUndefined();
  });

  const color = fc.stringMatching(/^#[0-9A-F]{6}$/);

  it('keeps a range within its stops, channel by channel', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.double({ min: -1e6, max: 1e6, noNaN: true }), {
          minLength: 2,
          maxLength: 5,
        }),
        fc.array(color, { minLength: 5, maxLength: 5 }),
        fc.double({ min: -2e6, max: 2e6, noNaN: true }),
        (ats, colors, at) => {
          const stops = ats.map((each, index) => ({ at: each, color: colors[index] as Color }));
          const overlay: Overlay = { ...latency, mapping: { kind: 'continuous', stops } };
          const result = overlayValue(overlay, at) as Color;
          expect(result).toMatch(/^#[0-9A-F]{6}$/);
          for (const [from, to] of [
            [1, 3],
            [3, 5],
            [5, 7],
          ] as const) {
            const part = parseInt(result.slice(from, to), 16);
            const parts = stops.map((stop) => parseInt(stop.color.slice(from, to), 16));
            expect(part).toBeGreaterThanOrEqual(Math.min(...parts));
            expect(part).toBeLessThanOrEqual(Math.max(...parts));
          }
        },
      ),
    );
  });
});

describe('overlayLookOf', () => {
  const values: Record<string, JsonValue> = { latency: 50, owner: 'billing', tier: 'gold' };
  const valueOf = (name: string) => values[name];

  it('sets each channel by the first overlay that sets it', () => {
    expect(overlayLookOf([owner, latency], 'elements', valueOf)).toEqual({ fill: '#1D4ED8' });
    expect(overlayLookOf([latency, owner], 'elements', valueOf)).toEqual({ fill: '#808000' });
    // An overlay that maps no such value leaves the channel to the next.
    const strict: Overlay = {
      ...owner,
      id: 'strict',
      mapping: { kind: 'discrete', cases: [{ value: 'care', color: '#000000' }] },
    };
    expect(overlayLookOf([strict, latency], 'elements', valueOf)).toEqual({ fill: '#808000' });
  });

  it('sets nothing for overlays turned off, of the other kind, or filling relations', () => {
    expect(overlayLookOf([{ ...owner, off: true }], 'elements', valueOf)).toBeUndefined();
    expect(overlayLookOf([owner], 'relations', valueOf)).toBeUndefined();
    expect(overlayLookOf([{ ...owner, of: 'relations' }], 'relations', valueOf)).toBeUndefined();
    expect(
      overlayLookOf([{ ...owner, of: 'relations', channel: 'stroke' }], 'relations', valueOf),
    ).toEqual({ stroke: '#1D4ED8' });
    expect(overlayLookOf(undefined, 'elements', valueOf)).toBeUndefined();
  });

  it('sets several channels at once', () => {
    const badge: Overlay = {
      id: 'tier',
      of: 'elements',
      attribute: 'tier',
      channel: 'badge',
      mapping: { kind: 'passthrough' },
    };
    expect(overlayLookOf([owner, badge], 'elements', valueOf)).toEqual({
      fill: '#1D4ED8',
      badge: 'gold',
    });
  });
});

describe('mixing and fading colors', () => {
  it('mixes channel by channel, in capitals', () => {
    expect(mixColors('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixColors('#000000', '#ffffff', 1)).toBe('#FFFFFF');
    expect(mixColors('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });

  it('fades toward what a shape is drawn on', () => {
    expect(fadedColor('#FF0000', '#FFFFFF', 1)).toBe('#FF0000');
    expect(fadedColor('#FF0000', '#FFFFFF', 0.1)).toBe('#FFE6E6');
    expect(fadedColor('#FF0000', '#16191E', 0.5)).toBe('#8B0D0F');
  });
});

// The legend ----------------------------------------------------------------------------------------

function withOverlays(
  overlays: Overlay[],
  state: ProjectSnapshot = testProject(),
): ProjectSnapshot {
  const view = state.views[0] as ViewFile;
  return { ...state, views: [{ ...view, overlays }] };
}

describe('legendOf', () => {
  it('lists each overlay that is on, with what each value, stop and other value means', () => {
    const state = withOverlays([
      owner,
      { ...latency, off: true },
      { ...latency, id: 'again', name: undefined },
    ]);
    const legend = legendOf(state.views[0] as ViewFile, definitionsIn(state), 'light');
    expect(legend.overlays.map((part) => part.id)).toEqual(['owner', 'again']);
    const [first, second] = legend.overlays;
    expect(first?.title).toBe('owner');
    expect(first?.entries).toEqual([
      { kind: 'case', label: 'Billing team', color: '#1D4ED8' },
      { kind: 'case', label: 'Care', color: '#B45309' },
      { kind: 'otherwise', color: '#6B7280' },
    ]);
    expect(second?.title).toBe('latency');
    expect(second?.mapping).toBe('continuous');
    expect(second?.entries.map((entry) => entry.label)).toEqual(['0', '100']);
  });

  it('writes the unit of a stop, as the definitions give it', () => {
    const state = testProject();
    const box = state.packages[0]?.components[1];
    box?.attributes?.splice(0, 1, { name: 'latency', type: 'number', default: 100, unit: 'ms' });
    const view = withOverlays([latency], state).views[0] as ViewFile;
    const [part] = legendOf(view, definitionsIn(state), 'light').overlays;
    expect(part?.unit).toBe('ms');
    expect(part?.entries.map((entry) => entry.label)).toEqual(['0 ms', '100 ms']);
  });

  it('warns about colors under 3:1 apart, or under 3:1 against the canvas shown', () => {
    const close: Overlay = {
      ...owner,
      mapping: {
        kind: 'discrete',
        cases: [
          { value: 'a', color: '#FFFF00' },
          { value: 'b', color: '#FFFF66' },
        ],
        otherwise: '#000000',
      },
    };
    const state = withOverlays([close]);
    const light = legendOf(state.views[0] as ViewFile, definitionsIn(state), 'light');
    expect(light.overlays[0]?.warnings).toEqual([
      '"a" of "owner" is 1.0:1 against the light canvas, under 3:1.',
      '"b" of "owner" is 1.0:1 against the light canvas, under 3:1.',
      '"a" and "b" of "owner" are 1.0:1 apart, under 3:1.',
    ]);
    const dark = legendOf(state.views[0] as ViewFile, definitionsIn(state), 'dark');
    expect(dark.overlays[0]?.warnings).toEqual([
      'Any other value of "owner" is 1.1:1 against the dark canvas, under 3:1.',
      '"a" and "b" of "owner" are 1.0:1 apart, under 3:1.',
    ]);
  });

  it('says how many more warnings there are past a few', () => {
    const many: Overlay = {
      ...owner,
      mapping: {
        kind: 'discrete',
        cases: ['#FFFFF0', '#FFFFF1', '#FFFFF2', '#FFFFF3', '#FFFFF4'].map((color, at) => ({
          value: `v${at}`,
          color,
        })),
      },
    };
    const state = withOverlays([many]);
    const warnings = legendOf(state.views[0] as ViewFile, definitionsIn(state), 'light').overlays[0]
      ?.warnings;
    expect(warnings).toHaveLength(6);
    expect(warnings?.at(-1)).toBe('…and 10 more warnings about the colors of "owner".');
  });

  it('leaves out a fill on relations, which have none', () => {
    const state = withOverlays([{ ...owner, of: 'relations' }]);
    expect(legendOf(state.views[0] as ViewFile, definitionsIn(state), 'light').overlays).toEqual(
      [],
    );
  });
});

// The commands -------------------------------------------------------------------------------------

function run(command: Command, state: ProjectSnapshot = testProject()) {
  return executeCommand(state, command, { newId: sequentialIds() });
}

function ok(command: Command, state: ProjectSnapshot = testProject()) {
  const outcome = run(command, state);
  if (!outcome.ok) {
    throw new Error(`Rejected: ${outcome.problems.map((each) => each.message).join(' ')}`);
  }
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
  return outcome;
}

function refused(
  command: Command,
  state?: ProjectSnapshot,
): { code: ProblemCode; message: string } {
  const outcome = run(command, state);
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems[0] as { code: ProblemCode; message: string };
}

function overlaysOf(state: ProjectSnapshot): Overlay[] | undefined {
  return state.views[0]?.overlays;
}

describe('set-overlays', () => {
  it('sets a view’s overlays in order, as one change to its file', () => {
    const outcome = ok({ type: 'set-overlays', view: 'overview', overlays: [owner, latency] });
    expect(outcome.label).toBe('Set the overlays of "Overview"');
    expect(outcome.operations.map((each) => each.op)).toEqual(['set-view']);
    expect(overlaysOf(outcome.state)?.map((each) => each.id)).toEqual(['owner', 'latency']);
    // The file it writes is valid and reads back as it was.
    const view = outcome.state.views[0] as ViewFile;
    expect(validateFile('view', JSON.parse(formatFile('view', view))).ok).toBe(true);
  });

  it('takes them all away with an empty list, and records nothing for the same ones', () => {
    const state = ok({ type: 'set-overlays', view: 'overview', overlays: [owner] }).state;
    const removed = ok({ type: 'set-overlays', view: 'overview', overlays: [] }, state);
    expect(removed.label).toBe('Remove the overlays of "Overview"');
    expect('overlays' in (removed.state.views[0] as ViewFile)).toBe(false);
    expect(
      ok({ type: 'set-overlays', view: 'overview', overlays: [owner] }, state).operations,
    ).toEqual([]);
  });

  it('makes the ids it is not given, from the attribute and the channel', () => {
    const unnamed = { ...owner, id: undefined };
    const outcome = ok({
      type: 'set-overlays',
      view: 'overview',
      overlays: [unnamed, unnamed] as never,
    });
    const ids = overlaysOf(outcome.state)?.map((each) => each.id);
    expect(ids).toEqual(['owner-fill-1', 'owner-fill-2']);
  });

  it('keeps values as text, and colors in capitals', () => {
    const outcome = ok({
      type: 'set-overlays',
      view: 'overview',
      overlays: [
        {
          ...owner,
          mapping: {
            kind: 'discrete',
            cases: [
              { value: 12 as never, color: '#abcdef' },
              { value: true as never, color: '#000000' },
            ],
          },
        },
      ],
    });
    expect(overlaysOf(outcome.state)?.[0]?.mapping).toEqual({
      kind: 'discrete',
      cases: [
        { value: '12', color: '#ABCDEF' },
        { value: 'true', color: '#000000' },
      ],
    });
  });

  it('keeps how a file spells a color it already holds', () => {
    const state = withOverlays([
      { ...owner, mapping: { kind: 'discrete', cases: [{ value: 'x', color: '#abcdef' }] } },
    ]);
    const outcome = ok(
      {
        type: 'set-overlays',
        view: 'overview',
        overlays: [
          { ...owner, mapping: { kind: 'discrete', cases: [{ value: 'x', color: '#ABCDEF' }] } },
        ],
      },
      state,
    );
    expect(outcome.operations).toEqual([]);
  });

  it('warns when nothing has the attribute an overlay reads', () => {
    const outcome = ok({
      type: 'set-overlays',
      view: 'overview',
      overlays: [
        { ...owner, attribute: 'cost' },
        { ...owner, id: 'calls', of: 'relations', channel: 'stroke', attribute: 'rate' },
      ],
    });
    expect(outcome.warnings.map((each) => each.message)).toEqual([
      'No element has "cost", which the overlay "cost" reads: it changes nothing yet.',
      'No relation has "rate", which the overlay "rate" reads: it changes nothing yet.',
    ]);
    // An element that holds it itself counts.
    const held = ok({
      type: 'set-overlays',
      view: 'overview',
      overlays: [{ ...owner, attribute: 'latency' }],
    });
    expect(held.warnings).toEqual([]);
  });

  it('refuses what an overlay cannot be, with a stable code and words that say why', () => {
    const set = (overlay: unknown): Command => ({
      type: 'set-overlays',
      view: 'overview',
      overlays: [overlay as never],
    });
    const cases: [unknown, ProblemCode, string][] = [
      ['fill', 'invalid-overlay', 'An overlay is an object with a channel.'],
      [
        { ...owner, color: 1 },
        'invalid-overlay',
        'An overlay holds id, name, of, attribute, channel, mapping and off, not "color".',
      ],
      [{ ...owner, attribute: ' ' }, 'invalid-overlay', 'An overlay names the attribute it reads.'],
      [{ ...owner, name: '' }, 'invalid-overlay', 'The name of an overlay has 1 to 64 characters.'],
      [
        { ...owner, of: 'views' },
        'invalid-overlay',
        'The overlay "owner" reads the attributes of "elements" or of "relations".',
      ],
      [
        { ...owner, channel: 'glow' },
        'invalid-overlay',
        'The overlay "owner" sets "fill", "stroke", "size", "badge" or "opacity".',
      ],
      [
        { ...owner, of: 'relations' },
        'invalid-overlay',
        'A relation has no fill: the overlay "owner" can color the stroke of relations instead.',
      ],
      [
        { ...owner, off: 'yes' },
        'invalid-overlay',
        'Whether the overlay "owner" is off is true or false.',
      ],
      [{ ...owner, id: 'not an id' }, 'invalid-id', '"not an id" is not a valid id.'],
      [
        { ...owner, mapping: { kind: 'bands' } },
        'invalid-overlay',
        'The overlay "owner" maps its attribute "discrete", "continuous" or "passthrough".',
      ],
      [
        { ...owner, mapping: { kind: 'discrete', cases: [] } },
        'invalid-overlay',
        'The overlay "owner" maps 1 to 64 values one by one.',
      ],
      [
        { ...owner, mapping: { kind: 'discrete', cases: [{ value: 'a', color: 'red' }] } },
        'invalid-overlay',
        'The overlay "owner" colors with colors written as #RRGGBB, not "red".',
      ],
      [
        {
          ...owner,
          mapping: {
            kind: 'discrete',
            cases: [
              { value: 'a', color: '#000000' },
              { value: ' A', color: '#FFFFFF' },
            ],
          },
        },
        'invalid-overlay',
        'The overlay "owner" maps " A" twice.',
      ],
      [
        { ...owner, mapping: { kind: 'discrete', cases: [{ value: null, color: '#000000' }] } },
        'invalid-overlay',
        'A value the overlay "owner" maps is text, a number, or true or false.',
      ],
      [
        {
          ...owner,
          mapping: { kind: 'discrete', cases: [{ value: 'a', color: '#000000', size: 1 }] },
        },
        'invalid-overlay',
        'A value the overlay "owner" maps has no "size".',
      ],
      [
        {
          ...owner,
          mapping: { kind: 'discrete', cases: [{ value: 'a', color: '#000000', label: '' }] },
        },
        'invalid-overlay',
        'What the legend of "owner" says for a value has 1 to 64 characters.',
      ],
      [
        {
          ...owner,
          mapping: {
            kind: 'discrete',
            cases: [{ value: 'a', color: '#000000' }],
            otherwise: 'grey',
          },
        },
        'invalid-overlay',
        'The overlay "owner" colors with colors written as #RRGGBB, not "grey".',
      ],
      [
        { ...latency, mapping: { kind: 'continuous', stops: [{ at: 1, color: '#000000' }] } },
        'invalid-overlay',
        'The overlay "Latency" maps a range through 2 to 16 stops.',
      ],
      [
        {
          ...latency,
          mapping: {
            kind: 'continuous',
            stops: [
              { at: 2, color: '#000000' },
              { at: 1, color: '#FFFFFF' },
            ],
          },
        },
        'invalid-overlay',
        'The stops of the overlay "Latency" go up: each at a number above the one before it.',
      ],
      [
        {
          ...latency,
          mapping: {
            kind: 'continuous',
            stops: [
              { at: 'low', color: '#000000' },
              { at: 1, color: '#FFFFFF' },
            ],
          },
        },
        'invalid-overlay',
        'A stop of the overlay "Latency" is at a number.',
      ],
      [
        {
          ...latency,
          channel: 'size',
          mapping: {
            kind: 'continuous',
            stops: [
              { at: 0, size: 0.4 },
              { at: 1, size: 1 },
            ],
          },
        },
        'invalid-overlay',
        'The overlay "Latency" sizes by a factor from 0.5 to 2.',
      ],
      [
        {
          ...latency,
          channel: 'opacity',
          mapping: { kind: 'discrete', cases: [{ value: 'x', opacity: 0 }] },
        },
        'invalid-overlay',
        'The overlay "Latency" fades to an opacity from 0.1 to 1.',
      ],
      [
        {
          ...latency,
          channel: 'badge',
          mapping: { kind: 'discrete', cases: [{ value: 'x', text: 'much too long a badge' }] },
        },
        'invalid-overlay',
        'The overlay "Latency" writes badges of 1 to 12 characters.',
      ],
      [
        { ...latency, channel: 'badge', mapping: { kind: 'continuous', stops: [] } },
        'invalid-overlay',
        'The overlay "Latency" writes badges, which take no range: map its values one by one, or write the value itself.',
      ],
      [
        { ...latency, channel: 'size', mapping: { kind: 'passthrough' } },
        'invalid-overlay',
        'Only an overlay of "fill", "stroke" or "badge" takes the value itself; "Latency" sets "size".',
      ],
      [
        { ...latency, mapping: { kind: 'passthrough', stops: [] } },
        'invalid-overlay',
        'The mapping of the overlay "Latency" has no "stops".',
      ],
    ];
    for (const [overlay, code, message] of cases) {
      expect(refused(set(overlay))).toEqual({ code, message });
    }
    expect(
      refused({ type: 'set-overlays', view: 'overview', overlays: [owner, owner] }),
    ).toMatchObject({
      code: 'id-taken',
      message: 'The view "Overview" already has an overlay "owner".',
    });
    expect(
      refused({
        type: 'set-overlays',
        view: 'overview',
        overlays: Array.from({ length: 17 }, (_, at) => ({ ...owner, id: `o${at}` })),
      }),
    ).toEqual({ code: 'invalid-overlay', message: 'A view has at most 16 overlays.' });
    expect(refused({ type: 'set-overlays', view: 'nope', overlays: [] }).code).toBe('unknown-view');
  });
});

describe('add-overlay, update-overlay, remove-overlays and move-overlay', () => {
  const start = () => withOverlays([owner, latency]);

  it('adds one, last or before another', () => {
    const badge: Overlay = {
      id: 'tier',
      of: 'elements',
      attribute: 'owner',
      channel: 'badge',
      mapping: { kind: 'passthrough' },
    };
    const last = ok({ type: 'add-overlay', view: 'overview', overlay: badge }, start());
    expect(last.label).toBe('Add the overlay "owner" to "Overview"');
    expect(overlaysOf(last.state)?.map((each) => each.id)).toEqual(['owner', 'latency', 'tier']);
    const first = ok(
      { type: 'add-overlay', view: 'overview', overlay: badge, before: 'owner' },
      start(),
    );
    expect(overlaysOf(first.state)?.map((each) => each.id)).toEqual(['tier', 'owner', 'latency']);
    expect(
      refused({ type: 'add-overlay', view: 'overview', overlay: badge, before: 'gone' }),
    ).toMatchObject({
      code: 'unknown-overlay',
      message: 'The view "Overview" has no overlay "gone".',
    });
    expect(refused({ type: 'add-overlay', view: 'overview', overlay: owner }, start()).code).toBe(
      'id-taken',
    );
  });

  it('turns one off and on, as its own action', () => {
    const off = ok(
      { type: 'update-overlay', view: 'overview', overlay: 'latency', changes: { off: true } },
      start(),
    );
    expect(off.label).toBe('Turn off the overlay "Latency" in "Overview"');
    expect(overlaysOf(off.state)?.[1]?.off).toBe(true);
    const on = ok(
      { type: 'update-overlay', view: 'overview', overlay: 'latency', changes: { off: false } },
      off.state,
    );
    expect(on.label).toBe('Turn on the overlay "Latency" in "Overview"');
    expect('off' in (overlaysOf(on.state)?.[1] ?? {})).toBe(false);
  });

  it('changes one part by part, and checks the whole', () => {
    const renamed = ok(
      {
        type: 'update-overlay',
        view: 'overview',
        overlay: 'latency',
        changes: { name: null, attribute: 'owner' },
      },
      start(),
    );
    expect(renamed.label).toBe('Edit the overlay "owner" in "Overview"');
    expect(overlaysOf(renamed.state)?.[1]).toEqual({
      ...latency,
      name: undefined,
      attribute: 'owner',
    } satisfies Partial<Overlay> as never);
    expect(
      refused(
        {
          type: 'update-overlay',
          view: 'overview',
          overlay: 'latency',
          changes: { channel: 'badge' },
        },
        start(),
      ),
    ).toEqual({
      code: 'invalid-overlay',
      message:
        'The overlay "Latency" writes badges, which take no range: map its values one by one, or write the value itself.',
    });
    expect(
      refused(
        {
          type: 'update-overlay',
          view: 'overview',
          overlay: 'latency',
          changes: { id: 'x' } as never,
        },
        start(),
      ),
    ).toEqual({ code: 'invalid-overlay', message: 'An overlay has no "id" to change.' });
    expect(
      refused({ type: 'update-overlay', view: 'overview', overlay: 'gone', changes: {} }, start())
        .code,
    ).toBe('unknown-overlay');
  });

  it('removes and moves them', () => {
    const removed = ok({ type: 'remove-overlays', view: 'overview', overlays: ['owner'] }, start());
    expect(removed.label).toBe('Remove the overlay "owner" from "Overview"');
    expect(overlaysOf(removed.state)?.map((each) => each.id)).toEqual(['latency']);
    const all = ok(
      { type: 'remove-overlays', view: 'overview', overlays: ['owner', 'latency'] },
      start(),
    );
    expect(all.label).toBe('Remove 2 overlays from "Overview"');
    expect('overlays' in (all.state.views[0] as ViewFile)).toBe(false);
    expect(
      refused({ type: 'remove-overlays', view: 'overview', overlays: [] }, start()).message,
    ).toBe('No overlays were given to remove.');
    expect(
      refused({ type: 'remove-overlays', view: 'overview', overlays: ['owner', 'owner'] }, start())
        .message,
    ).toBe('The overlay "owner" is given twice.');
    const moved = ok(
      { type: 'move-overlay', view: 'overview', overlay: 'latency', before: 'owner' },
      start(),
    );
    expect(moved.label).toBe('Move the overlay "Latency" in "Overview"');
    expect(overlaysOf(moved.state)?.map((each) => each.id)).toEqual(['latency', 'owner']);
    const back = ok({ type: 'move-overlay', view: 'overview', overlay: 'latency' }, moved.state);
    expect(overlaysOf(back.state)?.map((each) => each.id)).toEqual(['owner', 'latency']);
    expect(
      refused(
        { type: 'move-overlay', view: 'overview', overlay: 'owner', before: 'owner' },
        start(),
      ).message,
    ).toBe('An overlay cannot go before itself.');
  });

  it('keep overlays apart from the view’s other parts, and undo exactly, whatever the order', () => {
    const command = fc.oneof(
      fc.constantFrom<Command>(
        { type: 'add-overlay', view: 'overview', overlay: { ...owner, id: undefined } as never },
        {
          type: 'add-overlay',
          view: 'overview',
          overlay: { ...latency, id: undefined } as never,
          before: 'owner',
        },
        { type: 'remove-overlays', view: 'overview', overlays: ['owner'] },
        { type: 'move-overlay', view: 'overview', overlay: 'latency' },
        { type: 'update-overlay', view: 'overview', overlay: 'owner', changes: { off: true } },
        {
          type: 'update-overlay',
          view: 'overview',
          overlay: 'latency',
          changes: { name: 'Speed' },
        },
        { type: 'set-collapsed', view: 'overview', elements: ['system'], collapsed: true },
        { type: 'set-overlays', view: 'overview', overlays: [owner] },
        { type: 'set-overlays', view: 'overview', overlays: [] },
      ),
    );
    fc.assert(
      fc.property(fc.array(command, { maxLength: 12 }), (commands) => {
        let state = start();
        for (const each of commands) {
          const outcome = executeCommand(state, each, { newId: sequentialIds() });
          if (!outcome.ok) continue;
          expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
          state = outcome.state;
          const overlays = overlaysOf(state) ?? [];
          expect(new Set(overlays.map((each) => each.id)).size).toBe(overlays.length);
          expect(overlays.length).toBeLessThanOrEqual(16);
          expect(state.views[0]?.positions).toEqual(testProject().views[0]?.positions);
          if (state.views[0]?.overlays !== undefined) {
            expect(
              validateFile('view', JSON.parse(formatFile('view', state.views[0])) as unknown).ok,
            ).toBe(true);
          }
        }
      }),
    );
  });
});

describe('the overlays of a project as it opens', () => {
  it('refuse an id twice in one view, and warn about what reads as best it can', () => {
    const state = withOverlays([
      owner,
      { ...owner, of: 'relations', attribute: 'rate' },
      {
        ...latency,
        mapping: {
          kind: 'continuous',
          stops: [
            { at: 5, color: '#000000' },
            { at: 1, color: '#FFFFFF' },
          ],
        },
      },
      {
        ...owner,
        id: 'twice',
        attribute: 'latency',
        mapping: {
          kind: 'discrete',
          cases: [
            { value: '1', color: '#000000' },
            { value: '1.0', color: '#FFFFFF' },
          ],
        },
      },
    ]);
    const check = checkProject(state);
    expect(check.errors.map((each) => each.message)).toEqual([
      'More than one overlay in the view "Overview" has the id "owner".',
    ]);
    expect(check.warnings.map((each) => each.message)).toEqual([
      'The overlay "rate" of the view "Overview" fills relations, which have no fill; it changes nothing.',
      'The overlay "rate" of the view "Overview" reads "rate", which no relation has; it changes nothing.',
      'The stops of the overlay "Latency" of the view "Overview" do not go up; they are read in order of where they are.',
      'The overlay "latency" of the view "Overview" maps "1.0" twice; the first is used.',
    ]);
  });

  it('warn about levels two of which start at one scale, or a silhouette with more', () => {
    const state = testProject();
    const element = state.model.elements[1];
    if (element) {
      element.appearance = {
        levels: [
          { from: 1, shows: ['name'] },
          { from: 1, shows: ['silhouette', 'image'] },
        ],
      };
    }
    expect(checkProject(state).warnings.map((each) => each.message)).toEqual([
      'Two levels of "API" start at 1; the last is used.',
      'The level at 1 of "API" shows a silhouette only, and nothing else it lists.',
    ]);
  });
});
