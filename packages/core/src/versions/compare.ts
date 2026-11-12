/**
 * Comparing two versions of a project (ADR 0070): by id, item by item, into what was added, removed,
 * changed and moved, each with what differs. Pure and linear in the items of the two versions.
 *
 * - **Added** and **removed:** an id in one version only. An element added or removed takes its
 *   places in every view and the nesting relations that place it; a relation, its routes; a view, its
 *   shapes, stacking lists and routes; a package, its definitions.
 * - **Changed:** in both versions, something it holds differs, its place aside. Each change lists its
 *   differences, by path, with the values before and after.
 * - **Moved:** a shape or a free shape whose place differs by a canvas unit at least, or a shape that
 *   sits in another container of its view. Places and sizes compare in whole canvas units.
 *
 * `recompare` follows an action: it works out again only the changes that the action's operations
 * touch, and the rest stays as it was, so that following an action costs what the action touched.
 */
import type { Id, JsonValue, ViewFile } from '@visual-anything/schema';
import { keyOf, type Collection, type Operation } from '../operations';
import { shownByScope } from '../scope';
import type { ProjectSnapshot } from '../snapshot';
import { definitionsIn } from '../state';
import {
  ITEM_KINDS,
  itemKey,
  projectItems,
  sameValue,
  type ItemRef,
  type ProjectItem,
} from './items';

/** What happened to an item between two versions. */
export type ChangeStatus = 'added' | 'removed' | 'changed' | 'moved';

/** One thing that differs inside an item, by its path, with its value in each version. */
export interface Difference {
  /** Where it lies inside the item, such as `name`, `attributes.latency` or `steps.<id>`. */
  path: string;
  /** Its value in the older version; absent when it had none. */
  before?: JsonValue;
  /** Its value in the newer version; absent when it has none. */
  after?: JsonValue;
}

/** One thing added, removed, changed or moved, as a person reads it. */
export interface Change {
  status: ChangeStatus;
  /** The item it is about. */
  ref: ItemRef;
  /** Every item it covers, its own first: an element added covers its places and nesting relations. */
  items: ItemRef[];
  /** What differs, for a change or a move; none for what was added or removed. */
  differences: Difference[];
}

/** Two versions compared. */
export interface Comparison {
  /** The changes, in the order the kinds of item come in, then by key. */
  changes: Change[];
  counts: Record<ChangeStatus, number>;
  /** Every id the changes mention, with its name in either version. */
  names: Record<Id, { before?: string; after?: string }>;
}

/** Compares two versions of a project, the older first. */
export function compareProjects(older: ProjectSnapshot, newer: ProjectSnapshot): Comparison {
  const before = sideOf(older);
  const after = sideOf(newer);
  const keys = new Set([...before.items.keys(), ...after.items.keys()]);
  return finished(changesOver(before, after, keys), before, after);
}

/**
 * The comparison of `older` with `newer`, where `comparison` compared `older` with the version that
 * `operations` turned into `newer`: only the changes the operations touch are worked out again.
 */
export function recompare(
  comparison: Comparison,
  older: ProjectSnapshot,
  newer: ProjectSnapshot,
  operations: readonly Operation[],
): Comparison {
  const before = sideOf(older);
  const after = sideOf(newer);
  const touched = touchedKeys(operations, before, after);
  if (touched === 'all') return compareProjects(older, newer);
  // The changes worked out before that touch what the operations reached go, with every item they
  // cover, which is worked out again with them, and what those reach in turn, until nothing more is.
  let reach = closure(touched, before, after);
  // A view that comes or goes takes every change of what it held, which the version the operations
  // started from may hold alone.
  const cameOrWent = (view: Id) =>
    reach.has(`view:${view}`) &&
    (!before.items.has(`view:${view}`) || !after.items.has(`view:${view}`));
  const touches = (ref: ItemRef) =>
    reach.has(itemKey(ref)) || (ref.kind !== 'view' && 'view' in ref && cameOrWent(ref.view));
  for (;;) {
    const size = reach.size;
    for (const change of comparison.changes) {
      if (change.items.some(touches)) {
        for (const ref of change.items) reach.add(itemKey(ref));
      }
    }
    reach = closure(reach, before, after);
    if (reach.size === size) break;
  }
  const kept = comparison.changes.filter(
    (change) => !change.items.some((ref) => reach.has(itemKey(ref))),
  );
  const again = changesOver(before, after, reach);
  return finished([...kept, ...again], before, after);
}

