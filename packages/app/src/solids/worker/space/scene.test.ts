// @vitest-environment node
/**
 * The three.js objects a space is drawn with (ADR 0076), checked without a renderer: a solid's pieces
 * drawn together, as one batch over every entry drawing it; looks in the batches' tables; the cut and
 * its caps, boxes, markers at a fixed size on the screen, the ground, the bits' pass, everything placed
 * relative to the camera's target; a change of looks, boxes or the exploded view written in place,
 * never making the scene again; and the drawings and pictures kept until what they draw changes.
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
} from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { DIMMED_ALPHA } from '../../../canvas/colors';
import { THEMES } from '../../../theme/themes';
import { buildSolid, type BuiltSolid } from '../build';
import { SLIDER, SLIDER_HASH } from '../fixtures';
import type { SpaceToDraw } from '../host';
import { SpaceDrawings } from './drawings';
import { armEntry, armSolid, at, spaceToDraw } from './fixtures';
import { SPACE_MARK, explosionOf, layOut, placeOut } from './layout';
import { SpaceScene, type SpaceBatch } from './scene';

let arm: BuiltSolid;
let slider: BuiltSolid;
beforeAll(async () => {
  arm = await armSolid();
  const built = await buildSolid(SLIDER, SLIDER_HASH, {
    decodeImage: () => Promise.resolve(undefined),
  });
  if (!built.ok) throw new Error(built.message);
  slider = built.solid;
});

function sceneOf(space: SpaceToDraw): SpaceScene {
  const scene = new SpaceScene(layOut(space), { cut: space.cut, theme: space.theme });
  scene.place(space.camera, space.size, space.pixelRatio, space.cut);
  return scene;
}

const pieces = (scene: SpaceScene) => scene.batches.filter((each) => each.kind === 'piece');
const only = (scene: SpaceScene, kind: SpaceBatch['kind']) =>
  scene.batches.find((each) => each.kind === kind) as SpaceBatch;
const placeOf = (mesh: InstancedMesh, at: number) => {
  const matrix = new Matrix4();
  mesh.getMatrixAt(at, matrix);
  return new Vector3().setFromMatrixPosition(matrix);
};
/** Every mesh of a scene's batches. */
const meshesOf = (scene: SpaceScene) =>
  scene.batches.flatMap((each) => [
    each.mesh,
    each.seeThrough,
    ...(each.caps ? [each.caps.whole, each.caps.seeThrough] : []),
  ]);

