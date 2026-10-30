/**
 * Merging two edits of one project file by id (ADR 0072): a three-way merge of each item, value by
 * value, against their common ancestor. What one side changed alone takes that side's value; what
 * both changed alike takes it; what both changed differently is a conflict, kept in the file as data
 * with the other choice. Maps merge by key, sets as sets, and lists of things with ids by id, in ours'
 * order with what theirs added after what it follows there.
 *
 * A merged file keeps the rules one file can tell, by keeping what loses least: a deletion that meets
 * what needs it is not applied; an item removed on one side and changed on the other keeps the change;
 * two additions that close a containment cycle keep ours. Each such choice is a conflict too.
 */
import type {
  ConflictReason,
  ConflictSides,
  Element,
  FileConflict,
  FileContentByKind,
  FileKind,
  Id,
  JsonValue,
  ModelFile,
  PackageFile,
  Relation,
  ViewFile,
} from '@visual-anything/schema';
import { positionKey } from '../operations';
import { sameValue, withoutKeys } from './items';

/** One value a merge of an item could not join. */
export interface ItemConflict {
  /** Where it lies inside the item; empty for the whole item. */
  path: string[];
  why: ConflictReason;
  /** Whose value stays in place. */
  kept: 'ours' | 'theirs';
  /** The other side's value; absent when that side removed it. */
  other?: JsonValue;
  /** The ancestor's value; absent when it had none. */
  base?: JsonValue;
}

/**
 * How a list inside an item merges where it is not a list of things with ids: as a set of values, or
 * as things keyed by another of their keys; either sorted again, where the file keeps it sorted.
 */
export type ListRule =
  | { kind: 'set'; sorted?: boolean }
  | { kind: 'keyed'; key: (item: JsonValue) => string; sorted?: boolean };

/** How a merge reads an item: whose value stays where both changed, and how its lists merge. */
export interface MergePolicy {
  /** Whose value stays in place in a conflict: ours for git's merges; a proposal chooses its own. */
  kept: 'ours' | 'theirs';
  /** How the list at this path, inside the item, merges, where it is not a list of things with ids. */
  lists?: (path: readonly string[]) => ListRule | undefined;
  /**
   * Whether the kept side's removal stays where the other side changed what it removed, as in a
   * proposal, whose removals wait for the person's choice like its other changes (ADR 0073). Without
   * it, the change stays, which loses least.
   */
  keptWins?: boolean;
}

/** An item merged: its value, absent when it was removed, and what could not be joined. */
export interface MergedItem {
  value: JsonValue | undefined;
  conflicts: ItemConflict[];
}

/** The three-way merge of one item: its ancestor's value, ours and theirs, absent where there is none. */
export function mergeItem(
  base: JsonValue | undefined,
  ours: JsonValue | undefined,
  theirs: JsonValue | undefined,
  policy: MergePolicy,
): MergedItem {
  const conflicts: ItemConflict[] = [];
  const value = mergeValue(base, ours, theirs, [], policy, conflicts);
  return { value, conflicts };
}