// ——— One view ———

/** What happened, in one view, to an element, a relation or a free shape it draws in either version. */
export interface ViewItemState {
  status: 'added' | 'removed' | 'changed' | 'moved' | 'unchanged';
  /**
   * Why it is added or removed here: it is new or deleted, or the view's scope took it in or left
   * it out.
   */
  why?: 'new' | 'deleted' | 'scope';
  /** Whether it also moved, when it changed. */
  moved?: true;
}

/** One view compared: the state of what it draws, and its own changes. */
export interface ViewComparison {
  view: Id;
  /** By `element:<id>`, `relation:<id>` or `free-shape:<id>`. */
  states: ReadonlyMap<string, ViewItemState>;
  /** The changes of the view itself: its name, scope, nesting relation types, overlays and the rest. */
  changes: Change[];
}

/** One view of a comparison: what each element, relation and free shape it draws did there. */
export function compareView(
  comparison: Comparison,
  older: ProjectSnapshot,
  newer: ProjectSnapshot,
  view: Id,
): ViewComparison {
  const was = older.views.find((each) => each.id === view);
  const is = newer.views.find((each) => each.id === view);
  const states = new Map<string, ViewItemState>();
  const changedHere = new Set<string>();
  const movedHere = new Set<string>();
  const own: Change[] = [];
  for (const change of comparison.changes) {
    const { ref } = change;
    if (ref.kind === 'view' && ref.view === view) {
      if (change.status === 'changed') own.push(change);
      continue;
    }
    if (ref.kind === 'element' || ref.kind === 'relation') {
      if (change.status === 'changed') changedHere.add(itemKey(ref));
      continue;
    }
    if ('view' in ref && ref.view === view) {
      const subject =
        ref.kind === 'position'
          ? `element:${ref.element}`
          : ref.kind === 'route'
            ? `relation:${ref.relation}`
            : ref.kind === 'free-shape'
              ? `free-shape:${ref.id}`
              : undefined;
      if (subject === undefined) continue;
      if (change.status === 'moved') movedHere.add(subject);
      else if (change.status === 'changed') changedHere.add(subject);
      else if (ref.kind === 'free-shape') {
        states.set(subject, {
          status: change.status,
          why: change.status === 'added' ? 'new' : 'deleted',
        });
      }
    }
  }
  const drawn = (state: ProjectSnapshot, file: ViewFile | undefined) => {
    const elements = new Set<Id>();
    const relations = new Set<Id>();
    if (!file) return { elements, relations };
    const shown = shownByScope(state, file);
    const world = state.model.world.id;
    for (const element of state.model.elements) {
      if (element.id !== world && shown.element(element.id)) elements.add(element.id);
    }
    for (const relation of state.model.relations) {
      if (shown.relation(relation.id)) relations.add(relation.id);
    }
    return { elements, relations };
  };
  const before = drawn(older, was);
  const after = drawn(newer, is);
  const olderItems = projectItems(older);
  const newerItems = projectItems(newer);
  const stateOf = (kind: 'element' | 'relation', id: Id, wasDrawn: boolean, isDrawn: boolean) => {
    const key = `${kind}:${id}`;
    if (isDrawn && !wasDrawn) {
      return {
        status: 'added' as const,
        why: olderItems.has(key) ? ('scope' as const) : ('new' as const),
      };
    }
    if (wasDrawn && !isDrawn) {
      return {
        status: 'removed' as const,
        why: newerItems.has(key) ? ('scope' as const) : ('deleted' as const),
      };
    }
    if (changedHere.has(key)) {
      return {
        status: 'changed' as const,
        ...(movedHere.has(key) ? { moved: true as const } : {}),
      };
    }
    if (movedHere.has(key)) return { status: 'moved' as const };
    return { status: 'unchanged' as const };
  };
  for (const id of new Set([...before.elements, ...after.elements])) {
    states.set(
      `element:${id}`,
      stateOf('element', id, before.elements.has(id), after.elements.has(id)),
    );
  }
  for (const id of new Set([...before.relations, ...after.relations])) {
    states.set(
      `relation:${id}`,
      stateOf('relation', id, before.relations.has(id), after.relations.has(id)),
    );
  }
  for (const shape of [...(was?.freeShapes ?? []), ...(is?.freeShapes ?? [])]) {
    const key = `free-shape:${shape.id}`;
    if (states.has(key)) continue;
    states.set(
      key,
      changedHere.has(key)
        ? { status: 'changed', ...(movedHere.has(key) ? { moved: true as const } : {}) }
        : movedHere.has(key)
          ? { status: 'moved' }
          : { status: 'unchanged' },
    );
  }
  return { view, states, changes: own };
}

