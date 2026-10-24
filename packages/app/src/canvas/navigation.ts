/**
 * Moving through a view from the keyboard: the nearest shape in a direction, the shape nearest a
 * point, a shape's container and the first shape inside it, and the relations drawn on an element in
 * the order the keys step through them. Every search goes through the spatial index and widens only as
 * far as it must, so it looks at the shapes around where it starts, not at every shape of the view.
 *
 * What the canvas hides, as filters and isolating do, the keys skip: the shell says what each scene
 * hides with `setHidden`, from the same sets the canvas draws.
 */
import { modelIndexOf, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, ModelFile, Relation } from '@visual-anything/schema';
import { boundsOf, centerOf, distance, type Point, type Rect } from './geometry';
import type { IndexedScene } from './hit';
import type { ArrowShape, ElementShape, NoteShape, RelationLine, Scene } from './scene';
import { rectAround } from './spatial';

export type Direction = 'left' | 'right' | 'up' | 'down';

/** A shape the keys can select: an element's shape, or a free shape. */
export type Reachable =
  | { kind: 'shape'; shape: ElementShape }
  | { kind: 'note'; note: NoteShape }
  | { kind: 'arrow'; arrow: ArrowShape };

type ReachedShape = Extract<Reachable, { kind: 'shape' }>;

/** Where a move starts: what is selected, as a rectangle, and the element's shape it is, if it is one. */
export interface Start {
  rect: Rect;
  shape?: ElementShape;
}

/**
 * How much the offset across a direction counts against a shape, compared with the gap along it: a
 * shape in the same row wins over a nearer one in the next row.
 */
const ACROSS_WEIGHT = 2;
/** How far, in scene units, a search first looks; it looks twice as far each time it finds nothing. */
const FIRST_REACH = 256;

/** What each scene hides, by the keys of `editor/emphasis.ts`. */
const hiddenInScenes = new WeakMap<Scene, ReadonlySet<string>>();

/**
 * Says what the canvas hides in a scene: element shapes by their keys, relations and free shapes by
 * their ids. The keys skip it from then on; undefined hides nothing.
 */
export function setHidden(scene: Scene, hidden: ReadonlySet<string> | undefined): void {
  if (hidden === undefined) hiddenInScenes.delete(scene);
  else hiddenInScenes.set(scene, hidden);
}

/** What the canvas hides in a scene, as `setHidden` last said. */
export function hiddenIn(scene: Scene): ReadonlySet<string> | undefined {
  return hiddenInScenes.get(scene);
}

/** Whether the canvas hides something of a scene. */
function isHidden(scene: Scene, key: string): boolean {
  return hiddenInScenes.get(scene)?.has(key) ?? false;
}

export function rectOf(reachable: Reachable): Rect {
  switch (reachable.kind) {
    case 'shape':
      return reachable.shape.rect;
    case 'note':
      return reachable.note.rect;
    case 'arrow':
      return rectAround([reachable.arrow.from, reachable.arrow.to]);
  }
}

/**
 * How far `to` lies from `from` in a direction: the gap between them along it, plus twice the offset
 * across it. Undefined when the middle of `to` is not beyond the middle of `from` in that direction.
 */
export function directionScore(from: Rect, to: Rect, direction: Direction): number | undefined {
  const start = centerOf(from);
  const end = centerOf(to);
  const horizontal = direction === 'left' || direction === 'right';
  const ahead =
    direction === 'right'
      ? end.x > start.x
      : direction === 'left'
        ? end.x < start.x
        : direction === 'down'
          ? end.y > start.y
          : end.y < start.y;
  if (!ahead) return undefined;
  const along =
    direction === 'right'
      ? to.x - (from.x + from.width)
      : direction === 'left'
        ? from.x - (to.x + to.width)
        : direction === 'down'
          ? to.y - (from.y + from.height)
          : from.y - (to.y + to.height);
  const across = horizontal
    ? gapBetween(from.y, from.height, to.y, to.height)
    : gapBetween(from.x, from.width, to.x, to.width);
  return Math.max(0, along) + ACROSS_WEIGHT * across;
}

/**
 * The nearest shape in a direction from `start`. The containers the start sits in surround it and the
 * shapes it holds lie within it, so neither counts, and neither do the other shapes of its element,
 * which a selection already holds. A container on the way is entered: the move goes on to the nearest
 * shape inside it, for as long as there is one in that direction, wherever its contents sit, even
 * outside its rectangle. What the canvas hides is skipped.
 */
