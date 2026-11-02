/**
 * Why none of the panel's posing tools can act on the selection (ADR 0076), in words the panel
 * shows under its tools, so that disabled Move, Rotate, Place and Take out say what to select. The
 * text is the English key the catalog translates.
 */
import type { Space } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';

/** Why the posing tools cannot act on what is selected; undefined when one of them can. */
export function posingHint(
  space: Pick<Space, 'entries'>,
  selected: ReadonlySet<Id>,
  canAct: boolean,
): string | undefined {
  if (canAct) return undefined;
  if (selected.size === 0) {
    return 'Select something on the canvas or here: what is in physical space can be moved, rotated or taken out, and anything else placed.';
  }
  const hows = [...selected].map((element) => space.entries.get(element)?.how);
  if (hows.every((how) => how === 'anchored')) {
    return 'What is selected is drawn as a part of its solid and moves with it: select the element that shows the solid to move or rotate it.';
  }
  if (hows.every((how) => how === 'root')) {
    return 'What is selected is what the panel shows everything inside; it does not move in it.';
  }
  return 'Nothing selected can be posed here: select one element in physical space, or one that is not there yet.';
}