// ——— Working the changes out ———

/** A version as the comparison reads it: its items, and what ties them to one another. */
interface Side {
  state: ProjectSnapshot;
  items: ReadonlyMap<string, ProjectItem>;
  /** By element: the keys of its positions, in every view. */
  positionsOf: ReadonlyMap<Id, readonly string[]>;
  /** By relation: the keys of its routes, in every view. */
  routesOf: ReadonlyMap<Id, readonly string[]>;
  /** By element: the keys of the nesting relations from it, which place it in its containers. */
  nestsFrom: ReadonlyMap<Id, readonly string[]>;
  /** By element: the keys of the stacking lists that hold it. */
  stackingWith: ReadonlyMap<Id, readonly string[]>;
  /** By view: the keys of its shapes, free shapes, stacking lists and routes. */
  inView: ReadonlyMap<Id, readonly string[]>;
  /** By package: the keys of its components, relation types and images. */
  inPackage: ReadonlyMap<Id, readonly string[]>;
}

const sides = new WeakMap<ProjectSnapshot, Side>();

function sideOf(state: ProjectSnapshot): Side {
  const kept = sides.get(state);
  if (kept) return kept;
  const items = projectItems(state);
  const nesting = definitionsIn(state).nestingRelationTypes;
  const positionsOf = new Map<Id, string[]>();
  const routesOf = new Map<Id, string[]>();
  const nestsFrom = new Map<Id, string[]>();
  const stackingWith = new Map<Id, string[]>();
  const inView = new Map<Id, string[]>();
  const inPackage = new Map<Id, string[]>();
  const push = (map: Map<Id, string[]>, id: Id, key: string) => {
    const list = map.get(id);
    if (list) list.push(key);
    else map.set(id, [key]);
  };
  for (const [key, { ref, value }] of items) {
    switch (ref.kind) {
      case 'position':
        push(positionsOf, ref.element, key);
        push(inView, ref.view, key);
        break;
      case 'route':
        push(routesOf, ref.relation, key);
        push(inView, ref.view, key);
        break;
      case 'free-shape':
        push(inView, ref.view, key);
        break;
      case 'stacking':
        push(inView, ref.view, key);
        for (const id of value as Id[]) push(stackingWith, id, key);
        break;
      case 'relation': {
        const relation = value as { relationType: Id; from: Id };
        if (nesting.has(relation.relationType)) push(nestsFrom, relation.from, key);
        break;
      }
      case 'component':
      case 'relation-type':
      case 'image':
      case 'solid':
        push(inPackage, ref.package, key);
        break;
      default:
        break;
    }
  }
  const side = { state, items, positionsOf, routesOf, nestsFrom, stackingWith, inView, inPackage };
  sides.set(state, side);
  return side;
}