export function nearestInDirection(
  indexed: IndexedScene,
  start: Start,
  direction: Direction,
): Reachable | undefined {
  const bounds = indexed.scene.bounds;
  if (!bounds) return undefined;
  const shape = start.shape;
  const allowed = (candidate: ElementShape) =>
    !shape ||
    (candidate.element !== shape.element &&
      !candidate.key.startsWith(`${shape.key}/`) &&
      !shape.key.startsWith(`${candidate.key}/`));

  let reached = bestInDirection(indexed, start.rect, direction, bounds, (rect) => [
    ...shapesIn(indexed, rect, allowed),
    ...freeShapesIn(indexed, rect),
  ]);
  while (reached?.kind === 'shape' && reached.shape.holdsContents) {
    const container: ElementShape = reached.shape;
    const inner = bestInDirection(indexed, start.rect, direction, container.extent, (rect) =>
      shapesIn(
        indexed,
        rect,
        (candidate) => candidate.containerShape === container.key && allowed(candidate),
      ),
    );
    if (!inner) break;
    reached = inner;
  }
  return reached;
}

/**
 * The shape nearest a point: the topmost one under it, as a click there would find, or else the one
 * whose outline comes closest. What the canvas hides is skipped.
 */
export function nearestTo(indexed: IndexedScene, point: Point): Reachable | undefined {
  const bounds = indexed.scene.bounds;
  if (!bounds) return undefined;
  const enough = farthestCorner(point, bounds);
  return search(
    bounds,
    (reach) => around(point, reach),
    enough,
    (rect) => {
      let best: Scored | undefined;
      const consider = (reachable: Reachable, rank: number) => {
        if (isHidden(indexed.scene, reachableKey(reachable))) return;
        const score = distanceToRect(point, rectOf(reachable));
        // At the same distance, what is drawn on top wins: free shapes, then the element shape drawn
        // last.
        if (!best || score < best.score || (score === best.score && rank >= best.rank)) {
          best = { reachable, score, distance: 0, rank };
        }
      };
      for (const at of indexed.shapes.query(rect)) {
        const shape = indexed.scene.shapes[at] as ElementShape;
        consider({ kind: 'shape', shape }, indexed.rankOf[at] as number);
      }
      const above = indexed.scene.shapes.length;
      for (const at of indexed.notes.query(rect)) {
        consider({ kind: 'note', note: indexed.scene.notes[at] as NoteShape }, above + at);
      }
      const top = above + indexed.scene.notes.length;
      for (const at of indexed.arrows.query(rect)) {
        consider({ kind: 'arrow', arrow: indexed.scene.arrows[at] as ArrowShape }, top + at);
      }
      return best;
    },
  )?.reachable;
}

/**
 * The shape of the container a shape sits in, or of the nearest one around it that the canvas does
 * not hide; none for a shape directly in World.
 */
export function containerOf(indexed: IndexedScene, shape: ElementShape): ElementShape | undefined {
  let container =
    shape.containerShape === undefined ? undefined : indexed.byKey.get(shape.containerShape);
  while (container && isHidden(indexed.scene, container.key)) {
    container =
      container.containerShape === undefined
        ? undefined
        : indexed.byKey.get(container.containerShape);
  }
  return container;
}

/**
 * The shape inside a container whose top left corner is nearest the container's own, wherever its
 * contents sit, even outside its rectangle; what the canvas hides is skipped.
 */
export function firstInside(
  indexed: IndexedScene,
  container: ElementShape,
): ElementShape | undefined {
  if (!container.holdsContents) return undefined;
  const corner = { x: container.rect.x, y: container.rect.y };
  const found = search(
    container.extent,
    (reach) => around(corner, reach),
    farthestCorner(corner, container.extent),
    (rect) => {
      let best: Scored | undefined;
      for (const content of shapesIn(
        indexed,
        rect,
        (each) => each.containerShape === container.key,
      )) {
        const score = distance(corner, { x: content.shape.rect.x, y: content.shape.rect.y });
        if (!best || score < best.score) best = { reachable: content, score, distance: 0, rank: 0 };
      }
      return best;
    },
  );
  return found?.reachable.kind === 'shape' ? found.reachable.shape : undefined;
}

/** A relation ] and [ step through from an element, and the end it is reached through. */
export interface RelationStop {
  line: RelationLine;
  /** The element it is drawn on, or the relation it ends on when it reaches the element only through that one. */
  on: Id;
}

