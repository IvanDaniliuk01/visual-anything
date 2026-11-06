/**
 * Commands: every change to a project is one. The core checks the rules, turns the command into
 * operations and records it as one action in the undo history, whoever sent it.
 */
import type { ConflictFile } from '../operations';
import type { OrganizedEntry } from '../view-folders';
import type {
  CaptionFace,
  TourEmphasis,
  Appearance,
  AppearanceImage,
  AppearanceSolid,
  Arrow,
  AttributeDefinition,
  Attributes,
  Badge,
  BitmapImage,
  Color,
  CommentAnchor,
  CommentAuthor,
  Component,
  ConnectionPoint,
  DecisionBlock,
  EndAttachment,
  ExternalId,
  ExternalIds,
  Face,
  FaceVariant,
  Gradient,
  PackageExtensions,
  FreeGeometry,
  FreeShape,
  Id,
  LevelOfDetail,
  LimitList,
  Note,
  Overlay,
  PackageFile,
  PartReference,
  Pose,
  Perspective,
  Point,
  RelationAppearance,
  RelationType,
  RelationTypeLeftOut,
  Scope,
  ShapePosition,
  SolidCamera,
  SolidDefinition,
  Step,
  TourStep,
  TextStyle,
  Picture,
} from '@visual-anything/schema';

/** Changes to external identifiers by scheme: a text sets one, `null` takes it out (ADR 0056). */
export type ExternalIdChanges = Record<string, ExternalId | null>;

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
  | OrganizeViewsCommand
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
  // Duplicates (ADR 0103).
  | DuplicateElementsCommand
  | UpdateComponentCommand
  | UpdateRelationTypeCommand
  | SetComponentAppearanceCommand
  | SetRelationTypeAppearanceCommand
  | UpdatePackageCommand
  | AddPackageCommand
  | ReplacePackageCommand
  | ReorderElementsCommand
  | SetPosesCommand
  | SetCollapsedCommand
  | SetScopeCommand
  | AddToViewCommand
  | LeaveOutOfViewCommand
  | SetRelationTypesLeftOutCommand
  | DefineImageCommand
  | RemoveImageCommand
  | DefineSolidCommand
  | UpdateSolidCommand
  | RemoveSolidCommand
  | SetRouteCommand
  | ResetRouteCommand
  | SetPackageCodeCommand
  // Tours (ADR 0058).
  | CreateTourCommand
  | UpdateTourCommand
  | DeleteTourCommand
  | SetOverlaysCommand
  | SetDrawingDefaultsCommand
  | AddOverlayCommand
  | UpdateOverlayCommand
  | RemoveOverlaysCommand
  | MoveOverlayCommand
  | CreateThreadCommand
  | AddCommentCommand
  | EditCommentCommand
  | ResolveThreadCommand
  | DeleteThreadCommand
  | ResolveConflictsCommand
  | BatchCommand;

/**
 * Resolves conflicts a merge left in one file (ADR 0072): each one kept as the file holds it, or its
 * other choice taken. With the file's last conflict, its `conflicts` list goes.
 */
export interface ResolveConflictsCommand {
  type: 'resolve-conflicts';
  file: ConflictFile;
  resolutions: { conflict: Id; take: 'kept' | 'other' }[];
}

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
  /** What it is in other catalogs, by scheme (ADR 0056). */
  ids?: ExternalIds;
  /** Where it is in physical space (ADR 0076), measured from World or one of the containers given. */
  pose?: Pose;
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
  /**
   * The view it is made in, as the app sends it: when that view's scope would not show it, it goes
   * into the scope's `added` list in the same action (ADR 0040). The views of its positions count too.
   */
  inView?: Id;
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
    /** Its external identifiers by scheme: a text sets one, `null` takes it out; `null` takes all out. */
    ids?: ExternalIdChanges | null;
    /** Where it is in physical space (ADR 0076); `null` takes it out of physical space. */
    pose?: Pose | null;
  };
}

