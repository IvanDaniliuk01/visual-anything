/**
 * A route by hand follows its ends (ADR 0039's clarification of 2026-10-30, M3c Stage 1). Every move
 * of shapes, the person's drag, Claude's `set_positions` and a layout alike, is `set-positions`, which
 * carries the bend points of the routes whose ends it moves, in the same action:
 *
 * - when both ends move together, by the same amount in the frame of the bend points, every bend
 *   point moves with them;
 * - when only one end moves, or the two move apart, the corner next to each end that moved moves
 *   along its axis: the run from the end to that corner keeps level with the end, through every bend
 *   point in line with it, and the corner slides along the run it turns into, which stays straight,
 *   so the route stays orthogonal. The other bend points stay.
 *
 * How far an end moved is read from the view's stored places, along the containers its first shape
 * sits in, up to the container its bend points are relative to. An end whose place, or a container's
 * between, was not stored before is not the core's to know: the scene placed it. Its route stays as it
 * was, as does a route that ends on a line, on World, or whose bend points are kept while their
 * container no longer holds both ends.
 */
import type { Id, Point, RelationRoute, ShapePosition, ViewFile } from '@visual-anything/schema';
import { positionKey } from '../operations';
import { routeContext, type RouteContext } from '../routes';
import { shapesInView } from '../scope-placement';
import { appearanceOf } from '../definitions';
import type { Draft } from './draft';
import { changeRoutes } from './routes';

/** How one end of a route moved: by how much, and along which axis it leaves, when that is known. */
export interface EndMove {
  delta: Point;
  /** The axis of the run from the end to its first corner: `h` leaves left or right, `v` up or down. */
  axis?: 'h' | 'v';
}

/** How deep the containers of an end are followed, however a file nests them. */
const MOST_DEPTH = 64;

/**
 * The bend points of a route after its ends moved, from the `from` end; undefined when they stay.
 * Both ends moved by the same amount: all of them move by it. Otherwise each end that moved takes the
 * run it leaves along with it: across that run's axis, the axis the end leaves along when it is known,
 * else the one the next run's direction tells, through every bend point in line with the end up to
 * the corner where the route turns. With neither, its first bend point moves by the whole move. Where
 * both ends move one coordinate of a bend point, it moves by their mean.
 */
export function followedBendPoints(
  bends: readonly Point[],
  from: EndMove,
  to: EndMove,
): Point[] | undefined {
  const moves = (end: EndMove) => end.delta.x !== 0 || end.delta.y !== 0;
  if (bends.length === 0 || (!moves(from) && !moves(to))) return undefined;
  if (from.delta.x === to.delta.x && from.delta.y === to.delta.y) {
    return bends.map((point) => ({ x: point.x + from.delta.x, y: point.y + from.delta.y }));
  }
  // What each end asks of each bend point's coordinates: several asks of one coordinate share it.
  const asked: { x: number[]; y: number[] }[] = bends.map(() => ({ x: [], y: [] }));
  const ask = (end: EndMove, order: readonly number[]) => {
    if (!moves(end)) return;
    const at = order[0] as number;
    const corner = bends[at] as Point;
    const next = order.length > 1 ? bends[order[1] as number] : undefined;
    // The axis of the run from the end to its first bend point: as the end leaves, or else across
    // the run from that point to the next, which then stays.
    let axis = end.axis;
    if (axis === undefined && next !== undefined) {
      if (next.x === corner.x && next.y !== corner.y) axis = 'h';
      else if (next.y === corner.y && next.x !== corner.x) axis = 'v';
    }
    if (axis === undefined) {
      (asked[at] as { x: number[]; y: number[] }).x.push(end.delta.x);
      (asked[at] as { x: number[]; y: number[] }).y.push(end.delta.y);
      return;
    }
    // A horizontal run keeps its y with the end, through every bend point in line with it, up to
    // and with the corner where it turns; a vertical one its x.
    const key = axis === 'h' ? 'y' : 'x';
    let previous: Point | undefined;
    for (const index of order) {
      const point = bends[index] as Point;
      if (previous !== undefined && point[key] !== previous[key]) break;
      (asked[index] as { x: number[]; y: number[] })[key].push(end.delta[key]);
      previous = point;
    }
  };
  const forward = bends.map((_, at) => at);
  ask(from, forward);
  ask(to, [...forward].reverse());
  const share = (values: readonly number[]) =>
    values.length === 0 ? 0 : values.reduce((sum, each) => sum + each, 0) / values.length;
  const moved = bends.map((point, at) => {
    const wants = asked[at] as { x: number[]; y: number[] };
    return { x: point.x + share(wants.x), y: point.y + share(wants.y) };
  });
  const same = moved.every(
    (point, at) => point.x === (bends[at] as Point).x && point.y === (bends[at] as Point).y,
  );
  return same ? undefined : moved;
}

