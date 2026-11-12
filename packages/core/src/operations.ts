/**
 * Operations: the smallest changes to a project. Commands compile into operations; the history keeps
 * them with their inverses, so undo applies the inverses and restores the project exactly; and the
 * local program sends them to every open app, which applies them to its own copy.
 */
import type {
  CommentFile,
  Component,
  Element,
  FileConflict,
  FreeShape,
  Id,
  ImageDefinition,
  PackageFile,
  ProjectFile,
  Relation,
  RelationRoute,
  RelationType,
  Routes,
  ScenarioFile,
  ShapePosition,
  SolidDefinition,
  TourFile,
  ViewFile,
} from '@visual-anything/schema';
import type { ExplorableText } from './explorables/types';
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
  /** The images of a package; a package without any has no list at all. */
  | { name: 'images'; package: Id }
  /** The solids of a package (ADR 0075); a package without any has no list at all. */
  | { name: 'solids'; package: Id }
  | { name: 'positions'; view: Id }
  | { name: 'freeShapes'; view: Id }
  /** One stacking list of a view: the order of the shapes directly in a container, or in World. */
  | { name: 'stackingOrder'; view: Id; container: Id }
  /** The routes a view keeps for the relations it routes by hand, in the order of its map. */
  | { name: 'routes'; view: Id }
  /** The project's tours (ADR 0058). */
  | { name: 'tours' }
  /** The project's threads of comments (ADR 0059). */
  | { name: 'comments' }
  /** The texts of explorables' files, by explorable (ADR 0107): none until the program reads them. */
  | { name: 'explorableTexts' };

/** What each list holds. */
export interface CollectionItems {
  elements: Element;
  relations: Relation;
  packages: PackageFile;
  views: ViewFile;
  scenarios: ScenarioFile;
  components: Component;
  relationTypes: RelationType;
  images: ImageDefinition;
  solids: SolidDefinition;
  positions: ShapePosition;
  freeShapes: FreeShape;
  /** An element id: a stacking list holds bare ids. */
  stackingOrder: Id;
  routes: RouteEntry;
  tours: TourFile;
  comments: CommentFile;
  explorableTexts: ExplorableText;
}

/** A route a view keeps, with the relation it routes: how operations carry one. */
export interface RouteEntry {
  relation: Id;
  route: RelationRoute;
}

/** Anything a list holds. */
export type Item = CollectionItems[keyof CollectionItems];

/** A view without its shapes, their order and its routes: what `set-view` changes. */
export type ViewProperties = Omit<
  ViewFile,
  'positions' | 'freeShapes' | 'stackingOrder' | 'routes'
>;

/** A package without its definitions and images: what `set-package` changes. */
export type PackageProperties = Omit<
  PackageFile,
  'components' | 'relationTypes' | 'images' | 'solids'
>;

/**
 * A project file that holds conflicts from a merge (ADR 0072): the project file, the model file, or the
 * file of a package, view, scenario, tour or thread of comments.
 */
export type ConflictFile =
  | { kind: 'project' }
  | { kind: 'model' }
  | { kind: 'package' | 'view' | 'scenario' | 'tour' | 'comment'; id: Id };

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
  | { op: 'set-package'; package: Id; properties: PackageProperties }
  /**
   * Sets the conflicts a file holds, or takes them away. A file's conflicts change through this
   * alone: every other operation keeps those the file holds, as routes change only through their own
   * list.
   */
  | { op: 'set-conflicts'; file: ConflictFile; conflicts?: FileConflict[] };

