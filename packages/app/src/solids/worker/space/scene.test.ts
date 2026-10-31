// @vitest-environment node
/**
 * The three.js objects a space is drawn with (ADR 0076), checked without a renderer: repeated solids
 * as instances of one over the solid's own geometry, looks as materials, the cut and its caps, boxes,
 * markers at a fixed size on the screen, the ground, the bits' pass, everything placed relative to
 * the camera's target; and the drawings kept until what they draw changes.
 */
import {
  BackSide,
  Color,
  FrontSide,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type InstancedMesh,
  type Material,
  type ShaderMaterial,
} from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { DIMMED_ALPHA } from '../../../canvas/colors';
import { THEMES } from '../../../theme/themes';
import type { BuiltSolid } from '../build';
import type { SpaceToDraw } from '../host';
import { SpaceDrawings } from './drawings';
import { armEntry, armSolid, at, spaceToDraw } from './fixtures';
import { SPACE_MARK, layOut } from './layout';
import { SpaceScene } from './scene';

let arm: BuiltSolid;
beforeAll(async () => {
  arm = await armSolid();
});

function sceneOf(space: SpaceToDraw): SpaceScene {
  const scene = new SpaceScene(layOut(space), { cut: space.cut, theme: space.theme });
  scene.place(space.camera, space.size, space.pixelRatio, space.cut);
  return scene;
}

const pieces = (scene: SpaceScene) => scene.instances.filter((each) => each.kind === 'piece');
const placeOf = (mesh: InstancedMesh, at: number) => {
  const matrix = new Matrix4();
  mesh.getMatrixAt(at, matrix);
  return new Vector3().setFromMatrixPosition(matrix);
};

describe('a space’s scene', () => {
  it('draws a solid drawn in several places as instances of its own geometry', () => {
    const scene = sceneOf(spaceToDraw(arm, [armEntry('a'), armEntry('b', at(2, 0, 0))]));
    const drawn = pieces(scene);
    expect(drawn).toHaveLength(3);
    for (const each of drawn) expect(each.mesh.count).toBe(2);
    expect(drawn.map((each) => each.mesh.geometry)).toEqual(
      arm.pieces.map((piece) => piece.mesh.geometry),
    );
    expect(scene.marked).toBe(false);
  });

  it('draws each look apart, marks and fills as their materials say, leaving the solid’s own alone', () => {
    const scene = sceneOf(
      spaceToDraw(arm, [armEntry('a'), armEntry('b', at(2, 0, 0))], {
        states: { b: { selected: true, fill: '#AA3300' } },
      }),
    );
    const drawn = pieces(scene);
    expect(drawn).toHaveLength(6);
    const filled = drawn.filter((each) => each.look.fill === '#AA3300');
    expect(filled).toHaveLength(3);
    for (const each of filled) {
      const material = each.mesh.material as MeshStandardMaterial;
      expect(material.color.getHexString()).toBe('aa3300');
      expect(material.map).toBeNull();
      expect(material).not.toBe(arm.pieces[0]?.studio);
      expect((each.bits?.uniforms.bits as { value: number }).value).toBe(SPACE_MARK.selected);
    }
    expect((arm.pieces[0]?.studio as MeshStandardMaterial).color.getHexString()).not.toBe('aa3300');
    expect(scene.marked).toBe(true);
  });

  it('draws what is faint see-through, writing no depth, and leaves it out of the bits’ pass', () => {
    const scene = sceneOf(spaceToDraw(arm, [armEntry('a')], { states: { a: { faint: true } } }));
    for (const each of pieces(scene)) {
      const material = each.mesh.material as Material;
      expect(material.transparent).toBe(true);
      expect(material.opacity).toBeCloseTo(DIMMED_ALPHA, 9);
      expect(material.depthWrite).toBe(false);
      expect(each.bits).toBeUndefined();
    }
  });

  it('places everything relative to the camera’s target, keeping precision far away', () => {
    const far = { x: 40_000, y: 0, z: -90_000 };
    const space = spaceToDraw(arm, [armEntry('a', at(far.x + 1, 0, far.z))], {
      camera: { target: { x: far.x, y: 0.6, z: far.z }, azimuth: 0, elevation: 0, distance: 4 },
    });
    const scene = sceneOf(space);
    const place = placeOf(pieces(scene)[0]?.mesh as InstancedMesh, 0);
    expect(place.toArray()).toEqual([1, -0.6000000238418579, 0]);
    // Moved, the camera moves everything again.
    scene.place(
      { ...space.camera, target: { x: far.x + 1, y: 0, z: far.z } },
      space.size,
      1,
      undefined,
    );
    expect(placeOf(pieces(scene)[0]?.mesh as InstancedMesh, 0).toArray()).toEqual([0, 0, 0]);
    // The key light stands above the camera's left.
    expect(scene.key.position.y).toBeGreaterThan(0);
  });

  it('cuts every piece by one plane, and caps what it opens from inside in the piece’s colors', () => {
    const cut = { axis: 'z' as const, at: 0.25, keep: 'below' as const };
    const space = spaceToDraw(arm, [armEntry('a')], {
      cut,
      camera: { target: { x: 0, y: 0.6, z: 0.1 }, azimuth: 0, elevation: 0, distance: 4 },
    });
    const scene = sceneOf(space);
    expect(scene.plane?.normal.toArray()).toEqual([0, 0, -1]);
    expect(scene.plane?.constant).toBeCloseTo(0.15, 9);
    for (const each of pieces(scene)) {
      const material = each.mesh.material as Material;
      expect(material.clippingPlanes).toEqual([scene.plane]);
      expect(material.side).toBe(FrontSide);
      const cap = each.cap as InstancedMesh;
      expect(cap.instanceMatrix).toBe(each.mesh.instanceMatrix);
      const capMaterial = cap.material as MeshStandardMaterial;
      expect(capMaterial.side).toBe(BackSide);
      expect(capMaterial.color.equals((arm.pieces[0]?.studio as MeshStandardMaterial).color)).toBe(
        true,
      );
      expect((each.bits as ShaderMaterial).clipping).toBe(true);
    }
    // Moving the cut moves its plane, without making the scene again.
    scene.place(space.camera, space.size, 1, { ...cut, at: 0.5 });
    expect(scene.plane?.constant).toBeCloseTo(0.4, 9);
  });

  it('draws a solid boxed while the camera moves as its bounds’ box', () => {
    const scene = sceneOf(
      spaceToDraw(arm, [armEntry('a', at(3, 0, 0))], { boxed: new Set(['a']) }),
    );
    expect(pieces(scene)).toHaveLength(0);
    const [box] = scene.instances.filter((each) => each.kind === 'box');
    const matrix = new Matrix4();
    box?.mesh.getMatrixAt(0, matrix);
    const position = new Vector3();
    const scale = new Vector3();
    matrix.decompose(position, new Quaternion(), scale);
    expect(scale.toArray()).toEqual([1, 1.2000000476837158, 1]);
    expect(position.x).toBe(3);
  });

  it('draws markers in their colors, as large on the screen whatever the distance', () => {
    const space = spaceToDraw(arm, [
      { element: 'p', name: 'P', matrix: at(0, 0.6, 0), marker: true, fill: '#FF0000' },
      { element: 'q', name: 'Q', matrix: at(0.5, 0.6, 0), marker: true },
    ]);
    const scene = sceneOf(space);
    const [markers] = scene.instances.filter((each) => each.kind === 'marker');
    const colors = markers?.mesh.instanceColor?.array as Float32Array;
    expect([...colors.slice(0, 3)]).toEqual([1, 0, 0]);
    const muted = new Color(THEMES.light.shell.colors.textMuted);
    expect(colors[3]).toBeCloseTo(muted.r, 6);
    const scaleAt = () => {
      const matrix = new Matrix4();
      markers?.mesh.getMatrixAt(0, matrix);
      return new Vector3().setFromMatrixScale(matrix).y;
    };
    const near = scaleAt();
    scene.place({ ...space.camera, distance: 40 }, space.size, 1, undefined);
    expect(scaleAt() / near).toBeCloseTo(10, 4);
  });

  it('lays the ground under the rest, and hides it from the bits’ pass', () => {
    const scene = sceneOf(spaceToDraw(arm, [armEntry('a')], { states: { a: { hovered: true } } }));
    expect(scene.grid.minor.geometry.drawRange.count).toBeGreaterThan(0);
    const mesh = pieces(scene)[0]?.mesh as InstancedMesh;
    const plain = mesh.material;
    const during = scene.withBits(() => ({
      material: mesh.material,
      ground: scene.grid.minor.visible,
    }));
    expect(during.material).toBe(pieces(scene)[0]?.bits);
    expect(during.ground).toBe(false);
    expect(mesh.material).toBe(plain);
    expect(scene.grid.minor.visible).toBe(true);
  });

  it('lets go of what it made, never the solid’s geometry', () => {
    const scene = sceneOf(spaceToDraw(arm, [armEntry('a')]));
    let disposed = 0;
    const geometry = arm.pieces[0]?.mesh.geometry;
    const count = () => (disposed += 1);
    geometry?.addEventListener('dispose', count);
    scene.dispose();
    geometry?.removeEventListener('dispose', count);
    expect(disposed).toBe(0);
  });
});

