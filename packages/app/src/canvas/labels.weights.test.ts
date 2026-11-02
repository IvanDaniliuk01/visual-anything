import { BitmapFont, Cache } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FONT_FAMILY } from './draw';
import { labelFontOf } from './labels';
import { MONO_FAMILY } from './robotoFonts';

/** Installs as PixiJS does, into its cache, drawing nothing; records what it was asked for. */
function installing() {
  const installed: { name: string; weight: unknown; family: unknown }[] = [];
  vi.spyOn(BitmapFont, 'install').mockImplementation((options) => {
    const name = options?.name ?? '';
    const style = options?.style as { fontWeight?: unknown; fontFamily?: unknown } | undefined;
    installed.push({ name, weight: style?.fontWeight, family: style?.fontFamily });
    const font = {} as BitmapFont;
    Cache.set(`${name}-bitmap`, font);
    return font;
  });
  return installed;
}

afterEach(() => {
  for (const key of [
    'visual-anything-name-500',
    'visual-anything-name-400',
    'visual-anything-detail-400-mono',
  ]) {
    if (Cache.has(`${key}-bitmap`)) Cache.remove(`${key}-bitmap`);
  }
  vi.restoreAllMocks();
});

describe('the weights labels are drawn in (A5.1, ADR 0086)', () => {
  it('draws a name in Bold unless it asks for a weight the canvas loads, never in another', () => {
    const installed = installing();
    expect(labelFontOf('name', { fontWeight: '700', fontFamily: FONT_FAMILY })).toBe(
      'visual-anything-name',
    );
    // 600 is not loaded: it is drawn as 700, as the browser would, from the kind's own font.
    expect(labelFontOf('name', { fontWeight: '600', fontFamily: FONT_FAMILY })).toBe(
      'visual-anything-name',
    );
    expect(installed).toEqual([]);
    expect(labelFontOf('name', { fontWeight: '500', fontFamily: FONT_FAMILY })).toBe(
      'visual-anything-name-500',
    );
    expect(labelFontOf('name', { fontWeight: '400', fontFamily: FONT_FAMILY })).toBe(
      'visual-anything-name-400',
    );
    expect(installed.map((each) => each.weight)).toEqual(['500', '400']);
    // Once installed, a font is not installed again.
    labelFontOf('name', { fontWeight: '500', fontFamily: FONT_FAMILY });
    expect(installed).toHaveLength(2);
  });

  it('writes a detail in its own font, and a column’s type in Roboto Mono', () => {
    const installed = installing();
    expect(labelFontOf('detail', { fontWeight: 'normal', fontFamily: FONT_FAMILY })).toBe(
      'visual-anything-detail',
    );
    expect(labelFontOf('detail', { fontWeight: 'normal', fontFamily: [...MONO_FAMILY] })).toBe(
      'visual-anything-detail-400-mono',
    );
    expect(installed[0]?.family).toEqual([...MONO_FAMILY]);
  });
});
