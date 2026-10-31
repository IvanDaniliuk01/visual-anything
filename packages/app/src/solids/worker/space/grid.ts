/**
 * The ground (ADR 0076): a grid on the plane y = 0 of the element the panel shows, whose cells are a
 * power of ten meters that follows the camera's distance, so that from 8 to 80 of them span the
 * frame's height at the point the camera turns around; every tenth line is stronger. Its lines are
 * worked out relative to the camera's target, as everything the GPU draws is, so that a ground far
 * from the origin keeps its precision. A scale says how long one cell is.
 */
import type { SpaceCamera } from '@visual-anything/schema';
import { SPACE_FIELD_OF_VIEW } from '../../../space/camera';

/** The fewest cells across the frame's height at the target. */
const FEWEST_CELLS = 8;
/** How many cells the ground reaches from the target's foot, each way. */
export const GRID_REACH = 60;
/** The smallest and largest cells. */
const SMALLEST_CELL = 1e-4;
const LARGEST_CELL = 1e7;

const HALF_VIEW = Math.tan(((SPACE_FIELD_OF_VIEW / 2) * Math.PI) / 180);

/** How tall the frame is at a depth, in meters. */
export function heightAt(depth: number): number {
  return 2 * depth * HALF_VIEW;
}

/** One cell's side, in meters, from the camera's distance: a power of ten. */
export function gridCell(distance: number): number {
  const span = heightAt(Math.max(distance, 1e-9)) / FEWEST_CELLS;
  const cell = 10 ** Math.floor(Math.log10(span) + 1e-9);
  return Math.min(LARGEST_CELL, Math.max(SMALLEST_CELL, cell));
}

/** The ground's lines, as pairs of points relative to the camera's target. */
export interface SpaceGrid {
  cell: number;
  /** x, y, z of each line's two ends, one line after another. */
  minor: Float32Array;
  /** Every tenth line, drawn stronger. */
  major: Float32Array;
}

/** The ground seen from a camera. */
export function gridOf(camera: SpaceCamera): SpaceGrid {
  const cell = gridCell(camera.distance);
  const { target } = camera;
  const y = -target.y;
  const minor: number[] = [];
  const major: number[] = [];
  const fromX = Math.round(target.x / cell) - GRID_REACH;
  const fromZ = Math.round(target.z / cell) - GRID_REACH;
  const lowX = fromX * cell - target.x;
  const highX = (fromX + 2 * GRID_REACH) * cell - target.x;
  const lowZ = fromZ * cell - target.z;
  const highZ = (fromZ + 2 * GRID_REACH) * cell - target.z;
  for (let step = 0; step <= 2 * GRID_REACH; step++) {
    const kx = fromX + step;
    const x = kx * cell - target.x;
    (kx % 10 === 0 ? major : minor).push(x, y, lowZ, x, y, highZ);
    const kz = fromZ + step;
    const z = kz * cell - target.z;
    (kz % 10 === 0 ? major : minor).push(lowX, y, z, highX, y, z);
  }
  return { cell, minor: Float32Array.from(minor), major: Float32Array.from(major) };
}

/** A length of a power of ten meters, in mm, cm, m or km, whichever keeps it from 1 to 1,000. */
export function lengthLabel(meters: number): string {
  const [unit, per] =
    meters < 0.01
      ? (['mm', 1e-3] as const)
      : meters < 1
        ? (['cm', 1e-2] as const)
        : meters < 1000
          ? (['m', 1] as const)
          : (['km', 1e3] as const);
  const value = Number((meters / per).toPrecision(6));
  return `${String(value)} ${unit}`;
}

/** The scale: one cell's length, written, and how many pixels it takes at the camera's target. */
export interface SpaceScale {
  cell: number;
  label: string;
  pixels: number;
}

/** The ground's scale in frames of this height, in pixels. */
export function scaleOf(camera: SpaceCamera, height: number): SpaceScale {
  const cell = gridCell(camera.distance);
  return {
    cell,
    label: lengthLabel(cell),
    pixels: (cell / heightAt(camera.distance)) * height,
  };
}
