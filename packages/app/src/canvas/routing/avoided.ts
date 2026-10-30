/**
 * The scene's side of routing around shapes (`avoid.ts`, ADR 0039's clarification of 2026-10-26):
 * which lines may go around what is in their way, what the avoider is given for a scene, and the
 * scene with the routes it gave. Only automatic orthogonal lines between two shapes are routed so:
 * a route set by hand, a curved or straight one, one to a connection point, or to another relation's
 * line keeps the route the scene gives it. A line that other lines end on is routed so when each of
 * those runs from a plain shape and nothing ends on it: they follow its middle.
 *
 * Lines beside rows, and on shapes that draw rows, are routed too (ADR 0080, section 2, superseding
 * W49's exclusion of them): each such end leaves its table's side at its row's middle, on the side
 * the scene chose, facing the other end, with a stub of `STUB`. A line from a row to its own table
 * keeps its short C.
 *
 * A shape with an outline of its own (ADR 0066, ADR 0067) is routed around by its box: the avoider is
 * given the line's stand-in route between the boxes, and the route it gives back is carried on from
 * the boxes to the outlines, as the scene carries the stand-in on. A part of lines alone, which a line
 * leaves from a point of its lines, is not a plain end. A shape's name tag is part of it: lines go
 * around the box that holds the shape and its tag, and reach it there (ADR 0066's clarification of
 * 2026-10-27).
 */
import { estimateWidth } from '../fit';
import { arrowheadAt, type Point, type Rect } from '../geometry';
import { midpointOf, routeBetweenEnds } from '../route';
import { withRelations, type ElementShape, type RelationLine, type Scene } from '../scene';
import { headerShift } from '../shape-images';
import {
  PLATE_HEIGHT,
  STUB,
  avoidRoutes,
  type AvoidLine,
  type AvoidShapes,
  type AvoidSide,
} from './avoid';
import { withRoundedCorners } from './rounded';
import { spreadChannels, type ChannelInput, type ChannelOutput } from './channels';
import {
  carriedOrthogonal,
  endOutline,
  onlyStrokes,
  routeBoxOf,
  type OutlinedEnd,
} from './outline-ends';

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

/**
 * Whether routing around keeps a shape's end of a line: one that attaches as a plain rectangle, one
 * beside a row, or one on a shape that draws rows (ADR 0080, section 2).
 */
function routedEnd(shape: ElementShape | undefined): shape is ElementShape {
  return (
    shape !== undefined &&
    shape.points === undefined &&
    !(shape.outline !== undefined && onlyStrokes(shape.outline))
  );
}

/** Whether lines leave a shape beside it, as a row and a shape that draws rows (ADR 0023). */
function besideRows(shape: ElementShape): boolean {
  return shape.row !== undefined || shape.rowCount !== undefined;
}

/**
 * Where a line's end on a shape with an outline of its own lies: its box, with its name tag, and its
 * outline there.
 */
function outlinedEnd(shape: ElementShape | undefined): OutlinedEnd | undefined {
  if (!shape) return undefined;
  const rect = shape.plate ?? shape.rect;
  const outline = endOutline(shape, rect);
  return outline && { rect: routeBoxOf(shape, rect), outline };
}

