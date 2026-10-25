import type { Element, Id, ModelFile, Relation } from '@visual-anything/schema';
import type { Item, Operation } from './operations';

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

/**
 * An index a command's draft keeps up to date as it applies operations, so that a command making
 * thousands of changes stays linear rather than indexing the model again after each one.
 */
export interface DraftIndex extends ModelIndex {
  /**
   * Follows an operation applied to the model this index is of. False when it cannot, as when a
   * relation goes anywhere but last: the index no longer fits the model and is dropped.
   */
  follow(operation: Operation): boolean;
  /** Keeps this index as the index of the model it now fits, which nothing will change again. */
  seal(model: ModelFile): void;
}

const cache = new WeakMap<ModelFile, { nesting: ReadonlySet<Id>; index: Index }>();

/**
 * Indexes a model. Containment comes from the relations whose relation type is in `nesting`.
 * Repeated calls with the same model and set share the result.
 */
export function indexModel(model: ModelFile, nesting: ReadonlySet<Id>): ModelIndex {
  const cached = cache.get(model);
  if (cached?.nesting === nesting) return cached.index;
  const index = Index.build(model, nesting);
  cache.set(model, { nesting, index });
  return index;
}

/**
 * An index of a model that can follow the operations applied to it. It starts from the shared index
 * of the model when there is one, copying its maps but not its lists, which it copies only when it
 * changes them.
 */
export function draftIndexOf(model: ModelFile, nesting: ReadonlySet<Id>): DraftIndex {
  const cached = cache.get(model);
  return cached?.nesting === nesting ? cached.index.copy() : Index.build(model, nesting);
}

class Index implements DraftIndex {
  /** The lists this index made and has not handed out, which it may change in place. */
  readonly #own = new WeakSet<unknown[]>();
  #sealed = false;

  private constructor(
    public world: Element,
    private readonly nesting: ReadonlySet<Id>,
    private readonly elements: Map<Id, Element>,
    private readonly relations: Map<Id, Relation>,
    private readonly on: Map<Id, Relation[]>,
    private readonly containers: Map<Id, Id[]>,
    private readonly contents: Map<Id, Id[]>,
    /** The model's relations in order, kept only to tell whether a relation goes last. */
    private relationCount: number,
  ) {}

  static build(model: ModelFile, nesting: ReadonlySet<Id>): Index {
    const elements = new Map<Id, Element>([[model.world.id, model.world]]);
    for (const element of model.elements) elements.set(element.id, element);
    const relations = new Map<Id, Relation>();
    for (const relation of model.relations) relations.set(relation.id, relation);
    const index = new Index(
      model.world,
      nesting,
      elements,
      relations,
      new Map(),
      new Map(),
      new Map(),
      model.relations.length,
    );
    for (const relation of model.relations) index.#index(relation);
    return index;
  }

  copy(): Index {
    return new Index(
      this.world,
      this.nesting,
      new Map(this.elements),
      new Map(this.relations),
      new Map(this.on),
      new Map(this.containers),
      new Map(this.contents),
      this.relationCount,
    );
  }

  element(id: Id): Element | undefined {
    return this.elements.get(id);
  }

  relation(id: Id): Relation | undefined {
    return this.relations.get(id);
  }

  has(id: Id): boolean {
    return this.elements.has(id) || this.relations.has(id);
  }

  relationsOn(id: Id): readonly Relation[] {
    return this.#handOut(this.on.get(id)) ?? [];
  }

  containersOf(id: Id): readonly Id[] {
    return this.#handOut(this.containers.get(id)) ?? [];
  }

  contentsOf(id: Id): readonly Id[] {
    return this.#handOut(this.contents.get(id)) ?? [];
  }

