/**
 * A layout's result animates in: the shapes it moved travel from where they were to where they now
 * are, and the relations on them are routed again on the way, as when a shape is dragged. Each frame is
 * a scene of its own, which the canvas draws as any other; every shape keeps its stored offset in it,
 * so a gesture that starts during the move works from where the shape ends. When the system asks for
 * reduced motion, or the view is too large to draw again on every frame, the result shows at once. A
 * scene that reads otherwise in the same places, as a live update gives, takes the move's place as
 * where it ends (`sameGeometry`, `retargeted`), so that the move goes on.
 */
import type { Id } from '@visual-anything/schema';
import { arrowheadAt, type Point, type Rect } from '../geometry';
import { midpointOf, routeBetweenEnds } from '../route';
import type { ElementShape, RelationLine, Scene } from '../scene';
import { movedImage } from '../shape-images';

/** How long a layout's result takes to move in, in milliseconds. */
export const TRANSITION_MS = 320;
/**
 * Beyond this many shapes in the view, a layout's result shows at once: every frame of the move
 * indexes and draws the view again.
 */
export const MAX_ANIMATED_SHAPES = 1500;

/** The move from one scene to the next. */
export interface Transition {
  /** The scene the move ends on. */
  to: Scene;
  /** Where each shape that moves was, by its key. */
  from: ReadonlyMap<string, { rect: Rect; extent: Rect }>;
  /** Where each relation whose route moves ran, by its id. */
  lines: ReadonlyMap<Id, RelationLine>;
  /** Where every shape ends, by its key. */
  ends: ReadonlyMap<string, Rect>;
}

/** The move from `before` to `after`; undefined when nothing moves, or it would cost too much. */
export function transitionBetween(before: Scene, after: Scene): Transition | undefined {
  if (before === after || after.shapes.length > MAX_ANIMATED_SHAPES) return undefined;
  const was = new Map(before.shapes.map((shape) => [shape.key, shape]));
  const from = new Map<string, { rect: Rect; extent: Rect }>();
  const ends = new Map<string, Rect>();
  for (const shape of after.shapes) {
    ends.set(shape.key, shape.rect);
    const old = was.get(shape.key);
    if (old && !sameRect(old.rect, shape.rect)) {
      from.set(shape.key, { rect: old.rect, extent: old.extent });
    }
  }
  if (from.size === 0) return undefined;
  const oldLines = new Map(before.relations.map((line) => [line.relation, line]));
  const lines = new Map<Id, RelationLine>();
  for (const line of after.relations) {
    const old = oldLines.get(line.relation);
    if (old && old !== line) lines.set(line.relation, old);
  }
  return { to: after, from, lines, ends };
}

/**
 * Whether two scenes draw their shapes and lines in the same places, whatever they read: the same
 * shapes, by key, with the same rectangles and extents, and the same lines along the same routes. A
 * live update that changes only values, details or colors (ADR 0057) gives such a scene.
 */
export function sameGeometry(a: Scene, b: Scene): boolean {
  if (a === b) return true;
  if (a.shapes.length !== b.shapes.length || a.relations.length !== b.relations.length) {
    return false;
  }
  for (let at = 0; at < a.shapes.length; at++) {
    const one = a.shapes[at] as ElementShape;
    const other = b.shapes[at] as ElementShape;
    if (one === other) continue;
    if (one.key !== other.key || !sameRect(one.rect, other.rect)) return false;
    if (!sameRect(one.extent, other.extent)) return false;
  }
  for (let at = 0; at < a.relations.length; at++) {
    const one = a.relations[at] as RelationLine;
    const other = b.relations[at] as RelationLine;
    if (one === other || (one.relation === other.relation && one.route === other.route)) continue;
    if (one.relation !== other.relation || !sameRoute(one.route, other.route)) return false;
  }
  return (
    sameItems(a.notes, b.notes, (one, other) => sameRect(one.rect, other.rect)) &&
    sameItems(
      a.arrows,
      b.arrows,
      (one, other) => samePoint(one.from, other.from) && samePoint(one.to, other.to),
    )
  );
}