function mergeValue(
  base: JsonValue | undefined,
  ours: JsonValue | undefined,
  theirs: JsonValue | undefined,
  path: string[],
  policy: MergePolicy,
  conflicts: ItemConflict[],
): JsonValue | undefined {
  if (sameValue(ours, theirs)) return ours;
  if (sameValue(base, ours)) return theirs;
  if (sameValue(base, theirs)) return ours;
  const conflict = (why: ConflictReason, kept: 'ours' | 'theirs') => {
    const other = kept === 'ours' ? theirs : ours;
    conflicts.push({
      path,
      why,
      kept,
      ...(other === undefined ? {} : { other }),
      ...(base === undefined ? {} : { base }),
    });
    return kept === 'ours' ? ours : theirs;
  };
  // Removed on one side and changed on the other: the change stays, unless the kept side removed it
  // and wins.
  const removalStays = (side: 'ours' | 'theirs') =>
    policy.keptWins === true && policy.kept === side;
  if (ours === undefined) {
    return conflict('removed-and-changed', removalStays('ours') ? 'ours' : 'theirs');
  }
  if (theirs === undefined) {
    return conflict('removed-and-changed', removalStays('theirs') ? 'theirs' : 'ours');
  }
  // Both added the item, differently.
  if (base === undefined && path.length === 0) return conflict('both-added', policy.kept);
  if (isObject(ours) && isObject(theirs) && (base === undefined || isObject(base))) {
    const older = base ?? {};
    const merged: Record<string, JsonValue> = {};
    const keys = [
      ...Object.keys(ours),
      ...Object.keys(theirs).filter((key) => !Object.hasOwn(ours, key)),
    ];
    for (const key of keys) {
      const value = mergeValue(
        older[key],
        ours[key],
        theirs[key],
        [...path, key],
        policy,
        conflicts,
      );
      if (value !== undefined) merged[key] = value;
    }
    return merged;
  }
  if (Array.isArray(ours) && Array.isArray(theirs) && (base === undefined || Array.isArray(base))) {
    const rule = policy.lists?.(path);
    if (rule?.kind === 'set') {
      const merged = mergeSet(base ?? [], ours, theirs);
      return rule.sorted === true
        ? merged.sort((a, b) => byCodeUnits(keyText(a), keyText(b)))
        : merged;
    }
    if (rule?.kind === 'keyed') {
      const merged = mergeList(base ?? [], ours, theirs, rule.key, path, policy, conflicts);
      return rule.sorted === true
        ? merged.sort((a, b) => byCodeUnits(rule.key(a), rule.key(b)))
        : merged;
    }
    if (keyed(ours) && keyed(theirs) && (base === undefined || keyed(base))) {
      return mergeList(
        base ?? [],
        ours,
        theirs,
        (each) => (each as { id: Id }).id,
        path,
        policy,
        conflicts,
      );
    }
  }
  return conflict('both-changed', policy.kept);
}

/** Two edits of a set: what either added, less what either removed, in ours' order then theirs'. */
function mergeSet(base: JsonValue[], ours: JsonValue[], theirs: JsonValue[]): JsonValue[] {
  const has = (list: JsonValue[], value: JsonValue) => list.some((each) => sameValue(each, value));
  const removed = (value: JsonValue) =>
    has(base, value) && (!has(ours, value) || !has(theirs, value));
  const merged = ours.filter((each) => !removed(each));
  for (const each of theirs) if (!removed(each) && !has(merged, each)) merged.push(each);
  return merged;
}

/**
 * Two edits of a list of things with keys, merged thing by thing: in ours' order, what theirs added
 * after what it follows in theirs. Both reordering it differently is a conflict of its order, which
 * holds the keys in the other side's order and the ancestor's, not the things again.
 */
function mergeList(
  base: readonly JsonValue[],
  ours: readonly JsonValue[],
  theirs: readonly JsonValue[],
  keyOf: (item: JsonValue) => string,
  path: string[],
  policy: MergePolicy,
  conflicts: ItemConflict[],
  itemPath: (key: string) => string[] = (key) => [...path, key],
): JsonValue[] {
  const older = new Map(base.map((each) => [keyOf(each), each]));
  const ourItems = new Map(ours.map((each) => [keyOf(each), each]));
  const theirItems = new Map(theirs.map((each) => [keyOf(each), each]));
  const merged = new Map<string, JsonValue>();
  for (const key of new Set([...ourItems.keys(), ...theirItems.keys(), ...older.keys()])) {
    const value = mergeValue(
      older.get(key),
      ourItems.get(key),
      theirItems.get(key),
      itemPath(key),
      policy,
      conflicts,
    );
    if (value !== undefined) merged.set(key, value);
  }
  const order = mergedOrder(base.map(keyOf), ours.map(keyOf), theirs.map(keyOf), (key) =>
    merged.has(key),
  );
  if (order.conflict) {
    conflicts.push({
      path,
      why: 'order',
      kept: policy.kept,
      other: (policy.kept === 'ours' ? theirs : ours).map(keyOf),
      base: base.map(keyOf),
    });
  }
  const keys =
    policy.kept === 'ours' || !order.conflict
      ? order.keys
      : mergedOrder(base.map(keyOf), theirs.map(keyOf), ours.map(keyOf), (key) => merged.has(key))
          .keys;
  return keys.map((key) => merged.get(key) as JsonValue);
}

