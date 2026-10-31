// @vitest-environment node
/**
 * Picking in a space (ADR 0076), on the solids' bounding volume hierarchies and without the GPU: the
 * element under a pixel and the point there, as drawn, exploded, cut and boxed; markers and relation
 * lines pickable; what is faint never hiding what lies behind it; precise far from the origin.
 */
import type { SpaceCamera, SpacePoint } from '@visual-anything/schema';
import { beforeAll, describe, expect, it } from 'vitest';
import { spaceProjection } from '../../../space/camera';
import type { SpaceDrawnEntry } from '../../protocol';
import type { BuiltSolid } from '../build';
import type { SpaceToDraw } from '../host';
import { armEntry, armSolid, at, spaceToDraw } from './fixtures';
import { layOut } from './layout';
import { pickInSpace } from './pick';

let arm: BuiltSolid;
beforeAll(async () => {
  arm = await armSolid();
});

function pick(space: SpaceToDraw, x: number, y: number) {
  return pickInSpace(
    {
      layout: layOut(space),
      camera: space.camera,
      size: space.size,
      pixelRatio: space.pixelRatio,
      lines: space.lines,
      cut: space.cut,
    },
    x,
    y,
  );
}

/** The pixel a point is drawn at. */
function pixelOf(camera: SpaceCamera, point: SpacePoint): [number, number] {
  const projected = spaceProjection(camera, 1)(point);
  return [projected.x * 400, projected.y * 400];
}

const WRIST: SpaceDrawnEntry = {
  element: 'wrist',
  name: 'Wrist',
  matrix: at(0, 0.6, 0),
  part: { of: 'arm', index: 1 },
};

describe('picking in a space', () => {
  it('answers the element whose solid lies under the pixel, and the point there', () => {
    const space = spaceToDraw(arm, [armEntry('arm')]);
    // Straight ahead lies the link's front, 0.1 m in front of the arm's axis.
    expect(pick(space, 200, 200)).toEqual({ element: 'arm', point: { x: 0, y: 0.6, z: 0.1 } });
    expect(pick(space, 5, 5)).toEqual({ element: null });
  });

  it('answers the anchored part a piece stands for, and the collapsed container it is drawn as', () => {
    expect(pick(spaceToDraw(arm, [armEntry('arm'), WRIST]), 200, 200).element).toBe('wrist');
    expect(
      pick(spaceToDraw(arm, [armEntry('arm'), { ...WRIST, as: 'cell' }]), 200, 200).element,
    ).toBe('cell');
    // The base stands for no part: it answers the arm.
    const camera = spaceToDraw(arm, []).camera;
    const [x, y] = pixelOf(camera, { x: 0.3, y: 0.1, z: 0.5 });
    expect(pick(spaceToDraw(arm, [armEntry('arm'), WRIST]), x, y).element).toBe('arm');
  });

  it('keeps its precision far from the origin', () => {
    const far = { x: 40_000, y: 0, z: -90_000 };
    const space = spaceToDraw(arm, [armEntry('arm', at(far.x, far.y, far.z))], {
      camera: { target: { x: far.x, y: 0.6, z: far.z }, azimuth: 0, elevation: 0, distance: 4 },
    });
    expect(pick(space, 200, 200)).toEqual({
      element: 'arm',
      point: { x: 40_000, y: 0.6, z: -89_999.9 },
    });
  });

  it('meets the parts where the exploded view moves them', () => {
    const camera = spaceToDraw(arm, []).camera;
    // The gripper, from 1 m to 1.2 m tall, moves up by 1 m at a factor of 2.
    const [x, y] = pixelOf(camera, { x: 0, y: 2.1, z: 0.05 });
    expect(pick(spaceToDraw(arm, [armEntry('arm')]), x, y).element).toBeNull();
    const exploded = pick(spaceToDraw(arm, [armEntry('arm')], { explode: 2 }), x, y);
    expect(exploded.element).toBe('arm');
    expect(exploded.point?.y).toBeCloseTo(2.1, 3);
  });

  it('meets what a cut keeps, inside the solid where the cut opens it', () => {
    const cut = pick(
      spaceToDraw(arm, [armEntry('arm')], { cut: { axis: 'z', at: 0, keep: 'below' } }),
      200,
      200,
    );
    expect(cut).toEqual({ element: 'arm', point: { x: 0, y: 0.6, z: -0.1 } });
    const gone = pick(
      spaceToDraw(arm, [armEntry('arm')], { cut: { axis: 'y', at: 0.5, keep: 'below' } }),
      200,
      200,
    );
    expect(gone).toEqual({ element: null });
  });

  it('answers what is faint only where nothing else lies under the pixel', () => {
    const space = spaceToDraw(arm, [armEntry('container', at(0, 0, 2)), armEntry('arm')], {
      states: { container: { faint: true } },
    });
    expect(pick(space, 200, 200).element).toBe('arm');
    const alone = spaceToDraw(arm, [armEntry('container', at(0, 0, 2))], {
      states: { container: { faint: true } },
    });
    expect(pick(alone, 200, 200).element).toBe('container');
  });

  it('never answers what is hidden', () => {
    const space = spaceToDraw(arm, [armEntry('arm')], { states: { arm: { hidden: true } } });
    expect(pick(space, 200, 200)).toEqual({ element: null });
  });

  it('meets a solid drawn as its box on its box', () => {
    const space = spaceToDraw(arm, [armEntry('arm')], { boxed: new Set(['arm']) });
    expect(pick(space, 200, 200)).toEqual({ element: 'arm', point: { x: 0, y: 0.6, z: 0.5 } });
  });

  it('picks markers by their pins on the screen', () => {
    const space = spaceToDraw(arm, [
      { element: 'camera', name: 'Camera', matrix: at(1, 0.6, 0), marker: true },
    ]);
    const [x, y] = pixelOf(space.camera, { x: 1, y: 0.6, z: 0 });
    expect(pick(space, x, y - 10)).toEqual({ element: 'camera', point: { x: 1, y: 0.6, z: 0 } });
    expect(pick(space, x, y + 10)).toEqual({ element: null });
    expect(pick(space, x + 20, y - 10)).toEqual({ element: null });
  });

  it('picks a relation’s line before the solids it is drawn over', () => {
    const space = spaceToDraw(arm, [armEntry('arm')], {
      lines: [{ relation: 'r1', from: { x: -1, y: 0.6, z: 0 }, to: { x: 1, y: 0.6, z: 0 } }],
    });
    const picked = pick(space, 200, 202);
    expect(picked.element).toBeNull();
    expect(picked.relation).toBe('r1');
    expect(picked.point?.x).toBeCloseTo(0, 3);
    expect(picked.point?.y).toBeCloseTo(0.6, 3);
    expect(pick(space, 200, 215).element).toBe('arm');
  });
});
