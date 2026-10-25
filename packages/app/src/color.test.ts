import { describe, expect, it } from 'vitest';
import { COLOR_FORMS, readColor } from './color';

describe('readColor', () => {
  it('reads #RRGGBB in either case, with or without #, into capitals', () => {
    expect(readColor('#f3f5f8')).toBe('#F3F5F8');
    expect(readColor('#F3F5F8')).toBe('#F3F5F8');
    expect(readColor('f3f5f8')).toBe('#F3F5F8');
    expect(readColor('  #f3f5f8  ')).toBe('#F3F5F8');
  });

  it('reads the short #RGB form', () => {
    expect(readColor('#abc')).toBe('#AABBCC');
    expect(readColor('0F0')).toBe('#00FF00');
  });

  it('reads rgb(r, g, b), with commas or spaces', () => {
    expect(readColor('rgb(243, 245, 248)')).toBe('#F3F5F8');
    expect(readColor('RGB(243 245 248)')).toBe('#F3F5F8');
    expect(readColor('rgb(0,0,0)')).toBe('#000000');
  });

  it('reads nothing that is not a color', () => {
    for (const text of [
      '',
      '#',
      '#12345',
      '#1234567',
      '#ggg',
      'blue',
      'rgb(256, 0, 0)',
      'rgb(1, 2)',
    ]) {
      expect(readColor(text)).toBeUndefined();
    }
  });
});

describe('COLOR_FORMS', () => {
  it('names every form that reads, in capitals', () => {
    expect(COLOR_FORMS).toBe('Write a color as #RRGGBB, #RGB or rgb(r, g, b), such as #F3F5F8.');
  });
});
