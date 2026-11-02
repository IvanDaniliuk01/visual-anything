/**
 * What is in physical space under a root (ADR 0076), worked out from the model, never stored:
 *
 * - the root itself: World, or one element;
 * - an element posed in an element in physical space, or posed with no `in` while the root is World;
 * - an anchored part of a solid shown by an element in physical space (ADR 0075), drawn as its node
 *   there. A pose it has is kept and not used.
 *
 * Joints then move what they carry (ADR 0090, `kinematics.ts`): each element's matrix is its motion
 * applied to where it is at rest.
 *
 * An element is in physical space at most once. Poses never form a cycle, since `in` is always one of
 * the element's containers and containment never forms one (ADR 0019); a pose whose `in` is not one
 * of them is kept and not used (`pose-not-in-container`).
 */
import type {
  Element,
  Id,
  Pose,
  SolidDefinition,
  SpacePoint,
  ViewFile,
} from '@visual-anything/schema';
import { nestingTypesInView } from '../containers';
import { indexModel } from '../model-index';
import type { ProjectSnapshot } from '../snapshot';
import { shownByScope } from '../scope';
import { definitionsIn, modelIndexOf } from '../state';
import { solidAnchoredElements } from '../solids/anchoring';
import { solidShownBy, solidsIn } from '../solids/catalog';
import { motionsOf } from './kinematics';
import { poseIsUsable } from './pose';
import {
  IDENTITY,
  decompose,
  inverseRigid,
  matrixOf,
  multiply,
  transformPoint,
  type Matrix,
} from './math';

/** How an element is in physical space. */
export type SpaceHow = 'root' | 'posed' | 'anchored';

/** One element in physical space under a root. */
export interface SpaceEntry {
  readonly element: Id;
  readonly how: SpaceHow;
  /** What it is posed or anchored in: its container, or the element whose solid holds its part. */
  readonly in?: Id;
  /**
   * Where its origin and axes are, in the root's coordinates. An anchored part's origin is its
   * part's point, with its solid's axes.
   */
  readonly matrix: Matrix;
  /** The solid it shows, by id, when a package in use defines it. */
  readonly solid?: { readonly id: Id; readonly definition: SolidDefinition };
  /** For an anchored part: the part of its holder's solid it is drawn as, and that part's index. */
  readonly part?: { readonly solid: Id; readonly name: string; readonly index: number };
  /**
   * The outermost collapsed container of the view it is drawn as, if any: one that holds it under
   * the view's nesting relation types, inside what the panel shows.
   */
  readonly drawnAs?: Id;
}

/** What the physical-space panel draws under its root. */
export interface Space {
  readonly root: Id;
  /** Every element in physical space that the view shows, by id, in the order they were reached. */
  readonly entries: ReadonlyMap<Id, SpaceEntry>;
  /**
   * The elements through which a shown element is in physical space but which the view does not
   * show: drawn faintly, as a container of what a filter shows is.
   */
  readonly faint: ReadonlyMap<Id, SpaceEntry>;
  /**
   * How joints move what they carry (ADR 0090): for each element they move, the motion its matrix
   * applies to where it is at rest, in the root's coordinates. The panel turns an anchored part's
   * node of its holder's solid by it. Left out, or without an element, where nothing moves.
   */
  readonly motions?: ReadonlyMap<Id, Matrix>;
}

interface Placed {
  readonly entry: SpaceEntry;
  /** The chain of entries that brought it into space, the root first. */
  readonly through: readonly Id[];
}

/**
 * What is in physical space under `root`, World when left out, for `view`: every element in it, how
 * it is there and where, as the open view shows it. Without a view, the whole model.
 */
export function spaceOf(
  project: ProjectSnapshot,
  view?: ViewFile,
  root?: Id,
  positions?: ReadonlyMap<Id, number>,
): Space {
  const { placed, motions } =
    positions === undefined || positions.size === 0
      ? placeAll(project, root)
      : moved(project, placeAll(project, root).rest, positions);
  const rootId = root ?? project.model.world.id;
  const shown = view ? shownByScope(project, view) : undefined;
  const drawnAsOf =
    view && (view.collapsed?.length ?? 0) > 0 ? collapsedHolders(project, view, rootId) : undefined;
  const entries = new Map<Id, SpaceEntry>();
  const faint = new Map<Id, SpaceEntry>();
  for (const [id, { entry, through }] of placed) {
    if (shown && !shown.element(id) && id !== rootId) continue;
    const drawnAs = drawnAsOf?.(id);
    entries.set(id, drawnAs === undefined ? entry : { ...entry, drawnAs });
    for (const each of through) {
      if (entries.has(each) || faint.has(each)) continue;
      if (shown && !shown.element(each) && each !== rootId) {
        const holder = placed.get(each);
        if (holder) faint.set(each, holder.entry);
      }
    }
  }
  const shownMotions = new Map([...motions].filter(([id]) => entries.has(id) || faint.has(id)));
  return {
    root: rootId,
    entries,
    faint,
    ...(shownMotions.size > 0 ? { motions: shownMotions } : {}),
  };
}

