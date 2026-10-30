/**
 * ELK's routes, kept right after a layout (ADR 0080, section 2): a layout in one pass over the view
 * gives the route ELK found for each line with the places, and the canvas draws that route until a
 * shape it passes, or one of its ends, moves. After that the line takes the route the canvas gives
 * it, its stand-in route or one around shapes. Nothing is stored (ADR 0039).
 *
 * Only automatic orthogonal lines take ELK's route: a route by hand, a curve, a straight line and a
 * line others end on keep theirs. A route whose ends do not lie where the scene draws its ends is
 * not kept at all.
 */
import type { Id } from '@visual-anything/schema';
import { arrowheadAt, type Point, type Rect } from '../geometry';
import { midpointOf } from '../route';
import { channelledScene, routedAroundScene } from '../routing/avoided';
import { shapeChanges, type ShapeChange } from '../routing/useAvoidedRoutes';
import { withRelations, type ElementShape, type RelationLine, type Scene } from '../scene';
import type { LaidOutRoute } from './types';

/** ELK's routes, and the scene they were drawn in first, which later scenes are compared with. */
export interface KeptRoutes {
  base: Scene;
  routes: ReadonlyMap<Id, readonly Point[]>;
}

/** How far a route's end may lie from where the scene draws that end. */
const END_REACH = 2;
/** How far beside a route a shape counts as one it passes. */
const CORRIDOR = 12;

/**
 * ELK's routes as the scene drawn after the layout takes them: those of automatic orthogonal lines
 * whose ends lie where the scene draws them. Undefined when it takes none.
 */
export function keepRoutes(
  scene: Scene,
  routes: readonly LaidOutRoute[] | undefined,
): KeptRoutes | undefined {
  if (!routes || routes.length === 0) return undefined;
  const byKey = new Map(scene.shapes.map((shape) => [shape.key, shape]));
  const lines = new Map(scene.relations.map((line) => [line.relation, line]));
  const endedOn = endedOnOf(scene);
  const kept = new Map<Id, readonly Point[]>();
  for (const { relation, points } of routes) {
    const line = lines.get(relation);
    if (!line || !takesRoute(line, endedOn) || points.length < 2) continue;
    const ends = line.ends;
    if (ends?.from.kind !== 'shape' || ends.to.kind !== 'shape') continue;
    const from = byKey.get(ends.from.key);
    const to = byKey.get(ends.to.key);
    if (!from || !to) continue;
    if (!endsAt(points[0] as Point, from, byKey) || !endsAt(points.at(-1) as Point, to, byKey)) {
      continue;
    }
    kept.set(relation, points);
  }
  return kept.size === 0 ? undefined : { base: scene, routes: kept };
}

const composed = new WeakMap<Scene, { kept: KeptRoutes; scene: Scene }>();

/**
 * The scene with the kept routes of its lines that still hold: those whose ends and the shapes they
 * pass stand where they stood when the layout was drawn. The same scene when none holds.
 */
export function withKeptRoutes(scene: Scene, kept: KeptRoutes | undefined): Scene {
  if (!kept) return scene;
  const known = composed.get(scene);
  if (known?.kept === kept) return known.scene;
  const changes = shapeChanges(kept.base.shapes, scene.shapes);
  const endedOn = endedOnOf(scene);
  let bounds = scene.bounds;
  let any = false;
  const relations = scene.relations.map((line) => {
    const points = kept.routes.get(line.relation);
    if (!points || !takesRoute(line, endedOn) || !holds(line, points, changes)) return line;
    any = true;
    const route = points.map((point) => ({ ...point }));
    const along: RelationLine = {
      ...line,
      route,
      from: route[0] as Point,
      to: route.at(-1) as Point,
      middle: midpointOf(route),
    };
    if (line.arrowhead) along.arrowhead = arrowheadAt(route.at(-2) as Point, along.to, line.width);
    bounds = union(bounds, boundsOfPoints(route));
    return along;
  });
  const result = any ? withRelations(scene, relations, bounds) : scene;
  composed.set(scene, { kept, scene: result });
  return result;
}

/**
 * The scene drawn at once as the canvas draws it after a layout (ADR 0080, section 2): ELK's routes
 * that still hold, every other line that may go around shapes routed so, keeping apart from them, and
 * the channel pass over both, which leaves ELK's routes where they are. For the exports and tests;
 * the canvas does the same in the routing worker.
 */
export function routedWithKept(scene: Scene, kept: KeptRoutes | undefined): Scene {
  const held = withKeptRoutes(scene, kept);
  const along = new Map<Id, readonly Point[]>();
  for (const line of held.relations) {
    if (alongKeptRoute(kept, line)) along.set(line.relation, line.route);
  }
  const routed = withKeptRoutes(routedAroundScene(scene, along), kept);
  return channelledScene(routed, scene, (line) => alongKeptRoute(kept, line));
}

