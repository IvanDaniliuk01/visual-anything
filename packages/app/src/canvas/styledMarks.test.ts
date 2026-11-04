/** What a tour's step draws in its own style rather than with a halo (ADR 0100). */
import { describe, expect, it } from 'vitest';
import { THEMES } from '../theme/themes';
import { loadSample } from '../test/sample';
import { contrastRatio } from './colors';
import { DASH_PATTERNS } from './drawing';
import type { Lit } from './emphasize';
import { flowPieces } from './lineDraw';
import { buildScene, type ElementShape, type RelationLine } from './scene';
import {
  BREATH_TIME,
  FLOW_PERIOD_TIME,
  STYLED_LINE_LEAST,
  StyledMarks,
  breathAt,
  flowOffset,
  styledBorderColor,
  styledLineOf,
  styledWidth,
} from './styledMarks';

const scene = buildScene(loadSample(), 'system-overview');
const directed = scene.relations.find((line) => line.arrowhead && !line.arrowhead.open);
if (!directed) throw new Error('The sample draws no directed line.');
const shape = scene.shapes.find((each) => each.key.endsWith('patient')) as ElementShape;
const light = THEMES.light.canvas;
const dark = THEMES.dark.canvas;
const NONE: Lit = { shapes: [], lines: [], notes: [], arrows: [] };
const everywhere = { x: -1e6, y: -1e6, width: 2e6, height: 2e6 };
const nowhere = { x: 1e7, y: 1e7, width: 1, height: 1 };

describe('a line drawn in its own style', () => {
  it('is twice as wide, and never narrower on screen than its least', () => {
    expect(styledWidth(2, 1)).toBe(4);
    expect(styledWidth(1, 0.25)).toBe(STYLED_LINE_LEAST / 0.25);
    expect(styledWidth(1, 0.25) * 0.25).toBeGreaterThanOrEqual(STYLED_LINE_LEAST);
  });

  it('takes the emphasis color, keeps its route and dash, and a larger arrowhead about its tip', () => {
    const line: RelationLine = { ...directed, dash: 'dashed', opacity: 0.4 };
    const drawn = styledLineOf(line, 1, light.highlight);
    expect(drawn.stroke).toBe(light.highlight);
    expect(drawn.route).toBe(line.route);
    expect(drawn.dash).toBe('dashed');
    expect(drawn).not.toHaveProperty('opacity');
    const span = (each: RelationLine) =>
      Math.hypot(
        (each.arrowhead?.left.x ?? 0) - (each.arrowhead?.right.x ?? 0),
        (each.arrowhead?.left.y ?? 0) - (each.arrowhead?.right.y ?? 0),
      );
    expect(drawn.arrowhead?.tip).toEqual(line.arrowhead?.tip);
    expect(span(drawn)).toBeGreaterThanOrEqual(span(line) * 1.5);
  });

  it('flows its dash forward, one period every period of time, and starts again', () => {
    const width = 4;
    const period = DASH_PATTERNS.dashed.period * width;
    expect(flowOffset(0, width, 'dashed')).toBe(0);
    expect(flowOffset(FLOW_PERIOD_TIME / 2, width, 'dashed')).toBeCloseTo(period / 2);
    expect(flowOffset(FLOW_PERIOD_TIME * 1.25, width, 'dashed')).toBeCloseTo(period / 4);
  });

  it('flows from its from end when directed, and from both ends toward its middle when not', () => {
    const route = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(flowPieces(route, true)).toEqual([route]);
    expect(flowPieces(route, false)).toEqual([
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
      [
        { x: 100, y: 0 },
        { x: 50, y: 0 },
      ],
    ]);
  });

  it('flows only while it moves and while it is on screen', () => {
    const marks = new StyledMarks();
    const lit = { ...NONE, lines: [directed] };
    marks.show(lit, 1, light, { moves: true, now: 0 });
    expect(marks.frame(16, everywhere)).toBe(true);
    expect(marks.frame(32, nowhere)).toBe(false);
    marks.show(lit, 1, light, { moves: false, now: 48 });
    expect(marks.frame(64, everywhere)).toBe(false);
    expect(marks.drawnLines).toHaveLength(1);
    marks.destroy();
  });
});

describe('an element drawn in its own style', () => {
  it('keeps its own stroke for its border where it reads at 3:1 on the canvas, else the emphasis color', () => {
    for (const theme of [light, dark]) {
      const color = styledBorderColor(shape, theme);
      if (color !== theme.highlight) {
        expect(contrastRatio(color, theme.background)).toBeGreaterThanOrEqual(3);
      }
      const faint = { ...shape, stroke: theme.background, dark: undefined } as ElementShape;
      expect(styledBorderColor(faint, theme)).toBe(theme.highlight);
    }
  });

  it('breathes once as it comes in, over a short time, and never again', () => {
    expect(breathAt(0)).toBe(0);
    expect(breathAt(BREATH_TIME / 2)).toBeCloseTo(1);
    expect(breathAt(BREATH_TIME)).toBe(0);
    const marks = new StyledMarks();
    const lit = { ...NONE, shapes: [shape] };
    marks.show(lit, 1, light, { moves: true, now: 0, breathes: true });
    expect(marks.frame(BREATH_TIME / 2, everywhere)).toBe(true);
    expect(marks.frame(BREATH_TIME + 1, everywhere)).toBe(false);
    // Drawn again, as when the camera zooms, it does not breathe again.
    marks.show(lit, 2, light, { moves: true, now: BREATH_TIME + 2, breathes: true });
    expect(marks.frame(BREATH_TIME + 20, everywhere)).toBe(false);
    marks.destroy();
  });

  it('does not breathe under reduced motion', () => {
    const marks = new StyledMarks();
    marks.show({ ...NONE, shapes: [shape] }, 1, light, { moves: false, now: 0, breathes: true });
    expect(marks.frame(BREATH_TIME / 2, everywhere)).toBe(false);
    marks.destroy();
  });
});
