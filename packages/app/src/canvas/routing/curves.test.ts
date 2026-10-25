import { Graphics, type GraphicsPath } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { drawRelationRoutes, drawRoutePieces } from '../draw';
import { arrowheadAt, distance, middle, type Point } from '../geometry';
import { midpointOf } from '../route';
import type { RelationLine } from '../scene';
import { TILE, cellOf, routePieces } from '../tiles';
import { drawnCurve } from './curves';
import { pointOnSpan, routeByHand } from './hand';

/** A curved line routed by hand between two rectangles, `across` apart. */
function curvedLine(
  across: number,
  dash: RelationLine['dash'] = 'solid',
  directed = true,
): RelationLine {
  const { route, curve } = routeByHand(
    {
      kind: 'shape',
      rect: { x: 0, y: 0, width: 100, height: 60 },
      attach: { side: 'right', at: 0.5 },
    },
    {
      kind: 'shape',
      rect: { x: across, y: 400, width: 100, height: 60 },
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
    width: 2,
    dash,
    style: 'curved',
    ...(curve ? { curve } : {}),
    ...(directed ? { arrowhead: arrowheadAt(route.at(-2) as Point, end, 2) } : {}),
  };
}

/** The kinds of path instructions a drawing holds, in order. */
function pathActions(graphics: Graphics): string[] {
  return graphics.context.instructions.flatMap(
    (instruction) =>
      (instruction.data as { path?: GraphicsPath }).path?.instructions.map((each) => each.action) ??
      [],
  );
}

describe('drawnCurve', () => {
  it('ends at the base of the arrowhead', () => {
    const line = curvedLine(600);
    const spans = drawnCurve(line);
    const base = middle(line.arrowhead?.left as Point, line.arrowhead?.right as Point);
    expect(distance(spans.at(-1)?.to as Point, line.to)).toBeCloseTo(distance(base, line.to), 3);
    expect(distance(spans.at(-1)?.to as Point, base)).toBeLessThan(0.5);
  });

  it('keeps every span of a line without an arrowhead', () => {
    const line = curvedLine(600, 'solid', false);
    expect(drawnCurve(line)).toBe(line.curve);
  });
});

describe('the pieces of a curve', () => {
  it('follow one another along the curve, each in the cell of its middle', () => {
    const line = curvedLine(3000);
    const pieces = routePieces(line);
    expect(pieces.length).toBeGreaterThan(2);
    let previous: Point | undefined;
    let travelled = -1;
    for (const piece of pieces) {
      const spans = piece.curve ?? [];
      expect(spans.length).toBeGreaterThan(0);
      if (previous) expect(spans[0]?.from).toEqual(previous);
      for (let at = 1; at < spans.length; at++) expect(spans[at]?.from).toEqual(spans[at - 1]?.to);
      previous = spans.at(-1)?.to;
      expect(piece.cell).toBe(cellOf(pointOnSpan(spans[0] as never, 0.5)));
      expect(piece.travelled).toBeGreaterThan(travelled);
      travelled = piece.travelled;
      // The flattened points follow the spans, for the plain drawing and the tile's bounds.
      expect(piece.points[0]).toEqual(spans[0]?.from);
      expect(piece.points.at(-1)).toEqual(spans.at(-1)?.to);
    }
    expect(pieces.at(-1)?.last).toBe(true);
    expect(pieces.filter((piece) => piece.last)).toHaveLength(1);
    expect(previous).toEqual(drawnCurve(line).at(-1)?.to);
    // A tile spans about its cell.
    for (const piece of pieces) {
      const xs = piece.points.map((point) => point.x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(TILE);
    }
  });

  it('are drawn as Bézier curves when solid, and along the flattened points when dashed', () => {
    const solid = new Graphics();
    drawRoutePieces(solid, routePieces(curvedLine(600)), []);
    expect(pathActions(solid)).toContain('bezierCurveTo');

    const dashed = new Graphics();
    drawRoutePieces(dashed, routePieces(curvedLine(600, 'dashed')), []);
    expect(pathActions(dashed)).not.toContain('bezierCurveTo');
    expect(pathActions(dashed)).toContain('lineTo');
  });

  it('draw a whole curved line as one curve, with its arrowhead', () => {
    const graphics = new Graphics();
    drawRelationRoutes(graphics, [curvedLine(600)]);
    const actions = pathActions(graphics);
    expect(actions.filter((action) => action === 'bezierCurveTo')).toHaveLength(1);
    expect(actions).toContain('poly');
  });
});