/**
 * The order of a merged list: ours' order, with what theirs added after what precedes it in theirs;
 * a conflict when both sides moved what they share differently from the ancestor.
 */
function mergedOrder(
  base: readonly string[],
  ours: readonly string[],
  theirs: readonly string[],
  kept: (key: string) => boolean,
): { keys: string[]; conflict: boolean } {
  const inOurs = new Set(ours);
  const inTheirs = new Set(theirs);
  const inBase = new Set(base);
  const shared = (list: readonly string[], ...others: ReadonlySet<string>[]) =>
    list.filter((key) => others.every((set) => set.has(key)));
  const baseOrder = shared(base, inOurs, inTheirs);
  const ourOrder = shared(ours, inTheirs, inBase);
  const theirOrder = shared(theirs, inOurs, inBase);
  const same = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((key, at) => key === b[at]);
  const conflict =
    !same(ourOrder, theirOrder) && !same(ourOrder, baseOrder) && !same(theirOrder, baseOrder);
  // Theirs reordered alone: what both keep goes in theirs' order.
  const leading =
    !conflict && same(ourOrder, baseOrder) && !same(theirOrder, baseOrder) ? theirs : ours;
  const following = leading === ours ? theirs : ours;
  const keys = leading.filter(kept);
  const placed = new Set(keys);
  following.forEach((key, at) => {
    if (placed.has(key) || !kept(key)) return;
    // After the nearest thing before it, in its own list, that the merged list holds.
    let after = -1;
    for (let back = at - 1; back >= 0; back--) {
      const index = keys.indexOf(following[back] as string);
      if (index >= 0) {
        after = index;
        break;
      }
    }
    keys.splice(after + 1, 0, key);
    placed.add(key);
  });
  return { keys, conflict };
}

// ——— Files ———

/** What a merge of one file needs to know beyond the three versions. */
export interface FileMergeOptions {
  /** The names git gave the two sides, kept with each conflict. */
  sides?: ConflictSides;
  /** Whose value stays in place in a conflict; ours unless said. */
  kept?: 'ours' | 'theirs';
  /** Whether the kept side's removals stay over the other side's changes too, as in a proposal. */
  keptWins?: boolean;
  /**
   * The relation types that nest, which a model's merge reads to keep containment without a cycle.
   * A model file alone does not say which nest, so without them no cycle is looked for.
   */
  nesting?: ReadonlySet<Id>;
}

/** A file merged: what it holds now, its conflicts included, and the conflicts this merge made. */
export interface MergedFile<K extends FileKind> {
  file: FileContentByKind[K];
  conflicts: FileConflict[];
}

/**
 * Merges two edits of a project file of one kind against their common ancestor, which is empty for a
 * file both sides added. The file it gives is a valid file of its kind, its conflicts in `conflicts`.
 */
