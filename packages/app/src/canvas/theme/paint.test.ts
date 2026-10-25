import { contrastRatio } from '@visual-anything/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../../theme/themes';
import { arrowheadAt } from '../geometry';
import type { ArrowShape, ElementShape, NoteShape, RelationLine } from '../scene';
import { routePieces } from '../tiles';
import {
  LINE_PAINT,
  SHAPE_PAINT,
  noteColors,
  paintedArrow,
  paintedLine,
  paintedNote,
  paintedPiece,
  paintedShape,
  sameButPaint,
  sameListButPaint,
} from './paint';

const rect = { x: 0, y: 0, width: 100, height: 50 };
const service: ElementShape = {
  key: 'api',
  element: 'api',
  offset: { x: 0, y: 0 },
  positioned: 'stored',
  name: 'API',
  componentName: 'Service',
  kind: 'rounded-rectangle',
  fill: '#DCEBFF',
  stroke: '#1D4F91',
  dark: { fill: '#172B45', stroke: '#78A8EE' },
  rect,
  extent: rect,
  holdsContents: false,
};
const route = [
  { x: 0, y: 0 },
  { x: 2000, y: 0 },
];
const line: RelationLine = {
  relation: 'r',
  route,
  from: route[0] as { x: number; y: number },
  to: route[1] as { x: number; y: number },
  middle: { x: 1000, y: 0 },
  arrowhead: arrowheadAt({ x: 0, y: 0 }, { x: 2000, y: 0 }, 2),
  stroke: '#3D4651',
  darkStroke: '#AEB8C4',
  width: 2,
  dash: 'solid',
};
const note: NoteShape = { id: 'n', rect, text: 'Remember' };
const arrow: ArrowShape = {
  id: 'a',
  from: { x: 0, y: 0 },
  to: { x: 100, y: 0 },
  arrowhead: arrowheadAt({ x: 0, y: 0 }, { x: 100, y: 0 }, 2),
};

describe('painted copies', () => {
  it('are the items themselves in the light theme, and where nothing follows the theme', () => {
    expect(paintedShape(service, 'light')).toBe(service);
    const stored = { ...service, dark: undefined };
    delete stored.dark;
    expect(paintedShape(stored, 'dark')).toBe(stored);
    expect(paintedLine(line, 'light')).toBe(line);
  });

  it('carry the dark shades, and are made once for each item', () => {
    const shape = paintedShape(service, 'dark');
    expect([shape.fill, shape.stroke]).toEqual(['#172B45', '#78A8EE']);
    expect(paintedShape(service, 'dark')).toBe(shape);
    expect(paintedLine(line, 'dark').stroke).toBe('#AEB8C4');
    const [piece] = routePieces(line);
    expect(paintedPiece(piece as never, 'dark').line.stroke).toBe('#AEB8C4');
    expect(paintedPiece(piece as never, 'dark')).toBe(paintedPiece(piece as never, 'dark'));
  });

  it('give notes and arrows without colors of their own the theme’s', () => {
    const dark = THEMES.dark.canvas;
    expect(paintedNote(note, dark)).toMatchObject({ fill: dark.noteFill, stroke: dark.noteStroke });
    expect(paintedArrow(arrow, dark).stroke).toBe(dark.freeArrow);
    const own = { ...note, fill: '#DCEBFF', stroke: '#1D4F91' };
    expect(paintedNote(own, dark)).toBe(own);
    expect(paintedArrow({ ...arrow, stroke: '#C2255C' }, dark).stroke).toBe('#C2255C');
  });
});

describe('note text', () => {
  it('is the theme’s on the theme’s fill, and reads on a fill of its own', () => {
    for (const theme of [THEMES.light.canvas, THEMES.dark.canvas]) {
      expect(noteColors(note, theme).text).toBe(theme.noteText);
      const colors = noteColors({ ...note, fill: '#DCEBFF' }, theme);
      expect(contrastRatio(colors.text, colors.fill)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('reads at 4.5:1 or more on any note fill, in both themes', () => {
    const color = fc
      .array(fc.integer({ min: 0, max: 255 }), { minLength: 3, maxLength: 3 })
      .map((rgb) => `#${rgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`);
    fc.assert(
      fc.property(color, fc.constantFrom('light', 'dark' as const), (fill, name) => {
        const colors = noteColors({ ...note, fill }, THEMES[name].canvas);
        expect(contrastRatio(colors.text, colors.fill)).toBeGreaterThanOrEqual(4.5);
      }),
    );
  });
});

describe('sameButPaint', () => {
  it('tells a change of colors from any other change', () => {
    expect(
      sameButPaint(service, { ...service, fill: '#FFFFFF', dark: undefined }, SHAPE_PAINT),
    ).toBe(true);
    expect(sameButPaint(service, { ...service, rect: { ...rect, x: 8 } }, SHAPE_PAINT)).toBe(false);
    expect(sameButPaint(service, { ...service, name: 'Gateway' }, SHAPE_PAINT)).toBe(false);
    // A field it does not name, such as one added later, counts as a change of the drawing.
    expect(sameButPaint(service, { ...service, rows: [] }, SHAPE_PAINT)).toBe(false);
    expect(
      sameButPaint(line, { ...line, stroke: '#C2255C', darkStroke: undefined }, LINE_PAINT),
    ).toBe(true);
    expect(sameButPaint(line, { ...line, route: [...route, { x: 2000, y: 8 }] }, LINE_PAINT)).toBe(
      false,
    );
  });

  it('compares lists item by item, in order', () => {
    const other = { ...service, key: 'db', element: 'db' };
    expect(
      sameListButPaint([service, other], [{ ...service, fill: '#FFF' }, other], SHAPE_PAINT),
    ).toBe(true);
    expect(sameListButPaint([service, other], [other, service], SHAPE_PAINT)).toBe(false);
    expect(sameListButPaint([service], [service, other], SHAPE_PAINT)).toBe(false);
  });
});
