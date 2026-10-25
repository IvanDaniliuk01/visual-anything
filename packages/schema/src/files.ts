/**
 * What each kind of project file holds. A project file is JSON, and its extension says which of these
 * types it holds. The JSON Schema in `schemas/` is generated from these types by `pnpm generate`: doc
 * comments become its descriptions, and their tags (`@pattern`, `@minLength` and so on) its constraints.
 */
import type { AppearanceImage, ImageDefinition } from './images';

export type { AppearanceImage, BitmapImage, ImageDefinition, SvgImage } from './images';

/**
 * An identifier, generated once and never reused. Files refer to each other only by id. Element and
 * relation ids share one namespace, because a relation can end on either. Component and relation type
 * ids start with their package's id, as in `systems.service`.
 *
 * @pattern ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$
 */
export type Id = string;

/** Any JSON value. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Attribute values by attribute name. */
export type Attributes = Record<string, JsonValue>;

/**
 * A color written as `#RRGGBB`: no alpha, no short form and no names. Files may write the digits in
 * either case; the program writes new colors in capitals and keeps a color's spelling when it is set
 * to the same color again.
 *
 * @pattern ^#[0-9a-fA-F]{6}$
 */
export type Color = string;

/** The id of Essence, the component every other component ultimately derives from. */
export const ESSENCE_ID = 'essence';

/** The id of "relates to", the relation type every other relation type ultimately derives from. */
export const RELATES_TO_ID = 'relates-to';

/** The version of the project file format this build reads and writes. */
export const SCHEMA_VERSION = 1;

/**
 * The contents of a project's `.vaproject` file: its name, schema version, the packages in use and
 * the project appearances it gives to definitions it cannot change.
 *
 * @title Visual Anything project file
 */
export interface ProjectFile {
  /** The version of the project file format. A project saved in a newer one is refused with a message that says so. */
  schemaVersion: 1;
  /** @minLength 1 */
  name: string;
  description?: string;
  /**
   * The ids of the packages the project uses. Their files live in the project's `packages/` folder.
   *
   * @uniqueItems true
   */
  packages: Id[];
  /**
   * How the project draws the components and relation types it uses but cannot change: those of
   * built-in packages, Essence and "relates to". Absent when it gives none an appearance.
   */
  appearances?: ProjectAppearances;
}

/**
 * Project appearances, by the id of the definition they belong to. Each sets only the traits it
 * lists, for that definition and for whatever derives from it without setting them itself; an
 * element's or a relation's own appearance still comes first. An entry for one of the project's own
 * definitions, or for one no package in use defines, has no effect.
 *
 * @minProperties 1
 */
export interface ProjectAppearances {
  /** By component id, `essence` included. */
  components?: ComponentAppearances;
  /** By relation type id, `relates-to` included. */
  relationTypes?: RelationTypeAppearances;
}

/**
 * Project appearances of components, by component id.
 *
 * @minProperties 1
 */
export type ComponentAppearances = Record<Id, Appearance>;

/**
 * Project appearances of relation types, by relation type id.
 *
 * @minProperties 1
 */
export type RelationTypeAppearances = Record<Id, RelationAppearance>;

/**
 * The contents of a project's `.vamodel` file: World, every other element, and every relation.
 *
 * @title Visual Anything model file
 */
export interface ModelFile {
  /**
   * World, which contains every other element, directly or indirectly. An element with no container
   * under a view's nesting relation types sits directly in World.
   */
  world: Element;
  /** Every element except World. */
  elements: Element[];
  relations: Relation[];
}

/** A thing in the model with its own identity, created from a component. */
export interface Element {
  id: Id;
  /** The component this element is created from. World's component is Essence. */
  component: Id;
  /** @minLength 1 */
  name: string;
  description?: string;
  /**
   * The element's attribute values. A value that differs from the default its component gives, or a
   * value for an attribute its component does not define, is a particularity; a value for an attribute
   * without a default is ordinary data.
   */
  attributes?: Attributes;
  /** An appearance of its own, which is a particularity. Whatever it leaves out comes from the component. */
  appearance?: Appearance;
}

