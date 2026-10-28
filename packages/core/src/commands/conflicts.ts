/**
 * Resolving the conflicts a merge left in a file (ADR 0072), one action of the person's or Claude's:
 * keeping what the file holds takes the conflict away; taking the other choice sets that value, or
 * removes the item as the delete command would, or puts a list in the other side's order. A choice
 * that would break a rule is refused, naming what needs what, so that those are resolved first. With
 * a file's last conflict, its `conflicts` list goes.
 */
import type { FileConflict, Id, JsonValue } from '@visual-anything/schema';
import { checkProject } from '../check';
import { keyOf, positionKey, type Collection, type ConflictFile, type Item } from '../operations';
import { Rejection, reject, requireList, type Draft } from './draft';
import { withoutKeys } from '../versions/items';
import { deleteTargets } from './model';
import type { ResolveConflictsCommand } from './types';

export function resolveConflicts(draft: Draft, command: ResolveConflictsCommand): string {
  const file = checkedFile(command.file);
  const held = conflictsIn(draft, file);
  if (held.length === 0)
    reject('invalid-command', `There is no conflict in ${describe(draft, file)}.`);
  const resolutions = requireList(command.resolutions, 'The resolutions');
  if (resolutions.length === 0) reject('invalid-command', 'Resolving takes one conflict at least.');
  const resolved = new Set<Id>();
  // The label names the file as it was, before a choice renames it.
  const where = describe(draft, file);
  const before = new Set(checkProject(draft.state).errors.map((each) => each.message));
  for (const resolution of resolutions) {
    if (typeof resolution !== 'object' || resolution === null) {
      reject('invalid-command', 'A resolution names a conflict and what to take: kept or other.');
    }
    const conflict = held.find((each) => each.id === resolution.conflict);
    if (!conflict) {
      reject(
        'invalid-command',
        `There is no conflict "${String(resolution.conflict)}" in ${describe(draft, file)}.`,
      );
    }
    if (resolved.has(conflict.id)) {
      reject('invalid-command', `The conflict "${conflict.id}" is resolved twice.`);
    }
    if (resolution.take !== 'kept' && resolution.take !== 'other') {
      reject(
        'invalid-command',
        'A conflict is resolved by taking what is kept, or the other choice.',
      );
    }
    if (resolution.take === 'other') takeOther(draft, file, conflict);
    resolved.add(conflict.id);
  }
  const broken = checkProject(draft.state).errors.filter((each) => !before.has(each.message));
  if (broken.length > 0) throw new Rejection(broken);
  const left = held.filter((each) => !resolved.has(each.id));
  draft.apply({ op: 'set-conflicts', file, ...(left.length > 0 ? { conflicts: left } : {}) });
  return resolved.size === 1
    ? `Resolve a conflict in ${where}`
    : `Resolve ${resolved.size} conflicts in ${where}`;
}

function checkedFile(file: unknown): ConflictFile {
  if (typeof file !== 'object' || file === null) {
    reject('invalid-command', 'A file is named by its kind, and its id for a file in a folder.');
  }
  const { kind, id } = file as { kind?: unknown; id?: unknown };
  if (kind === 'project' || kind === 'model') return { kind };
  if (
    (kind === 'package' ||
      kind === 'view' ||
      kind === 'scenario' ||
      kind === 'tour' ||
      kind === 'comment') &&
    typeof id === 'string'
  ) {
    return { kind, id };
  }
  return reject(
    'invalid-command',
    'A file is named by its kind, and its id for a file in a folder.',
  );
}

/** The conflicts a file holds now. */
function conflictsIn(draft: Draft, file: ConflictFile): FileConflict[] {
  const { state } = draft;
  const of = (value: unknown) =>
    (value as { conflicts?: FileConflict[] } | undefined)?.conflicts ?? [];
  switch (file.kind) {
    case 'project':
      return of(state.project);
    case 'model':
      return of(state.model);
    case 'package':
      return of(state.packages.find((each) => each.id === file.id));
    case 'view':
      return of(state.views.find((each) => each.id === file.id));
    case 'scenario':
      return of(state.scenarios.find((each) => each.id === file.id));
    case 'tour':
      return of(state.tours.find((each) => each.id === file.id));
    case 'comment':
      return of(state.comments.find((each) => each.id === file.id));
  }
}

