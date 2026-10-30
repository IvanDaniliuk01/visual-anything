/**
 * The contrast of the overlay palette (ADR 0080, section 6), in the style of the themes' contrast
 * tests: every generated color 3:1 against the canvas of each theme, every two of them apart, and the
 * legend warning about none of them against the canvas.
 */
import {
  CANVAS_BACKGROUNDS,
  THEME_NAMES,
  definitionsIn,
  legendOf,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../../canvas/colors';
import { loadSample } from '../../test/sample';
import {
  LEAST_DIFFERENCE,
  OVERLAY_PALETTE,
  colorDifference,
  labOf,
  paletteColor,
} from './overlayPalette';

const MARK = 3;

describe('the overlay palette', () => {
  it.each(THEME_NAMES)('keeps every color 3:1 against the %s canvas', (theme) => {
    for (const color of OVERLAY_PALETTE) {
      expect(contrastRatio(color, CANVAS_BACKGROUNDS[theme]), color).toBeGreaterThanOrEqual(MARK);
    }
  });

  it('keeps every two colors apart', () => {
    for (let first = 0; first < OVERLAY_PALETTE.length; first++) {
      for (let second = first + 1; second < OVERLAY_PALETTE.length; second++) {
        const a = OVERLAY_PALETTE[first] as string;
        const b = OVERLAY_PALETTE[second] as string;
        expect(colorDifference(a, b), `${a} and ${b}`).toBeGreaterThanOrEqual(LEAST_DIFFERENCE);
      }
    }
  });

  it('cannot keep two colors 3:1 apart that are both 3:1 against both canvases', () => {
    // A color 3:1 against both canvases has a relative luminance between these two.
    const darkest = 3 * (luminance(CANVAS_BACKGROUNDS.dark) + 0.05) - 0.05;
    const lightest = (luminance(CANVAS_BACKGROUNDS.light) + 0.05) / 3 - 0.05;
    expect((lightest + 0.05) / (darkest + 0.05)).toBeLessThan(2);
  });

  it('gives values its colors in order, from the start again past its end', () => {
    expect(paletteColor(0)).toBe(OVERLAY_PALETTE[0]);
    expect(paletteColor(OVERLAY_PALETTE.length + 1)).toBe(OVERLAY_PALETTE[1]);
  });

  it('reads white as white and black as black in CIELAB', () => {
    expect(labOf('#FFFFFF')[0]).toBeCloseTo(100, 0);
    expect(labOf('#000000')[0]).toBeCloseTo(0, 5);
  });

  it.each(THEME_NAMES)(
    'leaves the legend no warning against the %s canvas for generated colors',
    (theme) => {
      const project: ProjectSnapshot = loadSample();
      const view = project.views[0] as ViewFile;
      const withOverlay: ViewFile = {
        ...view,
        overlays: [
          {
            id: 'generated',
            name: 'Layer',
            of: 'elements',
            attribute: 'layer',
            channel: 'fill',
            mapping: {
              kind: 'discrete',
              cases: OVERLAY_PALETTE.slice(0, 5).map((color, at) => ({
                value: `value ${at}`,
                color,
              })),
            },
          },
        ],
      };
      const [part] = legendOf(withOverlay, definitionsIn(project), theme).overlays;
      const againstCanvas = (part?.warnings ?? []).filter((warning) => warning.includes('canvas'));
      expect(againstCanvas).toEqual([]);
    },
  );
});

function luminance(color: string): number {
  const value = Number.parseInt(color.slice(1, 7), 16);
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * linear((value >> 16) & 255) +
    0.7152 * linear((value >> 8) & 255) +
    0.0722 * linear(value & 255)
  );
}
