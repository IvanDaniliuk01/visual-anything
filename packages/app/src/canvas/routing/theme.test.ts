import { Color, Graphics, type GraphicsPath } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../../theme/themes';
import { arrowheadAt, type Point } from '../geometry';
import { midpointOf } from '../route';
import type { RelationLine } from '../scene';
import { LINE_PAINT, sameButPaint } from '../theme/paint';
import { painterOf } from '../theme/painter';
import { routePieces } from '../tiles';
import { routeByHand } from './hand';
import { handlesOf } from './handles';
import { drawRouteOverlay } from './overlay';

/** A curved line routed by hand, its stroke in the light theme and another in the dark one. */
function curvedLine(): RelationLine {
  const { route, curve } = routeByHand(
    {
      kind: 'shape',
      rect: { x: 0, y: 0, width: 100, height: 60 },
      attach: { side: 'right', at: 0.5 },
    },
    {
      kind: 'shape',
      rect: { x: 600, y: 400, width: 100, height: 60 },
      attach: { side: 'left', at: 0.5 },
    },
    [],
    'curved',
  );
  const end = route.at(-1) as Point;
  return {
    relation: 'r',
    route,
    from: route[0] as Point,
    to: end,
    middle: midpointOf(route),
    stroke: '#3E4C59',
    darkStroke: '#9AA5B1',
    width: 2,
    dash: 'solid',
    style: 'curved',
    ...(curve ? { curve } : {}),
    arrowhead: arrowheadAt(route.at(-2) as Point, end, 2),
  };
}

/** The strokes a drawing holds: each one's color, and the kinds of its path's instructions. */
function strokes(graphics: Graphics): { color: number; actions: string[] }[] {
  return graphics.context.instructions
    .filter((instruction) => instruction.action === 'stroke')
    .map((instruction) => {
      const data = instruction.data as { path: GraphicsPath; style: { color: number } };
      return {
        color: data.style.color,
        actions: data.path.instructions.map((each) => each.action),
      };
    });
}

const hex = (color: string) => new Color(color).toNumber();

describe('curved routes in the themes', () => {
  it('are drawn as Bézier curves in the stroke of the theme shown', () => {
    const line = curvedLine();
    for (const name of ['light', 'dark'] as const) {
      const graphics = new Graphics();
      painterOf(THEMES[name].canvas).routePieces(graphics, routePieces(line), [line]);
      const drawn = strokes(graphics);
      expect(drawn.length).toBeGreaterThan(0);
      for (const stroke of drawn) {
        expect(stroke.actions).toContain('bezierCurveTo');
        expect(stroke.color).toBe(hex(name === 'dark' ? '#9AA5B1' : '#3E4C59'));
      }
    }
  });

  it('have casings along their flattened curve, which tint to the canvas', () => {
    const line = curvedLine();
    const pieces = routePieces(line);
    const graphics = new Graphics();
    painterOf(THEMES.dark.canvas).casings(graphics, pieces, [line]);
    const drawn = strokes(graphics);
    expect(drawn.length).toBe(pieces.length + 1);
    expect(drawn.every((stroke) => stroke.color === hex('#FFFFFF'))).toBe(true);
  });

  it('restyle in place when only their colors change', () => {
    const line = curvedLine();
    expect(
      sameButPaint(line, { ...line, stroke: '#C2410C', darkStroke: '#FB923C' }, LINE_PAINT),
    ).toBe(true);
    expect(sameButPaint(line, { ...line, style: 'straight' }, LINE_PAINT)).toBe(false);
  });
});

describe('the route edit in the themes', () => {
  it('draws its line through the theme’s painter, and its handles in the theme’s selection color', () => {
    const line = curvedLine();
    const graphics = new Graphics();
    const dark = THEMES.dark.canvas;
    drawRouteOverlay(
      graphics,
      { relation: line.relation, handles: handlesOf(line, 1), preview: line },
      1,
      painterOf(dark),
    );
    const colors = strokes(graphics).map((stroke) => stroke.color);
    expect(colors).toContain(hex(dark.background));
    expect(colors).toContain(hex('#9AA5B1'));
    expect(colors).toContain(hex(dark.selected));
    expect(colors).not.toContain(hex('#3E4C59'));
  });
});
