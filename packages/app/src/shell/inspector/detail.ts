/**
 * What the inspector says a shape writes under its element's name: its detail and badges, worked out
 * by the core exactly as the canvas writes them.
 */
import {
  componentOrEssence,
  detailParts,
  detailText,
  type DetailPart,
  type Definitions,
  type ModelIndex,
} from '@visual-anything/core';
import type { Element, Id } from '@visual-anything/schema';

/** The relation types of the relations an element or relation is the `from` end of. */
export function startedTypesOf(index: ModelIndex, id: Id): Set<Id> {
  const types = new Set<Id>();
  for (const relation of index.relationsOn(id)) {
    if (relation.from === id) types.add(relation.relationType);
  }
  return types;
}

/** What the element's shapes write under its name, part by part: detail values, then badges. */
export function detailOf(
  element: Element,
  index: ModelIndex,
  definitions: Definitions,
): DetailPart[] {
  return detailParts(element, definitions, startedTypesOf(index, element.id));
}

/**
 * How the inspector describes an element after its name: what its shapes write under it, or its
 * component's name when they write nothing, so that it always says what the element is.
 */
export function describedAs(element: Element, index: ModelIndex, definitions: Definitions): string {
  const text = detailText(detailOf(element, index, definitions));
  return text === '' ? componentOrEssence(definitions, element.component).name : text;
}
