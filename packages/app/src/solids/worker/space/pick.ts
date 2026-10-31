/**
 * Picking in a space (ADR 0076), in the worker and without the GPU: what a pixel of its frames
 * shows, as it was drawn.
 *
 * 1. **Relation lines**, drawn over the solids, answer first, within a few pixels of the page: the
 *    relation, with the point of its line nearest the pixel.
 * 2. Otherwise a ray from the camera through the pixel meets the **solids**, on their pieces' bounding
 *    volume hierarchies (three-mesh-bvh), exploded as they are drawn and on the side a cut keeps; a
 *    solid drawn as its box while the camera moves is met on its box; and the **markers**, on their
 *    pins' place on the screen. The nearest answers, by what it is drawn as: its element, or the
 *    collapsed container it is drawn as, and the point there.
 * 3. What is drawn faintly answers only where nothing else lies under the pixel, so that a faint
 *    container never hides what it holds.
 *
 * The ray is cast relative to the camera's target, as the GPU draws, and its point is answered in the
 * coordinates of the element the panel shows.
 */
import { roundLength } from '@visual-anything/core';
import type { Id, SpaceCamera, SpaceCut, SpacePoint } from '@visual-anything/schema';
import {
  Box3,
  DoubleSide,
  Matrix4,
  Ray,
  Raycaster,
  Sphere,
  Vector2,
  Vector3,
  type BufferGeometry,
} from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { spaceProjection } from '../../../space/camera';
import type { PixelSize, SpaceLine } from '../../protocol';
import type { SpacePicked } from '../host';
import { heightAt } from '../../../space/grid';
import { toSegment } from '../../../space/handles';
import { MARKER_PIN, type SpaceLayout, type SpaceLook } from './layout';
import { keptByCut, lineInFrame } from './overlay';
import { relativeMatrix, spaceThreeCamera } from './stage';

/** How near a line, in pixels of the page, a pick takes it. */
export const LINE_REACH = 4;

/** What {@link pickInSpace} reads. */
export interface PickInput {
  layout: SpaceLayout;
  camera: SpaceCamera;
  size: PixelSize;
  pixelRatio: number;
  lines: readonly SpaceLine[];
  cut: SpaceCut | undefined;
}

/** A geometry's bounds tree, made once and kept on it, as the canvas's picking keeps it. */
export function treeOf(geometry: BufferGeometry): MeshBVH {
  // `indirect` keeps the geometry's own index, which the GPU may already hold, as it is.
  geometry.boundsTree ??= new MeshBVH(geometry, { indirect: true });
  return geometry.boundsTree as MeshBVH;
}

interface Hit {
  look: SpaceLook;
  /** How far in front of the camera, along its direction. */
  depth: number;
  /** In the coordinates of the element the panel shows. */
  point: SpacePoint;
}