describe('a space’s scene', () => {
  it('draws a solid’s pieces merged, as one batch over every entry drawing it', () => {
    const scene = sceneOf(spaceToDraw(arm, [armEntry('a'), armEntry('b', at(2, 0, 0))]));
    const [batch, ...others] = pieces(scene);
    expect(others).toHaveLength(0);
    expect(batch?.count).toBe(2);
    expect(batch?.mesh.count).toBe(2);
    expect(batch?.group?.merged).toBe(true);
    expect(batch?.group?.pieces).toEqual([0, 1, 2]);
    // The merged geometry is the pieces' at rest, each vertex naming its part's column.
    const vertices = arm.pieces.reduce(
      (sum, piece) => sum + piece.mesh.geometry.getAttribute('position').count,
      0,
    );
    const geometry = batch?.mesh.geometry;
    expect(geometry?.getAttribute('position').count).toBe(vertices);
    expect(new Set(geometry?.getAttribute('lookPart').array)).toEqual(new Set([1, 2, 3]));
    expect(arm.pieces.map((piece) => piece.mesh.geometry)).not.toContain(geometry);
    expect(placeOf(batch?.mesh as InstancedMesh, 1).x).toBe(2);
    expect(scene.marked).toBe(false);
    // One draw for the whole, none for what draws nothing.
    expect(batch?.mesh.visible).toBe(true);
    expect(batch?.seeThrough.visible).toBe(false);
    expect(only(scene, 'box').mesh.visible).toBe(false);
  });

  it('draws a solid of one piece from that piece’s own geometry, its rest in its place', () => {
    const space = {
      ...spaceToDraw(slider, [
        { element: 's', name: 'S', matrix: at(1, 0, 0), solid: SLIDER_HASH },
        { element: 't', name: 'T', matrix: at(3, 0, 0), solid: SLIDER_HASH },
      ]),
      solids: new Map([[SLIDER_HASH, slider]]),
    };
    const [batch] = pieces(sceneOf(space));
    expect(batch?.group?.merged).toBe(false);
    expect(batch?.mesh.geometry).toBe(slider.pieces[0]?.mesh.geometry);
    expect(batch?.count).toBe(2);
    expect(batch?.offsets).toBeUndefined();
  });

  it('writes each look into its batch’s table, marks and fills, leaving the solid’s own alone', () => {
    const scene = sceneOf(
      spaceToDraw(arm, [armEntry('a'), armEntry('b', at(2, 0, 0))], {
        states: { b: { selected: true, fill: '#AA3300' } },
      }),
    );
    const [batch] = pieces(scene);
    const filled = new Color('#AA3300');
    for (const column of [1, 2, 3]) {
      const plain = batch?.table.look(0, column);
      expect(plain?.fill).toBeUndefined();
      expect(plain?.marks).toBe(0);
      const marked = batch?.table.look(1, column);
      expect(marked?.fill?.[0]).toBeCloseTo(filled.r, 6);
      expect(marked?.fill?.[2]).toBeCloseTo(filled.b, 6);
      expect(marked?.marks).toBe(SPACE_MARK.selected);
    }
    expect(batch?.mesh.material).not.toBe(arm.pieces[0]?.studio);
    expect((arm.pieces[0]?.studio as MeshStandardMaterial).color.getHexString()).not.toBe('aa3300');
    expect(scene.marked).toBe(true);
    expect(batch?.inBits).toBe(true);
  });

  it('follows a change of states, boxes and the exploded view in place, never making anything again', () => {
    const entries = [armEntry('a'), armEntry('b', at(2, 0, 0))];
    const space = spaceToDraw(arm, entries);
    const placement = placeOut(space);
    const scene = new SpaceScene(layOut(space, placement), { cut: undefined, theme: 'light' });
    const meshes = meshesOf(scene);
    const materials = meshes.map((mesh) => mesh.material);
    const version = scene.version;

    expect(
      scene.show(layOut({ ...space, states: new Map([['a', { hovered: true }]]) }, placement)),
    ).toBe(true);
    expect(scene.version).toBeGreaterThan(version);
    expect(pieces(scene)[0]?.table.look(0, 1).marks).toBe(SPACE_MARK.hovered);
    expect(scene.marked).toBe(true);

    // Boxed, an entry leaves its batch for the boxes'.
    expect(scene.show(layOut({ ...space, boxed: new Set(['a']) }, placement))).toBe(true);
    expect(pieces(scene)[0]?.count).toBe(1);
    expect(placeOf(pieces(scene)[0]?.mesh as InstancedMesh, 0).x).toBe(0);
    expect(only(scene, 'box').count).toBe(1);
    expect(scene.marked).toBe(false);

    // Exploded, the parts' offsets are written, and the same objects draw them.
    const exploded = { ...space, explode: 1 };
    expect(scene.show(layOut(exploded, placeOut(exploded)))).toBe(true);
    const offsets = explosionOf(arm, 1);
    const written = pieces(scene)[0]?.offsets?.offset(3) ?? [];
    written.forEach((value, at) =>
      expect(value).toBeCloseTo(offsets[2]?.getComponent(at) ?? NaN, 6),
    );
    expect(meshesOf(scene)).toEqual(meshes);
    expect(meshesOf(scene).map((mesh) => mesh.material)).toEqual(materials);

    // A layout of other entries needs a scene of its own.
    const fewer = spaceToDraw(arm, [armEntry('a')]);
    expect(scene.show(layOut(fewer))).toBe(false);
  });

  it('draws what is faint see-through, writing no depth, and leaves it out of the bits’ pass', () => {
    const scene = sceneOf(spaceToDraw(arm, [armEntry('a')], { states: { a: { faint: true } } }));
    const [batch] = pieces(scene);
    expect(batch?.whole).toBe(false);
    expect(batch?.seen).toBe(true);
    expect(batch?.mesh.visible).toBe(false);
    expect(batch?.seeThrough.visible).toBe(true);
    const material = batch?.seeThrough.material as Material;
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(batch?.table.look(0, 1).alpha).toBeCloseTo(DIMMED_ALPHA, 6);
    expect(batch?.table.look(0, 1).faint).toBe(true);
    expect(batch?.inBits).toBe(false);
  });

  it('marks hidden what its states hide, and draws nothing of an entry wholly hidden', () => {
    const scene = sceneOf(
      spaceToDraw(arm, [armEntry('a'), armEntry('b', at(2, 0, 0))], {
        states: { b: { hidden: true } },
      }),
    );
    const [batch] = pieces(scene);
    expect(batch?.count).toBe(1);
    expect(placeOf(batch?.mesh as InstancedMesh, 0).x).toBe(0);
    expect(batch?.table.look(0, 1).hidden).toBe(false);
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
      const cap = each.caps?.whole as InstancedMesh;
      expect(cap.instanceMatrix).toBe(each.mesh.instanceMatrix);
      expect(cap.visible).toBe(true);
      const capMaterial = cap.material as MeshStandardMaterial;
      expect(capMaterial.side).toBe(BackSide);
      expect(capMaterial.color.equals((arm.pieces[0]?.studio as MeshStandardMaterial).color)).toBe(
        true,
      );
      expect(each.bits.clipping).toBe(true);
    }
    // Moving the cut moves its plane, without making the scene again.
    scene.place(space.camera, space.size, 1, { ...cut, at: 0.5 });
    expect(scene.plane?.constant).toBeCloseTo(0.4, 9);
  });

  it('draws a solid boxed while the camera moves as its bounds’ box', () => {
    const scene = sceneOf(
      spaceToDraw(arm, [armEntry('a', at(3, 0, 0))], { boxed: new Set(['a']) }),
    );
    expect(pieces(scene)[0]?.count).toBe(0);
    expect(pieces(scene)[0]?.mesh.visible).toBe(false);
    const box = only(scene, 'box');
    expect(box.count).toBe(1);
    const matrix = new Matrix4();
    box.mesh.getMatrixAt(0, matrix);
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
    const markers = only(scene, 'marker');
    expect(markers.count).toBe(2);
    const colors = markers.mesh.instanceColor?.array as Float32Array;
    expect([...colors.slice(0, 3)]).toEqual([1, 0, 0]);
    const muted = new Color(THEMES.light.shell.colors.textMuted);
    expect(colors[3]).toBeCloseTo(muted.r, 6);
    // Its color is its instance's, never a fill.
    expect(markers.table.look(0, 0).fill).toBeUndefined();
    const scaleAt = () => {
      const matrix = new Matrix4();
      markers.mesh.getMatrixAt(0, matrix);
      return new Vector3().setFromMatrixScale(matrix).y;
    };
    const near = scaleAt();
    scene.place({ ...space.camera, distance: 40 }, space.size, 1, undefined);
    expect(scaleAt() / near).toBeCloseTo(10, 4);
  });

  it('lays the ground under the rest, and hides it from the bits’ pass', () => {
    const scene = sceneOf(spaceToDraw(arm, [armEntry('a')], { states: { a: { hovered: true } } }));
    const [batch] = pieces(scene);
    const mesh = batch?.mesh as InstancedMesh;
    const plain = mesh.material;
    expect(scene.grid.minor.geometry.drawRange.count).toBeGreaterThan(0);
    const during = scene.withBits(() => ({
      material: mesh.material,
      visible: mesh.visible,
      seeThrough: batch?.seeThrough.visible,
      ground: scene.grid.minor.visible,
    }));
    expect(during).toEqual({
      material: batch?.bits,
      visible: true,
      seeThrough: false,
      ground: false,
    });
    expect(mesh.material).toBe(plain);
    expect(scene.grid.minor.visible).toBe(true);
  });

  it('draws in the bits’ pass what is faint but marked, though nothing draws it whole', () => {
    const scene = sceneOf(
      spaceToDraw(arm, [armEntry('a')], { states: { a: { faint: true, selected: true } } }),
    );
    const [batch] = pieces(scene);
    expect(batch?.mesh.visible).toBe(false);
    expect(scene.withBits(() => batch?.mesh.visible)).toBe(true);
    expect(batch?.mesh.visible).toBe(false);
  });

  it('lets go of what it made, never the solid’s geometry nor the pieces merged for it', () => {
    const scene = sceneOf(spaceToDraw(arm, [armEntry('a')]));
    let disposed = 0;
    const geometries = [arm.pieces[0]?.mesh.geometry, pieces(scene)[0]?.mesh.geometry];
    const count = () => (disposed += 1);
    for (const geometry of geometries) geometry?.addEventListener('dispose', count);
    scene.dispose();
    for (const geometry of geometries) geometry?.removeEventListener('dispose', count);
    expect(disposed).toBe(0);
  });
});