/** The relations a view draws, seen from the elements they relate. */
export interface DrawnRelations {
  /** The shape an element's relations are drawn from: its first one. */
  shapeOf(element: Id): ElementShape | undefined;
  /** The relations drawn on an element, clockwise around its shape from the top. */
  around(element: Id): readonly RelationLine[];
  /** The relations drawn that end on a relation, in the model's order, as the outline lists them. */
  endingOn(relation: Id): readonly RelationLine[];
  /**
   * The relations ] and [ step through from an element, each once: those drawn on it, clockwise from
   * the top, each followed by the relations that end on it, and so on, as the outline lists them with
   * every row open.
   */
  steps(element: Id): readonly RelationStop[];
  /**
   * The element a drawn relation is stepped through from: the end it starts from, or else the one it
   * points to, when either has a shape; else the element of a relation it ends on.
   */
  elementOf(relation: Id): Id | undefined;
  /** How a relation is drawn; undefined when the view does not draw it. */
  line(relation: Id): RelationLine | undefined;
  /** The relation in the model. */
  relation(id: Id): Relation | undefined;
}

const drawnCache = new WeakMap<
  Scene,
  { model: ModelFile; hidden: ReadonlySet<string> | undefined; drawn: DrawnRelations }
>();

/**
 * The relations a scene draws, by the elements they relate: worked out once for each scene, and again
 * when what it hides changes, which the canvas and the outline share. A relation is drawn from the
 * first shape of each element it relates; its place around that shape is where its line leaves or
 * reaches the shape's outline. A relation between relations is drawn on no element, and is reached
 * through the relations it ends on. The relations the canvas hides are left out.
 */
export function drawnRelations(scene: Scene, project: ProjectSnapshot): DrawnRelations {
  const hidden = hiddenIn(scene);
  const cached = drawnCache.get(scene);
  if (cached?.model === project.model && cached.hidden === hidden) return cached.drawn;

  const index = modelIndexOf(project);
  const firstShapes = new Map<Id, ElementShape>();
  // The first shape of each element that the canvas shows, which a move along a relation goes to.
  const shownShapes = new Map<Id, ElementShape>();
  for (const shape of scene.shapes) {
    if (!firstShapes.has(shape.element)) firstShapes.set(shape.element, shape);
    if (!shownShapes.has(shape.element) && !hidden?.has(shape.key)) {
      shownShapes.set(shape.element, shape);
    }
  }
  const lines = new Map<Id, RelationLine>();
  const turns = new Map<Id, { line: RelationLine; turn: number; order: number }[]>();
  const onRelations = new Map<Id, RelationLine[]>();
  scene.relations.forEach((line, order) => {
    if (hidden?.has(line.relation)) return;
    lines.set(line.relation, line);
    const relation = index.relation(line.relation);
    if (!relation) return;
    const ends: [Id, Point][] = [
      [relation.from, line.from],
      [relation.to, line.to],
    ];
    for (const [end, point] of ends) {
      const shape = firstShapes.get(end);
      if (!shape) {
        if (index.relation(end)) append(onRelations, end, line);
        continue;
      }
      append(turns, end, { line, turn: turnOf(centerOf(shape.rect), point), order });
    }
  });
  const around = new Map<Id, RelationLine[]>();
  for (const [element, list] of turns) {
    list.sort((a, b) => a.turn - b.turn || a.order - b.order);
    around.set(
      element,
      list.map((entry) => entry.line),
    );
  }

  const endingOn = (relation: Id): readonly RelationLine[] => onRelations.get(relation) ?? [];
  const stepsOf = new Map<Id, readonly RelationStop[]>();
  // Depth first, in the order the outline lists the rows with every row open, each relation listed at
  // its first place only: the element's own relations keep theirs. A stack rather than recursion, so
  // that however long a chain of relations between relations is, each is looked at once.
  const steps = (element: Id): readonly RelationStop[] => {
    let found = stepsOf.get(element);
    if (found) return found;
    const direct = around.get(element) ?? [];
    const listed = new Set(direct.map((line) => line.relation));
    const list: RelationStop[] = [];
    const pending: RelationStop[] = direct.map((line) => ({ line, on: element })).reverse();
    for (let stop = pending.pop(); stop; stop = pending.pop()) {
      const { line, on } = stop;
      if (on !== element) {
        if (listed.has(line.relation)) continue;
        listed.add(line.relation);
      }
      list.push(stop);
      const inner = endingOn(line.relation);
      for (let at = inner.length - 1; at >= 0; at--) {
        const next = inner[at] as RelationLine;
        if (!listed.has(next.relation)) pending.push({ line: next, on: line.relation });
      }
    }
    found = list;
    stepsOf.set(element, found);
    return found;
  };
  // Breadth first over the relations a relation ends on, each looked at once, so that the nearest end
  // with a shape is found however the relations between relations are woven, even in a cycle.
  const elementsOf = new Map<Id, Id | undefined>();
  const elementOf = (id: Id): Id | undefined => {
    if (elementsOf.has(id)) return elementsOf.get(id);
    let found: Id | undefined;
    const queue = lines.has(id) ? [id] : [];
    const seen = new Set(queue);
    for (let at = 0; at < queue.length && found === undefined; at++) {
      const relation = index.relation(queue[at] as Id);
      if (!relation) continue;
      const ends = [relation.from, relation.to];
      found = ends.find((end) => shownShapes.has(end));
      for (const end of ends) {
        if (lines.has(end) && !seen.has(end)) {
          seen.add(end);
          queue.push(end);
        }
      }
    }
    elementsOf.set(id, found);
    return found;
  };

  const drawn: DrawnRelations = {
    shapeOf: (element) => shownShapes.get(element),
    around: (element) => around.get(element) ?? [],
    endingOn,
    steps,
    elementOf,
    line: (relation) => lines.get(relation),
    relation: (id) => index.relation(id),
  };
  drawnCache.set(scene, { model: project.model, hidden, drawn });
  return drawn;
}

