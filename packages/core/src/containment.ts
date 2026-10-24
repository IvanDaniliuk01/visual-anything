import type { Id, ModelFile } from '@visual-anything/schema';

/**
 * One place where an element sits in a containment tree: directly in World, or inside one of its
 * containers, together with what it contains there. An element with several containers has one
 * placement inside each.
 */
export interface Placement {
  element: Id;
  /** The container this placement sits in; absent when it sits directly in World. */
  container?: Id;
  contents: Placement[];
}

/**
 * World's contents as a containment tree, built from the relations whose relation type nests. In a
 * nesting relation the `to` end is the container. An element without a container sits directly in
 * World, and so does an element whose only container is World itself. Contents keep the model's order.
 *
 * The core forbids containment cycles; should a project still hold one, the cycle is broken where it is
 * found, so every element is placed at least once and the tree always ends.
 */
export function containmentTree(
  model: ModelFile,
  nests: (relationType: Id) => boolean,
): Placement[] {
  const elements = [...new Set(model.elements.map((element) => element.id))].filter(
    (id) => id !== model.world.id,
  );
  const known = new Set(elements);

  const containers = new Map<Id, Id[]>();
  for (const relation of model.relations) {
    const { from: element, to: container } = relation;
    if (!nests(relation.relationType) || element === container) continue;
    if (!known.has(element) || !known.has(container)) continue;
    const list = containers.get(element) ?? [];
    if (!list.includes(container)) list.push(container);
    containers.set(element, list);
  }

  const contents = new Map<Id, Id[]>();
  for (const element of elements) {
    for (const container of containers.get(element) ?? []) {
      const list = contents.get(container) ?? [];
      list.push(element);
      contents.set(container, list);
    }
  }

  const placed = new Set<Id>();
  const place = (element: Id, container: Id | undefined, around: ReadonlySet<Id>): Placement => {
    placed.add(element);
    const enclosing = new Set(around).add(element);
    return {
      element,
      ...(container === undefined ? {} : { container }),
      contents: (contents.get(element) ?? [])
        .filter((content) => !enclosing.has(content))
        .map((content) => place(content, element, enclosing)),
    };
  };

  const tree = elements
    .filter((element) => !containers.has(element))
    .map((element) => place(element, undefined, new Set()));
  for (const element of elements) {
    if (!placed.has(element)) tree.push(place(element, undefined, new Set()));
  }
  return tree;
}
