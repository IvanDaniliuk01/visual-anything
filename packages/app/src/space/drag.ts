/**
 * The handles that move and rotate posed elements in the physical-space panel (ADR 0076), driven by
 * the page: what they act on, where they stand, how a drag along an arrow or around a ring moves or
 * turns what they hold, snapped to 1 cm and 15° unless Alt is held, and the poses that one `set-poses`
 * sends when the gesture ends. The worker draws them from `SpaceShown.handles`, and the page hit-tests
 * them with the same `space/handles.ts`. Pure, with no DOM.
 *
 * Only posed elements move: an anchored part's place is its solid's, and the element the panel shows
 * is its origin. A posed element inside another that moves with it is left to it, so nothing moves
 * twice. The handles' axes are those of the container the first element is posed in, so that moving
 * along an arrow changes one of its pose's numbers.
 *
 * While the exploded view is on, the worker draws what the handles hold moved away from where the
 * poses put it, and says by how much (`SpaceFrameReply.shifts`): the handles stand there too
 * ({@link shiftOfHandles}, {@link shiftedHandles}), and a ring turns what they hold about where the
 * poses put it, so that the poses sent keep what is drawn where the gesture left it.
 */
import { spaceMath, type Space } from '@visual-anything/core';
import type { Id, Pose, Rotation, SpaceCamera, SpacePoint } from '@visual-anything/schema';
import type {
  PixelSize,
  SpaceAxis,
  SpaceDrawnEntry,
  SpaceHandles,
  SpaceShift,
} from '../solids/protocol';
import { handleAxes } from './handles';
import { spaceProjection } from './camera';
import { cameraAxes, dot, rayAt, scale, sub } from './orbit';

/** What a move snaps to, in meters, and a turn, in degrees. */
export const MOVE_SNAP = 0.01;
export const TURN_SNAP = 15;

type Matrix = readonly number[];

/** What the handles hold: the elements they move, outermost only, where they stand and their axes. */
export interface HandleTarget {
  elements: Id[];
  at: SpacePoint;
  rotation?: Rotation;
}

/** The selected elements the handles move and where they stand; none when nothing selected moves. */
export function handleTargetOf(
  space: Pick<Space, 'entries' | 'faint'>,
  selected: ReadonlySet<Id>,
): HandleTarget | undefined {
  const movable = [...selected].filter((element) => space.entries.get(element)?.how === 'posed');
  if (movable.length === 0) return undefined;
  const moving = new Set(movable);
  // What moves with something else selected is left to it.
  const elements = movable.filter((element) => {
    const seen = new Set<Id>([element]);
    let holder = space.entries.get(element)?.in;
    while (holder !== undefined && !seen.has(holder)) {
      if (moving.has(holder)) return false;
      seen.add(holder);
      holder = (space.entries.get(holder) ?? space.faint.get(holder))?.in;
    }
    return true;
  });
  const origins = elements.map((element) => originOf(space.entries.get(element)?.matrix ?? []));
  const at = {
    x: origins.reduce((sum, p) => sum + p.x, 0) / origins.length,
    y: origins.reduce((sum, p) => sum + p.y, 0) / origins.length,
    z: origins.reduce((sum, p) => sum + p.z, 0) / origins.length,
  };
  const first = space.entries.get(elements[0] as Id);
  const container = first?.in === undefined ? undefined : matrixOfHolder(space, first.in);
  const turned = container && spaceMath.decompose(container).rotation;
  return { elements, at, ...(turned && !turnsNothing(turned) ? { rotation: turned } : {}) };
}

/** The handles drawn for a target, in a mode, with the axis pointed at or dragged drawn stronger. */
export function handlesOf(
  target: HandleTarget,
  mode: SpaceHandles['mode'],
  active?: SpaceAxis,
): SpaceHandles {
  return {
    mode,
    at: target.at,
    ...(target.rotation ? { rotation: target.rotation } : {}),
    ...(active ? { active } : {}),
  };
}

const NO_SHIFT: SpacePoint = { x: 0, y: 0, z: 0 };

/**
 * How far the exploded view moves what the handles hold, from how far the worker moves each entry:
 * the mean of their elements' moves, since the handles stand at the mean of their origins.
 */
export function shiftOfHandles(
  elements: readonly Id[],
  shifts: ReadonlyMap<Id, SpacePoint> | undefined,
): SpacePoint {
  if (!shifts || shifts.size === 0 || elements.length === 0) return NO_SHIFT;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const element of elements) {
    const shift = shifts.get(element);
    if (!shift) continue;
    x += shift.x;
    y += shift.y;
    z += shift.z;
  }
  const count = elements.length;
  return x === 0 && y === 0 && z === 0 ? NO_SHIFT : { x: x / count, y: y / count, z: z / count };
}

