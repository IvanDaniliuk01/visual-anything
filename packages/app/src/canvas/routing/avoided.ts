/**
 * The scene's side of routing around shapes (`avoid.ts`, ADR 0039's clarification of 2026-10-26):
 * which lines may go around what is in their way, what the avoider is given for a scene, and the
 * scene with the routes it gave. Only automatic orthogonal lines between two shapes are routed so:
 * a route set by hand, a curved or straight one, one to a connection point, beside a row, or to
 * another relation's line keeps the route the scene gives it. A line that other lines end on is routed
 * so when each of those runs from a plain shape and nothing ends on it: they follow its middle.
 *
 * A shape with an outline of its own (ADR 0066, ADR 0067) is routed around by its box: the avoider is
 * given the line's stand-in route between the boxes, and the route it gives back is carried on from
 * the boxes to the outlines, as the scene carries the stand-in on. A part of lines alone, which a line
 * leaves from a point of its lines, is not a plain end.
 */
import { estimateWidth } from '../fit';
import { arrowheadAt, type Point, type Rect } from '../geometry';
import { midpointOf, routeBetweenEnds } from '../route';
import { withRelations, type ElementShape, type RelationLine, type Scene } from '../scene';
import { headerShift } from '../shape-images';
import { PLATE_HEIGHT, avoidRoutes, type AvoidLine, type AvoidShapes } from './avoid';
import { carriedOrthogonal, endOutline, onlyStrokes, type OutlinedEnd } from './outline-ends';

/** What the avoider is given for a scene: its shapes, and the lines it may route with their lines. */
export interface AvoidBatch {
  shapes: AvoidShapes;
  lines: AvoidLine[];
  /** The scene's line for each of `lines`, in the same order. */
  drawn: RelationLine[];
}

/** How far in from its side a container's name starts, and the room around its name plate. */
const NAME_INSET = 12;
const NAME_SIZE = 14;
const DETAIL_SIZE = 11;

/** Whether a shape's end of a line attaches as a plain rectangle, which routing around keeps. */
function plainEnd(shape: ElementShape | undefined): shape is ElementShape {
  return (
    shape !== undefined &&
    shape.points === undefined &&
    shape.row === undefined &&
    shape.rowCount === undefined &&
    !(shape.outline !== undefined && onlyStrokes(shape.outline))
  );
}

/** Where a line's end on a shape with an outline of its own lies: its box, and its outline there. */
function outlinedEnd(shape: ElementShape | undefined): OutlinedEnd | undefined {
  if (!shape) return undefined;
  const rect = shape.plate ?? shape.rect;
  const outline = endOutline(shape, rect);
  return outline && { rect, outline };
}

/** A line's ends on shapes with outlines of their own, which its route is carried on to. */
interface Carried {
  from: OutlinedEnd | undefined;
  to: OutlinedEnd | undefined;
}

/** The ends of a line that lie on outlines; undefined when neither does. */
function carriedEndsOf(
  line: RelationLine,
  shapeOf: (key: string) => ElementShape | undefined,
): Carried | undefined {
  const ends = line.ends;
  if (!ends) return undefined;
  const from = ends.from.kind === 'shape' ? outlinedEnd(shapeOf(ends.from.key)) : undefined;
  const to = ends.to.kind === 'shape' ? outlinedEnd(shapeOf(ends.to.key)) : undefined;
  return from || to ? { from, to } : undefined;
}

/**
 * Whether a line is routed around what is in its way: an automatic orthogonal line between two
 * shapes drawn as plain rectangles, each line that ends on it following its middle
 * (`followsMiddle`).
 */
function routesAround(
  line: RelationLine,
  batch: ShapeBatch,
  endingOn: ReadonlyMap<string, readonly RelationLine[]>,
): boolean {
  if (!automatic(line) || line.route.length < 2) return false;
  const ends = shapeEndsOf(line, batch);
  if (!ends || batch.plain[ends.from] !== 1 || batch.plain[ends.to] !== 1) return false;
  const others = endingOn.get(line.relation);
  return (
    others === undefined ||
    others.every((other) => followsMiddle(other, line.relation, batch, endingOn))
  );
}

/** The indexes of a line's two shapes, kept for the line while the shapes keep their keys. */
const shapeEnds = new WeakMap<
  RelationLine,
  { indexes: ReadonlyMap<string, number>; from: number; to: number }
>();

