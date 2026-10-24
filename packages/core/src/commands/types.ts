/**
 * Commands: every change to a project is one. The core checks the rules, turns the command into
 * operations and records it as one action in the undo history, whoever sent it.
 */
import type {
  Appearance,
  Arrow,
  BitmapImage,
  Attributes,
  Component,
  FreeShape,
  Id,
  Note,
  Perspective,
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
  | DefineImageCommand
  | RemoveImageCommand
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
  /** Where its shapes sit in views. */
  positions?: (Omit<ShapePosition, 'element'> & { view: Id })[];
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
    /** Attribute values to set. */
    attributes?: Attributes;
    /** Attributes to remove. */
    removeAttributes?: string[];
  };
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
  };
}

/** Creates an empty package of the project's own and starts using it. */
export interface CreatePackageCommand {
  type: 'create-package';
  package: { id: Id; name: string; description?: string };
}

/** Defines a component in one of the project's packages, or redefines one it already has. */
export interface DefineComponentCommand {
  type: 'define-component';
  package: Id;
  component: Component;
}

/** Removes a component that no element is created from and no component derives from. */
export interface RemoveComponentCommand {
  type: 'remove-component';
  id: Id;
}

/** Defines a relation type in one of the project's packages, or redefines one it already has. */
export interface DefineRelationTypeCommand {
  type: 'define-relation-type';
  package: Id;
  relationType: RelationType;
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
