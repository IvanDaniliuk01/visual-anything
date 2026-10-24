import { describe, expect, it } from 'vitest';
import { readColor, sameColor } from './color';

describe('readColor', () => {
  it('reads #rrggbb in either case, with or without #, into lower case', () => {
    expect(readColor('#f3f5f8')).toBe('#f3f5f8');
    expect(readColor('#F3F5F8')).toBe('#f3f5f8');
    expect(readColor('f3f5f8')).toBe('#f3f5f8');
    expect(readColor('  #f3f5f8  ')).toBe('#f3f5f8');
  });

  it('reads the short #rgb form', () => {
    expect(readColor('#abc')).toBe('#aabbcc');
    expect(readColor('0F0')).toBe('#00ff00');
  });

  it('reads rgb(r, g, b), with commas or spaces', () => {
    expect(readColor('rgb(243, 245, 248)')).toBe('#f3f5f8');
    expect(readColor('RGB(243 245 248)')).toBe('#f3f5f8');
    expect(readColor('rgb(0,0,0)')).toBe('#000000');
  });

  it('reads nothing that is not a colour', () => {
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

describe('sameColor', () => {
  it('compares colours however they are written', () => {
    expect(sameColor('#F8E1EC', '#f8e1ec')).toBe(true);
    expect(sameColor('#abc', '#aabbcc')).toBe(true);
    expect(sameColor('#abc', '#abcdef')).toBe(false);
    expect(sameColor('blue', 'blue')).toBe(false);
  });
});
