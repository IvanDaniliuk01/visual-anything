/**
 * Lines to connection points through the router (ADR 0080's clarification of 2026-10-30, M3c Stage
 * 1), as lines beside rows are since Stage 0b: an automatic orthogonal line that ends at a connection
 * point leaves it straight out of its side, with a stub of 16, and goes around the shapes in its way.
 */
import type { ConnectionPoint, Element, Relation } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { VIEW, tablesProject } from '../../test/tables';
import type { Point, Rect } from '../geometry';
import { segmentThrough } from '../layout/quality';
import { buildSceneAfresh, type ElementShape, type RelationLine, type Scene } from '../scene';
import { STUB } from './avoid';
import { avoidBatchOf, avoidedScene } from './avoided';

const box = (id: string, points?: ConnectionPoint[]): Element => ({
  id,
  component: 'systems.service',
  name: id,
  ...(points ? { appearance: { connectionPoints: points } } : {}),
});

const calls = (id: string, from: string, to: string): Relation => ({
  id,
  relationType: 'systems.communicates-with',
  from,
  to,
});

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

/**
 * A service with a connection point on its right, another with one on its top, and a wall between
 * them that the stand-in route crosses.
 */
function project() {
  return tablesProject({
    tables: [],
    elements: [
      box('source', [{ name: 'out', side: 'right', at: 0.5 }]),
      box('target', [{ name: 'in', side: 'top', at: 0.5 }]),
      box('wall'),
    ],
    relations: [calls('feeds', 'source', 'target')],
    positions: [
      { element: 'source', x: 0, y: 200 },
      { element: 'wall', x: 280, y: 0, width: 80, height: 600 },
      { element: 'target', x: 600, y: 400 },
    ],
  });
}

describe('lines to connection points through the router (ADR 0080)', () => {
  it('are given to the router, leaving their points straight out of their sides', () => {
    const scene = buildSceneAfresh(project(), VIEW);
    const batch = avoidBatchOf(scene);
    const at = batch.drawn.findIndex((line) => line.relation === 'feeds');
    expect(at).toBeGreaterThanOrEqual(0);
    const line = batch.lines[at];
    const source = shapeOf(scene, 'source').rect;
    const target = shapeOf(scene, 'target').rect;
    expect(line?.fromSide).toMatchObject({ way: 1, y: source.y + source.height / 2 });
    expect(line?.toSide).toMatchObject({
      way: -1,
      vertical: true,
      x: target.x + target.width / 2,
    });
  });

  it('go around the shapes in their way, from their points, with a stub of 16', () => {
    const built = buildSceneAfresh(project(), VIEW);
    expect(through(lineOf(built, 'feeds').route, shapeOf(built, 'wall').rect)).toBe(true);
    const scene = avoidedScene(built);
    const route = lineOf(scene, 'feeds').route;
    const source = shapeOf(scene, 'source').rect;
    const target = shapeOf(scene, 'target').rect;
    expect(through(route, shapeOf(scene, 'wall').rect)).toBe(false);
    const [first, second] = route as [Point, Point];
    expect(first).toEqual({ x: source.x + source.width, y: source.y + source.height / 2 });
    expect(second.y).toBe(first.y);
    expect(second.x - first.x).toBeGreaterThanOrEqual(STUB);
    const last = route.at(-1) as Point;
    const before = route.at(-2) as Point;
    expect(last).toEqual({ x: target.x + target.width / 2, y: target.y });
    expect(before.x).toBe(last.x);
    expect(last.y - before.y).toBeGreaterThanOrEqual(STUB);
  });
});
