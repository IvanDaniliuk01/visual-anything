/**
 * The three.js objects a space is drawn with (ADR 0076), made from its layout without a renderer, so
 * that tests check them in Node; `gpu.ts` draws them.
 *
 * - **Batches**: each group of a solid's pieces drawn together (`merge.ts`) is one `InstancedMesh`
 *   over every entry drawing that solid, so that draws scale with the distinct solids and their
 *   materials, not with their pieces or how often they are drawn; the pieces a solid draws alone are
 *   drawn from the geometry its own meshes hold, which the canvas's pictures share. A jointed
 *   solid's pieces are each drawn alone, so that joints turn each part on its own (ADR 0090).
 * - **Looks** come from a table each batch reads on the GPU (`looks.ts`): an overlay's fill takes the
 *   place of a piece's colors and textures; what is faint, or has an overlay's opacity, is drawn
 *   see-through without writing depth. A change of states, marks, an overlay or of what is boxed
 *   writes the tables and the places of what is drawn ({@link SpaceScene.show}); it never makes an
 *   object or a material again, and nor does a change of camera.
 * - **The cut** keeps one side of a plane across the X, Y or Z axis of what the panel shows; inside
 *   each solid, what the plane opens shows its back faces drawn flat in the solid's colors, so that
 *   the cut looks filled.
 * - **Boxes** stand for the solids drawn as their boxes while the camera moves past the mark.
 * - **Markers** are pins in their colors, sized each frame to keep their size on the screen.
 * - **The ground**, its grid on y = 0, under everything else.
 * - **The bits' pass** (`marks.ts`) draws each batch in a material that writes its looks' marks.
 *
 * Everything is placed relative to the camera's target, from places kept in double precision, so that
 * what lies far from the origin keeps its precision on the GPU.
 */
import type { ThemeName } from '@visual-anything/core';
import type { SpaceBounds, SpaceCamera, SpaceCut, SpacePoint } from '@visual-anything/schema';
import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  DoubleSide,
  FrontSide,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Plane,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Material,
  type PerspectiveCamera,
  type Side,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { spaceProjection } from '../../../space/camera';
import { GRID_REACH, gridOf, heightAt } from '../../../space/grid';
import { THEMES } from '../../../theme/themes';
import type { PixelSize } from '../../protocol';
import type { BuiltSolid } from '../build';
import {
  MARKER_PIN,
  explosionOf,
  middleOf,
  type PlacedLayout,
  type SpaceLook,
  type SpacePlacement,
} from './layout';
import {
  LOOK_PASS,
  LookTable,
  OffsetTable,
  lookDefines,
  lookUniforms,
  seeThrough,
  withLooks,
  type LookPass,
  type LookUniforms,
} from './looks';
import { BITS_FRAGMENT, BITS_VERTEX } from './marks';
import { drawGroupsOf, pieceGroupsOf, type DrawGroup } from './merge';
import { spaceKeyLight, spaceThreeCamera } from './stage';

/** The key light's strength, beside the room's light, as for a solid's picture. */
const KEY_LIGHT = 1.6;
/** The color of a box standing for a solid, and of a marker of no color. */
const NEUTRAL = '#8A96A3';
/** How much stronger every tenth line of the ground is. */
const MAJOR = 2;
/** The most floats a set of the ground's lines takes. */
const GRID_FLOATS = (2 * GRID_REACH + 1) * 2 * 6;

/** How many times any scene has written what it draws, so that each writing has a number of its own. */
let writings = 0;

/** One batch of a space's scene: what it draws, for which instances, and how. */
export interface SpaceBatch {
  readonly kind: 'piece' | 'box' | 'marker';
  /** For pieces, the solid and the group of its pieces drawn. */
  readonly solid?: BuiltSolid;
  readonly group?: DrawGroup;
  /** Draws what is drawn whole; in the bits' pass, everything the pass draws. */
  readonly mesh: InstancedMesh;
  /** Draws what is see-through. */
  readonly seeThrough: InstancedMesh;
  /** What draws the inside a cut opens, whole and see-through; only while there is a cut. */
  readonly caps?: { readonly whole: InstancedMesh; readonly seeThrough: InstancedMesh };
  /** What the bits' pass draws it in. */
  readonly bits: ShaderMaterial;
  /** The looks of the instances drawn now, row by row. */
  readonly table: LookTable;
  /** How far the exploded view moves each part of merged pieces. */
  readonly offsets?: OffsetTable;
  /** How many instances it draws now. */
  readonly count: number;
  /** Each instance's place in the coordinates of the element the panel shows; markers have none. */
  readonly places: readonly Matrix4[];
  /** Whether what it draws now has marks, is drawn whole, see-through, or in the bits' pass. */
  readonly marked: boolean;
  readonly whole: boolean;
  readonly seen: boolean;
  readonly inBits: boolean;
}

