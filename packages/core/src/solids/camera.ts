/**
 * The camera's maths (ADR 0075), pure, so that the scene and the solid worker agree to the pixel on
 * where a solid's picture and its parts' points go. A camera looks at a solid from a direction,
 * `azimuth` degrees around +Y (0 looking from +Z, glTF's front) and `elevation` degrees above the
 * horizon, and fits the sphere around its target that holds the solid's bounds, with a margin of 4%,
 * at `zoom` 1.
 */
import type { SolidCamera, SpaceBounds, SpacePoint } from '@visual-anything/schema';

/** The vertical field of view of the perspective projection: 30°. */
export const SOLID_FIELD_OF_VIEW = (30 * Math.PI) / 180;

/** The margin a fitted solid keeps around its bounds, at zoom 1. */
export const SOLID_FIT_MARGIN = 0.04;

/** A solid's own camera when it starts: a three-quarter view. */
export const DEFAULT_SOLID_CAMERA: SolidCamera = { azimuth: 30, elevation: 20 };

/**
 * A solid's camera (ADR 0075): a direction, a zoom, a target and a projection, within their ranges,
 * or `refuse` with why not. The commands refuse with their codes, and the live protocol's turning
 * guidance with a protocol error; it lives here, beside the camera's maths, so that the protocol
 * reads it without the commands.
 */
export function readSolidCamera(
  value: unknown,
  of: string,
  refuse: (message: string) => never,
): SolidCamera {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    refuse(`The camera of ${of}'s solid must be an azimuth and an elevation, at least.`);
  }
  const { azimuth, elevation, zoom, target, projection, ...rest } = value as Record<
    string,
    unknown
  >;
  if (Object.keys(rest).length > 0) {
    refuse(
      `The camera of ${of}'s solid holds only its azimuth, elevation, zoom, target and projection.`,
    );
  }
  const within = (number: unknown, low: number, high: number, what: string): number => {
    if (typeof number !== 'number' || !Number.isFinite(number) || number < low || number > high) {
      refuse(`The ${what} of ${of}'s solid's camera is a number from ${low} to ${high}.`);
    }
    return number;
  };
  const camera: SolidCamera = {
    azimuth: within(azimuth, -180, 180, 'azimuth'),
    elevation: within(elevation, -89, 89, 'elevation'),
  };
  if (zoom !== undefined) camera.zoom = within(zoom, 0.25, 16, 'zoom');
  if (target !== undefined) {
    if (typeof target !== 'object' || target === null || Array.isArray(target)) {
      refuse(`The target of ${of}'s solid's camera is a point: x, y and z.`);
    }
    const { x, y, z, ...more } = target as Record<string, unknown>;
    if (Object.keys(more).length > 0) {
      refuse(`The target of ${of}'s solid's camera is a point: x, y and z.`);
    }
    camera.target = {
      x: within(x, -100_000, 100_000, 'target'),
      y: within(y, -100_000, 100_000, 'target'),
      z: within(z, -100_000, 100_000, 'target'),
    };
  }
  if (projection !== undefined) {
    if (projection !== 'perspective' && projection !== 'orthographic') {
      refuse(`The projection of ${of}'s solid's camera is "perspective" or "orthographic".`);
    }
    camera.projection = projection;
  }
  return camera;
}

type Vector = readonly [number, number, number];

/** A camera fitted to a solid's bounds for a picture of a given aspect, width over height. */
export interface FittedSolidCamera {
  readonly projection: 'perspective' | 'orthographic';
  /** Where it stands, in the solid's space. */
  readonly eye: Vector;
  /** What it looks at. */
  readonly target: Vector;
  /** Its axes: right, up and forward, unit vectors. */
  readonly right: Vector;
  readonly up: Vector;
  readonly forward: Vector;
  /** The vertical field of view, for perspective. */
  readonly fieldOfView: number;
  /** Half the picture's height in meters at the target, for orthographic. */
  readonly halfHeight: number;
  /** The picture's width over its height. */
  readonly aspect: number;
  /** Where depth starts and ends, around the fitted sphere. */
  readonly near: number;
  readonly far: number;
}

/** Where a point of the solid shows in its picture: from 0 to 1 across and down, and its depth. */
export interface SolidPicturePoint {
  readonly x: number;
  readonly y: number;
  /** Its distance in front of the camera, along its forward axis. */
  readonly depth: number;
}

