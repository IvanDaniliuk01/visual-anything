/**
 * The operations that turn one version of a project into another (ADR 0070): what merges and
 * proposals apply (ADR 0072, ADR 0073), and what a comparison follows. Item by item where the lists
 * keep their order, `set-…` for the properties of the project, World, a view and a package, and the
 * whole list where its order changed. Applied to the first version, they give the second exactly, and
 * their inverses give the first back.
 */
import type { FileConflict, Id } from '@visual-anything/schema';
import {
  keyOf,
  type Collection,
  type ConflictFile,
  type Item,
  type Operation,
} from '../operations';
import type { ProjectSnapshot } from '../snapshot';

/** The operations that turn `from` into `to`. */
export function operationsBetween(from: ProjectSnapshot, to: ProjectSnapshot): Operation[] {
  const operations: Operation[] = [];
  if (!sameExactly(from.project, to.project)) {
    operations.push({ op: 'set-project', project: to.project });
  }
  if (!sameExactly(from.model.world, to.model.world)) {
    operations.push({ op: 'set-world', world: to.model.world });
  }
  between(operations, { name: 'elements' }, from.model.elements, to.model.elements);
  between(operations, { name: 'relations' }, from.model.relations, to.model.relations);

  // Packages and views in both versions change by their properties and their own lists; those that
  // come or go do so whole.
  const shell = (collection: Collection, older: readonly Item[], newer: readonly Item[]) =>
    between(operations, collection, older, newer, () => true);
  shell({ name: 'packages' }, from.packages, to.packages);
  const olderPackages = new Map(from.packages.map((file) => [file.id, file]));
  for (const file of to.packages) {
    const was = olderPackages.get(file.id);
    if (!was) continue;
    const { components, relationTypes, images, ...properties } = file;
    const {
      components: wasComponents,
      relationTypes: wasTypes,
      images: wasImages,
      ...before
    } = was;
    if (!sameExactly(before, properties)) {
      operations.push({ op: 'set-package', package: file.id, properties });
    }
    between(operations, { name: 'components', package: file.id }, wasComponents, components);
    between(operations, { name: 'relationTypes', package: file.id }, wasTypes, relationTypes);
    between(operations, { name: 'images', package: file.id }, wasImages ?? [], images ?? []);
  }

  shell({ name: 'views' }, from.views, to.views);
  const olderViews = new Map(from.views.map((view) => [view.id, view]));
  for (const view of to.views) {
    const was = olderViews.get(view.id);
    if (!was) continue;
    const { positions, freeShapes, stackingOrder, routes, ...properties } = view;
    const {
      positions: wasPositions,
      freeShapes: wasShapes,
      stackingOrder: wasOrder,
      routes: wasRoutes,
      ...before
    } = was;
    if (!sameExactly(before, properties)) {
      operations.push({ op: 'set-view', view: view.id, properties });
    }
    between(operations, { name: 'positions', view: view.id }, wasPositions, positions);
    between(operations, { name: 'freeShapes', view: view.id }, wasShapes, freeShapes);
    const containers = new Set<Id>([
      ...Object.keys(wasOrder ?? {}),
      ...Object.keys(stackingOrder ?? {}),
    ]);
    for (const container of containers) {
      between(
        operations,
        { name: 'stackingOrder', view: view.id, container },
        listOf(wasOrder, container),
        listOf(stackingOrder, container),
      );
    }
    between(
      operations,
      { name: 'routes', view: view.id },
      Object.entries(wasRoutes ?? {}).map(([relation, route]) => ({ relation, route })),
      Object.entries(routes ?? {}).map(([relation, route]) => ({ relation, route })),
    );
  }

  between(operations, { name: 'scenarios' }, from.scenarios, to.scenarios);
  between(operations, { name: 'tours' }, from.tours, to.tours);
  between(operations, { name: 'comments' }, from.comments, to.comments);

  // The conflicts of each file in both versions, which the operations above keep as they were.
  const conflicts = (file: ConflictFile, was: unknown, is: unknown) => {
    const before = (was as { conflicts?: FileConflict[] } | undefined)?.conflicts;
    const after = (is as { conflicts?: FileConflict[] } | undefined)?.conflicts;
    if (was === undefined || is === undefined || sameExactly(before, after)) return;
    operations.push({
      op: 'set-conflicts',
      file,
      ...(after === undefined ? {} : { conflicts: after }),
    });
  };
  conflicts({ kind: 'project' }, from.project, to.project);
  conflicts({ kind: 'model' }, from.model, to.model);
  const pairs = <T extends { id: Id }>(older: readonly T[], newer: readonly T[]) => {
    const byId = new Map(older.map((each) => [each.id, each]));
    return newer.flatMap((each) => {
      const was = byId.get(each.id);
      return was ? [[was, each] as const] : [];
    });
  };
  for (const [was, is] of pairs(from.packages, to.packages))
    conflicts({ kind: 'package', id: is.id }, was, is);
  for (const [was, is] of pairs(from.views, to.views))
    conflicts({ kind: 'view', id: is.id }, was, is);
  for (const [was, is] of pairs(from.scenarios, to.scenarios))
    conflicts({ kind: 'scenario', id: is.id }, was, is);
  for (const [was, is] of pairs(from.tours, to.tours))
    conflicts({ kind: 'tour', id: is.id }, was, is);
  for (const [was, is] of pairs(from.comments, to.comments))
    conflicts({ kind: 'comment', id: is.id }, was, is);
  return operations;
}