/** Above this many changes to one list, a command replaces the whole list in one operation. */
export const BULK = 200;

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
  switch (collection.name) {
    case 'positions':
      return positionKey(item as ShapePosition);
    case 'stackingOrder':
      return item as Id;
    case 'routes':
      return (item as RouteEntry).relation;
    default:
      return (item as { id: Id }).id;
  }
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
      if (holdsKey(collection, items, key)) {
        throw new OperationError(`${describe(collection)} already holds "${key}".`);
      }
      if (!Number.isInteger(index) || index < 0 || index > items.length) {
        throw new OperationError(`${describe(collection)} has no place ${index}.`);
      }
      const next = items.toSpliced(index, 0, item);
      if (index === items.length) movePlaces(items, next)?.set(key, index);
      return {
        state: withItems(state, collection, next),
        inverse: { op: 'remove', collection, key },
      };
    }
    case 'replace': {
      const { collection, item } = operation;
      const items = itemsOf(state, collection);
      const index = indexOfKey(items, collection, keyOf(collection, item));
      const previous = items[index] as Item;
      const next = items.with(index, withConflictsOf(previous, item));
      movePlaces(items, next);
      return {
        state: withItems(state, collection, next),
        inverse: { op: 'replace', collection, item: previous },
      };
    }
    case 'remove': {
      const { collection, key } = operation;
      const items = itemsOf(state, collection);
      const index = indexOfKey(items, collection, key);
      const previous = items[index] as Item;
      const next = items.toSpliced(index, 1);
      if (index === items.length - 1) movePlaces(items, next)?.delete(key);
      return {
        state: withItems(state, collection, next),
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
        state: { ...state, project: withConflictsOf(state.project, operation.project) },
        inverse: { op: 'set-project', project: state.project },
      };
    case 'set-conflicts': {
      const { file, conflicts } = operation;
      const previous = conflictsOf(state, file);
      return {
        state: withConflicts(state, file, conflicts),
        inverse: {
          op: 'set-conflicts',
          file,
          ...(previous === undefined ? {} : { conflicts: previous }),
        },
      };
    }
    case 'set-view': {
      const view = findView(state, operation.view);
      const { positions, freeShapes, stackingOrder, routes, ...previous } = view;
      if (operation.properties.id !== view.id) {
        throw new OperationError(`A view cannot change its id ("${view.id}").`);
      }
      const next: ViewFile = {
        ...operation.properties,
        positions,
        freeShapes,
        ...(stackingOrder === undefined ? {} : { stackingOrder }),
      };
      // Routes change only through their own list. Properties made from a whole view may carry a
      // copy of them, which is ignored, so that the view keeps the routes it has.
      if (routes === undefined) delete next.routes;
      else next.routes = routes;
      // So do its conflicts, which change through set-conflicts alone.
      if (view.conflicts === undefined) delete next.conflicts;
      else next.conflicts = view.conflicts;
      return {
        state: { ...state, views: state.views.map((each) => (each === view ? next : each)) },
        inverse: { op: 'set-view', view: view.id, properties: previous },
      };
    }
    case 'set-package': {
      const file = findPackage(state, operation.package);
      const { components, relationTypes, images, ...previous } = file;
      if (operation.properties.id !== file.id) {
        throw new OperationError(`A package cannot change its id ("${file.id}").`);
      }
      const next: PackageFile = withConflictsOf(file, {
        ...operation.properties,
        components,
        relationTypes,
        ...(images === undefined ? {} : { images }),
      });
      return {
        state: { ...state, packages: state.packages.map((each) => (each === file ? next : each)) },
        inverse: { op: 'set-package', package: file.id, properties: previous },
      };
    }
  }
}

/** `next` with the conflicts `previous` holds, whatever `next` holds: they change through set-conflicts alone. */
function withConflictsOf<T>(previous: T, next: T): T {
  if (
    typeof previous !== 'object' ||
    previous === null ||
    typeof next !== 'object' ||
    next === null
  ) {
    return next;
  }
  const held = (previous as { conflicts?: FileConflict[] }).conflicts;
  const given = (next as { conflicts?: FileConflict[] }).conflicts;
  if (held === given) return next;
  const copy = { ...next } as T & { conflicts?: FileConflict[] };
  if (held === undefined) delete copy.conflicts;
  else copy.conflicts = held;
  return copy;
}

/** The file a conflict list belongs to, as the project holds it. */
function conflictsOf(state: ProjectSnapshot, file: ConflictFile): FileConflict[] | undefined {
  return (fileOf(state, file) as { conflicts?: FileConflict[] }).conflicts;
}

