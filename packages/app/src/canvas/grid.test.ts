import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../theme/themes';
import {
  FAMILY_SPACINGS,
  GRID_STEP,
  MAX_CONTAINER_LINES,
  MAX_GRID_LINES,
  RULER_LABEL_GAP,
  containerGridLines,
  crispLine,
  drawnFamilies,
  familyAlpha,
  gridOffset,
  gridLines,
  lineStrength,
  modulo,
  nudgedOffset,
  rulerLabelPool,
  rulerLabels,
  rulerSteps,
  snap,
  snappedDelta,
} from './grid';
import { MAX_SCALE, MIN_SCALE } from './camera';

const scales = fc.double({ min: MIN_SCALE, max: MAX_SCALE, noNaN: true });
const positions = fc.double({ min: -1e6, max: 1e6, noNaN: true });
const viewports = fc.record({
  width: fc.integer({ min: 200, max: 3400 }),
  height: fc.integer({ min: 200, max: 2200 }),
});
const RESOLUTIONS = [1, 1.25, 1.5, 2, 3];

/** How strong the line at canvas coordinate `at` is drawn at a scale, or 0 when it is not drawn. */
function strengthAt(at: number, scale: number): number {
  const families = drawnFamilies(scale);
  for (let index = families.length - 1; index >= 0; index--) {
    const family = families[index]!;
    if (Math.abs(at / family.spacing - Math.round(at / family.spacing)) < 1e-9) {
      return family.strength;
    }
  }
  return 0;
}

describe('the grid’s step', () => {
  it('is 8 canvas units, and its families are 8 × 5^j apart', () => {
    expect(GRID_STEP).toBe(8);
    expect(FAMILY_SPACINGS).toEqual([8, 40, 200, 1000, 5000, 25000]);
    FAMILY_SPACINGS.forEach((spacing, family) => expect(spacing).toBe(8 * 5 ** family));
  });
});

describe('lineStrength', () => {
  it('grows with the spacing on screen, from 0 at 4 px to 1 at 200 px', () => {
    expect(lineStrength(4)).toBe(0);
    expect(lineStrength(200)).toBe(1);
    expect(lineStrength(1000)).toBe(1);
    expect(lineStrength(8)).toBeCloseTo(0.18, 2);
    expect(lineStrength(40)).toBeCloseTo(0.59, 2);
  });
});

describe('drawnFamilies', () => {
  it('draws the families the design lists at each scale', () => {
    const at = (scale: number) =>
      drawnFamilies(scale).map((family) => [family.spacing, Math.round(family.strength * 100)]);
    expect(at(8)).toEqual([
      [8, 71],
      [40, 100],
    ]);
    expect(at(1)).toEqual([
      [8, 18],
      [40, 59],
      [200, 100],
    ]);
    expect(at(0.5)).toEqual([
      [40, 41],
      [200, 82],
      [1000, 100],
    ]);
    expect(at(0.02)).toEqual([
      [1000, 41],
      [5000, 82],
      [25000, 100],
    ]);
  });

  it('starts at the finest family with a strength of at least 0.1 and stops at the first with 1', () => {
    fc.assert(
      fc.property(scales, (scale) => {
        const families = drawnFamilies(scale);
        expect(families.length).toBeGreaterThan(0);
        for (const family of families) expect(family.strength).toBeGreaterThanOrEqual(0.1);
        expect(families.at(-1)!.strength).toBe(1);
        for (const family of families.slice(0, -1)) expect(family.strength).toBeLessThan(1);
        const finest = FAMILY_SPACINGS.indexOf(families[0]!.spacing);
        if (finest > 0)
          expect(lineStrength(FAMILY_SPACINGS[finest - 1]! * scale)).toBeLessThan(0.1);
      }),
    );
  });

  it('changes each line’s strength continuously with the scale, apart from appearing at the faintest', () => {
    fc.assert(
      fc.property(
        scales,
        fc.integer({ min: -2000, max: 2000 }),
        fc.constantFrom(...FAMILY_SPACINGS),
        (scale, n, spacing) => {
          const at = n * spacing;
          const next = Math.min(MAX_SCALE, scale * 1.0001);
          const a = strengthAt(at, scale);
          const b = strengthAt(at, next);
          if (a > 0 && b > 0) expect(Math.abs(a - b)).toBeLessThan(0.01);
          else expect(Math.max(a, b)).toBeLessThan(0.11);
        },
      ),
    );
  });
});

