/**
 * Routing relations by hand, per view (ADR 0039): `set-route` changes only what it names and keeps
 * only what differs from the automatic route; `reset-route` routes relations automatically again; and
 * `settleRoutes` keeps every view's routes true to the model after each command.
 */
import type {
  ConnectionPoint,
  EndAttachment,
  Id,
  Point,
  RelationRoute,
  ViewFile,
} from '@visual-anything/schema';
import { appearanceOf, type Definitions } from '../definitions';
import type { ModelIndex } from '../model-index';
import { BULK, type Collection, type Operation, type RouteEntry } from '../operations';
import {
  MAX_BEND_POINTS,
  automaticRouteStyleOf,
  endWord,
  isBeside,
  routeContext,
  storedRoute,
  type RouteContext,
} from '../routes';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn } from '../state';
import { count, nameOf, reject, requireList, requireNumber, sameJson, type Draft } from './draft';
import { relationLabel } from './model';
import type { ResetRouteCommand, RouteStyle, SetRouteCommand } from './types';

const STYLES: readonly RouteStyle[] = ['orthogonal', 'straight', 'curved'];
const SIDES: readonly ConnectionPoint['side'][] = ['top', 'right', 'bottom', 'left'];

export function setRoute(draft: Draft, command: SetRouteCommand): string {
  const view = draft.view(command.view);
  const relation = draft.relation(command.relation);
  const label = relationLabel(draft.index, relation.id);
  const context = routeContext(draft.state, view, { lookups: draft.index });
  if (context.drawsAsContainment(relation)) {
    reject(
      'not-drawn-as-line',
      `The view "${view.name}" draws "${label}" as containment, not as a line, so it has no route to choose.`,
      [relation.id],
    );
  }
  const current = storedRoute(view, relation.id);
  const next: RelationRoute = { ...current };

  for (const end of ['from', 'to'] as const) {
    const asked = command[end];
    if (asked === undefined) continue;
    if (asked === null) delete next[end];
    else
      next[end] = checkedAttachment(
        context,
        relation[end],
        asked,
        `the ${endWord(end)} of "${label}"`,
      );
  }

  const { bendPoints, container } = command;
  if (bendPoints === null || (Array.isArray(bendPoints) && bendPoints.length === 0)) {
    if (container !== undefined) {
      reject('invalid-command', 'A container is given only with bend points relative to it.');
    }
    delete next.bendPoints;
    delete next.container;
  } else if (bendPoints !== undefined) {
    const points = requireList(bendPoints, 'Bend points');
    if (points.length > MAX_BEND_POINTS) {
      reject(
        'invalid-command',
        `A route has at most ${MAX_BEND_POINTS} bend points, and ${points.length} were given.`,
      );
    }
    const checked = points.map((point: Point | undefined) => ({
      x: requireNumber(point?.x, 'The x of a bend point'),
      y: requireNumber(point?.y, 'The y of a bend point'),
    }));
    const frame = bendFrame(draft, context, view, relation.id, container, label);
    next.bendPoints = checked;
    if (frame === undefined) delete next.container;
    else next.container = frame;
  } else if (container !== undefined) {
    reject('invalid-command', 'A container is given only with bend points relative to it.');
  }

  const { style } = command;
  if (style !== undefined) {
    if (!STYLES.includes(style)) {
      reject(
        'invalid-command',
        `A route is orthogonal, straight or curved, not ${JSON.stringify(style)}.`,
      );
    }
    // Only a style that differs from the automatic one is kept (ADR 0069).
    if (style === automaticRouteStyleOf(draft.state, view, relation)) delete next.style;
    else next.style = style;
  }

  const route = ordered(next);
  putRoute(draft, view, relation.id, current, route);
  if (route === undefined) return `Reset the route of "${label}" in "${view.name}"`;
  const onlyStyle =
    style !== undefined &&
    command.from === undefined &&
    command.to === undefined &&
    bendPoints === undefined;
  return onlyStyle
    ? `Draw "${label}" ${style} in "${view.name}"`
    : `Route "${label}" by hand in "${view.name}"`;
}