/** The changes of every item among `keys`, which hold every item a change of one of them covers. */
function changesOver(before: Side, after: Side, keys: ReadonlySet<string>): Change[] {
  const changes: Change[] = [];
  const covered = new Set<string>();
  const was = (key: string) => before.items.get(key);
  const is = (key: string) => after.items.get(key);
  const presence = (key: string): 'both' | 'older' | 'newer' | undefined =>
    was(key) ? (is(key) ? 'both' : 'older') : is(key) ? 'newer' : undefined;
  const added = (key: string) => presence(key) === 'newer';
  const removed = (key: string) => presence(key) === 'older';

  // What comes and goes whole, with what it takes: views, packages, elements, then relations.
  const whole = (key: string, takes: (side: Side) => readonly string[]) => {
    const where = presence(key);
    if (where !== 'older' && where !== 'newer') return;
    const side = where === 'newer' ? after : before;
    const item = side.items.get(key) as ProjectItem;
    const items = [item.ref];
    covered.add(key);
    for (const other of takes(side)) {
      if (covered.has(other) || presence(other) !== where) continue;
      covered.add(other);
      items.push((side.items.get(other) as ProjectItem).ref);
    }
    changes.push({
      status: where === 'newer' ? 'added' : 'removed',
      ref: item.ref,
      items,
      differences: [],
    });
  };
  // The keys by the kind of their item, read once.
  const byKind = new Map<ItemRef['kind'], string[]>();
  for (const key of keys) {
    const kind = (was(key) ?? is(key))?.ref.kind;
    if (kind === undefined) continue;
    const list = byKind.get(kind);
    if (list) list.push(key);
    else byKind.set(kind, [key]);
  }
  const ofKind = (kind: ItemRef['kind']): readonly string[] => byKind.get(kind) ?? [];

  for (const key of ofKind('view')) {
    const id = (was(key) ?? is(key))?.ref as { view: Id };
    whole(key, (side) => side.inView.get(id.view) ?? []);
  }
  for (const key of ofKind('package')) {
    const id = (was(key) ?? is(key))?.ref as { package: Id };
    whole(key, (side) => side.inPackage.get(id.package) ?? []);
  }
  for (const key of ofKind('element')) {
    const id = ((was(key) ?? is(key))?.ref as { id: Id }).id;
    whole(key, (side) => {
      const nests = side.nestsFrom.get(id) ?? [];
      const routes = nests.flatMap((relation) => {
        const ref = side.items.get(relation)?.ref as { id: Id };
        return side.routesOf.get(ref.id) ?? [];
      });
      return [...(side.positionsOf.get(id) ?? []), ...nests, ...routes];
    });
  }
  for (const key of ofKind('relation')) {
    if (covered.has(key)) continue;
    const id = ((was(key) ?? is(key))?.ref as { id: Id }).id;
    whole(key, (side) => side.routesOf.get(id) ?? []);
  }

  // Shapes of an element in both versions, in a view in both: moved, changed, or added and removed
  // as the scope or the nesting take them in or leave them out. A shape that sits in another container
  // now is a move.
  const byShape = new Map<string, { older: string[]; newer: string[] }>();
  for (const key of ofKind('position')) {
    if (covered.has(key)) continue;
    const ref = (was(key) ?? is(key))?.ref as { view: Id; element: Id };
    const shape = `${ref.view}\u0000${ref.element}`;
    const entry = byShape.get(shape) ?? { older: [], newer: [] };
    const where = presence(key);
    if (where === 'both') {
      const moved = placeDiffers(was(key)?.value, is(key)?.value, ['x', 'y']);
      if (moved.length > 0) {
        changes.push({
          status: 'moved',
          ref: (is(key) as ProjectItem).ref,
          items: [(is(key) as ProjectItem).ref],
          differences: moved,
        });
      }
      const changed = otherDifferences(
        was(key)?.value,
        is(key)?.value,
        ['x', 'y'],
        ['width', 'height'],
      );
      if (changed.length > 0) {
        changes.push({
          status: 'changed',
          ref: (is(key) as ProjectItem).ref,
          items: [(is(key) as ProjectItem).ref],
          differences: changed,
        });
      }
    } else if (where === 'older') entry.older.push(key);
    else if (where === 'newer') entry.newer.push(key);
    byShape.set(shape, entry);
  }
  for (const { older, newer } of byShape.values()) {
    const pairs = Math.min(older.length, newer.length);
    older.sort();
    newer.sort();
    for (let at = 0; at < pairs; at++) {
      const from = was(older[at] as string) as ProjectItem;
      const to = is(newer[at] as string) as ProjectItem;
      const differences: Difference[] = [
        {
          path: 'container',
          ...optional('before', (from.value as { container?: Id }).container),
          ...optional('after', (to.value as { container?: Id }).container),
        },
        ...placeDiffers(from.value, to.value, ['x', 'y']),
      ];
      changes.push({ status: 'moved', ref: to.ref, items: [to.ref, from.ref], differences });
    }
    for (const key of older.slice(pairs)) {
      const ref = (was(key) as ProjectItem).ref;
      changes.push({ status: 'removed', ref, items: [ref], differences: [] });
    }
    for (const key of newer.slice(pairs)) {
      const ref = (is(key) as ProjectItem).ref;
      changes.push({ status: 'added', ref, items: [ref], differences: [] });
    }
  }

  // Free shapes, which move by their place, or their ends.
  for (const key of ofKind('free-shape')) {
    if (covered.has(key)) continue;
    const where = presence(key);
    const ref = (is(key) ?? was(key))?.ref as ItemRef;
    if (where !== 'both') {
      changes.push({
        status: where === 'newer' ? 'added' : 'removed',
        ref,
        items: [ref],
        differences: [],
      });
      continue;
    }
    const place = ['x', 'y', 'from', 'to'];
    const moved = placeDiffers(was(key)?.value, is(key)?.value, place);
    if (moved.length > 0) changes.push({ status: 'moved', ref, items: [ref], differences: moved });
    const changed = otherDifferences(was(key)?.value, is(key)?.value, place, ['width', 'height']);
    if (changed.length > 0)
      changes.push({ status: 'changed', ref, items: [ref], differences: changed });
  }

  // Stacking lists, read without the elements added and removed: what is left is a restack.
  for (const key of ofKind('stacking')) {
    if (covered.has(key)) continue;
    const kept = (value: JsonValue | undefined) =>
      ((value ?? []) as Id[]).filter((id) => !added(`element:${id}`) && !removed(`element:${id}`));
    const older = kept(was(key)?.value);
    const newer = kept(is(key)?.value);
    if (sameValue(older, newer)) continue;
    const ref = (is(key) ?? was(key))?.ref as ItemRef;
    changes.push({
      status: 'changed',
      ref,
      items: [ref],
      differences: [{ path: 'order', before: older, after: newer }],
    });
  }

  // The model's order, read among the elements in both versions.
  if (keys.has('order')) {
    const common = (value: JsonValue | undefined) =>
      ((value ?? []) as Id[]).filter((id) => presence(`element:${id}`) === 'both');
    const older = common(was('order')?.value);
    const newer = common(is('order')?.value);
    if (!sameValue(older, newer)) {
      const ref: ItemRef = { kind: 'order' };
      changes.push({
        status: 'changed',
        ref,
        items: [ref],
        differences: [{ path: 'order', before: older, after: newer }],
      });
    }
  }

  // Everything else: each item a change of its own.
  for (const key of keys) {
    if (covered.has(key) || key === 'order') continue;
    const item = was(key) ?? is(key);
    if (!item) continue;
    const { kind } = item.ref;
    if (kind === 'position' || kind === 'free-shape' || kind === 'stacking') continue;
    const where = presence(key);
    if (where === 'older' || where === 'newer') {
      if (kind === 'view' || kind === 'package' || kind === 'element' || kind === 'relation')
        continue;
      changes.push({
        status: where === 'newer' ? 'added' : 'removed',
        ref: item.ref,
        items: [item.ref],
        differences: [],
      });
      continue;
    }
    const differences = differencesOf(was(key)?.value, is(key)?.value, '');
    if (differences.length > 0) {
      const ref = (is(key) as ProjectItem).ref;
      changes.push({ status: 'changed', ref, items: [ref], differences });
    }
  }
  return changes;
}

