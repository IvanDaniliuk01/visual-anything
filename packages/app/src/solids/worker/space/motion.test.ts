// @vitest-environment node
/**
 * Joints moving what they carry, drawn (ADR 0090): an anchored part's motion, given in the coordinates
 * of the element the panel shows, turns its node of its holder's solid, and every node it holds that no
 * element stands for; a solid whose anchored parts are jointed is drawn piece by piece, so that each
 * part turns on its own; names, framing and picking follow the moved parts.
 */
import { Matrix4, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { spaceProjection } from '../../../space/camera';
import type { SpaceDrawnEntry } from '../../protocol';
import type { BuiltSolid } from '../build';
import { armEntry, armSolid, spaceToDraw } from './fixtures';
import { layOut, partMotionsOf, placeOut } from './layout';
import { pickInSpace } from './pick';
import { SpaceScene } from './scene';

let arm: BuiltSolid;
beforeAll(async () => {
  arm = await armSolid();
});

/** A quarter turn about +Z through the link's foot, (0, 0.2, 0), in the arm's coordinates. */
function quarterTurn(pivot = new Vector3(0, 0.2, 0)): Matrix4 {
  return new Matrix4()
    .makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(new Matrix4().makeRotationZ(Math.PI / 2))
    .multiply(new Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
}

/** The link, anchored to the arm's part 1 at its point, turned by `motion`. */
function link(motion?: Matrix4, holderMatrix = new Matrix4()): SpaceDrawnEntry {
  const rest = holderMatrix.clone().multiply(new Matrix4().makeTranslation(0, 0.6, 0));
  const matrix = motion ? motion.clone().multiply(rest) : rest;
  return {
    element: 'link',
    name: 'Link',
    matrix: matrix.toArray(),
    part: { of: 'arm', index: 1 },
    ...(motion ? { motion: motion.toArray() } : {}),
  };
}

const jointedArm = (matrix?: number[]): SpaceDrawnEntry => ({
  ...armEntry('arm', matrix),
  jointed: true,
});

/** Where a piece of a part draws a point of the arm's own coordinates. */
function drawnAt(layout: ReturnType<typeof layOut>, part: number, point: Vector3): Vector3 {
  const piece = layout.solids[0]?.pieces.find((each) => each.piece.part === part);
  if (!piece) throw new Error(`No piece of part ${part}`);
  const rest = new Matrix4().copy(piece.matrix);
  // The piece's matrix includes its rest place: undo it to read the point in the arm's coordinates.
  const atRest = layOut(spaceToDraw(arm, [armEntry('arm')])).solids[0]?.pieces.find(
    (each) => each.piece.part === part,
  );
  const toArm = new Matrix4().copy(atRest?.matrix as Matrix4).invert();
  return point.clone().applyMatrix4(toArm).applyMatrix4(rest);
}

const near = (found: Vector3, x: number, y: number, z: number) => {
  expect(found.x).toBeCloseTo(x, 6);
  expect(found.y).toBeCloseTo(y, 6);
  expect(found.z).toBeCloseTo(z, 6);
};

describe('an anchored part’s motion', () => {
  it('turns its node and the nodes it holds that no element stands for, never its holder’s others', () => {
    const layout = layOut(spaceToDraw(arm, [jointedArm(), link(quarterTurn())]));
    // The link's top, 0.8 m above its foot, lies 0.8 m toward −X once turned a quarter about +Z.
    near(drawnAt(layout, 1, new Vector3(0, 1, 0)), -0.8, 0.2, 0);
    // The gripper, held by the link and standing for no element, turns with it.
    near(drawnAt(layout, 2, new Vector3(0, 1.1, 0)), -0.9, 0.2, 0);
    // The base, held by none of them, stays.
    near(drawnAt(layout, 0, new Vector3(0.5, 0.1, 0)), 0.5, 0.1, 0);
  });

  it('is read in the holder’s solid’s coordinates, wherever the holder is and however it is turned', () => {
    const holder = new Matrix4()
      .makeTranslation(3, 0, -2)
      .multiply(new Matrix4().makeRotationY(Math.PI / 2));
    // The same quarter turn, given in the panel's coordinates.
    const motion = holder.clone().multiply(quarterTurn()).multiply(holder.clone().invert());
    const layout = layOut(spaceToDraw(arm, [jointedArm(holder.toArray()), link(motion, holder)]));
    const top = drawnAt(layout, 1, new Vector3(0, 1, 0));
    near(top, ...new Vector3(-0.8, 0.2, 0).applyMatrix4(holder).toArray());
    const motions = partMotionsOf(
      placeOut(spaceToDraw(arm, [jointedArm(holder.toArray()), link(motion, holder)])).entries,
    );
    const local = motions.get('link') as Matrix4;
    const expected = quarterTurn();
    local.elements.forEach((value, at) =>
      expect(value).toBeCloseTo(expected.elements[at] as number, 9),
    );
  });

  it('keeps its holder’s own motion out of its own: a part moved with its holder stays in place there', () => {
    // The holder turned by a joint above it, and the part with it: the part does not turn in it.
    const above = new Matrix4().makeTranslation(1, 0, 0);
    const holder = above.clone();
    const layout = layOut(
      spaceToDraw(arm, [
        { ...jointedArm(holder.toArray()), motion: above.toArray() },
        link(above, new Matrix4()),
      ]),
    );
    near(drawnAt(layout, 1, new Vector3(0, 1, 0)), 1, 1, 0);
    expect(partMotionsOf(layout.placement.entries).size).toBe(0);
  });

  it('writes the moved part’s name at its moved middle, and frames and picks it there', () => {
    const space = spaceToDraw(arm, [jointedArm(), link(quarterTurn())]);
    const layout = layOut(space);
    const point = layout.drawn.get('link')?.point;
    // The middle of the link and the gripper it holds, 0.5 m from its foot, lies 0.5 m toward −X.
    expect(point?.x).toBeCloseTo(-0.5, 6);
    expect(point?.y).toBeCloseTo(0.2, 6);
    // Straight at the moved link: it answers the pick; where it stood at rest, nothing does.
    // Above the base's top, 0.2 m up, the turned link lies across from 0.1 m to 0.3 m.
    const camera = { target: { x: -0.5, y: 0.25, z: 0 }, azimuth: 0, elevation: 0, distance: 3 };
    const pick = (x: number, y: number) =>
      pickInSpace(
        { layout, camera, size: space.size, pixelRatio: 1, lines: [], cut: undefined },
        x,
        y,
      );
    expect(pick(200, 200).element).toBe('link');
    const project = spaceProjection(camera, 1);
    const rest = project({ x: 0, y: 0.8, z: 0 });
    expect(pick(rest.x * 400, rest.y * 400).element).toBeNull();
  });

  it('draws a jointed solid piece by piece, its places carrying the motion, and a plain one merged', () => {
    const jointed = new SpaceScene(layOut(spaceToDraw(arm, [jointedArm(), link(quarterTurn())])), {
      cut: undefined,
      theme: 'light',
    });
    const pieces = jointed.batches.filter((each) => each.kind === 'piece');
    expect(pieces.every((each) => each.group?.merged === false)).toBe(true);
    expect(pieces).toHaveLength(3);
    const ofLink = pieces.find((each) => each.group?.pieces[0] === 1);
    const place = new Vector3(0, 1, 0).applyMatrix4(ofLink?.places[0] as Matrix4);
    // The link piece's own geometry is at rest in its node: its top, 0.8 m above its foot.
    expect(place.x).toBeLessThan(-0.5);
    const plain = new SpaceScene(layOut(spaceToDraw(arm, [armEntry('arm')])), {
      cut: undefined,
      theme: 'light',
    });
    expect(plain.batches.some((each) => each.kind === 'piece' && each.group?.merged)).toBe(true);
    // Being jointed is part of what a scene is made of; a motion alone is not.
    expect(jointed.structure).not.toBe(plain.structure);
    expect(jointed.structure).toContain('jointed');
    const still = layOut(spaceToDraw(arm, [jointedArm(), link()]));
    expect(jointed.show(still)).toBe(true);
    jointed.dispose();
    plain.dispose();
  });

  it('leaves a part of a holder that is not jointed with its holder', () => {
    const layout = layOut(spaceToDraw(arm, [armEntry('arm'), link(quarterTurn())]));
    near(drawnAt(layout, 1, new Vector3(0, 1, 0)), 0, 1, 0);
  });
});