/** A meaningful tie between two ends, each an element or another relation, always of a relation type. */
export interface Relation {
  id: Id;
  relationType: Id;
  /** The element or relation this relation starts from. */
  from: Id;
  /** The element or relation this relation goes to. For a nesting relation type, this end is the container. */
  to: Id;
  /** @minLength 1 */
  name?: string;
  description?: string;
  attributes?: Attributes;
  /** An appearance of its own, which is a particularity. Whatever it leaves out comes from the relation type. */
  appearance?: RelationAppearance;
}

/**
 * The contents of a `.vapackage` file: components and relation types from one domain, shared as a unit.
 *
 * @title Visual Anything package file
 */
export interface PackageFile {
  id: Id;
  /** @minLength 1 */
  name: string;
  description?: string;
  components: Component[];
  relationTypes: RelationType[];
  /**
   * The images its components' appearances, and elements' own appearances, show. Each is data only:
   * nothing in it runs or refers to anything outside it. Left out when there are none.
   *
   * @minItems 1
   * @maxItems 128
   */
  images?: ImageDefinition[];
}

/** The reusable definition of a kind of element. It inherits everything it does not redefine. */
export interface Component {
  id: Id;
  /** @minLength 1 */
  name: string;
  /** The component this one derives from: another component, or `essence`. */
  derivesFrom: Id;
  description?: string;
  /** The attributes this component adds to the ones it inherits. */
  attributes?: AttributeDefinition[];
  appearance?: Appearance;
}

/** The reusable definition of a kind of relation. It inherits everything it does not redefine. */
export interface RelationType {
  id: Id;
  /** @minLength 1 */
  name: string;
  /** The relation type this one derives from: another relation type, or `relates-to`. */
  derivesFrom: Id;
  description?: string;
  direction?: 'directed' | 'undirected';
  /** Whether its relations place their `from` element inside their `to` element, as "is part of" does. */
  nests?: boolean;
  /** The attributes this relation type adds to the ones it inherits. */
  attributes?: AttributeDefinition[];
  appearance?: RelationAppearance;
  /** What its relations may connect. Breaking a limit only produces a warning. */
  limits?: RelationTypeLimits;
}

/**
 * The ids of the components or relation types an end may be created from. An end created from one of
 * them, or from anything derived from one of them, keeps within the limit.
 *
 * @minItems 1
 * @uniqueItems true
 */
export type LimitList = Id[];

/**
 * What the ends of a relation type's relations may be. A list left out is inherited from the relation
 * type this one derives from, and sets no limit when none sets one; `any` sets no limit on that end,
 * whatever is inherited. Breaking a limit only produces a warning.
 */
export interface RelationTypeLimits {
  from?: LimitList | 'any';
  to?: LimitList | 'any';
}

/** An attribute that a component or relation type defines. */
export interface AttributeDefinition {
  /** @minLength 1 */
  name: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  /** The value an element or relation has when it does not set its own. */
  default?: JsonValue;
  description?: string;
  /**
   * For a string attribute, the values it is expected to take, offered in this order. Any other value
   * only produces a warning.
   *
   * @minItems 1
   * @maxItems 64
   * @uniqueItems true
   */
  choices?: string[];
  /**
   * For a number attribute, the unit its values are in, written after them on shapes, such as "ms"
   * or "GB".
   *
   * @minLength 1
   * @maxLength 16
   */
  unit?: string;
}

