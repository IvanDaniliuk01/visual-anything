// @vitest-environment node
/**
 * What the solid worker sets up before it draws or picks (ADR 0075): three.js's camera projects
 * every point where the core's `projectSolidPoint` puts it, so that the scene's points lie where the
 * picture draws them; hidden parts and parts drawn alone; the part buffer's numbers; the key light;
 * and picking with three-mesh-bvh.
 */
import {
  fitSolidCamera,
  projectSolidPoint,
  solidHash,
  type FittedSolidCamera,
} from '@visual-anything/core';
import type { SolidCamera, SpaceBounds } from '@visual-anything/schema';
import fc from 'fast-check';
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { SolidView } from '../protocol';
import { buildSolid, type BuiltSolid } from './build';
import { ARM } from './fixtures';
import {
  keyLightPosition,
  partBufferFrom,
  partBytes,
  pickAt,
  stageView,
  threeCameraFor,
} from './stage';

async function arm(): Promise<BuiltSolid> {
  const result = await buildSolid(ARM, solidHash(ARM), {
    decodeImage: () => Promise.resolve(undefined),
  });
  if (!result.ok) throw new Error(result.message);
  return result.solid;
}

function view(overrides: Partial<SolidView> = {}): SolidView {
  return {
    solid: solidHash(ARM),
    size: { width: 256, height: 256 },
    camera: { azimuth: 0, elevation: 0 },
    lighting: 'studio',
    hidden: [],
    parts: true,
    ...overrides,
  };
}

/** Where three.js's camera puts a point: from 0 to 1 across and down. */
function threeProjects(fitted: FittedSolidCamera, point: readonly [number, number, number]) {
  const ndc = new Vector3(...point).project(threeCameraFor(fitted));
  return { x: (ndc.x + 1) / 2, y: (1 - ndc.y) / 2 };
}

const coordinate = fc.double({ min: -5, max: 5, noNaN: true });
const camera: fc.Arbitrary<SolidCamera> = fc.record(
  {
    azimuth: fc.double({ min: -180, max: 180, noNaN: true }),
    elevation: fc.double({ min: -89, max: 89, noNaN: true }),
    zoom: fc.double({ min: 0.25, max: 16, noNaN: true }),
    projection: fc.constantFrom('perspective' as const, 'orthographic' as const),
  },
  { requiredKeys: ['azimuth', 'elevation'] },
);
const bounds: fc.Arbitrary<SpaceBounds> = fc
  .tuple(coordinate, coordinate, coordinate, fc.double({ min: 0.01, max: 3, noNaN: true }))
  .map(([x, y, z, size]) => ({
    min: { x, y, z },
    max: { x: x + size, y: y + size * 0.7, z: z + size * 0.4 },
  }));