/**
 * The outermost collapsed container of the view that holds each element, by the view's containment
 * (ADR 0076: a collapsed container is drawn whole, and what it holds as it), found below `rootId`
 * only: what the panel shows is never drawn as what holds it. On each way up the first container's
 * way counts, as the canvas draws a shape first in its first container.
 */
function collapsedHolders(
  project: ProjectSnapshot,
  view: ViewFile,
  rootId: Id,
): (element: Id) => Id | undefined {
  const index = indexModel(project.model, new Set(nestingTypesInView(project, view)));
  const collapsed = new Set(view.collapsed ?? []);
  const known = new Map<Id, Id | null>();
  const holderOf = (element: Id): Id | undefined => {
    if (element === rootId) return undefined;
    const kept = known.get(element);
    if (kept !== undefined) return kept ?? undefined;
    let found: Id | undefined;
    for (const container of index.containersOf(element)) {
      if (container === rootId) continue;
      // Containment never forms a cycle (ADR 0019), so the way up ends.
      const above = holderOf(container);
      found = above ?? (collapsed.has(container) ? container : undefined);
      if (found !== undefined) break;
    }
    known.set(element, found ?? null);
    return found;
  };
  return holderOf;
}

/** Elements in physical space, as joints at their positions move them, and the motions. */
interface Placement {
  readonly placed: ReadonlyMap<Id, Placed>;
  readonly motions: ReadonlyMap<Id, Matrix>;
  /** Where each is at rest, before joints move it. */
  readonly rest: ReadonlyMap<Id, Placed>;
}

const placements = new WeakMap<object, { packages: unknown; byRoot: Map<Id, Placement> }>();

/** The elements at rest moved by their joints, at their own positions or at `positions`. */
function moved(
  project: ProjectSnapshot,
  rest: ReadonlyMap<Id, Placed>,
  positions?: ReadonlyMap<Id, number>,
): Placement {
  const motions = motionsOf(
    project,
    new Map(
      [...rest].map(([id, { entry }]) => {
        const matrix = frameOf(entry, rest);
        return [id, entry.in === undefined ? { matrix } : { matrix, in: entry.in }];
      }),
    ),
    positions,
  );
  if (motions.size === 0) return { placed: rest, motions, rest };
  const placed = new Map<Id, Placed>();
  for (const [id, each] of rest) {
    const motion = motions.get(id);
    placed.set(
      id,
      motion === undefined
        ? each
        : { ...each, entry: { ...each.entry, matrix: multiply(motion, each.entry.matrix) } },
    );
  }
  return { placed, motions, rest };
}

/**
 * The frame a joint turns in (ADR 0090): where it is at rest, but for an anchored part whose solid
 * keeps its node's origin, at that origin rather than at its point, so that it turns about its axis
 * while relations keep ending at its point.
 */
function frameOf(entry: SpaceEntry, rest: ReadonlyMap<Id, { entry: SpaceEntry }>): Matrix {
  if (!entry.part || entry.in === undefined) return entry.matrix;
  const part = rest.get(entry.in)?.entry.solid?.definition.parts[entry.part.index];
  const origin = part?.origin;
  if (!origin) return entry.matrix;
  const point = part.point ?? { x: 0, y: 0, z: 0 };
  return multiply(
    entry.matrix,
    matrixOf({ x: origin.x - point.x, y: origin.y - point.y, z: origin.z - point.z }),
  );
}

/**
 * Every element in physical space under a root, whatever a view shows, moved by its joints at their
 * own positions; kept per model and root.
 */
function placeAll(project: ProjectSnapshot, root?: Id): Placement {
  const rootId = root ?? project.model.world.id;
  let kept = placements.get(project.model);
  if (kept === undefined || kept.packages !== project.packages) {
    kept = { packages: project.packages, byRoot: new Map() };
    placements.set(project.model, kept);
  }
  let placement = kept.byRoot.get(rootId);
  if (placement === undefined) {
    placement = moved(project, place(project, rootId));
    kept.byRoot.set(rootId, placement);
  }
  return placement;
}

