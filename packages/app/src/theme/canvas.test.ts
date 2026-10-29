/**
 * The canvas's own colors in each theme, prepared for the renderer (wave 2): what reads on the canvas
 * at 4.5:1 for text and 3:1 for marks, and the grid, which only decorates.
 */
import { CANVAS_BACKGROUNDS, THEME_NAMES, type ThemeName } from '@visual-anything/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { contrastRatio, readableTextColors } from '../canvas/colors';
import { THEMES } from './themes';

/** A color drawn at `alpha` over another, as the GPU blends it. */
function over(color: string, alpha: number, background: string): string {
  const channel = (hex: string, at: number) => parseInt(hex.slice(at, at + 2), 16);
  const mixed = [1, 3, 5].map((at) =>
    Math.round(channel(color, at) * alpha + channel(background, at) * (1 - alpha)),
  );
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

describe.each(THEME_NAMES)('the %s canvas', (name: ThemeName) => {
  const canvas = THEMES[name].canvas;
  const shell = THEMES[name].shell.colors;

  it('names its theme and draws on the canvas color of the panels', () => {
    expect(canvas.name).toBe(name);
    expect(canvas.background).toBe(shell.canvas);
    expect(canvas.relationLabelBack).toBe(canvas.background);
  });

  it('draws on the canvas the core measures stored colors against (ADR 0033)', () => {
    // The core keeps its own copy, for the contrast hints and Claude's tool results; the two never part.
    expect(CANVAS_BACKGROUNDS[name]).toBe(canvas.background);
  });

  it.each([
    ['note text on the note', 'noteText', 'noteFill'],
    ['relation names on their back', 'relationLabelText', 'relationLabelBack'],
    ['ruler numbers on their band', 'rulerText', 'rulerBand'],
  ] as const)('writes %s at 4.5:1 or more', (_, text, background) => {
    expect(contrastRatio(canvas[text], canvas[background])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['selected', 'highlight', 'freeArrow', 'noteStroke', 'refused'] as const)(
    'draws %s at 3:1 or more on the canvas',
    (mark) => {
      expect(contrastRatio(canvas[mark], canvas.background)).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(['changeAdded', 'changeRemoved', 'changeChanged', 'changeMoved'] as const)(
    'draws the comparison’s %s mark at 3:1 or more on the canvas, and its glyph on it (ADR 0070)',
    (mark) => {
      expect(contrastRatio(canvas[mark], canvas.background)).toBeGreaterThanOrEqual(3);
      // A badge's glyph is written in the canvas's color on the mark's.
      expect(contrastRatio(canvas.background, canvas[mark])).toBeGreaterThanOrEqual(3);
      // The legend and the Changes tab draw the same color.
      expect(canvas[mark]).toBe(shell[mark]);
    },
  );

  it('gives the comparison four marks of four hues, none the selection’s or the highlight’s', () => {
    const marks = [
      canvas.changeAdded,
      canvas.changeRemoved,
      canvas.changeChanged,
      canvas.changeMoved,
    ];
    expect(new Set(marks).size).toBe(4);
    expect(marks).not.toContain(canvas.selected);
    expect(marks).not.toContain(canvas.highlight);
  });

  it('draws the relate handle’s ring at 3:1 or more on its inside', () => {
    expect(contrastRatio(canvas.selected, canvas.handleFill)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the strongest grid line faint, between 1.1:1 and 1.6:1 on the canvas', () => {
    const line = over(canvas.gridLine, canvas.gridStrength, canvas.background);
    const ratio = contrastRatio(line, canvas.background);
    expect(ratio).toBeGreaterThanOrEqual(1.1);
    expect(ratio).toBeLessThanOrEqual(1.6);
  });

  it('keeps the selection box and its glow see-through', () => {
    for (const alpha of [canvas.boxFillAlpha, canvas.selectedGlowAlpha, canvas.gridStrength]) {
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('takes the colors it shares with the panels from them', () => {
    expect(canvas.selected).toBe(shell.selected);
    expect(canvas.highlight).toBe(shell.highlight);
    expect(canvas.rulerText).toBe(shell.textMuted);
    expect(canvas.handleFill).toBe(shell.surfaceRaised);
  });
});

describe('note text on a fill of its own', () => {
  it('reads at 4.5:1 or more on any fill, in either theme', () => {
    const color = fc
      .array(fc.integer({ min: 0, max: 255 }), { minLength: 3, maxLength: 3 })
      .map((rgb) => `#${rgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`);
    fc.assert(
      fc.property(color, (fill) => {
        expect(contrastRatio(readableTextColors(fill).name, fill)).toBeGreaterThanOrEqual(4.5);
      }),
    );
  });
});

describe('the two themes', () => {
  it('differ in every canvas color that depends on the canvas, and in nothing they share', () => {
    const { light, dark } = THEMES;
    expect(light.canvas.background).not.toBe(dark.canvas.background);
    expect(light.canvas.noteFill).not.toBe(dark.canvas.noteFill);
    expect(Object.keys(light.canvas)).toEqual(Object.keys(dark.canvas));
  });
});
