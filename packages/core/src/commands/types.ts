/**
 * Commands: every change to a project is one. The core checks the rules, turns the command into
 * operations and records it as one action in the undo history, whoever sent it.
 */
import type {
  Appearance,
  Arrow,
  AttributeDefinition,
  BitmapImage,
  Attributes,
  Badge,
  Color,
  Component,
  ConnectionPoint,
  EndAttachment,
  FreeShape,
  Id,
  LimitList,
  Note,
  Perspective,
  Point,
  RelationAppearance,
  RelationType,
  ShapePosition,
  Step,
} from '@visual-anything/schema';

/** A request to change the project. */
export type Command =
  | CreateElementCommand
  | UpdateElementCommand
  | DeleteCommand
  | CreateRelationCommand
  | UpdateRelationCommand
  | CreatePackageCommand
  | DefineComponentCommand
  | RemoveComponentCommand
  | DefineRelationTypeCommand
  | RemoveRelationTypeCommand
  | CreateViewCommand
  | UpdateViewCommand
  | DeleteViewCommand
  | SetPositionsCommand
  | RemovePositionsCommand
  | CreateFreeShapeCommand
  | UpdateFreeShapeCommand
  | DeleteFreeShapesCommand
  | CreateScenarioCommand
  | UpdateScenarioCommand
  | DeleteScenarioCommand
  | UpdateProjectCommand
  | RestackCommand
  | ChangeContainerCommand
  | UpdateComponentCommand
  | UpdateRelationTypeCommand
  | SetComponentAppearanceCommand
  | SetRelationTypeAppearanceCommand
  | UpdatePackageCommand
  | ReorderElementsCommand
  | SetCollapsedCommand
  | DefineImageCommand
  | RemoveImageCommand
  | SetRouteCommand
  | ResetRouteCommand
  | BatchCommand;

/** The kinds of command. */
export type CommandType = Command['type'];

/** A new element. Its id is generated unless given; a given id must be unused. */
export interface NewElement {
  id?: Id;
  component: Id;
  name: string;
  description?: string;
  attributes?: Attributes;
  appearance?: Appearance;
}

/** Creates an element, optionally inside containers and with its shapes placed in views. */
export interface CreateElementCommand {
  type: 'create-element';
  element: NewElement;
  /** The containers to place it in, each through a nesting relation of the given relation type. */
  containers?: { container: Id; relationType: Id }[];
  /**
   * Where its shapes sit in views. A container that draws its contents as rows takes no position:
   * a row's place is its place in the model's order.
   */
  positions?: (Omit<ShapePosition, 'element'> & { view: Id })[];
  /**
   * The element it goes before in the model's order, which is the order of rows; absent, it goes
   * last. Every view still draws its shape in front of the shapes beside it.
   */
  before?: Id;
}

/** Changes an element, World included. `null` removes an optional trait. */
export interface UpdateElementCommand {
  type: 'update-element';
  id: Id;
  changes: {
    name?: string;
    description?: string | null;
    component?: Id;
    /** The element's own appearance, replaced whole; `null` makes it look like its component. */
    appearance?: Appearance | null;
    /** Changes to its own appearance, trait by trait; cannot be combined with `appearance`. */
    appearanceTraits?: AppearanceChanges;
    /** Attribute values to set. */
    attributes?: Attributes;
    /** Attributes to remove. */
    removeAttributes?: string[];
  };
}

/**
 * Changes to an appearance, trait by trait: a value sets a trait, `null` takes it out so that it is
 * inherited again. A trait left out stays as it is.
 */
export interface AppearanceChanges {
  shape?: NonNullable<Appearance['shape']> | null;
  fill?: Color | null;
  stroke?: Color | null;
  width?: number | null;
  height?: number | null;
  /** Each part on its own; `null` for the whole detail takes all of its parts out. */
  detail?: {
    componentName?: boolean | null;
    attributes?: string[] | null;
    badges?: Badge[] | null;
  } | null;
  contentsAsRows?: boolean | null;
  /** An empty list has relations attach anywhere on the border, whatever is inherited. */
  connectionPoints?: ConnectionPoint[] | null;
}

/** Changes to how a relation type's relations are drawn, trait by trait, as for an appearance. */
export interface RelationAppearanceChanges {
  stroke?: Color | null;
  width?: number | null;
  dash?: NonNullable<RelationAppearance['dash']> | null;
}

/**
 * Changes to the attributes a definition defines itself, applied in this order: rename, set, remove,
 * order.
 */
