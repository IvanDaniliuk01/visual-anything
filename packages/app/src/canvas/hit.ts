/**
 * Finding what is under the pointer and what a dragged box encloses, through a spatial index of the
 * scene, so that pointing stays cheap with thousands of shapes.
 *
 * The index also puts each element shape in a band: one more than the highest band of the shapes
 * drawn before it that it overlaps. Shapes that overlap are in different bands, the later one higher,
 * so the canvas draws the bands in order and draws every overlapping pair in drawing order, and the
 * shape under the pointer is the last one in that order that holds it: the one drawn on top.
 */
import { type Point, type Rect } from './geometry';
import { distanceToRoute } from './route';
import type { ArrowShape, ElementShape, NoteShape, RelationLine, Scene } from './scene';
import { holdsDrawn } from './shape-images';
import { SpatialIndex, overlaps, rectAround, segmentsOf, within } from './spatial';

/** What lies at a point, topmost first: free shapes over relations over element shapes. */
export type Hit =
  | { kind: 'shape'; shape: ElementShape }
  | { kind: 'relation'; line: RelationLine }
  | { kind: 'note'; note: NoteShape }
  | { kind: 'arrow'; arrow: ArrowShape };

/** A scene with a spatial index over everything it draws. */
export interface IndexedScene {
  scene: Scene;
  /** The element shapes by their index in `scene.shapes`, inserted in drawing order: a query lists them back to front. */
  shapes: SpatialIndex<number>;
  /** The relations by their index in `scene.relations`, each entered by the segments of its route. */
  relations: SpatialIndex<number>;
  notes: SpatialIndex<number>;
  arrows: SpatialIndex<number>;
  /** The shapes by key. */
  byKey: ReadonlyMap<string, ElementShape>;
  /** Each shape's index in `scene.shapes`, by its key. */
  indexOfKey: ReadonlyMap<string, number>;
  /** Each element's shapes in containment order: [0] is its first copy in the model's order, whatever the stacking order. */
  byElement: ReadonlyMap<string, readonly ElementShape[]>;
  /** The shapes that sit directly in each container shape, by its key, and directly in World under '', in containment order. */
  contentsOf: ReadonlyMap<string, readonly ElementShape[]>;
  /**
   * A spatial index over the shapes that sit directly in one container shape (key '' for World), each
   * entered with its extent. Built the first time it is asked for, and shared by every IndexedScene of
   * the same `scene.shapes`.
   */
  contentsIndex(containerShape: string): SpatialIndex<ElementShape>;
  /** `scene.drawing`, or the order of `scene.shapes`. */
  drawing: readonly number[];
  /** Each shape's place in `drawing`, by its index in `scene.shapes`. */
  rankOf: Int32Array;
  /**
   * Each shape's band, by its index in `scene.shapes`: one more than the highest band of the shapes
   * drawn before it that it overlaps, or 0. Shapes that overlap are in different bands, the later one
   * higher, so drawing the bands in order draws every overlapping pair in drawing order.
   */
  bands: Int32Array;
}

/** What only the shapes decide, shared by every scene drawn from the same shapes. */
interface ShapeLookups {
  byKey: ReadonlyMap<string, ElementShape>;
  indexOfKey: ReadonlyMap<string, number>;
  byElement: ReadonlyMap<string, readonly ElementShape[]>;
  contentsOf: ReadonlyMap<string, readonly ElementShape[]>;
  contentsIndexes: Map<string, SpatialIndex<ElementShape>>;
  identity: readonly number[];
}

/** The shape index and the bands for one drawing order of some shapes. */
interface DrawnIndex {
  shapes: readonly ElementShape[];
  index: SpatialIndex<number>;
  rankOf: Int32Array;
  bands: Int32Array;
}

const indexedScenes = new WeakMap<Scene, IndexedScene>();
const lookups = new WeakMap<readonly ElementShape[], ShapeLookups>();
const drawnIndexes = new WeakMap<readonly number[], DrawnIndex>();
const relationIndexes = new WeakMap<readonly RelationLine[], SpatialIndex<number>>();
const noteIndexes = new WeakMap<readonly NoteShape[], SpatialIndex<number>>();
const arrowIndexes = new WeakMap<readonly ArrowShape[], SpatialIndex<number>>();
const outlyingShapes = new WeakMap<ElementShape, readonly ElementShape[]>();
/** The last scene indexed, which the next one is indexed from when it keeps its shapes' keys. */
let latest: IndexedScene | undefined;

