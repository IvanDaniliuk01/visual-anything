/**
 * The scope of a view, the part of the model it shows (ADR-0040): set whole, or changed element by
 * element from the canvas, the outline and the inspector. Each is one action that changes only the
 * view's file; none of them deletes anything from the model.
 */
import type { Id, Scope, ScopeRule, ViewFile } from '@visual-anything/schema';
import { isId } from '../ids';
import { FILTER_TESTS } from '../protocol';
import { shownByScope } from '../scope';
import { count, nameOf, reject, requireList, type Draft } from './draft';
import type { AddToViewCommand, LeaveOutOfViewCommand, SetScopeCommand } from './types';
import { viewProperties } from './views';

/** The most rules a scope keeps in each of its lists, as the file format says. */
export const MAX_SCOPE_RULES = 64;
/** The deepest a contents rule reaches, as the file format says. */
export const MAX_SCOPE_DEPTH = 1000;

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