/** What lies under the pixel (x, y) of a space's frames, from their top left. */
export function pickInSpace(input: PickInput, x: number, y: number): SpacePicked {
  const line = lineAt(input, x, y);
  if (line) return line;
  const { camera, size, layout, cut } = input;
  const target = camera.target;
  const three = spaceThreeCamera(camera, size.width / size.height);
  const raycaster = new Raycaster();
  raycaster.setFromCamera(new Vector2((x / size.width) * 2 - 1, 1 - (y / size.height) * 2), three);
  const ray = raycaster.ray;
  const forward = three.getWorldDirection(new Vector3());
  const eye = three.position.clone();
  const depthOf = (relative: Vector3) => relative.clone().sub(eye).dot(forward);
  const absolute = (relative: Vector3): SpacePoint => ({
    x: relative.x + target.x,
    y: relative.y + target.y,
    z: relative.z + target.z,
  });
  let plain: Hit | undefined;
  let faint: Hit | undefined;
  const offer = (hit: Hit) => {
    if (hit.look.faint) {
      if (!faint || hit.depth < faint.depth) faint = hit;
    } else if (!plain || hit.depth < plain.depth) plain = hit;
  };

  const local = new Ray();
  const inverse = new Matrix4();
  const sphere = new Sphere();
  for (const laid of layout.solids) {
    if (laid.boxed) {
      if (!laid.look) continue;
      const placed = relativeMatrix(laid.matrix.elements, target);
      local.copy(ray).applyMatrix4(inverse.copy(placed).invert());
      const box = new Box3(
        new Vector3(laid.own.min.x, laid.own.min.y, laid.own.min.z),
        new Vector3(laid.own.max.x, laid.own.max.y, laid.own.max.z),
      );
      const met = local.intersectBox(box, new Vector3());
      if (met) {
        const relative = met.applyMatrix4(placed);
        if (keptByCut(absolute(relative), cut)) {
          offer({ look: laid.look, depth: depthOf(relative), point: absolute(relative) });
        }
      }
      continue;
    }
    for (const drawn of laid.pieces) {
      const placed = relativeMatrix(drawn.matrix.elements, target);
      const geometry = drawn.piece.mesh.geometry;
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      if (geometry.boundingSphere) {
        sphere.copy(geometry.boundingSphere).applyMatrix4(placed);
        if (!ray.intersectsSphere(sphere)) continue;
      }
      local.copy(ray).applyMatrix4(inverse.copy(placed).invert());
      // With a cut, what lies behind its faces shows through it: both sides are met.
      const side = cut ? DoubleSide : drawn.piece.side;
      const hits = treeOf(geometry).raycast(local, side);
      let best: Hit | undefined;
      for (const hit of hits) {
        const relative = hit.point.clone().applyMatrix4(placed);
        const point = absolute(relative);
        if (!keptByCut(point, cut)) continue;
        const depth = depthOf(relative);
        if (depth <= 0) continue;
        if (!best || depth < best.depth) best = { look: drawn.look, depth, point };
      }
      if (best) offer(best);
    }
  }

  // Markers, by their pins' place on the screen.
  const project = spaceProjection(camera, size.width / size.height);
  for (const marker of layout.markers) {
    if (!keptByCut(marker.at, cut)) continue;
    const at = project(marker.at);
    if (!(at.depth > 0)) continue;
    const px = at.x * size.width;
    const py = at.y * size.height;
    const tall = MARKER_PIN.height * input.pixelRatio;
    const half = (MARKER_PIN.head * input.pixelRatio) / 2;
    if (x >= px - half && x <= px + half && y >= py - tall && y <= py + 1) {
      offer({ look: marker.look, depth: at.depth, point: marker.at });
    }
  }

  const found: Hit | undefined = plain ?? faint;
  if (!found) return { element: null };
  return { element: found.look.answers, point: rounded(found.point) };
}

/** The relation whose line lies nearest the pixel, within reach. */
function lineAt(input: PickInput, x: number, y: number): SpacePicked | undefined {
  const { camera, size } = input;
  const view = spaceProjection(camera, size.width / size.height);
  const project = (point: SpacePoint) => {
    const projected = view(point);
    return { x: projected.x * size.width, y: projected.y * size.height, depth: projected.depth };
  };
  const near = camera.distance * 1e-3;
  const reach = LINE_REACH * input.pixelRatio;
  let best: { relation: Id; distance: number; point: SpacePoint } | undefined;
  for (const line of input.lines) {
    const ends = lineInFrame(line, project, near);
    if (!ends) continue;
    const distance = toSegment({ x, y }, ends.from, ends.to);
    if (distance > reach || (best && distance >= best.distance)) continue;
    best = { relation: line.relation, distance, point: alongLine(ends, x, y) };
  }
  if (!best) return undefined;
  return { element: null, relation: best.relation, point: rounded(best.point) };
}

/** The point of a line in space under the point of its frame nearest (x, y), perspective-correct. */
function alongLine(
  ends: NonNullable<ReturnType<typeof lineInFrame>>,
  x: number,
  y: number,
): SpacePoint {
  const dx = ends.to.x - ends.from.x;
  const dy = ends.to.y - ends.from.y;
  const length = dx * dx + dy * dy;
  const s =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((x - ends.from.x) * dx + (y - ends.from.y) * dy) / length));
  // The inverse of depth is what varies evenly across the frame.
  const inverse = (1 - s) / ends.from.depth + s / ends.to.depth;
  const t = s / ends.to.depth / inverse;
  const { start, end } = ends;
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
    z: start.z + (end.z - start.z) * t,
  };
}

function rounded(point: SpacePoint): SpacePoint {
  return { x: roundLength(point.x), y: roundLength(point.y), z: roundLength(point.z) };
}

/** Meters for each pixel of the page at a depth, in frames of this height. */
export function metersPerPixel(depth: number, height: number, pixelRatio: number): number {
  return (heightAt(depth) / height) * pixelRatio;
}