/** The changes in their order, counted, with the names of what they mention. */
function finished(changes: Change[], before: Side, after: Side): Comparison {
  const rank = new Map(ITEM_KINDS.map((kind, at) => [kind, at]));
  const order = (change: Change) => `${itemKey(change.ref)}\u0000${change.status}`;
  changes.sort(
    (a, b) =>
      (rank.get(a.ref.kind) ?? 0) - (rank.get(b.ref.kind) ?? 0) ||
      (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0),
  );
  const counts: Record<ChangeStatus, number> = { added: 0, removed: 0, changed: 0, moved: 0 };
  const names: Comparison['names'] = {};
  const name = (key: string, id: Id) => {
    if (Object.hasOwn(names, id)) return;
    const older = nameOf(before.items.get(key)?.value);
    const newer = nameOf(after.items.get(key)?.value);
    if (older === undefined && newer === undefined) return;
    names[id] = { ...optional('before', older), ...optional('after', newer) } as {
      before?: string;
      after?: string;
    };
  };
  for (const change of changes) {
    counts[change.status] += 1;
    for (const ref of change.items) {
      for (const [key, id] of mentioned(ref)) name(key, id);
    }
  }
  return { changes, counts, names };
}

/** The items an item mentions by id, which a reader names: by their key, and their id. */
function mentioned(ref: ItemRef): [string, Id][] {
  switch (ref.kind) {
    case 'element':
    case 'relation':
    case 'scenario':
    case 'tour':
      return [[itemKey(ref), ref.id]];
    case 'component':
    case 'relation-type':
    case 'image':
    case 'solid':
      return [[itemKey(ref), ref.id]];
    case 'package':
      return [[itemKey(ref), ref.package]];
    case 'view':
      return [[itemKey(ref), ref.view]];
    case 'position':
      return [
        [`view:${ref.view}`, ref.view],
        [`element:${ref.element}`, ref.element],
        ...(ref.container === undefined
          ? []
          : ([[`element:${ref.container}`, ref.container]] as [string, Id][])),
      ];
    case 'route':
      return [
        [`view:${ref.view}`, ref.view],
        [`relation:${ref.relation}`, ref.relation],
      ];
    case 'free-shape':
    case 'stacking':
      return [[`view:${ref.view}`, ref.view]];
    default:
      return [];
  }
}