export interface AttributeChanges {
  /**
   * Its own attributes renamed. Values held under the old name move to the new one on every element
   * or relation that gets the attribute from this definition, and so do the detail attributes and
   * badges of this definition, of those deriving from it and of elements' own appearances that name
   * it; where a nearer definition redefines the name, nothing moves.
   */
  rename?: { from: string; to: string }[];
  /**
   * Attributes it defines: a new name goes after its others; a name it already defines is redefined
   * in place, and one only its chain defines is redefined here.
   */
  set?: AttributeDefinition[];
  /** Its own attributes it stops defining; values already held stay. */
  remove?: string[];
  /** Its own attributes in this order; those left out keep their order after them. */
  order?: string[];
}

/** Changes a component of one of the project's own packages, trait by trait; the rest stays. */
export interface UpdateComponentCommand {
  type: 'update-component';
  id: Id;
  changes: {
    name?: string;
    description?: string | null;
    derivesFrom?: Id;
    appearance?: AppearanceChanges;
    attributes?: AttributeChanges;
  };
}

/** Changes a relation type of one of the project's own packages, trait by trait; the rest stays. */
export interface UpdateRelationTypeCommand {
  type: 'update-relation-type';
  id: Id;
  changes: {
    name?: string;
    description?: string | null;
    derivesFrom?: Id;
    /** `null` inherits the direction again. */
    direction?: 'directed' | 'undirected' | null;
    /**
     * `null` inherits whether it nests again. Its relations must keep nesting without a cycle, and it
     * cannot stop nesting while a view nests by it.
     */
    nests?: boolean | null;
    appearance?: RelationAppearanceChanges;
    attributes?: AttributeChanges;
    /** Per end: a list or `any` sets its own limit; `null` inherits it again. */
    limits?: { from?: LimitList | 'any' | null; to?: LimitList | 'any' | null };
  };
}

/**
 * Changes how every element of a component is drawn, at the level the project can change it (ADR-0034):
 * for a component the project cannot change, one of a built-in package or Essence, its project
 * appearance, kept in the project file; for one of the project's own, its appearance in its package,
 * and an entry the project file kept for it goes in the same action. Give either `appearance` or
 * `appearanceTraits`. With `appearance: null`, an entry the project file keeps for a component no
 * package in use defines is forgotten.
 */
export interface SetComponentAppearanceCommand {
  type: 'set-component-appearance';
  component: Id;
  /** The appearance at that level, replaced whole; `null` removes it, and `{}` is none. */
  appearance?: Appearance | null;
  /** Changes to the appearance at that level, trait by trait; `null` takes a trait out. */
  appearanceTraits?: AppearanceChanges;
}

/**
 * Changes how every relation of a relation type is drawn, at the level the project can change it:
 * built-in relation types and "relates to" in the project file, the project's own in their package.
 * Give either `appearance` or `appearanceTraits`.
 */
export interface SetRelationTypeAppearanceCommand {
  type: 'set-relation-type-appearance';
  relationType: Id;
  /** The appearance at that level, replaced whole; `null` removes it, and `{}` is none. */
  appearance?: RelationAppearance | null;
  /** Changes to the appearance at that level, trait by trait; `null` takes a trait out. */
  appearanceTraits?: RelationAppearanceChanges;
}

/** Changes the name or description of one of the project's own packages. */
export interface UpdatePackageCommand {
  type: 'update-package';
  id: Id;
  changes: { name?: string; description?: string | null };
}

/**
 * Moves elements in the model's order, which is the order of rows: the listed ones, in the order
 * listed. Every view keeps drawing its shapes in the order it drew them: where the model's order
 * would change that, the view's stacking lists are rewritten in the same action. Rows follow the new
 * order.
 */
export interface ReorderElementsCommand {
  type: 'reorder-elements';
  /** The elements to move; World cannot move. */
  elements: Id[];
  /** The element they go before; absent, they go last. It cannot be one of them. */
  before?: Id;
}

/**
 * Collapses containers in a view, or expands them. A collapsed container's shapes show none of its
 * contents; the relations to and from them are drawn as aggregated relations. It changes only the
 * view's file.
 */
export interface SetCollapsedCommand {
  type: 'set-collapsed';
  view: Id;
  elements: Id[];
  collapsed: boolean;
}

/** Deletes elements and relations, and every relation that ends on anything deleted. */
export interface DeleteCommand {
  type: 'delete';
  elements?: Id[];
  relations?: Id[];
}

/** A new relation. Its id is generated unless given; a given id must be unused. */
export interface NewRelation {
  id?: Id;
  relationType: Id;
  from: Id;
  to: Id;
  name?: string;
  description?: string;
  attributes?: Attributes;
  /** An appearance of its own, which is a particularity; `{}` is none. */
  appearance?: RelationAppearance;
}