export function mergeFile<K extends FileKind>(
  kind: K,
  base: FileContentByKind[K] | undefined,
  ours: FileContentByKind[K],
  theirs: FileContentByKind[K],
  options: FileMergeOptions = {},
): MergedFile<K> {
  const policy: MergePolicy = {
    kept: options.kept ?? 'ours',
    lists: listsOf(kind),
    ...(options.keptWins === true ? { keptWins: true } : {}),
  };
  const found: { item: string; conflict: ItemConflict }[] = [];
  const add = (item: string) => (conflict: ItemConflict) => found.push({ item, conflict });
  let file: unknown;
  switch (kind) {
    case 'project':
      file = mergeWhole('project', base, ours, theirs, policy, add);
      break;
    case 'model':
      file = mergeModel(
        base as ModelFile | undefined,
        ours as ModelFile,
        theirs as ModelFile,
        policy,
        add,
        options.nesting,
      );
      break;
    case 'package':
      file = mergePackage(
        base as PackageFile | undefined,
        ours as PackageFile,
        theirs as PackageFile,
        policy,
        add,
      );
      break;
    case 'view':
      file = mergeViewFile(
        base as ViewFile | undefined,
        ours as ViewFile,
        theirs as ViewFile,
        policy,
        add,
      );
      break;
    case 'scenario':
      file = mergeWithSteps('scenario', 'step', 'steps', base, ours, theirs, policy, add);
      break;
    case 'tour':
      file = mergeWithSteps('tour', 'tour-step', 'steps', base, ours, theirs, policy, add);
      break;
    case 'comment':
      file = mergeWithSteps('thread', 'comment', 'comments', base, ours, theirs, policy, add);
      break;
  }
  // The conflicts the two sides held already merge by id, as any list does; this merge's come after.
  const earlier = mergeList(
    ((base as { conflicts?: FileConflict[] } | undefined)?.conflicts ??
      []) as unknown as JsonValue[],
    ((ours as { conflicts?: FileConflict[] }).conflicts ?? []) as unknown as JsonValue[],
    ((theirs as { conflicts?: FileConflict[] }).conflicts ?? []) as unknown as JsonValue[],
    (each) => (each as { id: Id }).id,
    [],
    { kept: policy.kept },
    [],
  ) as unknown as FileConflict[];
  const taken = new Set(earlier.map((each) => each.id));
  let next = 1;
  const made = found.map(({ item, conflict }): FileConflict => {
    while (taken.has(`conflict-${next}`)) next += 1;
    const id = `conflict-${next}`;
    taken.add(id);
    return {
      id,
      item,
      path: conflict.path,
      why: conflict.why,
      kept: conflict.kept,
      ...(conflict.other === undefined ? {} : { other: conflict.other }),
      ...(conflict.base === undefined ? {} : { base: conflict.base }),
      ...(options.sides === undefined ? {} : { sides: options.sides }),
    };
  });
  const all = [...earlier, ...made];
  const result = { ...(file as object) } as { conflicts?: FileConflict[] };
  if (all.length > 0) result.conflicts = all;
  else delete result.conflicts;
  return { file: result as unknown as FileContentByKind[K], conflicts: made };
}

type Collect = (item: string) => (conflict: ItemConflict) => void;

/** The lists inside each kind's items that merge as sets, or keyed by more than an id (ADR 0072). */
function listsOf(kind: FileKind): (path: readonly string[]) => ListRule | undefined {
  const only = (path: readonly string[], key: string) => path.length === 1 && path[0] === key;
  switch (kind) {
    case 'project':
      return (path) => (only(path, 'packages') ? { kind: 'set' } : undefined);
    case 'view':
      return (path) => {
        if (only(path, 'nestingRelationTypes')) return { kind: 'set' };
        // The file keeps these sorted, as the commands that set them do.
        if (only(path, 'collapsed')) return { kind: 'set', sorted: true };
        if (
          path.length === 2 &&
          path[0] === 'scope' &&
          (path[1] === 'added' || path[1] === 'leftOut')
        ) {
          return { kind: 'set', sorted: true };
        }
        if (only(path, 'relationTypesLeftOut')) {
          return {
            kind: 'keyed',
            key: (each) => keyText((each as { relationType?: JsonValue }).relationType),
            sorted: true,
          };
        }
        return undefined;
      };
    default:
      return () => undefined;
  }
}

/** A value as text to key or sort it by. */
function keyText(value: JsonValue | undefined): string {
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
}

function byCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A file merged as one item, its conflicts aside. */
function mergeWhole(
  item: string,
  base: unknown,
  ours: unknown,
  theirs: unknown,
  policy: MergePolicy,
  add: Collect,
): JsonValue {
  const merged = mergeItem(
    withoutConflicts(base),
    withoutConflicts(ours),
    withoutConflicts(theirs),
    policy,
  );
  merged.conflicts.forEach(add(item));
  return merged.value ?? (withoutConflicts(ours) as JsonValue);
}

/** A file whose own properties are one item and whose steps or comments are items of their own. */
function mergeWithSteps(
  self: string,
  each: string,
  field: 'steps' | 'comments',
  base: unknown,
  ours: unknown,
  theirs: unknown,
  policy: MergePolicy,
  add: Collect,
): JsonValue {
  const split = (file: unknown) => {
    if (file === undefined) return { props: undefined, list: [] as JsonValue[] };
    const { [field]: list, ...props } = withoutConflicts(file) as Record<string, JsonValue>;
    return { props: props as JsonValue, list: (list ?? []) as JsonValue[] };
  };
  const older = split(base);
  const mine = split(ours);
  const yours = split(theirs);
  const props = mergeItem(older.props, mine.props, yours.props, policy);
  props.conflicts.forEach(add(self));
  // Each step's conflicts are about that step; the order of the steps is about the file's own item.
  const list = mergeItems(
    older.list,
    mine.list,
    yours.list,
    (one) => (one as { id: Id }).id,
    (key) => `${each}:${key}`,
    { item: self, path: [field] },
    policy,
    add,
  );
  return { ...(props.value as Record<string, JsonValue>), [field]: list };
}