/**
 * Indexes a scene for hit testing. The same scene gives the same index, so the canvas and the
 * inspector share it; scenes that share their shapes, relations, notes or arrows share their indexes,
 * so a change of stacking order indexes only the shapes again. A scene whose shapes keep the keys and
 * the drawing order of the last scene indexed, as after a move or a rename, is indexed from it: only
 * the shapes that moved, and the shapes their bands depend on, are indexed again.
 */
export function indexScene(scene: Scene): IndexedScene {
  const known = indexedScenes.get(scene);
  if (known) return known;
  const indexed = (latest && reindexed(latest, scene)) ?? freshIndex(scene);
  indexedScenes.set(scene, indexed);
  latest = indexed;
  return indexed;
}

/** The index of a scene made from nothing, sharing nothing with any other: for tests. */
export function indexSceneAfresh(scene: Scene): IndexedScene {
  return freshIndex({
    ...scene,
    shapes: [...scene.shapes],
    relations: [...scene.relations],
    notes: [...scene.notes],
    arrows: [...scene.arrows],
    ...(scene.drawing ? { drawing: [...scene.drawing] } : {}),
  });
}

function freshIndex(scene: Scene): IndexedScene {
  const shapeLookups = lookupsOf(scene.shapes);
  const drawing = scene.drawing ?? shapeLookups.identity;
  const drawn = drawnIndexOf(scene.shapes, drawing);
  return indexedOf(scene, shapeLookups, drawing, drawn, relationIndexOf(scene.relations));
}

function indexedOf(
  scene: Scene,
  shapeLookups: ShapeLookups,
  drawing: readonly number[],
  drawn: DrawnIndex,
  relations: SpatialIndex<number>,
): IndexedScene {
  return {
    scene,
    shapes: drawn.index,
    relations,
    notes: cached(noteIndexes, scene.notes, (notes) => indexRects(notes.map((note) => note.rect))),
    arrows: cached(arrowIndexes, scene.arrows, (arrows) =>
      indexRects(arrows.map((arrow) => rectAround([arrow.from, arrow.to]))),
    ),
    byKey: shapeLookups.byKey,
    indexOfKey: shapeLookups.indexOfKey,
    byElement: shapeLookups.byElement,
    contentsOf: shapeLookups.contentsOf,
    contentsIndex: (containerShape) => contentsIndexOf(shapeLookups, containerShape),
    drawing,
    rankOf: drawn.rankOf,
    bands: drawn.bands,
  };
}

/**
 * The index of a scene made from the index of an earlier one, `base`, whose shapes have the same keys
 * in the same order and are drawn in the same order; undefined when they are not, or when most of
 * them changed. The base's indexes are copied before they change, so it stays as it was.
 */
function reindexed(base: IndexedScene, scene: Scene): IndexedScene | undefined {
  const before = base.scene;
  const { shapes } = scene;
  if (before.shapes.length !== shapes.length) return undefined;
  const changed: number[] = [];
  if (before.shapes !== shapes) {
    for (let at = 0; at < shapes.length; at++) {
      const was = before.shapes[at] as ElementShape;
      const now = shapes[at] as ElementShape;
      if (was === now) continue;
      if (was.key !== now.key) return undefined;
      changed.push(at);
    }
  }
  if (changed.length > shapes.length / 2) return undefined;
  const baseLookups = lookupsOf(before.shapes);
  const drawing = scene.drawing ?? baseLookups.identity;
  if (drawing !== base.drawing && !sameNumbers(drawing, base.drawing)) return undefined;

  const shapeLookups =
    changed.length === 0
      ? baseLookups
      : (lookups.get(shapes) ?? updatedLookups(baseLookups, shapes, changed));
  lookups.set(shapes, shapeLookups);
  const moved = changed.filter(
    (at) => !sameRect((before.shapes[at] as ElementShape).rect, (shapes[at] as ElementShape).rect),
  );
  const baseDrawn: DrawnIndex = {
    shapes: before.shapes,
    index: base.shapes,
    rankOf: base.rankOf,
    bands: base.bands,
  };
  const drawn =
    moved.length === 0
      ? { ...baseDrawn, shapes }
      : redrawnIndex(baseDrawn, before.shapes, shapes, base.drawing, moved);
  drawnIndexes.set(drawing, drawn);
  const relations =
    before.relations === scene.relations
      ? base.relations
      : (relationIndexes.get(scene.relations) ??
        updatedRelationIndex(base.relations, before.relations, scene.relations) ??
        relationIndexOf(scene.relations));
  relationIndexes.set(scene.relations, relations);
  return indexedOf(scene, shapeLookups, base.drawing, drawn, relations);
}