describe('the drawings kept', () => {
  it('keeps a space’s scene through changes of camera, states, boxes and the exploded view', () => {
    const drawings = new SpaceDrawings();
    const space = spaceToDraw(arm, [armEntry('a')]);
    const first = drawings.sceneOf(space);
    expect(drawings.sceneOf({ ...space, camera: { ...space.camera, distance: 9 } })).toBe(first);
    expect(drawings.sceneOf({ ...space, states: new Map([['a', { selected: true }]]) })).toBe(
      first,
    );
    expect(first.marked).toBe(true);
    expect(drawings.sceneOf({ ...space, boxed: new Set(['a']) })).toBe(first);
    expect(drawings.sceneOf({ ...space, explode: 1 })).toBe(first);
  });

  it('makes it again when the cut’s side, the theme or what it is made of changes', () => {
    const drawings = new SpaceDrawings();
    const space = spaceToDraw(arm, [armEntry('a')]);
    const first = drawings.sceneOf(space);
    const cut = drawings.sceneOf({ ...space, cut: { axis: 'x', at: 0, keep: 'below' } });
    expect(cut).not.toBe(first);
    expect(drawings.sceneOf({ ...space, cut: { axis: 'x', at: 0.3, keep: 'below' } })).toBe(cut);
    const dark = drawings.sceneOf({ ...space, theme: 'dark' });
    expect(dark).not.toBe(cut);
    expect(
      drawings.sceneOf({ ...space, theme: 'dark', entries: [armEntry('a'), armEntry('b')] }),
    ).not.toBe(dark);
  });

  it('keeps a space’s picture while only its lines, names or handles change', () => {
    const drawings = new SpaceDrawings();
    const space = spaceToDraw(arm, [armEntry('a')]);
    drawings.sceneOf(space);
    let closed = 0;
    const picture = { close: () => (closed += 1) };
    drawings.keepPicture(space, picture);
    const lines = [
      {
        relation: 'r',
        from: { x: 0, y: 0, z: 0 },
        to: { x: 1, y: 0, z: 0 },
        highlighted: true,
      },
    ];
    expect(drawings.pictureOf({ ...space, lines, names: true })).toBe(picture);
    // A change of what the solids show draws them again.
    expect(drawings.pictureOf({ ...space, camera: { ...space.camera, azimuth: 10 } })).toBe(
      undefined,
    );
    const hovered = { ...space, states: new Map([['a', { hovered: true }]]) };
    drawings.sceneOf(hovered);
    expect(drawings.pictureOf(hovered)).toBeUndefined();
    drawings.keepPicture(hovered, { close: () => undefined });
    expect(closed).toBe(1);
    drawings.end(1);
    expect(drawings.pictureOf(hovered)).toBeUndefined();
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