/**
 * The conflicts of each thing of a list with ids, by its key, worked out thing by thing as
 * `mergeList` merges them, so that a conflict names the thing it is about.
 */
function attributeListConflicts(
  base: readonly JsonValue[],
  ours: readonly JsonValue[],
  theirs: readonly JsonValue[],
  policy: MergePolicy,
  report: (key: string, conflict: ItemConflict) => void,
  keyOf: (item: JsonValue) => string = (item) => (item as { id: Id }).id,
): void {
  const older = new Map(base.map((each) => [keyOf(each), each]));
  const mine = new Map(ours.map((each) => [keyOf(each), each]));
  const yours = new Map(theirs.map((each) => [keyOf(each), each]));
  for (const key of new Set([...mine.keys(), ...yours.keys(), ...older.keys()])) {
    const merged = mergeItem(older.get(key), mine.get(key), yours.get(key), policy);
    for (const conflict of merged.conflicts) report(key, conflict);
  }
}

/** A list of a file's items, merged item by item, each item's conflicts named by its key. */
function mergeItems<T>(
  base: readonly T[],
  ours: readonly T[],
  theirs: readonly T[],
  keyOf: (item: T) => string,
  itemOf: (key: string) => string,
  /** The item, and the path in it, that a conflict of the list's order is about; none to keep ours'. */
  orderOf: { item: string; path: string[] } | undefined,
  policy: MergePolicy,
  add: Collect,
): T[] {
  const found: ItemConflict[] = [];
  const list = mergeList(
    base as unknown as JsonValue[],
    ours as unknown as JsonValue[],
    theirs as unknown as JsonValue[],
    (each) => keyOf(each as unknown as T),
    [],
    policy,
    found,
    () => [],
  ) as unknown as T[];
  if (orderOf) {
    for (const conflict of found) {
      if (conflict.why === 'order') add(orderOf.item)({ ...conflict, path: orderOf.path });
    }
  }
  attributeListConflicts(
    base as unknown as JsonValue[],
    ours as unknown as JsonValue[],
    theirs as unknown as JsonValue[],
    policy,
    (key, conflict) => add(itemOf(key))(conflict),
    (each) => keyOf(each as unknown as T),
  );
  return list;
}

function mergePackage(
  base: PackageFile | undefined,
  ours: PackageFile,
  theirs: PackageFile,
  policy: MergePolicy,
  add: Collect,
): PackageFile {
  const split = (file: PackageFile | undefined) => {
    if (!file) return undefined;
    const { components, relationTypes, images, solids } = file;
    const props = withoutKeys(file, 'components', 'relationTypes', 'images', 'solids', 'conflicts');
    return { components, relationTypes, images: images ?? [], solids: solids ?? [], props };
  };
  const older = split(base);
  const mine = split(ours) as NonNullable<ReturnType<typeof split>>;
  const yours = split(theirs) as NonNullable<ReturnType<typeof split>>;
  const props = mergeItem(
    older?.props as unknown as JsonValue | undefined,
    mine.props as unknown as JsonValue,
    yours.props as unknown as JsonValue,
    policy,
  );
  props.conflicts.forEach(add('package'));
  const byId = (each: { id: Id }) => each.id;
  const images = mergeItems(
    older?.images ?? [],
    mine.images,
    yours.images,
    byId,
    (id) => `image:${id}`,
    { item: 'package', path: ['images'] },
    policy,
    add,
  );
  // Solids merge by id as images do (ADR 0075); their files never conflict, since equal bytes have
  // one name.
  const solids = mergeItems(
    older?.solids ?? [],
    mine.solids,
    yours.solids,
    byId,
    (id) => `solid:${id}`,
    { item: 'package', path: ['solids'] },
    policy,
    add,
  );
  return {
    ...(props.value as unknown as Omit<PackageFile, 'components' | 'relationTypes'>),
    components: mergeItems(
      older?.components ?? [],
      mine.components,
      yours.components,
      byId,
      (id) => `component:${id}`,
      { item: 'package', path: ['components'] },
      policy,
      add,
    ),
    relationTypes: mergeItems(
      older?.relationTypes ?? [],
      mine.relationTypes,
      yours.relationTypes,
      byId,
      (id) => `relation-type:${id}`,
      { item: 'package', path: ['relationTypes'] },
      policy,
      add,
    ),
    ...(images.length > 0 || ours.images !== undefined || theirs.images !== undefined
      ? { images }
      : {}),
    ...(solids.length > 0 || ours.solids !== undefined || theirs.solids !== undefined
      ? { solids }
      : {}),
  };
}

