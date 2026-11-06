/**
 * The attributes an element carries that its component does not define (M3d, "Fixes from use").
 * They are particularities (CONTEXT.md): the core keeps them and never refuses them, but nothing
 * describes them, and filters and the inspector do not offer them as the component's. So Claude's
 * write answers name them, once per component and only those the write set (#17), and `get_item`
 * names every one an element carries, so that Claude can define them in a package of the project's
 * own, take them out when they were not meant, or give the component open attributes (ADR 0105) when
 * its elements carry attributes of their own on purpose; then nothing names them.
 */
import {
  definitionsIn,
  modelIndexOf,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Element, Id, JsonValue } from '@visual-anything/schema';

/** The most attribute names a write's answer gives for one component; the rest are counted. */
export const MAX_ATTRIBUTES_NAMED = 20;

/** The most components a write's answer names; the rest are counted. */
export const MAX_COMPONENTS_NAMED = 20;

/** What an answer says about them, after the list. */
export const UNDEFINED_ATTRIBUTES_NOTE =
  'Not defined by the component: kept as particularities, but nothing describes them and the app does not offer them as the component’s. A write names those it set, once per component; get_item names all an element carries. If meant, define them (update_component); if its elements carry attributes of their own on purpose, as table rows carry columns, give it openAttributes: true; if not meant, take them out (update_element’s removeAttributes).';

/**
 * The names of the attributes an element holds that its component does not define, in its order;
 * none for a component with open attributes (ADR 0105), whose elements carry them on purpose.
 */
export function undefinedAttributesOf(state: ProjectSnapshot, element: Element): string[] {
  const names = Object.keys(element.attributes ?? {});
  if (names.length === 0) return [];
  const component = definitionsIn(state).component(element.component);
  // An element of a component no package in use defines is warned about as such when opening.
  if (component === undefined || component.openAttributes) return [];
  const defined = new Set(component.attributes.map((attribute) => attribute.name));
  return names.filter((name) => !defined.has(name));
}

/**
 * The elements a command sets attributes on, or gives another component: those it creates, among
 * `created`, and those its `update-element`s change so, inside batches too.
 */
export function elementsTouched(command: Command, created: readonly Id[]): Id[] {
  const touched = new Set<Id>(created);
  const walk = (each: Command) => {
    if (each.type === 'batch') {
      for (const inner of each.commands) walk(inner);
    } else if (
      each.type === 'update-element' &&
      (each.changes.attributes !== undefined || each.changes.component !== undefined)
    ) {
      touched.add(each.id);
    }
  };
  walk(command);
  return [...touched];
}

/**
 * The attributes a write set that one component does not define, as the write's answer names them:
 * once for the component, with how many of the elements it touched carry them, never their values.
 */
export interface UndefinedAttributes {
  component: Id;
  /** How many of the elements the write touched carry them. */
  elements: number;
  /** Their names, each once, at most {@link MAX_ATTRIBUTES_NAMED}. */
  attributes: string[];
  /** How many more there are past those named. */
  moreAttributes?: number;
}

/**
 * Of the attributes an element carries after a write that its component does not define, those the
 * write set: all of them for an element it created or gave another component, else those whose
 * value is new or changed.
 */
function setByTheWrite(
  names: readonly string[],
  element: Element,
  was: Element | undefined,
): string[] {
  if (was === undefined || was.component !== element.component) return [...names];
  const before = was.attributes ?? {};
  const after = element.attributes ?? {};
  return names.filter(
    (name) => !Object.hasOwn(before, name) || !sameJson(before[name], after[name]),
  );
}

function sameJson(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * What a write's answer adds about the attributes it set on the elements it touched that their
 * components do not define: per component, how many of those elements carry them and their names,
 * each once and capped, then the note; nothing when there are none. `before` is the project before
 * the write, so that attributes an element already carried, unchanged, are left out; without it,
 * every one the touched elements carry is named.
 */
export function undefinedAttributesAnswer(
  before: ProjectSnapshot | undefined,
  after: ProjectSnapshot,
  ids: readonly Id[],
): Record<string, unknown> {
  if (ids.length === 0) return {};
  const index = modelIndexOf(after);
  const was = before === undefined ? undefined : modelIndexOf(before);
  const byComponent = new Map<Id, { elements: number; names: Set<string> }>();
  for (const id of ids) {
    const element = index.element(id);
    if (element === undefined) continue;
    const names = undefinedAttributesOf(after, element);
    if (names.length === 0) continue;
    const set = was === undefined ? names : setByTheWrite(names, element, was.element(id));
    if (set.length === 0) continue;
    const entry = byComponent.get(element.component) ?? { elements: 0, names: new Set<string>() };
    entry.elements += 1;
    for (const name of set) entry.names.add(name);
    byComponent.set(element.component, entry);
  }
  if (byComponent.size === 0) return {};
  const found: UndefinedAttributes[] = [...byComponent].map(([component, entry]) => {
    const names = [...entry.names];
    return {
      component,
      elements: entry.elements,
      attributes: names.slice(0, MAX_ATTRIBUTES_NAMED),
      ...(names.length > MAX_ATTRIBUTES_NAMED
        ? { moreAttributes: names.length - MAX_ATTRIBUTES_NAMED }
        : {}),
    };
  });
  return {
    undefinedAttributes: found.slice(0, MAX_COMPONENTS_NAMED),
    ...(found.length > MAX_COMPONENTS_NAMED
      ? { moreUndefinedAttributes: found.length - MAX_COMPONENTS_NAMED }
      : {}),
    undefinedAttributesNote: UNDEFINED_ATTRIBUTES_NOTE,
  };
}
