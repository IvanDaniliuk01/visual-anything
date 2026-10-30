/**
 * The relations a view routes by hand, as Claude's tools name them (M3d, "Fixes from use"). A route
 * by hand is drawn by the person, or set with `set_route`, and kept in the view's `routes`; layout and
 * moves never write one (ADR 0039). Its bend points follow its ends: all of them when both ends move
 * together, only those next to an end that moves alone (ADR 0039's clarification of 2026-10-30), so
 * after `set_positions` that moves ends apart, or once a route style draws them curved, a route by
 * hand can still run far from its ends. These answers let Claude see that and send them back to
 * automatic routes with `reset_route`.
 */
import { modelIndexOf, relationLabel, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, RelationRoute, ViewFile } from '@visual-anything/schema';

/** A relation a view routes by hand: what its route sets, and how many bend points it has. */
export interface RoutedByHand {
  relation: Id;
  name: string;
  /** What the route chooses rather than leaves automatic: `from`, `to`, `bendPoints`, `style`. */
  sets: string[];
  /** Absent when it has none. */
  bendPoints?: number;
}

/** The most relations one answer names; the rest are counted. */
export const MAX_HAND_ROUTES_NAMED = 100;

/** What read_view says about them. */
export const ROUTED_BY_HAND_NOTE =
  'These relations keep a route chosen by hand in this view, by the person or with set_route: layout and moves never replace it, and its bend points follow its ends, all of them when both ends move together and only those next to an end that moves alone, so a route whose ends moved apart can run far from them. When one runs where it should not, or was not meant, reset_route sends it back to the automatic route; ask the person first when they drew it.';

/** The view's relations routed by hand, in the order its file keeps them. */
export function routedByHand(state: ProjectSnapshot, view: ViewFile): RoutedByHand[] {
  const routes = view.routes;
  if (routes === undefined) return [];
  const index = modelIndexOf(state);
  return Object.entries(routes)
    .filter(([relation]) => index.relation(relation) !== undefined)
    .map(([relation, route]) => brief(index, relation, route));
}

function brief(
  index: ReturnType<typeof modelIndexOf>,
  relation: Id,
  route: RelationRoute,
): RoutedByHand {
  const sets = (['from', 'to', 'bendPoints', 'style'] as const).filter(
    (part) => route[part] !== undefined,
  );
  const bends = route.bendPoints?.length ?? 0;
  return {
    relation,
    name: relationLabel(index, relation),
    sets: [...sets],
    ...(bends === 0 ? {} : { bendPoints: bends }),
  };
}

/** At most {@link MAX_HAND_ROUTES_NAMED} of them under `key`, with how many more there are. */
export function namedRoutes(key: string, routes: readonly RoutedByHand[]): Record<string, unknown> {
  if (routes.length === 0) return {};
  return {
    [key]: routes.slice(0, MAX_HAND_ROUTES_NAMED),
    ...(routes.length > MAX_HAND_ROUTES_NAMED
      ? { [`${key}More`]: routes.length - MAX_HAND_ROUTES_NAMED }
      : {}),
  };
}

/** What read_view adds: the relations routed by hand, and what to do about them. */
export function routedByHandAnswer(
  state: ProjectSnapshot,
  view: ViewFile,
): Record<string, unknown> {
  const routes = routedByHand(state, view);
  return routes.length === 0
    ? {}
    : { ...namedRoutes('routedByHand', routes), routedByHandNote: ROUTED_BY_HAND_NOTE };
}

/** The views that route a relation by hand, as get_item names them. */
export function viewsRoutingByHand(
  state: ProjectSnapshot,
  relation: Id,
): { view: Id; name: string }[] {
  return state.views
    .filter((view) => view.routes !== undefined && Object.hasOwn(view.routes, relation))
    .map((view) => ({ view: view.id, name: view.name }));
}

