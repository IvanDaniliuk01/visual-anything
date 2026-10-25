import { MAX_RECENT_COLORS, executeCommand } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../../test/sample';
import {
  MAX_SUGGESTIONS,
  lineHints,
  originText,
  ratioText,
  shapeHints,
  suggestedColors,
  withRecentColor,
} from './colors';

const sample = loadSample();

describe('withRecentColor', () => {
  it('puts a color first, in capitals, once', () => {
    expect(withRecentColor(['#112233', '#445566'], '#445566')).toEqual(['#445566', '#112233']);
    expect(withRecentColor(['#112233'], '#aabbcc')).toEqual(['#AABBCC', '#112233']);
    expect(withRecentColor(['#AABBCC', '#112233'], '#aabbcc')).toEqual(['#AABBCC', '#112233']);
  });

  it('keeps at most the preference’s number of colors', () => {
    const many = Array.from({ length: MAX_RECENT_COLORS }, (_, at) => `#00000${at}`);
    const next = withRecentColor(many, '#FFFFFF');
    expect(next).toHaveLength(MAX_RECENT_COLORS);
    expect(next[0]).toBe('#FFFFFF');
    expect(next).not.toContain(many.at(-1));
  });
});

describe('suggestedColors', () => {
  it('offers the recent colors first, then the project’s, each once, in capitals', () => {
    // The sample stores one color: the booking agent's own fill.
    expect(suggestedColors([], sample)).toEqual(['#F8E1EC']);
    expect(suggestedColors(['#112233', '#F8E1EC'], sample)).toEqual(['#112233', '#F8E1EC']);
  });

  it('offers twelve at most', () => {
    const recent = Array.from({ length: 8 }, (_, at) => `#10000${at}`);
    const outcome = executeCommand(sample, {
      type: 'batch',
      label: 'Colors',
      commands: ['patient', 'whatsapp', 'scheduling', 'appointments-api', 'reminder-service'].map(
        (id, at) => ({
          type: 'update-element',
          id,
          changes: { appearanceTraits: { stroke: `#20000${at}` } },
        }),
      ),
    });
    if (!outcome.ok) throw new Error('The colors were refused.');
    const offered = suggestedColors(recent, outcome.state);
    expect(offered).toHaveLength(MAX_SUGGESTIONS);
    expect(offered.slice(0, 8)).toEqual(recent);
  });
});

describe('originText', () => {
  const names: Record<string, string> = {
    'systems.service': 'Service',
    'systems.database': 'Database',
    'clinic.calendar': 'Calendar',
  };
  const nameOf = (id: string) => names[id] ?? id;

  it('says where a trait comes from', () => {
    expect(originText({ kind: 'own' }, nameOf)).toBe('its own');
    expect(
      originText(
        { kind: 'definition', id: 'clinic.calendar', via: 'definition', builtIn: false },
        nameOf,
      ),
    ).toBe('from Calendar');
    expect(
      originText(
        { kind: 'definition', id: 'systems.service', via: 'project', builtIn: true },
        nameOf,
      ),
    ).toBe('from Service, set in this project');
    expect(
      originText(
        { kind: 'definition', id: 'systems.database', via: 'definition', builtIn: true },
        nameOf,
      ),
    ).toBe('built in, from Database');
  });

  it('calls what the definition being edited sets itself its own', () => {
    const origin = {
      kind: 'definition',
      id: 'clinic.calendar',
      via: 'definition',
      builtIn: false,
    } as const;
    expect(originText(origin, nameOf, 'clinic.calendar')).toBe('its own');
    expect(
      originText(
        { kind: 'definition', id: 'systems.service', via: 'project', builtIn: true },
        nameOf,
        'systems.service',
      ),
    ).toBe('set in this project');
  });
});

describe('contrast hints', () => {
  it('write a ratio with one decimal, never rounding up to what it needs', () => {
    expect(ratioText(2.96)).toBe('2.9:1');
    expect(ratioText(1)).toBe('1.0:1');
  });

  it('point out a line that is hard to see on either canvas', () => {
    expect(lineHints({ light: '#3D4651', dark: '#AEB8C4' })).toEqual([]);
    expect(lineHints({ light: '#3D4651', dark: '#3D4651' })).toEqual([
      'Hard to see on the dark canvas (1.8:1); lines need 3:1.',
    ]);
    expect(lineHints({ light: '#FFF3C9', dark: '#FFF3C9' })).toEqual([
      'Hard to see on the light canvas (1.1:1); lines need 3:1.',
    ]);
  });

  it('point out a shape whose fill and stroke both blend into a canvas', () => {
    const built = { fill: '#DCEBFF', stroke: '#1D4F91' };
    expect(shapeHints({ light: built, dark: { fill: '#172B45', stroke: '#8DB4EA' } })).toEqual([]);
    expect(
      shapeHints({
        light: { fill: '#FFFFFF', stroke: '#F3F5F8' },
        dark: { fill: '#FFFFFF', stroke: '#F3F5F8' },
      }),
    ).toEqual(['Blends into the light canvas: neither its fill nor its stroke reaches 3:1 on it.']);
    expect(shapeHints({ light: built, dark: { fill: '#1A1D22', stroke: '#2B2F36' } })).toEqual([
      'Blends into the dark canvas: neither its fill nor its stroke reaches 3:1 on it.',
    ]);
  });
});