/** The lookups of shapes that keep the keys of `base`'s, where those at `changed` are new objects. */
function updatedLookups(
  base: ShapeLookups,
  shapes: readonly ElementShape[],
  changed: readonly number[],
): ShapeLookups {
  const byKey = new Map<string, ElementShape>();
  const elements = new Set<string>();
  const containers = new Set<string>();
  for (const at of changed) {
    const shape = shapes[at] as ElementShape;
    byKey.set(shape.key, shape);
    elements.add(shape.element);
    containers.add(shape.containerShape ?? '');
  }
  const current = (shape: ElementShape) => byKey.get(shape.key) ?? shape;
  const byElement = new Map<string, ElementShape[]>();
  for (const element of elements) {
    byElement.set(element, (base.byElement.get(element) ?? []).map(current));
  }
  const contentsOf = new Map<string, ElementShape[]>();
  for (const container of containers) {
    contentsOf.set(container, (base.contentsOf.get(container) ?? []).map(current));
  }
  return {
    byKey: overlaid(base.byKey, byKey),
    indexOfKey: base.indexOfKey,
    byElement: overlaid(base.byElement, byElement),
    contentsOf: overlaid(base.contentsOf, contentsOf),
    contentsIndexes: new Map(),
    identity: base.identity,
  };
}

/** How many overlays may pile up before they are made one map again. */
const MOST_OVERLAYS = 8;

/**
 * A map that reads `changes` over `base`, for the same keys: an edit that changes a few shapes of
 * thousands copies nothing. Once overlays pile up, or the changes grow large, it is one map again.
 */
function overlaid<V>(
  base: ReadonlyMap<string, V>,
  changes: Map<string, V>,
): ReadonlyMap<string, V> {
  if (changes.size === 0) return base;
  const piled = base instanceof Overlay ? base.piled + 1 : 1;
  if (piled > MOST_OVERLAYS || changes.size * 8 > base.size) {
    // Copied from the map under every overlay, with each overlay's changes in turn.
    const stack: ReadonlyMap<string, V>[] = [changes];
    let root: ReadonlyMap<string, V> = base;
    while (root instanceof Overlay) {
      const overlay = root as Overlay<V>;
      stack.push(overlay.changes);
      root = overlay.base;
    }
    const flat = new Map(root);
    for (let at = stack.length - 1; at >= 0; at--) {
      for (const [key, value] of stack[at] as ReadonlyMap<string, V>) flat.set(key, value);
    }
    return flat;
  }
  return new Overlay(base, changes, piled);
}

class Overlay<V> implements ReadonlyMap<string, V> {
  constructor(
    readonly base: ReadonlyMap<string, V>,
    readonly changes: ReadonlyMap<string, V>,
    /** How many overlays this one is, counting those under it. */
    readonly piled: number,
  ) {}

  get size(): number {
    return this.base.size;
  }

  get(key: string): V | undefined {
    return this.changes.has(key) ? this.changes.get(key) : this.base.get(key);
  }

  has(key: string): boolean {
    return this.changes.has(key) || this.base.has(key);
  }

  *entries(): MapIterator<[string, V]> {
    for (const [key, value] of this.base) {
      yield [key, this.changes.has(key) ? (this.changes.get(key) as V) : value];
    }
  }

  *keys(): MapIterator<string> {
    yield* this.base.keys();
  }

  *values(): MapIterator<V> {
    for (const [, value] of this.entries()) yield value;
  }

  forEach(each: (value: V, key: string, map: ReadonlyMap<string, V>) => void): void {
    for (const [key, value] of this.entries()) each(value, key, this);
  }

  [Symbol.iterator](): MapIterator<[string, V]> {
    return this.entries();
  }
}

/**
 * The shape index and the bands of `base` with the shapes at `moved` in their new places: a moved
 * shape's band is worked out again, and so is the band of every shape drawn after it that overlaps
 * where it was or where it is, and after those, of every shape whose band then depends on theirs.
 */
