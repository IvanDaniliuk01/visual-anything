import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CANVAS_BACKGROUNDS,
  MINIMUM_MARK_CONTRAST,
  MINIMUM_TEXT_CONTRAST,
  arrowColorOf,
  contrastRatio,
  isColor,
  legibility,
  noteColorsOf,
  relativeLuminance,
  sameColor,
  storedColor,
} from './colors';

const color = fc.stringMatching(/^#[0-9a-fA-F]{6}$/);

describe('the color format', () => {
  it.each(['#FFFFFF', '#ffffff', '#1d4F91', '#000000'])('takes %s as a color', (value) => {
    expect(isColor(value)).toBe(true);
  });

  it.each([
    ['the short form', '#fff'],
    ['an alpha', '#12345678'],
    ['a name', 'red'],
    ['rgb()', 'rgb(1, 2, 3)'],
    ['no #', 'FFFFFF'],
    ['a digit that is not hexadecimal', '#GGGGGG'],
    ['spaces', ' #FFFFFF'],
    ['a number', 0xffffff],
    ['null', null],
    ['nothing', undefined],
  ])('refuses %s', (_, value) => {
    expect(isColor(value)).toBe(false);
  });

  it('compares colors without regard to case, and nothing that is not a color', () => {
    expect(sameColor('#DCEBFF', '#dcebff')).toBe(true);
    expect(sameColor('#DCEBFF', '#DCEBFE')).toBe(false);
    expect(sameColor('red', 'red')).toBe(false);
    expect(sameColor('#fff', '#fff')).toBe(false);
  });

  it('writes new colors in capitals, and keeps the stored spelling of the same color', () => {
    expect(storedColor('#dcebff')).toBe('#DCEBFF');
    expect(storedColor('#dcebff', '#1D4F91')).toBe('#DCEBFF');
    expect(storedColor('#DCEBFF', '#dcebff')).toBe('#dcebff');
    expect(storedColor('#DcEbFf', '#dCeBfF')).toBe('#dCeBfF');
    fc.assert(
      fc.property(color, fc.option(color, { nil: undefined }), (value, stored) => {
        const written = storedColor(value, stored);
        expect(sameColor(written, value)).toBe(true);
        expect(written).toBe(
          stored !== undefined && sameColor(stored, value) ? stored : value.toUpperCase(),
        );
      }),
    );
  });
});

describe('contrast', () => {
  it('measures the WCAG ratio, whatever the case and the order', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#1D4F91', '#16191E')).toBeCloseTo(2.16, 2);
    expect(contrastRatio('#d6336c', '#16191E')).toBeCloseTo(3.82, 2);
    fc.assert(
      fc.property(color, color, (a, b) => {
        const ratio = contrastRatio(a, b);
        expect(ratio).toBeGreaterThanOrEqual(1);
        expect(ratio).toBeLessThanOrEqual(21.0000001);
        expect(ratio).toBeCloseTo(contrastRatio(b.toLowerCase(), a.toUpperCase()), 10);
      }),
    );
  });

  it('counts anything that is not a color as white', () => {
    expect(relativeLuminance('blue')).toBe(1);
    expect(relativeLuminance('#FFFFFF')).toBe(1);
    expect(relativeLuminance('#000000')).toBe(0);
  });

  it('says how a color reads on each canvas', () => {
    expect(CANVAS_BACKGROUNDS).toEqual({ light: '#FFFFFF', dark: '#16191E' });
    expect(MINIMUM_TEXT_CONTRAST).toBe(4.5);
    expect(MINIMUM_MARK_CONTRAST).toBe(3);
    const reading = legibility('#1D4F91');
    expect(reading.light).toBeCloseTo(8.14, 2);
    expect(reading.dark).toBeCloseTo(2.16, 2);
  });
});

describe('the colors of notes and free arrows', () => {
  const theme = { noteFill: '#FFF7D1', noteStroke: '#B08D1A', freeArrow: '#3E4C59' };

  it('are their own when they have them, and the theme’s otherwise', () => {
    expect(noteColorsOf({}, theme)).toEqual({
      fill: { color: '#FFF7D1', origin: { kind: 'theme' } },
      stroke: { color: '#B08D1A', origin: { kind: 'theme' } },
    });
    expect(noteColorsOf({ fill: '#dcebff' }, theme)).toEqual({
      fill: { color: '#dcebff', origin: { kind: 'own' } },
      stroke: { color: '#B08D1A', origin: { kind: 'theme' } },
    });
    expect(arrowColorOf({}, theme)).toEqual({ color: '#3E4C59', origin: { kind: 'theme' } });
    expect(arrowColorOf({ stroke: '#B42318' }, theme)).toEqual({
      color: '#B42318',
      origin: { kind: 'own' },
    });
  });
});