/** The relations on an element that a view routes by hand, and the view, as get_item names them. */
export function handRoutesOn(state: ProjectSnapshot, element: Id): { relation: Id; view: Id }[] {
  const on = modelIndexOf(state)
    .relationsOn(element)
    .map((relation) => relation.id);
  return state.views.flatMap((view) =>
    view.routes === undefined
      ? []
      : on
          .filter((relation) => Object.hasOwn(view.routes ?? {}, relation))
          .map((relation) => ({
            relation,
            view: view.id,
          })),
  );
}

/**
 * The relations routed by hand through bend points, in a view, whose ends a move of `moved` took
 * elsewhere other than together: the core carries the bend points with both ends when they move
 * together, and otherwise only those next to an end that moved (ADR 0039's clarification of
 * 2026-10-30), so the others stay where they were and the line may run far from its ends.
 */
export function routesNotFollowing(
  before: ProjectSnapshot,
  after: ProjectSnapshot,
  viewId: Id,
  moved: readonly Id[],
): RoutedByHand[] {
  const view = after.views.find((each) => each.id === viewId);
  const was = before.views.find((each) => each.id === viewId);
  if (view?.routes === undefined || was === undefined) return [];
  const placeOf = (of: ViewFile, element: Id) =>
    JSON.stringify(
      of.positions
        .filter((position) => position.element === element)
        .map(({ container, x, y }) => [container ?? '', x, y]),
    );
  const changed = new Set(
    moved.filter((element) => placeOf(was, element) !== placeOf(view, element)),
  );
  if (changed.size === 0) return [];
  const index = modelIndexOf(after);
  return Object.entries(view.routes).flatMap(([id, route]) => {
    const relation = index.relation(id);
    if (relation === undefined || (route.bendPoints?.length ?? 0) === 0) return [];
    if (!changed.has(relation.from) && !changed.has(relation.to)) return [];
    const together = changed.has(relation.from) && changed.has(relation.to);
    if (together && carriedWhole(was.routes?.[id]?.bendPoints, route.bendPoints)) return [];
    return [brief(index, id, route)];
  });
}

/** Whether bend points moved, all of them, by one same amount, as both ends moving together do. */
function carriedWhole(
  before: readonly { x: number; y: number }[] | undefined,
  after: readonly { x: number; y: number }[] | undefined,
): boolean {
  if (before === undefined || after === undefined || before.length !== after.length) return false;
  const [first, firstAfter] = [before[0], after[0]];
  if (first === undefined || firstAfter === undefined) return false;
  const dx = firstAfter.x - first.x;
  const dy = firstAfter.y - first.y;
  if (dx === 0 && dy === 0) return false;
  return before.every(
    (point, at) => after[at]?.x === point.x + dx && after[at]?.y === point.y + dy,
  );
}

/** What set_positions says about such routes. */
export const NOT_FOLLOWING_NOTE =
  'These relations are routed by hand in this view through bend points of their own, and you moved their ends, but not together: the bend points next to an end you moved followed it, and the others stayed where they were, so a line may still run far from its ends. Unless the person drew them so on purpose, call reset_route for them, and the lines take automatic routes between their ends.';

/**
 * The relations routed by hand through bend points in a view that take its automatic style, having
 * none of their own: a curved style draws them as curves through those points.
 */
export function routesTakingTheStyle(state: ProjectSnapshot, viewId: Id): RoutedByHand[] {
  const view = state.views.find((each) => each.id === viewId);
  if (view?.routes === undefined) return [];
  const index = modelIndexOf(state);
  return Object.entries(view.routes).flatMap(([id, route]) =>
    index.relation(id) === undefined ||
    route.style !== undefined ||
    (route.bendPoints?.length ?? 0) === 0
      ? []
      : [brief(index, id, route)],
  );
}

/** What update_view says about them. */
export const TAKING_THE_STYLE_NOTE =
  'These relations are routed by hand through bend points of their own and take the view’s style, so they now draw in it through those points. When one runs far from its ends, reset_route sends it back to the automatic route.';