/** Creates a relation between elements or relations. */
export interface CreateRelationCommand {
  type: 'create-relation';
  relation: NewRelation;
}

/** Changes a relation. `null` removes an optional trait. */
export interface UpdateRelationCommand {
  type: 'update-relation';
  id: Id;
  changes: {
    relationType?: Id;
    from?: Id;
    to?: Id;
    name?: string | null;
    description?: string | null;
    attributes?: Attributes;
    removeAttributes?: string[];
    /** The relation's own appearance, replaced whole; `null` makes it look like its relation type. */
    appearance?: RelationAppearance | null;
    /** Changes to its own appearance, trait by trait; cannot be combined with `appearance`. */
    appearanceTraits?: RelationAppearanceChanges;
  };
}

/** Creates an empty package of the project's own and starts using it. */
export interface CreatePackageCommand {
  type: 'create-package';
  package: { id: Id; name: string; description?: string };
}

/** A new component or relation type: without an id, the core makes one with `definitionIdFor`. */
export type NewComponent = Omit<Component, 'id'> & { id?: Id };

/** A new relation type: without an id, the core makes one with `definitionIdFor`. */
export type NewRelationType = Omit<RelationType, 'id'> & { id?: Id };

/**
 * Defines a component in one of the project's packages, or redefines one it already has. Without an
 * id, the core makes one, so the component is new.
 */
export interface DefineComponentCommand {
  type: 'define-component';
  package: Id;
  component: NewComponent;
  /**
   * Creates only: refused with `id-taken` when the package already has this id, so that the app and
   * Claude never overwrite each other's new definitions. Without it, an existing id is redefined.
   */
  createOnly?: true;
}

/** Removes a component that no element is created from and no component derives from. */
export interface RemoveComponentCommand {
  type: 'remove-component';
  id: Id;
}

/**
 * Defines a relation type in one of the project's packages, or redefines one it already has. Without
 * an id, the core makes one, so the relation type is new.
 */
export interface DefineRelationTypeCommand {
  type: 'define-relation-type';
  package: Id;
  relationType: NewRelationType;
  /** Creates only: refused with `id-taken` when the package already has this id. */
  createOnly?: true;
}

/** Removes a relation type that no relation, relation type or view uses. */
export interface RemoveRelationTypeCommand {
  type: 'remove-relation-type';
  id: Id;
}

/** Creates a view. Without nesting relation types, every relation type that nests arranges it. */
export interface CreateViewCommand {
  type: 'create-view';
  view: {
    id?: Id;
    name: string;
    description?: string;
    perspective: Perspective;
    nestingRelationTypes?: Id[];
  };
}

/** Changes a view's name, description, perspective or nesting relation types. */
export interface UpdateViewCommand {
  type: 'update-view';
  id: Id;
  changes: {
    name?: string;
    description?: string | null;
    perspective?: Perspective;
    nestingRelationTypes?: Id[];
  };
}

/** Deletes a view that no scenario plays over. */
export interface DeleteViewCommand {
  type: 'delete-view';
  id: Id;
}

/** Sets where anchored shapes sit in a view: shapes moved by hand are pinned, layout's are not. */
export interface SetPositionsCommand {
  type: 'set-positions';
  view: Id;
  positions: ShapePosition[];
}

/** Forgets where anchored shapes sit in a view, so that layout places them again. */
export interface RemovePositionsCommand {
  type: 'remove-positions';
  view: Id;
  positions: { element: Id; container?: Id }[];
}

/** A new free shape. Its id is generated unless given. */
export type NewFreeShape = (Omit<Note, 'id'> | Omit<Arrow, 'id'>) & { id?: Id };

/** Adds a free shape to a view. */
export interface CreateFreeShapeCommand {
  type: 'create-free-shape';
  view: Id;
  shape: NewFreeShape;
}

/** Replaces a free shape of a view. */
export interface UpdateFreeShapeCommand {
  type: 'update-free-shape';
  view: Id;
  shape: FreeShape;
}

/** Deletes free shapes from a view. */
export interface DeleteFreeShapesCommand {
  type: 'delete-free-shapes';
  view: Id;
  ids: Id[];
}

/** A step of a scenario being created or changed. Its id is generated unless given. */
export type NewStep = Omit<Step, 'id'> & { id?: Id };

/** Creates a scenario over a view. */
export interface CreateScenarioCommand {
  type: 'create-scenario';
  scenario: { id?: Id; name: string; description?: string; view: Id; steps: NewStep[] };
}

/** Changes a scenario; `steps` replaces all of them. */
export interface UpdateScenarioCommand {
  type: 'update-scenario';
  id: Id;
  changes: { name?: string; description?: string | null; view?: Id; steps?: NewStep[] };
}

