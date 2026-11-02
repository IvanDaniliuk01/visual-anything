/**
 * The four drawing presets read in both themes (A5.2, ADR 0086): names and details on every fill the
 * samples draw, neutral lines at 3:1 on the canvas, a region's tab at 4.5:1 on any region's fill, the
 * count badge's text on its pill, and the dot grid as faint as the grid's lines.
 */
import { DRAWING_PRESET_IDS, THEME_NAMES, type ThemeName } from '@visual-anything/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { contrastRatio, readableTextColors } from '../canvas/colors';
import { DOT_STRENGTH } from '../canvas/gridMarks';
import { regionColorsOf, regionFillOf } from '../canvas/regionDraw';
import { buildSceneAfresh } from '../canvas/scene';
import { shapeColors, lineStroke } from '../canvas/theme/paint';
import { loadSample } from '../test/sample';
import { THEMES } from './themes';

/** A color drawn at `alpha` over another, as the GPU blends it. */
function over(color: string, alpha: number, background: string): string {
  const channel = (hex: string, at: number) => parseInt(hex.slice(at, at + 2), 16);
  const mixed = [1, 3, 5].map((at) =>
    Math.round(channel(color, at) * alpha + channel(background, at) * (1 - alpha)),
  );
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

const SAMPLES: [string, string][] = [
  ['my-systems', 'system-overview'],
  ['c4-architecture', 'containers'],
  ['workshop-books', 'reserve-portfolio'],
  ['clinic-claim', 'claim-journey'],
];

const color = fc
  .array(fc.integer({ min: 0, max: 255 }), { minLength: 3, maxLength: 3 })
  .map((rgb) => `#${rgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`);

describe.each(THEME_NAMES)('the %s theme', (theme: ThemeName) => {
  const canvas = THEMES[theme].canvas;

  it('draws neutral lines at 3:1 or more on the canvas', () => {
    expect(contrastRatio(canvas.neutralLine, canvas.background)).toBeGreaterThanOrEqual(3);
  });

  it('writes a region’s tab at 4.5:1 or more on the fill of a region of any color', () => {
    const colors = regionColorsOf(canvas);
    fc.assert(
      fc.property(color, (stroke) => {
        const fill = regionFillOf(stroke, colors);
        expect(contrastRatio(colors.text, fill)).toBeGreaterThanOrEqual(4.5);
      }),
    );
  });

  it('writes a count badge’s count at 4.5:1 or more on its pill, the canvas', () => {
    expect(contrastRatio(canvas.relationLabelText, canvas.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the strongest grid dot faint, under 3:1 on the canvas', () => {
    const dot = over(
      canvas.gridLine,
      Math.min(1, canvas.gridStrength * DOT_STRENGTH),
      canvas.background,
    );
    const ratio = contrastRatio(dot, canvas.background);
    expect(ratio).toBeGreaterThan(1.1);
    expect(ratio).toBeLessThan(3);
  });

  describe.each(DRAWING_PRESET_IDS)('with %s', (preset) => {
    it.each(SAMPLES)('reads on every fill and line of %s', (name, view) => {
      const sample = loadSample(name);
      const project = { ...sample, project: { ...sample.project, drawing: { preset } } };
      const scene = buildSceneAfresh(project, view);
      const region = regionColorsOf(canvas);
      for (const shape of scene.shapes) {
        const { fill, stroke } = shapeColors(shape, theme);
        if (shape.region) {
          expect(contrastRatio(region.text, regionFillOf(stroke, region))).toBeGreaterThanOrEqual(
            4.5,
          );
          continue;
        }
        const text = readableTextColors(fill);
        expect(contrastRatio(text.name, fill)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(text.detail, fill)).toBeGreaterThanOrEqual(4.5);
      }
      for (const line of scene.relations) {
        if (line.typeStroke === undefined) continue;
        expect(contrastRatio(lineStroke(line, theme), canvas.background)).toBeGreaterThanOrEqual(3);
      }
    });
  });
});
