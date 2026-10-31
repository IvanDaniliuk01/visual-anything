/**
 * The three.js objects a space is drawn with (ADR 0076), made from its layout without a renderer, so
 * that tests check them in Node; `gpu.ts` draws them.
 *
 * - **Repeated solids are instances of one**: each piece of a solid is one `InstancedMesh` for each
 *   look it is drawn in, over the geometry the solid's own mesh holds, so that a solid drawn on the
 *   canvas and in the panel, or many times in the panel, sits on the GPU once.
 * - **Looks**: an overlay's fill takes the place of a piece's colors and textures; what is faint, or
 *   has an overlay's opacity, is drawn see-through without writing depth.
 * - **The cut** keeps one side of a plane across the X, Y or Z axis of what the panel shows; inside
 *   each solid, what the plane opens shows its back faces drawn flat in the solid's colors, so that
 *   the cut looks filled.
 * - **Boxes** stand for the solids drawn as their boxes while the camera moves past the mark.
 * - **Markers** are pins in their colors, sized each frame to keep their size on the screen.
 * - **The ground**, its grid on y = 0, under everything else.
 * - **The bits' pass** (`marks.ts`) draws each object in a material that writes its marks' bits.
 *
 * Everything is placed each frame relative to the camera's target, from places kept in double
 * precision, so that what lies far from the origin keeps its precision on the GPU.
 */
import type { ThemeName } from '@visual-anything/core';
import type { SpaceCamera, SpaceCut } from '@visual-anything/schema';
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
import { THEMES } from '../../../theme/themes';
import type { PixelSize } from '../../protocol';
import { GRID_REACH, gridOf, heightAt } from './grid';
import {
  MARKER_PIN,
  lookKey,
  middleOf,
  type LaidMarker,
  type SpaceLayout,
  type SpaceLook,
} from './layout';
import { BITS_FRAGMENT, BITS_VERTEX } from './marks';
import { spaceKeyLight, spaceThreeCamera } from './stage';

/** The key light's strength, beside the room's light, as for a solid's picture. */
const KEY_LIGHT = 1.6;
/** The color of a box standing for a solid, and of a marker of no color. */
const NEUTRAL = '#8A96A3';
/** How much stronger every tenth line of the ground is. */
const MAJOR = 2;
/** The most floats a set of the ground's lines takes. */
const GRID_FLOATS = (2 * GRID_REACH + 1) * 2 * 6;

/** One instanced object of a space: what it draws, where, and in which look. */
export interface SpaceInstances {
  readonly mesh: InstancedMesh;
  /** What draws the inside a cut opens; only while there is a cut. */
  readonly cap?: InstancedMesh;
  /** Each instance's place in the coordinates of the element the panel shows; markers have none. */
  readonly places: readonly Matrix4[];
  readonly look: SpaceLook;
  /** What the bits' pass draws it in; none when the pass leaves it out. */
  readonly bits?: ShaderMaterial;
  readonly kind: 'piece' | 'box' | 'marker';
}

/** What {@link SpaceScene} is made with: the cut's axis and side, where it crosses given each frame. */
export interface SpaceSceneOptions {
  cut: Pick<SpaceCut, 'axis' | 'keep'> | undefined;
  theme: ThemeName;
}

/** A space's objects, placed for each frame. */
export class SpaceScene {
  readonly scene = new Scene();
  readonly instances: SpaceInstances[] = [];
  readonly key = new DirectionalLight(0xffffff, KEY_LIGHT);
  /** The plane a cut keeps one side of, moved with the camera's target; none without a cut. */
  readonly plane: Plane | undefined;
  readonly grid: { minor: LineSegments; major: LineSegments };
  /** Whether anything drawn has a mark, so that the marks' passes are needed. */
  readonly marked: boolean;
  private readonly owned: { dispose(): void }[] = [];
  private placedFrom: { x: number; y: number; z: number } | undefined;

