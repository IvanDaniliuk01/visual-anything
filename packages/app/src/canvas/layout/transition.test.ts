import type { ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../../test/sample';
import type { Point, Rect } from '../geometry';
import { buildScene, type ElementShape, type RelationLine, type Scene } from '../scene';
import {
  eased,
  frameAt,
  MAX_ANIMATED_SHAPES,
  retargeted,
  sameGeometry,
  transitionBetween,
} from './transition';

const sample = loadSample();
const VIEW = 'system-overview';
const before = buildScene(sample, VIEW);

/** The sample with some of its shapes stored elsewhere, as a layout would leave them. */
function movedTo(places: Record<string, Point>): Scene {
  const project: ProjectSnapshot = {
    ...sample,
    views: sample.views.map((view) => ({
      ...view,
      positions: view.positions.map((position) =>
        places[position.element] ? { ...position, ...places[position.element] } : position,
      ),
    })),
  };
  return buildScene(project, VIEW);
}

function shapeOf(scene: Scene, element: string): ElementShape {
  return scene.shapes.find((shape) => shape.element === element) as ElementShape;
}

function lineBetween(scene: Scene, from: string, to: string): RelationLine {
  const keys = (element: string) =>
    scene.shapes.filter((shape) => shape.element === element).map((shape) => shape.key);
  return scene.relations.find(
    (line) =>
      line.ends?.from.kind === 'shape' &&
      line.ends.to.kind === 'shape' &&
      keys(from).includes(line.ends.from.key) &&
      keys(to).includes(line.ends.to.key),
  ) as RelationLine;
}

function onBorder(point: Point, rect: Rect): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const inX = point.x >= rect.x - 1e-6 && point.x <= rect.x + rect.width + 1e-6;
  const inY = point.y >= rect.y - 1e-6 && point.y <= rect.y + rect.height + 1e-6;
  return (
    inX &&
    inY &&
    (near(point.x, rect.x) ||
      near(point.x, rect.x + rect.width) ||
      near(point.y, rect.y) ||
      near(point.y, rect.y + rect.height))
  );
}

describe('a layout moving in', () => {
  const after = movedTo({ whatsapp: { x: 40, y: 40 }, 'clinic-booking': { x: 320, y: 64 } });
  const transition = transitionBetween(before, after);

  it('moves each shape from where it was to where it is, keeping its stored offset', () => {
    if (!transition) throw new Error('Nothing moves.');
    const start = frameAt(transition, 0);
    const half = frameAt(transition, 0.5);
    expect(shapeOf(start, 'whatsapp').rect).toEqual(shapeOf(before, 'whatsapp').rect);
    const was = shapeOf(before, 'whatsapp').rect;
    const now = shapeOf(after, 'whatsapp').rect;
    expect(shapeOf(half, 'whatsapp').rect.x).toBeCloseTo((was.x + now.x) / 2);
    expect(shapeOf(half, 'whatsapp').offset).toEqual(shapeOf(after, 'whatsapp').offset);
    // What a moved container holds moves with it, and what did not move stays.
    expect(shapeOf(start, 'appointments-api').rect).toEqual(
      shapeOf(before, 'appointments-api').rect,
    );
    expect(shapeOf(half, 'patient')).toBe(shapeOf(after, 'patient'));
  });

  it('ends on the scene it moves to', () => {
    if (!transition) throw new Error('Nothing moves.');
    expect(frameAt(transition, 1)).toBe(after);
    expect(frameAt(transition, 7)).toBe(after);
  });

  it('routes the relations on moving shapes between their ends as they are in each frame', () => {
    if (!transition) throw new Error('Nothing moves.');
    for (const progress of [0.2, 0.5, 0.8]) {
      const frame = frameAt(transition, progress);
      const line = lineBetween(frame, 'patient', 'whatsapp');
      expect(onBorder(line.from, shapeOf(frame, 'patient').rect)).toBe(true);
      expect(onBorder(line.to, shapeOf(frame, 'whatsapp').rect)).toBe(true);
      expect(line.arrowhead?.tip).toEqual(line.to);
    }
  });

  it('goes on to a scene with other values and colors in the same places, from where it is', () => {
    if (!transition) throw new Error('Nothing moves.');
    // A live update: a new scene, whatsapp recolored and its detail written anew, nothing moved.
    const live: Scene = {
      ...after,
      shapes: after.shapes.map((shape) =>
        shape.element === 'whatsapp' ? { ...shape, fill: '#123456', detail: '● 12 ms' } : shape,
      ),
      relations: after.relations.map((line) => ({ ...line, stroke: '#654321' })),
    };
    expect(sameGeometry(after, live)).toBe(true);
    const next = retargeted(transition, live);
    expect(next.to).toBe(live);
    const half = frameAt(next, 0.5);
    expect(shapeOf(half, 'whatsapp').rect).toEqual(
      shapeOf(frameAt(transition, 0.5), 'whatsapp').rect,
    );
    expect(shapeOf(half, 'whatsapp').fill).toBe('#123456');
    expect(lineBetween(half, 'patient', 'whatsapp').stroke).toBe('#654321');
    expect(frameAt(next, 1)).toBe(live);
  });

  it('tells a scene whose shapes or routes moved from one that only reads otherwise', () => {
    expect(sameGeometry(after, after)).toBe(true);
    expect(sameGeometry(before, after)).toBe(false);
    const grown: Scene = {
      ...after,
      shapes: after.shapes.map((shape) =>
        shape.element === 'patient'
          ? { ...shape, rect: { ...shape.rect, width: shape.rect.width * 2 } }
          : shape,
      ),
    };
    expect(sameGeometry(after, grown)).toBe(false);
    const rerouted: Scene = {
      ...after,
      relations: after.relations.map((line, at) =>
        at === 0
          ? { ...line, route: line.route.map((point) => ({ ...point, y: point.y + 1 })) }
          : line,
      ),
    };
    expect(sameGeometry(after, rerouted)).toBe(false);
    expect(sameGeometry(after, { ...after, shapes: after.shapes.slice(1) })).toBe(false);
    const extended: Scene = {
      ...after,
      shapes: after.shapes.map((shape, at) =>
        at === 0
          ? { ...shape, extent: { ...shape.extent, height: shape.extent.height + 5 } }
          : shape,
      ),
    };
    expect(sameGeometry(after, extended)).toBe(false);
  });

  it('is nothing when nothing moves, or when the view is too large to draw on every frame', () => {
    expect(transitionBetween(before, buildScene({ ...sample }, VIEW))).toBeUndefined();
    const large: Scene = {
      ...after,
      shapes: Array.from({ length: MAX_ANIMATED_SHAPES + 1 }, (_, at) => ({
        ...(after.shapes[0] as ElementShape),
        key: `copy-${at}`,
      })),
    };
    expect(transitionBetween(before, large)).toBeUndefined();
  });
});

describe('eased', () => {
  it('starts at 0, ends at 1, passes the middle at the middle, and never goes back', () => {
    expect(eased(0)).toBe(0);
    expect(eased(1)).toBe(1);
    expect(eased(0.5)).toBe(0.5);
    for (let t = 0; t < 1; t += 0.05) expect(eased(t + 0.05)).toBeGreaterThanOrEqual(eased(t));
  });
});
