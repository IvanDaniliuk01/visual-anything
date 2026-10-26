/**
 * The scope of a view, the part of the model it shows (ADR-0040): set whole, or changed element by
 * element from the canvas, the outline and the inspector. Each is one action that changes only the
 * view's file; none of them deletes anything from the model.
 */
import type { Id, RelationTypeLeftOut, Scope, ScopeRule, ViewFile } from '@visual-anything/schema';
import { nestingTypesInView } from '../containers';
import { isId } from '../ids';
import { FILTER_TESTS } from '../protocol';
import { shownByScope } from '../scope';
import { count, nameOf, reject, requireList, type Draft } from './draft';
import type {
  AddToViewCommand,
  LeaveOutOfViewCommand,
  SetRelationTypesLeftOutCommand,
  SetScopeCommand,
} from './types';
import { viewProperties } from './views';

/** The most rules a scope keeps in each of its lists, as the file format says. */
export const MAX_SCOPE_RULES = 64;
/** The deepest a contents rule reaches, as the file format says. */
export const MAX_SCOPE_DEPTH = 1000;
/** The most relation types a view leaves out (ADR 0064), as the file format says. */
export const MAX_RELATION_TYPES_LEFT_OUT = 256;

/**
 * Sets the relation types a view leaves out (ADR 0064), whole: each a relation type a package in use
 * defines, once, and none the view nests by, whose relations draw containment rather than lines.
 */
export function setRelationTypesLeftOut(
  draft: Draft,
  command: SetRelationTypesLeftOutCommand,
): string {
  const view = draft.view(command.view);
  const given = requireList(command.relationTypes, 'The relation types a view leaves out');
  if (given.length > MAX_RELATION_TYPES_LEFT_OUT) {
    reject(
      'invalid-command',
      `A view leaves out at most ${MAX_RELATION_TYPES_LEFT_OUT} relation types.`,
    );
  }
  const nesting = new Set(nestingTypesInView(draft.state, view));
  const seen = new Set<Id>();
  const list = given.map((entry): RelationTypeLeftOut => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      reject('invalid-command', 'A relation type a view leaves out is an object.');
    }
    for (const key of Object.keys(entry)) {
      if (key !== 'relationType' && key !== 'exactly') {
        reject(
          'invalid-command',
          `A relation type a view leaves out holds relationType and exactly, not "${key}".`,
        );
      }
    }
    const { exactly } = entry;
    if (exactly !== undefined && typeof exactly !== 'boolean') {
      reject(
        'invalid-command',
        'Whether it leaves out exactly that relation type is true or false.',
      );
    }
    const type = draft.relationType(entry.relationType);
    if (nesting.has(type.id)) {
      reject(
        'not-drawn-as-line',
        `The view "${view.name}" nests by "${type.name}", whose relations draw containment rather than lines, so it cannot leave them out.`,
        [type.id],
      );
    }
    if (seen.has(type.id)) {
      reject('invalid-command', `The relation type "${type.name}" is given twice.`, [type.id]);
    }
    seen.add(type.id);
    return { relationType: type.id, ...(exactly === true ? { exactly: true } : {}) };
  });
  const before = view.relationTypesLeftOut ?? [];
  putRelationTypesLeftOut(draft, view, list);
  return leftOutLabel(draft, view.name, before, list);
}

/** How the history names a change of the relation types a view leaves out. */
function leftOutLabel(
  draft: Draft,
  viewName: string,
  before: readonly RelationTypeLeftOut[],
  after: readonly RelationTypeLeftOut[],
): string {
  if (after.length === 0) return `Draw every relation type in "${viewName}"`;
  const named = (list: readonly RelationTypeLeftOut[]) =>
    new Map(list.map((each) => [each.relationType, each.exactly === true]));
  const was = named(before);
  const now = named(after);
  const added = [...now.keys()].filter((id) => !was.has(id));
  const dropped = [...was.keys()].filter((id) => !now.has(id));
  const changed = [...now.keys()].some((id) => was.has(id) && was.get(id) !== now.get(id));
  const name = (id: Id) => draft.definitions.relationType(id)?.name ?? id;
  if (!changed && dropped.length === 0 && added.length === 1) {
    return `Leave the relations of "${name(added[0] as Id)}" out of "${viewName}"`;
  }
  if (!changed && added.length === 0 && dropped.length === 1) {
    return `Draw the relations of "${name(dropped[0] as Id)}" in "${viewName}" again`;
  }
  if (before.length === 0) {
    return `Leave the relations of ${count(after.length, 'relation type')} out of "${viewName}"`;
  }
  return `Change which relation types "${viewName}" leaves out`;
}

/**
 * Stores the relation types a view leaves out as the file format keeps them: sorted by relation type,
 * `exactly` only when true, and no list at all when it is empty.
 */