/** How an element's shapes are drawn. Whatever an appearance leaves out is inherited. */
export interface Appearance {
  /**
   * The kind of its shapes. While its shapes draw their contents as rows, any kind other than
   * `rounded-rectangle` is drawn as a rectangle.
   */
  shape?: 'rectangle' | 'rounded-rectangle' | 'ellipse' | 'cylinder' | 'person';
  fill?: Color;
  stroke?: Color;
  /**
   * The width of its shapes when a view does not set one, in canvas units.
   *
   * @exclusiveMinimum 0
   * @maximum 100000
   */
  width?: number;
  /**
   * The height of its shapes when a view does not set one, in canvas units. Shapes that draw their
   * contents as rows take their height from their rows instead.
   *
   * @exclusiveMinimum 0
   * @maximum 100000
   */
  height?: number;
  /** What its shapes write under the element's name. Each part is inherited on its own. */
  detail?: DetailRules;
  /**
   * Whether its shapes draw the elements they hold as rows: one under another below a header, as wide
   * as the shape, in the model's order, as a table draws its columns. Rows have no positions of their
   * own in views, and the shape's height follows its rows.
   */
  contentsAsRows?: boolean;
  /**
   * Where relations attach to its shapes: each relation attaches to the one facing its other end. An
   * empty list has relations attach anywhere on the border, whatever is inherited. Shapes that draw
   * their contents as rows attach relations beside their header and their rows instead.
   *
   * @maxItems 32
   */
  connectionPoints?: ConnectionPoint[];
  /** The image its shapes show; `none` shows none, whatever is inherited. */
  image?: AppearanceImage | 'none';
}

/** What a shape writes under its element's name, on one line. */
export interface DetailRules {
  /** Whether it writes the component's name. Essence writes it. */
  componentName?: boolean;
  /**
   * The attributes whose values it writes, in this order, after the component's name; an attribute
   * without a value is skipped.
   *
   * @maxItems 8
   * @uniqueItems true
   */
  attributes?: string[];
  /**
   * The badges it writes after the values, each while its element meets the badge's condition.
   *
   * @maxItems 8
   */
  badges?: Badge[];
}

/**
 * A short text, such as "PK", that a shape writes while its element meets the badge's condition.
 *
 * @discriminator when
 */
export type Badge = AttributeBadge | RelationEndBadge;

/** A badge written while a boolean attribute of the element is true. */
export interface AttributeBadge {
  when: 'attribute';
  /**
   * @minLength 1
   * @maxLength 4
   */
  text: string;
  /** The name of a boolean attribute of the element. */
  attribute: string;
}

/** A badge written while the element is the `from` end of a relation of this relation type, or of one derived from it. */
export interface RelationEndBadge {
  when: 'from-end';
  /**
   * @minLength 1
   * @maxLength 4
   */
  text: string;
  relationType: Id;
}

/** A named place on the border of a shape where relations attach. */
export interface ConnectionPoint {
  /**
   * Unique among the connection points of one appearance, such as "in" or "out".
   *
   * @minLength 1
   * @maxLength 32
   */
  name: string;
  side: 'top' | 'right' | 'bottom' | 'left';
  /**
   * Where it sits along its side, from 0 at the side's left or top end to 1 at its right or bottom end.
   *
   * @minimum 0
   * @maximum 1
   */
  at: number;
}

/** How a relation is drawn. */
export interface RelationAppearance {
  stroke?: Color;
  /**
   * The line width, in canvas units.
   *
   * @exclusiveMinimum 0
   */
  width?: number;
  dash?: 'solid' | 'dashed' | 'dotted';
}

/**
 * The contents of a `.vaview` file: a projection of the model onto the canvas, with its own positions.
 *
 * @title Visual Anything view file
 */
