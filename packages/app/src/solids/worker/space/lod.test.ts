// @vitest-environment node
/**
 * The space's budget (ADR 0076): past 2,000,000 triangles while the camera moves, the farthest
 * solids are drawn as their boxes, as few as bring the rest within the mark.
 */
import { describe, expect, it } from 'vitest';
import { SPACE_TRIANGLE_BUDGET, boxedFrom, type BoxableSolid } from './lod';

const CAMERA = { target: { x: 0, y: 0, z: 0 }, azimuth: 0, elevation: 0, distance: 10 };

function solid(element: string, z: number, triangles: number): BoxableSolid {
  return {
    element,
    triangles,
    bounds: { min: { x: -1, y: -1, z: z - 1 }, max: { x: 1, y: 1, z: z + 1 } },
  };
}

describe('the farthest solids as boxes', () => {
  it('boxes none within the budget', () => {
    const solids = [solid('a', 0, 1_000_000), solid('b', -20, 1_000_000)];
    expect(boxedFrom(solids, CAMERA)).toEqual(new Set());
    expect(SPACE_TRIANGLE_BUDGET).toBe(2_000_000);
  });

  it('boxes the farthest first, until what is left is within the budget', () => {
    // The camera looks from +Z, 10 m out: the one at z = -40 is farthest, then z = -20.
    const solids = [
      solid('near', 5, 900_000),
      solid('middle', -20, 900_000),
      solid('far', -40, 900_000),
      solid('farther', -30, 100),
    ];
    expect(boxedFrom(solids, CAMERA)).toEqual(new Set(['far']));
    expect(boxedFrom(solids, CAMERA, 1_000_000)).toEqual(new Set(['far', 'farther', 'middle']));
  });

  it('never boxes a solid that takes no more than its box', () => {
    const solids = [solid('tiny', -50, 12), solid('big', 0, 3_000_000)];
    expect(boxedFrom(solids, CAMERA)).toEqual(new Set(['big']));
  });
});