describe('the solid worker’s camera', () => {
  it('projects every point of the bounds it draws where the core’s camera maths puts it', () => {
    fc.assert(
      fc.property(
        bounds,
        camera,
        fc.double({ min: 0.25, max: 4, noNaN: true }),
        fc.tuple(
          fc.double({ min: 0, max: 1, noNaN: true }),
          fc.double({ min: 0, max: 1, noNaN: true }),
          fc.double({ min: 0, max: 1, noNaN: true }),
        ),
        (box, chosen, aspect, [u, v, w]) => {
          const fitted = fitSolidCamera(box, chosen, aspect);
          const point: [number, number, number] = [
            box.min.x + (box.max.x - box.min.x) * u,
            box.min.y + (box.max.y - box.min.y) * v,
            box.min.z + (box.max.z - box.min.z) * w,
          ];
          const core = projectSolidPoint(fitted, point);
          // A camera zoomed into the solid draws only what lies past its near plane.
          fc.pre(core.depth >= fitted.near);
          const three = threeProjects(fitted, point);
          expect(three.x).toBeCloseTo(core.x, 6);
          expect(three.y).toBeCloseTo(core.y, 6);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('keeps the bounds between its near and far planes', () => {
    const box: SpaceBounds = { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } };
    for (const projection of ['perspective', 'orthographic'] as const) {
      const fitted = fitSolidCamera(box, { azimuth: 30, elevation: 20, projection }, 1);
      const three = threeCameraFor(fitted);
      for (const corner of [
        [-1, -1, -1],
        [1, 1, 1],
      ] as const) {
        const ndc = new Vector3(...corner).project(three);
        expect(Math.abs(ndc.z)).toBeLessThan(1);
      }
    }
  });

  it('stands its key light above the camera’s left, as far from the target as the camera', () => {
    const fitted = fitSolidCamera(
      { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
      { azimuth: 30, elevation: 20 },
      1.5,
    );
    const light = keyLightPosition(fitted);
    const fromTarget = light.clone().sub(new Vector3(...fitted.target));
    expect(fromTarget.dot(new Vector3(...fitted.right))).toBeLessThan(0);
    expect(fromTarget.dot(new Vector3(...fitted.up))).toBeGreaterThan(0);
    expect(fromTarget.length()).toBeCloseTo(
      new Vector3(...fitted.eye).distanceTo(new Vector3(...fitted.target)),
    );
  });
});

describe('what a view draws', () => {
  it('draws every piece, fitted to the solid’s bounds', async () => {
    const solid = await arm();
    const staged = stageView(solid, view());
    expect(staged.drawn).toHaveLength(3);
    expect(staged.fitted).toEqual(
      fitSolidCamera(solid.description.bounds, { azimuth: 0, elevation: 0 }, 1),
    );
  });

  it('leaves hidden parts out, but not the parts they hold', async () => {
    const solid = await arm();
    const staged = stageView(solid, view({ hidden: [1] }));
    expect(staged.drawn.map((piece) => piece.part)).toEqual([0, 2]);
    expect(solid.pieces.map((piece) => piece.mesh.visible)).toEqual([true, false, true]);
  });

  it('draws a part alone with the parts it holds, fitted to their bounds', async () => {
    const solid = await arm();
    const staged = stageView(solid, view({ only: 1, size: { width: 128, height: 256 } }));
    expect(staged.drawn.map((piece) => piece.part)).toEqual([1, 2]);
    expect(staged.fitted).toEqual(
      fitSolidCamera(solid.partBounds(1), { azimuth: 0, elevation: 0 }, 0.5),
    );
    expect(stageView(solid, view({ only: 1, hidden: [2] })).drawn.map((p) => p.part)).toEqual([1]);
  });
});

describe('the part buffer’s numbers', () => {
  it('writes each part’s index plus one in two bytes, and reads them back from the top row', () => {
    expect(partBytes(-1)).toEqual([0, 0]);
    expect(partBytes(0)).toEqual([0, 1]);
    expect(partBytes(4095)).toEqual([16, 0]);
    // Two rows of two pixels, as WebGL reads them: the bottom row first.
    const pixels = new Uint8Array([
      ...[0, 3, 0, 255],
      ...[0, 0, 0, 0],
      ...[16, 0, 0, 255],
      ...[200, 0, 0, 255],
    ]);
    expect([...partBufferFrom(pixels, 2, 2, 4096)]).toEqual([4096, 0, 3, 0]);
    // A number past the solid's parts reads as none.
    expect([...partBufferFrom(pixels, 2, 2, 2)]).toEqual([0, 0, 0, 0]);
  });
});

describe('picking', () => {
  /** The pixel a point shows at in a view. */
  function pixelOf(solid: BuiltSolid, chosen: SolidView, point: [number, number, number]) {
    const { width, height } = chosen.size;
    const fitted = fitSolidCamera(solid.description.bounds, chosen.camera, width / height);
    const at = projectSolidPoint(fitted, point);
    return { x: at.x * width, y: at.y * height };
  }

  it('finds the innermost named part under a pixel, and the point of the solid there', async () => {
    const solid = await arm();
    const front = view();
    for (const [part, point] of [
      [0, [0.3, 0.1, 0.5]],
      [1, [0, 0.6, 0.1]],
      [2, [0.15, 1.1, 0.05]],
    ] as const) {
      const { x, y } = pixelOf(solid, front, [...point]);
      const picked = pickAt(solid, front, x, y);
      expect(picked.part).toBe(part);
      expect(picked.point?.z).toBeCloseTo(point[2], 3);
    }
  });

  it('picks nothing where nothing is drawn, nor through a hidden part', async () => {
    const solid = await arm();
    expect(pickAt(solid, view(), 2, 2)).toEqual({ part: null });
    const { x, y } = pixelOf(solid, view(), [0, 0.6, 0.1]);
    expect(pickAt(solid, view({ hidden: [1] }), x, y)).toEqual({ part: null });
  });

  it('picks the solid at rest, whatever an animation posed', async () => {
    const solid = await arm();
    solid.nodes[0]?.position.set(10, 0, 0);
    solid.root.updateMatrixWorld(true);
    solid.posed = true;
    const { x, y } = pixelOf(solid, view(), [0, 0.6, 0.1]);
    expect(pickAt(solid, view(), x, y).part).toBe(1);
    expect(solid.posed).toBe(false);
  });
});
