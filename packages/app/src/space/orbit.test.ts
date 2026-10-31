// @vitest-environment node
/**
 * Moving the physical-space panel's camera (ADR 0076): turning, panning, zooming toward a point,
 * the keys, easing between cameras, and that every camera it gives is one a view state takes.
 */
import { checkViewState } from '@visual-anything/core';
import type { SpaceCamera } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { spaceProjection } from './camera';
import {
  cameraAxes,
  cameraBetween,
  cameraKeyOf,
  cameraMovedByKey,
  MIN_SPACE_CAMERA_DISTANCE,
  panByDrag,
  sameCamera,
  turnBy,
  turnByDrag,
  zoomBy,
} from './orbit';

const CAMERA: SpaceCamera = {
  target: { x: 1, y: 0.5, z: -2 },
  azimuth: 30,
  elevation: 20,
  distance: 4,
};
const KEY = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };

describe('moving the panel’s camera', () => {
  it('turns around its target, the azimuth wrapping and the elevation kept within ±89°', () => {
    expect(turnBy(CAMERA, 170, 0).azimuth).toBe(-160);
    expect(turnBy(CAMERA, -220, 0).azimuth).toBe(170);
    expect(turnBy(CAMERA, 0, 100).elevation).toBe(89);
    expect(turnBy(CAMERA, 0, -200).elevation).toBe(-89);
    expect(turnBy(CAMERA, 10, 0).target).toEqual(CAMERA.target);
    // Dragging right turns the space to the right: the camera goes the other way.
    expect(turnByDrag(CAMERA, 10, 0).azimuth).toBeLessThan(CAMERA.azimuth);
    expect(turnByDrag(CAMERA, 0, 10).elevation).toBeGreaterThan(CAMERA.elevation);
  });

  it('pans so that what is at the target follows the pointer', () => {
    const height = 400;
    const aspect = 1.5;
    const before = spaceProjection(CAMERA, aspect)(CAMERA.target);
    const moved = panByDrag(CAMERA, 30, -20, height);
    const after = spaceProjection(moved, aspect)(CAMERA.target);
    expect((after.x - before.x) * height * aspect).toBeCloseTo(30, 6);
    expect((after.y - before.y) * height).toBeCloseTo(-20, 6);
    expect(moved.distance).toBe(CAMERA.distance);
  });

  it('zooms toward a point of the frame, which stays where it is on the screen', () => {
    const aspect = 2;
    const toward = { x: 0.8, y: 0.3, aspect };
    // The point under the pointer on the plane through the target, square to the camera's direction.
    const { right, up } = cameraAxes(CAMERA);
    const half = CAMERA.distance * Math.tan((22.5 * Math.PI) / 180);
    const across = (toward.x - 0.5) * 2 * half * aspect;
    const above = (0.5 - toward.y) * 2 * half;
    const point = {
      x: CAMERA.target.x + right.x * across + up.x * above,
      y: CAMERA.target.y + right.y * across + up.y * above,
      z: CAMERA.target.z + right.z * across + up.z * above,
    };
    expect(spaceProjection(CAMERA, aspect)(point).x).toBeCloseTo(toward.x, 9);
    const zoomed = zoomBy(CAMERA, 0.5, toward);
    expect(zoomed.distance).toBe(2);
    const after = spaceProjection(zoomed, aspect)(point);
    expect(after.x).toBeCloseTo(toward.x, 9);
    expect(after.y).toBeCloseTo(toward.y, 9);
    // Toward the middle, the target stays.
    expect(zoomBy(CAMERA, 2).target).toEqual(CAMERA.target);
    expect(zoomBy(CAMERA, 1e-12).distance).toBe(MIN_SPACE_CAMERA_DISTANCE);
    expect(zoomBy(CAMERA, 0)).toBe(CAMERA);
  });

  it('reads its keys: arrows turn as dragging does, Shift pans, + and − zoom, 0 fits', () => {
    expect(cameraKeyOf({ ...KEY, key: 'ArrowLeft' })).toEqual({
      kind: 'turn',
      azimuth: 15,
      elevation: 0,
    });
    expect(cameraKeyOf({ ...KEY, key: 'ArrowDown' })).toEqual({
      kind: 'turn',
      azimuth: 0,
      elevation: 15,
    });
    expect(cameraKeyOf({ ...KEY, key: 'ArrowRight', shiftKey: true })).toEqual({
      kind: 'pan',
      dx: 1,
      dy: 0,
    });
    expect(cameraKeyOf({ ...KEY, key: '+' })).toEqual({ kind: 'zoom', factor: 0.8 });
    expect(cameraKeyOf({ ...KEY, key: '-' })).toEqual({ kind: 'zoom', factor: 1.25 });
    expect(cameraKeyOf({ ...KEY, key: '0' })).toEqual({ kind: 'fit' });
    expect(cameraKeyOf({ ...KEY, key: 'ArrowLeft', ctrlKey: true })).toBeUndefined();
    expect(cameraKeyOf({ ...KEY, key: 'a' })).toBeUndefined();
    expect(cameraMovedByKey(CAMERA, { kind: 'zoom', factor: 0.8 }, 300).distance).toBeCloseTo(3.2);
    expect(cameraMovedByKey(CAMERA, { kind: 'turn', azimuth: 15, elevation: 0 }, 300).azimuth).toBe(
      45,
    );
  });

  it('eases between cameras the shorter way round, the distance by one factor each step', () => {
    const to: SpaceCamera = {
      target: { x: 3, y: 0.5, z: -2 },
      azimuth: -170,
      elevation: 0,
      distance: 16,
    };
    expect(cameraBetween(CAMERA, to, 0)).toBe(CAMERA);
    expect(cameraBetween(CAMERA, to, 1)).toBe(to);
    const half = cameraBetween(CAMERA, to, 0.5);
    expect(half.target.x).toBeCloseTo(2);
    // From 30° to −170° the shorter way is through 180°.
    expect(half.azimuth).toBeCloseTo(110);
    expect(half.distance).toBeCloseTo(8);
    expect(sameCamera(CAMERA, { ...CAMERA })).toBe(true);
    expect(sameCamera(CAMERA, { ...CAMERA, azimuth: 31 })).toBe(false);
  });

  it('gives only cameras a view state takes, whatever it is asked', () => {
    const number = fc.double({ min: -1e6, max: 1e6, noNaN: true });
    fc.assert(
      fc.property(
        fc.constantFrom('turn', 'pan', 'zoom', 'between'),
        number,
        number,
        fc.double({ min: 1e-6, max: 1e6, noNaN: true }),
        (move, a, b, factor) => {
          let camera: SpaceCamera;
          if (move === 'turn') camera = turnBy(CAMERA, a, b);
          else if (move === 'pan') camera = panByDrag(CAMERA, a, b, 300);
          else if (move === 'zoom') camera = zoomBy(CAMERA, factor, { x: 0.2, y: 0.9, aspect: 1 });
          else camera = cameraBetween(CAMERA, turnBy(CAMERA, a, b), 0.37);
          expect(checkViewState({ view: 'v', space: { camera } })).toMatchObject({ ok: true });
        },
      ),
    );
  });
});
