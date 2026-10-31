/**
 * What the physical-space panel shows when it opens with nothing chosen (ADR 0076): World, if
 * something the view shows is in physical space through World; otherwise the selected element, or the
 * first in the model's order, that shows a solid. When the view holds nothing either way, it shows
 * World, and says how to put something there.
 */
import {
  shownByScope,
  solidShownBy,
  solidsIn,
  definitionsIn,
  spaceOf,
  type ProjectSnapshot,
  type ViewSpace,
} from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';

/** The panel's state when it opens with nothing chosen: World as `{}`, or one element. */
export function chosenSpace(
  project: ProjectSnapshot,
  view: ViewFile | undefined,
  selected: ReadonlySet<Id>,
): ViewSpace {
  const world = project.model.world.id;
  const space = spaceOf(project, view);
  for (const element of space.entries.keys()) if (element !== world) return {};
  const shown = view ? shownByScope(project, view) : undefined;
  const definitions = definitionsIn(project);
  const solids = solidsIn(project);
  const showsSolid = (element: (typeof project.model.elements)[number]) => {
    if (shown && !shown.element(element.id)) return false;
    const solid = solidShownBy(element, definitions);
    return solid !== undefined && solids.solid(solid.solid) !== undefined;
  };
  const candidates = [project.model.world, ...project.model.elements];
  const chosen =
    candidates.find((element) => selected.has(element.id) && showsSolid(element)) ??
    candidates.find(showsSolid);
  return chosen === undefined || chosen.id === world ? {} : { root: chosen.id };
}
