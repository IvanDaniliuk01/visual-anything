/**
 * The items of a project (ADR 0070): what operations change, each named by its kind and its id, so
 * that comparisons, merges and the history name the same things. A project is the set of its items;
 * two versions hold the same item when its kind and id are the same in both.
 *
 * - The project itself, World, each element and relation, and the model's order of elements.
 * - Each of the project's own packages, and each of their components, relation types and images.
 *   Built-in packages are the program's: they count only through the project's list of packages.
 * - Each view, and each of its positions, free shapes, stacking lists and routes.
 * - Each scenario, tour and thread, as one item. Their steps and comments have keys of their own
 *   for merging (ADR 0072), though a comparison reads each of these as one item.
 */
import type { Id, JsonValue } from '@visual-anything/schema';
import { builtinPackage } from '../builtin';
import { positionKey } from '../operations';
import type { ProjectSnapshot } from '../snapshot';

/** One item of a project, by its kind and its id, and the ids of what holds it. */
export type ItemRef =
  | { kind: 'project' }
  | { kind: 'world' }
  | { kind: 'element'; id: Id }
  | { kind: 'relation'; id: Id }
  /** The model's order of elements, which is the order of rows. */
  | { kind: 'order' }
  | { kind: 'package'; package: Id }
  | { kind: 'component'; package: Id; id: Id }
  | { kind: 'relation-type'; package: Id; id: Id }
  | { kind: 'image'; package: Id; id: Id }
  /** A solid's definition (ADR 0075); its file, named by its hash, is never compared byte by byte. */
  | { kind: 'solid'; package: Id; id: Id }
  | { kind: 'view'; view: Id }
  | { kind: 'position'; view: Id; element: Id; container?: Id }
  | { kind: 'free-shape'; view: Id; id: Id }
  /** The order of the shapes directly in a container, or in World, in a view. */
  | { kind: 'stacking'; view: Id; container: Id }
  | { kind: 'route'; view: Id; relation: Id }
  | { kind: 'scenario'; id: Id }
  | { kind: 'tour'; id: Id }
  | { kind: 'thread'; id: Id }
  /** A step of a scenario, a step of a tour and a comment of a thread, which merges read one by one. */
  | { kind: 'step'; scenario: Id; id: Id }
  | { kind: 'tour-step'; tour: Id; id: Id }
  | { kind: 'comment'; thread: Id; id: Id };

/** The kinds of item, in the order a comparison lists them. */
export const ITEM_KINDS: readonly ItemRef['kind'][] = [
  'project',
  'world',
  'order',
  'element',
  'relation',
  'package',
  'component',
  'relation-type',
  'image',
  'view',
  'position',
  'free-shape',
  'stacking',
  'route',
  'scenario',
  'step',
  'tour',
  'tour-step',
  'thread',
  'comment',
];

/**
 * The key that names an item across the whole project, such as `element:<id>` or
 * `position:<view>:<element> in <container>`. Ids hold no `:` and no spaces, so a key reads one way.
 */
export function itemKey(ref: ItemRef): string {
  switch (ref.kind) {
    case 'project':
    case 'world':
    case 'order':
      return ref.kind;
    case 'element':
    case 'relation':
    case 'scenario':
    case 'tour':
    case 'thread':
      return `${ref.kind}:${ref.id}`;
    case 'package':
      return `package:${ref.package}`;
    case 'component':
    case 'relation-type':
    case 'image':
    case 'solid':
      return `${ref.kind}:${ref.package}:${ref.id}`;
    case 'view':
      return `view:${ref.view}`;
    case 'position':
      return `position:${ref.view}:${positionKey(ref)}`;
    case 'free-shape':
      return `free-shape:${ref.view}:${ref.id}`;
    case 'stacking':
      return `stacking:${ref.view}:${ref.container}`;
    case 'route':
      return `route:${ref.view}:${ref.relation}`;
    case 'step':
      return `step:${ref.scenario}:${ref.id}`;
    case 'tour-step':
      return `tour-step:${ref.tour}:${ref.id}`;
    case 'comment':
      return `comment:${ref.thread}:${ref.id}`;
  }
}

/**
 * The key a conflict keeps for an item in its own file (ADR 0072): the item's key without what the
 * file already says, such as `element:<id>` in the model file or `position:<element> in <container>`
 * in a view's file.
 */