/**
 * Carries, in the draft, the bend points of the view's routes whose ends `set-positions` moved from
 * the places `before` stored to those the view stores now.
 */
export function followRoutes(draft: Draft, viewId: Id, before: ViewFile): void {
  const view = draft.view(viewId);
  const routes = view.routes;
  if (routes === undefined) return;
  const entries = Object.entries(routes).filter(([, route]) => (route.bendPoints?.length ?? 0) > 0);
  if (entries.length === 0) return;
  const was = new Map(before.positions.map((position) => [positionKey(position), position]));
  const now = new Map(view.positions.map((position) => [positionKey(position), position]));
  const placed = shapesInView(draft.state, view);
  const world = draft.index.world.id;
  let context: RouteContext | undefined;

  /** The containers the first shape of an element sits in, from its own up to World's contents. */
  const chainOf = (element: Id): Id[] | undefined => {
    const chain: Id[] = [element];
    let at: Id | undefined = element;
    for (let depth = 0; depth < MOST_DEPTH; depth++) {
      const containers = placed.containersOf(at);
      if (containers === undefined) return undefined;
      at = containers[0];
      if (at === undefined) return chain;
      if (chain.includes(at)) return undefined;
      chain.push(at);
    }
    return undefined;
  };

  /** How far an end moved, relative to `frame`, or undefined when that is not known. */
  const deltaOf = (end: Id, frame: Id | undefined): Point | undefined => {
    if (end === world || draft.index.element(end) === undefined) return undefined;
    const chain = chainOf(end);
    if (chain === undefined) return undefined;
    const delta = { x: 0, y: 0 };
    for (let at = 0; at < chain.length; at++) {
      const element = chain[at] as Id;
      if (element === frame) return delta;
      const key = positionKey({ element, container: chain[at + 1] });
      const old: ShapePosition | undefined = was.get(key);
      const next: ShapePosition | undefined = now.get(key);
      if (next !== undefined && old === undefined) return undefined;
      if (next !== undefined && old !== undefined) {
        delta.x += next.x - old.x;
        delta.y += next.y - old.y;
      }
    }
    // The frame must hold the end; the canvas holds everything.
    return frame === undefined ? delta : undefined;
  };

  /** The axis an end leaves along, from what its route attaches it to, when that tells. */
  const axisOf = (route: RelationRoute, which: 'from' | 'to', end: Id): 'h' | 'v' | undefined => {
    const attachment = route[which];
    let side: string | undefined;
    if (attachment?.kind === 'border') side = attachment.side;
    else if (attachment?.kind === 'connection-point') {
      const element = draft.index.element(end);
      side =
        element &&
        appearanceOf(element, draft.definitions).connectionPoints.find(
          (point) => point.name === attachment.name,
        )?.side;
    } else if (attachment === undefined) {
      context ??= routeContext(draft.state, view, { lookups: draft.index });
      // Lines beside rows leave the left or right side of their table (ADR 0023).
      if (context.endShape(end).kind === 'rows') return 'h';
    }
    if (side === 'left' || side === 'right') return 'h';
    if (side === 'top' || side === 'bottom') return 'v';
    return undefined;
  };

  const changes: { relation: Id; route: RelationRoute }[] = [];
  for (const [id, route] of entries) {
    const relation = draft.index.relation(id);
    if (relation === undefined) continue;
    const frame =
      route.container === undefined || route.container === world ? undefined : route.container;
    const from = deltaOf(relation.from, frame);
    const to = deltaOf(relation.to, frame);
    if (from === undefined || to === undefined) continue;
    const bends = followedBendPoints(
      route.bendPoints ?? [],
      { delta: from, ...optionalAxis(axisOf(route, 'from', relation.from)) },
      { delta: to, ...optionalAxis(axisOf(route, 'to', relation.to)) },
    );
    if (bends === undefined) continue;
    changes.push({ relation: id, route: { ...route, bendPoints: bends } });
  }
  changeRoutes(draft, view, changes);
}

function optionalAxis(axis: 'h' | 'v' | undefined): { axis?: 'h' | 'v' } {
  return axis === undefined ? {} : { axis };
}
