/**
 * The physical-space panel's ways of reading (ADR 0076): a cutting plane across the X, Y or Z axis
 * of the element the panel shows, at a place moved with a slider, keeping one side; an exploded view
 * by a factor from 0 to 2; Names; and Relations of the selection. Each is what the tab keeps for the
 * view (`SpacePanelStore`), so view states and addresses carry it; reading changes nothing in the
 * project. What says nothing is left out, as view states write it: no cut, no explosion, names and
 * relations off.
 *
 * Show World takes the panel back to World from the element it shows, keeping the exploded view,
 * Names and Relations of the selection, which mean the same there; its camera and its cut are in the
 * coordinates of the element it showed, so they go, and it frames World whole.
 */
import { MAX_SPACE_DISTANCE, type Space, type ViewSpace } from '@visual-anything/core';
import type { SpaceBounds, SpaceCut } from '@visual-anything/schema';
import { eased } from '../canvas/layout/transition';
import { boundsOfPoint, boundsPlaced } from './camera';

export type CutAxis = SpaceCut['axis'];

export const CUT_AXES: readonly CutAxis[] = ['x', 'y', 'z'];

/** The most the exploded view moves parts apart, and the step its slider moves by. */
export const MOST_EXPLODED = 2;
export const EXPLODE_STEP = 0.05;

/** How long a change of the exploded view takes to ease in, unless motion is reduced. */
export const EXPLODE_EASE = 200;

/** How many steps the cut's slider has across what the panel draws. */
export const CUT_STEPS = 200;

/** Where a slider for the cut moves: from `min` to `max` along its axis, by `step`, in meters. */
export interface CutRange {
  min: number;
  max: number;
  step: number;
}

/**
 * The box holding everything a space draws, in the coordinates of the element the panel shows: each
 * solid's bounds where its matrix puts them, and each other entry's origin. Undefined when it draws
 * nothing.
 */
export function spaceBoundsOf(space: Pick<Space, 'entries' | 'faint'>): SpaceBounds | undefined {
  let found: SpaceBounds | undefined;
  for (const entry of [...space.entries.values(), ...space.faint.values()]) {
    const box = entry.solid
      ? boundsPlaced(entry.matrix, entry.solid.definition.bounds)
      : boundsOfPoint({
          x: entry.matrix[12] ?? 0,
          y: entry.matrix[13] ?? 0,
          z: entry.matrix[14] ?? 0,
        });
    found = found
      ? {
          min: {
            x: Math.min(found.min.x, box.min.x),
            y: Math.min(found.min.y, box.min.y),
            z: Math.min(found.min.z, box.min.z),
          },
          max: {
            x: Math.max(found.max.x, box.max.x),
            y: Math.max(found.max.y, box.max.y),
            z: Math.max(found.max.z, box.max.z),
          },
        }
      : box;
  }
  return found;
}

/**
 * Where the cut's slider moves along an axis: across the bounds of what the panel draws, a little
 * past each side so that the cut can leave every solid whole, and wide enough to hold where the cut
 * is now; a meter either way around a point, or around the origin when it draws nothing; never past
 * where a cut may go.
 */
export function cutRangeOf(bounds: SpaceBounds | undefined, axis: CutAxis, at?: number): CutRange {
  let low = bounds ? bounds.min[axis] : 0;
  let high = bounds ? bounds.max[axis] : 0;
  const extent = high - low;
  const margin = extent > 0 ? extent * 0.05 : 1;
  low -= margin;
  high += margin;
  if (at !== undefined) {
    low = Math.min(low, at);
    high = Math.max(high, at);
  }
  low = Math.max(-MAX_SPACE_DISTANCE, low);
  high = Math.min(MAX_SPACE_DISTANCE, high);
  return { min: low, max: high, step: (high - low) / CUT_STEPS };
}

/** The middle of what the panel draws along an axis: where a new cut crosses it. */
export function middleOf(bounds: SpaceBounds | undefined, axis: CutAxis): number {
  return bounds ? (bounds.min[axis] + bounds.max[axis]) / 2 : 0;
}

/**
 * The panel cut across an axis, or not cut at all: a new cut crosses at the middle of what it draws,
 * keeping what is below, and a cut moved to another axis keeps its side.
 */
export function cutAcross(
  shown: ViewSpace,
  axis: CutAxis | undefined,
  bounds: SpaceBounds | undefined,
): ViewSpace {
  const cut = shown.cut;
  if (axis === undefined) return without(shown, 'cut');
  if (cut?.axis === axis) return shown;
  return { ...shown, cut: { axis, at: middleOf(bounds, axis), keep: cut?.keep ?? 'below' } };
}

/** The panel's cut moved along its axis, within where a cut may go; nothing while it has none. */
export function cutAt(shown: ViewSpace, at: number): ViewSpace {
  if (!shown.cut || !Number.isFinite(at)) return shown;
  const clamped = Math.min(MAX_SPACE_DISTANCE, Math.max(-MAX_SPACE_DISTANCE, at));
  return { ...shown, cut: { ...shown.cut, at: clamped } };
}

/** The panel's cut keeping the other side; nothing while it has none. */
export function cutKeeping(shown: ViewSpace, keep: SpaceCut['keep']): ViewSpace {
  if (!shown.cut || shown.cut.keep === keep) return shown;
  return { ...shown, cut: { ...shown.cut, keep } };
}

/** The panel exploded by a factor, from 0 to 2, left out at 0. */
export function exploded(shown: ViewSpace, factor: number): ViewSpace {
  const rest = without(shown, 'explode');
  const clamped = Number.isFinite(factor) ? Math.min(MOST_EXPLODED, Math.max(0, factor)) : 0;
  return clamped > 0 ? { ...rest, explode: clamped } : rest;
}

/** The panel with Names, or Relations of the selection, turned on or off; left out when off. */
export function switched(shown: ViewSpace, which: 'names' | 'relations', on: boolean): ViewSpace {
  const rest = without(shown, which);
  return on ? { ...rest, [which]: true } : rest;
}

/** The panel showing World, as Show World leaves it. */
export function showingWorld(shown: ViewSpace): ViewSpace {
  return without(shown, 'root', 'camera', 'cut');
}

/** The exploded view a share of the way from one factor to another, as its change eases in. */
export function explodeBetween(from: number, to: number, share: number): number {
  return from + (to - from) * eased(Math.min(1, Math.max(0, share)));
}

/** A copy of what the panel shows without these keys. */
function without(shown: ViewSpace, ...keys: (keyof ViewSpace)[]): ViewSpace {
  const copy = { ...shown };
  for (const key of keys) delete copy[key];
  return copy;
}