function mergeViewFile(
  base: ViewFile | undefined,
  ours: ViewFile,
  theirs: ViewFile,
  policy: MergePolicy,
  add: Collect,
): ViewFile {
  const split = (file: ViewFile | undefined) => {
    if (!file) return undefined;
    const { positions, freeShapes, stackingOrder, routes } = file;
    const props = withoutKeys(
      file,
      'positions',
      'freeShapes',
      'stackingOrder',
      'routes',
      'conflicts',
    );
    return {
      positions,
      freeShapes,
      stackingOrder: stackingOrder ?? {},
      routes: routes ?? {},
      props,
    };
  };
  const older = split(base);
  const mine = split(ours) as NonNullable<ReturnType<typeof split>>;
  const yours = split(theirs) as NonNullable<ReturnType<typeof split>>;
  const props = mergeItem(
    older?.props as unknown as JsonValue | undefined,
    mine.props as unknown as JsonValue,
    yours.props as unknown as JsonValue,
    policy,
  );
  props.conflicts.forEach(add('view'));
  const positions = mergeItems(
    older?.positions ?? [],
    mine.positions,
    yours.positions,
    (each) => positionKey(each),
    (key) => `position:${key}`,
    { item: 'view', path: ['positions'] },
    policy,
    add,
  );
  const freeShapes = mergeItems(
    older?.freeShapes ?? [],
    mine.freeShapes,
    yours.freeShapes,
    (each) => each.id,
    (id) => `free-shape:${id}`,
    { item: 'view', path: ['freeShapes'] },
    policy,
    add,
  );
  // Stacking lists, one item for each container, merge as ordered lists of bare ids.
  const stackingOrder: Record<Id, Id[]> = {};
  const containers = [
    ...Object.keys(mine.stackingOrder),
    ...Object.keys(yours.stackingOrder).filter((key) => !Object.hasOwn(mine.stackingOrder, key)),
  ];
  for (const container of new Set([...containers, ...Object.keys(older?.stackingOrder ?? {})])) {
    const get = (order: Record<Id, Id[]> | undefined) =>
      order !== undefined && Object.hasOwn(order, container) ? order[container] : undefined;
    const was = get(older?.stackingOrder);
    const mineList = get(mine.stackingOrder);
    const yoursList = get(yours.stackingOrder);
    const found: ItemConflict[] = [];
    let list: Id[] | undefined;
    if (mineList === undefined || yoursList === undefined) {
      const merged = mergeItem(was, mineList, yoursList, policy);
      merged.conflicts.forEach(add(`stacking:${container}`));
      list = merged.value as Id[] | undefined;
    } else {
      list = mergeList(
        was ?? [],
        mineList,
        yoursList,
        (each) => each as string,
        [],
        policy,
        found,
        () => [],
      ) as Id[];
      found.forEach(add(`stacking:${container}`));
    }
    if (list !== undefined && list.length > 0) stackingOrder[container] = list;
  }
  // Routes, one item for each relation.
  const routes: Record<Id, JsonValue> = {};
  const relations = [
    ...Object.keys(mine.routes),
    ...Object.keys(yours.routes).filter((key) => !Object.hasOwn(mine.routes, key)),
  ];
  for (const relation of new Set([...relations, ...Object.keys(older?.routes ?? {})])) {
    const get = (map: Record<Id, unknown> | undefined) =>
      map !== undefined && Object.hasOwn(map, relation) ? (map[relation] as JsonValue) : undefined;
    const merged = mergeItem(get(older?.routes), get(mine.routes), get(yours.routes), policy);
    merged.conflicts.forEach(add(`route:${relation}`));
    if (merged.value !== undefined) routes[relation] = merged.value;
  }
  const view = {
    ...(props.value as unknown as Omit<ViewFile, 'positions' | 'freeShapes'>),
    positions,
    freeShapes,
  };
  if (Object.keys(stackingOrder).length > 0) view.stackingOrder = stackingOrder;
  if (Object.keys(routes).length > 0) view.routes = routes as ViewFile['routes'];
  return view;
}