function redrawnIndex(
  base: DrawnIndex,
  before: readonly ElementShape[],
  shapes: readonly ElementShape[],
  drawing: readonly number[],
  moved: readonly number[],
): DrawnIndex {
  const index = base.index.clone();
  const { rankOf } = base;
  const bands = base.bands.slice();
  const waiting = new RankHeap();
  const after = (rect: Rect, rank: number) => {
    for (const other of index.query(rect)) {
      const otherRank = rankOf[other] as number;
      if (otherRank > rank) waiting.push(otherRank);
    }
  };
  const movedSet = new Set(moved);
  for (const at of moved) {
    const rank = rankOf[at] as number;
    index.replace(rank, (shapes[at] as ElementShape).rect);
    waiting.push(rank);
    after((before[at] as ElementShape).rect, rank);
  }
  const bandOf = (at: number) => bands[at] as number;
  for (let rank = waiting.pop(); rank !== undefined; rank = waiting.pop()) {
    const at = drawing[rank] as number;
    const { rect } = shapes[at] as ElementShape;
    const band = index.highest(rect, bandOf, rank) + 1;
    if (band !== bands[at] || movedSet.has(at)) {
      bands[at] = band;
      after(rect, rank);
    }
  }
  return { shapes, index, rankOf, bands };
}

/** Ranks waiting to be looked at, smallest first, each once. */
class RankHeap {
  private readonly heap: number[] = [];
  private readonly queued = new Set<number>();

  push(rank: number): void {
    if (this.queued.has(rank)) return;
    this.queued.add(rank);
    const heap = this.heap;
    heap.push(rank);
    for (let at = heap.length - 1; at > 0;) {
      const up = (at - 1) >> 1;
      if ((heap[up] as number) <= rank) break;
      heap[at] = heap[up] as number;
      heap[up] = rank;
      at = up;
    }
  }

  pop(): number | undefined {
    const heap = this.heap;
    const top = heap[0];
    if (top === undefined) return undefined;
    const last = heap.pop() as number;
    if (heap.length > 0) {
      heap[0] = last;
      for (let at = 0; ;) {
        const left = 2 * at + 1;
        const right = left + 1;
        let smallest = at;
        if (left < heap.length && (heap[left] as number) < (heap[smallest] as number))
          smallest = left;
        if (right < heap.length && (heap[right] as number) < (heap[smallest] as number))
          smallest = right;
        if (smallest === at) break;
        heap[at] = heap[smallest] as number;
        heap[smallest] = last;
        at = smallest;
      }
    }
    this.queued.delete(top);
    return top;
  }
}

/**
 * The relations index of `base` with the lines that changed in their new places, when the lines are
 * those of `before`, by key, in the same order; undefined when they are not.
 */
function updatedRelationIndex(
  base: SpatialIndex<number>,
  before: readonly RelationLine[],
  after: readonly RelationLine[],
): SpatialIndex<number> | undefined {
  if (before.length !== after.length) return undefined;
  const changed: number[] = [];
  for (let at = 0; at < after.length; at++) {
    const was = before[at] as RelationLine;
    const now = after[at] as RelationLine;
    if (was === now || was.route === now.route) continue;
    if (was.relation !== now.relation) return undefined;
    changed.push(at);
  }
  if (changed.length > after.length / 2) return undefined;
  if (changed.length === 0) return base;
  const index = base.clone();
  for (const at of changed) index.replaceParts(at, segmentsOf((after[at] as RelationLine).route));
  return index;
}

function relationIndexOf(lines: readonly RelationLine[]): SpatialIndex<number> {
  return cached(relationIndexes, lines, indexRelations);
}

const indexesWithout = new WeakMap<
  IndexedScene,
  { hidden: ReadonlySet<string>; indexed: IndexedScene }
>();

/**
 * The index without the element shapes in `hidden`, by key, for what finds shapes through it alone,
 * as aiming a drop does: what the canvas hides cannot be dropped onto. Made once for each set.
 */
export function withoutShapes(indexed: IndexedScene, hidden: ReadonlySet<string>): IndexedScene {
  if (hidden.size === 0) return indexed;
  const known = indexesWithout.get(indexed);
  if (known?.hidden === hidden) return known.indexed;
  const shapes = indexed.shapes.clone();
  for (const key of hidden) {
    const at = indexed.indexOfKey.get(key);
    if (at !== undefined) shapes.remove(indexed.rankOf[at] as number);
  }
  const made: IndexedScene = { ...indexed, shapes };
  indexesWithout.set(indexed, { hidden, indexed: made });
  return made;
}