function nameOf(value: JsonValue | undefined): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const name = (value as { name?: unknown }).name;
  return typeof name === 'string' ? name : undefined;
}

/** The differences of a place: its keys, compared in whole canvas units, points' coordinates included. */
function placeDiffers(
  before: JsonValue | undefined,
  after: JsonValue | undefined,
  keys: readonly string[],
): Difference[] {
  const was = (before ?? {}) as Record<string, JsonValue>;
  const is = (after ?? {}) as Record<string, JsonValue>;
  return keys.flatMap((key) => {
    if (!Object.hasOwn(was, key) && !Object.hasOwn(is, key)) return [];
    return sameRounded(was[key], is[key])
      ? []
      : [{ path: key, ...optional('before', was[key]), ...optional('after', is[key]) }];
  });
}

/** The differences of everything but a place, sizes compared in whole canvas units. */
function otherDifferences(
  before: JsonValue | undefined,
  after: JsonValue | undefined,
  place: readonly string[],
  sizes: readonly string[],
): Difference[] {
  const without = (value: JsonValue | undefined) => {
    const rest: Record<string, JsonValue> = { ...((value ?? {}) as Record<string, JsonValue>) };
    for (const key of [...place, ...sizes]) delete rest[key];
    return rest;
  };
  return [
    ...placeDiffers(before, after, sizes),
    ...differencesOf(without(before), without(after), ''),
  ];
}

