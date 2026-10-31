/**
 * The physical-space panel's camera (ADR 0076): it turns around a target, at a distance, from an
 * azimuth and an elevation, in perspective with a vertical field of view of 45°. Pure, with no DOM and
 * no three.js, so that the solid worker frames with it and the panel turns with it alike.
 *
 * Azimuth is degrees around +Y, 0 looking from +Z toward −Z; elevation is degrees above the horizon.
 */
import { MAX_SPACE_DISTANCE, spaceMath } from '@visual-anything/core';
import type { SpaceBounds, SpaceCamera, SpacePoint } from '@visual-anything/schema';

/** The panel's vertical field of view, in degrees. */
export const SPACE_FIELD_OF_VIEW = 45;

/** Where the panel looks from when nothing says otherwise: a little to the right, a little above. */
export const DEFAULT_SPACE_DIRECTION: Readonly<Pick<SpaceCamera, 'azimuth' | 'elevation'>> = {
  azimuth: 30,
  elevation: 20,
};

/** The least radius a framing fits, in meters, so that a point alone shows a little around it. */
export const MIN_FRAMED_RADIUS = 0.05;

const RADIANS = Math.PI / 180;

/** Where the camera's eye is, in the coordinates of the element the panel shows. */
export function spaceEye(camera: SpaceCamera): SpacePoint {
  const azimuth = camera.azimuth * RADIANS;
  const elevation = camera.elevation * RADIANS;
  const { target, distance } = camera;
  return {
    x: target.x + distance * Math.sin(azimuth) * Math.cos(elevation),
    y: target.y + distance * Math.sin(elevation),
    z: target.z + distance * Math.cos(azimuth) * Math.cos(elevation),
  };
}

/** A point projected into a frame: from its top left, as shares of its width and height, and how far in front. */
export interface ProjectedPoint {
  x: number;
  y: number;
  /** Along the camera's direction, in meters; at most 0 behind the eye. */
  depth: number;
}

/**
 * Projects points as the panel's camera sees them in frames of this aspect, width over height: the
 * target falls in the middle, (0.5, 0.5); a point behind the eye has a depth of at most 0.
 */
export function spaceProjection(
  camera: SpaceCamera,
  aspect: number,
): (point: SpacePoint) => ProjectedPoint {
  const eye = spaceEye(camera);
  const forward = unit({
    x: camera.target.x - eye.x,
    y: camera.target.y - eye.y,
    z: camera.target.z - eye.z,
  });
  // Right is forward × up, and up is right × forward; elevation stays within ±89°.
  const right = unit({ x: -forward.z, y: 0, z: forward.x });
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  const half = Math.tan((SPACE_FIELD_OF_VIEW / 2) * RADIANS);
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  return (point) => {
    const to = { x: point.x - eye.x, y: point.y - eye.y, z: point.z - eye.z };
    const depth = to.x * forward.x + to.y * forward.y + to.z * forward.z;
    const across = to.x * right.x + to.y * right.y + to.z * right.z;
    const above = to.x * up.x + to.y * up.y + to.z * up.z;
    const scale = depth > 0 ? 1 / (depth * half) : 0;
    return {
      x: 0.5 + (across * scale) / (2 * ratio),
      y: 0.5 - (above * scale) / 2,
      depth,
    };
  };
}

function unit(p: SpacePoint): SpacePoint {
  const length = Math.hypot(p.x, p.y, p.z) || 1;
  return { x: p.x / length, y: p.y / length, z: p.z / length };
}

/** The bounds, along the panel's axes, of a box placed by a matrix (column by column). */
export function boundsPlaced(matrix: readonly number[], bounds: SpaceBounds): SpaceBounds {
  const { min, max } = bounds;
  let low = { x: Infinity, y: Infinity, z: Infinity };
  let high = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) {
        const p = spaceMath.transformPoint(matrix, { x, y, z });
        low = { x: Math.min(low.x, p.x), y: Math.min(low.y, p.y), z: Math.min(low.z, p.z) };
        high = { x: Math.max(high.x, p.x), y: Math.max(high.y, p.y), z: Math.max(high.z, p.z) };
      }
    }
  }
  return { min: low, max: high };
}

/** The bounds of a point alone. */
export function boundsOfPoint(point: SpacePoint): SpaceBounds {
  return { min: point, max: point };
}

/**
 * The camera that shows all of these bounds, looking from `from`'s direction, or the default one:
 * its target at the middle of their union, as far as fits the sphere around it in a view of this
 * aspect, width over height. With no bounds, it looks at the origin as at a point.
 */
export function frameSpace(
  boxes: readonly SpaceBounds[],
  aspect: number,
  from: Pick<SpaceCamera, 'azimuth' | 'elevation'> = DEFAULT_SPACE_DIRECTION,
): SpaceCamera {
  let low = { x: Infinity, y: Infinity, z: Infinity };
  let high = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const { min, max } of boxes) {
    low = { x: Math.min(low.x, min.x), y: Math.min(low.y, min.y), z: Math.min(low.z, min.z) };
    high = { x: Math.max(high.x, max.x), y: Math.max(high.y, max.y), z: Math.max(high.z, max.z) };
  }
  if (boxes.length === 0) {
    low = { x: 0, y: 0, z: 0 };
    high = low;
  }
  const clamp = (value: number) =>
    Math.min(MAX_SPACE_DISTANCE, Math.max(-MAX_SPACE_DISTANCE, value)) || 0;
  const target = {
    x: clamp((low.x + high.x) / 2),
    y: clamp((low.y + high.y) / 2),
    z: clamp((low.z + high.z) / 2),
  };
  const radius = Math.max(
    MIN_FRAMED_RADIUS,
    Math.hypot(high.x - low.x, high.y - low.y, high.z - low.z) / 2,
  );
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const half = (SPACE_FIELD_OF_VIEW / 2) * RADIANS;
  // The narrower of the two half-angles holds the sphere.
  const narrower = Math.min(half, Math.atan(Math.tan(half) * ratio));
  const distance = Math.min(MAX_SPACE_DISTANCE, radius / Math.sin(narrower));
  return { target, azimuth: from.azimuth, elevation: from.elevation, distance };
}
