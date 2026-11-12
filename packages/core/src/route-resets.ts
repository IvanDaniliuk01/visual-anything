/**
 * Getting back to automatic routes (ADR 0092 §1): the commands that Reset routes, Attach ends
 * automatically and Reset every route in this view send, from the app's keys, menus and inspector
 * and from Claude's `reset_route` alike. Pure: each says what would change, and makes no command when
 * nothing would.
 */
import type { Id, ViewFile } from '@visual-anything/schema';
import { relationLabel } from './commands/model';
import type { Command, SetRouteCommand } from './commands/types';
import { storedRoute } from './routes';
import type { ProjectSnapshot } from './snapshot';
import { modelIndexOf } from './state';

/** The relations a view routes by hand, in the order its file keeps them; none for a view it lacks. */
export function routesByHandIn(state: ProjectSnapshot, viewId: Id): Id[] {
  const view = viewOf(state, viewId);
  return view?.routes === undefined ? [] : Object.keys(view.routes);
}

/**
 * Routes relations automatically again, forgetting their bend points, style and attachments: those
 * of `relations`, or every one of the view's with `all`, that the view routes by hand, in one
 * `reset-route`, which the core labels with their count. Undefined when none of them is.
 */
export function resetRoutesCommand(
  state: ProjectSnapshot,
  viewId: Id,
  relations: readonly Id[] | 'all',
): Command | undefined {
  const view = viewOf(state, viewId);
  if (view === undefined) return undefined;
  const routed = chosen(view, relations);
  return routed.length === 0 ? undefined : { type: 'reset-route', view: viewId, relations: routed };
}

/**
 * Attaches the ends of relations automatically again, keeping their bend points and style: one
 * `set-route` for each of `relations`, or of the view's with `all`, whose route attaches an end by
 * hand, setting those ends to `null`, in one batch labelled with the relation, or with their count.
 * Undefined when no end of them is attached by hand.
 */
export function attachEndsCommand(
  state: ProjectSnapshot,
  viewId: Id,
  relations: readonly Id[] | 'all',
): Command | undefined {
  const view = viewOf(state, viewId);
  if (view === undefined) return undefined;
  const commands = chosen(view, relations).flatMap((relation): SetRouteCommand[] => {
    const route = storedRoute(view, relation);
    if (route?.from === undefined && route?.to === undefined) return [];
    return [
      {
        type: 'set-route',
        view: viewId,
        relation,
        ...(route.from === undefined ? {} : { from: null }),
        ...(route.to === undefined ? {} : { to: null }),
      },
    ];
  });
  const [only] = commands;
  if (only === undefined) return undefined;
  const label =
    commands.length === 1
      ? `Attach the ends of "${relationLabel(modelIndexOf(state), only.relation)}" automatically in "${view.name}"`
      : `Attach the ends of ${commands.length} lines automatically in "${view.name}"`;
  return { type: 'batch', label, commands };
}

function viewOf(state: ProjectSnapshot, viewId: Id): ViewFile | undefined {
  return state.views.find((view) => view.id === viewId);
}

/** Those of `relations`, once each, or of the view's with `all`, that the view routes by hand. */
function chosen(view: ViewFile, relations: readonly Id[] | 'all'): Id[] {
  const routes = view.routes;
  if (routes === undefined) return [];
  if (relations === 'all') return Object.keys(routes);
  return [...new Set(relations)].filter((id) => storedRoute(view, id) !== undefined);
}
