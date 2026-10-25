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
  /**
   * Which version of the package this is, as a semantic version such as `1.2.0`. A package copied
   * from another project keeps it, so that updating it from there can say what changed.
   */
  version?: PackageVersion;
  /**
   * The license its components, relation types and images are shared under (ADR 0047). What ships with
   * Visual Anything always says, with one of the licenses ADR 0047 allows; a project's own packages may
   * leave it out.
   */
  license?: LicenseId;
  /**
   * Who made it and where it comes from, as its license asks them to be credited, such as "Icons by
   * Jane Doe, CC-BY-4.0". The app shows it with the package, and exports carry it for the packages a
   * view uses.
   *
   * @minLength 1
   * @maxLength 2000
   */
  attribution?: string;
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
  // Package code (ADR 0054).
  /**
   * The package's code: one module of JavaScript, one item per line, which may export the hooks
   * `attributes`, `check` and `draw`. The file only holds it: it runs only once the person approves
   * it, by the SHA-256 of its text and its capabilities, in an interpreter inside WebAssembly, and
   * never while the file is read. Left out when the package has none.
   *
   * @minItems 1
   * @maxItems 20000
   */
  code?: CodeLine[];
  /**
   * What its code may reach beyond its element, each approved by the person on its own. Left out
   * when it needs nothing more.
   *
   * @minItems 1
   * @maxItems 16
   * @uniqueItems true
   */
  capabilities?: Capability[];
}

/**
 * A semantic version: three numbers, as in `1.2.0`, optionally followed by a pre-release after a
 * hyphen, as in `2.0.0-beta.1`.
 *
 * @pattern ^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})(-[0-9A-Za-z-]{1,32}(\.[0-9A-Za-z-]{1,32}){0,7})?$
 */
export type PackageVersion = string;

/**
 * A license, by its SPDX identifier, such as `CC0-1.0`, `CC-BY-4.0`, `MIT` or `Apache-2.0`, or a
 * `LicenseRef-` name of one's own.
 *
 * @pattern ^[A-Za-z0-9][A-Za-z0-9.+-]{0,63}$
 */
export type LicenseId = string;

/**
 * One line of a package's code, without its line ending.
 *
 * @maxLength 10000
 * @pattern ^[^\r\n]*$
 */
export type CodeLine = string;

/**
 * Something a package's code may reach beyond its element: `model:read`, the whole model, read-only;
 * `time`, the clock; or `network:` and one web origin, such as `network:https://status.example.com`,
 * fetched through the local program.
 *
 * @pattern ^(model:read|time|network:https?://[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?(:[0-9]{1,5})?)$
 */
export type Capability = string;

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
  /**
   * What its shapes show as the canvas zooms (ADR 0055): levels by the scale each starts at, the
   * highest reached winning, and below the first a silhouette. An empty list follows the canvas's own
   * steps, whatever is inherited; left out, they are inherited.
   *
   * @maxItems 8
   */
  levels?: LevelOfDetail[];
  /**
   * The scale from which a collapsed container of this appearance expands while the canvas looks into
   * it, collapsing again below 90% of it (ADR 0055). Neither is stored: the view keeps it collapsed.
   *
   * @exclusiveMinimum 0
   * @maximum 8
   */
  expandFrom?: number;
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
  /**
   * The relations this view routes by hand, by relation id, each with only what differs from its
   * automatic route: where its ends attach, the points it bends at, and its style. A relation it does
   * not name is routed automatically, and a route whose relation is no relation of the model is
   * ignored.
   */
  routes?: Routes;
  /**
   * The part of the model this view shows (ADR 0040). Without it, the view shows the whole model.
   */
  scope?: Scope;
  /**
   * How this view colors, sizes, marks or fades its shapes by their attributes, in order (ADR 0055):
   * each channel of a shape is set by the first overlay that sets it. Left out when it has none.
   */
  overlays?: Overlays;
}

/**
 * The part of the model a view shows: the elements that meet one of its `include` rules, or every
 * element when it has none, and none of its `exclude` rules; then those it adds, less those it leaves
 * out. World always shows, and a relation shows while both its ends do.
 *
 * @minProperties 1
 */
