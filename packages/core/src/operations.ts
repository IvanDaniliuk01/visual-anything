/**
 * Operations: the smallest changes to a project. Commands compile into operations; the history keeps
 * them with their inverses, so undo applies the inverses and restores the project exactly; and the
 * local program sends them to every open app, which applies them to its own copy.
 */
import type {
  Component,
  Element,
  FreeShape,
  Id,
  PackageFile,
  ProjectFile,
  Relation,
  RelationType,
  ScenarioFile,
  ShapePosition,
  ViewFile,
} from '@visual-anything/schema';
import type { ProjectSnapshot } from './snapshot';

/** A list in the project that operations insert into, replace in and remove from. */
export type Collection =
  | { name: 'elements' }
  | { name: 'relations' }
  | { name: 'packages' }
  | { name: 'views' }
  | { name: 'scenarios' }
  | { name: 'components'; package: Id }
  | { name: 'relationTypes'; package: Id }
  | { name: 'positions'; view: Id }
  | { name: 'freeShapes'; view: Id };

/** What each list holds. */
export interface CollectionItems {
  elements: Element;
  relations: Relation;
  packages: PackageFile;
  views: ViewFile;
  scenarios: ScenarioFile;
  components: Component;
  relationTypes: RelationType;
  positions: ShapePosition;
  freeShapes: FreeShape;
}

/** Anything a list holds. */
export type Item = CollectionItems[keyof CollectionItems];

/** A view without its shapes: what `set-view` changes. */
export type ViewProperties = Omit<ViewFile, 'positions' | 'freeShapes'>;

/** A package without its definitions: what `set-package` changes. */
export type PackageProperties = Omit<PackageFile, 'components' | 'relationTypes'>;

/** One change to a project. Each has an inverse that undoes it exactly. */
export type Operation =
  /** Inserts an item at an index of a list. */
  | { op: 'insert'; collection: Collection; index: number; item: Item }
  /** Replaces the item with the same key. */
  | { op: 'replace'; collection: Collection; item: Item }
  /** Removes the item with this key. */
  | { op: 'remove'; collection: Collection; key: string }
  /** Replaces a whole list, for changes too large to send item by item. */
  | { op: 'replace-all'; collection: Collection; items: Item[] }
  | { op: 'set-world'; world: Element }
  | { op: 'set-project'; project: ProjectFile }
  | { op: 'set-view'; view: Id; properties: ViewProperties }
  | { op: 'set-package'; package: Id; properties: PackageProperties };

/** Thrown when an operation does not fit the project, which means the copy it is applied to drifted. */
export class OperationError extends Error {
  override name = 'OperationError';
}

/** The key of a view position: its element, and the container its shape sits in. */
export function positionKey(position: { element: Id; container?: Id | undefined }): string {
  return position.container === undefined
    ? position.element
    : `${position.element} in ${position.container}`;
}

/** The key that identifies an item in its list. */
export function keyOf(collection: Collection, item: Item): string {
  return collection.name === 'positions'
    ? positionKey(item as ShapePosition)
    : (item as { id: Id }).id;
}

/** Applies one operation and returns the new project and the operation that undoes it. */
export function applyOperation(
  state: ProjectSnapshot,
  operation: Operation,
): { state: ProjectSnapshot; inverse: Operation } {
  switch (operation.op) {
    case 'insert': {
      const { collection, index, item } = operation;
      const items = itemsOf(state, collection);
      const key = keyOf(collection, item);
      if (items.some((existing) => keyOf(collection, existing) === key)) {
        throw new OperationError(`${describe(collection)} already holds "${key}".`);
      }
      if (!Number.isInteger(index) || index < 0 || index > items.length) {
        throw new OperationError(`${describe(collection)} has no place ${index}.`);
      }
      return {
        state: withItems(state, collection, items.toSpliced(index, 0, item)),
        inverse: { op: 'remove', collection, key },
      };
    }
    case 'replace': {
      const { collection, item } = operation;
      const items = itemsOf(state, collection);
      const index = indexOfKey(items, collection, keyOf(collection, item));
      const previous = items[index] as Item;
      return {
        state: withItems(state, collection, items.with(index, item)),
        inverse: { op: 'replace', collection, item: previous },
      };
    }
    case 'remove': {
      const { collection, key } = operation;
      const items = itemsOf(state, collection);
      const index = indexOfKey(items, collection, key);
      const previous = items[index] as Item;
      return {
        state: withItems(state, collection, items.toSpliced(index, 1)),
        inverse: { op: 'insert', collection, index, item: previous },
      };
    }
    case 'replace-all': {
      const { collection, items } = operation;
      const previous = itemsOf(state, collection);
      return {
        state: withItems(state, collection, [...items]),
        inverse: { op: 'replace-all', collection, items: [...previous] },
      };
    }
    case 'set-world':
      return {
        state: { ...state, model: { ...state.model, world: operation.world } },
        inverse: { op: 'set-world', world: state.model.world },
      };
    case 'set-project':
      return {
        state: { ...state, project: operation.project },
        inverse: { op: 'set-project', project: state.project },
      };
    case 'set-view': {
      const view = findView(state, operation.view);
      const { positions, freeShapes, ...previous } = view;
      if (operation.properties.id !== view.id) {
        throw new OperationError(`A view cannot change its id ("${view.id}").`);
      }
      const next: ViewFile = { ...operation.properties, positions, freeShapes };
      return {
        state: { ...state, views: state.views.map((each) => (each === view ? next : each)) },
        inverse: { op: 'set-view', view: view.id, properties: previous },
      };
    }
    case 'set-package': {
      const file = findPackage(state, operation.package);
      const { components, relationTypes, ...previous } = file;
      if (operation.properties.id !== file.id) {
        throw new OperationError(`A package cannot change its id ("${file.id}").`);
      }
      const next: PackageFile = { ...operation.properties, components, relationTypes };
      return {
        state: { ...state, packages: state.packages.map((each) => (each === file ? next : each)) },
        inverse: { op: 'set-package', package: file.id, properties: previous },
      };
    }
  }
}