/** The indexes of the shapes a line runs between, or undefined for a line that ends on another. */
function shapeEndsOf(
  line: RelationLine,
  batch: ShapeBatch,
): { from: number; to: number } | undefined {
  const known = shapeEnds.get(line);
  if (known?.indexes === batch.indexes) return known;
  const ends = line.ends;
  if (ends?.from.kind !== 'shape' || ends.to.kind !== 'shape') return undefined;
  const from = batch.indexes.get(ends.from.key);
  const to = batch.indexes.get(ends.to.key);
  if (from === undefined || to === undefined) return undefined;
  const found = { indexes: batch.indexes, from, to };
  shapeEnds.set(line, found);
  return found;
}

function automatic(line: RelationLine): boolean {
  return !line.hand && !line.curve && line.style === undefined;
}

/**
 * Whether a line that ends on `on` can follow that line's middle when it is routed around shapes:
 * an automatic one from a plain shape, which no line ends on in its turn.
 */
function followsMiddle(
  line: RelationLine,
  on: string,
  batch: ShapeBatch,
  endingOn: ReadonlyMap<string, readonly RelationLine[]>,
): boolean {
  const ends = line.ends;
  if (!automatic(line) || !ends || endingOn.has(line.relation)) return false;
  const other = ends.from.kind === 'relation' && ends.from.relation === on ? ends.to : ends.from;
  if (other.kind !== 'shape') return false;
  const at = batch.indexes.get(other.key);
  return at !== undefined && batch.plain[at] === 1;
}

/** A container's name plate, where it writes its name and detail; none for a shape that holds nothing. */
export function namePlateOf(shape: ElementShape): Rect | undefined {
  const width = plateWidth(shape);
  if (!(width > 0)) return undefined;
  const { x, y } = shape.rect;
  return {
    x,
    y,
    width: Math.min(width, shape.rect.width),
    height: Math.min(PLATE_HEIGHT, shape.rect.height),
  };
}

/** How wide a container's name plate is: its name and detail, from its left side, as it writes them. */
function plateWidth(shape: ElementShape): number {
  if (!shape.holdsContents) return 0;
  const name = estimateWidth(shape.name, NAME_SIZE, true);
  const detail = estimateWidth(shape.detail ?? shape.componentName, DETAIL_SIZE);
  return NAME_INSET + headerShift(shape) + Math.max(name, detail) + NAME_INSET;
}

/** A scene's shapes as the avoider reads them, with the index of each key. */
interface ShapeBatch {
  shapes: AvoidShapes;
  indexes: ReadonlyMap<string, number>;
  /** 1 for each shape a line may attach to as a plain rectangle (`plainEnd`). */
  plain: Uint8Array;
}

const shapeBatches = new WeakMap<readonly ElementShape[], ShapeBatch>();
/** The shapes last read, which the next ones are read from when they keep their keys. */
let lastRead: { shapes: readonly ElementShape[]; batch: ShapeBatch } | undefined;

/**
 * Every shape of a list as the avoider reads it: its plate for one drawn by its picture. A list that
 * keeps the keys of the last one read, as after a move or a rename, is read from it, again only where
 * its shapes changed.
 */
export function avoidShapesOf(shapes: readonly ElementShape[]): ShapeBatch {
  const known = shapeBatches.get(shapes);
  if (known) return known;
  const batch =
    (lastRead && readAgain(lastRead.shapes, lastRead.batch, shapes)) ?? readAfresh(shapes);
  shapeBatches.set(shapes, batch);
  lastRead = { shapes, batch };
  return batch;
}

function readAfresh(shapes: readonly ElementShape[]): ShapeBatch {
  const indexes = new Map<string, number>();
  shapes.forEach((shape, at) => indexes.set(shape.key, at));
  const rects = new Float64Array(shapes.length * 4);
  const parents = new Int32Array(shapes.length);
  const plates = new Float64Array(shapes.length);
  const plain = new Uint8Array(shapes.length);
  shapes.forEach((shape, at) => {
    write(rects, plates, plain, shape, at);
    parents[at] =
      shape.containerShape === undefined ? -1 : (indexes.get(shape.containerShape) ?? -1);
  });
  return { shapes: { rects, parents, plates }, indexes, plain };
}

