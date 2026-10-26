/**
 * What editing routes sends (`relation-routing.md` §7.6): `set-route` for what a gesture, a menu or
 * the keys change, `reset-route` to route relations automatically again, a batch that reconnects an
 * end and attaches it, and the `set-route`s that carry bend points with a move. Pure, so that each can
 * be tested without a canvas.
 */
import {
  automaticRouteStyleOf,
  modelIndexOf,
  relationLabel,
  routeOf,
  storedRoute,
  type ChangeContainerCommand,
  type Command,
  type ProjectSnapshot,
  type ResolvedAttachment,
  type ResolvedRoute,
  type SetRouteCommand,
} from '@visual-anything/core';
import type { EndAttachment, Id, Point, ViewFile } from '@visual-anything/schema';
import type { IndexedScene } from '../hit';
import type { ElementShape, RelationLine } from '../scene';
import type { RouteStyle } from './hand';
import { originOf } from './scene-routes';

/** The view with an id, if the project has it. */
export function viewIn(project: ProjectSnapshot, viewId: Id): ViewFile | undefined {
  return project.views.find((view) => view.id === viewId);
}

/** Whether a view keeps a route for a relation. */
export function routedByHand(view: ViewFile, relation: Id): boolean {
  return view.routes !== undefined && Object.hasOwn(view.routes, relation);
}

/** How a view routes a line now, worked out from the scene's shapes when the line holds no route. */
export function routeOfLine(
  project: ProjectSnapshot,
  view: ViewFile,
  indexed: IndexedScene,
  line: RelationLine,
): ResolvedRoute | undefined {
  if (line.hand) return line.hand.route;
  const first = new Map<Id, ElementShape>();
  for (const shape of indexed.scene.shapes)
    if (!first.has(shape.element)) first.set(shape.element, shape);
  return routeOf(project, view, line.relation, {
    holdersOf: (element) => first.get(element)?.key.split('/'),
  });
}

/** Where the shape of a relation's frame starts, which new bend points are given relative to. */
export function frameOriginOf(
  indexed: IndexedScene,
  line: RelationLine,
  route: ResolvedRoute | undefined,
): Point {
  const shapeOf = (which: 'from' | 'to') => {
    const drawn = line.ends?.[which];
    return drawn?.kind === 'shape' ? indexed.byKey.get(drawn.key) : undefined;
  };
  return originOf(
    indexed.scene.shapes,
    { fromShape: shapeOf('from'), toShape: shapeOf('to') },
    route?.frame,
  );
}

/** Bend points in scene units, relative to an origin, each rounded to whole units but where it snapped. */
export function relativeBendPoints(
  points: readonly Point[],
  origin: Point,
  snapped: readonly { x: boolean; y: boolean }[] = [],
): Point[] {
  return points.map((point, at) => {
    const x = point.x - origin.x;
    const y = point.y - origin.y;
    return {
      x: snapped[at]?.x ? x : Math.round(x),
      y: snapped[at]?.y ? y : Math.round(y),
    };
  });
}

/** What a resolved attachment is as one a command takes: none while it is automatic. */
export function storedAttachment(attachment: ResolvedAttachment): EndAttachment | null {
  switch (attachment.kind) {
    case 'automatic':
      return null;
    case 'connection-point':
      return { kind: 'connection-point', name: attachment.name };
    case 'border':
      return { kind: 'border', side: attachment.side, at: attachment.at };
  }
}

/** Whether two attachments put a line in the same place: both automatic, or the same point or place. */
export function sameAttachment(a: EndAttachment | null, b: EndAttachment | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === 'connection-point') return b.kind === 'connection-point' && a.name === b.name;
  return b.kind === 'border' && a.side === b.side && a.at === b.at;
}

/**
 * How a relation's route in a view chooses its style: the style it stores, chosen by hand, or
 * `automatic`, the style of the relation's automatic route (ADR 0069, ADR 0039's clarification).
 */
export type StyleChoice = RouteStyle | 'automatic';