/**
 * Applies operations in order and returns the new project and the operations that undo them all, in
 * the order to apply them.
 */
export function applyOperations(
  state: ProjectSnapshot,
  operations: readonly Operation[],
): { state: ProjectSnapshot; inverse: Operation[] } {
  let current = state;
  const inverse: Operation[] = [];
  for (const operation of operations) {
    const result = applyOperation(current, operation);
    current = result.state;
    inverse.push(result.inverse);
  }
  return { state: current, inverse: inverse.reverse() };
}

function itemsOf(state: ProjectSnapshot, collection: Collection): readonly Item[] {
  switch (collection.name) {
    case 'elements':
      return state.model.elements;
    case 'relations':
      return state.model.relations;
    case 'packages':
      return state.packages;
    case 'views':
      return state.views;
    case 'scenarios':
      return state.scenarios;
    case 'components':
      return findPackage(state, collection.package).components;
    case 'relationTypes':
      return findPackage(state, collection.package).relationTypes;
    case 'positions':
      return findView(state, collection.view).positions;
    case 'freeShapes':
      return findView(state, collection.view).freeShapes;
  }
}

function withItems(
  state: ProjectSnapshot,
  collection: Collection,
  items: readonly Item[],
): ProjectSnapshot {
  switch (collection.name) {
    case 'elements':
      return { ...state, model: { ...state.model, elements: items as Element[] } };
    case 'relations':
      return { ...state, model: { ...state.model, relations: items as Relation[] } };
    case 'packages':
      return { ...state, packages: items as PackageFile[] };
    case 'views':
      return { ...state, views: items as ViewFile[] };
    case 'scenarios':
      return { ...state, scenarios: items as ScenarioFile[] };
    case 'components':
      return updatePackage(state, collection.package, (file) => ({
        ...file,
        components: items as Component[],
      }));
    case 'relationTypes':
      return updatePackage(state, collection.package, (file) => ({
        ...file,
        relationTypes: items as RelationType[],
      }));
    case 'positions':
      return updateView(state, collection.view, (view) => ({
        ...view,
        positions: items as ShapePosition[],
      }));
    case 'freeShapes':
      return updateView(state, collection.view, (view) => ({
        ...view,
        freeShapes: items as FreeShape[],
      }));
  }
}

function indexOfKey(items: readonly Item[], collection: Collection, key: string): number {
  const index = items.findIndex((item) => keyOf(collection, item) === key);
  if (index === -1) throw new OperationError(`${describe(collection)} holds no "${key}".`);
  return index;
}

function findPackage(state: ProjectSnapshot, id: Id): PackageFile {
  const file = state.packages.find((each) => each.id === id);
  if (!file) throw new OperationError(`The project uses no package "${id}".`);
  return file;
}

function findView(state: ProjectSnapshot, id: Id): ViewFile {
  const view = state.views.find((each) => each.id === id);
  if (!view) throw new OperationError(`The project has no view "${id}".`);
  return view;
}

function updatePackage(
  state: ProjectSnapshot,
  id: Id,
  update: (file: PackageFile) => PackageFile,
): ProjectSnapshot {
  const file = findPackage(state, id);
  return {
    ...state,
    packages: state.packages.map((each) => (each === file ? update(each) : each)),
  };
}

function updateView(
  state: ProjectSnapshot,
  id: Id,
  update: (view: ViewFile) => ViewFile,
): ProjectSnapshot {
  const view = findView(state, id);
  return { ...state, views: state.views.map((each) => (each === view ? update(each) : each)) };
}

function describe(collection: Collection): string {
  switch (collection.name) {
    case 'components':
    case 'relationTypes':
      return `The ${collection.name} of package "${collection.package}"`;
    case 'positions':
    case 'freeShapes':
      return `The ${collection.name} of view "${collection.view}"`;
    default:
      return `The ${collection.name} of the project`;
  }
}
