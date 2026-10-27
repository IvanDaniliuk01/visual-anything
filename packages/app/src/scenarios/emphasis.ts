/**
 * What playback emphasizes on the canvas, in the keys the scene uses: the relations of the step it is
 * on and their ends, highlighted, and a marker travelling along each of those relations. An end hidden
 * inside a collapsed container is shown by that container's shape; an aggregated step highlights the
 * collapsed container its steps happen inside.
 */
import {
  collapsedIn,
  containmentInView,
  modelIndexOf,
  nestingTypesInView,
  showsPart,
  shownByScope,
  type ProjectSnapshot,
  type TimelineEntry,
} from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import type { Marker } from '../editor/emphasis';
import type { ElementShape, Scene } from '../canvas/scene';

/** The keys of the shapes and relations an entry of the timeline highlights. */
export function highlightOf(
  project: ProjectSnapshot,
  view: ViewFile,
  scene: Scene,
  entry: TimelineEntry,
): ReadonlySet<string> {
  const shown = shownShapes(project, view, scene);
  const keys = new Set<string>();
  if (entry.kind === 'aggregated') {
    for (const key of shown(entry.container)) keys.add(key);
    return keys;
  }
  const index = modelIndexOf(project);
  for (const id of entry.relations) {
    const relation = index.relation(id);
    if (!relation) continue;
    keys.add(id);
    for (const end of [relation.from, relation.to]) {
      if (index.relation(end)) keys.add(end);
      else for (const key of shown(end)) keys.add(key);
    }
  }
  return keys;
}

/**
 * How long ago a travelling marker's trail starts, in milliseconds: it runs from where the marker was
 * then to where it is, so that it shortens to nothing as the marker slows to its end (ADR 0077).
 */
export const MARKER_TRAIL_TIME = 150;

/**
 * The markers of an entry, at a progress along their relations: one on each relation of a step that
 * the view draws as a line, none for an aggregated step, whose relations are hidden. With `trail`
 * behind `progress`, each leaves a trail from there.
 */
export function markersOf(
  project: ProjectSnapshot,
  view: ViewFile,
  entry: TimelineEntry,
  progress: number,
  trail?: number,
): Marker[] {
  if (entry.kind === 'aggregated') return [];
  const index = modelIndexOf(project);
  const nesting = new Set(nestingTypesInView(project, view));
  // A relation the view's scope does not show, or whose type it leaves out, has no line to travel
  // along (ADR-0040, ADR 0064).
  const shown = showsPart(view) ? shownByScope(project, view) : undefined;
  const trailing = trail !== undefined && trail < progress ? { trail } : {};
  return entry.relations.flatMap((id) => {
    const relation = index.relation(id);
    if (shown && !shown.relation(id)) return [];
    return relation && !nesting.has(relation.relationType)
      ? [{ relation: id, progress, ...trailing }]
      : [];
  });
}

/**
 * Finds the keys an element is shown by: each of its shapes, or for a shape hidden inside a collapsed
 * container, the shape of the outermost collapsed container it sits in, which the canvas draws. Shape
 * keys name the elements from World down to the shape, joined by `/`.
 */
function shownShapes(
  project: ProjectSnapshot,
  view: ViewFile,
  scene: Scene,
): (element: Id) => string[] {
  const collapsed = collapsedIn(project, view);
  const byElement = shapesByElement(scene);
  const shownAs = (shape: ElementShape): string => {
    const path = shape.key.split('/');
    const outermost = path.findIndex((id, at) => at < path.length - 1 && collapsed.has(id));
    return outermost === -1 ? shape.key : path.slice(0, outermost + 1).join('/');
  };
  let containment: ReturnType<typeof containmentInView> | undefined;
  const shown = (element: Id, seen: ReadonlySet<Id>): string[] => {
    const shapes = byElement.get(element);
    if (shapes && shapes.length > 0) return [...new Set(shapes.map(shownAs))];
    // A scene that leaves out what collapsed containers hide: the containers stand for the element.
    containment ??= containmentInView(project, view);
    const around = [...containment.enclosing(element)].filter(
      (container) => collapsed.has(container) && !seen.has(container),
    );
    const next = new Set([...seen, element]);
    return [...new Set(around.flatMap((container) => shown(container, next)))];
  };
  return (element) => shown(element, new Set());
}

const byScene = new WeakMap<Scene, Map<Id, ElementShape[]>>();

function shapesByElement(scene: Scene): Map<Id, ElementShape[]> {
  const kept = byScene.get(scene);
  if (kept) return kept;
  const shapes = new Map<Id, ElementShape[]>();
  for (const shape of scene.shapes) {
    const list = shapes.get(shape.element);
    if (list) list.push(shape);
    else shapes.set(shape.element, [shape]);
  }
  byScene.set(scene, shapes);
  return shapes;
}