export interface Scope {
  /**
   * @minItems 1
   * @maxItems 64
   */
  include?: ScopeRule[];
  /**
   * @minItems 1
   * @maxItems 64
   */
  exclude?: ScopeRule[];
  /** Elements shown whatever the rules say: ids, sorted, each once, none of them in `leftOut`. */
  added?: ScopeList;
  /** Elements left out whatever the rules say: ids, sorted, each once, none of them in `added`. */
  leftOut?: ScopeList;
}

/**
 * Element ids, sorted, each once.
 *
 * @minItems 1
 * @maxItems 100000
 * @uniqueItems true
 */
export type ScopeList = Id[];

/**
 * A rule of a scope: which elements it takes.
 *
 * @discriminator kind
 */
export type ScopeRule = ComponentRule | RelationTypeRule | ContentsRule | AttributeRule;

/** The elements created from a component, and from every component derived from it unless `exactly`. */
export interface ComponentRule {
  kind: 'component';
  component: Id;
  exactly?: boolean;
}

/** The elements at either end of a relation of a relation type, or of one derived from it unless `exactly`. */
export interface RelationTypeRule {
  kind: 'relation-type';
  relationType: Id;
  exactly?: boolean;
}

/**
 * A container and what sits inside it through the view's nesting relation types: `depth` levels down,
 * or every level without it.
 */
export interface ContentsRule {
  kind: 'contents';
  container: Id;
  /**
   * @minimum 1
   * @maximum 1000
   * @asType integer
   */
  depth?: number;
}

/** The elements whose attribute meets a test, as filters test it, with its component's default when unset. */
export interface AttributeRule {
  kind: 'attribute';
  /** @minLength 1 */
  attribute: string;
  test: 'is' | 'is-not' | 'contains' | 'below' | 'above' | 'set' | 'unset';
  /** What the value is compared with; left out for `set` and `unset`. */
  value?: string;
}

/**
 * Routes chosen by hand, by the id of the relation each one routes.
 *
 * @minProperties 1
 */
export type Routes = Record<Id, RelationRoute>;

/**
 * How a view routes one relation by hand: only what differs from its automatic route. An end left
 * out attaches where the automatic route attaches it, a route without bend points runs directly
 * between its ends, and one without a style is orthogonal.
 *
 * @minProperties 1
 */
export interface RelationRoute {
  /**
   * Where the line attaches to the relation's `from` end. An end that is a relation takes none: the
   * line attaches to the middle of that relation's line.
   */
  from?: EndAttachment;
  /** Where the line attaches to the relation's `to` end. */
  to?: EndAttachment;
  /**
   * `straight` runs straight from point to point and `curved` runs a smooth curve through them; left
   * out, the route is orthogonal.
   */
  style?: 'straight' | 'curved';
  /**
   * The container whose shape the bend points are relative to: one that holds the shapes of both
   * ends, the nearest when they were set. Left out, they are relative to the canvas. While its shape
   * no longer holds both ends, the bend points are ignored, and they come back with the containment.
   */
  container?: Id;
  /**
   * The points the line passes through, in order from its `from` end, in canvas units, relative to
   * the shape of `container`, or to the canvas.
   *
   * @minItems 1
   * @maxItems 64
   */
  bendPoints?: Point[];
}

/**
 * Where a line attaches to one of its ends, chosen by hand: one of the end's connection points, by
 * name, or a fixed place on its border.
 *
 * @discriminator kind
 */
export type EndAttachment = ConnectionPointAttachment | BorderAttachment;

/** The line attaches at one of the end's connection points, wherever the end's appearance puts it. */
export interface ConnectionPointAttachment {
  kind: 'connection-point';
  /**
   * The name of one of the connection points of the end's appearance.
   *
   * @minLength 1
   * @maxLength 32
   */
  name: string;
}