export function fileItemKey(ref: ItemRef): string {
  switch (ref.kind) {
    case 'project':
    case 'world':
    case 'order':
      return ref.kind;
    case 'element':
    case 'relation':
      return `${ref.kind}:${ref.id}`;
    case 'package':
      return 'package';
    case 'component':
    case 'relation-type':
    case 'image':
    case 'solid':
      return `${ref.kind}:${ref.id}`;
    case 'view':
      return 'view';
    case 'position':
      return `position:${positionKey(ref)}`;
    case 'free-shape':
      return `free-shape:${ref.id}`;
    case 'stacking':
      return `stacking:${ref.container}`;
    case 'route':
      return `route:${ref.relation}`;
    case 'scenario':
    case 'tour':
    case 'thread':
      return ref.kind;
    case 'step':
    case 'tour-step':
    case 'comment':
      return `${ref.kind}:${ref.id}`;
  }
}

/** An item of a project, by its key: what names it, and what it holds as the project keeps it. */
export interface ProjectItem {
  ref: ItemRef;
  value: JsonValue;
}

/** Whether a package is the project's own, rather than one built into the program. */
export function isOwnPackage(id: Id): boolean {
  return builtinPackage(id) === undefined;
}

const itemsByState = new WeakMap<ProjectSnapshot, ReadonlyMap<string, ProjectItem>>();

/**
 * Every item of a project as a comparison reads it, by its key, in the project's order: scenarios,
 * tours and threads each one item. Read once for each project object.
 */
export function projectItems(state: ProjectSnapshot): ReadonlyMap<string, ProjectItem> {
  const kept = itemsByState.get(state);
  if (kept) return kept;
  const items = new Map<string, ProjectItem>();
  const add = (ref: ItemRef, value: unknown) =>
    items.set(itemKey(ref), { ref, value: withoutConflicts(value) as JsonValue });
  add({ kind: 'project' }, state.project);
  add({ kind: 'world' }, state.model.world);
  for (const element of state.model.elements) add({ kind: 'element', id: element.id }, element);
  for (const relation of state.model.relations) {
    add({ kind: 'relation', id: relation.id }, relation);
  }
  add(
    { kind: 'order' },
    state.model.elements.map((element) => element.id),
  );
  for (const file of state.packages) {
    if (!isOwnPackage(file.id)) continue;
    const { components, relationTypes, images, solids, ...properties } = file;
    add({ kind: 'package', package: file.id }, properties);
    for (const component of components) {
      add({ kind: 'component', package: file.id, id: component.id }, component);
    }
    for (const relationType of relationTypes) {
      add({ kind: 'relation-type', package: file.id, id: relationType.id }, relationType);
    }
    for (const image of images ?? []) {
      add({ kind: 'image', package: file.id, id: image.id }, image);
    }
    for (const solid of solids ?? []) {
      add({ kind: 'solid', package: file.id, id: solid.id }, solid);
    }
  }
  for (const view of state.views) {
    const { positions, freeShapes, stackingOrder, routes, ...properties } = view;
    add({ kind: 'view', view: view.id }, properties);
    for (const position of positions) {
      add(
        {
          kind: 'position',
          view: view.id,
          element: position.element,
          ...(position.container === undefined ? {} : { container: position.container }),
        },
        position,
      );
    }
    for (const shape of freeShapes) add({ kind: 'free-shape', view: view.id, id: shape.id }, shape);
    for (const [container, list] of Object.entries(stackingOrder ?? {})) {
      add({ kind: 'stacking', view: view.id, container }, list);
    }
    for (const [relation, route] of Object.entries(routes ?? {})) {
      add({ kind: 'route', view: view.id, relation }, route);
    }
  }
  for (const scenario of state.scenarios) add({ kind: 'scenario', id: scenario.id }, scenario);
  for (const tour of state.tours) add({ kind: 'tour', id: tour.id }, tour);
  for (const thread of state.comments) add({ kind: 'thread', id: thread.id }, thread);
  itemsByState.set(state, items);
  return items;
}

/** A file's value without the conflicts a merge left in it, which are not part of the project. */
function withoutConflicts(value: unknown): unknown {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('conflicts' in value)
  ) {
    return value;
  }
  return withoutKeys(value as Record<string, unknown>, 'conflicts');
}

/** A copy of an object without some of its keys. */
export function withoutKeys<T extends object, K extends keyof T>(
  value: T,
  ...keys: K[]
): Omit<T, K> {
  const copy: Partial<T> = { ...value };
  for (const key of keys) delete copy[key];
  return copy as Omit<T, K>;
}

/**
 * Whether two values are the same JSON value: key order and the spelling of a number aside, and a
 * color whatever the case of its digits (ADR-0033).
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'string' && typeof b === 'string') {
    return isColor(a) && isColor(b) && a.toLowerCase() === b.toLowerCase();
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((each, at) => sameValue(each, b[at]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter((key) => left[key] !== undefined);
  const others = Object.keys(right).filter((key) => right[key] !== undefined);
  if (keys.length !== others.length) return false;
  return keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
}

function isColor(text: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(text);
}