/**
 * The model merged, keeping its rules: every relation ends on something the model holds, an id names
 * one thing, and containment forms no cycle when the nesting relation types are known.
 */
function mergeModel(
  base: ModelFile | undefined,
  ours: ModelFile,
  theirs: ModelFile,
  policy: MergePolicy,
  add: Collect,
  nesting: ReadonlySet<Id> | undefined,
): ModelFile {
  const world = mergeItem(
    base?.world as unknown as JsonValue | undefined,
    ours.world as unknown as JsonValue,
    theirs.world as unknown as JsonValue,
    policy,
  );
  world.conflicts.forEach(add('world'));
  const byId = (each: { id: Id }) => each.id;
  const elements = mergeItems(
    base?.elements ?? [],
    ours.elements,
    theirs.elements,
    byId,
    (id) => `element:${id}`,
    { item: 'order', path: [] },
    policy,
    add,
  );
  let relations = mergeItems(
    base?.relations ?? [],
    ours.relations,
    theirs.relations,
    byId,
    (id) => `relation:${id}`,
    undefined,
    policy,
    add,
  );

  const olderElements = new Map((base?.elements ?? []).map((each) => [each.id, each]));
  const olderRelations = new Map((base?.relations ?? []).map((each) => [each.id, each]));
  const sides = [ours, theirs];
  const findOn = <T extends { id: Id }>(list: (file: ModelFile) => readonly T[], id: Id) =>
    sides
      .map(list)
      .flat()
      .find((each) => each.id === id) ?? undefined;

  // What names what is gone: a relation the other side added or changed keeps the end its side
  // removed, which is that removal's conflict; one left as it was goes with its end, as delete takes
  // the relations that end on what it deletes. What is kept for what needs it is needed in turn, so
  // each thing comes back once at most and the loop ends.
  const merged = { elements: [...elements], relations: [...relations] };
  const restored = new Set<Id>();
  const needed = new Set<Id>();
  const worldId = ((world.value ?? ours.world) as unknown as Element).id;
  const keptSide = policy.kept === 'ours' ? ours : theirs;
  const keptIds = new Set([
    keptSide.world.id,
    ...keptSide.elements.map(byId),
    ...keptSide.relations.map(byId),
  ]);
  for (;;) {
    const ids = new Set([worldId, ...merged.elements.map(byId), ...merged.relations.map(byId)]);
    let changed = false;
    const kept: Relation[] = [];
    for (const relation of merged.relations) {
      const missing = [relation.from, relation.to].filter((end) => !ids.has(end));
      if (missing.length === 0) {
        kept.push(relation);
        continue;
      }
      const unchanged =
        !needed.has(relation.id) && sameValue(olderRelations.get(relation.id), relation);
      // Where the kept side wins, what it removed takes the other side's relations that end on it
      // too, as delete takes them.
      const takenByKept = policy.keptWins === true && missing.some((end) => !keptIds.has(end));
      if (unchanged || takenByKept) {
        changed = true;
        continue;
      }
      for (const end of missing) {
        const element = olderElements.get(end) ?? findOn((file) => file.elements, end);
        const endRelation = olderRelations.get(end) ?? findOn((file) => file.relations, end);
        if (element && !merged.elements.some((each) => each.id === end)) {
          merged.elements.push(element);
          restored.add(end);
          add(`element:${end}`)({
            path: [],
            why: 'needs-removed',
            kept: policy.kept,
            base: element as unknown as JsonValue,
          });
          changed = true;
        } else if (
          endRelation &&
          !needed.has(end) &&
          !merged.relations.some((each) => each.id === end)
        ) {
          kept.push(endRelation);
          needed.add(end);
          add(`relation:${end}`)({
            path: [],
            why: 'needs-removed',
            kept: policy.kept,
            base: endRelation as unknown as JsonValue,
          });
          changed = true;
        }
      }
      kept.push(relation);
    }
    merged.relations = kept;
    if (!changed) break;
  }
  // Restored elements go back after what precedes them where ours, theirs or the ancestor had them.
  if (restored.size > 0) {
    const placed = merged.elements.filter((each) => !restored.has(each.id));
    for (const element of merged.elements.filter((each) => restored.has(each.id))) {
      const source =
        [ours.elements, theirs.elements, base?.elements ?? []].find((list) =>
          list.some((each) => each.id === element.id),
        ) ?? [];
      let after = -1;
      for (let back = source.findIndex((each) => each.id === element.id) - 1; back >= 0; back--) {
        after = placed.findIndex((each) => each.id === source[back]?.id);
        if (after >= 0) break;
      }
      placed.splice(after + 1, 0, element);
    }
    merged.elements = placed;
  }

  // An id names one thing: an element and a relation with one id keep ours'.
  const elementIds = new Set(merged.elements.map(byId));
  relations = merged.relations.filter((relation) => {
    if (!elementIds.has(relation.id)) return true;
    add(`relation:${relation.id}`)({
      path: [],
      why: 'both-added',
      kept: policy.kept,
      other: relation as unknown as JsonValue,
    });
    return false;
  });

  // Containment without a cycle: an addition of theirs that closes one is not applied.
  if (nesting) {
    for (;;) {
      const cycle = nestingCycle(relations, nesting);
      if (!cycle) break;
      const added =
        cycle.find(
          (relation) =>
            !olderRelations.has(relation.id) &&
            !(policy.kept === 'ours' ? ours : theirs).relations.some(
              (each) => each.id === relation.id,
            ),
        ) ??
        // Where the kept side wins, none of its relations goes: a cycle that the other side closed
        // by another change, such as of a definition, stays for its check to refuse.
        (policy.keptWins === true ? undefined : cycle[cycle.length - 1]);
      if (!added) break;
      relations = relations.filter((each) => each.id !== added.id);
      add(`relation:${added.id}`)({
        path: [],
        why: 'cycle',
        kept: policy.kept,
        other: added as unknown as JsonValue,
      });
    }
  }
  return {
    world: (world.value ?? ours.world) as unknown as Element,
    elements: merged.elements,
    relations,
  };
}

