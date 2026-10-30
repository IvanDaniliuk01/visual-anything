/**
 * Lines beside rows through the program's own router (ADR 0080, section 2, Stage 0b): leaving at their
 * row's middle with a stub of 16, around the tables in their way, apart from each other; a relation
 * from a row to its own table in a short C, or one arc; and curves past 24, or crossing a shape,
 * drawn with rounded corners.
 */
import type { Relation } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import type { Point, Rect } from '../geometry';
import { measureScene, segmentThrough } from '../layout/quality';
import { buildSceneAfresh, type ElementShape, type RelationLine, type Scene } from '../scene';
import { VIEW, tablesProject, type TableSpec } from '../../test/tables';
import { STUB } from './avoid';
import { avoidBatchOf, avoidedScene } from './avoided';
import { CORNER_RADIUS, MOST_CURVES, holderKeyOf, roundedCurve } from './rounded';

function table(
  id: string,
  x: number,
  y: number,
  rows = 4,
  extra: Partial<TableSpec> = {},
): TableSpec {
  return {
    id,
    at: { x, y },
    columns: Array.from({ length: rows }, (_, at) => ({ id: `${id}-c${at}`, name: `c${at}` })),
    ...extra,
  };
}

function shapeOf(scene: Scene, element: string): ElementShape {
  return scene.shapes.find((shape) => shape.element === element) as ElementShape;
}

function lineOf(scene: Scene, relation: string): RelationLine {
  return scene.relations.find((line) => line.relation === relation) as RelationLine;
}

function through(route: readonly Point[], rect: Rect): boolean {
  for (let at = 1; at < route.length; at++) {
    if (segmentThrough(route[at - 1] as Point, route[at] as Point, rect)) return true;
  }
  return false;
}

describe('lines beside rows through the router (ADR 0080)', () => {
  // A table in the way between two others whose rows refer to each other.
  const project = tablesProject({
    tables: [table('a', 0, 0), table('middle', 400, -40, 12), table('b', 800, 40)],
    references: [{ id: 'fk', from: 'a-c1', to: 'b-c2' }],
  });

  it('are given to the router, with the side and height they leave at', () => {
    const scene = buildSceneAfresh(project, VIEW);
    const batch = avoidBatchOf(scene);
    const at = batch.drawn.findIndex((line) => line.relation === 'fk');
    expect(at).toBeGreaterThanOrEqual(0);
    const line = batch.lines[at];
    const row = shapeOf(scene, 'a-c1');
    expect(line?.fromSide?.way).toBe(1);
    expect(line?.fromSide?.y).toBe(row.rect.y + row.rect.height / 2);
    expect(line?.toSide?.way).toBe(-1);
  });

  it('go around the table in their way, leaving at their rows with a stub of 16', () => {
    const before = buildSceneAfresh(project, VIEW);
    expect(through(lineOf(before, 'fk').route, shapeOf(before, 'middle').rect)).toBe(true);
    const scene = avoidedScene(before);
    const line = lineOf(scene, 'fk');
    expect(through(line.route, shapeOf(scene, 'middle').rect)).toBe(false);
    const quality = measureScene(scene);
    expect(quality.rowEndsAtMiddle).toBe(quality.rowEnds);
    const [start, next] = line.route as [Point, Point];
    expect(start.y).toBe(next.y);
    expect(next.x - start.x).toBeGreaterThanOrEqual(STUB);
    const end = line.route.at(-1) as Point;
    const beforeEnd = line.route.at(-2) as Point;
    expect(end.y).toBe(beforeEnd.y);
    expect(end.x - beforeEnd.x).toBeGreaterThanOrEqual(STUB);
  });

  it('keep apart: lines between different rows through one gap share no segment', () => {
    const many = tablesProject({
      tables: [table('a', 0, 0, 6), table('b', 400, 300, 6)],
      references: [0, 1, 2, 3, 4].map((at) => ({
        id: `fk${at}`,
        from: `a-c${at}`,
        to: `b-c${at}`,
      })),
    });
    const before = measureScene(buildSceneAfresh(many, VIEW));
    expect(before.sharedSegments).toBeGreaterThan(0);
    const after = measureScene(avoidedScene(buildSceneAfresh(many, VIEW)));
    expect(after.sharedSegments).toBe(0);
    expect(after.rowEndsAtMiddle).toBe(after.rowEnds);
    expect(after.crossings).toBeLessThanOrEqual(before.crossings);
  });
});

