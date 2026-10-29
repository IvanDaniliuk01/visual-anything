/**
 * Connection points as ELK takes them: as ports on the border of a shape. A component's appearance
 * sets them (`docs/designs/components.md` §4.2 and §4.3); a shape without any has relations attach
 * anywhere on its border, and ELK then decides where. Pure, and run in the layout worker.
 */
import type { ResolvedAttachment } from '@visual-anything/core';
import type { Point, Size } from '../geometry';
import type { RelationLine } from '../scene';
import type { LayoutConnectionPoint, LayoutPort } from './types';

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

/**
 * The ends of a line that the view routes by hand at a chosen place (ADR 0039), as fixed ports: a
 * border place or a connection point, by its side and place along it. Automatic ends have none.
 */
export function handPortsOf(line: RelationLine): { fromPort?: LayoutPort; toPort?: LayoutPort } {
  const route = line.hand?.route;
  if (!route) return {};
  const port = (attachment: ResolvedAttachment): LayoutPort | undefined =>
    attachment.kind === 'automatic' || attachment.kind === 'inside'
      ? undefined
      : { side: attachment.side, at: attachment.at };
  const fromPort = port(route.from);
  const toPort = port(route.to);
  return { ...(fromPort ? { fromPort } : {}), ...(toPort ? { toPort } : {}) };
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

/**
 * Where a drawing with parts takes the relations of one of its parts (ADR 0015's clarification): on
 * its side nearest the part's inner point, at the place along that side nearest it, rounded to a
 * unit so that parts close together share a port.
 */
export function partPort(
  part: Point,
  size: Size,
): { side: LayoutConnectionPoint['side']; along: number; x: number; y: number } {
  const x = Math.min(size.width, Math.max(0, part.x));
  const y = Math.min(size.height, Math.max(0, part.y));
  const away: [LayoutConnectionPoint['side'], number][] = [
    ['left', x],
    ['right', size.width - x],
    ['top', y],
    ['bottom', size.height - y],
  ];
  let [side, nearest] = away[0] as [LayoutConnectionPoint['side'], number];
  for (const [each, distance] of away) {
    if (distance < nearest) {
      side = each;
      nearest = distance;
    }
  }
  switch (side) {
    case 'left':
      return { side, along: Math.round(y), x: 0, y: Math.round(y) };
    case 'right':
      return { side, along: Math.round(y), x: size.width, y: Math.round(y) };
    case 'top':
      return { side, along: Math.round(x), x: Math.round(x), y: 0 };
    case 'bottom':
      return { side, along: Math.round(x), x: Math.round(x), y: size.height };
  }
}