/** What hit testing leaves out: what the canvas does not draw, by the keys the emphasis uses. */
export interface Skipped {
  /** Element shapes by key, relations by their line's key, free shapes by id. */
  has(key: string): boolean;
}

const NOTHING_SKIPPED: Skipped = { has: () => false };

/**
 * What lies at a point of the scene. `tolerance` is how far, in scene units, a line may be from the
 * point and still count as under it. An element shape counts by its drawn outline where `exact` says
 * so for it, and by its rectangle otherwise, as while the canvas draws it as a plain block. What
 * `hidden` holds is not drawn, and is not found.
 */
export function hitAt(
  indexed: IndexedScene,
  point: Point,
  tolerance: number,
  exact: (shape: ElementShape) => boolean = () => true,
  hidden: Skipped = NOTHING_SKIPPED,
): Hit | undefined {
  const { scene } = indexed;
  const arrows = indexed.arrows.at(point, tolerance);
  for (let each = arrows.length - 1; each >= 0; each--) {
    const arrow = scene.arrows[arrows[each] as number] as ArrowShape;
    if (hidden.has(arrow.id)) continue;
    if (distanceToRoute(point, [arrow.from, arrow.to]) <= tolerance)
      return { kind: 'arrow', arrow };
  }
  const notes = indexed.notes.at(point);
  for (let each = notes.length - 1; each >= 0; each--) {
    const note = scene.notes[notes[each] as number] as NoteShape;
    if (!hidden.has(note.id)) return { kind: 'note', note };
  }

  let nearest: { line: RelationLine; distance: number } | undefined;
  for (const at of indexed.relations.at(point, tolerance)) {
    const line = scene.relations[at] as RelationLine;
    if (hidden.has(line.relation)) continue;
    const distance = distanceToRoute(point, line.route);
    if (distance <= tolerance && (!nearest || distance < nearest.distance))
      nearest = { line, distance };
  }
  if (nearest) return { kind: 'relation', line: nearest.line };

  const [shape] = shapesUnder(indexed, point, exact, 1, hidden);
  return shape ? { kind: 'shape', shape } : undefined;
}

/**
 * The element shapes under a point, the one drawn on top first, by the rule `hitAt` follows for
 * them. Notes and relations do not count, nor does what `hidden` holds.
 */
export function shapesAt(
  indexed: IndexedScene,
  point: Point,
  exact: (shape: ElementShape) => boolean = () => true,
  hidden: Skipped = NOTHING_SKIPPED,
): ElementShape[] {
  return shapesUnder(indexed, point, exact, Infinity, hidden);
}

function shapesUnder(
  indexed: IndexedScene,
  point: Point,
  exact: (shape: ElementShape) => boolean,
  most: number,
  hidden: Skipped,
): ElementShape[] {
  const found: ElementShape[] = [];
  // The index lists shapes in drawing order, so the last one that holds the point is drawn on top.
  const under = indexed.shapes.at(point);
  for (let each = under.length - 1; each >= 0 && found.length < most; each--) {
    const shape = indexed.scene.shapes[under[each] as number] as ElementShape;
    if (hidden.has(shape.key)) continue;
    if (!exact(shape) || holdsDrawn(shape, point)) found.push(shape);
  }
  return found;
}

/** What a dragged box encloses entirely: element shapes, notes and arrows, but what `hidden` holds. */
export function enclosedBy(
  indexed: IndexedScene,
  box: Rect,
  hidden: Skipped = NOTHING_SKIPPED,
): { shapes: ElementShape[]; notes: NoteShape[]; arrows: ArrowShape[] } {
  const { scene } = indexed;
  return {
    shapes: indexed.shapes
      .query(box)
      .map((at) => scene.shapes[at] as ElementShape)
      .filter((shape) => !hidden.has(shape.key) && within(shape.rect, box)),
    notes: indexed.notes
      .query(box)
      .map((at) => scene.notes[at] as NoteShape)
      .filter((note) => !hidden.has(note.id) && within(note.rect, box)),
    arrows: indexed.arrows
      .query(box)
      .map((at) => scene.arrows[at] as ArrowShape)
      .filter((arrow) => !hidden.has(arrow.id) && within(rectAround([arrow.from, arrow.to]), box)),
  };
}