/** How a label or a refusal names a file. */
function describe(draft: Draft, file: ConflictFile): string {
  const named = (list: readonly { id: Id; name?: string }[], what: string) => {
    const found = list.find((each) => 'id' in file && each.id === file.id);
    return `the ${what} "${found?.name ?? ('id' in file ? file.id : '')}"`;
  };
  switch (file.kind) {
    case 'project':
      return 'the project file';
    case 'model':
      return 'the model';
    case 'package':
      return named(draft.state.packages, 'package');
    case 'view':
      return named(draft.state.views, 'view');
    case 'scenario':
      return named(draft.state.scenarios, 'scenario');
    case 'tour':
      return named(draft.state.tours, 'tour');
    case 'comment':
      return `the thread "${file.id}"`;
  }
}

/** Takes a conflict's other choice: its value at its path, or its removal, or its list's order. */
function takeOther(draft: Draft, file: ConflictFile, conflict: FileConflict): void {
  const [kind, ...rest] = conflict.item.split(':');
  const key = rest.join(':');
  const { state } = draft;
  const replaced = (current: JsonValue | undefined): JsonValue | undefined =>
    conflict.why === 'order'
      ? reordered(current, conflict.path, conflict.other)
      : conflict.path.length === 0
        ? conflict.other
        : setAt(current ?? {}, conflict.path, conflict.other);
  const inList = (collection: Collection, items: readonly Item[], itemKey: string) => {
    const current = items.find((each) => keyOf(collection, each) === itemKey);
    const next = replaced(current as unknown as JsonValue | undefined);
    if (next === undefined) {
      if (current !== undefined) draft.apply({ op: 'remove', collection, key: itemKey });
      return;
    }
    if (current === undefined) {
      draft.apply({ op: 'insert', collection, index: items.length, item: next as unknown as Item });
    } else draft.apply({ op: 'replace', collection, item: next as unknown as Item });
  };
  switch (file.kind) {
    case 'project': {
      const project = withoutKeys(state.project, 'conflicts');
      const next = replaced(project as unknown as JsonValue);
      if (next !== undefined)
        draft.apply({ op: 'set-project', project: next as unknown as typeof state.project });
      return;
    }
    case 'model': {
      if (kind === 'world') {
        const next = replaced(state.model.world as unknown as JsonValue);
        if (next !== undefined)
          draft.apply({ op: 'set-world', world: next as unknown as typeof state.model.world });
        return;
      }
      if (kind === 'order') {
        const ids = Array.isArray(conflict.other) ? conflict.other.map(idKey) : [];
        const rank = (id: Id) => {
          const at = ids.indexOf(id);
          return at < 0 ? ids.length : at;
        };
        const items = [...state.model.elements].sort((a, b) => rank(a.id) - rank(b.id));
        draft.apply({ op: 'replace-all', collection: { name: 'elements' }, items });
        return;
      }
      const elements = kind === 'element';
      const collection: Collection = { name: elements ? 'elements' : 'relations' };
      const items = elements ? state.model.elements : state.model.relations;
      const current = items.find((each) => each.id === key);
      const next = replaced(current as unknown as JsonValue | undefined);
      // Removed as the delete command removes it, with what ends on it.
      if (next === undefined) {
        if (current !== undefined) {
          deleteTargets(draft, {
            type: 'delete',
            ...(elements ? { elements: [key] } : { relations: [key] }),
          });
        }
        return;
      }
      inList(collection, items, key);
      return;
    }
    case 'package': {
      const found = state.packages.find((each) => each.id === file.id);
      if (!found) return;
      if (kind === 'package') {
        const properties = withoutKeys(found, 'components', 'relationTypes', 'images', 'conflicts');
        if (conflict.why === 'order') {
          const field = conflict.path[0] as 'components' | 'relationTypes' | 'images';
          const name = field;
          const list = (found[field] ?? []) as Item[];
          const items = orderedBy(list, conflict.other, (each) => (each as { id: Id }).id);
          draft.apply({ op: 'replace-all', collection: { name, package: found.id }, items });
          return;
        }
        const next = replaced(properties as unknown as JsonValue);
        if (next !== undefined) {
          draft.apply({
            op: 'set-package',
            package: found.id,
            properties: next as unknown as typeof properties,
          });
        }
        return;
      }
      const name =
        kind === 'component' ? 'components' : kind === 'relation-type' ? 'relationTypes' : 'images';
      const collection: Collection = { name, package: found.id };
      inList(collection, found[name] ?? [], key);
      return;
    }
    case 'view': {
      const found = state.views.find((each) => each.id === file.id);
      if (!found) return;
      if (kind === 'view') {
        if (conflict.why === 'order') {
          const field = conflict.path[0] as 'positions' | 'freeShapes';
          const keyOfItem =
            field === 'positions'
              ? (each: Item) => positionKey(each as never)
              : (each: Item) => (each as { id: Id }).id;
          const items = orderedBy(found[field] as Item[], conflict.other, keyOfItem);
          draft.apply({ op: 'replace-all', collection: { name: field, view: found.id }, items });
          return;
        }
        const properties = withoutKeys(
          found,
          'positions',
          'freeShapes',
          'stackingOrder',
          'routes',
          'conflicts',
        );
        const next = replaced(properties as unknown as JsonValue);
        if (next !== undefined)
          draft.apply({
            op: 'set-view',
            view: found.id,
            properties: next as unknown as typeof properties,
          });
        return;
      }
      if (kind === 'position') {
        inList({ name: 'positions', view: found.id }, found.positions, key);
        return;
      }
      if (kind === 'free-shape') {
        inList({ name: 'freeShapes', view: found.id }, found.freeShapes, key);
        return;
      }
      if (kind === 'stacking') {
        const current = found.stackingOrder?.[key];
        const next = (conflict.why === 'order' ? conflict.other : replaced(current)) as
          Id[] | undefined;
        draft.apply({
          op: 'replace-all',
          collection: { name: 'stackingOrder', view: found.id, container: key },
          items: next ?? [],
        });
        return;
      }
      if (kind === 'route') {
        const entries = Object.entries(found.routes ?? {}).map(([relation, route]) => ({
          relation,
          route,
        }));
        const current = found.routes?.[key];
        const next = replaced(current as unknown as JsonValue | undefined);
        const collection: Collection = { name: 'routes', view: found.id };
        if (next === undefined) {
          if (current !== undefined) draft.apply({ op: 'remove', collection, key });
        } else if (current === undefined) {
          draft.apply({
            op: 'insert',
            collection,
            index: entries.length,
            item: { relation: key, route: next as never },
          });
        } else
          draft.apply({ op: 'replace', collection, item: { relation: key, route: next as never } });
      }
      return;
    }
    case 'scenario':
    case 'tour':
    case 'comment': {
      const name =
        file.kind === 'scenario' ? 'scenarios' : file.kind === 'tour' ? 'tours' : 'comments';
      const field = file.kind === 'comment' ? 'comments' : 'steps';
      const list = state[name] as unknown as readonly ({ id: Id } & Record<string, unknown>)[];
      const found = list.find((each) => each.id === file.id);
      if (!found) return;
      const value = withoutKeys(found, 'conflicts');
      let next: Record<string, unknown>;
      if (kind === 'scenario' || kind === 'tour' || kind === 'thread') {
        if (conflict.why === 'order') {
          next = {
            ...value,
            [field]: orderedBy(
              value[field] as Item[],
              conflict.other,
              (each) => (each as { id: Id }).id,
            ),
          };
        } else {
          const { [field]: steps, ...properties } = value;
          const changed = replaced(properties as unknown as JsonValue) as
            Record<string, unknown> | undefined;
          next = { ...(changed ?? properties), [field]: steps };
        }
      } else {
        const steps = value[field] as ({ id: Id } & Record<string, unknown>)[];
        const current = steps.find((each) => each.id === key);
        const changed = replaced(current as unknown as JsonValue | undefined) as
          ({ id: Id } & Record<string, unknown>) | undefined;
        const kept =
          changed === undefined
            ? steps.filter((each) => each.id !== key)
            : current === undefined
              ? [...steps, changed]
              : steps.map((each) => (each.id === key ? changed : each));
        next = { ...value, [field]: kept };
      }
      draft.apply({ op: 'replace', collection: { name }, item: next as unknown as Item });
      return;
    }
  }
}

