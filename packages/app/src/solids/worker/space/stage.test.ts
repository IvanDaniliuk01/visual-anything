// @vitest-environment node
/**
 * How the solid worker stages a space (ADR 0076): its camera, relative to the point it turns around,
 * looks at that point from where the panel's camera says, and entries move by the same amount, so
 * that what lies far from the origin keeps its precision.
 */
import { spaceMath } from '@visual-anything/core';
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { relativeMatrix, spaceKeyLight, spaceThreeCamera } from './stage';

const FAR = { x: 40_000, y: 12, z: -90_000 };

describe('a space staged for drawing', () => {
  it('puts the camera at its eye less its target, looking at the origin', () => {
    const camera = spaceThreeCamera({ target: FAR, azimuth: 90, elevation: 0, distance: 5 }, 2);
    expect(camera.position.x).toBeCloseTo(5, 9);
    expect(camera.position.y).toBeCloseTo(0, 9);
    expect(camera.position.z).toBeCloseTo(0, 9);
    expect(camera.fov).toBe(45);
    expect(camera.aspect).toBe(2);
    const forward = camera.getWorldDirection(new Vector3());
    expect(forward.x).toBeCloseTo(-1, 9);
    expect(camera.near).toBeCloseTo(0.005, 9);
    expect(camera.far).toBeCloseTo(5000, 9);
  });

  it('moves an entry’s matrix by the target, keeping its turn', () => {
    const turn = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
    const placed = spaceMath.matrixOf({ x: 40_001, y: 12, z: -90_000 }, turn);
    const relative = relativeMatrix(placed, FAR).elements;
    expect(relative.slice(12, 15)).toEqual([1, 0, 0]);
    expect(relative.slice(0, 12)).toEqual(placed.slice(0, 12));
  });

  it('stands the key light above the camera’s left, as far from the target as the camera', () => {
    const camera = spaceThreeCamera(
      { target: { x: 0, y: 0, z: 0 }, azimuth: 0, elevation: 0, distance: 4 },
      1,
    );
    const light = spaceKeyLight(camera);
    expect(light.length()).toBeCloseTo(4, 9);
    expect(light.x).toBeLessThan(0);
    expect(light.y).toBeGreaterThan(0);
    expect(light.z).toBeGreaterThan(0);
  });
});