export function putRelationTypesLeftOut(
  draft: Draft,
  view: ViewFile,
  list: readonly RelationTypeLeftOut[],
): void {
  const next = [...list]
    .map((each) => ({
      relationType: each.relationType,
      ...(each.exactly === true ? { exactly: true } : {}),
    }))
    .sort((a, b) => byCodeUnits(a.relationType, b.relationType));
  const stored = next.length === 0 ? undefined : next;
  if (JSON.stringify(stored) === JSON.stringify(view.relationTypesLeftOut)) return;
  const properties = viewProperties(view);
  if (stored === undefined) delete properties.relationTypesLeftOut;
  else properties.relationTypesLeftOut = stored;
  draft.apply({ op: 'set-view', view: view.id, properties });
}

const SCOPE_KEYS = new Set(['include', 'exclude', 'added', 'leftOut']);

export function setScope(draft: Draft, command: SetScopeCommand): string {
  const view = draft.view(command.view);
  const scope = command.scope === null ? undefined : checkedScope(draft, command.scope);
  putScope(draft, view, scope);
  return scope === undefined
    ? `Show the whole model in "${view.name}"`
    : `Set what "${view.name}" shows`;
}

export function addToView(draft: Draft, command: AddToViewCommand): string {
  const view = draft.view(command.view);
  const ids = checkedElements(
    draft,
    command.elements,
    'No elements were given to add to the view.',
  );
  const scope = view.scope;
  if (scope !== undefined) {
    const named = new Set(ids);
    const byRules = shownByRules(draft, view, scope);
    const added = new Set(scope.added ?? []);
    for (const id of ids) if (!byRules.element(id)) added.add(id);
    putScope(draft, view, {
      ...scope,
      added: [...added],
      leftOut: (scope.leftOut ?? []).filter((id) => !named.has(id)),
    });
  }
  return ids.length === 1
    ? `Add "${nameOf(draft.index, ids[0] as Id)}" to "${view.name}"`
    : `Add ${count(ids.length, 'element')} to "${view.name}"`;
}

export function leaveOutOfView(draft: Draft, command: LeaveOutOfViewCommand): string {
  const view = draft.view(command.view);
  const ids = checkedElements(
    draft,
    command.elements,
    'No elements were given to leave out of the view.',
  );
  const scope = view.scope ?? {};
  const named = new Set(ids);
  const byRules = shownByRules(draft, view, scope);
  const leftOut = new Set(scope.leftOut ?? []);
  for (const id of ids) if (byRules.element(id)) leftOut.add(id);
  putScope(draft, view, {
    ...scope,
    added: (scope.added ?? []).filter((id) => !named.has(id)),
    leftOut: [...leftOut],
  });
  return ids.length === 1
    ? `Leave "${nameOf(draft.index, ids[0] as Id)}" out of "${view.name}"`
    : `Leave ${count(ids.length, 'element')} out of "${view.name}"`;
}

/** What the scope's rules alone show, without what it adds and leaves out by hand. */
function shownByRules(draft: Draft, view: ViewFile, scope: Scope) {
  const rules: Scope = {
    ...(scope.include ? { include: scope.include } : {}),
    ...(scope.exclude ? { exclude: scope.exclude } : {}),
  };
  return shownByScope(draft.state, { ...view, scope: rules });
}

/**
 * Stores a view's scope as the file format keeps it: the lists of ids sorted and each once, empty
 * lists left out, and no scope at all when nothing is left.
 */
export function putScope(draft: Draft, view: ViewFile, scope: Scope | undefined): void {
  const next = normalized(scope);
  if (JSON.stringify(next) === JSON.stringify(view.scope)) return;
  const properties = viewProperties(view);
  if (next === undefined) delete properties.scope;
  else properties.scope = next;
  draft.apply({ op: 'set-view', view: view.id, properties });
}

function normalized(scope: Scope | undefined): Scope | undefined {
  if (scope === undefined) return undefined;
  const sorted = (ids: readonly Id[] | undefined) =>
    ids === undefined || ids.length === 0 ? undefined : [...new Set(ids)].sort(byCodeUnits);
  const include = scope.include?.length ? scope.include : undefined;
  const exclude = scope.exclude?.length ? scope.exclude : undefined;
  const added = sorted(scope.added);
  const leftOut = sorted(scope.leftOut);
  const result: Scope = {
    ...(include ? { include } : {}),
    ...(exclude ? { exclude } : {}),
    ...(added ? { added } : {}),
    ...(leftOut ? { leftOut } : {}),
  };
  return Object.keys(result).length === 0 ? undefined : result;
}

/** Checks a scope as a command gives it: its parts, its rules, and the elements it names. */
function checkedScope(draft: Draft, scope: unknown): Scope {
  if (typeof scope !== 'object' || scope === null || Array.isArray(scope)) {
    reject('invalid-command', 'A scope is an object, or null to show the whole model.');
  }
  for (const key of Object.keys(scope)) {
    if (!SCOPE_KEYS.has(key)) {
      reject('invalid-command', `A scope holds include, exclude, added and leftOut, not "${key}".`);
    }
  }
  const given = scope as Partial<Record<keyof Scope, unknown>>;
  const include = checkedRules(draft, given.include, 'include');
  const exclude = checkedRules(draft, given.exclude, 'exclude');
  const added = checkedList(draft, given.added, 'added');
  const leftOut = checkedList(draft, given.leftOut, 'leftOut');
  const kept = new Set(added);
  for (const id of leftOut) {
    if (kept.has(id)) {
      reject(
        'invalid-command',
        `"${nameOf(draft.index, id)}" is both added to the view and left out of it.`,
        [id],
      );
    }
  }
  return {
    ...(include.length > 0 ? { include } : {}),
    ...(exclude.length > 0 ? { exclude } : {}),
    ...(added.length > 0 ? { added } : {}),
    ...(leftOut.length > 0 ? { leftOut } : {}),
  };
}

