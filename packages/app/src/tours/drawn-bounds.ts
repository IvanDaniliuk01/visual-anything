/**
 * Where each view draws an element or a relation now, for the checks of a tour (ADR 0077): `check_tour`
 * and the Tours panel both read marks outside a step's camera from it, from the app's own scene.
 *
 * - An element is where its shapes are, all of them, or where the outermost collapsed container that
 *   holds it is drawn.
 * - A relation is where its line is, or the aggregated line that stands for it, or else the shapes of
 *   its ends.
 * - What the view does not draw has no bounds, and nothing is said of it.
 *
 * Containers the canvas expands as it zooms in (ADR 0055) are read collapsed, as the view stores them.
 * Each view's scene is built the first time a step of it asks, and kept while the model, the packages,
 * the project's appearances, the view and the language stay as they were, so that a change to a tour
 * builds none again.
 */
import {
  definitionsIn,
  modelIndexOf,
  type GlideShape,
  type ProjectSnapshot,
  type TourRect,
} from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import { buildSceneAfresh, relationLinesOf, shownBy, type Scene } from '../canvas/scene';
import { currentLanguage, type Language } from '../i18n';

type Shape = Scene['shapes'][number];

/** A view's scene, with the shapes of each element, and what it was built from. */
interface Drawn {
  scene: Scene;
  shapes: Map<Id, Shape[]>;
  from: {
    model: ProjectSnapshot['model'];
    packages: ProjectSnapshot['packages'];
    definitions: ReturnType<typeof definitionsIn>;
    language: Language;
  };
}

const drawnViews = new WeakMap<ViewFile, Drawn>();

/** The scene a view draws in this project, built afresh only when what it is drawn from changed. */
function drawnView(project: ProjectSnapshot, view: ViewFile): Drawn {
  const from = {
    model: project.model,
    packages: project.packages,
    definitions: definitionsIn(project),
    language: currentLanguage(),
  };
  const kept = drawnViews.get(view);
  if (
    kept &&
    kept.from.model === from.model &&
    kept.from.packages === from.packages &&
    kept.from.definitions === from.definitions &&
    kept.from.language === from.language
  ) {
    return kept;
  }
  const scene = buildSceneAfresh(project, view.id);
  const shapes = new Map<Id, Shape[]>();
  for (const shape of scene.shapes) {
    shapes.set(shape.element, [...(shapes.get(shape.element) ?? []), shape]);
  }
  const drawn = { scene, shapes, from };
  drawnViews.set(view, drawn);
  return drawn;
}

/**
 * The shapes each view of the project draws, as `checkTour`'s `shapesOf` takes them (ADR 0084): each
 * element's shapes with their container paths, their keys, and their rectangles in canvas units; none
 * for a view the project does not have.
 */
export function drawnShapes(project: ProjectSnapshot): (view: Id) => GlideShape[] | undefined {
  const made = new Map<Id, GlideShape[] | undefined>();
  return (id) => {
    if (!made.has(id)) {
      const view = project.views.find((each) => each.id === id);
      made.set(
        id,
        view &&
          drawnView(project, view).scene.shapes.map((shape) => ({
            element: shape.element,
            path: shape.key,
            rect: shape.rect,
          })),
      );
    }
    return made.get(id);
  };
}

/**
 * Where each view of the project draws an element or a relation, as `checkTour`'s `boundsOf` takes
 * it: the rectangle around it, in canvas units; none for what the view does not draw.
 */
export function drawnBounds(project: ProjectSnapshot): (view: Id, id: Id) => TourRect | undefined {
  const index = modelIndexOf(project);
  const scenes = new Map<Id, Drawn | undefined>();
  const drawn = (id: Id) => {
    if (!scenes.has(id)) {
      const view = project.views.find((each) => each.id === id);
      scenes.set(id, view && drawnView(project, view));
    }
    return scenes.get(id);
  };
  return (view, id) => {
    const found = drawn(view);
    if (!found) return undefined;
    const { scene, shapes } = found;
    const corners: { x: number; y: number }[] = [];
    const around = (shape: Shape | undefined) => {
      if (!shape) return;
      const { x, y, width, height } = shape.rect;
      corners.push({ x, y }, { x: x + width, y: y + height });
    };
    const own = shapes.get(id);
    if (own) own.forEach(around);
    else if (index.element(id)) around(shownBy(scene, id));
    else {
      const line = relationLinesOf(scene).get(id);
      if (line) corners.push(...line.route);
      else {
        const relation = index.relation(id);
        if (relation) [relation.from, relation.to].forEach((end) => around(shownBy(scene, end)));
      }
    }
    if (corners.length === 0) return undefined;
    const xs = corners.map((each) => each.x);
    const ys = corners.map((each) => each.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  };
}