/**
 * The relation one step from `current` among those ] and [ step through from an element (`steps`),
 * wrapping around: the next for `1`, the one before for `-1`. Without a current one of the element's,
 * the first or the last.
 */
export function stepRelation(
  drawn: DrawnRelations,
  element: Id,
  current: Id | undefined,
  step: 1 | -1,
): RelationLine | undefined {
  const stops = drawn.steps(element);
  if (stops.length === 0) return undefined;
  const at = current === undefined ? -1 : stops.findIndex((stop) => stop.line.relation === current);
  if (at === -1) return (step === 1 ? stops[0] : stops.at(-1))?.line;
  return stops[(at + step + stops.length) % stops.length]?.line;
}

/** The end of a relation away from `near`; the end it points to when `near` is neither end. */
export function farEnd(relation: Pick<Relation, 'from' | 'to'>, near: Id | undefined): Id {
  return near === relation.to ? relation.from : relation.to;
}

/** A candidate a search found, with what ranks it. */
interface Scored {
  reachable: Reachable;
  /** The lower the better. */
  score: number;
  /** Breaks a tie in score: the lower the better. */
  distance: number;
  /** Breaks a tie in score where `distance` does not: the higher the better. */
  rank: number;
}

/** The best shape in a direction from `from`, among those `candidatesIn` finds within `bounds`. */
function bestInDirection(
  indexed: IndexedScene,
  from: Rect,
  direction: Direction,
  bounds: Rect,
  candidatesIn: (rect: Rect) => Reachable[],
): Reachable | undefined {
  const start = centerOf(from);
  const extent = boundsOf([from, bounds]) as Rect;
  const enough = (1 + ACROSS_WEIGHT) * Math.max(extent.width, extent.height);
  return search(
    bounds,
    (reach) => ahead(from, direction, reach),
    enough,
    (rect) => {
      // On a tie in score and distance, the first candidate in drawing order stays.
      let best: Scored | undefined;
      for (const reachable of candidatesIn(rect)) {
        const candidate = rectOf(reachable);
        const score = directionScore(from, candidate, direction);
        if (score === undefined) continue;
        const apart = distance(start, centerOf(candidate));
        if (!best || score < best.score || (score === best.score && apart < best.distance)) {
          best = { reachable, score, distance: apart, rank: 0 };
        }
      }
      return best;
    },
  )?.reachable;
}

/**
 * The best candidate of a search that widens until it is sure. `regionFor(reach)` holds every
 * candidate that scores `reach` or better, and `best(rect)` is the best candidate meeting a rectangle;
 * the search stops at the first reach that holds a candidate scoring within it, or at `enough`, a reach
 * whose region holds every candidate there is.
 */