/** The style a view's route for a relation chooses: the one it stores, or `automatic`. */
export function chosenStyleOf(view: ViewFile, relation: Id): StyleChoice {
  return storedRoute(view, relation)?.style ?? 'automatic';
}

/** The style of a relation's automatic route in a view; orthogonal for one the model lacks. */
export function automaticStyleOf(
  project: ProjectSnapshot,
  view: ViewFile,
  relation: Id,
): RouteStyle {
  const found = modelIndexOf(project).relation(relation);
  return found === undefined ? 'orthogonal' : automaticRouteStyleOf(project, view, found);
}

/** The style a view draws a relation's line in: the one its route chooses, or its automatic one. */
export function drawnStyleOf(project: ProjectSnapshot, view: ViewFile, relation: Id): RouteStyle {
  const chosen = chosenStyleOf(view, relation);
  return chosen === 'automatic' ? automaticStyleOf(project, view, relation) : chosen;
}

/**
 * The style chosen for relations, as one action: one `set-route`, or a batch of them, for those not
 * drawn in it already; undefined when all are. Automatic gives each relation whose route chooses a
 * style of its own back its automatic style, in a batch labelled for it.
 */
export function styleCommand(
  project: ProjectSnapshot,
  viewId: Id,
  relations: readonly Id[],
  style: StyleChoice,
): Command | undefined {
  const view = viewIn(project, viewId);
  if (!view) return undefined;
  if (style === 'automatic') return automaticStyleCommand(project, view, relations);
  const changing = [...new Set(relations)].filter(
    (id) => drawnStyleOf(project, view, id) !== style,
  );
  const commands: SetRouteCommand[] = changing.map((relation) => ({
    type: 'set-route',
    view: viewId,
    relation,
    style,
  }));
  if (commands.length <= 1) return commands[0];
  return {
    type: 'batch',
    label: `Draw ${commands.length} relations ${style} in "${view.name}"`,
    commands,
  };
}

/**
 * Gives relations back the style of their automatic routes in a view: a `set-route` with that style
 * for each whose route chooses another, which the core keeps only where it differs, so it goes.
 */
function automaticStyleCommand(
  project: ProjectSnapshot,
  view: ViewFile,
  relations: readonly Id[],
): Command | undefined {
  const index = modelIndexOf(project);
  const changing = [...new Set(relations)].filter(
    (id) => index.relation(id) !== undefined && chosenStyleOf(view, id) !== 'automatic',
  );
  const [only] = changing;
  if (only === undefined) return undefined;
  const commands: SetRouteCommand[] = changing.map((relation) => ({
    type: 'set-route',
    view: view.id,
    relation,
    style: automaticStyleOf(project, view, relation),
  }));
  return {
    type: 'batch',
    label:
      commands.length === 1
        ? `Draw "${relationLabel(index, only)}" in its automatic style in "${view.name}"`
        : `Draw ${commands.length} relations in their automatic styles in "${view.name}"`,
    commands,
  };
}

/** Routes relations automatically again: those of them the view routes by hand; undefined for none. */
export function resetCommand(
  project: ProjectSnapshot,
  viewId: Id,
  relations: readonly Id[],
): Command | undefined {
  const view = viewIn(project, viewId);
  if (!view) return undefined;
  const routed = [...new Set(relations)].filter((id) => routedByHand(view, id));
  return routed.length === 0 ? undefined : { type: 'reset-route', view: viewId, relations: routed };
}

/** Attaches one end of a relation automatically again. */
export function attachAutomaticallyCommand(
  viewId: Id,
  relation: Id,
  end: 'from' | 'to',
): SetRouteCommand {
  return { type: 'set-route', view: viewId, relation, [end]: null };
}

/**
 * Reconnects an end of a relation to another element and attaches the line there, as one action:
 * `update-relation`, then `set-route` when the end attaches at a chosen place.
 */
