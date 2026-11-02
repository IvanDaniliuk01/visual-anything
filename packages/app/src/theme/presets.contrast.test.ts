/**
 * The four drawing presets read in both themes (A5.2, ADR 0086): names and details on every fill the
 * samples draw, every line at 3:1 on the canvas, neutral or in its type's color, a region's tab at
 * 4.5:1 on any region's fill, the count badge's text on its pill, and the dot grid as faint as the
 * grid's lines. High contrast (A5.6) writes a region's tab in the theme's own text, at 7:1 on any
 * region's fill, and draws its border whole, at the shapes' border width, at 3:1 on the canvas.
 */
import {
  DRAWING_PRESETS,
  DRAWING_PRESET_IDS,
  THEME_NAMES,
  type ThemeName,
} from '@visual-anything/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { contrastRatio, readableTextColors } from '../canvas/colors';
import { DOT_STRENGTH } from '../canvas/gridMarks';
import { regionBorderOf, regionColorsOf, regionFillOf } from '../canvas/regionDraw';
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

  it.each(DRAWING_PRESET_IDS)(
    'writes a region’s tab at 4.5:1 or more on the fill of a region of any color, with %s',
    (preset) => {
      const colors = regionColorsOf(canvas, DRAWING_PRESETS[preset]);
      fc.assert(
        fc.property(color, (stroke) => {
          const fill = regionFillOf(stroke, colors);
          expect(contrastRatio(colors.text, fill)).toBeGreaterThanOrEqual(4.5);
        }),
      );
    },
  );

  it('writes High contrast’s region tabs in the theme’s own text, at 7:1 or more on any region’s fill', () => {
    const colors = regionColorsOf(canvas, DRAWING_PRESETS['high-contrast']);
    expect(colors.text).toBe(canvas.text);
    expect(colors.text).not.toBe(canvas.regionText);
    fc.assert(
      fc.property(color, (stroke) => {
        const fill = regionFillOf(stroke, colors);
        expect(contrastRatio(colors.text, fill)).toBeGreaterThanOrEqual(7);
      }),
    );
  });

  it('draws High contrast’s region borders whole, at the shapes’ border width', () => {
    const drawing = DRAWING_PRESETS['high-contrast'];
    const colors = regionColorsOf(canvas, drawing);
    expect(colors.borderAlpha).toBe(1);
    expect(colors.borderWidth).toBe(drawing.shapes.borderWidth);
    // A project's own border width reaches its regions too.
    const wider = { ...drawing, shapes: { ...drawing.shapes, borderWidth: 3 } };
    expect(regionColorsOf(canvas, wider).borderWidth).toBe(3);
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
      const region = regionColorsOf(canvas, DRAWING_PRESETS[preset]);
      for (const shape of scene.shapes) {
        const { fill, stroke } = shapeColors(shape, theme);
        if (shape.region) {
          expect(contrastRatio(region.text, regionFillOf(stroke, region))).toBeGreaterThanOrEqual(
            4.5,
          );
          if (preset === 'high-contrast') {
            // Its border, whole, reads as a mark on the canvas it lies on.
            expect(
              contrastRatio(regionBorderOf(stroke, region), canvas.background),
            ).toBeGreaterThanOrEqual(3);
          }
          continue;
        }
        const text = readableTextColors(fill);
        expect(contrastRatio(text.name, fill)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(text.detail, fill)).toBeGreaterThanOrEqual(4.5);
      }
      // Every line, neutral or in its type's color, reads as a mark on the canvas; a neutral line's
      // type color, which it takes under the pointer and the selection, does too.
      expect(scene.relations.length).toBeGreaterThan(0);
      for (const line of scene.relations) {
        expect(contrastRatio(lineStroke(line, theme), canvas.background)).toBeGreaterThanOrEqual(3);
        if (line.typeStroke !== undefined) {
          const typed =
            theme === 'dark'
              ? (line.typeStroke.dark ?? line.typeStroke.light)
              : line.typeStroke.light;
          expect(contrastRatio(typed, canvas.background)).toBeGreaterThanOrEqual(3);
        }
      }
    });
  });
});
