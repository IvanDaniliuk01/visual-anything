/**
 * Relations routed by hand, per view (ADR 0039): which shapes hold a relation's ends, where its line
 * attaches to each, which bend points apply, and what checking a project says about the routes a file
 * keeps. The scene draws from `routeOf`; the commands and the checks ask the same questions here, so
 * that they agree on what fits.
 */
import type {
  ConnectionPoint,
  Element,
  EndAttachment,
  Id,
  ModelFile,
  Point,
  Relation,
  RelationRoute,
  ViewFile,
} from '@visual-anything/schema';
import type { RouteStyle } from './commands/types';
import { relationLabel } from './commands/model';
import { containmentTree, type Placement } from './containment';
import { nestingTypesInView } from './containers';
import { shapesInView } from './scope-placement';
import {
  appearanceOf,
  relationAppearanceOf,
  type Definitions,
  type DrawnRelation,
} from './definitions';
import type { ModelIndex } from './model-index';
import { problem, type Problem } from './problems';
import type { ProjectSnapshot } from './snapshot';
import { definitionsIn, modelIndexOf } from './state';

export type { RouteStyle } from './commands/types';

/** A side of a shape. */
export type Side = ConnectionPoint['side'];

/** Where a line attaches to one of its ends, as the scene draws it. */
export type ResolvedAttachment =
  /** Wherever the automatic route attaches it. */
  | { kind: 'automatic' }
  /** At a connection point of the end's appearance, which sits at this side and place. */
  | { kind: 'connection-point'; name: string; side: Side; at: number }
  /** At a fixed place on the end's border. */
  | { kind: 'border'; side: Side; at: number }
  /** At a fixed place inside the end's shape, across and down its box, each from 0 to 1. */
  | { kind: 'inside'; x: number; y: number };

/** How a view routes a relation, worked out for the scene. */
export interface ResolvedRoute {
  relation: Id;
  /** Where the line attaches to the relation's `from` end. */
  from: ResolvedAttachment;
  /** Where the line attaches to the relation's `to` end. */
  to: ResolvedAttachment;
  style: RouteStyle;
  /**
   * The bend points that apply, in order from the `from` end, in canvas units relative to the shape
   * of `bendPointsIn`, or to the canvas when it is absent. Empty when the route has none, or while
   * the container they are relative to no longer holds both ends.
   */
  bendPoints: readonly Point[];
  /** The container whose shape `bendPoints` are relative to; absent for the canvas. */
  bendPointsIn?: Id;
  /**
   * The nearest container whose shape holds the shapes of both ends, a shape holding itself; absent
   * when that is World. New bend points are given relative to its shape.
   */
  frame?: Id;
  /** Whether the view keeps a route for the relation at all. */
  byHand: boolean;
}

const AUTOMATIC: ResolvedAttachment = { kind: 'automatic' };

/** The most bend points a route keeps. */
export const MAX_BEND_POINTS = 64;

/**
 * The shapes a caller has already placed, such as the scene: for each element, the ids of the
 * elements whose shapes hold its first shape, from World's contents down to the element itself, as
 * that shape's key reads them (`key.split('/')`); `undefined` when the view draws no shape for it.
 * Given these, nothing works out the view's containment again.
 */
export interface RouteShapes {
  holdersOf(element: Id): readonly Id[] | undefined;
  /**
   * Elements, World included, and the relations the caller draws, by id, when it has them already;
   * otherwise maps are made once for each model. A relation it leaves out has no route.
   */
  readonly lookups?: RouteLookups;
}

/**
 * How a view routes a relation: where its line attaches to each end, the bend points that apply and
 * its style, from what the view keeps for it, or automatically. `undefined` for an unknown view or
 * relation, and for a relation the view draws as containment rather than as a line. The scene passes
 * the shapes it placed, so that each call costs only the depth of the two ends.
 */
