/**
 * Show in physical space, in a shape's menu (ADR 0076): opens the view's panel showing the element,
 * unless the element is in physical space under World, which the panel then shows, and frames the
 * element there. World itself is shown whole. What the panel showed stays when it shows that already,
 * so that its camera, cut and exploded view are kept.
 */
import { spaceOf, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import type { SpacePanelStore } from './store';

/** What Show in physical space does: shows the element, or frames it under World. */
export type ShowInSpace = { kind: 'shows'; element: Id } | { kind: 'frames'; element?: Id };

/** What Show in physical space does for an element of a view. */
export function showInSpaceOf(project: ProjectSnapshot, view: ViewFile, element: Id): ShowInSpace {
  const world = project.model.world.id;
  if (element === world) return { kind: 'frames' };
  return spaceOf(project, view).entries.has(element)
    ? { kind: 'frames', element }
    : { kind: 'shows', element };
}

/** Shows an element of a view in its physical-space panel, as Show in physical space does. */
export function showInSpace(
  store: SpacePanelStore,
  project: ProjectSnapshot,
  view: ViewFile,
  element: Id,
): ShowInSpace {
  const world = project.model.world.id;
  const shown = store.state(view.id);
  const what = showInSpaceOf(project, view, element);
  if (what.kind === 'shows') {
    if (shown?.root !== what.element) store.set(view.id, { root: what.element });
    return what;
  }
  const showsWorld = shown !== undefined && (shown.root === undefined || shown.root === world);
  if (!showsWorld) store.set(view.id, {});
  store.frame(view.id, what.element === undefined ? [] : [what.element]);
  return what;
}