describe('familyAlpha', () => {
  const light = THEMES.light.canvas;
  const dark = THEMES.dark.canvas;

  it('is the strength times the theme’s grid strength', () => {
    expect(familyAlpha({ spacing: 200, pixels: 200, strength: 1 }, light, false)).toBeCloseTo(0.16);
    expect(familyAlpha({ spacing: 200, pixels: 200, strength: 1 }, dark, false)).toBeCloseTo(0.14);
  });

  it('keeps the 8-unit lines at the snapping floor while snapping, once they are 8 px apart', () => {
    const at100 = { spacing: 8, pixels: 8, strength: lineStrength(8) };
    expect(familyAlpha(at100, light, false)).toBeCloseTo(0.18 * 0.16, 2);
    expect(familyAlpha(at100, light, true)).toBe(light.gridSnapAlpha);
    expect(familyAlpha(at100, dark, true)).toBe(dark.gridSnapAlpha);
    expect(light.gridSnapAlpha).toBe(0.05);
    expect(dark.gridSnapAlpha).toBe(0.04);
    // Only the 8-unit family.
    const forty = { spacing: 40, pixels: 8, strength: lineStrength(8) };
    expect(familyAlpha(forty, light, true)).toBeCloseTo(0.18 * 0.16, 2);
  });

  it('fades the floor in continuously below 8 px, so that nothing pops when zooming', () => {
    fc.assert(
      fc.property(fc.double({ min: 5.9, max: 64, noNaN: true }), (pixels) => {
        const family = (p: number) => ({ spacing: 8, pixels: p, strength: lineStrength(p) });
        const a = familyAlpha(family(pixels), light, true);
        const b = familyAlpha(family(pixels * 1.0001), light, true);
        expect(Math.abs(a - b)).toBeLessThan(0.001);
        if (pixels >= 8) expect(a).toBeGreaterThanOrEqual(light.gridSnapAlpha);
      }),
    );
  });
});

describe('crispLine', () => {
  it('gives whole device pixels at every resolution', () => {
    fc.assert(
      fc.property(fc.double({ min: -5000, max: 5000, noNaN: true }), (x) => {
        for (const resolution of RESOLUTIONS) {
          const { start, width } = crispLine(x, resolution);
          const deviceStart = start * resolution;
          const deviceWidth = width * resolution;
          expect(Math.abs(deviceStart - Math.round(deviceStart))).toBeLessThan(1e-6);
          expect(Math.round(deviceWidth)).toBe(Math.max(1, Math.round(resolution)));
          expect(Math.abs(deviceWidth - Math.round(deviceWidth))).toBeLessThan(1e-6);
          // It lies over the point it draws.
          expect(Math.abs(start + width / 2 - x)).toBeLessThanOrEqual(1 / resolution);
        }
      }),
    );
  });
});