/** The box the avoider reads of a shape: its plate, or its rectangle with its name tag. */
function avoidedBoxOf(shape: ElementShape): Rect {
  return shape.plate ?? routeBoxOf(shape, shape.rect);
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

/** Whether a line takes an automatic orthogonal route: drawn so, or with rounded corners (ADR 0080). */
function automatic(line: RelationLine): boolean {
  return !line.hand && line.style === undefined && (!line.curve || line.rounded !== undefined);
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
  // One that leaves beside a row keeps its route to the middle it ends on, beside its row.
  return at !== undefined && batch.plain[at] === 1 && batch.beside[at] === -1;
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
  /** 1 for each shape a routed line may end on (`routedEnd`). */
  plain: Uint8Array;
  /**
   * For each shape lines leave beside (`besideRows`), the index of the shape whose side they leave:
   * a row's table, or the shape itself; -1 for every other.
   */
  beside: Int32Array;
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
  const beside = new Int32Array(shapes.length);
  const inside = new Uint8Array(shapes.length);
  const open = new Uint8Array(shapes.length);
  shapes.forEach((shape, at) => {
    write(rects, plates, plain, shape, at);
    parents[at] =
      shape.containerShape === undefined ? -1 : (indexes.get(shape.containerShape) ?? -1);
    // A row is gone around as its table.
    inside[at] = shape.row === undefined ? 0 : 1;
    open[at] = drawnOpen(shape) ? 1 : 0;
  });
  shapes.forEach((shape, at) => {
    beside[at] = besideOf(shape, at, indexes);
  });
  return { shapes: { rects, parents, plates, inside, open }, indexes, plain, beside };
}

/** Whether a container is drawn open, its contents drawn: lines beside rows run through it. */
function drawnOpen(shape: ElementShape): boolean {
  return shape.holdsContents && shape.collapsed === undefined && shape.rowCount === undefined;
}

/** The shape whose side lines leave a shape by: see `ShapeBatch.beside`. */
function besideOf(shape: ElementShape, at: number, indexes: ReadonlyMap<string, number>): number {
  if (!besideRows(shape)) return -1;
  if (shape.row === undefined) return at;
  return shape.containerShape === undefined ? -1 : (indexes.get(shape.containerShape) ?? -1);
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
  let beside = batch.beside;
  let open = batch.shapes.open;
  for (const at of changed) {
    const shape = shapes[at] as ElementShape;
    write(rects, plates, plain, shape, at);
    const opened = drawnOpen(shape) ? 1 : 0;
    if (open && open[at] !== opened) {
      if (open === batch.shapes.open) open = open.slice();
      open[at] = opened;
    }
    const now = besideOf(shape, at, batch.indexes);
    if (now !== beside[at]) {
      if (beside === batch.beside) beside = beside.slice();
      beside[at] = now;
    }
  }
  return {
    shapes: { ...batch.shapes, rects, plates, ...(open ? { open } : {}) },
    indexes: batch.indexes,
    plain,
    beside,
  };
}

function write(
  rects: Float64Array,
  plates: Float64Array,
  plain: Uint8Array,
  shape: ElementShape,
  at: number,
): void {
  plain[at] = routedEnd(shape) ? 1 : 0;
  const rect = avoidedBoxOf(shape);
  rects[at * 4] = rect.x;
  rects[at * 4 + 1] = rect.y;
  rects[at * 4 + 2] = rect.width;
  rects[at * 4 + 3] = rect.height;
  // A shape that draws rows writes its name in its header, inside the block routes go around.
  plates[at] = shape.rowCount === undefined ? plateWidth(shape) : 0;
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
        ? routeBetweenEnds({ rect: avoidedBoxOf(from) }, { rect: avoidedBoxOf(to) }, offset)
        : line.route;
    const avoided: AvoidLine = { from: ends.from, to: ends.to, offset, route: flatRoute(route) };
    const fromSide = sideOf(batch, ends.from, route[0] as Point);
    const toSide = sideOf(batch, ends.to, route.at(-1) as Point);
    if (fromSide) avoided.fromSide = fromSide;
    if (toSide) avoided.toSide = toSide;
    lines.push(avoided);
    drawn.push(line);
  }
  return { shapes: batch.shapes, lines, drawn };
}

/**
 * How a line's end leaves beside a row, read from where its stand-in route leaves: the side of the
 * table the scene chose, at the row's middle. Undefined for an end that does not leave beside one.
 */
function sideOf(batch: ShapeBatch, at: number, point: Point): AvoidSide | undefined {
  const table = batch.beside[at] ?? -1;
  if (table < 0) return undefined;
  const { rects } = batch.shapes;
  const left = rects[table * 4] as number;
  const width = rects[table * 4 + 2] as number;
  const way = Math.abs(point.x - (left + width)) <= Math.abs(point.x - left) ? 1 : -1;
  return { shape: table, way, y: point.y };
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
  const route = carried
    ? carriedOrthogonal(routeOf(flat), carried.from, carried.to)
    : routeOf(flat);
  const start = route[0] as Point;
  const end = route.at(-1) as Point;
  const beforeEnd = route.at(-2) as Point;
  const along: RelationLine = { ...line, route, from: start, to: end, middle: midpointOf(route) };
  if (line.arrowhead) along.arrowhead = arrowheadAt(beforeEnd, end, line.width);
  withRoundedCorners(along);
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
  return channelledScene(routedAroundScene(scene), scene);
}

/** The scene with every line that may go around what is in its way routed so, before the channels. */
export function routedAroundScene(
  scene: Scene,
  kept?: ReadonlyMap<string, readonly Point[]>,
): Scene {
  const all = avoidBatchOf(scene);
  if (all.lines.length === 0) return scene;
  // Lines drawn along routes kept from elsewhere, as ELK's, are not routed: their routes are runs
  // the others keep apart from.
  const batch: AvoidBatch = { shapes: all.shapes, lines: [], drawn: [] };
  const existing: AvoidLine[] = [];
  all.lines.forEach((line, at) => {
    const drawn = all.drawn[at] as RelationLine;
    const points = kept?.get(drawn.relation);
    if (points) existing.push({ ...line, route: flatRoute(points) });
    else {
      batch.lines.push(line);
      batch.drawn.push(drawn);
    }
  });
  const results = avoidRoutes(batch.shapes, batch.lines, existing);
  const routes = new Map<RelationLine, Float64Array>();
  results.forEach((result, at) => {
    if (result.route) routes.set(batch.drawn[at] as RelationLine, result.route);
  });
  return withAvoidedRoutes(scene, (line) => routes.get(line));
}

