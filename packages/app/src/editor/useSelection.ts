/**
 * The selection the shell keeps for the open view. What an edit removes, from here or elsewhere, drops
 * out of it; the selection without it is then kept, so that from that change on it keeps one identity
 * until something else is selected. The outline follows a selection by its identity, as a selection
 * made elsewhere.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import { useMemo, useState } from 'react';
import { EMPTY_SELECTION, prune, type Selection } from './selection';

export function useSelection(
  project: ProjectSnapshot,
  view: ViewFile | undefined,
): [Selection, (selection: Selection) => void] {
  const [chosen, setChosen] = useState<Selection>(EMPTY_SELECTION);
  // The ids are gathered when the project changes, not on every selection, which at 10,000
  // elements would show.
  const present = useMemo(
    () => ({
      elements: new Set(project.model.elements.map((element) => element.id)),
      relations: new Set(project.model.relations.map((relation) => relation.id)),
      freeShapes: new Set(view?.freeShapes.map((shape) => shape.id)),
    }),
    [project.model, view],
  );
  const selection = useMemo(
    () =>
      prune(chosen, {
        element: (id) => present.elements.has(id),
        relation: (id) => present.relations.has(id),
        freeShape: (id) => present.freeShapes.has(id),
      }),
    [chosen, present],
  );
  // Adjusting state while rendering: the selection without what was removed is the one kept.
  if (selection !== chosen) setChosen(selection);
  return [selection, setChosen];
}