function readAgain(
  before: readonly ElementShape[],
  batch: ShapeBatch,
  shapes: readonly ElementShape[],
): ShapeBatch | undefined {
  if (before.length !== shapes.length) return undefined;
  const changed: number[] = [];
  for (let at = 0; at < shapes.length; at++) {
    const was = before[at] as ElementShape;
    const now = shapes[at] as ElementShape;
    if (was === now) continue;
    if (was.key !== now.key) return undefined;
    changed.push(at);
  }
  if (changed.length === 0) return batch;
  const rects = batch.shapes.rects.slice();
  const plates = batch.shapes.plates.slice();
  const plain = batch.plain.slice();
  for (const at of changed) write(rects, plates, plain, shapes[at] as ElementShape, at);
  return {
    shapes: { rects, parents: batch.shapes.parents, plates },
    indexes: batch.indexes,
    plain,
  };
}

function write(
  rects: Float64Array,
  plates: Float64Array,
  plain: Uint8Array,
  shape: ElementShape,
  at: number,
): void {
  plain[at] = plainEnd(shape) ? 1 : 0;
  const rect = shape.plate ?? shape.rect;
  rects[at * 4] = rect.x;
  rects[at * 4 + 1] = rect.y;
  rects[at * 4 + 2] = rect.width;
  rects[at * 4 + 3] = rect.height;
  plates[at] = plateWidth(shape);
}

/** Which lines of a scene go around what is in their way, a flag for each, and the lines. */
interface Eligible {
  relations: readonly RelationLine[];
  shapes: readonly ElementShape[];
  batch: ShapeBatch;
  flags: Uint8Array;
  lines: readonly RelationLine[];
  /** Whether no line of the scene ends on another. */
  unattached: boolean;
}

const eligible = new WeakMap<readonly RelationLine[], Eligible>();
/** The lines last sorted, which the next ones are sorted from where they are the same. */
let lastSorted: Eligible | undefined;

/** Which of a scene's lines go around what is in their way, a flag for each of its relations. */
export function routedFlagsOf(scene: Scene): Uint8Array {
  routedLinesOf(scene);
  return (eligible.get(scene.relations) as Eligible).flags;
}

/**
 * The lines of a scene that go around what is in their way (`routesAround`), in drawing order. A
 * line the last scene sorted, at the same place, between shapes that kept their keys and how they
 * attach, keeps what it was found to be, while no line ends on another in either scene.
 */
export function routedLinesOf(scene: Scene): readonly RelationLine[] {
  const known = eligible.get(scene.relations);
  if (known?.shapes === scene.shapes) return known.lines;
  const batch = avoidShapesOf(scene.shapes);
  const endingOn = endingOnOf(scene);
  const { relations } = scene;
  const before = lastSorted;
  const reuse =
    before !== undefined &&
    before.relations.length === relations.length &&
    before.batch.indexes === batch.indexes &&
    before.unattached &&
    endingOn.size === 0;
  const flags = new Uint8Array(relations.length);
  const lines: RelationLine[] = [];
  for (let at = 0; at < relations.length; at++) {
    const line = relations[at] as RelationLine;
    let flag: number;
    if (reuse && before.relations[at] === line) {
      const ends = shapeEnds.get(line);
      const same =
        ends === undefined ||
        (batch.plain[ends.from] === before.batch.plain[ends.from] &&
          batch.plain[ends.to] === before.batch.plain[ends.to]);
      flag = same ? (before.flags[at] as number) : routesAround(line, batch, endingOn) ? 1 : 0;
    } else {
      flag = routesAround(line, batch, endingOn) ? 1 : 0;
    }
    flags[at] = flag;
    if (flag === 1) lines.push(line);
  }
  const sorted: Eligible = {
    relations,
    shapes: scene.shapes,
    batch,
    flags,
    lines,
    unattached: endingOn.size === 0,
  };
  eligible.set(relations, sorted);
  lastSorted = sorted;
  return lines;
}

/**
 * What the avoider is given for a scene: every shape, and the lines that may go around what is in
 * their way, all of them or those of `only`.
 */
export function avoidBatchOf(scene: Scene, only?: ReadonlySet<RelationLine>): AvoidBatch {
  const batch = avoidShapesOf(scene.shapes);
  const lines: AvoidLine[] = [];
  const drawn: RelationLine[] = [];
  for (const line of routedLinesOf(scene)) {
    if (only && !only.has(line)) continue;
    const ends = shapeEndsOf(line, batch);
    if (!ends) continue;
    const offset = line.ends?.offset ?? 0;
    const from = scene.shapes[ends.from];
    const to = scene.shapes[ends.to];
    // A line on an outline is routed around by its stand-in route between the boxes.
    const onOutline = outlinedEnd(from) !== undefined || outlinedEnd(to) !== undefined;
    const route =
      onOutline && from && to
        ? routeBetweenEnds({ rect: from.plate ?? from.rect }, { rect: to.plate ?? to.rect }, offset)
        : line.route;
    lines.push({ from: ends.from, to: ends.to, offset, route: flatRoute(route) });
    drawn.push(line);
  }
  return { shapes: batch.shapes, lines, drawn };
}

