// @vitest-environment node
/**
 * A solid's pieces drawn together in a space (ADR 0076): merged at rest when they share a material,
 * a side and their attributes, each vertex naming its part's column; drawn alone when too large or
 * alone; and the merged copy let go of with the solid, never its own geometry.
 */
import { Matrix4, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { boxMesh, writeTestSolid } from '../../../../../core/src/test/solids';
import { solidHash } from '@visual-anything/core';
import { buildSolid, type BuiltSolid } from '../build';
import { armSolid } from './fixtures';
import { piecesAtRest } from './layout';
import { MERGE_MOST_VERTICES, drawGroupsOf, forgetMerged } from './merge';

async function built(bytes: Uint8Array): Promise<BuiltSolid> {
  const made = await buildSolid(bytes, solidHash(bytes), {
    decodeImage: () => Promise.resolve(undefined),
  });
  if (!made.ok) throw new Error(made.message);
  return made.solid;
}

let arm: BuiltSolid;
beforeAll(async () => {
  arm = await armSolid();
});

describe('a solid’s pieces drawn together', () => {
  it('merges pieces that draw alike, at rest, each vertex naming its part’s column', () => {
    const [group, ...others] = drawGroupsOf(arm);
    expect(others).toHaveLength(0);
    expect(group?.merged).toBe(true);
    const geometry = group?.geometry;
    const rest = piecesAtRest(arm);
    let base = 0;
    arm.pieces.forEach((piece, index) => {
      const own = piece.mesh.geometry.getAttribute('position');
      for (let vertex = 0; vertex < own.count; vertex++) {
        const expected = new Vector3()
          .fromBufferAttribute(own, vertex)
          .applyMatrix4(rest[index] as Matrix4);
        const merged = new Vector3().fromBufferAttribute(
          geometry?.getAttribute('position') as never,
          base + vertex,
        );
        expect(merged.distanceTo(expected)).toBeLessThan(1e-6);
        expect(geometry?.getAttribute('lookPart').getX(base + vertex)).toBe(piece.part + 1);
      }
      base += own.count;
    });
    // Every triangle of every piece, its corners moved past the pieces before it.
    const corners = arm.pieces.reduce(
      (sum, piece) => sum + (piece.mesh.geometry.index?.count ?? 0),
      0,
    );
    expect(geometry?.index?.count).toBe(corners);
    // Worked out once for each solid.
    expect(drawGroupsOf(arm)).toBe(drawGroupsOf(arm));
  });

  it('draws a piece alone from its own geometry when it is alone or too large to copy', async () => {
    const big = Math.ceil(Math.sqrt(MERGE_MOST_VERTICES)) + 1;
    const positions: number[] = [];
    const indices: number[] = [];
    for (let row = 0; row < big; row++) {
      for (let column = 0; column < big; column++) positions.push(column, 0, row);
    }
    for (let row = 0; row + 1 < big; row++) {
      for (let column = 0; column + 1 < big; column++) {
        const a = row * big + column;
        indices.push(a, a + big, a + 1);
      }
    }
    const solid = await built(
      writeTestSolid({
        nodes: [
          { name: 'large', mesh: 0 },
          { name: 'small', mesh: 1 },
          { name: 'smaller', mesh: 2 },
        ],
        meshes: [
          { positions, indices },
          boxMesh([0, 0, 0], [1, 1, 1]),
          boxMesh([2, 0, 0], [3, 1, 1]),
        ],
      }),
    );
    const groups = drawGroupsOf(solid);
    expect(groups.map((group) => [group.pieces, group.merged])).toEqual([
      [[0], false],
      [[1, 2], true],
    ]);
    expect(groups[0]?.geometry).toBe(solid.pieces[0]?.mesh.geometry);
  });

  it('lets go of the merged copy with the solid, never of the solid’s own geometry', async () => {
    const solid = await armSolid();
    const [group] = drawGroupsOf(solid);
    const disposed: string[] = [];
    group?.geometry.addEventListener('dispose', () => disposed.push('merged'));
    solid.pieces[0]?.mesh.geometry.addEventListener('dispose', () => disposed.push('own'));
    forgetMerged(solid);
    expect(disposed).toEqual(['merged']);
    expect(drawGroupsOf(solid)[0]).not.toBe(group);
  });
});
