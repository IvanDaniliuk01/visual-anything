/**
 * High contrast's regions (A5.6, ADR 0086: "darker text, and no faint colors"): a full-strength
 * border at the shapes' border width and the theme's own text in the tab, on the canvas in full and
 * far out, and in the SVG; the other presets keep the quiet region of A5.2.
 */
import { DRAWING_PRESETS, type ProjectSnapshot } from '@visual-anything/core';
import type { DrawingPreset } from '@visual-anything/schema';
import { Graphics, type CanvasTextOptions } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { writeSvg } from '../export/svg';
import { SAMPLE_VIEW } from '../test/exports';
import { loadSample } from '../test/sample';
import { THEMES } from '../theme/themes';
import { drawShapeBlocks, drawShapeOutlines, writeShapeLabels, type TextFactory } from './draw';
import { LIGHT_REGION, REGION_BORDER, regionColorsOf } from './regionDraw';
import { buildSceneAfresh, type ElementShape } from './scene';
import { Painter } from './theme/painter';

const CLINIC = 'clinic-booking';
const HIGH = DRAWING_PRESETS['high-contrast'];

function preset(base: ProjectSnapshot, name: DrawingPreset): ProjectSnapshot {
  return { ...base, project: { ...base.project, drawing: { preset: name } } };
}

function regionIn(name: DrawingPreset): ElementShape {
  const scene = buildSceneAfresh(preset(loadSample(), name), SAMPLE_VIEW);
  const shape = scene.shapes.find((each) => each.key === CLINIC);
  if (!shape?.region) throw new Error('No region.');
  return shape;
}

type Instruction = Graphics['context']['instructions'][number];

/** The strokes a drawing makes: their alpha and width. */
function strokes(graphics: Graphics): { alpha: number; width: number }[] {
  return graphics.context.instructions
    .filter((each: Instruction) => each.action === 'stroke')
    .map((each: Instruction) => {
      const style = (each.data as { style: { alpha: number; width: number } }).style;
      return { alpha: style.alpha, width: style.width };
    });
}

function readSvg(text: string): Document {
  return new DOMParser().parseFromString(text, 'image/svg+xml');
}

describe('High contrast’s regions (A5.6)', () => {
  it('take the theme’s own text and a whole border at the shapes’ width, and the other presets keep theirs', () => {
    for (const theme of ['light', 'dark'] as const) {
      const canvas = THEMES[theme].canvas;
      expect(regionColorsOf(canvas, HIGH)).toMatchObject({
        text: canvas.text,
        borderAlpha: 1,
        borderWidth: HIGH.shapes.borderWidth,
        fillAlpha: canvas.regionFillAlpha,
      });
      for (const name of ['clean', 'dense'] as const) {
        expect(regionColorsOf(canvas, DRAWING_PRESETS[name])).toMatchObject({
          text: canvas.regionText,
          borderAlpha: canvas.regionBorderAlpha,
          borderWidth: REGION_BORDER,
        });
      }
    }
    // A painter of High contrast draws its regions so.
    expect(new Painter(THEMES.dark.canvas, HIGH).region.text).toBe(THEMES.dark.canvas.text);
    expect(regionColorsOf(THEMES.light.canvas)).toBe(LIGHT_REGION);
  });

  it('draws its border whole on the canvas, in full and far out, and its tab in the theme’s text', () => {
    const shape = regionIn('high-contrast');
    const colors = regionColorsOf(THEMES.light.canvas, HIGH);
    const full = new Graphics();
    drawShapeOutlines(full, [shape], undefined, HIGH, colors);
    // Its border first, at the shapes' width, then its icon and toggle, every one whole.
    const [border, ...rest] = strokes(full);
    expect(border).toEqual({ alpha: 1, width: HIGH.shapes.borderWidth });
    for (const each of rest) expect(each.alpha).toBe(1);

    const far = new Graphics();
    drawShapeBlocks(far, [shape], false, undefined, HIGH, colors);
    expect(strokes(far).map((each) => each.alpha)).toEqual([1]);

    const written: CanvasTextOptions[] = [];
    const recording: TextFactory = (options) => {
      written.push(options);
      return undefined;
    };
    writeShapeLabels([shape], true, recording, undefined, undefined, HIGH, colors);
    expect(written[0]?.style).toMatchObject({ fill: THEMES.light.canvas.text });
  });

  it('is written so in the SVG, in both themes', () => {
    const project = preset(loadSample(), 'high-contrast');
    for (const theme of ['light', 'dark'] as const) {
      const svg = readSvg(writeSvg(project, SAMPLE_VIEW, { theme }).text);
      const group = svg.querySelector(`[data-shape="${CLINIC}"]`);
      const body = group?.querySelector('rect');
      expect(body?.getAttribute('stroke-opacity')).toBe('1');
      expect(body?.getAttribute('stroke-width')).toBe(String(HIGH.shapes.borderWidth));
      expect(group?.querySelector('[data-part="toggle"]')?.getAttribute('stroke-opacity')).toBe(
        '1',
      );
      const name = [...(group?.querySelectorAll('text') ?? [])].find((text) =>
        text.textContent?.includes('Clinic booking'),
      );
      expect(name?.getAttribute('fill')).toBe(THEMES[theme].canvas.text);
    }
  });
});