export function resetRoute(draft: Draft, command: ResetRouteCommand): string {
  const view = draft.view(command.view);
  const ids = requireList(command.relations, 'relations');
  if (ids.length === 0) reject('invalid-command', 'No relations were given to route again.');
  const named = new Set<Id>();
  for (const id of ids) {
    if (typeof id !== 'string') reject('invalid-command', 'A relation is given by its id.');
    if (named.has(id)) {
      reject('invalid-command', `"${relationLabel(draft.index, id)}" is given twice.`, [id]);
    }
    named.add(id);
    if (storedRoute(view, id) === undefined && draft.index.relation(id) === undefined) {
      reject('unknown-relation', `There is no relation "${id}".`, [id]);
    }
  }
  const routed = ids.filter((id) => storedRoute(view, id) !== undefined);
  changeRoutes(
    draft,
    view,
    routed.map((relation) => ({ relation, route: undefined })),
  );
  const [only] = routed;
  return routed.length === 1 && only !== undefined
    ? `Reset the route of "${relationLabel(draft.index, only)}" in "${view.name}"`
    : `Reset ${count(routed.length === 0 ? ids.length : routed.length, 'route')} in "${view.name}"`;
}

/**
 * The container new bend points are relative to: the one asked for, which must hold both ends'
 * shapes, World's id meaning the canvas; otherwise the nearest that holds both. `undefined` for the
 * canvas.
 */
function bendFrame(
  draft: Draft,
  context: RouteContext,
  view: ViewFile,
  relation: Id,
  asked: Id | undefined,
  label: string,
): Id | undefined {
  const routed = draft.relation(relation);
  const common = context.commonHolders(routed);
  if (asked === undefined) return common.at(-1);
  if (asked === context.index.world.id) return undefined;
  if (!common.includes(asked)) {
    reject(
      'unknown-position',
      `"${nameOf(draft.index, asked)}" does not hold both ends of "${label}" in the view "${view.name}", so its bend points cannot be relative to it.`,
      [asked, relation],
    );
  }
  return asked;
}

/**
 * An attachment a command sets on an end, checked against what the end can take, and normalized: on
 * a row or a shape that draws rows, a line attaches at the middle of its left or right side.
 */
function checkedAttachment(
  context: RouteContext,
  end: Id,
  attachment: EndAttachment,
  which: string,
): EndAttachment {
  if (typeof attachment !== 'object' || attachment === null) {
    reject(
      'invalid-command',
      'An attachment is a connection point, a place on the border or a place inside the shape.',
    );
  }
  if (attachment.kind === 'border') {
    if (!SIDES.includes(attachment.side)) {
      reject(
        'invalid-command',
        `A side is top, right, bottom or left, not ${JSON.stringify(attachment.side)}.`,
      );
    }
    const at = requireNumber(attachment.at, 'Where an end attaches along its side');
    if (at < 0 || at > 1) {
      reject(
        'invalid-command',
        `Where an end attaches along its side goes from 0 to 1, not ${at}.`,
      );
    }
  } else if (attachment.kind === 'connection-point') {
    if (typeof attachment.name !== 'string' || attachment.name === '') {
      reject('invalid-command', 'A connection point is given by its name.');
    }
  } else if (attachment.kind === 'inside') {
    const x = requireNumber(attachment.x, 'Where an end attaches across its shape');
    const y = requireNumber(attachment.y, 'Where an end attaches down its shape');
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      reject(
        'invalid-command',
        `Where an end attaches inside its shape goes from 0 to 1 across and down, not ${x} and ${y}.`,
      );
    }
  } else {
    reject(
      'invalid-command',
      'An attachment is a connection point, a place on the border or a place inside the shape.',
    );
  }

  const shape = context.endShape(end);
  const name = context.index.element(end)?.name ?? end;
  if (shape.kind === 'none') {
    const why = {
      world: 'World has no shape to attach to',
      relation: 'that end is a relation, whose line it meets in the middle',
      'inside-row': `"${name}" sits inside a row and has no shape of its own`,
      'no-shape': `"${name}" has no shape in this view`,
      unknown: `there is no "${end}"`,
    }[shape.why];
    reject('end-does-not-fit', `The line cannot attach by hand at ${which}: ${why}.`, [end]);
  }
  if (shape.kind === 'rows') {
    if (attachment.kind !== 'border' || !isBeside(attachment.side)) {
      reject(
        'end-does-not-fit',
        `"${name}" is drawn as a row, or draws its contents as rows: lines attach beside it, on its left or right side.`,
        [end],
      );
    }
    return { kind: 'border', side: attachment.side, at: 0.5 };
  }
  if (attachment.kind === 'border') {
    return { kind: 'border', side: attachment.side, at: attachment.at };
  }
  if (attachment.kind === 'inside') return { kind: 'inside', x: attachment.x, y: attachment.y };
  if (!shape.points.some((point) => point.name === attachment.name)) {
    reject(
      'unknown-connection-point',
      `"${name}" has no connection point named "${attachment.name}".`,
      [end],
    );
  }
  return { kind: 'connection-point', name: attachment.name };
}

