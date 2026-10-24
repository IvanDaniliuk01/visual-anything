/**
 * Finding what is under the pointer and what a dragged box encloses, through a spatial index of the
 * scene, so that pointing stays cheap with thousands of shapes.
 */
import type { Point, Rect } from './geometry';
import { distanceToRoute } from './route';
import type { ArrowShape, ElementShape, NoteShape, RelationLine, Scene } from './scene';
import { SpatialIndex, rectAround, within } from './spatial';

/** What lies at a point, topmost first: free shapes over relations over element shapes. */
export type Hit =
  | { kind: 'shape'; shape: ElementShape }
  | { kind: 'relation'; line: RelationLine }
  | { kind: 'note'; note: NoteShape }
  | { kind: 'arrow'; arrow: ArrowShape };

/** A scene with a spatial index over everything it draws. */
export interface IndexedScene {
  scene: Scene;
  shapes: SpatialIndex<number>;
  relations: SpatialIndex<number>;
  notes: SpatialIndex<number>;
  arrows: SpatialIndex<number>;
  /** The shapes by key. */
  byKey: ReadonlyMap<string, ElementShape>;
  /** The shapes of each element: one inside each of its containers. */
  byElement: ReadonlyMap<string, readonly ElementShape[]>;
}

/** Indexes a scene for hit testing. */
export function indexScene(scene: Scene): IndexedScene {
  const shapes = new SpatialIndex<number>();
  scene.shapes.forEach((shape, at) => shapes.insert(at, shape.rect));
  const relations = new SpatialIndex<number>();
  scene.relations.forEach((line, at) => relations.insert(at, rectAround(line.route)));
  const notes = new SpatialIndex<number>();
  scene.notes.forEach((note, at) => notes.insert(at, note.rect));
  const arrows = new SpatialIndex<number>();
  scene.arrows.forEach((arrow, at) => arrows.insert(at, rectAround([arrow.from, arrow.to])));
  const byKey = new Map(scene.shapes.map((shape) => [shape.key, shape]));
  const byElement = new Map<string, ElementShape[]>();
  for (const shape of scene.shapes) {
    const list = byElement.get(shape.element);
    if (list) list.push(shape);
    else byElement.set(shape.element, [shape]);
  }
  return { scene, shapes, relations, notes, arrows, byKey, byElement };
}

/**
 * What lies at a point of the scene. `tolerance` is how far, in scene units, a line may be from the
 * point and still count as under it.
 */
export function hitAt(indexed: IndexedScene, point: Point, tolerance: number): Hit | undefined {
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

  // Shapes come containers first, so the last one holding the point is the innermost.
  const shapes = indexed.shapes.at(point);
  if (shapes.length > 0)
    return { kind: 'shape', shape: scene.shapes[shapes.at(-1) as number] as ElementShape };
  return undefined;
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