export function routeOf(
  state: ProjectSnapshot,
  view: ViewFile | Id,
  relation: Id,
  shapes?: RouteShapes,
): ResolvedRoute | undefined {
  const found = typeof view === 'string' ? state.views.find((each) => each.id === view) : view;
  if (found === undefined) return undefined;
  const context = routeContext(
    state,
    found,
    shapes === undefined
      ? {}
      : { shapes, ...(shapes.lookups === undefined ? {} : { lookups: shapes.lookups }) },
  );
  const routed = context.index.relation(relation);
  if (routed === undefined || context.drawsAsContainment(routed)) return undefined;
  const stored = storedRoute(found, relation);
  const common = context.commonHolders(routed);
  const frame = common.at(-1);
  const container =
    stored?.container === undefined || stored.container === context.index.world.id
      ? undefined
      : stored.container;
  const applies = container === undefined || common.includes(container);
  const bendPoints = applies ? (stored?.bendPoints ?? []) : [];
  return {
    relation,
    from: resolveAttachment(context.endShape(routed.from), stored?.from),
    to: resolveAttachment(context.endShape(routed.to), stored?.to),
    style: stored?.style ?? automaticRouteStyleOf(state, found, routed),
    bendPoints,
    ...(bendPoints.length > 0 && container !== undefined ? { bendPointsIn: container } : {}),
    ...(frame === undefined ? {} : { frame }),
    byHand: stored !== undefined,
  };
}

/**
 * The style of a relation's automatic route in a view (ADR 0069): its appearance's `route`, its own
 * and then its relation type's chain, project appearances included; otherwise the view's
 * `routeStyle`; otherwise orthogonal. A route chosen by hand without a style takes it too.
 */
export function automaticRouteStyleOf(
  state: ProjectSnapshot,
  view: ViewFile,
  relation: DrawnRelation,
): RouteStyle {
  return (
    relationAppearanceOf(relation, definitionsIn(state)).route ?? view.routeStyle ?? 'orthogonal'
  );
}

/** The route a view keeps for a relation, if any. Any string can be an id, so only own keys count. */
export function storedRoute(view: ViewFile, relation: Id): RelationRoute | undefined {
  const { routes } = view;
  return routes !== undefined && Object.hasOwn(routes, relation) ? routes[relation] : undefined;
}

/** What a line can attach to at one end of a relation, in a view. */
export type EndShape =
  /**
   * Nothing it can attach to by hand: World, a relation, an element inside a row, an element the
   * caller draws no shape for, or no end at all.
   */
  | { kind: 'none'; why: 'world' | 'relation' | 'inside-row' | 'no-shape' | 'unknown' }
  /** A row, or a shape that draws its contents as rows: lines attach beside it, left or right. */
  | { kind: 'rows' }
  /** A shape of its own, with the connection points of its appearance. */
  | { kind: 'shape'; points: readonly ConnectionPoint[] };

/** What routes look elements and relations up in: a model index, or the lighter lookups below. */
export type RouteLookups = Pick<ModelIndex, 'world' | 'element' | 'relation'>;

/** What the routes of one view are worked out from. */
export interface RouteContext {
  readonly index: RouteLookups;
  readonly definitions: Definitions;
  /** Whether the view draws a relation as containment, through one of its nesting relation types. */
  drawsAsContainment(relation: Relation): boolean;
  /**
   * The shapes that hold an end's first shape, as container ids from World's contents down, followed
   * by the end itself when it is an element; for a relation, the holders both of its own ends share.
   */
  holdersOf(end: Id): readonly Id[];
  /** The holders both ends of a relation share: its frame is the last of them. */
  commonHolders(relation: Relation): readonly Id[];
  /** What a line can attach to at an end. */
  endShape(end: Id): EndShape;
}

/**
 * What the routes of a view are worked out from, made once for each question. Without `shapes`, the
 * first shapes come from the view's containment, worked out once for each model; without `lookups`,
 * elements and relations are looked up by id in maps made once for each model.
 */
