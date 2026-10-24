/**
 * Commands: every change to a project is one. The core checks the rules, turns the command into
 * operations and records it as one action in the undo history, whoever sent it.
 */
import type {
  Appearance,
  Arrow,
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

/** Several commands done as one action and undone together. */
export interface BatchCommand {
  type: 'batch';
  /** How the history names the action. */
  label: string;
  commands: Command[];
}