/** A route with its keys in the file's order, or `undefined` when nothing is left in it. */
function ordered(route: RelationRoute): RelationRoute | undefined {
  const { from, to, style, container, bendPoints } = route;
  const result: RelationRoute = {
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    ...(style === undefined ? {} : { style }),
    ...(container === undefined ? {} : { container }),
    ...(bendPoints === undefined ? {} : { bendPoints }),
  };
  return Object.keys(result).length === 0 ? undefined : result;
}

/** Stores a relation's route in a view, or takes it away; nothing when it is what is stored. */
function putRoute(
  draft: Draft,
  view: ViewFile,
  relation: Id,
  current: RelationRoute | undefined,
  route: RelationRoute | undefined,
): void {
  const collection: Collection = { name: 'routes', view: view.id };
  if (route === undefined) {
    if (current !== undefined) draft.apply({ op: 'remove', collection, key: relation });
  } else if (current === undefined) {
    const index = Object.keys(view.routes ?? {}).length;
    draft.apply({ op: 'insert', collection, index, item: { relation, route } });
  } else if (!sameJson(current, route)) {
    draft.apply({ op: 'replace', collection, item: { relation, route } });
  }
}

/**
 * Replaces or takes away routes of a view: `undefined` takes one away. One operation each, or one
 * rewrite of the whole map when there are many.
 */
export function changeRoutes(
  draft: Draft,
  view: ViewFile,
  changes: readonly { relation: Id; route: RelationRoute | undefined }[],
): void {
  if (changes.length === 0) return;
  const collection: Collection = { name: 'routes', view: view.id };
  if (changes.length > BULK) {
    const changed = new Map(changes.map((each) => [each.relation, each.route]));
    const items: RouteEntry[] = Object.entries(view.routes ?? {}).flatMap(([relation, route]) => {
      if (!changed.has(relation)) return [{ relation, route }];
      const next = changed.get(relation);
      return next === undefined ? [] : [{ relation, route: next }];
    });
    draft.apply({ op: 'replace-all', collection, items });
    return;
  }
  for (const { relation, route } of changes) {
    if (storedRoute(draft.view(view.id), relation) === undefined) continue;
    draft.apply(
      route === undefined
        ? { op: 'remove', collection, key: relation }
        : { op: 'replace', collection, item: { relation, route } },
    );
  }
}