export function reconnectCommand(
  project: ProjectSnapshot,
  viewId: Id,
  relation: Id,
  end: 'from' | 'to',
  element: Id,
  attachment: EndAttachment | null,
): Command {
  const index = modelIndexOf(project);
  const commands: Command[] = [
    { type: 'update-relation', id: relation, changes: { [end]: element } },
  ];
  if (attachment !== null) {
    commands.push({ type: 'set-route', view: viewId, relation, [end]: attachment });
  }
  return {
    type: 'batch',
    label: `Reconnect "${relationLabel(index, relation)}" to "${index.element(element)?.name ?? element}"`,
    commands,
  };
}

/** Where a drop puts the shapes it moves: the container they go into, and where its shape starts. */
export interface DroppedInto {
  /** The container, World's id for the canvas. */
  container: Id;
  origin: Point;
  /** The keys of the shapes that go into it; what sits inside them goes with them. */
  keys: ReadonlySet<string>;
}

/**
 * The bend points a move carries along (§7.3): for each relation whose route has bend points, and
 * whose two end shapes the move takes while the shape of the bend points' container stays, one
 * `set-route` with its bend points moved by `delta`. Into a container, they become relative to it,
 * for the relations both of whose ends go in.
 */
export function carriedRouteCommands(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  viewId: Id,
  carried: ReadonlySet<string>,
  delta: Point,
  into?: DroppedInto,
): SetRouteCommand[] {
  const view = viewIn(project, viewId);
  if (!view?.routes) return [];
  const world = project.model.world.id;
  const commands: SetRouteCommand[] = [];
  const inside = (key: string, keys: ReadonlySet<string>) => {
    const parts = key.split('/');
    for (let length = parts.length; length > 0; length--) {
      if (keys.has(parts.slice(0, length).join('/'))) return true;
    }
    return false;
  };
  for (const line of indexed.scene.relations) {
    const hand = line.hand;
    const ends = line.ends;
    if (
      !hand ||
      hand.bendPoints.length === 0 ||
      ends?.from.kind !== 'shape' ||
      ends.to.kind !== 'shape'
    ) {
      continue;
    }
    if (!carried.has(ends.from.key) || !carried.has(ends.to.key)) continue;
    const container = hand.route.bendPointsIn;
    if (container !== undefined) {
      const path = ends.from.key.split('/');
      const at = path.indexOf(container);
      if (at >= 0 && carried.has(path.slice(0, at + 1).join('/'))) continue;
    }
    const fromIn = into !== undefined && inside(ends.from.key, into.keys);
    const toIn = into !== undefined && inside(ends.to.key, into.keys);
    if (into && fromIn && toIn) {
      commands.push({
        type: 'set-route',
        view: viewId,
        relation: line.relation,
        bendPoints: hand.bendPoints.map((point) => ({
          x: Math.round(point.x + delta.x - into.origin.x),
          y: Math.round(point.y + delta.y - into.origin.y),
        })),
        container: into.container,
      });
      continue;
    }
    // One end goes into the container and the other does not: its bend points stay, kept by the core.
    if (fromIn || toIn) continue;
    commands.push({
      type: 'set-route',
      view: viewId,
      relation: line.relation,
      bendPoints: hand.route.bendPoints.map((point) => ({
        x: Math.round(point.x + delta.x),
        y: Math.round(point.y + delta.y),
      })),
      container: container ?? world,
    });
  }
  return commands;
}

/** Where a drop into or out of a container puts the shapes it places, for `carriedRouteCommands`. */
export function droppedInto(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  change: ChangeContainerCommand,
  moving: readonly ElementShape[],
  target: ElementShape | undefined,
): DroppedInto {
  const world = project.model.world.id;
  const to = change.to === undefined || change.to === world ? undefined : change.to;
  const holder =
    to === undefined ? undefined : target?.element === to ? target : indexed.byElement.get(to)?.[0];
  const placed = new Set(change.shapes.map((shape) => shape.element));
  return {
    container: to ?? world,
    origin: holder ? { x: holder.rect.x, y: holder.rect.y } : { x: 0, y: 0 },
    keys: new Set(moving.filter((shape) => placed.has(shape.element)).map((shape) => shape.key)),
  };
}
