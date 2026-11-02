import { DynamicBitmapFont } from 'pixi.js';
import { describe, expect, it } from 'vitest';

/**
 * PixiJS 8.22 measured one kerning pair twice in `DynamicBitmapFont._applyKerning`: the kerning a
 * glyph keeps for the glyph before it was "first + second" both ways, so that "VA" was spaced as
 * "AV" is. The project patches it (`patches/pixi.js@8.22.0.patch`, ADR 0086's clarification of A5.1).
 * A bitmap text's layout reads, on each glyph, the kerning for the glyph before it
 * (`charData.kerning[previousChar]`).
 */
describe("PixiJS's kerning pairs (A5.1)", () => {
  /** Widths as a font would measure them: "AV" and "VA" kern by different amounts. */
  const widths: Record<string, number> = { A: 10, V: 9, AV: 17, VA: 18.5 };
  const context = { measureText: (text: string) => ({ width: widths[text] ?? 0 }) };

  function kerned(newChars: string[], current: string[]) {
    const font = {
      _measureCache: {} as Record<string, number>,
      _currentChars: current,
      chars: Object.fromEntries(
        [...new Set([...newChars, ...current])].map((each) => {
          const kerning: Record<string, number> = {};
          return [each, { kerning }];
        }),
      ),
    };
    (
      DynamicBitmapFont.prototype as unknown as {
        _applyKerning(chars: string[], context: unknown, fontScale: number): void;
      }
    )._applyKerning.call(font, newChars, context, 1);
    return font.chars;
  }

  it('measures "AV" for V after A, and "VA" for A after V', () => {
    const chars = kerned(['V'], ['A']);
    // V after A: "AV" is 2 narrower than its glyphs.
    expect(chars.V?.kerning.A).toBeCloseTo(17 - 19);
    // A after V: "VA" is 0.5 narrower.
    expect(chars.A?.kerning.V).toBeCloseTo(18.5 - 19);
  });

  it('gives the same pairs whichever glyph was drawn first', () => {
    const chars = kerned(['A'], ['V']);
    expect(chars.V?.kerning.A).toBeCloseTo(17 - 19);
    expect(chars.A?.kerning.V).toBeCloseTo(18.5 - 19);
  });
});
