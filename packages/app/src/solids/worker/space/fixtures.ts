/**
 * Spaces for the tests of drawing a space (ADR 0076): the arm of the worker's fixtures, built, and a
 * space as the host hands it to the GPU.
 */
import type { Id } from '@visual-anything/schema';
import type { SpaceDrawnEntry, SpaceElementState } from '../../protocol';
import { buildSolid, type BuiltSolid } from '../build';
import { ARM, ARM_HASH } from '../fixtures';
import type { SpaceToDraw } from '../host';

/** The arm: a base, a link on it, and a gripper held by the link; 1.2 m tall. */
export async function armSolid(): Promise<BuiltSolid> {
  const built = await buildSolid(ARM, ARM_HASH, { decodeImage: () => Promise.resolve(undefined) });
  if (!built.ok) throw new Error(built.message);
  return built.solid;
}

export const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** A matrix that moves to (x, y, z). */
export function at(x: number, y: number, z: number): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

/** An entry drawing the arm at a place. */
export function armEntry(element: Id, matrix = IDENTITY): SpaceDrawnEntry {
  return { element, name: element, matrix, solid: ARM_HASH };
}

/** A space drawing these entries, the arm loaded, looking at the origin from 4 m in front. */
export function spaceToDraw(
  solid: BuiltSolid,
  entries: SpaceDrawnEntry[],
  more: Partial<Omit<SpaceToDraw, 'states'>> & { states?: Record<Id, SpaceElementState> } = {},
): SpaceToDraw {
  const { states, ...rest } = more;
  return {
    space: 1,
    size: { width: 400, height: 400 },
    camera: { target: { x: 0, y: 0.6, z: 0 }, azimuth: 0, elevation: 0, distance: 4 },
    entries,
    states: new Map(Object.entries(states ?? {})),
    cut: undefined,
    explode: 0,
    names: false,
    lines: [],
    solids: new Map([[ARM_HASH, solid]]),
    boxed: new Set(),
    theme: 'light',
    pixelRatio: 1,
    handles: undefined,
    ...rest,
  };
}