function sameRounded(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.round(a) === Math.round(b);
  if (isPoint(a) && isPoint(b))
    return Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y);
  return sameValue(a, b);
}

function isPoint(value: JsonValue | undefined): value is { x: number; y: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { x?: unknown }).x === 'number' &&
    typeof (value as { y?: unknown }).y === 'number'
  );
}

/**
 * What differs between two values, by path: objects key by key; lists of things with ids, such as a
 * scenario's steps, id by id, each as one difference; anything else as a whole.
 */
export function differencesOf(
  before: JsonValue | undefined,
  after: JsonValue | undefined,
  path: string,
): Difference[] {
  if (sameValue(before, after)) return [];
  const at = (key: string) => (path === '' ? key : `${path}.${key}`);
  if (isObject(before) && isObject(after)) {
    const keys = [
      ...Object.keys(before),
      ...Object.keys(after).filter((key) => !Object.hasOwn(before, key)),
    ];
    return keys.flatMap((key) => differencesOf(before[key], after[key], at(key)));
  }
  if (path !== '' && withIds(before) && withIds(after)) {
    const older = new Map(before.map((each) => [each.id, each]));
    const newer = new Map(after.map((each) => [each.id, each]));
    const ids = [
      ...after.map((each) => each.id),
      ...before.map((each) => each.id).filter((id) => !newer.has(id)),
    ];
    const differences = ids.flatMap((id) => {
      const was = older.get(id);
      const is = newer.get(id);
      return sameValue(was, is)
        ? []
        : [{ path: at(id), ...optional('before', was), ...optional('after', is) }];
    });
    // A list whose things are the same, in another order, differs as a whole.
    return differences.length > 0 ? differences : [{ path, before, after }];
  }
  return [{ path, ...optional('before', before), ...optional('after', after) }];
}

function isObject(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withIds(
  value: JsonValue | undefined,
): value is ({ id: string } & { [key: string]: JsonValue })[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  for (const each of value) {
    if (!isObject(each) || typeof each.id !== 'string' || ids.has(each.id)) return false;
    ids.add(each.id);
  }
  return true;
}

function optional<K extends string>(
  key: K,
  value: JsonValue | undefined,
): Partial<Record<K, JsonValue>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, JsonValue>);
}

// ——— What an action touches ———

/**
 * The keys of the items that operations name, or `all` for one that names too much to follow, or that
 * changes which relation types nest, and so what every element added or removed takes with it: the
 * project's packages, a package, or a relation type.
 */
function touchedKeys(
  operations: readonly Operation[],
  before: Side,
  after: Side,
): Set<string> | 'all' {
  const keys = new Set<string>();
  for (const operation of operations) {
    switch (operation.op) {
      case 'set-world':
        keys.add('world');
        break;
      case 'set-project':
        return 'all';
      case 'set-view':
        keys.add(`view:${operation.view}`);
        break;
      case 'set-package':
        return 'all';
      case 'replace-all':
        return 'all';
      // A file's conflicts are not part of what a comparison reads.
      case 'set-conflicts':
        break;
      default: {
        const { collection } = operation;
        if (collection.name === 'packages' || collection.name === 'relationTypes') return 'all';
        const key = operation.op === 'remove' ? operation.key : keyOf(collection, operation.item);
        for (const touched of keysOf(collection, key, before, after)) keys.add(touched);
      }
    }
  }
  return keys;
}