function flatRoute(route: readonly Point[]): Float64Array {
  const flat = new Float64Array(route.length * 2);
  route.forEach((point, at) => {
    flat[2 * at] = point.x;
    flat[2 * at + 1] = point.y;
  });
  return flat;
}

function routeOf(flat: Float64Array): Point[] {
  const route: Point[] = [];
  for (let at = 0; at + 1 < flat.length; at += 2) {
    route.push({ x: flat[at] as number, y: flat[at + 1] as number });
  }
  return route;
}

/** Each line drawn along a route around shapes, kept for the line and the route it was given. */
const rerouted = new WeakMap<
  RelationLine,
  { route: Float64Array; line: RelationLine; bounds: Rect }
>();

/**
 * The line along a route around what was in its way, its ends carried on to the outlines it ends
 * on, with its bounds: the same for the same line and route, whose ends' outlines are the same.
 */
function alongWithBounds(
  line: RelationLine,
  flat: Float64Array,
  carried?: Carried,
): { line: RelationLine; bounds: Rect } {
  const kept = rerouted.get(line);
  if (kept && kept.route === flat) return kept;
  const route = carried ? carriedOrthogonal(routeOf(flat), carried.from, carried.to) : routeOf(flat);
  const start = route[0] as Point;
  const end = route.at(-1) as Point;
  const beforeEnd = route.at(-2) as Point;
  const along: RelationLine = { ...line, route, from: start, to: end, middle: midpointOf(route) };
  if (line.arrowhead) along.arrowhead = arrowheadAt(beforeEnd, end, line.width);
  const made = { route: flat, line: along, bounds: routeBounds(route) };
  rerouted.set(line, made);
  return made;
}

/**
 * The line along a route around what was in its way, carried on to the outlines of `shapes` it ends
 * on: the same object for the same line and route.
 */
export function lineAlong(
  line: RelationLine,
  flat: Float64Array,
  shapes?: readonly ElementShape[],
): RelationLine {
  return alongWithBounds(line, flat, shapes && carriedEndsOf(line, shapeFinder(shapes))).line;
}

/** Finds a list's shapes by key, through the avoider's index of them. */
function shapeFinder(shapes: readonly ElementShape[]): (key: string) => ElementShape | undefined {
  const { indexes } = avoidShapesOf(shapes);
  return (key) => {
    const at = indexes.get(key);
    return at === undefined ? undefined : shapes[at];
  };
}

const endings = new WeakMap<readonly RelationLine[], Map<string, RelationLine[]>>();

/** The lines that end on each line of a scene, by its key. */
function endingOnOf(scene: Scene): ReadonlyMap<string, readonly RelationLine[]> {
  let byLine = endings.get(scene.relations);
  if (!byLine) {
    byLine = new Map();
    for (const line of scene.relations) {
      for (const end of [line.ends?.from, line.ends?.to]) {
        if (end?.kind !== 'relation') continue;
        const list = byLine.get(end.relation);
        if (list) list.push(line);
        else byLine.set(end.relation, [line]);
      }
    }
    endings.set(scene.relations, byLine);
  }
  return byLine;
}

/** Each line that follows another's middle, kept for the line it followed. */
const following = new WeakMap<RelationLine, { target: RelationLine; line: RelationLine }>();

/**
 * A line that ends on `target`, routed again to where `target`'s middle now is, as the scene routes
 * a line to a relation: the same object for the same target.
 */
function lineFollowing(
  line: RelationLine,
  target: RelationLine,
  shapeOf: (key: string) => ElementShape | undefined,
): RelationLine {
  const kept = following.get(line);
  if (kept?.target === target) return kept.line;
  const ends = line.ends as NonNullable<RelationLine['ends']>;
  const endOf = (end: NonNullable<RelationLine['ends']>['from']) => {
    if (end.kind === 'relation') return { point: target.middle };
    const shape = shapeOf(end.key) as ElementShape;
    return { rect: shape.plate ?? shape.rect };
  };
  const between = routeBetweenEnds(endOf(ends.from), endOf(ends.to), ends.offset);
  const carried = carriedEndsOf(line, shapeOf);
  const route = carried ? carriedOrthogonal(between, carried.from, carried.to) : between;
  const end = route.at(-1) as Point;
  const beforeEnd = route.at(-2) as Point;
  const moved: RelationLine = {
    ...line,
    route,
    from: route[0] as Point,
    to: end,
    middle: midpointOf(route),
  };
  if (line.arrowhead) moved.arrowhead = arrowheadAt(beforeEnd, end, line.width);
  following.set(line, { target, line: moved });
  return moved;
}

