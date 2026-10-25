/**
 * How the scene routes the lines that are not plain automatic routes between two rectangles: the
 * lines a view routes by hand (ADR 0039, `relation-routing.md` §6.1), and the lines that attach to
 * the connection points of their ends' shapes (`components.md` §3.5). Everything else keeps the
 * stand-in router of `route.ts`.
 *
 * The scene calls `routeOf` only for the relations the view keeps a route for, with the shapes it
 * placed, so that a call costs the depth of the two ends; a view without routes pays nothing here but
 * a look at each line's ends.
 */
import { routeOf, type ProjectSnapshot, type ResolvedAttachment, type ResolvedRoute } from '@visual-anything/core';
import type { ConnectionPoint, Id, RelationRoute, ViewFile } from '@visual-anything/schema';
import type { Point } from '../geometry';
import { routeBetweenEnds, type RouteEnd } from '../route';
import type { ElementShape, RelationLine } from '../scene';
import { routeByHand, type Attach, type CurveSpan, type HandEnd, type RouteStyle } from './hand';

/** How far apart the scene draws relations between the same two ends, as `scene.ts` offsets them. */
const PARALLEL_GAP = 24;

/** What a line drawn by hand holds besides its route, as `RelationLine` carries it. */
export interface HandOfLine {
  route: ResolvedRoute;
  /** The bend points that apply, in scene coordinates. */
  bendPoints: Point[];
  /** Where the shape of `route.bendPointsIn` starts, or the canvas origin: stored bend points are relative to it. */
  bendOrigin: Point;
}

/** A line's route and the fields of `RelationLine` that come with it. */
export interface RoutedLine {
  route: Point[];
  style?: RouteStyle;
  hand?: HandOfLine;
  curve?: CurveSpan[];
}

/** What a line is drawn between, as the scene knows it. */
export interface LineEnds {
  /** The relation, for a line that draws one; absent on an aggregated relation. */
  relation: Id | undefined;
  /** How far the line runs beside others between the same two ends. */
  offset: number;
  /** Each end's shape, when the end is a shape rather than another relation's line. */
  fromShape: ElementShape | undefined;
  toShape: ElementShape | undefined;
  from: RouteEnd;
  to: RouteEnd;
}

/** How to route one line: what its route depends on beyond its ends' places, and the route. */
export interface LinePlan {
  /** Everything the route depends on besides the ends' rectangles and points, as text. */
  signature: string;
  route(): RoutedLine;
}

/** How the scene routes the lines of one build of a view. */
export interface SceneRouting {
  /** How to route a line, or undefined when it is a plain automatic route between rectangles. */
  plan(ends: LineEnds): LinePlan | undefined;
  /** The relations whose route the view keeps changed since `before`: given, changed or taken away. */
  changedSince(before: ViewFile): Id[];
  /** The indexes of the shapes whose connection points differ between two lists with the same keys. */
  repointed(before: readonly ElementShape[], after: readonly ElementShape[]): number[];
}

/** What the scene's shapes are looked up by, made once for each list of shapes. */
interface ShapeIndex {
  /** Each element's first shape, in containment order. */
  first: Map<Id, ElementShape>;
  byKey: Map<string, ElementShape>;
}

const shapeIndexes = new WeakMap<readonly ElementShape[], ShapeIndex>();

function shapeIndexOf(shapes: readonly ElementShape[]): ShapeIndex {
  let index = shapeIndexes.get(shapes);
  if (!index) {
    const first = new Map<Id, ElementShape>();
    const byKey = new Map<string, ElementShape>();
    for (const shape of shapes) {
      if (!first.has(shape.element)) first.set(shape.element, shape);
      byKey.set(shape.key, shape);
    }
    index = { first, byKey };
    shapeIndexes.set(shapes, index);
  }
  return index;
}