/**
 * The shapes inside `shape`, directly or not, whose rectangle is not within its rectangle. There are
 * none unless contents sit at a negative offset: a container grows to the right and down to hold
 * what it holds. Only contents whose extent sticks out are looked into.
 */
export function outlying(indexed: IndexedScene, shape: ElementShape): readonly ElementShape[] {
  const known = outlyingShapes.get(shape);
  if (known) return known;
  const found: ElementShape[] = [];
  if (!within(shape.extent, shape.rect)) {
    const visit = (key: string) => {
      for (const content of indexed.contentsOf.get(key) ?? []) {
        if (within(content.extent, shape.rect)) continue;
        if (!within(content.rect, shape.rect)) found.push(content);
        visit(content.key);
      }
    };
    visit(shape.key);
  }
  outlyingShapes.set(shape, found);
  return found;
}

/**
 * Whether a shape with everything inside it overlaps another shape with everything inside it: some
 * shape of each, or of what sticks out of it, overlaps one of the other's.
 */
export function overlapWithContents(
  indexed: IndexedScene,
  a: ElementShape,
  b: ElementShape,
): boolean {
  if (overlaps(a.rect, b.rect)) return true;
  if (!overlaps(a.extent, b.extent)) return false;
  const others = [b, ...outlying(indexed, b)];
  return [a, ...outlying(indexed, a)].some((one) =>
    others.some((other) => overlaps(one.rect, other.rect)),
  );
}

function lookupsOf(shapes: readonly ElementShape[]): ShapeLookups {
  const known = lookups.get(shapes);
  if (known) return known;
  const byKey = new Map<string, ElementShape>();
  const indexOfKey = new Map<string, number>();
  const byElement = new Map<string, ElementShape[]>();
  const contentsOf = new Map<string, ElementShape[]>();
  shapes.forEach((shape, at) => {
    byKey.set(shape.key, shape);
    indexOfKey.set(shape.key, at);
    append(byElement, shape.element, shape);
    append(contentsOf, shape.containerShape ?? '', shape);
  });
  const made: ShapeLookups = {
    byKey,
    indexOfKey,
    byElement,
    contentsOf,
    contentsIndexes: new Map(),
    identity: shapes.map((_, at) => at),
  };
  lookups.set(shapes, made);
  return made;
}

function contentsIndexOf(
  shapeLookups: ShapeLookups,
  containerShape: string,
): SpatialIndex<ElementShape> {
  let index = shapeLookups.contentsIndexes.get(containerShape);
  if (!index) {
    index = new SpatialIndex<ElementShape>();
    for (const shape of shapeLookups.contentsOf.get(containerShape) ?? []) {
      index.insert(shape, shape.extent);
    }
    shapeLookups.contentsIndexes.set(containerShape, index);
  }
  return index;
}

/** The shape index and the bands, in one pass over the shapes in drawing order. */
function drawnIndexOf(shapes: readonly ElementShape[], drawing: readonly number[]): DrawnIndex {
  const known = drawnIndexes.get(drawing);
  if (known && known.shapes === shapes) return known;
  const index = new SpatialIndex<number>();
  const rankOf = new Int32Array(shapes.length);
  const bands = new Int32Array(shapes.length);
  const bandOf = (at: number) => bands[at] as number;
  drawing.forEach((at, rank) => {
    const { rect } = shapes[at] as ElementShape;
    rankOf[at] = rank;
    bands[at] = index.highest(rect, bandOf) + 1;
    index.insert(at, rect);
  });
  const made = { shapes, index, rankOf, bands };
  drawnIndexes.set(drawing, made);
  return made;
}

function indexRelations(lines: readonly RelationLine[]): SpatialIndex<number> {
  const index = new SpatialIndex<number>();
  lines.forEach((line, at) => index.insertParts(at, segmentsOf(line.route)));
  return index;
}

function indexRects(rects: readonly Rect[]): SpatialIndex<number> {
  const index = new SpatialIndex<number>();
  rects.forEach((rect, at) => index.insert(at, rect));
  return index;
}

function cached<K extends object, V>(cache: WeakMap<K, V>, key: K, make: (key: K) => V): V {
  let value = cache.get(key);
  if (value === undefined) {
    value = make(key);
    cache.set(key, value);
  }
  return value;
}

function append<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let at = 0; at < a.length; at++) if (a[at] !== b[at]) return false;
  return true;
}