/**
 * Sets the poses of several elements as one action (ADR 0076), as a gesture in the physical-space
 * panel ends: each pose replaced whole, `null` taking it out. Each element once.
 */
export interface SetPosesCommand {
  type: 'set-poses';
  poses: { element: Id; pose: Pose | null }[];
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
    lines?: number | null;
  } | null;
  textPlacement?: NonNullable<Appearance['textPlacement']> | null;
  contentsAsRows?: boolean | null;
  /** An empty list has relations attach anywhere on the border, whatever is inherited. */
  connectionPoints?: ConnectionPoint[] | null;
  /** The image its shapes show; `none` shows none, whatever is inherited (ADR 0027). */
  image?: AppearanceImage | 'none' | null;
  /** The solid its shapes show; `none` shows none, whatever is inherited (ADR 0075). */
  solid?: AppearanceSolid | 'none' | null;
  /** Its shapes' own outline (ADR 0066); `none` takes an inherited one away. */
  geometry?: FreeGeometry | 'none' | null;
  /** The named part its shapes are drawn as (ADR 0067); `none` takes an inherited one away. */
  part?: PartReference | 'none' | null;
  /**
   * What its shapes show from each scale up (ADR 0055), stored in increasing order of the scales; an
   * empty list follows the canvas's own steps, whatever is inherited.
   */
  levels?: LevelOfDetail[] | null;
  /** The scale from which its collapsed shapes expand as the canvas zooms into them (ADR 0055). */
  expandFrom?: number | null;
  /**
   * Its face (ADR 0083), each part on its own; `none` takes an inherited face away, and `null` for
   * the whole face takes all of its parts out.
   */
  face?:
    | {
        size?: NonNullable<Face['size']> | null;
        markup?: string[] | null;
        style?: string[] | null;
        variants?: FaceVariant[] | null;
        collapsed?: string | null;
      }
    | 'none'
    | null;
  /** The width of its border (ADR 0088), from 0 to 16. */
  borderWidth?: number | null;
  /** How its border is drawn (ADR 0088). */
  dash?: NonNullable<Appearance['dash']> | null;
  /** Its corner radius (ADR 0088), from 0 to 64. */
  cornerRadius?: number | null;
  /** How opaque its shapes are (ADR 0088), from 0.2 to 1. */
  opacity?: number | null;
  shadow?: NonNullable<Appearance['shadow']> | null;
  /** A gradient to a second color (ADR 0088); `none` takes an inherited one away. */
  gradient?: Gradient | 'none' | null;
  /** How its shapes write the name (ADR 0088), each part on its own; `null` takes every part out. */
  text?: { [K in keyof TextStyle]?: TextStyle[K] | null } | null;
}

