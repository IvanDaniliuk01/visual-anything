/**
 * The fonts a name written as its text says is drawn in (ADR 0088, A6.2): italics only in the styles
 * the canvas loads, and an underline drawn and tinted with its text.
 */
import { BitmapFont, BitmapText, Cache, Container, Graphics } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FONT_FAMILY } from './draw';
import { bitmapText, labelFontOf } from './labels';
import { MONO_FAMILY } from './robotoFonts';

/** Installs as PixiJS does, into its cache, drawing nothing; records what it was asked for. */
function installing() {
  const installed: { name: string; weight: unknown; style: unknown }[] = [];
  vi.spyOn(BitmapFont, 'install').mockImplementation((options) => {
    const name = options?.name ?? '';
    const style = options?.style as { fontWeight?: unknown; fontStyle?: unknown } | undefined;
    installed.push({ name, weight: style?.fontWeight, style: style?.fontStyle });
    const font = {} as BitmapFont;
    Cache.set(`${name}-bitmap`, font);
    return font;
  });
  return installed;
}

const ASKED = [
  'visual-anything-name-700-italic',
  'visual-anything-name-400-italic',
  'visual-anything-name-400-mono',
];

afterEach(() => {
  for (const key of ASKED) if (Cache.has(`${key}-bitmap`)) Cache.remove(`${key}-bitmap`);
  vi.restoreAllMocks();
});

describe('a name in italics (ADR 0088)', () => {
  it('takes Roboto’s Italic or Bold Italic, a Medium name Bold Italic', () => {
    const installed = installing();
    expect(
      labelFontOf('name', { fontWeight: '700', fontStyle: 'italic', fontFamily: FONT_FAMILY }),
    ).toBe('visual-anything-name-700-italic');
    expect(
      labelFontOf('name', { fontWeight: '500', fontStyle: 'italic', fontFamily: FONT_FAMILY }),
    ).toBe('visual-anything-name-700-italic');
    expect(
      labelFontOf('name', { fontWeight: '400', fontStyle: 'italic', fontFamily: FONT_FAMILY }),
    ).toBe('visual-anything-name-400-italic');
    expect(installed.map((each) => [each.weight, each.style])).toEqual([
      ['700', 'italic'],
      ['400', 'italic'],
    ]);
  });

  it('never asks for Roboto Mono in italics, which is loaded upright alone', () => {
    const installed = installing();
    expect(
      labelFontOf('name', {
        fontWeight: '400',
        fontStyle: 'italic',
        fontFamily: [...MONO_FAMILY],
      }),
    ).toBe('visual-anything-name-400-mono');
    expect(installed[0]?.style).toBeUndefined();
  });
});

describe('an underlined name', () => {
  it('is its text over a line under each line, tinted together', () => {
    installing();
    vi.spyOn(BitmapText.prototype, 'width', 'get').mockReturnValue(80);
    vi.spyOn(BitmapText.prototype, 'height', 'get').mockReturnValue(34);
    const label = bitmapText(
      {
        text: 'Two\nlines',
        anchor: { x: 0, y: 0 },
        x: 10,
        y: 20,
        style: { fontFamily: FONT_FAMILY, fontWeight: '700', fill: '#3E63DD', align: 'left' },
      },
      'name',
      100,
      undefined,
      { underline: { widths: [80, 40], lineHeight: 18, size: 14 } },
    );
    expect(label).toBeInstanceOf(Container);
    expect(label).not.toBeInstanceOf(BitmapText);
    const [text, lines] = (label as Container).children;
    expect(text).toBeInstanceOf(BitmapText);
    expect(lines).toBeInstanceOf(Graphics);
    const rects = (lines as Graphics).context.instructions.flatMap(
      (each) =>
        (each.data as { path?: { instructions: { action: string; data: number[] }[] } }).path
          ?.instructions ?? [],
    );
    expect(rects.filter((each) => each.action === 'rect').map((each) => each.data[2])).toEqual([
      80, 40,
    ]);
    // Tinted together: the text white under the label's tint.
    expect((label as Container).tint).toBe(0x3e63dd);
    expect((text as BitmapText).tint).toBe(0xffffff);
  });

  it('is its text alone without an underline', () => {
    installing();
    vi.spyOn(BitmapText.prototype, 'height', 'get').mockReturnValue(17);
    const label = bitmapText(
      { text: 'Plain', style: { fontFamily: FONT_FAMILY, fill: '#3E63DD' } },
      'name',
      100,
    );
    expect(label).toBeInstanceOf(BitmapText);
  });
});