/** The routing of one build of a view, with the shapes it placed. */
export function sceneRouting(
  project: ProjectSnapshot,
  view: ViewFile,
  shapes: readonly ElementShape[],
): SceneRouting {
  const { routes } = view;
  const holders = routes === undefined ? undefined : routeShapesOf(shapes);
  return {
    plan(ends) {
      const stored =
        ends.relation !== undefined && routes !== undefined && Object.hasOwn(routes, ends.relation)
          ? routes[ends.relation]
          : undefined;
      const resolved =
        stored !== undefined && holders !== undefined && ends.relation !== undefined
          ? routeOf(project, view, ends.relation, holders)
          : undefined;
      if (!resolved && !ends.fromShape?.points && !ends.toShape?.points) return undefined;
      const bendOrigin = resolved ? originOf(shapes, ends, resolved.bendPointsIn) : ORIGIN;
      const bendPoints = resolved
        ? resolved.bendPoints.map((point) => ({ x: point.x + bendOrigin.x, y: point.y + bendOrigin.y }))
        : [];
      const hand: HandOfLine | undefined = resolved && { route: resolved, bendPoints, bendOrigin };
      return {
        signature: signatureOf(ends, hand),
        route: () => routeLine(ends, hand),
      };
    },
    changedSince(before) {
      return changedRoutes(before.routes, routes);
    },
    repointed(before, after) {
      if (before === after || before.length !== after.length) return [];
      const changed: number[] = [];
      for (let at = 0; at < after.length; at++) {
        const a = before[at] as ElementShape;
        const b = after[at] as ElementShape;
        if (a !== b && !samePoints(a.points, b.points)) changed.push(at);
      }
      return changed;
    },
  };
}

/**
 * Routes a line whose ends moved, as while shapes are dragged: by hand when the line is, through its
 * bend points where they are, or to the connection points of its ends' shapes; undefined for a plain
 * automatic route between rectangles, which the stand-in router draws.
 */
export function rerouted(
  line: RelationLine,
  from: RouteEnd,
  to: RouteEnd,
  fromShape: ElementShape | undefined,
  toShape: ElementShape | undefined,
): RoutedLine | undefined {
  if (!line.hand && !fromShape?.points && !toShape?.points) return undefined;
  const ends: LineEnds = {
    relation: line.aggregate ? undefined : line.relation,
    offset: line.ends?.offset ?? 0,
    fromShape,
    toShape,
    from,
    to,
  };
  return routeLine(ends, line.hand);
}

/**
 * The route of a line: by hand through what applies of its route, or else automatically, to the
 * connection points facing each other end where its shapes have some.
 */
export function routeLine(ends: LineEnds, hand: HandOfLine | undefined): RoutedLine {
  const resolved = hand?.route;
  const style = resolved?.style ?? 'orthogonal';
  const fromAttach = attachOf(resolved?.from);
  const toAttach = attachOf(resolved?.to);
  const bendPoints = hand?.bendPoints ?? [];
  const pointed = ends.fromShape?.points !== undefined || ends.toShape?.points !== undefined;
  const byHand =
    fromAttach !== undefined || toAttach !== undefined || bendPoints.length > 0 || style !== 'orthogonal';
  const extras = {
    ...(style === 'orthogonal' ? {} : { style }),
    ...(hand ? { hand } : {}),
  };
  if (!byHand && !pointed) {
    return { route: routeBetweenEnds(ends.from, ends.to, ends.offset), ...extras };
  }
  // Siblings run beside each other only while nothing about them is chosen by hand.
  const sibling = byHand ? 0 : ends.offset / PARALLEL_GAP;
  const routed = routeByHand(
    handEnd(ends.from, ends.fromShape, fromAttach),
    handEnd(ends.to, ends.toShape, toAttach),
    bendPoints,
    style,
    sibling,
  );
  return { route: routed.route, ...extras, ...(routed.curve ? { curve: routed.curve } : {}) };
}

function handEnd(end: RouteEnd, shape: ElementShape | undefined, attach: Attach | undefined): HandEnd {
  if ('point' in end) return { kind: 'point', point: end.point };
  return {
    kind: 'shape',
    rect: end.rect,
    ...(attach ? { attach } : {}),
    ...(shape?.points ? { points: shape.points } : {}),
  };
}