/** The items a list's item names, by the key it has in its list. */
function keysOf(collection: Collection, key: string, before: Side, after: Side): string[] {
  switch (collection.name) {
    case 'elements':
      return [`element:${key}`, 'order'];
    case 'relations':
      return [`relation:${key}`];
    case 'packages':
      return [
        `package:${key}`,
        ...(before.inPackage.get(key) ?? []),
        ...(after.inPackage.get(key) ?? []),
      ];
    case 'views':
      return [`view:${key}`, ...(before.inView.get(key) ?? []), ...(after.inView.get(key) ?? [])];
    case 'scenarios':
      return [`scenario:${key}`];
    case 'tours':
      return [`tour:${key}`];
    case 'comments':
      return [`thread:${key}`];
    case 'components':
      return [`component:${collection.package}:${key}`];
    case 'relationTypes':
      return [`relation-type:${collection.package}:${key}`];
    case 'images':
      return [`image:${collection.package}:${key}`];
    case 'solids':
      return [`solid:${collection.package}:${key}`];
    case 'positions':
      return [`position:${collection.view}:${key}`];
    case 'freeShapes':
      return [`free-shape:${collection.view}:${key}`];
    case 'stackingOrder':
      return [`stacking:${collection.view}:${collection.container}`];
    case 'routes':
      return [`route:${collection.view}:${key}`];
    // An explorable's text is its file beside the project, which versions do not compare (ADR 0107).
    case 'explorableTexts':
      return [];
  }
}

/**
 * Every item whose change may change with these: an element's places, nesting relations, routes and
 * stacking lists, and the model's order; a relation's routes and the element it places; a shape's
 * element and its other shapes in the view; and so on until nothing more is reached.
 */
function closure(start: Iterable<string>, before: Side, after: Side): Set<string> {
  const reach = new Set<string>();
  const queue = [...start];
  const add = (key: string) => {
    if (!reach.has(key)) queue.push(key);
  };
  const refOf = (key: string) => (before.items.get(key) ?? after.items.get(key))?.ref;
  while (queue.length > 0) {
    const key = queue.pop() as string;
    if (reach.has(key)) continue;
    reach.add(key);
    const ref = refOf(key);
    if (!ref) continue;
    for (const side of [before, after]) {
      switch (ref.kind) {
        case 'element':
          add('order');
          for (const each of side.positionsOf.get(ref.id) ?? []) add(each);
          for (const each of side.nestsFrom.get(ref.id) ?? []) add(each);
          for (const each of side.stackingWith.get(ref.id) ?? []) add(each);
          break;
        case 'relation': {
          for (const each of side.routesOf.get(ref.id) ?? []) add(each);
          const relation = side.items.get(key)?.value as { from?: Id } | undefined;
          if (relation?.from !== undefined) add(`element:${relation.from}`);
          break;
        }
        case 'position':
          add(`element:${ref.element}`);
          add(`view:${ref.view}`);
          for (const each of side.positionsOf.get(ref.element) ?? []) {
            if (each.startsWith(`position:${ref.view}:`)) add(each);
          }
          break;
        case 'route':
          add(`relation:${ref.relation}`);
          add(`view:${ref.view}`);
          break;
        case 'free-shape':
        case 'stacking':
          add(`view:${ref.view}`);
          break;
        case 'view':
          for (const each of side.inView.get(ref.view) ?? []) {
            // A view in both versions changes its own properties alone; one that comes or goes takes
            // its shapes with it.
            if (!before.items.has(key) || !after.items.has(key)) add(each);
          }
          break;
        case 'component':
        case 'relation-type':
        case 'image':
        case 'solid':
          add(`package:${ref.package}`);
          break;
        case 'package':
          for (const each of side.inPackage.get(ref.package) ?? []) {
            if (!before.items.has(key) || !after.items.has(key)) add(each);
          }
          break;
        default:
          break;
      }
    }
  }
  return reach;
}