function place(project: ProjectSnapshot, rootId: Id): Map<Id, Placed> {
  const index = modelIndexOf(project);
  const definitions = definitionsIn(project);
  const solids = solidsIn(project);
  const worldId = project.model.world.id;
  const solidOf = (element: Element): SpaceEntry['solid'] => {
    const shown = solidShownBy(element, definitions);
    const defined = shown && solids.solid(shown.solid);
    return defined ? { id: shown.solid, definition: defined.definition } : undefined;
  };

  // Anchored parts by the container whose solid holds them; an anchored element's pose is not used.
  const anchoredIn = new Map<Id, { element: Element; name: string; solid: Id }[]>();
  const anchored = new Set<Id>();
  for (const { element, part, solids: named } of solidAnchoredElements(project)) {
    for (const container of index.containersOf(element.id)) {
      const holder = index.element(container);
      const shown = holder && solidShownBy(holder, definitions);
      if (!shown || !named.includes(shown.solid)) continue;
      const list = anchoredIn.get(container) ?? [];
      list.push({ element, name: part.part, solid: shown.solid });
      anchoredIn.set(container, list);
      anchored.add(element.id);
      break;
    }
  }

  // Posed elements by what they are posed in, World for no `in`; a pose in a non-container is unused.
  const posedIn = new Map<Id, Element[]>();
  for (const element of project.model.elements) {
    const pose = element.pose;
    if (pose === undefined || anchored.has(element.id)) continue;
    if (!poseIsUsable(pose, element.id, index)) continue;
    const container = pose.in ?? worldId;
    const list = posedIn.get(container) ?? [];
    list.push(element);
    posedIn.set(container, list);
  }

  const result = new Map<Id, Placed>();
  const rootElement = index.element(rootId);
  if (!rootElement) return result;
  const rootSolid = solidOf(rootElement);
  result.set(rootId, {
    entry: {
      element: rootId,
      how: 'root',
      matrix: IDENTITY,
      ...(rootSolid ? { solid: rootSolid } : {}),
    },
    through: [],
  });
  // Walked by an index rather than shifted, so that a large model is placed in linear time.
  const queue: Id[] = [rootId];
  for (let next = 0; next < queue.length; next += 1) {
    const holderId = queue[next] as Id;
    const holder = result.get(holderId) as Placed;
    const through = [...holder.through, holderId];
    // Its solid's anchored parts, drawn as their nodes in it.
    const holderSolid = holder.entry.solid;
    for (const { element, name, solid } of anchoredIn.get(holderId) ?? []) {
      if (result.has(element.id) || !holderSolid || holderSolid.id !== solid) continue;
      const index = holderSolid.definition.parts.findIndex((each) => each.name === name);
      if (index < 0) continue;
      const own = solidOf(element);
      // Measured from its part's point, with its solid's axes; a part drawing nothing of its own has
      // its solid's origin.
      const point = holderSolid.definition.parts[index]?.point ?? { x: 0, y: 0, z: 0 };
      result.set(element.id, {
        entry: {
          element: element.id,
          how: 'anchored',
          in: holderId,
          matrix: multiply(holder.entry.matrix, matrixOf(point)),
          part: { solid, name, index },
          ...(own ? { solid: own } : {}),
        },
        through,
      });
      queue.push(element.id);
    }
    // What is posed in it; with World as the root, what is posed with no `in` too.
    for (const element of posedIn.get(holderId) ?? []) {
      if (result.has(element.id)) continue;
      const pose = element.pose as Pose;
      const own = solidOf(element);
      result.set(element.id, {
        entry: {
          element: element.id,
          how: 'posed',
          in: holderId,
          matrix: multiply(holder.entry.matrix, matrixOf(pose.at, pose.rotation)),
          ...(own ? { solid: own } : {}),
        },
        through,
      });
      queue.push(element.id);
    }
  }
  return result;
}

/**
 * The pose that keeps an element where it is in physical space once it is posed in `container`: its
 * place and turn measured from the container's origin and axes. `undefined` when either is not in
 * physical space under World.
 */
export function poseIn(
  project: ProjectSnapshot,
  element: Id,
  container: Id | undefined,
): Pose | undefined {
  const { placed } = placeAll(project);
  const self = placed.get(element);
  const holder = placed.get(container ?? project.model.world.id);
  if (!self || !holder) return undefined;
  const local = multiply(inverseRigid(holder.entry.matrix), self.entry.matrix);
  const { at, rotation } = decompose(local);
  const round = (value: number) => {
    const rounded = Math.round(value * 1e9) / 1e9;
    return Object.is(rounded, -0) ? 0 : rounded;
  };
  const near = (value: number, to: number) => Math.abs(value - to) < 1e-12;
  const turned = !(near(rotation.x, 0) && near(rotation.y, 0) && near(rotation.z, 0));
  return {
    ...(container === undefined || container === project.model.world.id ? {} : { in: container }),
    at: { x: round(at.x), y: round(at.y), z: round(at.z) },
    ...(turned ? { rotation } : {}),
  };
}

/**
 * Where a relation drawn in space ends on an element (ADR 0076): its anchored part's point, or else
 * the middle of its solid's bounds, or else its origin, in the root's coordinates. `undefined` when
 * it is not in the space.
 */
export function pointInSpace(space: Space, element: Id): SpacePoint | undefined {
  const entry = space.entries.get(element) ?? space.faint.get(element);
  if (!entry) return undefined;
  const holder =
    entry.part && (space.entries.get(entry.in as Id) ?? space.faint.get(entry.in as Id));
  const anchoredAtPoint = entry.part && holder?.solid?.definition.parts[entry.part.index]?.point;
  if (!anchoredAtPoint && entry.solid) {
    const { min, max } = entry.solid.definition.bounds;
    return transformPoint(entry.matrix, {
      x: (min.x + max.x) / 2,
      y: (min.y + max.y) / 2,
      z: (min.z + max.z) / 2,
    });
  }
  // An anchored part's origin is its point.
  return transformPoint(entry.matrix, { x: 0, y: 0, z: 0 });
}