/**
 * The operations that turn one list into another: removals, then insertions and replacements in the
 * new list's order, while the items in both keep their order; otherwise the whole list. With `kept`,
 * an item in both lists is left for its own operations to change.
 */
function between(
  operations: Operation[],
  collection: Collection,
  older: readonly Item[],
  newer: readonly Item[],
  kept?: (was: Item, is: Item) => boolean,
): void {
  const key = (item: Item) => keyOf(collection, item);
  const olderKeys = older.map(key);
  const newerKeys = newer.map(key);
  const inNewer = new Set(newerKeys);
  const inOlder = new Set(olderKeys);
  const stayed = olderKeys.filter((each) => inNewer.has(each));
  const stays = newerKeys.filter((each) => inOlder.has(each));
  if (stayed.some((each, at) => each !== stays[at])) {
    // The order changed. A list of packages or views keeps its items' own operations apart, so its
    // order goes over item by item: out and in again where each now is.
    if (kept) {
      const olderByKey = new Map(older.map((item) => [key(item), item]));
      const withNewOrder = newer.map((item) => olderByKey.get(key(item)) ?? item);
      operations.push({ op: 'replace-all', collection, items: withNewOrder });
      return;
    }
    if (!sameExactly(older, newer))
      operations.push({ op: 'replace-all', collection, items: [...newer] });
    return;
  }
  for (const each of olderKeys) {
    if (!inNewer.has(each)) operations.push({ op: 'remove', collection, key: each });
  }
  const olderByKey = new Map(older.map((item) => [key(item), item]));
  newer.forEach((item, index) => {
    const was = olderByKey.get(key(item));
    if (was === undefined) operations.push({ op: 'insert', collection, index, item });
    else if (!(kept?.(was, item) ?? false) && !sameExactly(was, item)) {
      operations.push({ op: 'replace', collection, item });
    }
  });
}

function listOf(order: Record<Id, Id[]> | undefined, container: Id): Id[] {
  return order !== undefined && Object.hasOwn(order, container) ? (order[container] ?? []) : [];
}

/** Whether two values are the same JSON exactly, key order aside and a key left undefined as none. */
function sameExactly(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((each, at) => sameExactly(each, b[at]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter((each) => left[each] !== undefined);
  const others = Object.keys(right).filter((each) => right[each] !== undefined);
  if (keys.length !== others.length) return false;
  return keys.every((each) => Object.hasOwn(right, each) && sameExactly(left[each], right[each]));
}
