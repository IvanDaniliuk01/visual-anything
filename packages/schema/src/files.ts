/**
 * What each kind of project file holds. A project file is JSON, and its extension says which of these
 * types it holds. The JSON Schema in `schemas/` is generated from these types by `pnpm generate`: doc
 * comments become its descriptions, and their tags (`@pattern`, `@minLength` and so on) its constraints.
 */

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
 * A color written as `#rrggbb`.
 *
 * @pattern ^#[0-9a-fA-F]{6}$
 */
export type Color = string;

/** The id of Essence, the component every other component ultimately derives from. */
export const ESSENCE_ID = 'essence';

/** The id of "relates to", the relation type every other relation type ultimately derives from. */
export const RELATES_TO_ID = 'relates-to';

/**
 * The contents of a project's `.vaproject` file: its name, schema version and the packages in use.
 *
 * @title Visual Anything project file
 */
export interface ProjectFile {
  /** The version of the project file format. */
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
}

/**
 * The contents of a project's `.vamodel` file: World, every other element, and every relation.
 *
 * @title Visual Anything model file
 */
export interface ModelFile {
  /**
   * The root element; every other element is contained in it, directly or indirectly. An element with no
   * container under a view's nesting relation types sits directly in World.
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
   * The element's attribute values. A value that differs from its component's, or a value for an
   * attribute its component does not define, is a particularity.
   */
  attributes?: Attributes;
  /** An appearance of its own, which is a particularity. Whatever it leaves out comes from the component. */
  appearance?: Appearance;
}

/** A meaningful link whose ends are elements or other relations, always of a relation type. */
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
}

/** An attribute that a component or relation type defines. */
export interface AttributeDefinition {
  /** @minLength 1 */
  name: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  /** The value an element or relation has when it does not set its own. */
  default?: JsonValue;
  description?: string;
}

/** How an element's shapes are drawn. */
export interface Appearance {
  shape?: 'rectangle' | 'rounded-rectangle' | 'ellipse' | 'cylinder' | 'person';
  fill?: Color;
  stroke?: Color;
  /**
   * The width of its shapes when a view does not set one, in canvas units.
   *
   * @exclusiveMinimum 0
   */
  width?: number;
  /**
   * The height of its shapes when a view does not set one, in canvas units.
   *
   * @exclusiveMinimum 0
   */
  height?: number;
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
}

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
}

/** A free shape that points from one place on the canvas to another. */
export interface Arrow {
  kind: 'arrow';
  id: Id;
  from: Point;
  to: Point;
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
