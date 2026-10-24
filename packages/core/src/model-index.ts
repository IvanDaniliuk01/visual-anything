import type { Element, Id, ModelFile, Relation } from '@visual-anything/schema';

/** Lookups over a model: by id, the relations on each end, and containment. */
export interface ModelIndex {
  readonly world: Element;
  /** The element with this id, World included. */
  element(id: Id): Element | undefined;
  relation(id: Id): Relation | undefined;
  /** Whether an element or a relation has this id. */
  has(id: Id): boolean;
  /** The relations that end on this element or relation, at either end, in model order. */
  relationsOn(id: Id): readonly Relation[];
  /**
   * The containers of an element: the `to` ends of its nesting relations, in model order and each
   * once. Only relations between two elements contain.
   */
  containersOf(id: Id): readonly Id[];
  /** What an element contains: the `from` ends of the nesting relations that end on it. */
  contentsOf(id: Id): readonly Id[];
}

const cache = new WeakMap<ModelFile, { nesting: ReadonlySet<Id>; index: ModelIndex }>();

/**
 * Indexes a model. Containment comes from the relations whose relation type is in `nesting`.
 * Repeated calls with the same model and set share the result.
 */
export function indexModel(model: ModelFile, nesting: ReadonlySet<Id>): ModelIndex {
  const cached = cache.get(model);
  if (cached?.nesting === nesting) return cached.index;
  const index = buildIndex(model, nesting);
  cache.set(model, { nesting, index });
  return index;
}

function buildIndex(model: ModelFile, nesting: ReadonlySet<Id>): ModelIndex {
  const elements = new Map<Id, Element>([[model.world.id, model.world]]);
  for (const element of model.elements) elements.set(element.id, element);
  const relations = new Map<Id, Relation>();
  for (const relation of model.relations) relations.set(relation.id, relation);

  const relationsOn = new Map<Id, Relation[]>();
  const containers = new Map<Id, Id[]>();
  const contents = new Map<Id, Id[]>();
  for (const relation of model.relations) {
    add(relationsOn, relation.from, relation);
    if (relation.to !== relation.from) add(relationsOn, relation.to, relation);
    if (
      nesting.has(relation.relationType) &&
      elements.has(relation.from) &&
      elements.has(relation.to)
    ) {
      addOnce(containers, relation.from, relation.to);
      addOnce(contents, relation.to, relation.from);
    }
  }

  return {
    world: model.world,
    element: (id) => elements.get(id),
    relation: (id) => relations.get(id),
    has: (id) => elements.has(id) || relations.has(id),
    relationsOn: (id) => relationsOn.get(id) ?? [],
    containersOf: (id) => containers.get(id) ?? [],
    contentsOf: (id) => contents.get(id) ?? [],
  };
}

function add<T>(map: Map<Id, T[]>, key: Id, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function addOnce(map: Map<Id, Id[]>, key: Id, value: Id): void {
  const list = map.get(key);
  if (!list) map.set(key, [value]);
  else if (!list.includes(value)) list.push(value);
}