function checkedRules(draft: Draft, value: unknown, part: 'include' | 'exclude'): ScopeRule[] {
  if (value === undefined) return [];
  const rules = requireList(value as readonly unknown[], `A scope's ${part}`);
  if (rules.length > MAX_SCOPE_RULES) {
    reject('invalid-command', `A scope's ${part} holds at most ${MAX_SCOPE_RULES} rules.`);
  }
  return rules.map((rule) => checkedRule(draft, rule));
}

function checkedRule(draft: Draft, rule: unknown): ScopeRule {
  if (typeof rule !== 'object' || rule === null || Array.isArray(rule)) {
    reject('invalid-command', 'A rule of a scope is an object with a kind.');
  }
  const given = rule as Record<string, unknown>;
  const exactly = given.exactly;
  if (exactly !== undefined && typeof exactly !== 'boolean') {
    reject('invalid-command', 'Whether a rule takes exactly its own kind is true or false.');
  }
  switch (given.kind) {
    case 'component': {
      const component = draft.component(given.component as Id);
      return {
        kind: 'component',
        component: component.id,
        ...(exactly === true ? { exactly: true } : {}),
      };
    }
    case 'relation-type': {
      const relationType = draft.relationType(given.relationType as Id);
      return {
        kind: 'relation-type',
        relationType: relationType.id,
        ...(exactly === true ? { exactly: true } : {}),
      };
    }
    case 'contents': {
      const container = draft.element(given.container as Id);
      const depth = given.depth;
      if (
        depth !== undefined &&
        (typeof depth !== 'number' ||
          !Number.isInteger(depth) ||
          depth < 1 ||
          depth > MAX_SCOPE_DEPTH)
      ) {
        reject(
          'invalid-command',
          `How deep a rule reaches is a whole number from 1 to ${MAX_SCOPE_DEPTH}.`,
        );
      }
      return {
        kind: 'contents',
        container: container.id,
        ...(depth === undefined ? {} : { depth }),
      };
    }
    case 'attribute': {
      const { attribute, test, value } = given;
      if (typeof attribute !== 'string' || attribute.trim() === '') {
        reject('invalid-command', 'A rule on an attribute names the attribute.');
      }
      if (!(FILTER_TESTS as readonly unknown[]).includes(test)) {
        reject(
          'invalid-command',
          `A rule on an attribute tests it with one of: ${FILTER_TESTS.join(', ')}.`,
        );
      }
      const takesValue = test !== 'set' && test !== 'unset';
      if (takesValue && typeof value !== 'string') {
        reject(
          'invalid-command',
          'A rule on an attribute that compares it gives the value to compare with.',
        );
      }
      return {
        kind: 'attribute',
        attribute,
        test: test as (typeof FILTER_TESTS)[number],
        ...(takesValue ? { value: value as string } : {}),
      };
    }
    default:
      reject(
        'invalid-command',
        'A rule of a scope takes a component, a relation type, a container’s contents or a condition on an attribute.',
      );
  }
}

/** The elements of a scope's `added` or `leftOut` list: elements of the model, World left out, each once. */
function checkedList(draft: Draft, value: unknown, part: 'added' | 'leftOut'): Id[] {
  if (value === undefined) return [];
  const ids = requireList(value as readonly Id[], `A scope's ${part}`);
  // An empty list is no list: it is left out when the scope is stored.
  if (ids.length === 0) return [];
  return checkedElements(draft, ids, 'No elements were given.');
}

/** Checks the elements a command names: a list of elements of the model, World left out, each once. */
function checkedElements(draft: Draft, value: readonly Id[], none: string): Id[] {
  const ids = requireList(value, 'elements');
  if (ids.length === 0) reject('invalid-command', none);
  const worldId = draft.index.world.id;
  const seen = new Set<Id>();
  for (const id of ids) {
    if (typeof id !== 'string' || !isId(id)) {
      reject('invalid-id', `${JSON.stringify(id) ?? 'undefined'} is not a valid id.`);
    }
    if (id === worldId) {
      reject('world-not-allowed', 'World is the canvas itself; every view shows it.', [id]);
    }
    const element = draft.element(id);
    if (seen.has(id)) reject('invalid-command', `"${element.name}" is given twice.`, [id]);
    seen.add(id);
  }
  return [...ids];
}

/** Orders strings by their UTF-16 code units: the same on every machine and locale. */
function byCodeUnits(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
