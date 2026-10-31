/**
 * What the physical-space panel hands the solid worker to draw (ADR 0076), from what the core's
 * `spaceOf` works out: one entry for each element in the space, then each container drawn faintly,
 * with its name, its matrix, and what draws it:
 * - its solid, by its file's hash, with the solid's bounds;
 * - for an anchored part, the element whose solid holds it and its part's index there;
 * - a marker, for an element posed with no solid that nothing in the space is posed or anchored in:
 *   a container without a solid is drawn as what is in it.
 */
import type { Space, SpaceEntry } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { MAX_SPACE_NAME, type SpaceDrawnEntry } from '../solids/protocol';

/** The entries of a space, as the worker draws them; names come from `nameOf`. */
export function spaceEntriesOf(
  space: Pick<Space, 'entries' | 'faint'>,
  nameOf: (element: Id) => string,
): SpaceDrawnEntry[] {
  const holders = new Set<Id>();
  for (const entry of [...space.entries.values(), ...space.faint.values()]) {
    if (entry.in !== undefined) holders.add(entry.in);
  }
  const drawn = (entry: SpaceEntry): SpaceDrawnEntry => {
    const name = nameOf(entry.element);
    return {
      element: entry.element,
      name: name.length > MAX_SPACE_NAME ? `${name.slice(0, MAX_SPACE_NAME - 1)}…` : name,
      matrix: [...entry.matrix],
      ...(entry.solid
        ? { solid: entry.solid.definition.hash, bounds: entry.solid.definition.bounds }
        : {}),
      ...(entry.part && entry.in !== undefined
        ? { part: { of: entry.in, index: entry.part.index } }
        : {}),
      ...(!entry.solid && !entry.part && entry.how === 'posed' && !holders.has(entry.element)
        ? { marker: true }
        : {}),
    };
  };
  return [
    ...[...space.entries.values()].map(drawn),
    ...[...space.faint.values()].filter((entry) => !space.entries.has(entry.element)).map(drawn),
  ];
}

/** Whether a space draws nothing: only its element, with no solid, and nothing faint. */
export function drawsNothing(space: Pick<Space, 'root' | 'entries' | 'faint'>): boolean {
  if (space.faint.size > 0) return false;
  for (const entry of space.entries.values()) {
    if (entry.element !== space.root || entry.solid) return false;
  }
  return true;
}
