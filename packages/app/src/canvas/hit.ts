/**
 * Finding what is under the pointer and what a dragged box encloses, through a spatial index of the
 * scene, so that pointing stays cheap with thousands of shapes.
 *
 * The index also puts each element shape in a band: one more than the highest band of the shapes
 * drawn before it that it overlaps. Shapes that overlap are in different bands, the later one higher,
 * so the canvas draws the bands in order and draws every overlapping pair in drawing order, and the
 * shape under the pointer is the last one in that order that holds it: the one drawn on top.
 */
import { holdsPoint, type Point, type Rect } from './geometry';
import { distanceToRoute } from './route';
import type { ArrowShape, ElementShape, NoteShape, RelationLine, Scene } from './scene';
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
  byKey: Map<string, ElementShape>;
  indexOfKey: Map<string, number>;
  byElement: Map<string, ElementShape[]>;
  contentsOf: Map<string, ElementShape[]>;
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

/**
 * Indexes a scene for hit testing. The same scene gives the same index, so the canvas and the
 * inspector share it; scenes that share their shapes, relations, notes or arrows share their indexes,
 * so a change of stacking order indexes only the shapes again.
 */
export function indexScene(scene: Scene): IndexedScene {
  const known = indexedScenes.get(scene);
  if (known) return known;
  const shapeLookups = lookupsOf(scene.shapes);
  const drawing = scene.drawing ?? shapeLookups.identity;
  const drawn = drawnIndexOf(scene.shapes, drawing);
  const indexed: IndexedScene = {
    scene,
    shapes: drawn.index,
    relations: cached(relationIndexes, scene.relations, indexRelations),
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
  indexedScenes.set(scene, indexed);
  return indexed;
}

/**
 * What lies at a point of the scene. `tolerance` is how far, in scene units, a line may be from the
 * point and still count as under it. An element shape counts by its drawn outline where `exact` says
 * so for it, and by its rectangle otherwise, as while the canvas draws it as a plain block.
 */
export function hitAt(
  indexed: IndexedScene,
  point: Point,
  tolerance: number,
  exact: (shape: ElementShape) => boolean = () => true,
): Hit | undefined {
  const { scene } = indexed;
  const arrows = indexed.arrows.at(point, tolerance);
  for (let each = arrows.length - 1; each >= 0; each--) {
    const arrow = scene.arrows[arrows[each] as number] as ArrowShape;
    if (distanceToRoute(point, [arrow.from, arrow.to]) <= tolerance)
      return { kind: 'arrow', arrow };
  }
  const notes = indexed.notes.at(point);
  if (notes.length > 0)
    return { kind: 'note', note: scene.notes[notes.at(-1) as number] as NoteShape };

  let nearest: { line: RelationLine; distance: number } | undefined;
  for (const at of indexed.relations.at(point, tolerance)) {
    const line = scene.relations[at] as RelationLine;
    const distance = distanceToRoute(point, line.route);
    if (distance <= tolerance && (!nearest || distance < nearest.distance))
      nearest = { line, distance };
  }
  if (nearest) return { kind: 'relation', line: nearest.line };

  const [shape] = shapesUnder(indexed, point, exact, 1);
  return shape ? { kind: 'shape', shape } : undefined;
}

/**
 * The element shapes under a point, the one drawn on top first, by the rule `hitAt` follows for
 * them. Notes and relations do not count.
 */
export function shapesAt(
  indexed: IndexedScene,
  point: Point,
  exact: (shape: ElementShape) => boolean = () => true,
): ElementShape[] {
  return shapesUnder(indexed, point, exact, Infinity);
}

function shapesUnder(
  indexed: IndexedScene,
  point: Point,
  exact: (shape: ElementShape) => boolean,
  most: number,
): ElementShape[] {
  const found: ElementShape[] = [];
  // The index lists shapes in drawing order, so the last one that holds the point is drawn on top.
  const under = indexed.shapes.at(point);
  for (let each = under.length - 1; each >= 0 && found.length < most; each--) {
    const shape = indexed.scene.shapes[under[each] as number] as ElementShape;
    if (!exact(shape) || holdsPoint(shape.kind, shape.rect, point)) found.push(shape);
  }
  return found;
}

/** What a dragged box encloses entirely: element shapes, notes and arrows. */
export function enclosedBy(
  indexed: IndexedScene,
  box: Rect,
): { shapes: ElementShape[]; notes: NoteShape[]; arrows: ArrowShape[] } {
  const { scene } = indexed;
  return {
    shapes: indexed.shapes
      .query(box)
      .map((at) => scene.shapes[at] as ElementShape)
      .filter((shape) => within(shape.rect, box)),
    notes: indexed.notes
      .query(box)
      .map((at) => scene.notes[at] as NoteShape)
      .filter((note) => within(note.rect, box)),
    arrows: indexed.arrows
      .query(box)
      .map((at) => scene.arrows[at] as ArrowShape)
      .filter((arrow) => within(rectAround([arrow.from, arrow.to]), box)),
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
