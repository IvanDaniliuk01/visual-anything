import { describe, expect, it } from 'vitest';
import {
  formatDegrees,
  formatLength,
  lengthProblem,
  lengthUnitOf,
  readDegrees,
  readLength,
} from './lengths';

describe('lengths in the Pose section', () => {
  it('shows each in the unit that keeps its number between 1 and 1,000', () => {
    expect(formatLength(0.004)).toBe('4 mm');
    expect(formatLength(0.04)).toBe('4 cm');
    expect(formatLength(0.5)).toBe('50 cm');
    expect(formatLength(1)).toBe('1 m');
    expect(formatLength(1.25)).toBe('1.25 m');
    expect(formatLength(999)).toBe('999 m');
    expect(formatLength(1000)).toBe('1 km');
    expect(formatLength(1_000_000)).toBe('1000 km');
    expect(formatLength(-0.03)).toBe('-3 cm');
  });

  it('shows none at all in meters, and less than a millimeter in millimeters', () => {
    expect(formatLength(0)).toBe('0 m');
    expect(formatLength(-0)).toBe('0 m');
    expect(formatLength(0.0005)).toBe('0.5 mm');
    expect(lengthUnitOf(0)).toBe('m');
    expect(lengthUnitOf(0.0005)).toBe('mm');
  });

  it('shows a micrometer and nothing finer, without the noise of floating point', () => {
    expect(formatLength(0.1 + 0.2)).toBe('30 cm');
    expect(formatLength(1.0000004)).toBe('1 m');
    expect(formatLength(1.000001)).toBe('1.000001 m');
    expect(formatLength(1234.5678)).toBe('1.2345678 km');
    expect(formatLength(0.0000001)).toBe('0 mm');
  });

  it('reads mm, cm, m, km and inches, with or without a space', () => {
    expect(readLength('12 mm')).toEqual({ ok: true, value: 0.012 });
    expect(readLength('5cm')).toEqual({ ok: true, value: 0.05 });
    expect(readLength('1.5 m')).toEqual({ ok: true, value: 1.5 });
    expect(readLength('2 KM')).toEqual({ ok: true, value: 2000 });
    expect(readLength('3 in')).toEqual({ ok: true, value: 0.0762 });
    expect(readLength('1 inch')).toEqual({ ok: true, value: 0.0254 });
    expect(readLength('2"')).toEqual({ ok: true, value: 0.0508 });
    expect(readLength('  -4 cm ')).toEqual({ ok: true, value: -0.04 });
    expect(readLength('−4 cm')).toEqual({ ok: true, value: -0.04 });
    expect(readLength('.5 m')).toEqual({ ok: true, value: 0.5 });
  });

  it('reads a number alone in the unit the field showed', () => {
    expect(readLength('30', 'cm')).toEqual({ ok: true, value: 0.3 });
    expect(readLength('30')).toEqual({ ok: true, value: 30 });
    expect(readLength('-0', 'mm')).toEqual({ ok: true, value: 0 });
  });

  it('reads what it shows as the same length', () => {
    for (const meters of [0.004, 0.04, 0.5, 1.25, 1000, -0.03, 0]) {
      const reading = readLength(formatLength(meters));
      expect(reading.ok && Math.abs(reading.value - meters) < 1e-12).toBe(true);
    }
  });

  it('says what to type for what is not a length', () => {
    for (const text of ['', 'far', '5 ft', '1,5 m', '1 m 2 cm', 'Infinity m']) {
      expect(readLength(text)).toEqual({
        ok: false,
        message: 'Enter a length, such as 12 cm, 1.5 m or 3 in.',
      });
    }
  });

  it('says a length past 1,000 km cannot be a coordinate of a pose', () => {
    expect(lengthProblem('1000 km')).toBeUndefined();
    expect(lengthProblem('1001 km')).toBe('Enter a length of at most 1,000 km either way.');
    expect(lengthProblem('-1001', 'km')).toBe('Enter a length of at most 1,000 km either way.');
    expect(lengthProblem('far')).toBe('Enter a length, such as 12 cm, 1.5 m or 3 in.');
  });
});

describe('angles in the Pose section', () => {
  it('shows degrees to a ten-thousandth, without noise or a negative zero', () => {
    expect(formatDegrees(90)).toBe('90°');
    expect(formatDegrees(89.99999999)).toBe('90°');
    expect(formatDegrees(-45.5)).toBe('-45.5°');
    expect(formatDegrees(-0.00000001)).toBe('0°');
  });

  it('reads degrees with or without their sign', () => {
    expect(readDegrees('90')).toEqual({ ok: true, value: 90 });
    expect(readDegrees('-45.5°')).toEqual({ ok: true, value: -45.5 });
    expect(readDegrees('30 deg')).toEqual({ ok: true, value: 30 });
    expect(readDegrees('−15 °')).toEqual({ ok: true, value: -15 });
    expect(readDegrees('a quarter')).toEqual({
      ok: false,
      message: 'Enter an angle in degrees, such as 90 or -45.',
    });
  });
});