export interface ViewFile {
  id: Id;
  /** @minLength 1 */
  name: string;
  description?: string;
  perspective: Perspective;
  /**
   * The nesting relation types that arrange this view.
   *
   * @uniqueItems true
   */
  nestingRelationTypes: Id[];
  /**
   * The positions of anchored shapes, set by layout or pinned by hand. A shape without a position is
   * placed by layout.
   */
  positions: ShapePosition[];
  freeShapes: FreeShape[];
  /**
   * The order in which this view draws the anchored shapes that sit directly inside each container,
   * or directly in World, by the id of the container, or World's id. Each list goes from back to front:
   * the shapes it does not name are drawn in front of the ones it names, in model order, so without a
   * list every shape there is drawn in model order and a new shape comes in front. Every copy of a
   * container draws its contents in the same order. An id whose element does not sit there is ignored.
   */
  stackingOrder?: StackingOrder;
  /**
   * The containers this view shows collapsed, by element id, sorted. A collapsed container's shapes
   * show none of its contents, and the relations to and from them are drawn as aggregated relations.
   * An id that is no element of the model is ignored.
   */
  collapsed?: CollapsedList;
}

/**
 * Element ids, sorted, each once.
 *
 * @minItems 1
 * @uniqueItems true
 */
export type CollapsedList = Id[];

/**
 * Stacking lists by the id of the container whose contents they order, or World's id for the shapes
 * directly in World.
 *
 * @minProperties 1
 */
export type StackingOrder = Record<Id, StackingList>;

/**
 * Element ids, from back to front.
 *
 * @minItems 1
 * @uniqueItems true
 */
export type StackingList = Id[];

/** The criterion for selecting and arranging the model in a view. */
export interface Perspective {
  /**
   * For example "Data flow", "Security" or "Ownership".
   *
   * @minLength 1
   */
  name: string;
  description?: string;
}

/**
 * Where an anchored shape sits in a view. An element has one anchored shape inside each of its
 * containers, so a position is identified by the element and the container its shape sits in.
 */
export interface ShapePosition {
  element: Id;
  /** The container whose shape holds this one. Absent when the element sits directly in World. */
  container?: Id;
  /** The left edge, relative to the container's shape, or to the canvas when directly in World. */
  x: number;
  /** The top edge, relative to the container's shape, or to the canvas when directly in World. */
  y: number;
  /** @exclusiveMinimum 0 */
  width?: number;
  /** @exclusiveMinimum 0 */
  height?: number;
  /** Whether the position was set by hand. Layout arranges every other shape around pinned shapes. */
  pinned?: boolean;
}

/**
 * A shape that is drawing only and does not exist in the model.
 *
 * @discriminator kind
 */
export type FreeShape = Note | Arrow;

/** A free shape that holds text. */
export interface Note {
  kind: 'note';
  id: Id;
  x: number;
  y: number;
  /** @exclusiveMinimum 0 */
  width: number;
  /** @exclusiveMinimum 0 */
  height: number;
  text: string;
  /** Its fill; without one, the theme's note color. */
  fill?: Color;
  /** Its stroke; without one, the theme's. */
  stroke?: Color;
}

/** A free shape that points from one place on the canvas to another. */
export interface Arrow {
  kind: 'arrow';
  id: Id;
  from: Point;
  to: Point;
  /** Its color; without one, the theme's arrow color. */
  stroke?: Color;
}

/** A point on the canvas, in canvas units. */
export interface Point {
  x: number;
  y: number;
}

/**
 * The contents of a `.vascenario` file: a concrete example played step by step over one view.
 *
 * @title Visual Anything scenario file
 */
export interface ScenarioFile {
  id: Id;
  /** @minLength 1 */
  name: string;
  description?: string;
  /** The view the scenario plays over. */
  view: Id;
  /** The steps in order. There are no branches: an alternative path is another scenario. */
  steps: Step[];
}

/** One step of a scenario. */
export interface Step {
  id: Id;
  description: string;
  /**
   * The relations the step activates, all at once. A step that uses a relation that no longer exists is
   * a broken step; it is kept so it can be fixed.
   *
   * @minItems 1
   * @uniqueItems true
   */
  relations: Id[];
  /** What the step takes in. */
  dataIn?: JsonValue;
  /** What the step produces. */
  dataOut?: JsonValue;
}