/** Deletes a scenario. */
export interface DeleteScenarioCommand {
  type: 'delete-scenario';
  id: Id;
}

/** Changes the project's name, description or the packages it uses. */
export interface UpdateProjectCommand {
  type: 'update-project';
  changes: { name?: string; description?: string | null; packages?: Id[] };
}

/**
 * An anchored shape, by its element and the container its shape sits in: none, or World's id, when it
 * sits directly in World.
 */
export interface StackedShape {
  element: Id;
  container?: Id;
}

/** Where a shape goes among the shapes beside it: the front, the back, or just in front of or behind one of them. */
export type StackingPlace = 'front' | 'back' | { inFrontOf: Id } | { behind: Id };

/** Changes the order in which a view draws shapes that sit together, one move after another, as one action. */
export interface RestackCommand {
  type: 'restack';
  view: Id;
  moves: { shape: StackedShape; to: StackingPlace }[];
}

/**
 * Puts elements inside a container in a view, or takes them out of the containers their shapes sit
 * in, as one action. Each element whose shape leaves a container loses the relations of the view's
 * nesting relation types from it to that container, with the relations that end on them. It then sits
 * inside `to` through one relation of a nesting relation type, unless it already does, and comes to
 * the front of the stacking order there. A shape whose `from` equals `to` only gets its position.
 */
export interface ChangeContainerCommand {
  type: 'change-container';
  view: Id;
  /** The container the shapes go into; absent, or World's id, to take them out to World. */
  to?: Id;
  /**
   * The nesting relation type that puts them inside `to`. By default, for each element: the type of
   * the relations that placed it where it was, when they are all of one type, however many; otherwise
   * the view's first nesting relation type.
   */
  relationType?: Id;
  shapes: {
    element: Id;
    /** The container its shape sits in now; absent, or World's id, when it sits directly in World. */
    from?: Id;
    /**
     * Where its shape goes, relative to the shape of `to`, or to the canvas in World. Without it, a
     * position stored there before is used, or layout places the shape.
     */
    at?: { x: number; y: number; width?: number; height?: number };
    /**
     * Whether `at` is kept pinned, as a place someone chose by hand (the default, as for a drop), or
     * left for layout to change, as a place the program chose beside the container is.
     */
    pinned?: boolean;
  }[];
}

/** Several commands done as one action and undone together. */
export interface BatchCommand {
  type: 'batch';
  /** How the history names the action. */
  label: string;
  commands: Command[];
}

/**
 * A new image, as SVG text or as a bitmap's format and bytes in base64; the core cleans it before
 * storing it. Without an id, the core makes one from its package's id and its name.
 */
export type NewImage = { id?: Id; name: string; source?: string } & (
  { svg: string } | { format: BitmapImage['format']; data: string }
);

/** Defines an image in one of the project's own packages, or redefines one it already has. */
export interface DefineImageCommand {
  type: 'define-image';
  package: Id;
  image: NewImage;
  /** Creates only: refused with `id-taken` when the package already has this id. */
  createOnly?: true;
}

/** Removes an image that no appearance shows. */
export interface RemoveImageCommand {
  type: 'remove-image';
  id: Id;
}

/** How a relation's line runs through its bend points: orthogonal, the default, straight or curved. */
export type RouteStyle = 'orthogonal' | 'straight' | 'curved';

/**
 * Routes a relation by hand in a view, as one action (ADR 0039). It changes only what it names, and
 * the view keeps only what differs from the automatic route: when nothing does, the route goes.
 */
export interface SetRouteCommand {
  type: 'set-route';
  view: Id;
  relation: Id;
  /**
   * Where the line attaches to the relation's `from` end: one of its connection points, or a place
   * on its border. `null` attaches it automatically again.
   */
  from?: EndAttachment | null;
  /** Where the line attaches to the relation's `to` end; `null` attaches it automatically again. */
  to?: EndAttachment | null;
  /**
   * The points the line passes through, in order from its `from` end, in canvas units relative to
   * the shape of `container`; `null` or an empty list removes them. At most 64.
   */
  bendPoints?: Point[] | null;
  /**
   * The container whose shape `bendPoints` are given relative to: World's id for the canvas, or a
   * container that holds the shapes of both ends in the view. Left out, the nearest one that does,
   * which `routeOf` gives as `frame`. Only with bend points.
   */
  container?: Id;
  /** `orthogonal` is the default, and stores nothing. */
  style?: RouteStyle;
}

/**
 * Routes relations automatically again in a view, as one action: their routes go. Relations the
 * view routes automatically already are left as they are.
 */
export interface ResetRouteCommand {
  type: 'reset-route';
  view: Id;
  relations: Id[];
}