/**
 * The exploded view's moves a frame says, by element: `last` itself when they are the same, so that
 * what reads them changes only when they do; none when nothing moves.
 */
export function shiftsFrom(
  list: readonly SpaceShift[],
  last: ReadonlyMap<Id, SpacePoint> | undefined,
): ReadonlyMap<Id, SpacePoint> | undefined {
  if (list.length === 0) return undefined;
  const same =
    last?.size === list.length &&
    list.every(({ element, by }) => {
      const kept = last.get(element);
      return kept !== undefined && kept.x === by.x && kept.y === by.y && kept.z === by.z;
    });
  return same ? last : new Map(list.map(({ element, by }) => [element, by]));
}

/** The handles moved by `shift`, where the exploded view draws what they hold. */
export function shiftedHandles(handles: SpaceHandles, shift: SpacePoint): SpaceHandles {
  if (shift.x === 0 && shift.y === 0 && shift.z === 0) return handles;
  const { at } = handles;
  return { ...handles, at: { x: at.x + shift.x, y: at.y + shift.y, z: at.z + shift.z } };
}

/** A point of a frame, in its pixels from the top left. */
export interface FramePoint {
  x: number;
  y: number;
}

/**
 * A drag on one handle, from where it was pressed: it works out how far along the arrow, or how far
 * around the ring, the pointer has taken what the handles hold, and the move that is in their
 * coordinates. `handles` are where they are drawn; `shift` is how far the exploded view moved them
 * from where the poses put what they hold, about which a ring turns it.
 */
export class HandleGesture {
  private turned = 0;
  private last: FramePoint;
  private along = 0;

  constructor(
    readonly handles: SpaceHandles,
    readonly axis: SpaceAxis,
    private readonly camera: SpaceCamera,
    private readonly size: PixelSize,
    private readonly from: FramePoint,
    private readonly shift: SpacePoint = NO_SHIFT,
  ) {
    this.last = from;
  }

  /** How far the pointer took it now: meters along the arrow, or degrees around the ring. */
  moveTo(point: FramePoint, snapped: boolean): number {
    if (this.handles.mode === 'move') {
      const start = this.alongAxis(this.from);
      const now = this.alongAxis(point);
      if (start !== undefined && now !== undefined) this.along = now - start;
      return snapped ? snap(this.along, MOVE_SNAP) : this.along;
    }
    this.turned += this.turnBetween(this.last, point);
    this.last = point;
    return snapped ? snap(this.turned, TURN_SNAP) : this.turned;
  }

  /** The move of `amount`, meters or degrees, as a matrix in the coordinates the panel shows. */
  matrixOf(amount: number): Matrix {
    const axis = handleAxes(this.handles)[this.axis];
    if (this.handles.mode === 'move') {
      return spaceMath.matrixOf(scale(axis, amount));
    }
    const half = (amount * Math.PI) / 180 / 2;
    const sin = Math.sin(half);
    const turn = spaceMath.matrixOf(
      { x: 0, y: 0, z: 0 },
      { x: axis.x * sin, y: axis.y * sin, z: axis.z * sin, w: Math.cos(half) },
    );
    // About the point the handles stand at, where the poses put it.
    const at = sub(this.handles.at, this.shift);
    return spaceMath.multiply(
      spaceMath.matrixOf(at),
      spaceMath.multiply(turn, spaceMath.matrixOf(scale(at, -1))),
    );
  }

  /** Where along the arrow's line the pointer's ray comes nearest, in meters from where they stand. */
  private alongAxis(point: FramePoint): number | undefined {
    const direction = handleAxes(this.handles)[this.axis];
    const ray = rayAt(
      this.camera,
      this.size.width / this.size.height,
      point.x / this.size.width,
      point.y / this.size.height,
    );
    // The nearest points of two lines: at + s·direction, and from + t·ray.
    const b = dot(direction, ray.direction);
    const denominator = 1 - b * b;
    // An arrow pointing at the camera cannot be dragged along.
    if (denominator < 1e-6) return undefined;
    const w = sub(this.handles.at, ray.from);
    const d = dot(direction, w);
    const e = dot(ray.direction, w);
    return (b * e - d) / denominator;
  }