function middleOf(bounds: SpaceBounds): Vector {
  return [
    (bounds.min.x + bounds.max.x) / 2,
    (bounds.min.y + bounds.max.y) / 2,
    (bounds.min.z + bounds.max.z) / 2,
  ];
}

/** The eight corners of a box. */
export function cornersOf(bounds: SpaceBounds): Vector[] {
  const corners: Vector[] = [];
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) corners.push([x, y, z]);
    }
  }
  return corners;
}

/** Fits a camera to a solid's bounds for a picture of `aspect`, width over height. */
export function fitSolidCamera(
  bounds: SpaceBounds,
  camera: SolidCamera,
  aspect: number,
): FittedSolidCamera {
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const target: Vector = camera.target
    ? [camera.target.x, camera.target.y, camera.target.z]
    : middleOf(bounds);
  // The sphere around the target that holds every corner, never smaller than a micrometre.
  let radius = 0;
  for (const corner of cornersOf(bounds)) {
    radius = Math.max(
      radius,
      Math.hypot(corner[0] - target[0], corner[1] - target[1], corner[2] - target[2]),
    );
  }
  radius = Math.max(radius, 1e-6) * (1 + SOLID_FIT_MARGIN);
  const zoom = Math.min(16, Math.max(0.25, camera.zoom ?? 1));
  const azimuth = (clamp(camera.azimuth, -180, 180) * Math.PI) / 180;
  const elevation = (clamp(camera.elevation, -89, 89) * Math.PI) / 180;
  // From the target toward the eye.
  const back: Vector = [
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(azimuth) * Math.cos(elevation),
  ];
  const forward: Vector = [-back[0], -back[1], -back[2]];
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const projection = camera.projection ?? 'perspective';
  // The narrower of the two fields fits the sphere.
  const halfVertical = SOLID_FIELD_OF_VIEW / 2;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * ratio);
  const halfNarrow = Math.min(halfVertical, halfHorizontal);
  const distance =
    projection === 'perspective'
      ? radius / Math.sin(halfNarrow) / zoom
      : (radius * 4) / zoom + radius;
  const halfHeight = (radius / zoom) * (ratio < 1 ? 1 / ratio : 1);
  const eye: Vector = [
    target[0] + back[0] * distance,
    target[1] + back[1] * distance,
    target[2] + back[2] * distance,
  ];
  return {
    projection,
    eye,
    target,
    right,
    up,
    forward,
    fieldOfView: SOLID_FIELD_OF_VIEW,
    halfHeight,
    aspect: ratio,
    near: Math.max(distance - radius * 1.5, distance * 1e-3),
    far: distance + radius * 1.5,
  };
}

/** Where a point of the solid shows in a fitted camera's picture. */
export function projectSolidPoint(
  camera: FittedSolidCamera,
  point: SpacePoint | Vector,
): SolidPicturePoint {
  const p: Vector = Array.isArray(point)
    ? (point as Vector)
    : [(point as SpacePoint).x, (point as SpacePoint).y, (point as SpacePoint).z];
  const d: Vector = [p[0] - camera.eye[0], p[1] - camera.eye[1], p[2] - camera.eye[2]];
  const x = dot(d, camera.right);
  const y = dot(d, camera.up);
  const depth = dot(d, camera.forward);
  let ndcX: number;
  let ndcY: number;
  if (camera.projection === 'perspective') {
    const tan = Math.tan(camera.fieldOfView / 2);
    const z = Math.max(depth, 1e-12);
    ndcX = x / (z * tan * camera.aspect);
    ndcY = y / (z * tan);
  } else {
    ndcX = x / (camera.halfHeight * camera.aspect);
    ndcY = y / camera.halfHeight;
  }
  return { x: (ndcX + 1) / 2, y: (1 - ndcY) / 2, depth };
}

/**
 * Where a solid's point goes on a shape's picture, a rectangle in canvas units: what the scene places
 * relations' ends and names at, and where the solid worker draws the same point.
 */
export function placeSolidPoint(
  camera: FittedSolidCamera,
  point: SpacePoint,
  picture: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  const projected = projectSolidPoint(camera, point);
  return {
    x: picture.x + projected.x * picture.width,
    y: picture.y + projected.y * picture.height,
  };
}

function clamp(value: number, low: number, high: number): number {
  return Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : 0;
}

function dot(a: Vector, b: Vector): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vector, b: Vector): Vector {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v: Vector): Vector {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}