/**
 * The move going on to `to` instead, a scene in the same places as the one it moved to: from where it
 * is, with what `to` reads, so that a live update neither cuts it short nor starts it again.
 */
export function retargeted(transition: Transition, to: Scene): Transition {
  return { ...transition, to };
}

function sameRoute(a: readonly Point[], b: readonly Point[]): boolean {
  return a.length === b.length && a.every((point, at) => samePoint(point, b[at] as Point));
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

function sameItems<T>(a: readonly T[], b: readonly T[], same: (a: T, b: T) => boolean): boolean {
  if (a === b) return true;
  return a.length === b.length && a.every((item, at) => item === b[at] || same(item, b[at] as T));
}

/** The scene drawn at `progress` through a move, from 0 at its start to 1 at its end. */
export function frameAt(transition: Transition, progress: number): Scene {
  const t = eased(Math.min(1, Math.max(0, progress)));
  const { to, from, lines, ends } = transition;
  if (t >= 1) return to;
  const rects = new Map<string, Rect>();
  const shapes = to.shapes.map((shape): ElementShape => {
    const was = from.get(shape.key);
    if (!was) return shape;
    const rect = between(was.rect, shape.rect, t);
    rects.set(shape.key, rect);
    return {
      ...shape,
      rect,
      extent: between(was.extent, shape.extent, t),
      ...movedImage(shape, rect.x - shape.rect.x, rect.y - shape.rect.y),
    };
  });
  const middles = new Map<Id, Point>();
  const relations = to.relations.map((line) => {
    const moved = lineAt(line, lines.get(line.relation), rects, ends, middles, t);
    middles.set(line.relation, moved.middle);
    return moved;
  });
  return { ...to, shapes, relations };
}

/**
 * A relation part of the way through a move: routed again between where its ends are then, when both
 * are shapes and one of them moves; otherwise, between its old and its new route when both have as
 * many points; otherwise as it ends.
 */
function lineAt(
  line: RelationLine,
  old: RelationLine | undefined,
  rects: ReadonlyMap<string, Rect>,
  finals: ReadonlyMap<string, Rect>,
  middles: ReadonlyMap<Id, Point>,
  t: number,
): RelationLine {
  const ends = line.ends;
  if (ends?.from.kind === 'shape' && ends.to.kind === 'shape') {
    const fromRect = rects.get(ends.from.key);
    const toRect = rects.get(ends.to.key);
    if (!fromRect && !toRect) return line;
    const start = fromRect ?? finals.get(ends.from.key);
    const end = toRect ?? finals.get(ends.to.key);
    if (!start || !end) return line;
    return withRoute(line, routeBetweenEnds({ rect: start }, { rect: end }, ends.offset));
  }
  if (ends && (ends.from.kind === 'relation' || ends.to.kind === 'relation')) {
    const anchor = (end: typeof ends.from, at: Point) =>
      end.kind === 'relation' ? (middles.get(end.relation) ?? at) : at;
    if (old && old.route.length === line.route.length) {
      const route = line.route.map((point, at) => towards(old.route[at] as Point, point, t));
      route[0] = anchor(ends.from, route[0] as Point);
      route[route.length - 1] = anchor(ends.to, route.at(-1) as Point);
      return withRoute(line, route);
    }
  }
  return line;
}

function withRoute(line: RelationLine, route: Point[]): RelationLine {
  if (route.length < 2) return line;
  const start = route[0] as Point;
  const end = route.at(-1) as Point;
  const beforeEnd = route.at(-2) as Point;
  const turns = beforeEnd.x !== end.x || beforeEnd.y !== end.y;
  return {
    ...line,
    route,
    from: start,
    to: end,
    middle: midpointOf(route),
    ...(line.arrowhead && turns ? { arrowhead: arrowheadAt(beforeEnd, end, line.width) } : {}),
  };
}

/** Starts slowly, moves, and settles: cubic ease in and out. */
export function eased(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Whether the system asks for reduced motion. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function between(a: Rect, b: Rect, t: number): Rect {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    width: a.width + (b.width - a.width) * t,
    height: a.height + (b.height - a.height) * t,
  };
}

function towards(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