export function routeContext(
  state: ProjectSnapshot,
  view: ViewFile,
  options: { shapes?: RouteShapes; lookups?: RouteLookups } = {},
): RouteContext {
  const index = options.lookups ?? lookupsOf(state.model);
  const definitions = definitionsIn(state);
  const nesting = nestingTypesInView(state, view);
  const nests = new Set(nesting);
  const { shapes } = options;
  // In a view with a scope, a shape sits in its nearest container that shows (ADR-0040), as the
  // scene places it: new bend points are relative to that, not to a container left out.
  const placed =
    shapes === undefined && view.scope !== undefined ? shapesInView(state, view) : undefined;
  const first =
    shapes === undefined && placed === undefined
      ? firstContainers(state.model, nesting)
      : undefined;
  const holders = new Map<Id, readonly Id[]>();
  const drawn = (element: Id): readonly Id[] | undefined => {
    if (shapes !== undefined) return shapes.holdersOf(element);
    if (placed !== undefined) {
      const path: Id[] = [element];
      for (
        let at = placed.containersOf(element)?.[0];
        at !== undefined && !path.includes(at);
        at = placed.containersOf(at)?.[0]
      ) {
        path.push(at);
      }
      return placed.containersOf(element) === undefined ? undefined : path.reverse();
    }
    const path: Id[] = [element];
    const seen = new Set<Id>(path);
    for (let at = first?.get(element); at !== undefined && !seen.has(at); at = first?.get(at)) {
      path.push(at);
      seen.add(at);
    }
    return path.reverse();
  };
  const resolving = new Set<Id>();
  const drawsRows = (id: Id): boolean => {
    const element = index.element(id);
    return element !== undefined && appearanceOf(element, definitions).contentsAsRows;
  };

  const holdersOf = (end: Id): readonly Id[] => {
    const known = holders.get(end);
    if (known !== undefined) return known;
    let result: readonly Id[];
    if (end === index.world.id) {
      result = [];
    } else if (index.element(end) !== undefined) {
      result = drawn(end) ?? [];
    } else {
      const relation = index.relation(end);
      // A relation that ends on itself, through others, has no line to sit anywhere.
      if (relation === undefined || resolving.has(end)) return [];
      resolving.add(end);
      result = commonPrefix(holdersOf(relation.from), holdersOf(relation.to));
      resolving.delete(end);
    }
    holders.set(end, result);
    return result;
  };

  return {
    index,
    definitions,
    drawsAsContainment: (relation) => nests.has(relation.relationType),
    holdersOf,
    commonHolders: (relation) => commonPrefix(holdersOf(relation.from), holdersOf(relation.to)),
    endShape: (end) => {
      if (end === index.world.id) return { kind: 'none', why: 'world' };
      const element = index.element(end);
      if (element === undefined) {
        return { kind: 'none', why: index.relation(end) === undefined ? 'unknown' : 'relation' };
      }
      // Its holders: the containers of its first shape from World's contents down, then itself.
      const path = holdersOf(end);
      if (path.length === 0) return { kind: 'none', why: 'no-shape' };
      if (path.slice(0, -2).some(drawsRows)) return { kind: 'none', why: 'inside-row' };
      const container = path.at(-2);
      if ((container !== undefined && drawsRows(container)) || drawsRows(end)) {
        return { kind: 'rows' };
      }
      return { kind: 'shape', points: appearanceOf(element, definitions).connectionPoints };
    },
  };
}

/** Where a stored attachment puts the line on an end; automatic while it does not fit. */
export function resolveAttachment(
  shape: EndShape,
  attachment: EndAttachment | undefined,
): ResolvedAttachment {
  if (attachment === undefined) return AUTOMATIC;
  switch (shape.kind) {
    case 'none':
      return AUTOMATIC;
    case 'rows':
      return attachment.kind === 'border' && isBeside(attachment.side)
        ? { kind: 'border', side: attachment.side, at: 0.5 }
        : AUTOMATIC;
    case 'shape': {
      if (attachment.kind === 'border') {
        return { kind: 'border', side: attachment.side, at: attachment.at };
      }
      if (attachment.kind === 'inside') return { kind: 'inside', x: attachment.x, y: attachment.y };
      const point = shape.points.find((each) => each.name === attachment.name);
      return point === undefined
        ? AUTOMATIC
        : { kind: 'connection-point', name: point.name, side: point.side, at: point.at };
    }
  }
}

/** Whether a side is one a line attaches to beside a row: its left or its right. */
export function isBeside(side: Side): boolean {
  return side === 'left' || side === 'right';
}

/** The ids two lists of holders start with, in order. */
function commonPrefix(a: readonly Id[], b: readonly Id[]): Id[] {
  const common: Id[] = [];
  for (let at = 0; at < a.length && at < b.length && a[at] === b[at]; at += 1) {
    common.push(a[at] as Id);
  }
  return common;
}

/**
 * For each element, the container of its first shape in a view arranged by these nesting relation
 * types, in containment order as the scene places shapes: World's contents, and each container's
 * contents, in model order, a container before its contents. Elements directly in World are left
 * out. Kept for each model and set of nesting relation types.
 */