/** What {@link SpaceScene} is made with: the cut's axis and side, where it crosses given each frame. */
export interface SpaceSceneOptions {
  cut: Pick<SpaceCut, 'axis' | 'keep'> | undefined;
  theme: ThemeName;
}

type Writable<T> = { -readonly [K in keyof T]: T[K] };

/** A batch as the scene keeps it: what it reads its instances from, and what it writes. */
interface Kept {
  batch: Writable<SpaceBatch> & { places: Matrix4[] };
  meshes: InstancedMesh[];
  /** How much of its material is drawn before its looks' share. */
  opacity: number;
  /** The columns its pieces read. */
  columns: readonly number[];
  /** What it draws instances of: placed solids, or markers, by index. */
  sources: readonly number[];
  /** Markers' points, by row. */
  points?: SpacePoint[];
  /** The placement its exploded offsets were written for. */
  offsetsFor?: SpacePlacement;
}

/** The materials a batch draws with. */
interface Materials {
  whole: Material;
  seeThrough: Material;
  caps?: { whole: Material; seeThrough: Material };
}

/** A space's objects, placed for each frame. */
export class SpaceScene {
  readonly scene = new Scene();
  readonly key = new DirectionalLight(0xffffff, KEY_LIGHT);
  /** The plane a cut keeps one side of, moved with the camera's target; none without a cut. */
  readonly plane: Plane | undefined;
  readonly grid: { minor: LineSegments; major: LineSegments };
  /** The structure of the placements it draws (`SpacePlacement.structure`). */
  readonly structure: string;
  private readonly kept: Kept[] = [];
  private readonly owned: { dispose(): void }[] = [];
  private readonly fallback: string;
  private placedFrom: SpacePoint | undefined;
  private shown: PlacedLayout;
  private serial = 0;

