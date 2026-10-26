/**
 * What the app and the routing worker say to each other (`avoid.worker.ts`): the shapes of a scene and
 * the lines to route around them, and the routes that come back, a few at a time, nearest the middle
 * of the screen first. Everything is numbers, so that it is copied quickly.
 */
import type { Point } from '../geometry';
import type { Avoided, AvoidLine, AvoidShapes } from './avoid';

/** Routes these lines around these shapes; a newer request stops any older one. */
export interface AvoidRequest {
  type: 'route';
  id: number;
  shapes: AvoidShapes;
  lines: AvoidLine[];
  /** Where the middle of the screen is, in the scene: the lines nearest it are routed first. */
  center?: Point;
}

/** Stops a request: nothing more comes back for it. */
export interface AvoidCancel {
  type: 'cancel';
  id: number;
}

export type AvoidMessage = AvoidRequest | AvoidCancel;

/** Some of a request's routes, by the indexes of their lines in it; the last reply says it is done. */
export interface AvoidReply {
  id: number;
  results: { line: number; avoided: Avoided }[];
  done: boolean;
  /** How long the worker routed them, in milliseconds. */
  took: number;
}

/** How long the worker routes before it sends what it has, in milliseconds. */
export const AVOID_CHUNK_MS = 20;

/** The order to route lines in: nearest `center` first, by the middle of their stand-in routes. */
export function routingOrder(lines: readonly AvoidLine[], center: Point | undefined): number[] {
  const order = lines.map((_, at) => at);
  if (!center) return order;
  const distance = lines.map(({ route }) => {
    const middle = (route.length >> 2) << 1;
    const x = route[middle] ?? 0;
    const y = route[middle + 1] ?? 0;
    return Math.hypot(x - center.x, y - center.y);
  });
  return order.sort((a, b) => (distance[a] as number) - (distance[b] as number));
}
