// @vitest-environment node
/**
 * The physical-space panel's camera (ADR 0076): where its eye is, and the camera that frames bounds,
 * whose view holds every corner of them, for any aspect and direction.
 */
import { spaceMath } from '@visual-anything/core';
import type { SpaceBounds, SpaceCamera, SpacePoint } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MIN_FRAMED_RADIUS,
  SPACE_FIELD_OF_VIEW,
  boundsPlaced,
  frameSpace,
  spaceEye,
  spaceProjection,
} from './camera';

const ORIGIN = { x: 0, y: 0, z: 0 };

function close(a: SpacePoint, b: SpacePoint): void {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
  expect(a.z).toBeCloseTo(b.z, 9);
}

/** Whether a point lies within the camera's view: in front of it, inside both half-angles. */
function inView(camera: SpaceCamera, aspect: number, point: SpacePoint): boolean {
  const eye = spaceEye(camera);
  const forward = normalize(sub(camera.target, eye));
  const right = normalize(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = cross(right, forward);
  const to = sub(point, eye);
  const depth = dot(to, forward);
  const half = Math.tan(((SPACE_FIELD_OF_VIEW / 2) * Math.PI) / 180);
  const slack = 1e-9 * Math.max(1, depth);
  return (
    depth > 0 &&
    Math.abs(dot(to, up)) <= depth * half + slack &&
    Math.abs(dot(to, right)) <= depth * half * aspect + slack
  );
}

const sub = (a: SpacePoint, b: SpacePoint) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: SpacePoint, b: SpacePoint) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: SpacePoint, b: SpacePoint) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const normalize = (a: SpacePoint) => {
  const length = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / length, y: a.y / length, z: a.z / length };
};

function corners({ min, max }: SpaceBounds): SpacePoint[] {
  return [min.x, max.x].flatMap((x) =>
    [min.y, max.y].flatMap((y) => [min.z, max.z].map((z) => ({ x, y, z }))),
  );
}

describe('the panel’s camera', () => {
  it('looks from +Z at azimuth 0, from +X at 90, and from above at a positive elevation', () => {
    const camera = { target: { x: 1, y: 2, z: 3 }, azimuth: 0, elevation: 0, distance: 2 };
    close(spaceEye(camera), { x: 1, y: 2, z: 5 });
    close(spaceEye({ ...camera, azimuth: 90 }), { x: 3, y: 2, z: 3 });
    close(spaceEye({ ...camera, elevation: 30 }), { x: 1, y: 3, z: 3 + Math.sqrt(3) });
  });

  it('projects the target into the middle, right to the right and up to the top', () => {
    const camera = { target: { x: 0, y: 0, z: 0 }, azimuth: 0, elevation: 0, distance: 2 };
    const project = spaceProjection(camera, 2);
    expect(project(ORIGIN)).toEqual({ x: 0.5, y: 0.5, depth: 2 });
    const right = project({ x: 0.1, y: 0, z: 0 });
    const up = project({ x: 0, y: 0.1, z: 0 });
    expect(right.x).toBeGreaterThan(0.5);
    expect(right.y).toBeCloseTo(0.5, 12);
    expect(up.y).toBeLessThan(0.5);
    // A point at the edge of the field of view falls at the frame's edge.
    const top = project({ x: 0, y: 2 * Math.tan((22.5 * Math.PI) / 180), z: 0 });
    expect(top.y).toBeCloseTo(0, 9);
    expect(project({ x: 0, y: 0, z: 3 }).depth).toBeLessThan(0);
  });

  it('places a box by a matrix, as its corners go', () => {
    const turned = spaceMath.matrixOf(
      { x: 10, y: 0, z: 0 },
      { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
    );
    const placed = boundsPlaced(turned, {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 2, y: 1, z: 1 },
    });
    close(placed.min, { x: 10, y: 0, z: -2 });
    close(placed.max, { x: 11, y: 1, z: 0 });
  });

  it('frames the middle of what it shows, from the direction asked for', () => {
    const framed = frameSpace([{ min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 2, z: 1 } }], 1, {
      azimuth: -45,
      elevation: 10,
    });
    close(framed.target, { x: 0, y: 1, z: 0 });
    expect(framed.azimuth).toBe(-45);
    expect(framed.elevation).toBe(10);
    expect(framed.distance).toBeCloseTo(Math.sqrt(3) / Math.sin((22.5 * Math.PI) / 180), 9);
  });

  it('frames a point alone, and nothing, as a small ball around it', () => {
    const point = frameSpace([{ min: { x: 3, y: 0, z: 0 }, max: { x: 3, y: 0, z: 0 } }], 2);
    close(point.target, { x: 3, y: 0, z: 0 });
    expect(point.distance).toBeCloseTo(MIN_FRAMED_RADIUS / Math.sin((22.5 * Math.PI) / 180), 9);
    close(frameSpace([], 1).target, ORIGIN);
  });

  it('holds every corner of what it frames in its view, at any aspect and direction', () => {
    const coordinate = fc.double({ min: -1000, max: 1000, noNaN: true });
    const point = fc.record({ x: coordinate, y: coordinate, z: coordinate });
    fc.assert(
      fc.property(
        fc.array(fc.tuple(point, point), { minLength: 1, maxLength: 5 }),
        fc.double({ min: 0.2, max: 5, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.double({ min: -89, max: 89, noNaN: true }),
        (pairs, aspect, azimuth, elevation) => {
          const boxes = pairs.map(([a, b]) => ({
            min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), z: Math.min(a.z, b.z) },
            max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), z: Math.max(a.z, b.z) },
          }));
          const camera = frameSpace(boxes, aspect, { azimuth, elevation });
          return boxes.flatMap(corners).every((corner) => inView(camera, aspect, corner));
        },
      ),
    );
  });
});
