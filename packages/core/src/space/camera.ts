/**
 * The physical-space panel's camera (ADR 0076), read as a view state carries it and as Claude's
 * guidance `space` moves it: a point it turns around, in the root's coordinates, an azimuth, an
 * elevation and a distance. Kept apart from view states and the protocol, which both read it.
 */
import type { SpaceCamera } from '@visual-anything/schema';

/** How far from the root's origin the panel's camera may look and cut, in meters, either way. */
export const MAX_SPACE_DISTANCE = 100_000_000;

/** A finite number from `min` to `max`, a negative zero as 0; otherwise `undefined`. */
function within(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    return undefined;
  }
  return value === 0 ? 0 : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The panel's camera `value` holds, exactly its four keys and its target's three, or why it is not
 * one: `form` when its keys are not those, and otherwise what is out of range.
 */
export function readSpaceCamera(
  value: unknown,
  form: string,
): { ok: true; camera: SpaceCamera } | { ok: false; message: string } {
  const refused = (message: string) => ({ ok: false as const, message });
  if (!isRecord(value) || Object.keys(value).length !== 4 || !isRecord(value.target)) {
    return refused(form);
  }
  const { target } = value;
  if (Object.keys(target).length !== 3) return refused(form);
  const [x, y, z] = [target.x, target.y, target.z].map((each) =>
    within(each, -MAX_SPACE_DISTANCE, MAX_SPACE_DISTANCE),
  );
  if (x === undefined || y === undefined || z === undefined) {
    return refused(
      `The physical-space panel looks at most ${MAX_SPACE_DISTANCE} m from the origin of what it shows.`,
    );
  }
  const azimuth = within(value.azimuth, -180, 180);
  if (azimuth === undefined) {
    return refused('The azimuth of the physical-space panel is from -180 to 180 degrees.');
  }
  const elevation = within(value.elevation, -89, 89);
  if (elevation === undefined) {
    return refused('The elevation of the physical-space panel is from -89 to 89 degrees.');
  }
  const distance = within(value.distance, 0, MAX_SPACE_DISTANCE);
  if (distance === undefined || distance === 0) {
    return refused(
      `The physical-space panel looks from more than 0 m and at most ${MAX_SPACE_DISTANCE} m.`,
    );
  }
  return { ok: true, camera: { target: { x, y, z }, azimuth, elevation, distance } };
}