/** Whether an operation changes what routes depend on: the model, World or the definitions. */
function changesModel(operation: Operation): boolean {
  if (operation.op === 'set-world') return true;
  if (!('collection' in operation)) return false;
  switch (operation.collection.name) {
    case 'elements':
    case 'relations':
    case 'components':
    case 'relationTypes':
    case 'packages':
      return true;
    default:
      return false;
  }
}

/** The connection points of an element's appearance; `undefined` for anything else. */
function pointsOf(
  index: Pick<ModelIndex, 'element'>,
  definitions: Definitions,
  id: Id,
): readonly ConnectionPoint[] | undefined {
  const element = index.element(id);
  return element === undefined ? undefined : appearanceOf(element, definitions).connectionPoints;
}

/**
 * Keeps every view's routes true to the model after a command whose operations, from `start` on,
 * took the project from `before` to the draft's state. For each route: when its relation is gone,
 * the route goes; when an end of its relation changed, that end attaches automatically again and the
 * bend points stay only while their container still holds both ends; when a connection point it
 * names was on its end and is not any more, the line attaches where the point was: at the point now
 * at the same side and place, or at that place on the border; and when the container of its bend
 * points is gone, they go. What was already wrong before the command, as only a hand-edited file
 * holds, is left as it was. Nothing is done while no view keeps routes, or when the command changed
 * neither the model nor the definitions.
 */
export function settleRoutes(draft: Draft, before: ProjectSnapshot, start: number): void {
  if (!draft.state.views.some((view) => view.routes !== undefined)) return;
  let touched = false;
  for (let at = start; at < draft.operations.length && !touched; at += 1) {
    touched = changesModel(draft.operations[at] as Operation);
  }
  if (!touched) return;

  const index = draft.index;
  const definitions = draft.definitions;
  const earlier = draft.modelBefore(start, before);
  const earlierDefinitions = definitionsIn(before);
  for (const view of draft.state.views) {
    if (view.routes === undefined) continue;
    let context: RouteContext | undefined;
    const changes: { relation: Id; route: RelationRoute | undefined }[] = [];
    for (const [id, route] of Object.entries(view.routes)) {
      const relation = index.relation(id);
      const was = earlier.relation(id);
      if (relation === undefined) {
        if (was !== undefined) changes.push({ relation: id, route: undefined });
        continue;
      }
      let next = route;
      const edit = (): RelationRoute => (next === route ? (next = { ...route }) : next);
      let endsChanged = false;
      for (const end of ['from', 'to'] as const) {
        const attachment = next[end];
        if (was !== undefined && was[end] !== relation[end]) {
          endsChanged = true;
          if (attachment !== undefined) delete edit()[end];
          continue;
        }
        if (attachment?.kind !== 'connection-point') continue;
        const now = pointsOf(index, definitions, relation[end]);
        if (now?.some((point) => point.name === attachment.name)) continue;
        const old = pointsOf(earlier, earlierDefinitions, relation[end])?.find(
          (point) => point.name === attachment.name,
        );
        if (old === undefined) continue;
        const same = now?.find((point) => point.side === old.side && point.at === old.at);
        edit()[end] =
          same === undefined
            ? { kind: 'border', side: old.side, at: old.at }
            : { kind: 'connection-point', name: same.name };
      }
      const { container } = next;
      if (
        next.bendPoints !== undefined &&
        container !== undefined &&
        container !== index.world.id
      ) {
        const gone =
          index.element(container) === undefined && earlier.element(container) !== undefined;
        // Working out where shapes sit costs a pass over the view: only an end that changed asks.
        const left =
          endsChanged &&
          !(context ??= routeContext(draft.state, view, { lookups: index }))
            .commonHolders(relation)
            .includes(container);
        if (gone || left) {
          const edited = edit();
          delete edited.bendPoints;
          delete edited.container;
        }
      }
      if (next !== route) changes.push({ relation: id, route: ordered(next) });
    }
    changeRoutes(draft, view, changes);
  }
}
