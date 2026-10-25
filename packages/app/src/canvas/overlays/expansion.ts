/**
 * Expanding and collapsing by zoom (ADR 0055): a collapsed container whose appearance says
 * `expandFrom` shows expanded while the canvas zooms into it, from that scale up, and collapses again
 * 10% below it. The open app keeps which ones, as it keeps filters (ADR 0025): the view still keeps
 * them collapsed in its file, and nothing is stored or enters the history. A container expanded so
 * and collapsed again by hand stays collapsed until the zoom falls below where it expanded.
 */
import {
  LEVEL_EXIT,
  appearanceOf,
  definitionsIn,
  expandedAt,
  modelIndexOf,
  type Definitions,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Element, Id, ViewFile } from '@visual-anything/schema';
import { visibleRect, type Camera } from '../camera';
import type { Size } from '../geometry';
import { shownBy, type Scene } from '../scene';
import { meets } from '../spatial';

const expandScales = new WeakMap<Element, { definitions: Definitions; from: number | undefined }>();

/** The scale an element's collapsed shapes expand from, as its appearance says; none when it says none. */
function expandFromOf(element: Element, definitions: Definitions): number | undefined {
  const known = expandScales.get(element);
  if (known && known.definitions === definitions) return known.from;
  const from = appearanceOf(element, definitions).expandFrom;
  expandScales.set(element, { definitions, from });
  return from;
}

/** Where the canvas looks, as expanding by zoom reads it. */
export interface ZoomLook {
  camera: Camera;
  viewport: Size;
}

/**
 * Which of a view's collapsed containers show expanded where the canvas looks: those already
 * expanded while the zoom stays above 90% of where they expand, and those on screen once it reaches
 * it; none of `held`, collapsed again by hand. Says also which of `held` the zoom let go of.
 */
export function expandedByZoom(
  project: ProjectSnapshot,
  view: ViewFile,
  scene: Scene,
  look: ZoomLook,
  current: ReadonlySet<Id>,
  held: ReadonlySet<Id>,
): { expanded: Set<Id>; released: Id[] } {
  const expanded = new Set<Id>();
  const released: Id[] = [];
  const ids = view.collapsed ?? [];
  if (ids.length === 0) return { expanded, released };
  const definitions = definitionsIn(project);
  const index = modelIndexOf(project);
  const { scale } = look.camera;
  let shown: ReturnType<typeof visibleRect> | undefined;
  for (const id of ids) {
    const element = index.element(id);
    if (!element) continue;
    const from = expandFromOf(element, definitions);
    if (from === undefined) continue;
    if (held.has(id)) {
      if (scale < from * LEVEL_EXIT) released.push(id);
      continue;
    }
    if (current.has(id)) {
      if (expandedAt(from, scale, true)) expanded.add(id);
      continue;
    }
    if (!expandedAt(from, scale, false)) continue;
    // Expanding goes by what is on screen: zooming into a container, not zooming anywhere.
    const shape = shownBy(scene, id);
    if (shape?.element !== id) continue;
    shown ??= visibleRect(look.camera, look.viewport);
    if (meets(shape.rect, shown)) expanded.add(id);
  }
  return { expanded, released };
}

/** Whether two sets hold the same ids. */
export function sameIds(a: ReadonlySet<Id>, b: ReadonlySet<Id>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}