/** A scene drawn with routes around shapes, and what changed in those routes since. */
export interface Composed {
  /** The scene as built. */
  base: Scene;
  /** What it drew for each of its lines. */
  drawn: readonly RelationLine[];
  /** The lines whose routes came, or changed, since. */
  changed: ReadonlySet<RelationLine>;
}

/**
 * The scene with each line `routeOfLine` gives a route drawn along it, and the lines that end on
 * those following their middles, its bounds grown to hold them; the scene itself when it gives none.
 * With `previous`, a line that is the same and whose route did not change since is drawn as then.
 */
export function withAvoidedRoutes(
  scene: Scene,
  routeOfLine: (line: RelationLine) => Float64Array | undefined,
  previous?: Composed,
): Scene {
  const endingOn = endingOnOf(scene);
  const relations = scene.relations.slice();
  let bounds = scene.bounds;
  let any = false;
  // What was drawn before, for the lines that are the same and routed the same.
  const reuse =
    previous !== undefined &&
    previous.base.relations.length === relations.length &&
    endingOn.size === 0;
  // The lines others end on that moved, which those others follow.
  let targets: Map<string, RelationLine> | undefined;
  let shapeOf: ((key: string) => ElementShape | undefined) | undefined;
  for (let at = 0; at < relations.length; at++) {
    const line = relations[at] as RelationLine;
    if (reuse && previous.base.relations[at] === line && !previous.changed.has(line)) {
      const drawn = previous.drawn[at] as RelationLine;
      if (drawn === line) continue;
      relations[at] = drawn;
      const kept = rerouted.get(line);
      if (kept) bounds = union(bounds, kept.bounds);
      any = true;
      continue;
    }
    const route = routeOfLine(line);
    if (!route) continue;
    shapeOf ??= shapeFinder(scene.shapes);
    const along = alongWithBounds(line, route, carriedEndsOf(line, shapeOf));
    relations[at] = along.line;
    bounds = union(bounds, along.bounds);
    any = true;
    if (endingOn.has(line.relation)) (targets ??= new Map()).set(line.relation, along.line);
  }
  if (!any) return scene;
  if (targets) {
    const find = shapeOf ?? shapeFinder(scene.shapes);
    const followers = new Map<RelationLine, RelationLine>();
    for (const [key, target] of targets) {
      for (const line of endingOn.get(key) ?? []) {
        followers.set(line, lineFollowing(line, target, find));
      }
    }
    for (let at = 0; at < relations.length; at++) {
      const follower = followers.get(relations[at] as RelationLine);
      if (!follower) continue;
      relations[at] = follower;
      bounds = union(bounds, routeBounds(follower.route));
    }
  }
  return withRelations(scene, relations, bounds);
}

/** The most lines the read-only page routes around shapes as it opens a view, at once. */
export const PAGE_ROUTES = 400;

/**
 * The scene as the read-only page draws it: its lines routed around shapes at once when it has few
 * enough for that to cost no more than a short wait as the view opens; as built otherwise, since the
 * page has no worker of its own to route a large view in.
 */
export function pageScene(scene: Scene): Scene {
  return scene.relations.length <= PAGE_ROUTES ? avoidedScene(scene) : scene;
}

/**
 * The scene with every line that may go around what is in its way routed so, at once, as the
 * exports draw it; the canvas routes in a worker instead (`useAvoidedRoutes`).
 */
export function avoidedScene(scene: Scene): Scene {
  const batch = avoidBatchOf(scene);
  if (batch.lines.length === 0) return scene;
  const results = avoidRoutes(batch.shapes, batch.lines);
  const routes = new Map<RelationLine, Float64Array>();
  results.forEach((result, at) => {
    if (result.route) routes.set(batch.drawn[at] as RelationLine, result.route);
  });
  return withAvoidedRoutes(scene, (line) => routes.get(line));
}

function routeBounds(route: readonly Point[]): Rect {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const { x, y } of route) {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function union(a: Rect | undefined, b: Rect): Rect {
  if (!a) return b;
  const within =
    b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height;
  if (within) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}