/** What the channel pass is given for a scene as drawn, and the lines it holds, in its order. */
export interface ChannelBatch {
  input: ChannelInput;
  lines: readonly RelationLine[];
}

/**
 * What the channel pass is given for `drawn`, a scene as drawn from `base`: every line with a route,
 * the automatic orthogonal ones that `base` routes around shapes free to move, but for those `keeps`
 * says keep their route, as ELK's kept routes do; every block and name plate as what they keep clear
 * of. Undefined when no line may move.
 */
export function channelBatchOf(
  drawn: Scene,
  base: Scene,
  keeps?: (line: RelationLine) => boolean,
): ChannelBatch | undefined {
  const flags = routedFlagsOf(base);
  const routed = new Set<string>();
  base.relations.forEach((line, at) => {
    if (flags[at] === 1) routed.add(line.relation);
  });
  if (routed.size === 0) return undefined;
  const shapeOf = shapeFinder(drawn.shapes);
  const endNumbers = new Map<string, number>();
  const numberOf = (key: string) => {
    let number = endNumbers.get(key);
    if (number === undefined) {
      number = endNumbers.size;
      endNumbers.set(key, number);
    }
    return number;
  };
  const lines = drawn.relations.filter((line) => line.route.length >= 2);
  let count = 0;
  for (const line of lines) count += line.route.length;
  const points = new Float64Array(count * 2);
  const starts = new Int32Array(lines.length + 1);
  const ends = new Int32Array(lines.length * 2);
  const movable = new Uint8Array(lines.length);
  const stubs = new Float64Array(lines.length * 2);
  let any = false;
  let at = 0;
  lines.forEach((line, index) => {
    starts[index] = at;
    for (const point of line.route) {
      points[2 * at] = point.x;
      points[2 * at + 1] = point.y;
      at += 1;
    }
    const drawnEnds = [line.ends?.from, line.ends?.to];
    drawnEnds.forEach((end, side) => {
      const key =
        end === undefined
          ? `line ${line.relation} ${side}`
          : end.kind === 'shape'
            ? `shape ${end.key}`
            : `relation ${end.relation}`;
      ends[2 * index + side] = numberOf(key);
      const shape = end?.kind === 'shape' ? shapeOf(end.key) : undefined;
      stubs[2 * index + side] = shape && besideRows(shape) ? STUB : PLAIN_STUB;
    });
    // A relation from a row to its own table keeps its short C.
    const tables = drawnEnds.map((end) => {
      const shape = end?.kind === 'shape' ? shapeOf(end.key) : undefined;
      return shape?.row === undefined ? shape?.key : shape.containerShape;
    });
    const own = tables[0] !== undefined && tables[0] === tables[1];
    const moves =
      routed.has(line.relation) &&
      !own &&
      (!line.curve || line.rounded !== undefined) &&
      orthogonalRoute(line.route) &&
      !keeps?.(line);
    movable[index] = moves ? 1 : 0;
    any ||= moves;
  });
  starts[lines.length] = at;
  if (!any) return undefined;
  return {
    input: { obstacles: channelObstaclesOf(drawn.shapes), points, starts, ends, movable, stubs },
    lines,
  };
}

/** How long a line's first run out of a plain shape stays at least, as the channel pass moves it. */
const PLAIN_STUB = 8;

function orthogonalRoute(route: readonly Point[]): boolean {
  for (let at = 1; at < route.length; at++) {
    const p = route[at - 1] as Point;
    const q = route[at] as Point;
    if (p.x !== q.x && p.y !== q.y) return false;
  }
  return true;
}

const channelObstacles = new WeakMap<readonly ElementShape[], Float64Array>();

/**
 * What lines keep clear of in the channel pass: every shape drawn as one block, a row's table
 * rather than its rows, and the name plate of every container drawn open.
 */
function channelObstaclesOf(shapes: readonly ElementShape[]): Float64Array {
  let rects = channelObstacles.get(shapes);
  if (rects) return rects;
  const list: number[] = [];
  for (const shape of shapes) {
    if (shape.row !== undefined || shape.part?.inDrawing === true) continue;
    const rect = drawnOpen(shape) ? namePlateOf(shape) : avoidedBoxOf(shape);
    if (rect) list.push(rect.x, rect.y, rect.width, rect.height);
  }
  rects = Float64Array.from(list);
  channelObstacles.set(shapes, rects);
  return rects;
}

