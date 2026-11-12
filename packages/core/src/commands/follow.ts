/**
 * A route by hand follows its ends (ADR 0039's clarification of 2026-10-30, M3c Stage 1, and ADR 0092
 * §5). Every move of shapes, the person's drag, Claude's `set_positions` and a layout alike, is
 * `set-positions`, which carries the bend points of the routes whose ends it moves, in the same
 * action:
 *
 * - when both ends move together, by the same amount in the frame of the bend points, every bend
 *   point moves with them;
 * - when the two move apart, the bend points stretch with the box their ends span, along each axis:
 *   one between the ends keeps its share of the span, rounded to whole units, and one at or beyond an
 *   end moves with that end. Coordinates that were equal stay equal, so an orthogonal route stays
 *   orthogonal. The run from each end to its first corner then keeps level with the end, through
 *   every bend point in line with it;
 * - along an axis where the ends' span is under 8 units, or where their places are not known, the
 *   corner next to each end that moved moves along its axis, as before ADR 0092: the run from the end
 *   to that corner keeps level with the end, and the corner slides along the run it turns into, which
 *   stays straight. The other bend points stay.
 *
 * How far an end moved is read from the view's stored places, along the containers its first shape
 * sits in, up to the container its bend points are relative to; where it was, from the middle of the
 * innermost of those shapes whose place, and every container's above it, the view stored. An end
 * whose place, or a container's between, was not stored before is not the core's to know: the scene
 * placed it. Its route stays as it was, as does a route that ends on a line, on World, or whose bend
 * points are kept while their container no longer holds both ends.
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
  /**
   * Where the middle of the end's shape was before the move, in the frame of the bend points, when
   * the view's stored places tell. With both ends' places, the bend points stretch with them.
   */
  at?: Point;
}

/** Along an axis where the ends' span is under this, the bend points do not stretch (ADR 0092 §5). */
export const LEAST_STRETCHED_SPAN = 8;

/** How deep the containers of an end are followed, however a file nests them. */
const MOST_DEPTH = 64;

/** What the ends ask of each bend point's coordinates: several asks of one coordinate share it. */
interface Asked {
  x: number[];
  y: number[];
}

/**
 * The bend points of a route after its ends moved, from the `from` end; undefined when they stay.
 * Both ends moved by the same amount: all of them move by it. Otherwise, along each axis where both
 * ends' places are known and span at least 8 units, they stretch with the ends, and the run into each
 * end keeps level with it. Along the others, each end that moved takes the run it leaves along with
 * it: across that run's axis, the axis the end leaves along when it is known, else the one the next
 * run's direction tells, through every bend point in line with the end up to the corner where the
 * route turns; with neither, its first bend point moves by the whole move. Where both ends ask for one
 * coordinate of a bend point, it moves by their mean.
 */
export function followedBendPoints(
  bends: readonly Point[],
  from: EndMove,
  to: EndMove,
): Point[] | undefined {
  if (bends.length === 0 || (!moves(from) && !moves(to))) return undefined;
  if (from.delta.x === to.delta.x && from.delta.y === to.delta.y) {
    return bends.map((point) => ({ x: point.x + from.delta.x, y: point.y + from.delta.y }));
  }
  const start = from.at;
  const end = to.at;
  const corners = runAsks(bends, from, to, 'corners');
  const stubs =
    start !== undefined && end !== undefined ? runAsks(bends, from, to, 'stubs') : undefined;
  const moved = bends.map((point) => ({ x: point.x, y: point.y }));
  for (const key of ['x', 'y'] as const) {
    const stretch =
      start !== undefined &&
      end !== undefined &&
      Math.abs(end[key] - start[key]) >= LEAST_STRETCHED_SPAN
        ? stretcher(start[key], from.delta[key], end[key], to.delta[key])
        : undefined;
    bends.forEach((point, index) => {
      const old = point[key];
      const target = moved[index] as Point;
      if (stretch === undefined || stubs === undefined) {
        target[key] = old + share((corners[index] as Asked)[key]);
        return;
      }
      // The runs into the ends keep level with them; the rest stretches.
      const asked = (stubs[index] as Asked)[key];
      target[key] = asked.length > 0 ? old + share(asked) : stretch(old);
    });
  }
  const same = moved.every(
    (point, index) =>
      point.x === (bends[index] as Point).x && point.y === (bends[index] as Point).y,
  );
  return same ? undefined : moved;
}

function moves(end: EndMove): boolean {
  return end.delta.x !== 0 || end.delta.y !== 0;
}

function share(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, each) => sum + each, 0) / values.length;
}

/**
 * Where a coordinate goes along one axis when the ends at `start` and `end` move by `byStart` and
 * `byEnd`: strictly between them, to its share of their new span, rounded to whole units; at or
 * beyond one of them, with that one.
 */