/** A value with what lies at a path set, or taken away when `value` is undefined. */
function setAt(base: JsonValue, path: readonly string[], value: JsonValue | undefined): JsonValue {
  const [head, ...rest] = path;
  if (head === undefined) return value as JsonValue;
  // A list of things is keyed by each thing's key: its id, or the key it is merged by.
  if (Array.isArray(base)) {
    const at = base.findIndex((each) => keyInList(each) === head);
    const inner =
      rest.length === 0 ? value : setAt(at < 0 ? {} : (base[at] as JsonValue), rest, value);
    const sorted = base.every(
      (each, index) => index === 0 || keyInList(base[index - 1] as JsonValue) <= keyInList(each),
    );
    const copy = [...base];
    if (inner === undefined) {
      if (at >= 0) copy.splice(at, 1);
    } else if (at >= 0) copy[at] = inner;
    else if (sorted) {
      const before = copy.findIndex((each) => keyInList(each) > head);
      copy.splice(before < 0 ? copy.length : before, 0, inner);
    } else copy.push(inner);
    return copy;
  }
  const object = (
    typeof base === 'object' && base !== null && !Array.isArray(base) ? base : {}
  ) as Record<string, JsonValue>;
  const copy: Record<string, JsonValue> = { ...object };
  if (rest.length === 0) {
    if (value === undefined) delete copy[head];
    else copy[head] = value;
    return copy;
  }
  const inner = setAt(object[head] ?? {}, rest, value);
  copy[head] = inner;
  return copy;
}