describe('gridLines and gridOffset', () => {
  it('cover the whole viewport for any camera, negative positions included', () => {
    fc.assert(
      fc.property(
        scales,
        positions,
        positions,
        viewports,
        fc.constantFrom(...RESOLUTIONS),
        (scale, cameraX, cameraY, viewport, resolution) => {
          const lines = gridLines(scale, viewport, resolution);
          const offsetX = gridOffset(cameraX, lines.period, resolution);
          const offsetY = gridOffset(cameraY, lines.period, resolution);
          expect(offsetX).toBeLessThanOrEqual(0);
          expect(offsetX).toBeGreaterThanOrEqual(-lines.period - 1 / resolution);
          // The lines reach past the viewport wherever the offset puts them.
          expect(offsetX + lines.extent.width).toBeGreaterThanOrEqual(viewport.width);
          expect(offsetY + lines.extent.height).toBeGreaterThanOrEqual(viewport.height);
          // Every line of the coarsest family on screen is drawn, within a device pixel.
          const coarsest = lines.families.at(-1)!;
          const spacing = coarsest.pixels;
          const first = Math.ceil(-cameraX / spacing);
          for (let n = first; cameraX + n * spacing <= viewport.width; n++) {
            const x = cameraX + n * spacing;
            const near = coarsest.xs.some(
              (line) => Math.abs(offsetX + line.start + line.width / 2 - x) <= 1.01 / resolution,
            );
            expect(near).toBe(true);
          }
        },
      ),
      { numRuns: 60 },
    );
  });

  it('draws each line once, in the coarsest family it belongs to', () => {
    const lines = gridLines(1, { width: 1920, height: 1080 }, 2);
    const all = lines.families.flatMap((family) => family.xs.map((line) => line.start));
    expect(new Set(all).size).toBe(all.length);
    expect(lines.families.map((family) => family.spacing)).toEqual([8, 40, 200]);
    // At scale 1 the coarsest is 200 px apart: a 40-unit line at 200 is the coarsest's.
    const forty = lines.families[1]!.xs.map((line) => Math.round(line.start + line.width / 2));
    expect(forty).not.toContain(200);
    expect(forty).toContain(40);
  });

  it('draws about 760 lines at most on a 1920 × 1080 canvas, and never more than the cap', () => {
    fc.assert(
      fc.property(
        scales,
        viewports,
        fc.constantFrom(...RESOLUTIONS),
        (scale, viewport, resolution) => {
          expect(gridLines(scale, viewport, resolution).count).toBeLessThanOrEqual(MAX_GRID_LINES);
        },
      ),
    );
    let most = 0;
    for (let scale = MIN_SCALE; scale <= MAX_SCALE; scale *= 1.01) {
      most = Math.max(most, gridLines(scale, { width: 1920, height: 1080 }, 2).count);
    }
    expect(most).toBeLessThanOrEqual(800);
    expect(MAX_GRID_LINES).toBe(1200);
  });

  it('leaves out the finest family when the lines would pass the cap', () => {
    const lines = gridLines(1.01, { width: 3308, height: 2000 }, 2, 300);
    expect(lines.count).toBeLessThanOrEqual(300);
    expect(lines.families[0]!.spacing).toBeGreaterThan(8);
  });

  it('takes a remainder that is never negative', () => {
    expect(modulo(-10, 200)).toBe(190);
    expect(modulo(410, 200)).toBe(10);
    expect(modulo(-400, 200)).toBe(0);
  });
});

describe('containerGridLines', () => {
  it('draws lines at the container’s origin + k × 8 within its area, each once, within the cap', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -5000, max: 5000 }),
        fc.integer({ min: -5000, max: 5000 }),
        fc.integer({ min: 0, max: 4000 }),
        fc.integer({ min: 0, max: 3000 }),
        scales,
        (x, y, width, height, scale) => {
          const area = { x: x + 2, y: y + 2, width, height };
          const families = containerGridLines(area, { x, y }, scale);
          const all: number[] = [];
          let count = 0;
          for (const family of families) {
            expect(family.pixels).toBeGreaterThanOrEqual(6 - 1e-9);
            for (const at of family.xs) {
              expect(Math.abs((at - x) % family.spacing)).toBe(0);
              expect(at).toBeGreaterThanOrEqual(area.x);
              expect(at).toBeLessThanOrEqual(area.x + area.width);
              all.push(at);
            }
            for (const at of family.ys) expect(Math.abs((at - y) % GRID_STEP)).toBe(0);
            count += family.xs.length + family.ys.length;
          }
          expect(new Set(all).size).toBe(all.length);
          if (families.length > 1) expect(count).toBeLessThanOrEqual(MAX_CONTAINER_LINES);
        },
      ),
    );
  });

  it('starts at the 8-unit lines at 100%, coarsest last', () => {
    const families = containerGridLines({ x: 2, y: 2, width: 436, height: 380 }, { x: 0, y: 0 }, 1);
    expect(families.map((family) => family.spacing)).toEqual([8, 40, 200]);
    expect(families[0]!.xs.slice(0, 4)).toEqual([8, 16, 24, 32]);
    expect(families[1]!.xs).toContain(40);
    expect(families[2]!.xs).toEqual([200, 400]);
  });
});