/** A cycle of nesting relations, from an element through its containers back to it, if there is one. */
function nestingCycle(
  relations: readonly Relation[],
  nesting: ReadonlySet<Id>,
): Relation[] | undefined {
  const out = new Map<Id, Relation[]>();
  for (const relation of relations) {
    if (!nesting.has(relation.relationType)) continue;
    out.set(relation.from, [...(out.get(relation.from) ?? []), relation]);
  }
  const state = new Map<Id, 'open' | 'done'>();
  const trail: Relation[] = [];
  const visit = (id: Id): Relation[] | undefined => {
    state.set(id, 'open');
    for (const relation of out.get(id) ?? []) {
      const next = state.get(relation.to);
      trail.push(relation);
      if (next === 'open') {
        const start = trail.findIndex((each) => each.from === relation.to);
        return trail.slice(start);
      }
      if (next === undefined) {
        const found = visit(relation.to);
        if (found) return found;
      }
      trail.pop();
    }
    state.set(id, 'done');
    return undefined;
  };
  for (const id of out.keys()) {
    if (state.has(id)) continue;
    const found = visit(id);
    if (found) return found;
  }
  return undefined;
}

function withoutConflicts(file: unknown): JsonValue | undefined {
  if (file === undefined) return undefined;
  return withoutKeys(file as Record<string, JsonValue>, 'conflicts');
}

function isObject(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function keyed(list: readonly JsonValue[]): boolean {
  const ids = new Set<string>();
  for (const each of list) {
    if (!isObject(each) || typeof each.id !== 'string' || ids.has(each.id)) return false;
    ids.add(each.id);
  }
  return true;
}