/**
 * Whether a line of a scene `withKeptRoutes` drew runs along ELK's kept route, which the channel
 * pass leaves where it is (ADR 0080, section 2).
 */
export function alongKeptRoute(kept: KeptRoutes | undefined, line: RelationLine): boolean {
  const points = kept?.routes.get(line.relation);
  if (!points || points.length !== line.route.length) return false;
  return points.every((point, at) => {
    const drawn = line.route[at] as Point;
    return drawn.x === point.x && drawn.y === point.y;
  });
}

/** Whether a line may be drawn along ELK's route: automatic, orthogonal, and no line ends on it. */
function takesRoute(line: RelationLine, endedOn: ReadonlySet<Id>): boolean {
  return (
    line.hand === undefined &&
    line.curve === undefined &&
    (line.style === undefined || line.style === 'orthogonal') &&
    !endedOn.has(line.relation)
  );
}

function endedOnOf(scene: Scene): Set<Id> {
  const ids = new Set<Id>();
  for (const line of scene.relations) {
    for (const end of [line.ends?.from, line.ends?.to]) {
      if (end?.kind === 'relation') ids.add(end.relation);
    }
  }
  return ids;
}

/**
 * Whether a point lies where a line's end on this shape is drawn: on a row, on its table's left or
 * right side at the row's middle; elsewhere on the shape's border.
 */
function endsAt(
  point: Point,
  shape: ElementShape,
  byKey: ReadonlyMap<string, ElementShape>,
): boolean {
  if (shape.row !== undefined) {
    const table = shape.containerShape === undefined ? undefined : byKey.get(shape.containerShape);
    if (!table) return false;
    const middle = shape.rect.y + shape.rect.height / 2;
    const side =
      Math.abs(point.x - table.rect.x) <= END_REACH ||
      Math.abs(point.x - (table.rect.x + table.rect.width)) <= END_REACH;
    return side && Math.abs(point.y - middle) <= END_REACH;
  }
  const rect = shape.rect;
  const within = (value: number, start: number, size: number) =>
    value >= start - END_REACH && value <= start + size + END_REACH;
  if (!within(point.x, rect.x, rect.width) || !within(point.y, rect.y, rect.height)) return false;
  return (
    Math.abs(point.x - rect.x) <= END_REACH ||
    Math.abs(point.x - (rect.x + rect.width)) <= END_REACH ||
    Math.abs(point.y - rect.y) <= END_REACH ||
    Math.abs(point.y - (rect.y + rect.height)) <= END_REACH
  );
}

/**
 * Whether a kept route still holds after these changes: none of them is one of its ends, and none
 * stands across its corridor, where it stood or where it stands. A container counts by its sides,
 * which the route crosses, not by what it holds.
 */
function holds(line: RelationLine, points: readonly Point[], changes: readonly ShapeChange[]) {
  if (changes.length === 0) return true;
  const ends = line.ends;
  const keys = [ends?.from, ends?.to].flatMap((end) => (end?.kind === 'shape' ? [end.key] : []));
  for (const change of changes) {
    if (keys.includes(change.key)) return false;
    const strips = change.plates.length > 0 || keys.some((key) => key.startsWith(`${change.key}/`));
    const rects = strips ? change.rects.flatMap(sidesOf) : change.rects;
    if (rects.some((rect) => corridorMeets(points, rect))) return false;
  }
  return true;
}

/** A rectangle's four sides, as thin rectangles. */
function sidesOf(rect: Rect): Rect[] {
  return [
    { x: rect.x, y: rect.y, width: rect.width, height: 0 },
    { x: rect.x, y: rect.y + rect.height, width: rect.width, height: 0 },
    { x: rect.x, y: rect.y, width: 0, height: rect.height },
    { x: rect.x + rect.width, y: rect.y, width: 0, height: rect.height },
  ];
}

function corridorMeets(points: readonly Point[], rect: Rect): boolean {
  for (let at = 1; at < points.length; at++) {
    const a = points[at - 1] as Point;
    const b = points[at] as Point;
    const x0 = Math.min(a.x, b.x) - CORRIDOR;
    const x1 = Math.max(a.x, b.x) + CORRIDOR;
    const y0 = Math.min(a.y, b.y) - CORRIDOR;
    const y1 = Math.max(a.y, b.y) + CORRIDOR;
    if (rect.x <= x1 && rect.x + rect.width >= x0 && rect.y <= y1 && rect.y + rect.height >= y0) {
      return true;
    }
  }
  return false;
}

function boundsOfPoints(points: readonly Point[]): Rect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function union(a: Rect | undefined, b: Rect): Rect {
  if (!a) return b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}