describe('the drawings kept', () => {
  it('keeps a space’s scene until what it draws, its cut’s side or its theme changes', () => {
    const drawings = new SpaceDrawings();
    const space = spaceToDraw(arm, [armEntry('a')]);
    const first = drawings.sceneOf(space);
    expect(drawings.sceneOf({ ...space, camera: { ...space.camera, distance: 9 } })).toBe(first);
    expect(drawings.sceneOf({ ...space, cut: { axis: 'x', at: 0, keep: 'below' } })).not.toBe(
      first,
    );
    const cut = drawings.sceneOf({ ...space, cut: { axis: 'x', at: 0, keep: 'below' } });
    expect(drawings.sceneOf({ ...space, cut: { axis: 'x', at: 0.3, keep: 'below' } })).toBe(cut);
    expect(drawings.sceneOf({ ...space, theme: 'dark' })).not.toBe(cut);
    const dark = drawings.sceneOf({ ...space, theme: 'dark' });
    expect(drawings.sceneOf({ ...space, theme: 'dark', explode: 1 })).not.toBe(dark);
    expect(drawings.sceneOf({ ...space, theme: 'dark', explode: 1, states: new Map() })).not.toBe(
      dark,
    );
  });

  it('forgets the spaces that draw a solid let go of, and those that ended', () => {
    const drawings = new SpaceDrawings();
    drawings.sceneOf(spaceToDraw(arm, [armEntry('a')]));
    drawings.sceneOf({ ...spaceToDraw(arm, []), space: 2 });
    expect(drawings.spaces).toEqual([1, 2]);
    drawings.forget(arm);
    expect(drawings.spaces).toEqual([2]);
    drawings.end(2);
    expect(drawings.spaces).toEqual([]);
  });

  it('picks from the layout it draws', () => {
    const drawings = new SpaceDrawings();
    const space = spaceToDraw(arm, [armEntry('a')]);
    expect(drawings.pick(space, 200, 200).element).toBe('a');
  });
});