/** The line attaches at a fixed place on the end's border, which follows the shape as it moves and resizes. */
export interface BorderAttachment {
  kind: 'border';
  side: 'top' | 'right' | 'bottom' | 'left';
  /**
   * Where it sits along its side, from 0 at the side's left or top end to 1 at its right or bottom end.
   *
   * @minimum 0
   * @maximum 1
   */
  at: number;
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
  /**
   * The left edge, relative to the container's shape, or to the canvas when directly in World.
   *
   * @minimum -10000000
   * @maximum 10000000
   */
  x: number;
  /**
   * The top edge, relative to the container's shape, or to the canvas when directly in World.
   *
   * @minimum -10000000
   * @maximum 10000000
   */
  y: number;
  /**
   * @exclusiveMinimum 0
   * @maximum 10000000
   */
  width?: number;
  /**
   * @exclusiveMinimum 0
   * @maximum 10000000
   */
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
  /**
   * Its left edge on the canvas.
   *
   * @minimum -10000000
   * @maximum 10000000
   */
  x: number;
  /**
   * Its top edge on the canvas.
   *
   * @minimum -10000000
   * @maximum 10000000
   */
  y: number;
  /**
   * @exclusiveMinimum 0
   * @maximum 10000000
   */
  width: number;
  /**
   * @exclusiveMinimum 0
   * @maximum 10000000
   */
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

/** A point on the canvas, in canvas units, at most ten million from its origin either way. */
export interface Point {
  /**
   * @minimum -10000000
   * @maximum 10000000
   */
  x: number;
  /**
   * @minimum -10000000
   * @maximum 10000000
   */
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

// ——— Overlays and levels of detail (ADR 0055) ———————————————————————————————————————————————————

/** What shapes show from a scale up. */
export interface LevelOfDetail {
  /**
   * The scale it starts at, where 1 is 100%: it is entered there, and left only 10% below it.
   *
   * @minimum 0
   * @maximum 8
   */
  from: number;
  /**
   * What shows from it: a silhouette only, or any of the name, the detail (its attributes and badges,
   * written under the name), the contents or rows, and the image.
   *
   * @minItems 1
   * @maxItems 5
   * @uniqueItems true
   */
  shows: LevelPart[];
}

/** One thing a shape shows at a level of detail. */
export type LevelPart = 'silhouette' | 'name' | 'detail' | 'contents' | 'image';

/**
 * A view's overlays, in order.
 *
 * @minItems 1
 * @maxItems 16
 */
export type Overlays = Overlay[];

/**
 * A rule of a view that colors, sizes, marks or fades its shapes by one attribute, which its legend
 * explains (ADR 0055). It maps the attribute to one channel.
 *
 * @discriminator channel
 */
export type Overlay = FillOverlay | StrokeOverlay | SizeOverlay | BadgeOverlay | OpacityOverlay;

/** What every overlay holds besides its channel and its mapping. */
export interface OverlayParts {
  /** Unique among the view's overlays. */
  id: Id;
  /**
   * What the legend calls it; without one, the attribute's name.
   *
   * @minLength 1
   * @maxLength 64
   */
  name?: string;
  /** Whether it reads the attributes of elements and changes their shapes, or of relations and changes their lines. */
  of: 'elements' | 'relations';
  /**
   * The attribute it reads: an element's or relation's own value, or the default its component or
   * relation type gives.
   *
   * @minLength 1
   */
  attribute: string;
  /** Whether it is turned off: kept in the view, it changes nothing and its legend is left out. */
  off?: boolean;
}

/** Fills shapes with a color by the attribute; relations have no fill. */
export interface FillOverlay extends OverlayParts {
  channel: 'fill';
  mapping: ColorMapping;
}

/** Strokes shapes, or relations' lines, with a color by the attribute. */
export interface StrokeOverlay extends OverlayParts {
  channel: 'stroke';
  mapping: ColorMapping;
}

/**
 * Sizes shapes, or relations' lines, by the attribute: a factor on a shape's width and height, around
 * its middle, or on a line's width. Layout never sees it, and a shape that shows contents or rows, or
 * is a row, keeps its size.
 */
export interface SizeOverlay extends OverlayParts {
  channel: 'size';
  mapping: SizeMapping;
}

/** Writes a short text by the attribute in a shape's detail, or after a relation's name. */
export interface BadgeOverlay extends OverlayParts {
  channel: 'badge';
  mapping: BadgeMapping;
}

/** Fades shapes, or relations' lines, by the attribute, toward what they are drawn on. */
export interface OpacityOverlay extends OverlayParts {
  channel: 'opacity';
  mapping: OpacityMapping;
}

/**
 * A value an overlay compares an attribute with, as filters compare: text without minding case or the
 * spaces around it, and numbers as numbers, so that "12" names 12 and "true" names true.
 */
export type CaseValue = string;

/**
 * What the legend says for a value or a stop; without it, the value.
 *
 * @minLength 1
 * @maxLength 64
 */
export type LegendLabel = string;

/**
 * How an overlay of fill or stroke colors what it changes.
 *
 * @discriminator kind
 */
export type ColorMapping = ColorCases | ColorRamp | Passthrough;

/** Values to colors, and the color of any other value, a missing one included. */
export interface ColorCases {
  kind: 'discrete';
  /**
   * @minItems 1
   * @maxItems 64
   */
  cases: ColorCase[];
  /** The color of any value no case names; left out, such a shape keeps its own. */
  otherwise?: Color;
}

/** One value and its color. */
export interface ColorCase {
  value: CaseValue;
  color: Color;
  label?: LegendLabel;
}

/**
 * Numbers to colors along a ramp: up to the first stop its color, from the last its color, and
 * between two stops their colors mixed. A value that is no number keeps its own.
 */
export interface ColorRamp {
  kind: 'continuous';
  /**
   * In increasing order of `at`, each at a number of its own.
   *
   * @minItems 2
   * @maxItems 16
   */
  stops: ColorStop[];
}

/** A number and its color on a ramp. */
export interface ColorStop {
  at: number;
  color: Color;
  label?: LegendLabel;
}

/** The value is what the channel takes: a color written as #RRGGBB, or a badge's text. */
export interface Passthrough {
  kind: 'passthrough';
}

/**
 * How an overlay of size sizes what it changes.
 *
 * @discriminator kind
 */
export type SizeMapping = SizeCases | SizeRamp;

/** Values to sizes, and the size of any other value, a missing one included. */
export interface SizeCases {
  kind: 'discrete';
  /**
   * @minItems 1
   * @maxItems 64
   */
  cases: SizeCase[];
  otherwise?: SizeFactor;
}

/** One value and its size. */
export interface SizeCase {
  value: CaseValue;
  size: SizeFactor;
  label?: LegendLabel;
}

/** Numbers to sizes along a range: up to the first stop its size, from the last its size, between them in proportion. */
export interface SizeRamp {
  kind: 'continuous';
  /**
   * In increasing order of `at`, each at a number of its own.
   *
   * @minItems 2
   * @maxItems 16
   */
  stops: SizeStop[];
}

/** A number and its size. */
export interface SizeStop {
  at: number;
  size: SizeFactor;
  label?: LegendLabel;
}

/**
 * A factor on a shape's width and height, or on a line's width.
 *
 * @minimum 0.5
 * @maximum 2
 */
export type SizeFactor = number;

/**
 * How an overlay of badges marks what it changes.
 *
 * @discriminator kind
 */
export type BadgeMapping = BadgeCases | Passthrough;

/** Values to texts, and the text of any other value, a missing one included. */
export interface BadgeCases {
  kind: 'discrete';
  /**
   * @minItems 1
   * @maxItems 64
   */
  cases: BadgeCase[];
  otherwise?: OverlayBadgeText;
}

/** One value and the text it writes. */
export interface BadgeCase {
  value: CaseValue;
  text: OverlayBadgeText;
  label?: LegendLabel;
}

/**
 * The short text an overlay writes.
 *
 * @minLength 1
 * @maxLength 12
 */
export type OverlayBadgeText = string;

/**
 * How an overlay of opacity fades what it changes.
 *
 * @discriminator kind
 */
export type OpacityMapping = OpacityCases | OpacityRamp;

/** Values to opacities, and the opacity of any other value, a missing one included. */
export interface OpacityCases {
  kind: 'discrete';
  /**
   * @minItems 1
   * @maxItems 64
   */
  cases: OpacityCase[];
  otherwise?: OpacityValue;
}

/** One value and its opacity. */
export interface OpacityCase {
  value: CaseValue;
  opacity: OpacityValue;
  label?: LegendLabel;
}

/** Numbers to opacities along a range: up to the first stop its opacity, from the last its opacity, between them in proportion. */
export interface OpacityRamp {
  kind: 'continuous';
  /**
   * In increasing order of `at`, each at a number of its own.
   *
   * @minItems 2
   * @maxItems 16
   */
  stops: OpacityStop[];
}

/** A number and its opacity. */
export interface OpacityStop {
  at: number;
  opacity: OpacityValue;
  label?: LegendLabel;
}

/**
 * How much of a shape or a line shows: from 0.1, faint, to 1, as it is.
 *
 * @minimum 0.1
 * @maximum 1
 */
export type OpacityValue = number;