  follow(operation: Operation): boolean {
    if (this.#sealed) throw new Error('A sealed index follows no operation.');
    switch (operation.op) {
      case 'insert':
        if (operation.collection.name === 'elements') return this.#inserted(operation.item);
        if (operation.collection.name === 'relations') {
          return operation.index === this.relationCount && this.#appended(operation.item);
        }
        return true;
      case 'replace':
        if (operation.collection.name === 'elements') return this.#replaced(operation.item);
        if (operation.collection.name === 'relations') {
          return this.#relationReplaced(operation.item as Relation);
        }
        return true;
      case 'remove':
        if (operation.collection.name === 'elements') return this.#removed(operation.key);
        if (operation.collection.name === 'relations') {
          return this.#relationRemoved(operation.key);
        }
        return true;
      case 'replace-all':
        return (
          operation.collection.name !== 'elements' && operation.collection.name !== 'relations'
        );
      case 'set-world':
        if (operation.world.id !== this.world.id) return false;
        this.world = operation.world;
        this.elements.set(operation.world.id, operation.world);
        return true;
      default:
        return true;
    }
  }

  seal(model: ModelFile): void {
    this.#sealed = true;
    cache.set(model, { nesting: this.nesting, index: this });
  }

  /** An element that ends relations already may come to contain or be contained: built again. */
  #inserted(item: Item): boolean {
    const element = item as Element;
    if (this.on.has(element.id)) return false;
    this.elements.set(element.id, element);
    return true;
  }

  #replaced(item: Item): boolean {
    const element = item as Element;
    if (!this.elements.has(element.id)) return false;
    this.elements.set(element.id, element);
    return true;
  }

  #removed(id: Id): boolean {
    if (this.on.has(id)) return false;
    this.elements.delete(id);
    return true;
  }

  #appended(item: Item): boolean {
    const relation = item as Relation;
    this.relations.set(relation.id, relation);
    this.relationCount += 1;
    this.#index(relation);
    return true;
  }

  #relationReplaced(relation: Relation): boolean {
    const previous = this.relations.get(relation.id);
    if (
      previous === undefined ||
      previous.from !== relation.from ||
      previous.to !== relation.to ||
      previous.relationType !== relation.relationType
    ) {
      return false;
    }
    this.relations.set(relation.id, relation);
    for (const end of ends(relation)) {
      const list = this.#ownList(this.on, end);
      const place = list.indexOf(previous);
      if (place !== -1) list[place] = relation;
    }
    return true;
  }

  #relationRemoved(id: Id): boolean {
    const relation = this.relations.get(id);
    if (relation === undefined) return false;
    if (this.#contains(relation)) {
      // Another relation that nests between the same two elements keeps the containment, and its
      // place in model order may differ: built again.
      const twin = (this.on.get(relation.from) ?? []).some(
        (each) =>
          each !== relation &&
          each.from === relation.from &&
          each.to === relation.to &&
          this.nesting.has(each.relationType),
      );
      if (twin) return false;
      this.#drop(this.containers, relation.from, relation.to);
      this.#drop(this.contents, relation.to, relation.from);
    }
    for (const end of ends(relation)) this.#drop(this.on, end, relation);
    this.relations.delete(id);
    this.relationCount -= 1;
    return true;
  }

  #index(relation: Relation): void {
    for (const end of ends(relation)) this.#ownList(this.on, end).push(relation);
    if (this.#contains(relation)) {
      this.#addOnce(this.containers, relation.from, relation.to);
      this.#addOnce(this.contents, relation.to, relation.from);
    }
  }

  #contains(relation: Relation): boolean {
    return (
      this.nesting.has(relation.relationType) &&
      this.elements.has(relation.from) &&
      this.elements.has(relation.to)
    );
  }

  #addOnce(map: Map<Id, Id[]>, key: Id, value: Id): void {
    const list = map.get(key);
    if (list?.includes(value)) return;
    this.#ownList(map, key).push(value);
  }

  #drop<T>(map: Map<Id, T[]>, key: Id, value: T): void {
    const list = map.get(key);
    if (list === undefined) return;
    const rest = list.filter((each) => each !== value);
    if (rest.length === 0) map.delete(key);
    else {
      this.#own.add(rest);
      map.set(key, rest);
    }
  }

  /** The list under a key, which this index may change: its own, or a copy it then owns. */
  #ownList<T>(map: Map<Id, T[]>, key: Id): T[] {
    const list = map.get(key);
    if (list !== undefined && this.#own.has(list)) return list;
    const own = list === undefined ? [] : [...list];
    this.#own.add(own);
    map.set(key, own);
    return own;
  }

  /** A list handed out stays as it is: the index copies it before changing it. */
  #handOut<T>(list: T[] | undefined): readonly T[] | undefined {
    if (list !== undefined) this.#own.delete(list);
    return list;
  }
}

function ends(relation: Relation): Id[] {
  return relation.to === relation.from ? [relation.from] : [relation.from, relation.to];
}
