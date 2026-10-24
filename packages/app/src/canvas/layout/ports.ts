/**
 * Connection points as ELK takes them: as ports on the border of a shape. A component's appearance
 * sets them (`docs/designs/components.md` §4.2 and §4.3); a shape without any has relations attach
 * anywhere on its border, and ELK then decides where. Pure, and run in the layout worker.
 */
import type { Point, Size } from '../geometry';
import type { LayoutConnectionPoint } from './types';

const SIDES: ReadonlySet<string> = new Set(['top', 'right', 'bottom', 'left']);

/** The side of a node each side of a shape is to ELK. */
export const ELK_SIDES: Record<LayoutConnectionPoint['side'], string> = {
  top: 'NORTH',
  right: 'EAST',
  bottom: 'SOUTH',
  left: 'WEST',
};

/**
 * The connection points a resolved appearance sets, or `undefined` when it sets none, so that relations
 * attach anywhere on the border. It reads the appearance as data: one from before connection points
 * existed sets none, and what is not a connection point is left out.
 */
export function connectionPointsOf(appearance: unknown): LayoutConnectionPoint[] | undefined {
  if (typeof appearance !== 'object' || appearance === null) return undefined;
  const listed = (appearance as { connectionPoints?: unknown }).connectionPoints;
  if (!Array.isArray(listed)) return undefined;
  const points = listed.flatMap((point: unknown): LayoutConnectionPoint[] => {
    if (typeof point !== 'object' || point === null) return [];
    const { name, side, at } = point as Record<string, unknown>;
    if (typeof name !== 'string' || name === '') return [];
    if (typeof side !== 'string' || !SIDES.has(side)) return [];
    if (typeof at !== 'number' || !(at >= 0 && at <= 1)) return [];
    return [{ name, side: side as LayoutConnectionPoint['side'], at }];
  });
  return points.length > 0 ? points : undefined;
}

/** Where a connection point sits on a shape of this size, relative to its top left corner. */
export function pointOnBorder(point: LayoutConnectionPoint, size: Size): Point {
  switch (point.side) {
    case 'left':
      return { x: 0, y: point.at * size.height };
    case 'right':
      return { x: size.width, y: point.at * size.height };
    case 'top':
      return { x: point.at * size.width, y: 0 };
    case 'bottom':
      return { x: point.at * size.width, y: size.height };
  }
}

/**
 * The index of the point a relation uses at one of its ends, as layout sees it: the one nearest the
 * middle of the side it leaves by, `east` where layout's flow leaves the shape and `west` where it
 * enters. So a shape with a point on that side uses it, and one without uses the point nearest it.
 */
export function pointToward(
  points: readonly LayoutConnectionPoint[],
  size: Size,
  toward: 'east' | 'west',
): number {
  const target = { x: toward === 'east' ? size.width : 0, y: size.height / 2 };
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  points.forEach((point, at) => {
    const place = pointOnBorder(point, size);
    const distance = Math.hypot(place.x - target.x, place.y - target.y);
    if (distance < bestDistance) {
      best = at;
      bestDistance = distance;
    }
  });
  return best;
}