function stretcher(
  start: number,
  byStart: number,
  end: number,
  byEnd: number,
): (coordinate: number) => number {
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  const byLow = start <= end ? byStart : byEnd;
  const byHigh = start <= end ? byEnd : byStart;
  const scale = (end + byEnd - (start + byStart)) / (end - start);
  return (coordinate) => {
    if (coordinate <= low) return coordinate + byLow;
    if (coordinate >= high) return coordinate + byHigh;
    return Math.round(start + byStart + (coordinate - start) * scale);
  };
}

/**
 * What the run each end leaves along asks of the bend points. For `corners`, the ends that moved ask,
 * and an end whose axis is not known asks its first bend point to move by its whole move; for
 * `stubs`, both ends ask, moved or not, and only along an axis that is known.
 */
function runAsks(
  bends: readonly Point[],
  from: EndMove,
  to: EndMove,
  kind: 'corners' | 'stubs',
): Asked[] {
  const asked: Asked[] = bends.map(() => ({ x: [], y: [] }));
  const ask = (end: EndMove, order: readonly number[]) => {
    if (kind === 'corners' && !moves(end)) return;
    const first = order[0] as number;
    const corner = bends[first] as Point;
    const next = order.length > 1 ? bends[order[1] as number] : undefined;
    // The axis of the run from the end to its first bend point: as the end leaves, or else across
    // the run from that point to the next, which then stays.
    let axis = end.axis;
    if (axis === undefined && next !== undefined) {
      if (next.x === corner.x && next.y !== corner.y) axis = 'h';
      else if (next.y === corner.y && next.x !== corner.x) axis = 'v';
    }
    if (axis === undefined) {
      if (kind === 'stubs') return;
      (asked[first] as Asked).x.push(end.delta.x);
      (asked[first] as Asked).y.push(end.delta.y);
      return;
    }
    // A horizontal run keeps its y with the end, through every bend point in line with it, up to
    // and with the corner where it turns; a vertical one its x.
    const key = axis === 'h' ? 'y' : 'x';
    let previous: Point | undefined;
    for (const index of order) {
      const point = bends[index] as Point;
      if (previous !== undefined && point[key] !== previous[key]) break;
      (asked[index] as Asked)[key].push(end.delta[key]);
      previous = point;
    }
  };
  const forward = bends.map((_, index) => index);
  ask(from, forward);
  ask(to, [...forward].reverse());
  return asked;
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

  /**
   * Where an end's shape had its middle before the move, relative to `frame`: the middle of the
   * innermost of its shape and its containers' whose place, and every container's above it up to the
   * frame, the view stored, so a row's is its table's. Its size is the one stored, else its
   * appearance's. Undefined when no such shape is stored.
   */
  const middleOf = (end: Id, frame: Id | undefined): Point | undefined => {
    if (end === world || draft.index.element(end) === undefined) return undefined;
    const chain = chainOf(end);
    if (chain === undefined) return undefined;
    const top = frame === undefined ? chain.length : chain.indexOf(frame);
    if (top < 0) return undefined;
    const stored = (at: number) =>
      was.get(positionKey({ element: chain[at] as Id, container: chain[at + 1] }));
    // The places from the frame down, while each one is stored.
    let x = 0;
    let y = 0;
    let innermost: { at: number; position: ShapePosition } | undefined;
    for (let at = top - 1; at >= 0; at--) {
      const position = stored(at);
      if (position === undefined) break;
      x += position.x;
      y += position.y;
      innermost = { at, position };
    }
    if (innermost === undefined) return undefined;
    const element = draft.index.element(chain[innermost.at] as Id);
    if (element === undefined) return undefined;
    const appearance = appearanceOf(element, draft.definitions);
    const width = innermost.position.width ?? appearance.width;
    const height = innermost.position.height ?? appearance.height;
    return { x: x + width / 2, y: y + height / 2 };
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
    if (from.x === 0 && from.y === 0 && to.x === 0 && to.y === 0) continue;
    const bends = followedBendPoints(
      route.bendPoints ?? [],
      endMove(from, axisOf(route, 'from', relation.from), middleOf(relation.from, frame)),
      endMove(to, axisOf(route, 'to', relation.to), middleOf(relation.to, frame)),
    );
    if (bends === undefined) continue;
    changes.push({ relation: id, route: { ...route, bendPoints: bends } });
  }
  changeRoutes(draft, view, changes);
}

function endMove(delta: Point, axis: 'h' | 'v' | undefined, at: Point | undefined): EndMove {
  return {
    delta,
    ...(axis === undefined ? {} : { axis }),
    ...(at === undefined ? {} : { at }),
  };
}