function fileOf(state: ProjectSnapshot, file: ConflictFile): object {
  switch (file.kind) {
    case 'project':
      return state.project;
    case 'model':
      return state.model;
    case 'package':
      return findPackage(state, file.id);
    case 'view':
      return findView(state, file.id);
    case 'scenario':
    case 'tour':
    case 'comment': {
      const list =
        file.kind === 'scenario'
          ? state.scenarios
          : file.kind === 'tour'
            ? state.tours
            : state.comments;
      const found = (list as readonly { id: Id }[]).find((each) => each.id === file.id);
      if (!found) throw new OperationError(`The project has no ${file.kind} "${file.id}".`);
      return found;
    }
  }
}

/** The project with a file's conflicts set, or taken away. */
function withConflicts(
  state: ProjectSnapshot,
  file: ConflictFile,
  conflicts: FileConflict[] | undefined,
): ProjectSnapshot {
  const set = <T extends object>(value: T): T => {
    const copy = { ...value } as T & { conflicts?: FileConflict[] };
    if (conflicts === undefined || conflicts.length === 0) delete copy.conflicts;
    else copy.conflicts = conflicts;
    return copy;
  };
  switch (file.kind) {
    case 'project':
      return { ...state, project: set(state.project) };
    case 'model':
      return { ...state, model: set(state.model) };
    case 'package': {
      const found = findPackage(state, file.id);
      return {
        ...state,
        packages: state.packages.map((each) => (each === found ? set(each) : each)),
      };
    }
    case 'view': {
      const found = findView(state, file.id);
      return { ...state, views: state.views.map((each) => (each === found ? set(each) : each)) };
    }
    case 'scenario':
    case 'tour':
    case 'comment': {
      const found = fileOf(state, file);
      if (file.kind === 'scenario') {
        return {
          ...state,
          scenarios: state.scenarios.map((each) => (each === found ? set(each) : each)),
        };
      }
      if (file.kind === 'tour') {
        return { ...state, tours: state.tours.map((each) => (each === found ? set(each) : each)) };
      }
      return {
        ...state,
        comments: state.comments.map((each) => (each === found ? set(each) : each)),
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

/** The items of a list of the project. */
export function itemsOf(state: ProjectSnapshot, collection: Collection): readonly Item[] {
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
    case 'images':
      return findPackage(state, collection.package).images ?? [];
    case 'solids':
      return findPackage(state, collection.package).solids ?? [];
    case 'positions':
      return findView(state, collection.view).positions;
    case 'freeShapes':
      return findView(state, collection.view).freeShapes;
    case 'stackingOrder': {
      const order = findView(state, collection.view).stackingOrder;
      // Any string can be an id, `constructor` included, so only the map's own keys count.
      return order !== undefined && Object.hasOwn(order, collection.container)
        ? (order[collection.container] ?? [])
        : [];
    }
    case 'routes':
      return routeEntries(findView(state, collection.view).routes);
    case 'tours':
      return state.tours;
    case 'comments':
      return state.comments;
    case 'explorableTexts':
      return state.explorableTexts ?? [];
  }
}

/** The routes of a view as a list, in the order of its map; none when it keeps no map. */
function routeEntries(routes: Routes | undefined): RouteEntry[] {
  return Object.entries(routes ?? {}).map(([relation, route]) => ({ relation, route }));
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
    case 'images':
      return updatePackage(state, collection.package, (file) =>
        withImages(file, items as ImageDefinition[]),
      );
    case 'solids':
      return updatePackage(state, collection.package, (file) =>
        withSolids(file, items as SolidDefinition[]),
      );
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
    case 'stackingOrder':
      return updateView(state, collection.view, (view) =>
        withStackingList(view, collection.container, items as Id[]),
      );
    case 'routes':
      return updateView(state, collection.view, (view) => withRoutes(view, items as RouteEntry[]));
    case 'tours':
      return { ...state, tours: items as TourFile[] };
    case 'comments':
      return { ...state, comments: items as CommentFile[] };
    case 'explorableTexts':
      return withExplorableTexts(state, items as ExplorableText[]);
  }
}

/**
 * A project with its explorables' texts replaced. A project holding none has no list, rather than an
 * empty one, so that undo gives back the project exactly as it was.
 */
function withExplorableTexts(
  state: ProjectSnapshot,
  texts: readonly ExplorableText[],
): ProjectSnapshot {
  if (texts.length > 0) return { ...state, explorableTexts: [...texts] };
  const without: ProjectSnapshot = { ...state };
  delete without.explorableTexts;
  return without;
}

/**
 * A view with its routes replaced, in the order of the list. A view without routes has no map at
 * all, rather than an empty one, so that undo gives back the view exactly as it was. The map is built
 * with `Object.fromEntries`, so no relation id reaches a prototype.
 */
function withRoutes(view: ViewFile, entries: readonly RouteEntry[]): ViewFile {
  if (entries.length > 0) {
    return {
      ...view,
      routes: Object.fromEntries(entries.map(({ relation, route }) => [relation, route])),
    };
  }
  const without: ViewFile = { ...view };
  delete without.routes;
  return without;
}

/**
 * A view with one stacking list replaced. An empty list is no list, and a view without lists has no
 * stacking order at all: the key goes, rather than staying with an empty value, so that undo gives
 * back the view exactly as it was.
 */
function withStackingList(view: ViewFile, container: Id, items: readonly Id[]): ViewFile {
  const rest = Object.fromEntries(
    Object.entries(view.stackingOrder ?? {}).filter(([key]) => key !== container),
  );
  const next = items.length === 0 ? rest : { ...rest, [container]: [...items] };
  if (Object.keys(next).length > 0) return { ...view, stackingOrder: next };
  const without: ViewFile = { ...view };
  delete without.stackingOrder;
  return without;
}

/**
 * A package with its images replaced. A package without images has no list, rather than an empty
 * one, so that undo gives back the package exactly as it was.
 */
function withSolids(file: PackageFile, solids: readonly SolidDefinition[]): PackageFile {
  if (solids.length > 0) return { ...file, solids: [...solids] };
  const without: PackageFile = { ...file };
  delete without.solids;
  return without;
}

function withImages(file: PackageFile, images: readonly ImageDefinition[]): PackageFile {
  if (images.length > 0) return { ...file, images: [...images] };
  const without: PackageFile = { ...file };
  delete without.images;
  return without;
}

/**
 * Where each key of a list sits, worked out once per list. The list an operation makes from another
 * by replacing an item, or by adding or removing its last one, takes the other's places over, so that
 * a command changing one list thousands of times stays linear.
 */
const placesOfList = new WeakMap<readonly Item[], Map<string, number>>();

function placesOf(collection: Collection, items: readonly Item[]): Map<string, number> {
  let places = placesOfList.get(items);
  if (places === undefined) {
    places = new Map();
    for (const [index, item] of items.entries()) {
      const key = keyOf(collection, item);
      if (!places.has(key)) places.set(key, index);
    }
    placesOfList.set(items, places);
  }
  return places;
}

/** Hands a list's places to the list made from it. The old list works its places out again. */
function movePlaces(from: readonly Item[], to: readonly Item[]): Map<string, number> | undefined {
  const places = placesOfList.get(from);
  if (places === undefined) return undefined;
  placesOfList.delete(from);
  placesOfList.set(to, places);
  return places;
}

/** Whether a list holds an item with this key. */
export function holdsKey(collection: Collection, items: readonly Item[], key: string): boolean {
  return placesOf(collection, items).has(key);
}

function indexOfKey(items: readonly Item[], collection: Collection, key: string): number {
  const index = placesOf(collection, items).get(key);
  if (index === undefined) throw new OperationError(`${describe(collection)} holds no "${key}".`);
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
    case 'images':
    case 'solids':
      return `The ${collection.name} of package "${collection.package}"`;
    case 'positions':
    case 'freeShapes':
    case 'routes':
      return `The ${collection.name} of view "${collection.view}"`;
    case 'stackingOrder':
      return `The stacking order of "${collection.container}" in view "${collection.view}"`;
    default:
      return `The ${collection.name} of the project`;
  }
}