/** Where a resolved attachment puts the line on its end's border; undefined while automatic. */
export function attachOf(attachment: ResolvedAttachment | undefined): Attach | undefined {
  return attachment === undefined || attachment.kind === 'automatic'
    ? undefined
    : { side: attachment.side, at: attachment.at };
}

/** What `routeOf` is given: the holders of each element's first shape, from the shapes' keys. */
function routeShapesOf(shapes: readonly ElementShape[]) {
  return {
    holdersOf: (element: Id): readonly Id[] | undefined =>
      shapeIndexOf(shapes).first.get(element)?.key.split('/'),
  };
}

/**
 * Where the shape of a container that holds a line's ends starts: the copy of it that holds the
 * line's shapes, found through the key of an end's shape; or the canvas origin for none.
 */
export function originOf(
  shapes: readonly ElementShape[],
  ends: Pick<LineEnds, 'fromShape' | 'toShape'>,
  container: Id | undefined,
): Point {
  if (container === undefined) return ORIGIN;
  const index = shapeIndexOf(shapes);
  for (const shape of [ends.fromShape, ends.toShape]) {
    if (!shape) continue;
    const path = shape.key.split('/');
    const at = path.indexOf(container);
    if (at < 0) continue;
    const holder = index.byKey.get(path.slice(0, at + 1).join('/'));
    if (holder) return { x: holder.rect.x, y: holder.rect.y };
  }
  const first = index.first.get(container);
  return first ? { x: first.rect.x, y: first.rect.y } : ORIGIN;
}

const ORIGIN: Point = { x: 0, y: 0 };

/** Everything a line's route depends on but its ends' places, so that an equal line can be kept. */
function signatureOf(ends: LineEnds, hand: HandOfLine | undefined): string {
  const parts: (string | number)[] = [pointsKey(ends.fromShape?.points), pointsKey(ends.toShape?.points)];
  if (hand) {
    const { route } = hand;
    parts.push(
      'hand',
      route.style,
      attachmentKey(route.from),
      attachmentKey(route.to),
      route.frame ?? '',
      route.bendPointsIn ?? '',
      ...hand.bendPoints.flatMap((point) => [point.x, point.y]),
    );
  }
  return parts.join(' ');
}

function attachmentKey(attachment: ResolvedAttachment): string {
  switch (attachment.kind) {
    case 'automatic':
      return 'a';
    case 'border':
      return `b ${attachment.side} ${attachment.at}`;
    case 'connection-point':
      return `c ${attachment.side} ${attachment.at} ${attachment.name}`;
  }
}

function pointsKey(points: readonly Attach[] | undefined): string {
  return points === undefined ? '-' : points.map((point) => `${point.side}${point.at}`).join(',');
}

/** The connection points a shape's appearance sets, as the scene keeps them; undefined for none. */
export function pointsOf(points: readonly ConnectionPoint[]): readonly Attach[] | undefined {
  if (points.length === 0) return undefined;
  return points.map((point) => ({ side: point.side, at: point.at }));
}

/** Whether two lists of connection points hold the same places, in the same order. */
export function samePoints(
  a: readonly Attach[] | undefined,
  b: readonly Attach[] | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((point, at) => point.side === b[at]?.side && point.at === b[at]?.at);
}

/** The relations whose route differs between two maps of routes, by identity. */
function changedRoutes(
  before: Readonly<Record<Id, RelationRoute>> | undefined,
  after: Readonly<Record<Id, RelationRoute>> | undefined,
): Id[] {
  if (before === after) return [];
  const changed: Id[] = [];
  for (const id of Object.keys(after ?? {})) {
    if (!before || !Object.hasOwn(before, id) || before[id] !== after?.[id]) changed.push(id);
  }
  for (const id of Object.keys(before ?? {})) {
    if (!after || !Object.hasOwn(after, id)) changed.push(id);
  }
  return changed;
}
