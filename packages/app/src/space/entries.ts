/**
 * What the physical-space panel hands the solid worker to draw (ADR 0076), from what the core's
 * `spaceOf` works out: one entry for each element in the space, then each container drawn faintly,
 * with its name, its matrix, and what draws it:
 * - its solid, by its file's hash, with the solid's bounds;
 * - for an anchored part, the element whose solid holds it and its part's index there;
 * - a marker, for an element posed with no solid that nothing in the space is posed or anchored in:
 *   a container without a solid is drawn as what is in it; it is drawn in its shape's fill, which
 *   `fillOf` gives;
 * - the collapsed container it is drawn as, which a pick answers and whose marks it takes.
 *
 * A collapsed container that is not in the space while what it holds is gets an entry of its own
 * that draws nothing, so that its name is written.
 */
import type { Space, SpaceEntry } from '@visual-anything/core';
import type { Color, Id, SpaceBounds } from '@visual-anything/schema';
import { MAX_SPACE_NAME, type SpaceDrawnEntry } from '../solids/protocol';
import { boundsOfPoint, boundsPlaced } from './camera';

/** The entries of a space, as the worker draws them; names come from `nameOf`, fills from `fillOf`. */
export function spaceEntriesOf(
  space: Pick<Space, 'entries' | 'faint'>,
  nameOf: (element: Id) => string,
  fillOf?: (element: Id) => Color | undefined,
): SpaceDrawnEntry[] {
  const holders = new Set<Id>();
  for (const entry of [...space.entries.values(), ...space.faint.values()]) {
    if (entry.in !== undefined) holders.add(entry.in);
  }
  const drawn = (entry: SpaceEntry): SpaceDrawnEntry => {
    const name = nameOf(entry.element);
    const marker =
      !entry.solid && !entry.part && entry.how === 'posed' && !holders.has(entry.element);
    const fill = marker ? fillOf?.(entry.element) : undefined;
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
      ...(marker ? { marker: true } : {}),
      ...(entry.drawnAs !== undefined ? { as: entry.drawnAs } : {}),
      ...(fill !== undefined && /^#[0-9a-fA-F]{6}$/.test(fill) ? { fill } : {}),
    };
  };
  const all = [
    ...[...space.entries.values()].map(drawn),
    ...[...space.faint.values()].filter((entry) => !space.entries.has(entry.element)).map(drawn),
  ];
  return [...all, ...collapsedNames(space, all, nameOf)];
}

/**
 * An entry that draws nothing but a collapsed container's name, for each collapsed container of the
 * view that is neither in the space nor faint while what it holds is: the worker writes a collapsed
 * container's name once, by its own entry, so its contents need one to be named. It stands at the
 * middle of what they draw, where its name is written.
 */
function collapsedNames(
  space: Pick<Space, 'entries' | 'faint'>,
  drawn: readonly SpaceDrawnEntry[],
  nameOf: (element: Id) => string,
): SpaceDrawnEntry[] {
  const held = new Map<Id, SpaceBounds[]>();
  for (const entry of drawn) {
    const as = entry.as;
    if (as === undefined || space.entries.has(as) || space.faint.has(as)) continue;
    const boxes = held.get(as) ?? [];
    boxes.push(
      entry.bounds
        ? boundsPlaced(entry.matrix, entry.bounds)
        : boundsOfPoint({
            x: entry.matrix[12] ?? 0,
            y: entry.matrix[13] ?? 0,
            z: entry.matrix[14] ?? 0,
          }),
    );
    held.set(as, boxes);
  }
  return [...held].map(([container, boxes]) => {
    const middle = (axis: 'x' | 'y' | 'z') => {
      const low = Math.min(...boxes.map((box) => box.min[axis]));
      const high = Math.max(...boxes.map((box) => box.max[axis]));
      return (low + high) / 2;
    };
    const name = nameOf(container);
    return {
      element: container,
      name: name.length > MAX_SPACE_NAME ? `${name.slice(0, MAX_SPACE_NAME - 1)}…` : name,
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, middle('x'), middle('y'), middle('z'), 1],
    };
  });
}

/** Whether a space draws nothing: only its element, with no solid, and nothing faint. */
export function drawsNothing(space: Pick<Space, 'root' | 'entries' | 'faint'>): boolean {
  if (space.faint.size > 0) return false;
  for (const entry of space.entries.values()) {
    if (entry.element !== space.root || entry.solid) return false;
  }
  return true;
}
