import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readMathFonts } from './katex-fonts';
import { mathGlyphOutline } from './outlines';
import { MATH_FONTS, buildAdvanceTable, buildOutlineTable, tableFile } from './tables';
import { readTrueType } from './ttf';

const GENERATE_COMMAND = 'pnpm exec tsx packages/core/src/math/generate.ts';
const committed = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const fonts = readMathFonts();

describe("Math's tables", () => {
  it(`hold the advances of the pinned KaTeX's fonts; run \`${GENERATE_COMMAND}\` after upgrading it`, () => {
    expect(committed('advances.json') === tableFile(buildAdvanceTable(fonts))).toBe(true);
  });

  it(`hold the outlines of the pinned KaTeX's fonts; run \`${GENERATE_COMMAND}\` after upgrading it`, () => {
    expect(committed('outlines.json') === tableFile(buildOutlineTable(fonts))).toBe(true);
  });

  it('give each font its line metrics and its own advances', () => {
    const table = buildAdvanceTable(fonts);
    expect(Object.keys(table)).toEqual([...MATH_FONTS]);
    expect(table['Main-Regular'].ascent).toBeGreaterThan(0.8);
    expect(table['Main-Regular'].descent).toBeGreaterThan(0.2);
    expect(table['Main-Regular'].advances[0x41]).toBe(0.75);
    expect(table['Size2-Regular'].advances[0x2211]).toBeGreaterThan(1);
  });

  it('trace every glyph within the bounding box its header records', () => {
    for (const name of MATH_FONTS) {
      const font = readTrueType(fonts.get(name) ?? new Uint8Array());
      for (const [codePoint, glyph] of font.glyphOf) {
        const path = mathGlyphOutline(name, String.fromCodePoint(codePoint));
        const bounds = font.boundsOf(glyph);
        if (path === undefined) {
          expect(font.contoursOf(glyph)).toEqual([]);
          continue;
        }
        expect(bounds, `${name} U+${codePoint.toString(16)}`).toBeDefined();
        if (!bounds) continue;
        // The header's box is the curves' extent, to a unit: it holds every point on the curve, and
        // the control points around it reach at least as far.
        const { onCurve, all } = pathBounds(path);
        const unit = 1 / font.unitsPerEm + 1e-9;
        const where = `${name} U+${codePoint.toString(16)}`;
        const header = {
          xMin: bounds.xMin / font.unitsPerEm,
          xMax: bounds.xMax / font.unitsPerEm,
          yMin: -bounds.yMax / font.unitsPerEm,
          yMax: -bounds.yMin / font.unitsPerEm,
        };
        expect(onCurve.xMin, where).toBeGreaterThanOrEqual(header.xMin - unit);
        expect(onCurve.xMax, where).toBeLessThanOrEqual(header.xMax + unit);
        expect(onCurve.yMin, where).toBeGreaterThanOrEqual(header.yMin - unit);
        expect(onCurve.yMax, where).toBeLessThanOrEqual(header.yMax + unit);
        expect(all.xMin, where).toBeLessThanOrEqual(header.xMin + unit);
        expect(all.xMax, where).toBeGreaterThanOrEqual(header.xMax - unit);
        expect(all.yMin, where).toBeLessThanOrEqual(header.yMin + unit);
        expect(all.yMax, where).toBeGreaterThanOrEqual(header.yMax - unit);
      }
    }
  });

  it('look up a glyph by its font and character', () => {
    expect(mathGlyphOutline('Math-Italic', 'x')).toMatch(/^M[-.\d]/);
    expect(mathGlyphOutline('Main-Regular', ' ')).toBeUndefined();
    expect(mathGlyphOutline('Main-Regular', '日')).toBeUndefined();
    expect(mathGlyphOutline('Main-Regular', '')).toBeUndefined();
  });
});

interface Box {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

/** The box of the points a path ends its segments on, and of all its points, control points too. */
function pathBounds(d: string): { onCurve: Box; all: Box } {
  const box = (): Box => ({ xMin: Infinity, yMin: Infinity, xMax: -Infinity, yMax: -Infinity });
  const onCurve = box();
  const all = box();
  const add = (target: Box, px: number, py: number) => {
    target.xMin = Math.min(target.xMin, px);
    target.xMax = Math.max(target.xMax, px);
    target.yMin = Math.min(target.yMin, py);
    target.yMax = Math.max(target.yMax, py);
  };
  let x = 0;
  let y = 0;
  let control: [number, number] = [0, 0];
  for (const [, command, args] of d.matchAll(/([MZhvlqt])([^MZhvlqt]*)/g)) {
    const n = (args?.match(/-?(?:\d+\.?\d*|\.\d+)/g) ?? []).map(Number);
    switch (command) {
      case 'M':
        [x, y] = [n[0] ?? 0, n[1] ?? 0];
        break;
      case 'h':
        x += n[0] ?? 0;
        break;
      case 'v':
        y += n[0] ?? 0;
        break;
      case 'l':
        x += n[0] ?? 0;
        y += n[1] ?? 0;
        break;
      case 'q':
        control = [x + (n[0] ?? 0), y + (n[1] ?? 0)];
        add(all, ...control);
        x += n[2] ?? 0;
        y += n[3] ?? 0;
        break;
      case 't':
        control = [2 * x - control[0], 2 * y - control[1]];
        add(all, ...control);
        x += n[0] ?? 0;
        y += n[1] ?? 0;
        break;
    }
    add(onCurve, x, y);
    add(all, x, y);
    if (command !== 'q' && command !== 't') control = [x, y];
  }
  return { onCurve, all };
}