  /** The degrees the pointer turned around the ring from one point to the next. */
  private turnBetween(from: FramePoint, to: FramePoint): number {
    const project = spaceProjection(this.camera, this.size.width / this.size.height);
    const middle = project(this.handles.at);
    const cx = middle.x * this.size.width;
    const cy = middle.y * this.size.height;
    const before = Math.atan2(from.y - cy, from.x - cx);
    const after = Math.atan2(to.y - cy, to.x - cx);
    let turn = after - before;
    if (turn > Math.PI) turn -= 2 * Math.PI;
    if (turn < -Math.PI) turn += 2 * Math.PI;
    // On the screen, whose y grows downward, a turn that reads anticlockwise is negative; it turns
    // positively about an axis that points at the camera.
    const towardCamera =
      dot(handleAxes(this.handles)[this.axis], cameraAxes(this.camera).forward) < 0;
    return ((towardCamera ? -turn : turn) * 180) / Math.PI;
  }
}

/** A value snapped to the nearest step. */
export function snap(value: number, step: number): number {
  return Math.round(value / step) * step || 0;
}

/**
 * Where each element in the space is once `elements` move by `move`, a matrix in the coordinates the
 * panel shows: they, and everything posed or anchored in them at any depth.
 */
export function movedMatrices(
  space: Pick<Space, 'entries' | 'faint'>,
  elements: readonly Id[],
  move: Matrix,
): Map<Id, Matrix> {
  const inside = new Map<Id, Id[]>();
  for (const entry of [...space.entries.values(), ...space.faint.values()]) {
    if (entry.in === undefined) continue;
    const list = inside.get(entry.in) ?? [];
    list.push(entry.element);
    inside.set(entry.in, list);
  }
  const moved = new Map<Id, Matrix>();
  const queue = [...elements];
  while (queue.length > 0) {
    const element = queue.shift() as Id;
    if (moved.has(element)) continue;
    const entry = space.entries.get(element) ?? space.faint.get(element);
    if (!entry) continue;
    moved.set(element, spaceMath.multiply(move, entry.matrix));
    queue.push(...(inside.get(element) ?? []));
  }
  return moved;
}

/** The entries the worker draws, with what a gesture moves where it is now. */
export function entriesMoved(
  entries: readonly SpaceDrawnEntry[],
  moved: ReadonlyMap<Id, Matrix>,
): SpaceDrawnEntry[] {
  return entries.map((entry) => {
    const matrix = moved.get(entry.element);
    return matrix ? { ...entry, matrix: [...matrix] } : entry;
  });
}

/**
 * The poses that keep `elements` where a move of `move` leaves them, each measured from what it is
 * posed in, as one `set-poses` sends them: to the micrometre, with a turn of nothing left out.
 */
export function posesMoved(
  space: Pick<Space, 'entries' | 'faint'>,
  elements: readonly Id[],
  move: Matrix,
  poseOf: (element: Id) => Pose | undefined,
): { element: Id; pose: Pose }[] {
  const poses: { element: Id; pose: Pose }[] = [];
  for (const element of elements) {
    const entry = space.entries.get(element);
    const stored = poseOf(element);
    if (entry?.how !== 'posed' || entry.in === undefined || !stored) continue;
    const holder = matrixOfHolder(space, entry.in);
    if (!holder) continue;
    const local = spaceMath.multiply(
      spaceMath.inverseRigid(holder),
      spaceMath.multiply(move, entry.matrix),
    );
    const { at, rotation } = spaceMath.decompose(local);
    const turned = spaceMath.normalized(rotation);
    poses.push({
      element,
      pose: {
        ...(stored.in === undefined ? {} : { in: stored.in }),
        at: { x: micrometres(at.x), y: micrometres(at.y), z: micrometres(at.z) },
        ...(turnsNothing(turned) ? {} : { rotation: rounded(turned) }),
      },
    });
  }
  return poses;
}

function matrixOfHolder(space: Pick<Space, 'entries' | 'faint'>, holder: Id): Matrix | undefined {
  return (space.entries.get(holder) ?? space.faint.get(holder))?.matrix;
}

function originOf(matrix: Matrix): SpacePoint {
  return { x: matrix[12] ?? 0, y: matrix[13] ?? 0, z: matrix[14] ?? 0 };
}

function micrometres(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** A rotation to nine places, the sign that keeps `w` positive, of unit length again. */
function rounded(rotation: Rotation): Rotation {
  const sign = rotation.w < 0 ? -1 : 1;
  const place = (value: number) => {
    const kept = Math.round(value * sign * 1e9) / 1e9;
    return Object.is(kept, -0) ? 0 : kept;
  };
  return spaceMath.normalized({
    x: place(rotation.x),
    y: place(rotation.y),
    z: place(rotation.z),
    w: place(rotation.w),
  });
}

function turnsNothing(rotation: Rotation): boolean {
  const near = (value: number) => Math.abs(value) < 1e-9;
  return near(rotation.x) && near(rotation.y) && near(rotation.z);
}
