import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../theme/themes';
import { contrastRatio, emphasisBacks, readableTextColors } from './colors';

const color = fc
  .array(fc.integer({ min: 0, max: 255 }), { minLength: 3, maxLength: 3 })
  .map((rgb) => `#${rgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`);

describe('the backs of text emphasis on the canvas (ADR 0082)', () => {
  it('keep a label’s name and detail at 4.5:1 on a highlight and on code, on any fill', () => {
    fc.assert(
      fc.property(color, (fill) => {
        const { name, detail } = readableTextColors(fill);
        for (const text of [name, detail]) {
          const backs = emphasisBacks(text);
          expect(contrastRatio(text, backs.highlight)).toBeGreaterThanOrEqual(4.5);
          expect(contrastRatio(text, backs.code)).toBeGreaterThanOrEqual(4.5);
        }
      }),
    );
  });

  it('keep a note’s text at 4.5:1 in both themes', () => {
    for (const theme of [THEMES.light.canvas, THEMES.dark.canvas]) {
      const backs = emphasisBacks(theme.noteText);
      expect(contrastRatio(theme.noteText, backs.highlight)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(theme.noteText, backs.code)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('take the panels’ colors: the light theme’s under dark text, the dark theme’s under light', () => {
    expect(emphasisBacks('#1F2933').highlight).toBe(THEMES.light.shell.colors.emphasisHighlight);
    expect(emphasisBacks('#FFFFFF').code).toBe(THEMES.dark.shell.colors.emphasisCode);
  });
});