describe('a relation from a row to its own table (ADR 0080)', () => {
  const selfReference = (style?: 'curved') => {
    const project = tablesProject({
      tables: [table('runs', 0, 0, 8)],
      references: [{ id: 'parent', from: 'runs-c5', to: 'runs-c0' }],
    });
    if (style) (project.views[0] as { routeStyle?: string }).routeStyle = style;
    return buildSceneAfresh(project, VIEW);
  };

  it('draws a short C, 16 out of the right side and back', () => {
    const scene = avoidedScene(selfReference());
    const runs = shapeOf(scene, 'runs').rect;
    const right = runs.x + runs.width;
    const route = lineOf(scene, 'parent').route;
    expect(route).toHaveLength(4);
    expect(route[0]?.x).toBe(right);
    expect(route[1]?.x).toBe(right + 16);
    expect(route[2]?.x).toBe(right + 16);
    expect(route[3]?.x).toBe(right);
  });

  it('draws one arc of the same reach when curved, never a loop round the table', () => {
    const scene = selfReference('curved');
    const runs = shapeOf(scene, 'runs').rect;
    const line = lineOf(scene, 'parent');
    expect(line.curve).toHaveLength(1);
    const furthest = Math.max(...line.route.map((point) => point.x));
    expect(furthest - (runs.x + runs.width)).toBeCloseTo(16, 0);
    // It never leaves the band between its two rows.
    const ys = line.route.map((point) => point.y);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(Math.min(line.from.y, line.to.y) - 0.01);
    expect(Math.max(...ys)).toBeLessThanOrEqual(Math.max(line.from.y, line.to.y) + 0.01);
    expect(Math.min(...line.route.map((point) => point.x))).toBeGreaterThanOrEqual(
      runs.x + runs.width - 0.01,
    );
  });
});

describe('curves that degrade (ADR 0080, section 3)', () => {
  /** A view drawn curved, with `count` relations between pairs of services in World. */
  const services = (count: number, routes: Record<string, unknown> = {}) => {
    const elements = Array.from({ length: count * 2 }, (_, at) => ({
      id: `s${at}`,
      component: 'systems.service',
      name: `s${at}`,
    }));
    const relations: Relation[] = Array.from({ length: count }, (_, at) => ({
      id: `r${at}`,
      relationType: 'systems.calls',
      from: `s${2 * at}`,
      to: `s${2 * at + 1}`,
    }));
    const project = tablesProject({
      tables: [],
      elements,
      relations,
      positions: elements.map((element, at) => ({
        element: element.id,
        x: (at % 2) * 400,
        y: Math.floor(at / 2) * 160 + (at % 2) * 60,
      })),
    });
    const view = project.views[0] as { routeStyle?: string; routes?: unknown };
    view.routeStyle = 'curved';
    if (Object.keys(routes).length > 0) view.routes = routes;
    return buildSceneAfresh(project, VIEW);
  };

  it(`keeps ${MOST_CURVES} curves in a container curved`, () => {
    const scene = services(MOST_CURVES);
    expect(scene.relations.every((line) => line.style === 'curved' && !line.rounded)).toBe(true);
  });

  it('draws more than that orthogonal with rounded corners, saying why, the file unchanged', () => {
    const scene = services(MOST_CURVES + 1);
    for (const line of scene.relations) {
      expect(line.rounded).toBe('many');
      expect(line.style).toBeUndefined();
      // Its route is orthogonal, and its spans round its corners.
      for (let at = 1; at < line.route.length; at++) {
        const p = line.route[at - 1] as Point;
        const q = line.route[at] as Point;
        expect(p.x === q.x || p.y === q.y).toBe(true);
      }
      expect(line.curve?.length).toBeGreaterThan(0);
    }
    // The router takes them as automatic orthogonal lines.
    expect(avoidBatchOf(scene).lines).toHaveLength(MOST_CURVES + 1);
  });

  it('keeps a route by hand in its own style', () => {
    const scene = services(MOST_CURVES + 2, { r0: { style: 'curved' } });
    const byHand = lineOf(scene, 'r0');
    expect(byHand.rounded).toBeUndefined();
    expect(byHand.hand).toBeDefined();
    expect(scene.relations.filter((line) => line.rounded === 'many')).toHaveLength(MOST_CURVES + 1);
  });

  it('rounds the corners of an orthogonal route with a radius of 16, less where runs are short', () => {
    const spans = roundedCurve([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 110, y: 100 },
    ]);
    // A straight run, a corner of 16, a run, a corner of 5, the last run.
    expect(spans[0]?.to).toEqual({ x: 100 - CORNER_RADIUS, y: 0 });
    expect(spans[1]?.to).toEqual({ x: 100, y: CORNER_RADIUS });
    expect(spans[3]?.from).toEqual({ x: 100, y: 95 });
    expect(spans.at(-1)?.to).toEqual({ x: 110, y: 100 });
  });

  it('counts curves by the container that holds both ends', () => {
    expect(holderKeyOf('a/b/c', 'a/b/d')).toBe('a/b');
    expect(holderKeyOf('a', 'b')).toBe('');
    expect(holderKeyOf('a', 'a/b')).toBe('a');
  });
});