  constructor(
    readonly layout: SpaceLayout,
    options: SpaceSceneOptions,
  ) {
    const { cut, theme } = options;
    this.scene.add(this.key, this.key.target);
    this.plane = cut ? planeOf(cut) : undefined;
    const planes = this.plane ? [this.plane] : [];

    // Pieces, grouped by solid, piece and look.
    const groups = new Map<
      string,
      { look: SpaceLook; places: Matrix4[]; build: (count: number) => SpaceInstances }
    >();
    const group = (
      key: string,
      look: SpaceLook,
      place: Matrix4,
      build: (count: number, places: Matrix4[]) => SpaceInstances,
    ) => {
      const known = groups.get(key);
      if (known) {
        known.places.push(place);
        return;
      }
      const places = [place];
      groups.set(key, { look, places, build: (count) => build(count, places) });
    };
    const boxGeometry = this.own(new BoxGeometry(1, 1, 1));
    for (const laid of layout.solids) {
      if (laid.boxed) {
        if (!laid.look) continue;
        const look = laid.look;
        const middle = middleOf(laid.own);
        const sides = new Vector3(
          Math.max(laid.own.max.x - laid.own.min.x, 1e-6),
          Math.max(laid.own.max.y - laid.own.min.y, 1e-6),
          Math.max(laid.own.max.z - laid.own.min.z, 1e-6),
        );
        const place = laid.matrix
          .clone()
          .multiply(new Matrix4().makeTranslation(middle.x, middle.y, middle.z))
          .multiply(new Matrix4().makeScale(sides.x, sides.y, sides.z));
        group(`box:${lookKey(look)}`, look, place, (count, places) => {
          const material = this.lookMaterial(
            new MeshStandardMaterial({ color: NEUTRAL, roughness: 0.8, metalness: 0 }),
            look,
            planes,
            true,
          );
          return this.instanced('box', boxGeometry, material, look, places, count, FrontSide);
        });
        continue;
      }
      for (const drawn of laid.pieces) {
        const { piece, look } = drawn;
        group(
          `${laid.solid.hash}:${drawn.index}:${lookKey(look)}`,
          look,
          drawn.matrix,
          (count, places) => {
            const material = this.lookMaterial(piece.studio, look, planes, false);
            const made = this.instanced(
              'piece',
              piece.mesh.geometry,
              material,
              look,
              places,
              count,
              cut ? DoubleSide : piece.side,
            );
            if (!cut) return made;
            const cap = new InstancedMesh(
              piece.mesh.geometry,
              this.capMaterial(piece.studio, look, planes),
              count,
            );
            cap.instanceMatrix = made.mesh.instanceMatrix;
            cap.frustumCulled = false;
            this.scene.add(cap);
            this.owned.push(cap);
            return { ...made, cap };
          },
        );
      }
    }
    for (const { build, places } of groups.values()) this.instances.push(build(places.length));

    // Markers, grouped by look; each one's color its own.
    const pin = this.own(pinGeometry());
    const byLook = new Map<string, LaidMarker[]>();
    for (const marker of layout.markers) {
      const key = `${marker.look.faint}:${marker.look.alpha.toFixed(4)}:${marker.look.marks}`;
      const list = byLook.get(key);
      if (list) list.push(marker);
      else byLook.set(key, [marker]);
    }
    const fallback = THEMES[theme].shell.colors.textMuted;
    for (const list of byLook.values()) {
      const look = (list[0] as LaidMarker).look;
      // Each marker's fill is its instance's color, over a white material.
      const unfilled: SpaceLook = {
        answers: look.answers,
        faint: look.faint,
        alpha: look.alpha,
        marks: look.marks,
      };
      const material = this.lookMaterial(
        new MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0 }),
        unfilled,
        [],
        true,
      );
      const made = this.instanced('marker', pin, material, look, [], list.length, FrontSide);
      const colors = new Float32Array(list.length * 3);
      const color = new Color();
      list.forEach((marker, at) => {
        color.set(marker.color ?? fallback);
        colors.set([color.r, color.g, color.b], at * 3);
      });
      made.mesh.instanceColor = new InstancedBufferAttribute(colors, 3);
      made.mesh.userData.markers = list;
      this.instances.push(made);
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
    this.marked = this.instances.some((each) => each.look.marks !== 0);
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
      for (const each of this.instances) {
        if (each.kind === 'marker') continue;
        each.places.forEach((place, at) => {
          relative.copy(place);
          const e = relative.elements;
          e[12] = e[12] - target.x;
          e[13] = e[13] - target.y;
          e[14] = e[14] - target.z;
          each.mesh.setMatrixAt(at, relative);
        });
        each.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    if (this.plane && cut) {
      const shifted = cut.at - target[cut.axis];
      this.plane.constant = cut.keep === 'below' ? shifted : -shifted;
    }
    // Markers keep their size on the screen.
    const project = spaceProjection(camera, size.width / size.height);
    for (const each of this.instances) {
      if (each.kind !== 'marker') continue;
      const list = each.mesh.userData.markers as LaidMarker[];
      list.forEach((marker, at) => {
        const depth = Math.max(project(marker.at).depth, camera.distance * 1e-3);
        const scale = (heightAt(depth) / size.height) * pixelRatio * MARKER_PIN.height;
        relative.makeScale(scale, scale, scale);
        const e = relative.elements;
        e[12] = marker.at.x - target.x;
        e[13] = marker.at.y - target.y;
        e[14] = marker.at.z - target.z;
        each.mesh.setMatrixAt(at, relative);
      });
      each.mesh.instanceMatrix.needsUpdate = true;
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
   * Runs `draw` with every object in its bits' pass material, and those the pass leaves out, the
   * ground among them, hidden; then puts them back.
   */
  withBits<T>(draw: () => T): T {
    const kept: [Object3D, Material | Material[], boolean][] = [];
    const swap = (object: InstancedMesh | LineSegments, material: Material | undefined) => {
      kept.push([object, object.material, object.visible]);
      if (material) object.material = material;
      else object.visible = false;
    };
    for (const each of this.instances) {
      swap(each.mesh, each.bits);
      if (each.cap) swap(each.cap, undefined);
    }
    swap(this.grid.minor, undefined);
    swap(this.grid.major, undefined);
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
    for (const each of this.instances) each.mesh.dispose();
    for (const each of this.owned) each.dispose();
    this.owned.length = 0;
  }

  private own<T extends { dispose(): void }>(thing: T): T {
    this.owned.push(thing);
    return thing;
  }

  private instanced(
    kind: SpaceInstances['kind'],
    geometry: BufferGeometry,
    material: Material,
    look: SpaceLook,
    places: readonly Matrix4[],
    count: number,
    bitsSide: Side,
  ): SpaceInstances {
    const mesh = new InstancedMesh(geometry, material, count);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    // The pass leaves out what is faint and unmarked, so that it never hides what is inside it.
    const bits =
      look.faint && look.marks === 0 ? undefined : this.bitsMaterial(look.marks, bitsSide);
    return { mesh, places, look, kind, ...(bits ? { bits } : {}) };
  }

  /** A material in a look, from what draws it plainly: its own when `fresh`, else a copy. */
  private lookMaterial(
    studio: Material,
    look: SpaceLook,
    planes: Plane[],
    fresh: boolean,
  ): Material {
    const material = fresh ? studio : studio.clone();
    this.own(material);
    const colored = material as MeshStandardMaterial;
    if (look.fill !== undefined && colored.color) {
      colored.color.set(look.fill);
      colored.map = null;
      colored.vertexColors = false;
    }
    const opacity = (studio.transparent ? studio.opacity : 1) * look.alpha;
    if (opacity < 1) {
      material.transparent = true;
      material.opacity = opacity;
      material.depthWrite = false;
    }
    material.clippingPlanes = planes;
    // With a cut, what it opens is drawn by the cap from inside.
    if (planes.length > 0 && material.side === DoubleSide) material.side = FrontSide;
    material.needsUpdate = true;
    return material;
  }

  /** What draws the inside a cut opens: the back faces, flat, in the piece's colors. */
  private capMaterial(studio: Material, look: SpaceLook, planes: Plane[]): Material {
    const source = studio as MeshStandardMaterial;
    const opacity = (studio.transparent ? studio.opacity : 1) * look.alpha;
    return this.own(
      new MeshBasicMaterial({
        color: look.fill ?? source.color ?? NEUTRAL,
        map: look.fill === undefined ? (source.map ?? null) : null,
        side: BackSide,
        clippingPlanes: planes,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 1,
      }),
    );
  }

  private readonly bitsMaterials = new Map<string, ShaderMaterial>();

  private bitsMaterial(marks: number, side: Side): ShaderMaterial {
    const key = `${marks}:${side}`;
    const known = this.bitsMaterials.get(key);
    if (known) return known;
    const material = this.own(
      new ShaderMaterial({
        uniforms: { bits: { value: marks } },
        vertexShader: BITS_VERTEX,
        fragmentShader: BITS_FRAGMENT,
        side,
        clipping: this.plane !== undefined,
        clippingPlanes: this.plane ? [this.plane] : [],
        toneMapped: false,
        transparent: false,
        depthTest: true,
        depthWrite: true,
      }),
    );
    this.bitsMaterials.set(key, material);
    return material;
  }
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
