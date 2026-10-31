/**
 * Where the handles that move and rotate posed elements are in a space's frames (ADR 0076): the
 * worker draws them from this, and the page hit-tests them with the same, so that what is drawn is
 * what is pointed at. Pure, with no three.js, so that the page imports it as the worker does; both
 * project with `space/camera.ts`.
 *
 * - **Moving**: an arrow along each of the handles' three axes, 90 pixels of the page long whatever
 *   the camera's distance, from where they stand.
 * - **Rotating**: a ring around each axis, 70 pixels of the page across its radius, in the plane
 *   square to it.
 *
 * An axis pointing almost straight at the camera is drawn and pointed at all the same; handles behind
 * the camera are not drawn.
 */
import type { Color, SpaceCamera, SpacePoint } from '@visual-anything/schema';
import { spaceProjection } from './camera';
import type { PixelSize, SpaceAxis, SpaceHandles } from '../solids/protocol';
import { heightAt } from './grid';

/** An arrow's length and a ring's radius, in pixels of the page. */
export const HANDLE_LENGTH = 90;
export const HANDLE_RADIUS = 70;
/** How near a handle, in pixels of the page, a pointer points at it. */
export const HANDLE_REACH = 6;
/** How many points a ring is drawn through. */
const RING_POINTS = 48;

export const HANDLE_AXES: readonly SpaceAxis[] = ['x', 'y', 'z'];

/** Each axis's color, in each theme: red, green and blue, as three-dimensional tools draw them. */
export const HANDLE_COLORS: Readonly<Record<'light' | 'dark', Record<SpaceAxis, Color>>> = {
  light: { x: '#C62828', y: '#2E7D32', z: '#1565C0' },
  dark: { x: '#EF5350', y: '#66BB6A', z: '#42A5F5' },
};

/** A handle in a frame: its axis, and the points it is drawn through, in pixels from the top left. */
export interface HandleShape {
  axis: SpaceAxis;
  kind: 'arrow' | 'ring';
  points: { x: number; y: number }[];
}

/** The handles' axes in the coordinates of the element the panel shows, each of unit length. */
export function handleAxes(handles: Pick<SpaceHandles, 'rotation'>): Record<SpaceAxis, SpacePoint> {
  const rotate = (v: SpacePoint): SpacePoint => rotated(v, handles.rotation);
  return {
    x: rotate({ x: 1, y: 0, z: 0 }),
    y: rotate({ x: 0, y: 1, z: 0 }),
    z: rotate({ x: 0, y: 0, z: 1 }),
  };
}

/** The handles as they are drawn in frames of this size from this camera. */
export function handleShapes(
  handles: SpaceHandles,
  camera: SpaceCamera,
  size: PixelSize,
  pixelRatio = 1,
): HandleShape[] {
  const project = spaceProjection(camera, size.width / size.height);
  const at = handles.at;
  const depth = project(at).depth;
  if (!(depth > 0)) return [];
  // Meters for each pixel of the page at the handles' depth.
  const perPixel = (heightAt(depth) / size.height) * pixelRatio;
  const toFrame = (point: SpacePoint) => {
    const projected = project(point);
    return { x: projected.x * size.width, y: projected.y * size.height, depth: projected.depth };
  };
  const axes = handleAxes(handles);
  const shapes: HandleShape[] = [];
  for (const axis of HANDLE_AXES) {
    const direction = axes[axis];
    if (handles.mode === 'move') {
      const length = HANDLE_LENGTH * perPixel;
      const tip = toFrame(add(at, scale(direction, length)));
      if (tip.depth <= 0) continue;
      shapes.push({
        axis,
        kind: 'arrow',
        points: [toFrame(at), tip].map(({ x, y }) => ({ x, y })),
      });
      continue;
    }
    const radius = HANDLE_RADIUS * perPixel;
    const [u, v] = square(direction);
    const points: { x: number; y: number }[] = [];
    let behind = false;
    for (let step = 0; step <= RING_POINTS; step++) {
      const angle = (step / RING_POINTS) * 2 * Math.PI;
      const point = add(
        at,
        add(scale(u, radius * Math.cos(angle)), scale(v, radius * Math.sin(angle))),
      );
      const drawn = toFrame(point);
      if (drawn.depth <= 0) behind = true;
      points.push({ x: drawn.x, y: drawn.y });
    }
    if (!behind) shapes.push({ axis, kind: 'ring', points });
  }
  return shapes;
}

/** The axis whose handle lies under the pixel (x, y), nearest first; none past the reach. */
export function handleAt(
  shapes: readonly HandleShape[],
  x: number,
  y: number,
  pixelRatio = 1,
): SpaceAxis | undefined {
  let best: { axis: SpaceAxis; distance: number } | undefined;
  const reach = HANDLE_REACH * pixelRatio;
  for (const shape of shapes) {
    for (let at = 1; at < shape.points.length; at++) {
      const distance = toSegment(
        { x, y },
        shape.points[at - 1] as { x: number; y: number },
        shape.points[at] as { x: number; y: number },
      );
      if (distance <= reach && (!best || distance < best.distance)) {
        best = { axis: shape.axis, distance };
      }
    }
  }
  return best?.axis;
}

/** The distance from a point to a segment, in pixels. */
export function toSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t =
    length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function add(a: SpacePoint, b: SpacePoint): SpacePoint {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(a: SpacePoint, by: number): SpacePoint {
  return { x: a.x * by, y: a.y * by, z: a.z * by };
}

function cross(a: SpacePoint, b: SpacePoint): SpacePoint {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function unit(a: SpacePoint): SpacePoint {
  const length = Math.hypot(a.x, a.y, a.z) || 1;
  return scale(a, 1 / length);
}

/** Two unit directions square to `axis` and to each other. */
function square(axis: SpacePoint): [SpacePoint, SpacePoint] {
  const other = Math.abs(axis.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const u = unit(cross(axis, other));
  return [u, unit(cross(axis, u))];
}

/** A vector turned by a unit quaternion; as it is without one. */
function rotated(v: SpacePoint, q: SpaceHandles['rotation']): SpacePoint {
  if (!q) return v;
  // v + 2w(q × v) + 2 q × (q × v)
  const axis = { x: q.x, y: q.y, z: q.z };
  const t = scale(cross(axis, v), 2);
  return add(add(v, scale(t, q.w)), cross(axis, t));
}