function firstContainers(model: ModelFile, nesting: readonly Id[]): ReadonlyMap<Id, Id> {
  const key = JSON.stringify([...nesting].sort());
  let byNesting = firstContainersByModel.get(model);
  if (byNesting === undefined) {
    byNesting = new Map();
    firstContainersByModel.set(model, byNesting);
  }
  const kept = byNesting.get(key);
  if (kept !== undefined) return kept;
  const types = new Set(nesting);
  const first = new Map<Id, Id>();
  const placed = new Set<Id>();
  const pending: Placement[] = [...containmentTree(model, (type) => types.has(type))].reverse();
  // Depth first, without recursion: a placement before its contents, contents in their order.
  while (pending.length > 0) {
    const placement = pending.pop() as Placement;
    if (!placed.has(placement.element)) {
      placed.add(placement.element);
      if (placement.container !== undefined) first.set(placement.element, placement.container);
    }
    for (let at = placement.contents.length - 1; at >= 0; at -= 1) {
      pending.push(placement.contents[at] as Placement);
    }
  }
  byNesting.set(key, first);
  return first;
}

const firstContainersByModel = new WeakMap<ModelFile, Map<string, ReadonlyMap<Id, Id>>>();

/** Elements, World included, and relations by id, made once for each model. */
function lookupsOf(model: ModelFile): RouteLookups {
  const kept = lookupsByModel.get(model);
  if (kept !== undefined) return kept;
  const elements = new Map<Id, Element>([[model.world.id, model.world]]);
  for (const element of model.elements) {
    if (!elements.has(element.id)) elements.set(element.id, element);
  }
  const relations = new Map<Id, Relation>();
  for (const relation of model.relations) {
    if (!relations.has(relation.id)) relations.set(relation.id, relation);
  }
  const lookups: RouteLookups = {
    world: model.world,
    element: (id) => elements.get(id),
    relation: (id) => relations.get(id),
  };
  lookupsByModel.set(model, lookups);
  return lookups;
}

const lookupsByModel = new WeakMap<ModelFile, RouteLookups>();

/** "start" for a relation's `from` end, "end" for its `to` end, as messages name them. */
export function endWord(end: 'from' | 'to'): string {
  return end === 'from' ? 'start' : 'end';
}

/**
 * What only warns about the routes a project's views keep, as read from the files: a route for no
 * relation of the model, an attachment on an end that never takes one (World, or a relation), a
 * connection point the end does not have, and bend points relative to no element. What commands can
 * leave, such as an attachment on an element that has since become a row, is not warned about.
 */
export function routeWarnings(state: ProjectSnapshot): Problem[] {
  const warnings: Problem[] = [];
  const index = modelIndexOf(state);
  for (const view of state.views) {
    if (view.routes === undefined) continue;
    const context = routeContext(state, view, { lookups: index });
    for (const [id, route] of Object.entries(view.routes)) {
      const relation = index.relation(id);
      if (relation === undefined) {
        warnings.push(
          problem(
            'unknown-relation',
            `The view "${view.name}" keeps a route for "${id}", which is no relation of the model; it is ignored.`,
            [view.id],
          ),
        );
        continue;
      }
      const label = relationLabel(index, id);
      for (const end of ['from', 'to'] as const) {
        const attachment = route[end];
        if (attachment === undefined) continue;
        const shape = context.endShape(relation[end]);
        const attaches = `The view "${view.name}" attaches the ${endWord(end)} of "${label}"`;
        if (shape.kind === 'none' && (shape.why === 'world' || shape.why === 'relation')) {
          const what =
            shape.why === 'world'
              ? 'World, which has no shape'
              : 'a relation, whose line it meets in the middle';
          warnings.push(
            problem(
              'end-does-not-fit',
              `${attaches} by hand, but that end is ${what}; it attaches automatically.`,
              [view.id],
            ),
          );
        } else if (
          shape.kind === 'shape' &&
          attachment.kind === 'connection-point' &&
          !shape.points.some((point) => point.name === attachment.name)
        ) {
          const owner = index.element(relation[end])?.name ?? relation[end];
          warnings.push(
            problem(
              'unknown-connection-point',
              `${attaches} at the connection point "${attachment.name}", which "${owner}" does not have; it attaches automatically.`,
              [view.id],
            ),
          );
        }
      }
      const { container } = route;
      if (
        container !== undefined &&
        container !== index.world.id &&
        index.element(container) === undefined
      ) {
        warnings.push(
          problem(
            'unknown-element',
            `The view "${view.name}" keeps the bend points of "${label}" relative to "${container}", which is no element of the model; they are ignored.`,
            [view.id],
          ),
        );
      }
    }
  }
  return warnings;
}