/**
 * The scene with the routes the channel pass gave for `batch`: each line whose route changed drawn
 * along it; the scene itself when none changed.
 */
export function withChannels(scene: Scene, batch: ChannelBatch, output: ChannelOutput): Scene {
  const { points, starts } = output;
  const moved = new Map<RelationLine, Point[]>();
  batch.lines.forEach((line, index) => {
    if (batch.input.movable[index] !== 1) return;
    const from = starts[index] as number;
    const count = (starts[index + 1] as number) - from;
    const route = line.route;
    let same = count === route.length;
    for (let at = 0; same && at < route.length; at++) {
      const point = route[at] as Point;
      if (point.x !== points[2 * (from + at)] || point.y !== points[2 * (from + at) + 1]) {
        same = false;
      }
    }
    if (same || count < 2) return;
    const along: Point[] = [];
    for (let at = 0; at < count; at++) {
      along.push({
        x: points[2 * (from + at)] as number,
        y: points[2 * (from + at) + 1] as number,
      });
    }
    moved.set(line, along);
  });
  return withMovedRoutes(scene, moved);
}

/** A view's routes from its last channel pass, by relation: the route it was given, and gave. */
export type Channelled = ReadonlyMap<string, { from: readonly Point[]; to: Point[] }>;

/**
 * The scene with each line drawn along the route the last channel pass gave it, while the line still
 * runs along the route the pass was given; a line routed again since is drawn as routed.
 */
export function withChannelled(scene: Scene, channelled: Channelled): Scene {
  const moved = new Map<RelationLine, Point[]>();
  for (const line of scene.relations) {
    const known = channelled.get(line.relation);
    if (!known || !samePoints(known.from, line.route) || samePoints(known.to, line.route)) continue;
    moved.set(line, known.to);
  }
  return withMovedRoutes(scene, moved);
}

function samePoints(a: readonly Point[], b: readonly Point[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((point, at) => point.x === (b[at] as Point).x && point.y === (b[at] as Point).y);
}

/**
 * The lines of `drawn` that routing around may route, but those of `skip`, by relation, as the
 * avoider is given lines drawn already: their ends, and their routes as drawn.
 */
export function existingLinesOf(drawn: Scene, base: Scene, skip: ReadonlySet<string>): AvoidLine[] {
  const flags = routedFlagsOf(base);
  const routed = new Set<string>();
  base.relations.forEach((line, at) => {
    if (flags[at] === 1 && !skip.has(line.relation)) routed.add(line.relation);
  });
  if (routed.size === 0) return [];
  const { indexes } = avoidShapesOf(base.shapes);
  const lines: AvoidLine[] = [];
  for (const line of drawn.relations) {
    if (!routed.has(line.relation)) continue;
    const ends = line.ends;
    if (ends?.from.kind !== 'shape' || ends.to.kind !== 'shape') continue;
    const from = indexes.get(ends.from.key);
    const to = indexes.get(ends.to.key);
    if (from === undefined || to === undefined) continue;
    lines.push({ from, to, offset: ends.offset, route: flatRoute(line.route) });
  }
  return lines;
}

/** The scene with each line of `moved` drawn along its new route; the scene itself for none. */
function withMovedRoutes(scene: Scene, moved: ReadonlyMap<RelationLine, Point[]>): Scene {
  if (moved.size === 0) return scene;
  let bounds = scene.bounds;
  const relations = scene.relations.map((line) => {
    const route = moved.get(line);
    if (!route) return line;
    const end = route.at(-1) as Point;
    const along: RelationLine = {
      ...line,
      route,
      from: route[0] as Point,
      to: end,
      middle: midpointOf(route),
    };
    if (line.arrowhead) along.arrowhead = arrowheadAt(route.at(-2) as Point, end, line.width);
    withRoundedCorners(along);
    bounds = union(bounds, routeBounds(route));
    return along;
  });
  return withRelations(scene, relations, bounds);
}

/**
 * The scene as drawn with its lines spread into channels, at once, as the exports draw it; the canvas
 * spreads them in the routing worker instead (`useAvoidedRoutes`).
 */
export function channelledScene(
  drawn: Scene,
  base: Scene,
  keeps?: (line: RelationLine) => boolean,
): Scene {
  const batch = channelBatchOf(drawn, base, keeps);
  if (!batch) return drawn;
  return withChannels(drawn, batch, spreadChannels(batch.input));
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