/** A value whose list at a path takes the order of `other`'s list. */
function reordered(
  current: JsonValue | undefined,
  path: readonly string[],
  other: JsonValue | undefined,
): JsonValue | undefined {
  if (current === undefined || !Array.isArray(other)) return current;
  const read = (value: JsonValue, at: readonly string[]): JsonValue | undefined =>
    at.reduce<JsonValue | undefined>(
      (inner, key) =>
        typeof inner === 'object' && inner !== null && !Array.isArray(inner)
          ? inner[key]
          : undefined,
      value,
    );
  const list = read(current, path);
  if (!Array.isArray(list)) return current;
  return setAt(current, path, orderedBy(list, other, keyInList));
}

/** The key of a thing in a list, as a merge keys it: its id, a relation type left out by its type. */
function keyInList(each: JsonValue): string {
  if (typeof each !== 'object' || each === null || Array.isArray(each)) return idKey(each);
  if (typeof each.id === 'string') return each.id;
  if (typeof each.relationType === 'string') return each.relationType;
  return idKey(each);
}

/** A value as a key to match list items by. */
function idKey(value: JsonValue | undefined): string {
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
}

/** A list in the order of `other`, what `other` lacks after it in its own order. */
function orderedBy<T>(
  list: readonly T[],
  other: JsonValue | undefined,
  keyOfItem: (item: T) => string,
): T[] {
  if (!Array.isArray(other)) return [...list];
  const keys = other.map((each) =>
    typeof each === 'object' && each !== null && !Array.isArray(each)
      ? 'element' in each
        ? positionKey(each as never)
        : idKey((each as { id?: JsonValue }).id)
      : idKey(each),
  );
  const rank = (item: T) => {
    const at = keys.indexOf(keyOfItem(item));
    return at < 0 ? keys.length : at;
  };
  return [...list].sort((a, b) => rank(a) - rank(b));
}