  constructor(layout: PlacedLayout, options: SpaceSceneOptions) {
    const { cut, theme } = options;
    this.scene.add(this.key, this.key.target);
    this.plane = cut ? planeOf(cut) : undefined;
    this.shown = layout;
    this.structure = layout.placement.structure;
    this.fallback = THEMES[theme].shell.colors.textMuted;
    const planes = this.plane ? [this.plane] : [];
    const { placement } = layout;

    // Pieces: each group of each solid drawn, over every entry drawing it; a jointed solid's pieces
    // each alone, so that joints turn each part on its own (ADR 0090).
    const bySolid = new Map<BuiltSolid, { plain: number[]; jointed: number[] }>();
    placement.solids.forEach((placed, at) => {
      let lists = bySolid.get(placed.solid);
      if (!lists) {
        lists = { plain: [], jointed: [] };
        bySolid.set(placed.solid, lists);
      }
      (placed.entry.jointed ? lists.jointed : lists.plain).push(at);
    });
    const drawn: [BuiltSolid, number[], readonly DrawGroup[]][] = [];
    for (const [solid, { plain, jointed }] of bySolid) {
      if (plain.length > 0) drawn.push([solid, plain, drawGroupsOf(solid)]);
      if (jointed.length > 0) drawn.push([solid, jointed, pieceGroupsOf(solid)]);
    }
    for (const [solid, sources, groups] of drawn) {
      const columnsOfParts = solid.description.parts.length + 1;
      for (const group of groups) {
        const columns = [...new Set(group.pieces.map((at) => (solid.pieces[at]?.part ?? -1) + 1))];
        const table = this.own(new LookTable(group.merged ? columnsOfParts : 1, sources.length));
        const offsets = group.merged ? this.own(new OffsetTable(columnsOfParts)) : undefined;
        const { studio } = group;
        const looks: LookUniforms = {
          table,
          opacity: studio.transparent ? studio.opacity : 1,
          ...(offsets ? { offsets } : { part: 0 }),
        };
        const materials: Materials = {
          whole: this.drawn(studio.clone(), looks, planes, LOOK_PASS.whole),
          seeThrough: this.drawn(studio.clone(), looks, planes, LOOK_PASS.seeThrough),
          ...(cut
            ? {
                caps: {
                  whole: this.cap(studio, looks, planes, LOOK_PASS.whole),
                  seeThrough: this.cap(studio, looks, planes, LOOK_PASS.seeThrough),
                },
              }
            : {}),
        };
        this.add(
          'piece',
          group.geometry,
          looks,
          sources,
          materials,
          cut ? DoubleSide : group.side,
          {
            solid,
            group,
            columns: group.merged ? columns : [0],
            ...(offsets ? { offsets } : {}),
          },
        );
      }
    }

    // Boxes, one for each solid that may be drawn as one.
    {
      const table = this.own(new LookTable(1, placement.solids.length));
      const looks: LookUniforms = { table, opacity: 1, part: 0 };
      const plain = () =>
        new MeshStandardMaterial({ color: NEUTRAL, roughness: 0.8, metalness: 0 });
      this.add(
        'box',
        this.own(new BoxGeometry(1, 1, 1)),
        looks,
        placement.solids.map((_, at) => at),
        {
          whole: this.drawn(plain(), looks, planes, LOOK_PASS.whole),
          seeThrough: this.drawn(plain(), looks, planes, LOOK_PASS.seeThrough),
        },
        FrontSide,
        { columns: [0] },
      );
    }

    // Markers, each one's color its own, over a white material.
    {
      const count = placement.markers.length;
      const table = this.own(new LookTable(1, count));
      const looks: LookUniforms = { table, opacity: 1, part: 0 };
      const plain = () =>
        new MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0 });
      const kept = this.add(
        'marker',
        this.own(pinGeometry()),
        looks,
        placement.markers.map((_, at) => at),
        {
          whole: this.drawn(plain(), looks, [], LOOK_PASS.whole),
          seeThrough: this.drawn(plain(), looks, [], LOOK_PASS.seeThrough),
        },
        FrontSide,
        { columns: [0] },
      );
      const colors = new InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 3), 3);
      kept.batch.mesh.instanceColor = colors;
      kept.batch.seeThrough.instanceColor = colors;
      kept.points = [];
    }

    // The ground.
    const { gridLine, gridStrength } = THEMES[theme].canvas;
    const line = (strength: number) => {
      const geometry = this.own(new BufferGeometry());
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(GRID_FLOATS), 3));
      geometry.setDrawRange(0, 0);
      const material = this.own(
        new LineBasicMaterial({
          color: gridLine,
          transparent: true,
          opacity: Math.min(1, strength),
          depthWrite: false,
        }),
      );
      const segments = new LineSegments(geometry, material);
      segments.frustumCulled = false;
      segments.renderOrder = -1;
      this.scene.add(segments);
      return segments;
    };
    this.grid = { minor: line(gridStrength), major: line(gridStrength * MAJOR) };
    this.write(layout);
  }

  /** The batches it draws. */
  get batches(): readonly SpaceBatch[] {
    return this.kept.map((each) => each.batch);
  }

  /** The layout it draws now. */
  get layout(): PlacedLayout {
    return this.shown;
  }

  /** Changes each time what it draws changes, apart from where the camera is, whatever the scene. */
  get version(): number {
    return this.serial;
  }

  /** Whether anything drawn has a mark, so that the marks' passes are needed. */
  get marked(): boolean {
    return this.kept.some((each) => each.batch.marked);
  }

  /**
   * Draws a layout of the same structure from now on, its looks and places written in place, and
   * answers true; or answers false, and draws as it did, for a layout of another structure, which
   * needs a scene of its own.
   */
  show(layout: PlacedLayout): boolean {
    if (layout === this.shown) return true;
    if (layout.placement.structure !== this.structure) return false;
    this.write(layout);
    return true;
  }

  /**
   * Places everything for a frame of this size from this camera: relative to its target, markers
   * at their size on the screen, the ground, the cut's plane where the cut now crosses its axis, and
   * the key light. Answers three.js's camera, relative to the target as well.
   */
  place(
    camera: SpaceCamera,
    size: PixelSize,
    pixelRatio: number,
    cut: SpaceCut | undefined,
  ): PerspectiveCamera {
    const { target } = camera;
    const three = spaceThreeCamera(camera, size.width / size.height);
    const moved =
      !this.placedFrom ||
      this.placedFrom.x !== target.x ||
      this.placedFrom.y !== target.y ||
      this.placedFrom.z !== target.z;
    const relative = new Matrix4();
    if (moved) {
      this.placedFrom = { ...target };
      for (const { batch } of this.kept) {
        if (batch.kind === 'marker') continue;
        batch.places.forEach((place, at) => {
          relative.copy(place);
          const e = relative.elements;
          e[12] = e[12] - target.x;
          e[13] = e[13] - target.y;
          e[14] = e[14] - target.z;
          batch.mesh.setMatrixAt(at, relative);
        });
        batch.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    if (this.plane && cut) {
      const shifted = cut.at - target[cut.axis];
      this.plane.constant = cut.keep === 'below' ? shifted : -shifted;
    }
    // Markers keep their size on the screen.
    const project = spaceProjection(camera, size.width / size.height);
    for (const { batch, points } of this.kept) {
      if (!points || points.length === 0) continue;
      points.forEach((point, at) => {
        const depth = Math.max(project(point).depth, camera.distance * 1e-3);
        const scale = (heightAt(depth) / size.height) * pixelRatio * MARKER_PIN.height;
        relative.makeScale(scale, scale, scale);
        const e = relative.elements;
        e[12] = point.x - target.x;
        e[13] = point.y - target.y;
        e[14] = point.z - target.z;
        batch.mesh.setMatrixAt(at, relative);
      });
      batch.mesh.instanceMatrix.needsUpdate = true;
    }
    // The ground.
    const grid = gridOf(camera);
    for (const [segments, floats] of [
      [this.grid.minor, grid.minor],
      [this.grid.major, grid.major],
    ] as const) {
      const position = segments.geometry.getAttribute('position') as BufferAttribute;
      (position.array as Float32Array).set(floats.subarray(0, GRID_FLOATS));
      position.needsUpdate = true;
      segments.geometry.setDrawRange(0, Math.min(floats.length, GRID_FLOATS) / 3);
    }
    this.key.position.copy(spaceKeyLight(three));
    this.key.target.position.set(0, 0, 0);
    this.key.updateMatrixWorld();
    this.key.target.updateMatrixWorld();
    return three;
  }

  /**
   * Runs `draw` with every batch drawn once in its bits' pass material, and what the pass leaves out,
   * the ground among it, hidden; then puts them back.
   */
  withBits<T>(draw: () => T): T {
    const kept: [Object3D, Material | Material[], boolean][] = [];
    const swap = (object: InstancedMesh | LineSegments, material?: Material, visible = false) => {
      kept.push([object, object.material, object.visible]);
      if (material) object.material = material;
      object.visible = visible;
    };
    for (const { batch } of this.kept) {
      swap(batch.mesh, batch.bits, batch.inBits && batch.count > 0);
      swap(batch.seeThrough);
      if (batch.caps) {
        swap(batch.caps.whole);
        swap(batch.caps.seeThrough);
      }
    }
    swap(this.grid.minor);
    swap(this.grid.major);
    try {
      return draw();
    } finally {
      for (const [object, material, visible] of kept) {
        (object as InstancedMesh).material = material;
        object.visible = visible;
      }
    }
  }

  /** Lets go of what it made: never the solids' geometry, materials or textures. */
  dispose(): void {
    for (const { meshes } of this.kept) for (const mesh of meshes) mesh.dispose();
    for (const each of this.owned) each.dispose();
    this.owned.length = 0;
  }

  // Writing what it draws --------------------------------------------------------------------------

  /** Writes the looks and places of a layout of its structure, each batch's instances drawn first. */
  private write(layout: PlacedLayout): void {
    this.shown = layout;
    this.serial = ++writings;
    this.placedFrom = undefined;
    const markers = new Map(layout.markers.map((marker) => [marker.entry.element, marker]));
    const color = new Color();
    for (const kept of this.kept) {
      const { batch, sources, opacity, columns } = kept;
      if (batch.offsets && batch.solid && kept.offsetsFor !== layout.placement) {
        batch.offsets.write(explosionOf(batch.solid, layout.placement.explode));
        kept.offsetsFor = layout.placement;
      }
      let marked = false;
      let whole = false;
      let seen = false;
      let inBits = false;
      const tally = (look: SpaceLook | undefined): look is SpaceLook => {
        if (!look) return false;
        if (look.marks !== 0) marked = true;
        if (seeThrough(look, opacity)) seen = true;
        else whole = true;
        if (!look.faint || look.marks !== 0) inBits = true;
        return true;
      };
      const places: Matrix4[] = [];
      let row = 0;
      for (const source of sources) {
        if (batch.kind === 'marker') {
          const placed = layout.placement.markers[source];
          const marker = placed && markers.get(placed.entry.element);
          if (!marker || !tally(marker.look)) continue;
          // Its color is its instance's.
          const { answers, faint, alpha, marks } = marker.look;
          batch.table.set(row, 0, { answers, faint, alpha, marks });
          color.set(marker.color ?? this.fallback);
          batch.mesh.instanceColor?.setXYZ(row, color.r, color.g, color.b);
          (kept.points as SpacePoint[])[row] = marker.at;
          row += 1;
          continue;
        }
        const laid = layout.solids[source];
        if (!laid) continue;
        if (batch.kind === 'box') {
          if (!laid.boxed || !tally(laid.look)) continue;
          batch.table.set(row, 0, laid.look);
          places.push(boxPlace(laid.matrix, laid.own));
          row += 1;
          continue;
        }
        if (laid.boxed) continue;
        const group = batch.group as DrawGroup;
        const lookAt = (column: number) => (column === 0 ? laid.look : laid.parts[column - 1]);
        if (group.merged) {
          let any = false;
          for (const column of columns) {
            const look = lookAt(column);
            batch.table.set(row, column, look);
            if (tally(look)) any = true;
          }
          if (!any) continue;
          places.push(laid.matrix);
        } else {
          const index = group.pieces[0] as number;
          const piece = laid.solid.pieces[index];
          const look = piece && lookAt(piece.part + 1);
          if (!tally(look)) continue;
          batch.table.set(row, 0, look);
          places.push(layout.placement.solids[source]?.pieces[index]?.matrix ?? laid.matrix);
        }
        row += 1;
      }
      if (kept.points) {
        kept.points.length = row;
        if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
      }
      batch.table.written();
      batch.places = places;
      batch.count = row;
      batch.marked = marked;
      batch.whole = whole;
      batch.seen = seen;
      batch.inBits = inBits;
      for (const mesh of kept.meshes) mesh.count = row;
      batch.mesh.visible = row > 0 && whole;
      batch.seeThrough.visible = row > 0 && seen;
      if (batch.caps) {
        batch.caps.whole.visible = row > 0 && whole;
        batch.caps.seeThrough.visible = row > 0 && seen;
      }
    }
  }

  // Making it --------------------------------------------------------------------------------------

  private add(
    kind: SpaceBatch['kind'],
    geometry: BufferGeometry,
    looks: LookUniforms,
    sources: readonly number[],
    materials: Materials,
    bitsSide: Side,
    more: { solid?: BuiltSolid; group?: DrawGroup; offsets?: OffsetTable; columns: number[] },
  ): Kept {
    const capacity = Math.max(1, sources.length);
    const mesh = new InstancedMesh(geometry, materials.whole, capacity);
    const shared = (material: Material) => {
      const made = new InstancedMesh(geometry, material, capacity);
      made.instanceMatrix = mesh.instanceMatrix;
      return made;
    };
    const seen = shared(materials.seeThrough);
    const caps = materials.caps && {
      whole: shared(materials.caps.whole),
      seeThrough: shared(materials.caps.seeThrough),
    };
    const meshes = [mesh, seen, ...(caps ? [caps.whole, caps.seeThrough] : [])];
    for (const each of meshes) {
      each.frustumCulled = false;
      each.count = 0;
      this.scene.add(each);
    }
    const bits = this.own(
      new ShaderMaterial({
        uniforms: lookUniforms(looks),
        defines: lookDefines(looks, LOOK_PASS.bits),
        vertexShader: BITS_VERTEX,
        fragmentShader: BITS_FRAGMENT,
        side: bitsSide,
        clipping: this.plane !== undefined,
        clippingPlanes: this.plane ? [this.plane] : [],
        toneMapped: false,
        transparent: false,
        depthTest: true,
        depthWrite: true,
      }),
    );
    const batch: Kept['batch'] = {
      kind,
      ...(more.solid ? { solid: more.solid } : {}),
      ...(more.group ? { group: more.group } : {}),
      mesh,
      seeThrough: seen,
      ...(caps ? { caps } : {}),
      bits,
      table: looks.table,
      ...(more.offsets ? { offsets: more.offsets } : {}),
      count: 0,
      places: [],
      marked: false,
      whole: false,
      seen: false,
      inBits: false,
    };
    const kept: Kept = { batch, meshes, opacity: looks.opacity, columns: more.columns, sources };
    this.kept.push(kept);
    return kept;
  }

  private own<T extends { dispose(): void }>(thing: T): T {
    this.owned.push(thing);
    return thing;
  }

  /** A material of its own, cut by the planes, drawing with looks in a pass. */
  private drawn<T extends Material>(
    material: T,
    looks: LookUniforms,
    planes: Plane[],
    pass: LookPass,
  ): T {
    this.own(material);
    if (pass === LOOK_PASS.seeThrough) {
      material.transparent = true;
      material.depthWrite = false;
    }
    material.clippingPlanes = planes;
    // With a cut, what it opens is drawn by the cap from inside.
    if (planes.length > 0 && material.side === DoubleSide) material.side = FrontSide;
    return withLooks(material, looks, pass);
  }

  /** What draws the inside a cut opens: the back faces, flat, in the piece's colors. */
  private cap(studio: Material, looks: LookUniforms, planes: Plane[], pass: LookPass): Material {
    const source = studio as MeshStandardMaterial;
    const cap = new MeshBasicMaterial({
      color: source.color ?? NEUTRAL,
      map: source.map ?? null,
      side: BackSide,
      opacity: looks.opacity,
    });
    return this.drawn(cap, looks, planes, pass);
  }
}

/** Where a box standing for a solid is: over its bounds, in its entry's place. */
function boxPlace(matrix: Matrix4, own: SpaceBounds): Matrix4 {
  const middle = middleOf(own);
  const sides = new Vector3(
    Math.max(own.max.x - own.min.x, 1e-6),
    Math.max(own.max.y - own.min.y, 1e-6),
    Math.max(own.max.z - own.min.z, 1e-6),
  );
  return matrix
    .clone()
    .multiply(new Matrix4().makeTranslation(middle.x, middle.y, middle.z))
    .multiply(new Matrix4().makeScale(sides.x, sides.y, sides.z));
}

/** The plane a cut keeps one side of, through the camera's target until placed. */
export function planeOf(cut: Pick<SpaceCut, 'axis' | 'keep'>): Plane {
  const normal = new Vector3();
  normal[cut.axis] = cut.keep === 'below' ? -1 : 1;
  return new Plane(normal, 0);
}

/** A pin one unit tall, its point at the origin, its head above it. */
function pinGeometry(): BufferGeometry {
  const radius = MARKER_PIN.head / 2 / MARKER_PIN.height;
  const head = new SphereGeometry(radius, 16, 12);
  head.translate(0, 1 - radius, 0);
  const stem = new ConeGeometry(radius * 0.55, 1 - radius, 12, 1, false);
  // A cone stands on its base with its tip up: turned, its tip is the pin's point.
  stem.rotateX(Math.PI);
  stem.translate(0, (1 - radius) / 2, 0);
  const merged = mergeGeometries([head.toNonIndexed(), stem.toNonIndexed()]);
  head.dispose();
  stem.dispose();
  return merged ?? new BufferGeometry();
}