describe('snap', () => {
  it('is idempotent and moves a value by at most half a step', () => {
    fc.assert(
      fc.property(positions, (value) => {
        const snapped = snap(value);
        expect(snap(snapped)).toBe(snapped);
        expect(Math.abs(snapped - value)).toBeLessThanOrEqual(GRID_STEP / 2);
        expect(Math.abs(snapped % GRID_STEP)).toBe(0);
      }),
    );
    expect(Object.is(snap(-1), 0)).toBe(true);
  });
});

describe('snappedDelta', () => {
  const points = fc.record({
    x: fc.integer({ min: -100_000, max: 100_000 }),
    y: fc.integer({ min: -100_000, max: 100_000 }),
  });

  it('lands the anchor on a multiple of 8 in its frame, and moves everything else alike', () => {
    fc.assert(
      fc.property(
        points,
        fc.record({ x: positions, y: positions }),
        points,
        fc.array(points, { maxLength: 5 }),
        (anchor, raw, frame, others) => {
          const delta = snappedDelta(anchor, raw, frame);
          expect(Math.abs((anchor.x + delta.x - frame.x) % GRID_STEP)).toBe(0);
          expect(Math.abs((anchor.y + delta.y - frame.y) % GRID_STEP)).toBe(0);
          expect(Math.abs(delta.x - raw.x)).toBeLessThanOrEqual(GRID_STEP / 2 + 1e-6);
          for (const other of others) {
            // Each shape keeps where it was relative to the anchor.
            const before = { x: other.x - anchor.x, y: other.y - anchor.y };
            const after = {
              x: other.x + delta.x - (anchor.x + delta.x),
              y: other.y + delta.y - (anchor.y + delta.y),
            };
            expect(after).toEqual(before);
          }
        },
      ),
    );
  });

  it('works in World, whose origin is the canvas’s', () => {
    expect(snappedDelta({ x: 164, y: 37 }, { x: 10, y: 0 }, { x: 0, y: 0 })).toEqual({
      x: 12,
      y: 3,
    });
  });
});

describe('nudgedOffset', () => {
  it('reaches the next grid line in the direction, from on a line or between two', () => {
    expect(nudgedOffset(164, 1)).toBe(168);
    expect(nudgedOffset(168, 1)).toBe(176);
    expect(nudgedOffset(164, -1)).toBe(160);
    expect(nudgedOffset(168, -1)).toBe(160);
    expect(nudgedOffset(-4, 1)).toBe(0);
    fc.assert(
      fc.property(positions, fc.constantFrom<1 | -1>(1, -1), (value, direction) => {
        const next = nudgedOffset(value, direction);
        expect(next % GRID_STEP === 0).toBe(true);
        expect((next - value) * direction).toBeGreaterThan(0);
        expect((next - value) * direction).toBeLessThanOrEqual(GRID_STEP);
      }),
    );
  });
});

describe('rulerSteps and the labels', () => {
  it('label at the smallest of 1 and 2 × 8 · 5^j at least 64 px apart, on the grid’s lines', () => {
    expect(rulerSteps(1).label).toBe(80);
    expect(rulerSteps(0.5).label).toBe(200);
    expect(rulerSteps(2).label).toBe(40);
    fc.assert(
      fc.property(scales, (scale) => {
        const { label, tick } = rulerSteps(scale);
        expect(label * scale).toBeGreaterThanOrEqual(RULER_LABEL_GAP);
        expect(tick * scale).toBeGreaterThanOrEqual(8);
        expect(label % tick).toBe(0);
        expect(FAMILY_SPACINGS).toContain(tick);
      }),
    );
  });

  it('writes integers, with a minus sign for negatives', () => {
    const labels = rulerLabels(150, 1, 400, 80);
    expect(labels.map((label) => label.text)).toEqual(['−80', '0', '80', '160', '240']);
    expect(labels[1]!.at).toBe(150);
  });

  it('has a pool large enough for every label on screen', () => {
    fc.assert(
      fc.property(scales, positions, positions, viewports, (scale, x, y, viewport) => {
        const { label } = rulerSteps(scale);
        const across = rulerLabels(x, scale, viewport.width, label).length;
        const down = rulerLabels(y, scale, viewport.height, label).length;
        expect(across + down).toBeLessThanOrEqual(rulerLabelPool(viewport));
      }),
    );
    expect(rulerLabelPool({ width: 3308, height: 2000 })).toBeLessThanOrEqual(90);
  });
});