/** Changes to how a relation type's relations are drawn, trait by trait, as for an appearance. */
export interface RelationAppearanceChanges {
  stroke?: Color | null;
  width?: number | null;
  dash?: NonNullable<RelationAppearance['dash']> | null;
  /** The style of its relations' automatic routes (ADR 0069); `orthogonal` undoes an inherited one. */
  route?: RouteStyle | null;
  /** How opaque its lines are (ADR 0088), from 0.2 to 1. */
  opacity?: number | null;
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
    /** Its external identifiers by scheme: a text sets one, `null` takes it out; `null` takes all out. */
    ids?: ExternalIdChanges | null;
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
    /** Its external identifiers by scheme: a text sets one, `null` takes it out; `null` takes all out. */
    ids?: ExternalIdChanges | null;
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

/**
 * Changes the name, description, version, license or attribution of one of the project's own
 * packages; `null` takes one out.
 */
export interface UpdatePackageCommand {
  type: 'update-package';
  id: Id;
  changes: {
    name?: string;
    description?: string | null;
    version?: string | null;
    license?: string | null;
    attribution?: string | null;
  };
}

/**
 * Adds a copy of a package from another project, as that project holds it: its components, relation
 * types and images, keeping their ids, and starts using it, with the built-in packages it needs, as
 * one action (R39, ADR 0051). Its images are cleaned, as `define-image` cleans them. A clash of ids
 * with the project is refused, saying every id that clashes.
 */
export interface AddPackageCommand {
  type: 'add-package';
  package: PackageFile;
}

/**
 * Updates one of the project's own packages to another version of it, such as the one in the project
 * it was copied from, as one action: its properties, components, relation types and images become
 * those given. Removing what the project still uses, or a clash of ids, is refused.
 */
export interface ReplacePackageCommand {
  type: 'replace-package';
  package: PackageFile;
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

/**
 * Gives a view a scope, the part of the model it shows (ADR 0040), or takes it away with `null`, so
 * that the view shows the whole model. It changes only the view's file.
 */
export interface SetScopeCommand {
  type: 'set-scope';
  view: Id;
  scope: Scope | null;
}

/**
 * Shows elements in a view whatever its scope's rules say: they leave its `leftOut` list, and go into
 * its `added` list unless the rules show them already. A view without a scope shows them already.
 */
export interface AddToViewCommand {
  type: 'add-to-view';
  view: Id;
  elements: Id[];
}

/**
 * Leaves elements out of a view, never out of the model: they leave its scope's `added` list, and go
 * into its `leftOut` list unless the rules leave them out already. A view without a scope gets one.
 */
export interface LeaveOutOfViewCommand {
  type: 'leave-out-of-view';
  view: Id;
  elements: Id[];
}

/**
 * Sets the relation types a view leaves out (ADR 0064), replacing its list: their relations it does
 * not draw, each with the relation types derived from it unless `exactly`. An empty list draws them
 * all again. It refuses a relation type the view nests by, and changes only the view's file.
 */
export interface SetRelationTypesLeftOutCommand {
  type: 'set-relation-types-left-out';
  view: Id;
  relationTypes: RelationTypeLeftOut[];
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
  package: {
    id: Id;
    name: string;
    description?: string;
    version?: string;
    license?: string;
    attribution?: string;
  };
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
  /** The folder of the view list it is filed in, last (ADR 0101); none files it nowhere. */
  folder?: Id;
}

/**
 * Files the project's views in folders (ADR 0101): the whole tree of the view list, which replaces the
 * one the project keeps. A folder without an id is a new one, which the core names.
 */
export interface OrganizeViewsCommand {
  type: 'organize-views';
  viewFolders: OrganizedEntry[];
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
    /**
     * How the view draws the automatic routes of relations whose appearances set none (ADR 0069);
     * `null` draws them orthogonal again.
     */
    routeStyle?: 'straight' | 'curved' | null;
    /**
     * Which rows its shapes that draw rows draw (ADR 0080, section 5): only key rows with `keys`;
     * every row with `all` or `null`, which leave it out of the file.
     */
    rows?: 'all' | 'keys' | null;
    /**
     * Whether selecting fades the lines that do not touch the selection (ADR 0080, section 5):
     * `false` turns it off; `true` or `null` turn it on again, which leaves it out of the file.
     */
    selectionFadesLines?: boolean | null;
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
  positions: PositionChange[];
}

/**
 * A position a command sets (ADR 0088): a shape's position, where a rotation of `0` and a flip of
 * `none` take a stored turn or mirroring out, and leaving either out keeps what is stored.
 */
export type PositionChange = Omit<ShapePosition, 'rotation' | 'flip'> & {
  rotation?: number;
  flip?: NonNullable<ShapePosition['flip']> | 'none';
};

/** Forgets where anchored shapes sit in a view, so that layout places them again. */
export interface RemovePositionsCommand {
  type: 'remove-positions';
  view: Id;
  positions: { element: Id; container?: Id }[];
}

/** A new free shape. Its id is generated unless given. */
export type NewFreeShape = (Omit<Note, 'id'> | Omit<Arrow, 'id'> | Omit<Picture, 'id'>) & {
  id?: Id;
};

/** Adds a free shape to a view. */
export interface CreateFreeShapeCommand {
  type: 'create-free-shape';
  view: Id;
  shape: NewFreeShape;
}

/**
 * Changes a free shape of a view: either replaced whole with `shape`, as the app sends it, or changed
 * part by part with `id` and `changes`, merged over the shape as it is stored (ADR 0104).
 */
export interface UpdateFreeShapeCommand {
  type: 'update-free-shape';
  view: Id;
  /** The free shape whole, with its id, replacing the one stored. Not with `id` and `changes`. */
  shape?: FreeShape;
  /** The free shape to change part by part, with `changes`. */
  id?: Id;
  /** Its parts to change; what they leave out stays, and `null` takes an optional part out. */
  changes?: FreeShapeChanges;
}

/**
 * Changes to a free shape's parts, each one its kind has: a note's `x`, `y`, `width`, `height`,
 * `text`, `fill` and `stroke`; an arrow's `from`, `to` and `stroke`; a picture's `x`, `y`, `width`,
 * `height`, `media` and `name`. `null` takes a color or a picture's name out. Its kind and id stay.
 */
export interface FreeShapeChanges {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  fill?: Color | null;
  stroke?: Color | null;
  from?: Point;
  to?: Point;
  media?: Picture['media'];
  name?: string | null;
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
  scenario: {
    id?: Id;
    name: string;
    description?: string;
    view: Id;
    steps: NewStep[];
    /** Its decisions, over its steps by id (ADR 0078). */
    blocks?: DecisionBlock[];
  };
}

/** Changes a scenario; `steps` replaces all of them. */
export interface UpdateScenarioCommand {
  type: 'update-scenario';
  id: Id;
  changes: {
    name?: string;
    description?: string | null;
    view?: Id;
    steps?: NewStep[];
    /**
     * Its decisions (ADR 0078), replacing all of them; `null` takes them away. Left out, a change of
     * its steps keeps them, without the steps it takes away.
     */
    blocks?: DecisionBlock[] | null;
  };
}

/** Deletes a scenario. */
export interface DeleteScenarioCommand {
  type: 'delete-scenario';
  id: Id;
}

/**
 * A step of a tour being created or changed (ADR 0058). Its id is kept when it names a step of the
 * tour, and generated otherwise. A step kept exactly as it was may still name what the project no
 * longer holds: it stays, flagged, until it is fixed.
 */
export type NewTourStep = Omit<TourStep, 'id'> & { id?: Id };

/** Creates a tour, with its steps or none yet. */
export interface CreateTourCommand {
  type: 'create-tour';
  tour: {
    id?: Id;
    name: string;
    description?: string;
    steps?: NewTourStep[];
    captionFace?: CaptionFace;
    /** How its steps mark what they mark (ADR 0100); left out, with a halo. */
    emphasis?: TourEmphasis;
  };
}

/**
 * Changes a tour. `steps` replaces all of them, so that adding, editing, duplicating, reordering and
 * deleting steps are each one action.
 */
export interface UpdateTourCommand {
  type: 'update-tour';
  id: Id;
  changes: {
    name?: string;
    description?: string | null;
    steps?: NewTourStep[];
    /** The look of its caption cards (ADR 0096); `null` takes it away. */
    captionFace?: CaptionFace | null;
    /** How its steps mark what they mark (ADR 0100); `null`, as `halo`, takes it away. */
    emphasis?: TourEmphasis | null;
  };
}

/** Deletes a tour. */
export interface DeleteTourCommand {
  type: 'delete-tour';
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

/**
 * Makes duplicates of elements in a view, as one action (ADR 0103): each a new element with its
 * original's component, attributes, description and appearance; with it, duplicates of everything its
 * original holds, at any depth through every nesting relation type, and of the relations among
 * everything duplicated, between the duplicates. Relations to anything else are not duplicated.
 *
 * The duplicates of the given elements that sit in no other duplicate land inside `container`, through
 * the nesting relation type the view chooses for creating an element there (`nestingTypeFor`), which
 * the same action makes the view nest by when it does not yet; or directly in World. With `beside`,
 * each lands instead in the containers its original sits in, through the same nesting relations. A
 * duplicate that lands in a container its original sits in, World included, has `suffix` after its
 * name. The view shows every duplicate whose original it showed, and every one that lands.
 *
 * `created` lists the duplicates of the given elements first, in their order, then the duplicates of
 * what they hold, in the model's order, then the new relations.
 */
export interface DuplicateElementsCommand {
  type: 'duplicate-elements';
  /** The view they are duplicated in, whose nesting relation types say what sits where. */
  view: Id;
  elements: Id[];
  /** The container they land in; absent, or World's id, for World. Not with `beside`. */
  container?: Id;
  /** Whether each lands in the containers its original sits in, beside it. */
  beside?: boolean;
  /**
   * Where the shapes of the duplicates that land go, by the id of the given element: relative to the
   * shape of the container they land in, or to the canvas in World, left for layout to change. One
   * without a place, or in a container that draws rows, is placed by layout. The duplicates of what
   * they hold keep their originals' places inside them. With `beside`, a place may name the
   * container whose shape it is relative to, for an original that sits in several; a place without
   * one goes in every container that has no place of its own.
   */
  positions?: { element: Id; container?: Id; x: number; y: number }[];
  /** What a duplicate landing where its original sits adds to its name; " (copy)" by default. */
  suffix?: string;
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
export type NewImage = { id?: Id; name: string; source?: string; license?: string } & (
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

/**
 * Defines a solid in one of the project's own packages, or replaces one's file (ADR 0075). Only the
 * local program sends it, for a file it cleaned and holds, with the description it worked out; the
 * core checks the definition's form and the package's caps, never the file.
 */
export interface DefineSolidCommand {
  type: 'define-solid';
  package: Id;
  solid: SolidDefinition;
  /** Creates only: refused with `id-taken` when the package already has this id. */
  createOnly?: true;
  /** The file the solid came from, for the history's name: `Import "arm.glb" as a solid`. */
  fileName?: string;
}

/** Changes what a solid says about itself: its name, description, source, license and camera. */
export interface UpdateSolidCommand {
  type: 'update-solid';
  id: Id;
  changes: {
    name?: string;
    /** `null` takes it away. */
    description?: string | null;
    source?: string | null;
    license?: string | null;
    camera?: SolidCamera;
  };
}

/** Removes a solid that no appearance shows. Its file stays in `solids/`. */
export interface RemoveSolidCommand {
  type: 'remove-solid';
  id: Id;
}

/** How a relation's line runs through its bend points: orthogonal, straight or curved (ADR 0069). */
export type { RouteStyle } from '@visual-anything/schema';
import type { DrawingDefaults, RouteStyle } from '@visual-anything/schema';

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
  /** Stored only when it differs from the relation's automatic style (ADR 0069). */
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

/**
 * Writes the code of one of the project's own packages, the capabilities it declares, or both, as one
 * action (ADR 0054). Storing code runs nothing: it runs once the person approves it by its hash, and
 * any change here changes the hash, so the person is asked again.
 */
export interface SetPackageCodeCommand {
  type: 'set-package-code';
  package: Id;
  /**
   * One module of JavaScript, as its text or as its lines; `null` removes it, with its capabilities.
   * Left out, the code stays as it is.
   */
  code?: string | string[] | null;
  /**
   * What the code may reach beyond its element: `model:read`, `time`, `network:<origin>`; kept
   * sorted. `null` or an empty list removes them; left out, they stay as they are.
   */
  capabilities?: string[] | null;
  /**
   * What the code adds to the app (ADR 0089): its actions, importers, exporters and panels. `null`
   * removes them; left out, they stay as they are. They go with the code, as its capabilities do.
   */
  extensions?: PackageExtensions | null;
}

// Overlays (ADR 0055) --------------------------------------------------------------------------------

/**
 * A new overlay: without an id, the core makes one from its attribute and channel, unused in the view.
 * A value a case names may be given as a number or true or false; it is kept as text, as filters
 * compare it.
 */
export type NewOverlay = Overlay extends infer O
  ? O extends Overlay
    ? Omit<O, 'id'> & { id?: Id }
    : never
  : never;

/**
 * Sets the drawing defaults of the project, or of one view, whole (ADR 0086): what it gives replaces
 * what was there, and `null` goes back to the preset as built in, or, for a view, to the project's.
 * It changes only the project file or that view's file.
 */
export interface SetDrawingDefaultsCommand {
  type: 'set-drawing-defaults';
  /** The view whose drawing defaults change; left out, the project's. */
  view?: Id;
  drawing: DrawingDefaults | null;
}

/**
 * Replaces a view's overlays, in order, as one action: the first that sets a channel of a shape sets
 * it. An empty list takes them all away. It changes only the view's file.
 */
export interface SetOverlaysCommand {
  type: 'set-overlays';
  view: Id;
  overlays: NewOverlay[];
}

/** Adds an overlay to a view: before another, or after the others. */
export interface AddOverlayCommand {
  type: 'add-overlay';
  view: Id;
  overlay: NewOverlay;
  /** The overlay it goes before; absent, it goes last, so the others come first. */
  before?: Id;
}

/** Changes one overlay of a view, part by part; what it leaves out stays. */
export interface UpdateOverlayCommand {
  type: 'update-overlay';
  view: Id;
  overlay: Id;
  changes: {
    /** `null` takes the name away, so that the legend calls it by its attribute. */
    name?: string | null;
    of?: Overlay['of'];
    attribute?: string;
    /** A new channel takes a mapping that fits it: give it too, unless the one kept fits. */
    channel?: Overlay['channel'];
    mapping?: Overlay['mapping'];
    /** Turns it off, kept in the view, or on again. */
    off?: boolean;
  };
}

/** Removes overlays from a view. */
export interface RemoveOverlaysCommand {
  type: 'remove-overlays';
  view: Id;
  overlays: Id[];
}

/** Moves an overlay of a view before another, or after the others. */
export interface MoveOverlayCommand {
  type: 'move-overlay';
  view: Id;
  overlay: Id;
  /** The overlay it goes before; absent, it goes last. */
  before?: Id;
}

// ——— Comments (ADR 0059) ———

/**
 * A comment being written: the first of a new thread, or a reply. Its id is generated unless given.
 * The person's comments carry their author, as their preferences name them; Claude's are signed as
 * Claude and may leave it out. The time is the program's.
 */
export interface NewComment {
  id?: Id;
  /** Plain text: a blank line starts a paragraph, "- " or "1. " a list item, `@[id]` a mention. */
  text: string;
  author?: CommentAuthor;
}

/** Starts a thread about an element, a relation, a view or a point of a view, with its first comment. */
export interface CreateThreadCommand {
  type: 'create-thread';
  thread: { id?: Id; anchor: CommentAnchor; comment: NewComment };
}

/** Adds a comment to a thread; a resolved thread opens again. */
export interface AddCommentCommand {
  type: 'add-comment';
  thread: Id;
  comment: NewComment;
}

/** Changes the text of one's own comment: the person's, or Claude's. */
export interface EditCommentCommand {
  type: 'edit-comment';
  thread: Id;
  comment: Id;
  text: string;
  /** Who edits it, as for a new comment. */
  author?: CommentAuthor;
}

/** Resolves a thread, or opens it again. */
export interface ResolveThreadCommand {
  type: 'resolve-thread';
  thread: Id;
  resolved: boolean;
}

/** Deletes a thread with all its comments; the app asks first. */
export interface DeleteThreadCommand {
  type: 'delete-thread';
  thread: Id;
}
