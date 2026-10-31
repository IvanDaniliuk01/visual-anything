/**
 * What the solid worker sets up before it draws or picks, without the GPU (ADR 0075), so that tests
 * can check it in Node:
 * - **the camera**, three.js's, made from the core's fitted camera (`fitSolidCamera`), so that the
 *   points the scene places with `projectSolidPoint` lie where the picture draws them;
 * - **what is drawn**: every piece but those of hidden parts, or, for a part drawn on its own, that
 *   part and the parts it holds, fitted to their bounds;
 * - **the key light** of studio lighting, from above the camera's left;
 * - **the part buffer's numbers**, each part's index plus one written into a pixel's red and green
 *   bytes, and read back row by row from the top;
 * - **picking**, a ray through a pixel cast with three-mesh-bvh against what the view draws.
 */
import { fitSolidCamera, roundLength, type FittedSolidCamera } from '@visual-anything/core';
import type { SpaceBounds, SpacePoint } from '@visual-anything/schema';
import {
  OrthographicCamera,
  PerspectiveCamera,
  Raycaster,
  Vector2,
  Vector3,
  type Mesh,
} from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import type { SolidView } from '../protocol';
import type { BuiltSolid, SolidPiece } from './build';

/** A view staged: the core's camera, three.js's, and the pieces it draws. */
export interface StagedView {
  readonly fitted: FittedSolidCamera;
  readonly camera: PerspectiveCamera | OrthographicCamera;
  readonly drawn: readonly SolidPiece[];
}

/** What a view needs to be staged: its size, its camera, its hidden parts and its only part. */
export type StageableView = Pick<SolidView, 'size' | 'camera' | 'hidden' | 'only'>;

/** The bounds a view is fitted to: its only part's and the parts it holds, or the whole solid's. */
export function boundsOfView(solid: BuiltSolid, view: Pick<SolidView, 'only'>): SpaceBounds {
  return view.only === undefined ? solid.description.bounds : solid.partBounds(view.only);
}

/** three.js's camera for the core's fitted camera, looking as it looks and projecting as it does. */
export function threeCameraFor(fitted: FittedSolidCamera): PerspectiveCamera | OrthographicCamera {
  const camera =
    fitted.projection === 'perspective'
      ? new PerspectiveCamera(
          (fitted.fieldOfView * 180) / Math.PI,
          fitted.aspect,
          fitted.near,
          fitted.far,
        )
      : new OrthographicCamera(
          -fitted.halfHeight * fitted.aspect,
          fitted.halfHeight * fitted.aspect,
          fitted.halfHeight,
          -fitted.halfHeight,
          fitted.near,
          fitted.far,
        );
  camera.position.set(...fitted.eye);
  camera.up.set(...fitted.up);
  camera.lookAt(...fitted.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

/** Whether a view draws a piece: not when its part is hidden, nor outside a part drawn alone. */
export function drawsPiece(
  solid: BuiltSolid,
  piece: SolidPiece,
  hidden: ReadonlySet<number>,
  only: number | undefined,
): boolean {
  if (piece.part >= 0 && hidden.has(piece.part)) return false;
  if (only === undefined) return true;
  return piece.part >= 0 && solid.holds(only, piece.part);
}

/** Stages a view of a solid: fits its camera and shows only the pieces it draws. */
export function stageView(solid: BuiltSolid, view: StageableView): StagedView {
  const { width, height } = view.size;
  const fitted = fitSolidCamera(boundsOfView(solid, view), view.camera, width / height);
  const hidden = new Set(view.hidden);
  const drawn: SolidPiece[] = [];
  for (const piece of solid.pieces) {
    const shown = drawsPiece(solid, piece, hidden, view.only);
    piece.mesh.visible = shown;
    if (shown) drawn.push(piece);
  }
  return { fitted, camera: threeCameraFor(fitted), drawn };
}

/**
 * Where studio lighting's key light stands: above the camera's left, a little toward the camera,
 * as far from the target as the camera is.
 */
export function keyLightPosition(fitted: FittedSolidCamera): Vector3 {
  const target = new Vector3(...fitted.target);
  const distance = new Vector3(...fitted.eye).distanceTo(target);
  const direction = new Vector3(...fitted.right)
    .multiplyScalar(-1)
    .add(new Vector3(...fitted.up).multiplyScalar(1.5))
    .add(new Vector3(...fitted.forward).multiplyScalar(-1))
    .normalize();
  return target.add(direction.multiplyScalar(Math.max(distance, 1e-6)));
}

/** The red and green bytes of a part's pixels in the part pass: its index plus one, high byte first. */
export function partBytes(index: number): readonly [number, number] {
  const value = index + 1;
  return [(value >> 8) & 0xff, value & 0xff];
}

/**
 * A part buffer from the part pass's pixels, RGBA read from the bottom row up as WebGL reads them:
 * row by row from the top, 0 for none and a part's index plus one otherwise. A number past the
 * solid's parts, which no part pass writes, reads as none.
 */
export function partBufferFrom(
  pixels: Uint8Array,
  width: number,
  height: number,
  parts: number,
): Uint16Array {
  const data = new Uint16Array(width * height);
  for (let row = 0; row < height; row += 1) {
    const from = (height - 1 - row) * width;
    for (let column = 0; column < width; column += 1) {
      const at = (from + column) * 4;
      const value = ((pixels[at] as number) << 8) | (pixels[at + 1] as number);
      data[row * width + column] = value <= parts ? value : 0;
    }
  }
  return data;
}

/** What lies under a pixel: the innermost named part, and the point of the solid; none when nothing. */
export interface Picked {
  part: number | null;
  point?: SpacePoint;
}

const raycaster = new Raycaster();
raycaster.firstHitOnly = true;

/** Gives a piece's geometry its bounds tree, once, and its mesh the tree's raycast. */
function withTree(mesh: Mesh): Mesh {
  // `indirect` keeps the geometry's own index, which the GPU may already hold, as it is.
  mesh.geometry.boundsTree ??= new MeshBVH(mesh.geometry, { indirect: true });
  mesh.raycast = acceleratedRaycast;
  return mesh;
}

/**
 * Picks what a view draws under the pixel (x, y) from its top left, at rest: a ray from the view's
 * camera through that point, nearest hit first, against the pieces the view draws.
 */
export function pickAt(solid: BuiltSolid, view: StageableView, x: number, y: number): Picked {
  if (solid.posed) solid.toRest();
  const staged = stageView(solid, view);
  const ndc = new Vector2((x / view.size.width) * 2 - 1, 1 - (y / view.size.height) * 2);
  raycaster.setFromCamera(ndc, staged.camera);
  const hits = raycaster.intersectObjects(
    staged.drawn.map((piece) => withTree(piece.mesh)),
    false,
  );
  const hit = hits[0];
  if (!hit) return { part: null };
  const piece = staged.drawn.find((each) => each.mesh === hit.object);
  const part = piece && piece.part >= 0 ? piece.part : null;
  return {
    part,
    point: {
      x: roundLength(hit.point.x),
      y: roundLength(hit.point.y),
      z: roundLength(hit.point.z),
    },
  };
}
