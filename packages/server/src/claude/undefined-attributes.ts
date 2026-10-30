/**
 * The attributes an element carries that its component does not define (M3d, "Fixes from use").
 * They are particularities (CONTEXT.md): the core keeps them and never refuses them, but nothing
 * describes them, and filters and the inspector do not offer them as the component's. So Claude's
 * write answers and `get_item` name them, and Claude can define them in a package of the project's
 * own, or take them out, when they were not meant.
 */
import {
  definitionsIn,
  modelIndexOf,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Element, Id } from '@visual-anything/schema';

/** The most elements one answer names; the rest are counted. */
export const MAX_UNDEFINED_NAMED = 100;

/** What an answer says about them, after the list. */
export const UNDEFINED_ATTRIBUTES_NOTE =
  'These attributes are not defined by the element’s component: they are kept as particularities of the element, but nothing describes them and the app does not offer them as the component’s. When they are meant, define them in a component of a package of the project’s own (define_component or update_component); when not, take them out with update_element’s removeAttributes.';

/** The names of the attributes an element holds that its component does not define, in its order. */
export function undefinedAttributesOf(state: ProjectSnapshot, element: Element): string[] {
  const names = Object.keys(element.attributes ?? {});
  if (names.length === 0) return [];
  const component = definitionsIn(state).component(element.component);
  // An element of a component no package in use defines is warned about as such when opening.
  if (component === undefined) return [];
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

/** One element's attributes its component does not define, as an answer lists them. */
export interface UndefinedAttributes {
  element: Id;
  name: string;
  component: Id;
  attributes: string[];
}

/**
 * What a write's answer adds about the elements it touched that hold attributes their components do
 * not define: the list, at most {@link MAX_UNDEFINED_NAMED}, and the note; nothing when none do.
 */
export function undefinedAttributesAnswer(
  state: ProjectSnapshot,
  ids: readonly Id[],
): Record<string, unknown> {
  if (ids.length === 0) return {};
  const index = modelIndexOf(state);
  const found: UndefinedAttributes[] = [];
  for (const id of ids) {
    const element = index.element(id);
    if (element === undefined) continue;
    const attributes = undefinedAttributesOf(state, element);
    if (attributes.length === 0) continue;
    found.push({ element: id, name: element.name, component: element.component, attributes });
  }
  if (found.length === 0) return {};
  return {
    undefinedAttributes: found.slice(0, MAX_UNDEFINED_NAMED),
    ...(found.length > MAX_UNDEFINED_NAMED
      ? { moreUndefinedAttributes: found.length - MAX_UNDEFINED_NAMED }
      : {}),
    undefinedAttributesNote: UNDEFINED_ATTRIBUTES_NOTE,
  };
}