function search(
  bounds: Rect,
  regionFor: (reach: number) => Rect,
  enough: number,
  best: (rect: Rect) => Scored | undefined,
): Scored | undefined {
  for (let reach = FIRST_REACH; ; reach *= 2) {
    const region = overlapOf(regionFor(reach), bounds);
    const found = region ? best(region) : undefined;
    if ((found && found.score <= reach) || !(reach < enough)) return found;
  }
}

/**
 * The part of the scene ahead of `from` in a direction that holds every rectangle scoring `reach` or
 * better: from its middle onwards, as far as `reach` past its edge, and `reach / ACROSS_WEIGHT` to
 * either side.
 */
function ahead(from: Rect, direction: Direction, reach: number): Rect {
  const middle = centerOf(from);
  const side = reach / ACROSS_WEIGHT;
  switch (direction) {
    case 'right':
      return spanning(
        middle.x,
        from.x + from.width + reach,
        from.y - side,
        from.y + from.height + side,
      );
    case 'left':
      return spanning(from.x - reach, middle.x, from.y - side, from.y + from.height + side);
    case 'down':
      return spanning(
        from.x - side,
        from.x + from.width + side,
        middle.y,
        from.y + from.height + reach,
      );
    case 'up':
      return spanning(from.x - side, from.x + from.width + side, from.y - reach, middle.y);
  }
}

/** The element shapes meeting a rectangle that `accept` takes and the canvas shows, in drawing order. */
function shapesIn(
  indexed: IndexedScene,
  rect: Rect,
  accept: (shape: ElementShape) => boolean,
): ReachedShape[] {
  const found: ReachedShape[] = [];
  for (const at of indexed.shapes.query(rect)) {
    const shape = indexed.scene.shapes[at] as ElementShape;
    if (accept(shape) && !isHidden(indexed.scene, shape.key)) found.push({ kind: 'shape', shape });
  }
  return found;
}

/** The notes, then the arrows, meeting a rectangle that the canvas shows. */
function freeShapesIn(indexed: IndexedScene, rect: Rect): Reachable[] {
  const { scene } = indexed;
  const { notes, arrows } = scene;
  return [
    ...indexed.notes
      .query(rect)
      .map((at): Reachable => ({ kind: 'note', note: notes[at] as NoteShape })),
    ...indexed.arrows
      .query(rect)
      .map((at): Reachable => ({ kind: 'arrow', arrow: arrows[at] as ArrowShape })),
  ].filter((reachable) => !isHidden(scene, reachableKey(reachable)));
}

/** The key the canvas knows a reachable shape by: an element shape's key, or a free shape's id. */
function reachableKey(reachable: Reachable): string {
  switch (reachable.kind) {
    case 'shape':
      return reachable.shape.key;
    case 'note':
      return reachable.note.id;
    case 'arrow':
      return reachable.arrow.id;
  }
}

/** The square reaching `reach` from a point on every side. */
function around(point: Point, reach: number): Rect {
  return spanning(point.x - reach, point.x + reach, point.y - reach, point.y + reach);
}

function spanning(left: number, right: number, top: number, bottom: number): Rect {
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Where two rectangles overlap; undefined when they do not meet. */
function overlapOf(a: Rect, b: Rect): Rect | undefined {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right < left || bottom < top ? undefined : spanning(left, right, top, bottom);
}

/** The gap between two spans on one axis; 0 when they overlap. */
function gapBetween(
  start: number,
  length: number,
  otherStart: number,
  otherLength: number,
): number {
  return Math.max(0, otherStart - (start + length), start - (otherStart + otherLength));
}

function distanceToRect(point: Point, rect: Rect): number {
  const dx = gapBetween(point.x, 0, rect.x, rect.width);
  const dy = gapBetween(point.y, 0, rect.y, rect.height);
  return Math.hypot(dx, dy);
}

/** How far the corner of a rectangle farthest from a point is. */
function farthestCorner(point: Point, rect: Rect): number {
  const dx = Math.max(Math.abs(point.x - rect.x), Math.abs(point.x - (rect.x + rect.width)));
  const dy = Math.max(Math.abs(point.y - rect.y), Math.abs(point.y - (rect.y + rect.height)));
  return Math.hypot(dx, dy);
}

function append<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Where a point lies around a center, as a turn clockwise from straight up, between 0 and 2π. */
function turnOf(center: Point, point: Point): number {
  const turn = Math.atan2(point.x - center.x, center.y - point.y);
  return turn < 0 ? turn + 2 * Math.PI : turn;
}
