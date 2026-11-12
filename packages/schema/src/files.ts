/**
 * What each kind of project file holds. A project file is JSON, and its extension says which of these
 * types it holds. The JSON Schema in `schemas/` is generated from these types by `pnpm generate`: doc
 * comments become its descriptions, and their tags (`@pattern`, `@minLength` and so on) its constraints.
 */
import type { AppearanceImage, ImageDefinition } from './images';

export type { AppearanceImage, BitmapImage, ImageDefinition, SvgImage } from './images';
import type { AppearanceSolid, SolidDefinition } from './solids';
import type {
  AppearanceExplorable,
  ExplorableDefinition,
  ScriptLibraryDefinition,
  TourExplorable,
} from './explorables';
import type { SavedSimulation, SimulationDefinition } from './simulation';
import type { DrawingDefaults } from './drawing';
export type {
  DrawingAggregated,
  DrawingColors,
  DrawingContainers,
  DrawingDefaults,
  DrawingGrid,
  DrawingLines,
  DrawingPreset,
  DrawingReading,
  DrawingShapes,
  DrawingText,
} from './drawing';
import type { Pose, SavedSpace } from './space';
export type {
  ParameterChoice,
  ParameterDefinition,
  ParameterValue,
  SavedSimulation,
  SimulatedValueDefinition,
  SimulationDefinition,
  TickLength,
} from './simulation';
export type {
  JointPosition,
  JointPositions,
  Pose,
  PosePoint,
  Rotation,
  SavedSpace,
  SpaceCamera,
  SpaceCut,
  SpaceTarget,
} from './space';
export type {
  AppearanceSolid,
  SolidAnimation,
  SolidCamera,
  SolidCounts,
  SolidDefinition,
  SolidPart,
  SpaceBounds,
  SpacePoint,
} from './solids';
export type {
  AppearanceExplorable,
  ExplorableBooleanParameter,
  ExplorableChoiceParameter,
  ExplorableDefinition,
  ExplorableIntegerParameter,
  ExplorableNumberParameter,
  ExplorableParameter,
  ExplorableParameterValue,
  ScriptLibraryDefinition,
  TourExplorable,
} from './explorables';

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
  /**
   * How the project draws what no appearance sets (ADR 0086): a preset and the values it changes.
   * Left out, the Clean preset as built in.
   */
  drawing?: DrawingDefaults;
  /**
   * How the view list files the project's views (ADR 0101): views and folders of views, in the order
   * the list shows them, folders nesting as deep as wanted. A view it does not name shows after it.
   * Left out while it is empty.
   *
   * @minItems 1
   * @maxItems 10000
   */
  viewFolders?: ViewFolderEntry[];
  /**
   * What a merge could not join, as data (ADR 0072): each conflict says which item it is about, what
   * the file keeps in place, and the other choice. Written only by a merge; the person resolves them.
   *
   * @minItems 1
   * @maxItems 10000
   */
  conflicts?: FileConflict[];
}

/** An entry of the view folders (ADR 0101): a view, or a folder of entries. */
export type ViewFolderEntry = FiledView | ViewFolder;

/** A view filed in the view folders, by its id. */
export interface FiledView {
  view: Id;
}

/** A folder of the view list, with the views and folders it holds, in order. */
export interface ViewFolder {
  /** The folder's id, made by the core; it says nothing to the person. */
  folder: Id;
  /** @minLength 1 */
  name: string;
  /** @maxItems 10000 */
  entries: ViewFolderEntry[];
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
  /**
   * What a merge could not join, as data (ADR 0072): each conflict says which item it is about, what
   * the file keeps in place, and the other choice. Written only by a merge; the person resolves them.
   *
   * @minItems 1
   * @maxItems 10000
   */
  conflicts?: FileConflict[];
}

/** A thing in the model with its own identity, created from a component. */
export interface Element {
  id: Id;
  /** The component this element is created from. World's component is Essence. */
  component: Id;
  /** @minLength 1 */
  name: string;
  description?: string;
  /** What it is in other catalogs, by scheme (ADR 0056); absent when it has none. */
  ids?: ExternalIds;
  /**
   * The element's attribute values. A value that differs from the default its component gives, or a
   * value for an attribute its component does not define unless its component has open attributes
   * (ADR 0105), is a particularity; a value for an attribute without a default is ordinary data.
   */
  attributes?: Attributes;
  /** An appearance of its own, which is a particularity. Whatever it leaves out comes from the component. */
  appearance?: Appearance;
  /**
   * Where it is in physical space and which way it faces, measured from one of its containers or
   * from World (ADR 0076); absent when it has no place there.
   */
  pose?: Pose;
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
  /** Tables that map one scheme of external identifiers to another, for importers (ADR 0056). */
  crosswalks?: Crosswalk[];
  /**
   * The images its components' appearances, and elements' own appearances, show. Each is data only:
   * nothing in it runs or refers to anything outside it. Left out when there are none.
   *
   * @minItems 1
   * @maxItems 128
   */
  images?: ImageDefinition[];
  /**
   * The solids its appearances show (ADR 0075): each one's definition, its file kept beside the
   * project as `solids/<hash>.glb`. Left out when there are none.
   *
   * @minItems 1
   * @maxItems 64
   */
  solids?: SolidDefinition[];
  /**
   * The explorables its appearances, free shapes and tour steps show (ADR 0107): each one's
   * definition, its file kept beside the project as `explorables/<file>`. Left out when there are
   * none.
   *
   * @minItems 1
   * @maxItems 64
   */
  explorables?: ExplorableDefinition[];
  /**
   * The script libraries its explorables use (ADR 0107), each kept beside the project as
   * `script-libraries/<hash>.js`. Left out when there are none.
   *
   * @minItems 1
   * @maxItems 64
   */
  scriptLibraries?: ScriptLibraryDefinition[];
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
  /**
   * What its code adds to the app beyond its components (ADR 0089): actions, importers, exporters and
   * panels, declared here so that the app lists them before the code is approved or runs. Each runs
   * through a hook of the code: `act`, `importFile`, `exportFile` or `panel`. Left out when it adds
   * none.
   */
  extensions?: PackageExtensions;
  /**
   * What a merge could not join, as data (ADR 0072): each conflict says which item it is about, what
   * the file keeps in place, and the other choice. Written only by a merge; the person resolves them.
   *
   * @minItems 1
   * @maxItems 10000
   */
  conflicts?: FileConflict[];
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

/** What a package's code adds to the app (ADR 0089), each list left out when empty. */
export interface PackageExtensions {
  /**
   * Its actions, which answer changes the person reviews before they apply.
   *
   * @minItems 1
   * @maxItems 32
   */
  actions?: PackageActionDeclaration[];
  /**
   * Its importers, which read a file into changes the person reviews.
   *
   * @minItems 1
   * @maxItems 8
   */
  importers?: PackageImporterDeclaration[];
  /**
   * Its exporters, which write the model and a view as a text file.
   *
   * @minItems 1
   * @maxItems 8
   */
  exporters?: PackageExporterDeclaration[];
  /**
   * Its panels, which the inspector shows for a selection.
   *
   * @minItems 1
   * @maxItems 8
   */
  panels?: PackagePanelDeclaration[];
}

/**
 * The id of something a package adds, unique among the package's ones of its kind.
 *
 * @pattern ^[a-z][a-z0-9-]{0,47}$
 */
export type ExtensionId = string;

/**
 * What the app names something a package adds, in the package's own words.
 *
 * @minLength 1
 * @maxLength 60
 */
export type ExtensionLabel = string;

/** A named action, run with the selection and, with `model:read`, the model (ADR 0089). */
export interface PackageActionDeclaration {
  id: ExtensionId;
  label: ExtensionLabel;
  /** @maxLength 300 */
  description?: string;
  /**
   * Where it is offered: the canvas menu for a selection, the Packages menu, or both.
   *
   * @minItems 1
   * @uniqueItems true
   */
  where: ('selection' | 'packages-menu')[];
  /**
   * The components whose elements, or those of components derived from them, it is offered for in
   * the canvas menu; left out, it is offered for any selection.
   *
   * @minItems 1
   * @maxItems 32
   * @uniqueItems true
   */
  components?: Id[];
}

/** An importer: it reads files with these extensions into changes (ADR 0089). */
export interface PackageImporterDeclaration {
  id: ExtensionId;
  label: ExtensionLabel;
  /**
   * The extensions it reads, each with its dot, in lower case, such as ".sql".
   *
   * @minItems 1
   * @maxItems 8
   * @uniqueItems true
   */
  extensions: FileExtension[];
}

/** An exporter: it writes the model and a view as a text file with this extension (ADR 0089). */
export interface PackageExporterDeclaration {
  id: ExtensionId;
  label: ExtensionLabel;
  extension: FileExtension;
}

/** A panel the inspector shows for a selection of these components' elements (ADR 0089). */
export interface PackagePanelDeclaration {
  id: ExtensionId;
  label: ExtensionLabel;
  /**
   * The components whose elements, or those of components derived from them, it shows for; left
   * out, it shows for any one selected element.
   *
   * @minItems 1
   * @maxItems 32
   * @uniqueItems true
   */
  components?: Id[];
}

/**
 * A file's extension, with its dot, in lower case.
 *
 * @pattern ^\.[a-z0-9]{1,16}$
 */
export type FileExtension = string;

/** The reusable definition of a kind of element. It inherits everything it does not redefine. */
export interface Component {
  id: Id;
  /** @minLength 1 */
  name: string;
  /** The component this one derives from: another component, or `essence`. */
  derivesFrom: Id;
  description?: string;
  /** What it is in other catalogs, by scheme (ADR 0056); absent when it has none. */
  ids?: ExternalIds;
  /** The attributes this component adds to the ones it inherits. */
  attributes?: AttributeDefinition[];
  /**
   * Whether it has open attributes (ADR 0105): its elements may carry attributes it does not define,
   * on purpose, as the rows of a table carry their columns; those are then their ordinary data, not
   * particularities. Left out, it is inherited from the component it derives from; Essence has none.
   */
  openAttributes?: boolean;
  appearance?: Appearance;
  /**
   * What it can simulate (ADR 0085), worked out tick by tick by its package's code; inherited whole,
   * and replaced whole by declaring another.
   */
  simulation?: SimulationDefinition;
}

/** The reusable definition of a kind of relation. It inherits everything it does not redefine. */
export interface RelationType {
  id: Id;
  /** @minLength 1 */
  name: string;
  /** The relation type this one derives from: another relation type, or `relates-to`. */
  derivesFrom: Id;
  description?: string;
  /** What it is in other catalogs, by scheme (ADR 0056); absent when it has none. */
  ids?: ExternalIds;
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
  /** A `destination` holds a {@link Destination}: a value that opens something when followed. */
  type: 'string' | 'number' | 'boolean' | 'json' | 'destination';
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
  /**
   * For a string attribute, how its values are written (ADR 0082): `plain`, the default, as the
   * characters they are; `emphasis`, with text emphasis (`**bold**`, `*italic*`, `~~struck~~`,
   * `` `code` ``, `==highlight==`, `++underline++`) wherever they are drawn. Identifiers, SQL and
   * names stay plain.
   */
  format?: 'plain' | 'emphasis';
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
   * Where its shapes place the block of the element's name and detail inside their label area, with
   * an inset of 8 units (ADR 0082): from its top, centred, or ending at its bottom. Essence sets
   * `middle`. Containers and rows write their header at the top whatever it says.
   */
  textPlacement?: 'top' | 'middle' | 'bottom';
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
   * The solid its shapes show (ADR 0075), drawn in place of an image when both are given; `none`
   * shows none, whatever is inherited.
   */
  solid?: AppearanceSolid | 'none';
  /**
   * The explorable its elements show, by its id (ADR 0107): live in the explorable panel, and as its
   * still picture where a shape shows it; `none` shows none, whatever is inherited.
   */
  explorable?: AppearanceExplorable | 'none';
  /**
   * Its shapes' own outline, drawn in place of their kind (ADR 0066); `none` takes an inherited one
   * away, so that the kind is drawn again.
   */
  geometry?: FreeGeometry | 'none';
  /**
   * The named part of an SVG image its shapes are drawn as (ADR 0067); `none` takes an inherited one
   * away.
   */
  part?: PartReference | 'none';
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
  /**
   * What its shapes show inside their body, written in a subset of HTML and CSS and laid out by
   * Visual Anything itself (ADR 0083); `none` takes an inherited face away. Each of its parts is
   * inherited on its own.
   */
  face?: Face | 'none';
  /**
   * The width of its shapes' border, in canvas units, over the drawing defaults' (ADR 0088); 0 draws
   * no border.
   *
   * @minimum 0
   * @maximum 16
   */
  borderWidth?: number;
  /** How its shapes' border is drawn (ADR 0088), as a relation's line is. */
  dash?: 'solid' | 'dashed' | 'dotted';
  /**
   * The corner radius of its shapes, in canvas units, over the drawing defaults' (ADR 0088). It rounds
   * rectangles of either kind; ellipses, cylinders, people and free geometry ignore it.
   *
   * @minimum 0
   * @maximum 64
   */
  cornerRadius?: number;
  /**
   * How opaque its shapes are, from 0.2 to 1 (ADR 0088). Their text stays whole.
   *
   * @minimum 0.2
   * @maximum 1
   */
  opacity?: number;
  /** Whether its shapes cast a soft shadow, over the drawing defaults' (ADR 0088). */
  shadow?: 'none' | 'soft';
  /**
   * A fill that runs from the fill to a second color (ADR 0088); `none` takes an inherited one away.
   */
  gradient?: Gradient | 'none';
  /** How its shapes write the element's name (ADR 0088). Each part is inherited on its own. */
  text?: TextStyle;
}

/** A fill that runs from the shape's fill to `to`, down or to the right (ADR 0088). */
export interface Gradient {
  to: Color;
  direction: 'down' | 'right';
}

/**
 * How a shape writes its element's name (ADR 0088). Whatever it leaves out comes from the component,
 * then the drawing defaults. Emphasis inside text stays Markdown (ADR 0082); these apply to the whole
 * name.
 */
export interface TextStyle {
  /** The typeface: the drawing defaults' two, or Roboto Mono. */
  font?: 'roboto' | 'system' | 'mono';
  /**
   * The name's size, in canvas units.
   *
   * @minimum 8
   * @maximum 48
   */
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** How its lines are aligned across the label area. */
  align?: 'left' | 'center' | 'right';
  /**
   * Where the name is written: inside the shape, or in a tag beside it, attached above, below, to its
   * left or to its right. A name that does not fit inside still moves to a tag below.
   */
  position?: 'inside' | 'above' | 'below' | 'left' | 'right';
  /** The name's color; a color under 4.5:1 on its fill is pointed out, never refused. */
  color?: Color;
  /** The fill behind the name. */
  background?: Color;
  /** The line around the name's back. */
  border?: Color;
  /** Whether the name wraps onto more lines; otherwise it is cut with "…". */
  wrap?: boolean;
  /**
   * The space between the label area's edge and the text, in canvas units.
   *
   * @minimum 0
   * @maximum 48
   */
  padding?: number;
}

/**
 * A component's face (ADR 0083): markup in strict XHTML, filled from the element's name and
 * attributes through `{{…}}` slots, and style in a subset of CSS. Nothing in it runs and nothing in it
 * is fetched. Each part left out is inherited.
 */
export interface Face {
  /**
   * `content`: the face's height is the shape's height, as rows give a table its height. `shape`, the
   * default: it is laid out in the shape's size and cut where it overflows.
   */
  size?: 'content' | 'shape';
  /**
   * Its markup, a line each, so that git shows the lines a change touched. Its caps are the core's,
   * which a command refuses past and opening only warns about: 200 lines and 16 KiB, its variants'
   * included.
   */
  markup?: FaceLine[];
  /** Its style rules, a line each, shared by its variants: at most 128 rules and 16 KiB. */
  style?: FaceLine[];
  /** Other markups, at most 8, each with an id, which levels of detail and collapsed containers show. */
  variants?: FaceVariant[];
  /** The id of the variant a collapsed container shows on its sheet. */
  collapsed?: FaceVariantId;
}

/** Another markup of a face, sharing the face's style. */
export interface FaceVariant {
  id: FaceVariantId;
  /** Its markup, a line each. */
  markup: FaceLine[];
}

/**
 * The id of a face's variant.
 *
 * @pattern ^[a-z][a-z0-9-]{0,31}$
 */
export type FaceVariantId = string;

/**
 * One line of a face's markup or style, without its line ending.
 *
 * @maxLength 2000
 * @pattern ^[^\r\n]*$
 */
export type FaceLine = string;

/**
 * A shape's own outline (ADR 0066): closed contours written in a box of their own, drawn filled and
 * stroked in the shape's colors, a contour inside an odd number of others cut out as a hole.
 */
export interface FreeGeometry {
  /**
   * The width of the box its coordinates are written in, like an SVG view box from its top left.
   *
   * @exclusiveMinimum 0
   * @maximum 100000
   */
  width: number;
  /**
   * The height of that box.
   *
   * @exclusiveMinimum 0
   * @maximum 100000
   */
  height: number;
  /**
   * Its contours.
   *
   * @minItems 1
   * @maxItems 64
   */
  outline: GeometryContour[];
  /** Whether its box keeps its proportions, centred in the shape; otherwise it is stretched to it. */
  keepProportions?: boolean;
  /** Where its shapes write the name and the detail, in the box's coordinates. */
  label?: GeometryLabel;
}

/**
 * One contour of free geometry.
 *
 * @discriminator kind
 */
export type GeometryContour = PathContour | PolygonContour | EllipseContour;

/** Contours as SVG path data: each subpath one contour, closed whether or not it ends with Z. */
export interface PathContour {
  kind: 'path';
  /**
   * SVG path data, with M, L, H, V, C, S, Q, T, A and Z, absolute or relative.
   *
   * @minLength 1
   * @maxLength 32768
   */
  d: string;
}

/** A polygon, its points written as SVG writes them. */
export interface PolygonContour {
  kind: 'polygon';
  /**
   * Three points or more, as x,y pairs.
   *
   * @minLength 1
   * @maxLength 32768
   */
  points: string;
}

/** An ellipse. */
export interface EllipseContour {
  kind: 'ellipse';
  cx: number;
  cy: number;
  /** @exclusiveMinimum 0 */
  rx: number;
  /** @exclusiveMinimum 0 */
  ry: number;
}

/** A rectangle of free geometry's box. */
export interface GeometryLabel {
  x: number;
  y: number;
  /** @exclusiveMinimum 0 */
  width: number;
  /** @exclusiveMinimum 0 */
  height: number;
}

/**
 * A named part of an SVG image or of a solid, as an appearance draws its shapes as one (ADR 0067,
 * ADR 0075). It names the image or the solid, never both.
 */
export interface PartReference {
  /**
   * The part's id in the image, or its name in the solid.
   *
   * @pattern ^[A-Za-z_][\w.-]{0,63}$
   */
  part: string;
  /**
   * The image that names it; left out with `solid`, the image or solid the element's container shows
   * with its parts.
   */
  image?: Id;
  /** The solid that names it, in place of `image` (ADR 0075). */
  solid?: Id;
}

/**
 * What a shape writes under its element's name, wrapped to at most `lines` lines; the whole of it
 * shows on hover (ADR 0082).
 */
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
  /**
   * The most lines the detail takes, from 1 to 6; Essence gives 3. Its last line ends with "…" when
   * the text is longer.
   *
   * @asType integer
   * @minimum 1
   * @maximum 6
   */
  lines?: number;
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
  /**
   * The style of its relations' automatic routes (ADR 0069), over the view's; `orthogonal` undoes an
   * inherited one.
   */
  route?: RouteStyle;
  /**
   * How opaque its lines are, from 0.2 to 1 (ADR 0088). Their labels stay whole.
   *
   * @minimum 0.2
   * @maximum 1
   */
  opacity?: number;
}

/** How a line runs between its ends: square corners, straight, or a smooth curve. */
export type RouteStyle = 'orthogonal' | 'straight' | 'curved';

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
   * The relation types whose relations this view does not draw (ADR 0064): not as lines, not in a
   * collapsed container's aggregated relations, and in no count of relations that leave the view.
   * Such a relation stays in the model. A relation type the view nests by draws containment, so it is
   * never left out. Left out when it has none.
   */
  relationTypesLeftOut?: RelationTypesLeftOut;
  /**
   * How this view draws the automatic routes of the relations whose appearances set no route (ADR
   * 0069). Left out, they are orthogonal.
   */
  routeStyle?: 'straight' | 'curved';
  /**
   * Which rows the shapes that draw their contents as rows draw in this view (ADR 0080, section 5):
   * every row, as when left out, or only their key rows, those whose element is part of a primary
   * key or that a relation the view draws ends on, with a count of the rest.
   */
  rows?: 'all' | 'keys';
  /**
   * Whether selecting a shape or a relation, in a view with more than 40 lines, draws the lines that
   * do not touch the selection faintly (ADR 0080, section 5). Left out, it does; `false` turns it off.
   */
  selectionFadesLines?: boolean;
  /**
   * How this view colors, sizes, marks or fades its shapes by their attributes, in order (ADR 0055):
   * each channel of a shape is set by the first overlay that sets it. Left out when it has none.
   */
  overlays?: Overlays;
  /**
   * How this view draws what no appearance sets, changing the project's drawing defaults for it alone
   * (ADR 0086). Left out, the project's.
   */
  drawing?: DrawingDefaults;
  /**
   * What a merge could not join, as data (ADR 0072): each conflict says which item it is about, what
   * the file keeps in place, and the other choice. Written only by a merge; the person resolves them.
   *
   * @minItems 1
   * @maxItems 10000
   */
  conflicts?: FileConflict[];
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
 * The relation types a view leaves out (ADR 0064), sorted by relation type, each once.
 *
 * @minItems 1
 * @maxItems 256
 */
export type RelationTypesLeftOut = RelationTypeLeftOut[];

/** A relation type a view leaves out, with every relation type derived from it unless `exactly`. */
export interface RelationTypeLeftOut {
  relationType: Id;
  exactly?: boolean;
}

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
   * `orthogonal` runs with square corners, `straight` straight from point to point and `curved` a
   * smooth curve through them; left out, the route takes its automatic style (ADR 0069).
   */
  style?: RouteStyle;
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
 * name, a fixed place on its border, or a fixed place inside it.
 *
 * @discriminator kind
 */
export type EndAttachment = ConnectionPointAttachment | BorderAttachment | InsideAttachment;

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
 * The line attaches at a fixed place inside the end's shape, anywhere on it, which follows the shape
 * as it moves and resizes: across and down its box, each from 0 at its left or top to 1 at its right
 * or bottom.
 */
export interface InsideAttachment {
  kind: 'inside';
  /**
   * @minimum 0
   * @maximum 1
   */
  x: number;
  /**
   * @minimum 0
   * @maximum 1
   */
  y: number;
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
  /**
   * How far the shape is turned clockwise about its middle, in degrees (ADR 0088). Its name stays
   * level; containers drawn as regions and rows are never turned.
   *
   * @exclusiveMinimum 0
   * @exclusiveMaximum 360
   */
  rotation?: number;
  /** Whether the shape's outline and image are mirrored (ADR 0088). Its name is never mirrored. */
  flip?: 'horizontal' | 'vertical' | 'both';
}

/**
 * A shape that is drawing only and does not exist in the model.
 *
 * @discriminator kind
 */
export type FreeShape = Note | Arrow | Picture | ExplorableShape;

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

/**
 * A free shape that shows a media file kept beside the project (ADR 0098): a photo, a screenshot, an
 * animated GIF or an SVG drawing. It belongs to the view and is never part of the model.
 */
export interface Picture {
  kind: 'picture';
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
  /** The media file it shows. */
  media: MediaRef;
  /**
   * What screen readers and the outline say, and what a missing file shows; "Picture" when left out.
   *
   * @minLength 1
   * @maxLength 200
   */
  name?: string;
}

/**
 * A free shape that shows an explorable (ADR 0107): its still picture, live once explored. It belongs
 * to the view and is never part of the model; bound to an element, it reads that element's data.
 */
export interface ExplorableShape {
  kind: 'explorable';
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
  /** The explorable it shows, by its id. */
  explorable: Id;
  /** The element whose data it reads; left out, it reads none but its parameters. */
  element?: Id;
  /**
   * What screen readers and the outline say; the explorable's name when left out.
   *
   * @minLength 1
   * @maxLength 200
   */
  name?: string;
}

/** The formats a media file may have (ADR 0098). */
export type MediaFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'svg';

/**
 * Which media file a picture shows and what it is, so that the scene can place it and an export can
 * name it before the file is read (ADR 0098). The file is `media/<hash>.<extension>` beside the
 * project.
 */
export interface MediaRef {
  /**
   * The SHA-256 of the cleaned file, in lowercase hexadecimal.
   *
   * @pattern ^[0-9a-f]{64}$
   */
  hash: string;
  format: MediaFormat;
  /**
   * Its own width in pixels.
   *
   * @minimum 1
   * @maximum 8192
   * @asType integer
   */
  width: number;
  /**
   * Its own height in pixels.
   *
   * @minimum 1
   * @maximum 8192
   * @asType integer
   */
  height: number;
  /**
   * The size of the cleaned file, in bytes.
   *
   * @minimum 1
   * @maximum 33554432
   * @asType integer
   */
  bytes: number;
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
  /**
   * The steps in reading order: every step of every alternative of its decisions (ADR 0078). A
   * scenario without decisions plays them all, in order.
   */
  steps: Step[];
  /**
   * Its decisions, each over a stretch of its steps (ADR 0078); left out when it has none.
   *
   * @minItems 1
   * @maxItems 64
   */
  blocks?: ScenarioBlock[];
  /**
   * What a merge could not join, as data (ADR 0072): each conflict says which item it is about, what
   * the file keeps in place, and the other choice. Written only by a merge; the person resolves them.
   *
   * @minItems 1
   * @maxItems 10000
   */
  conflicts?: FileConflict[];
}

/** A structure over a stretch of a scenario's steps. Decisions only, for now (ADR 0078). */
export type ScenarioBlock = DecisionBlock;

/**
 * A point where a scenario goes one of several labelled ways (ADR 0078). Its alternatives' steps are
 * stretches of the scenario's steps that follow one another; a decision may sit inside an alternative
 * of another, at most three deep.
 */
export interface DecisionBlock {
  id: Id;
  kind: 'decision';
  /**
   * What it decides, as a question: "Are there free slots?".
   *
   * @minLength 1
   * @maxLength 200
   */
  question: string;
  /**
   * @minItems 2
   * @maxItems 8
   */
  alternatives: Alternative[];
  /** The alternative that plays when nothing chooses; the first when left out. */
  default?: Id;
}

/** One of the ways a decision can go: the steps that play when it is chosen. */
export interface Alternative {
  id: Id;
  /**
   * @minLength 1
   * @maxLength 200
   */
  label: string;
  /**
   * Its steps by id, a stretch of the scenario's steps in their order; none for the way where
   * nothing happens.
   *
   * @maxItems 10000
   * @uniqueItems true
   */
  steps: Id[];
  /** The scenario ends after this alternative, as an error path does. */
  ends?: true;
}

/**
 * The alternative chosen at each decision of a scenario, by the decision's id (ADR 0078). Choices
 * belong to the tab that plays; a file keeps them only to play a given alternative from a tour's step
 * or a view state.
 *
 * @minProperties 1
 * @maxProperties 64
 */
export type DecisionChoices = Record<Id, Id>;

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
   * written under the name), the contents or rows, the image, and the face (ADR 0083), which a shape
   * with a face draws in place of its name and detail.
   *
   * @minItems 1
   * @maxItems 6
   * @uniqueItems true
   */
  shows: LevelPart[];
  /** The variant of the face it shows, by its id; absent, the face's own markup (ADR 0083). */
  face?: FaceVariantId;
}

/** One thing a shape shows at a level of detail. */
export type LevelPart = 'silhouette' | 'name' | 'detail' | 'contents' | 'image' | 'face';

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
// External identifiers, crosswalks and destinations (M8, ADR 0056) ---------------------------------

/**
 * A scheme of external identifiers: a short lowercase name for someone else's catalog, such as
 * `uberon` or `fma`.
 *
 * @pattern ^[a-z][a-z0-9_-]{0,31}$
 */
export type IdScheme = string;

/**
 * An identifier in someone else's catalog, such as `UBERON:0002135`. It is data, never followed.
 *
 * @minLength 1
 * @maxLength 200
 * @pattern ^[^\x00-\x1f\x7f]*$
 */
export type ExternalId = string;

/**
 * What an element, a component or a relation type is in other catalogs, by scheme, such as
 * `{ "uberon": "UBERON:0002135", "fma": "FMA:7235" }`. Search finds by them, importers match by
 * them, and nothing ever follows them.
 *
 * @minProperties 1
 * @maxProperties 32
 */
export type ExternalIds = Record<IdScheme, ExternalId>;

/**
 * A table that maps the identifiers of one scheme to another's, such as `uberon` to `fma`, used by
 * importers to fill in the schemes a file lacks.
 */
export interface Crosswalk {
  /** The scheme its keys are in. */
  from: IdScheme;
  /** The scheme its values are in; never the same as `from`. */
  to: IdScheme;
  /** Where the table comes from, in words, such as the release of the crosswalk it was made from. */
  source?: string;
  /** Each identifier of `from` with the identifier of `to` it maps to. */
  entries: CrosswalkEntries;
}

/**
 * A crosswalk's identifiers of one scheme, each with the one of the other scheme it maps to.
 *
 * @minProperties 1
 * @maxProperties 100000
 */
export type CrosswalkEntries = Record<ExternalId, ExternalId>;

/**
 * The value of a `destination` attribute: a view of this project, a view of another project, or a
 * web address, opened when the destination is followed. Ids keep it valid across renames.
 */
export type Destination = ViewDestination | ProjectDestination | WebDestination;

/** A view of this project, opened in the open tab and focused on some of its elements. */
export interface ViewDestination {
  view: Id;
  /**
   * The elements to select and show there.
   *
   * @minItems 1
   * @maxItems 100
   * @uniqueItems true
   */
  focus?: Id[];
}

/**
 * Another project, opened by its own local program in a tab of its own, after the tab asks (ADR 0044).
 */
export interface ProjectDestination {
  /**
   * The project's folder, relative to this project's folder, written with `/`; it never leads out of
   * the folder that holds this project's folder, such as `../billing`.
   *
   * @minLength 1
   * @maxLength 1024
   */
  project: string;
  /** The view to open there; absent, it opens where that project opens. */
  view?: Id;
}

/** A web address, opened in a new tab only on a click, after a confirmation that names its host. */
export interface WebDestination {
  /**
   * An `https:` address, without a user name or password; nothing ever fetches it.
   *
   * @maxLength 2048
   * @pattern ^https://
   */
  url: string;
}

// ——— Tours (ADR 0058) ———

/**
 * The contents of a `.vatour` file: a tour, steps that each take the canvas to a view state and
 * explain it with a caption, played full screen to walk someone through a concept (ADR 0058).
 *
 * @title Visual Anything tour file
 */
export interface TourFile {
  id: Id;
  /**
   * @minLength 1
   * @maxLength 200
   */
  name: string;
  /** @maxLength 4000 */
  description?: string;
  /**
   * The steps in order. A step that names something deleted is kept, and played without it.
   *
   * @maxItems 1000
   */
  steps: TourStep[];
  /**
   * How its caption cards look (ADR 0096): a face, filled from each step's caption, which every step
   * without a look of its own takes.
   */
  captionFace?: CaptionFace;
  /**
   * How its steps mark what they mark (ADR 0100), each step without an emphasis of its own: `style`
   * draws it in its own style, heavier and in the canvas's emphasis color; left out, with a halo.
   */
  emphasis?: TourEmphasis;
  /**
   * What a merge could not join, as data (ADR 0072): each conflict says which item it is about, what
   * the file keeps in place, and the other choice. Written only by a merge; the person resolves them.
   *
   * @minItems 1
   * @maxItems 10000
   */
  conflicts?: FileConflict[];
}

/**
 * How a tour step marks what it marks (ADR 0100): `halo` lays a halo over it (ADR 0077); `style`
 * draws nothing over it and restyles it instead, a relation heavier, in the canvas's emphasis color,
 * its dash flowing from its `from` end to its `to` end, and an element with a stronger border and a
 * soft lift.
 */
export type TourEmphasis = 'halo' | 'style';

/** One step of a tour: where it takes the canvas, what it says there, and what it marks. */
export interface TourStep {
  id: Id;
  /** Where the step takes the canvas and how it reads there; everything but its view is optional. */
  viewState: SavedViewState;
  /**
   * A view shown beside the step, in the pane right of the one the tour plays in (ADR 0102): the
   * pane shows its view, at its camera or else the whole view. Left out, that pane stays as the step
   * before left it.
   */
  beside?: SavedViewState;
  /** What the caption card says while the step shows. */
  caption: TourCaption;
  /**
   * The elements and relations the step highlights, as guidance highlights them. Left out when it
   * highlights none.
   *
   * @minItems 1
   * @maxItems 500
   * @uniqueItems true
   */
  marks?: Id[];
  /** A scenario played while the step shows, over the step's view. */
  play?: TourPlayback;
  /**
   * An explorable the step shows live in the explorable panel while it plays, with the values it
   * sets (ADR 0107).
   */
  explorable?: TourExplorable;
  /**
   * Marks brought in one press forward at a time, after the step's own marks (ADR 0077).
   *
   * @minItems 1
   * @maxItems 50
   */
  reveal?: TourReveal[];
  /** Dims everything the step does not mark, but the ends of the relations it marks. */
  dimRest?: true;
  /**
   * How the step and its reveals mark what they mark (ADR 0100); left out, as the tour's `emphasis`
   * says, and with a halo when it says nothing.
   */
  emphasis?: TourEmphasis;
  /** Moves on by itself; left out, the step waits for the person. */
  advance?: TourAdvance;
  /**
   * `cut` makes the step always cut with a cross-fade (ADR 0084); left out, the shapes it shares with
   * the step before glide to their new places when it can.
   */
  transition?: 'cut';
  /** A marker sent along a chain of relations once the step's transition is over (ADR 0084). */
  pulse?: TourPulse;
  /**
   * What the person presenting reads while the step shows, in the speaker notes window only: plain
   * text, as a caption's.
   *
   * @minLength 1
   * @maxLength 20000
   */
  notes?: string;
}

/**
 * What a step's caption card says: a title and a text. Both are plain text, never HTML: a blank line
 * starts a paragraph, and lines that start with "- ", or with a number and ". ", make a list.
 */
export interface TourCaption {
  /**
   * @minLength 1
   * @maxLength 200
   */
  title: string;
  /**
   * @minLength 1
   * @maxLength 4000
   */
  text?: string;
  /**
   * Where the card sits: a corner, or a place the person dragged it to (ADR 0095); left out, the side
   * of the screen farthest from the step's marks.
   */
  place?: CaptionCorner | CaptionAt;
  /**
   * One of the step's marks that a leader line from the card points at (ADR 0084): an element, a
   * relation, a note or an arrow.
   */
  pointTo?: Id;
  /** How big the card is (ADR 0096); left out, as wide as the stage makes it and as tall as its content. */
  size?: CaptionSize;
  /** How this step's card looks (ADR 0096); left out, as the tour's `captionFace` says. */
  face?: CaptionFace;
  /** How the line to `pointTo` is drawn (ADR 0097); left out, straight from the nearest point, with a dot. */
  leader?: CaptionLeader;
}

/**
 * The size a caption card was given (ADR 0096), as fractions of the screen, so that it keeps its
 * proportions on any screen.
 */
export interface CaptionSize {
  /**
   * @minimum 0.1
   * @maximum 1
   */
  width: number;
  /**
   * Left out, the card is as tall as its content.
   *
   * @minimum 0.1
   * @maximum 1
   */
  height?: number;
}

/** How a caption's leader line is drawn (ADR 0097); each part left out is drawn as before. */
export interface CaptionLeader {
  /** Straight; with one right-angled turn; or curved, leaving the card square to its side. */
  shape?: 'straight' | 'elbow' | 'curved';
  /** What it ends in at the mark. */
  end?: 'dot' | 'arrow' | 'none';
  /** The card's side it leaves from, at its middle; left out, the card's point nearest the mark. */
  from?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * How a tour's caption cards look (ADR 0096): markup and style in a face's subset (ADR 0083), filled
 * with `{{name}}`, the step's title, `{{text}}`, its text, `{{step}}` and `{{steps}}`, and
 * `{{component}}`, the tour's name.
 */
export interface CaptionFace {
  /** Its markup, a line each. */
  markup: FaceLine[];
  /** Its style rules, a line each. */
  style?: FaceLine[];
}

/** A corner of the screen a caption card can be fixed in. */
export type CaptionCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * A place on the screen a caption card was dragged to (ADR 0095), as fractions of the room the card
 * leaves, so that it stays whole on any screen: 0 puts its left or top edge at the screen's, 1 its
 * right or bottom edge at the screen's.
 */
export interface CaptionAt {
  /**
   * @minimum 0
   * @maximum 1
   */
  x: number;
  /**
   * @minimum 0
   * @maximum 1
   */
  y: number;
}

/**
 * A pulse (ADR 0084): a marker travels along each relation of a chain in turn, to show what follows
 * what within one step.
 */
export interface TourPulse {
  /**
   * The chain, in order: each relation shares an end with the next.
   *
   * @minItems 1
   * @maxItems 12
   * @uniqueItems true
   */
  relations: Id[];
  /**
   * How many times it runs; left out, once.
   *
   * @minimum 2
   * @maximum 3
   * @asType integer
   */
  repeat?: number;
}

/** A scenario a step plays, from one of its steps to another. */
export interface TourPlayback {
  scenario: Id;
  /** The step it starts on; its first step when left out. */
  from?: Id;
  /** The step it stops on; its last step when left out. */
  to?: Id;
  /** The alternatives it plays at the scenario's decisions; their defaults when left out. */
  choices?: DecisionChoices;
}

/** A part of a step's marks that comes in on its own press forward, with a sentence for the caption. */
export interface TourReveal {
  /**
   * @minItems 1
   * @maxItems 500
   * @uniqueItems true
   */
  marks: Id[];
  /**
   * Added to the caption as a paragraph when it comes in: plain text, as a caption's.
   *
   * @minLength 1
   * @maxLength 4000
   */
  text?: string;
}

/**
 * When a step moves on by itself: after a number of milliseconds, never fewer than its caption takes
 * to read, or `after-scenario`, once the scenario it plays ends.
 */
export type TourAdvance = AdvanceAfter | 'after-scenario';

/**
 * Milliseconds a step shows before it moves on by itself.
 *
 * @minimum 500
 * @maximum 600000
 */
export type AdvanceAfter = number;

/**
 * A view state as a project file keeps it (ADR 0030's addendum): the view and, each optional, where
 * the canvas looks, what is selected, the filters, focus mode, and the scenario open and its step.
 * Everything is named by id, so that renames do not break it.
 */
export interface SavedViewState {
  /** The view open on the canvas. */
  view: Id;
  /** Where the canvas looks; left out, the canvas shows the selection, or else the whole view. */
  camera?: SavedCamera;
  /**
   * What is selected: elements, relations and free shapes.
   *
   * @minItems 1
   * @maxItems 500
   * @uniqueItems true
   */
  select?: Id[];
  /** What the filters hide (ADR 0025). */
  filters?: SavedFilters;
  /** Focus mode; left out, it is off. */
  focus?: SavedFocus;
  /** The scenario open in the scenario panel, which plays over this view. */
  scenario?: Id;
  /** The step of that scenario playback is on, by its id; it needs `scenario`. */
  step?: Id;
  /** The alternatives chosen at that scenario's decisions (ADR 0078); it needs `scenario`. */
  choices?: DecisionChoices;
  /** The physical-space panel, open beside the canvas (ADR 0076); left out, it is closed. */
  space?: SavedSpace;
  /** One simulation shown at one tick (ADR 0085); left out, none. */
  simulation?: SavedSimulation;
}

/** Where the canvas looks: the point of the view at its middle, in canvas units, and the zoom. */
export interface SavedCamera {
  /**
   * @minimum -1000000000
   * @maximum 1000000000
   */
  x: number;
  /**
   * @minimum -1000000000
   * @maximum 1000000000
   */
  y: number;
  /**
   * How large one canvas unit shows, in screen pixels.
   *
   * @minimum 0.001
   * @maximum 1000
   */
  zoom: number;
}

/**
 * What a view state's filters hide: the elements created from some components, the relations of some
 * relation types, whatever does not meet some conditions, and what falls outside a time range.
 *
 * @minProperties 1
 */
export interface SavedFilters {
  /**
   * @minItems 1
   * @maxItems 500
   * @uniqueItems true
   */
  components?: Id[];
  /**
   * @minItems 1
   * @maxItems 500
   * @uniqueItems true
   */
  relationTypes?: Id[];
  /**
   * @minItems 1
   * @maxItems 32
   */
  conditions?: SavedCondition[];
  /** The time range what stays shown must meet (ADR 0025's clarification of W37). */
  range?: SavedTimeRange;
}

/**
 * A time range of a view state's filters: what has a value for it outside the range is hidden, and
 * what has none stays shown.
 */
export interface SavedTimeRange {
  of: 'elements' | 'relations';
  /**
   * The attribute of the point, or of the start of a period.
   *
   * @minLength 1
   * @maxLength 200
   */
  attribute: string;
  /**
   * The attribute of the end of a period, when the range is on periods.
   *
   * @minLength 1
   * @maxLength 200
   */
  until?: string;
  /**
   * What the values read as: numbers, dates and date-times (milliseconds since 1970, UTC), or times
   * of day (seconds since midnight).
   */
  kind: 'number' | 'date' | 'time';
  /** One end of the range, on that axis; both are included, whichever way round. */
  from: number;
  /** The other end of the range. */
  to: number;
}

/** A condition on an attribute that elements, or relations, must meet to stay shown. */
export interface SavedCondition {
  of: 'elements' | 'relations';
  /**
   * @minLength 1
   * @maxLength 200
   */
  attribute: string;
  test: 'is' | 'is-not' | 'contains' | 'below' | 'above' | 'set' | 'unset';
  /**
   * What the value is compared with; left out for `set` and `unset`.
   *
   * @minLength 1
   * @maxLength 200
   */
  value?: string;
}

/** Focus mode: how far it reaches, which way, whether it isolates, and what it starts from. */
export interface SavedFocus {
  /** How many relations away it reaches, or every degree. */
  degrees: FocusDegrees | 'all';
  direction: 'both' | 'outgoing' | 'incoming';
  /** Whether it hides what it does not reach, instead of drawing it faintly. */
  isolate?: boolean;
  /**
   * The elements and relations it starts from; left out, it starts from the selection.
   *
   * @minItems 1
   * @maxItems 500
   * @uniqueItems true
   */
  from?: Id[];
}

/**
 * How many relations away focus reaches.
 *
 * @minimum 1
 * @maximum 5
 * @asType integer
 */
export type FocusDegrees = number;

// ——— Comments (ADR 0059) ———

/**
 * The contents of a `.vacomment` file: one thread, the comments about one element, relation, view or
 * point of a view, kept until it is resolved (ADR 0059). Each thread has a file of its own, so that
 * threads added in two branches merge without a conflict.
 *
 * @title Visual Anything comment file
 */
export interface CommentFile {
  id: Id;
  /** What the thread is about. A thread whose anchor is deleted is kept, as a detached thread. */
  anchor: CommentAnchor;
  /** Whether the thread is resolved; left out while it is open. */
  resolved?: boolean;
  /**
   * The comments, oldest first.
   *
   * @minItems 1
   * @maxItems 1000
   */
  comments: ThreadComment[];
  /**
   * What a merge could not join, as data (ADR 0072): each conflict says which item it is about, what
   * the file keeps in place, and the other choice. Written only by a merge; the person resolves them.
   *
   * @minItems 1
   * @maxItems 10000
   */
  conflicts?: FileConflict[];
}

/**
 * What a thread is about: an element, a relation, a view, or a point of a view.
 *
 * @discriminator kind
 */
export type CommentAnchor = ElementAnchor | RelationAnchor | ViewAnchor | PointAnchor;

/** A thread about an element, shown on its shapes in every view that shows it. */
export interface ElementAnchor {
  kind: 'element';
  element: Id;
}

/** A thread about a relation, shown on its line in every view that shows it. */
export interface RelationAnchor {
  kind: 'relation';
  relation: Id;
}

/** A thread about a view as a whole. */
export interface ViewAnchor {
  kind: 'view';
  view: Id;
}

/** A thread about a point of a view, in canvas units. */
export interface PointAnchor {
  kind: 'point';
  view: Id;
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

/** A remark in a thread, with its author and time. */
export interface ThreadComment {
  id: Id;
  author: CommentAuthor;
  /** When it was written. */
  time: CommentTime;
  /** When it was last edited, if it was. */
  edited?: CommentTime;
  /**
   * Plain text, never HTML: a blank line starts a paragraph, and lines that start with "- ", or with
   * a number and ". ", make a list.
   *
   * @minLength 1
   * @maxLength 20000
   */
  text: string;
}

/**
 * A time in UTC, as ISO 8601 writes it, such as `2026-10-25T14:03:00.000Z`.
 *
 * @pattern ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$
 */
export type CommentTime = string;

/**
 * Who wrote a comment: a person, by the name and email in their preferences, or Claude.
 *
 * @discriminator kind
 */
export type CommentAuthor = PersonAuthor | ClaudeAuthor;

/** A person, as their preferences name them (ADR 0032). */
export interface PersonAuthor {
  kind: 'person';
  /**
   * @minLength 1
   * @maxLength 200
   */
  name: string;
  /**
   * @maxLength 254
   * @pattern ^[^\s@]+@[^\s@]+$
   */
  email?: string;
}

/** Claude. */
export interface ClaudeAuthor {
  kind: 'claude';
}

/**
 * What a merge of one project file could not join (ADR 0072). The file in place is a valid file of
 * its kind; `other` and `base` are JSON as that kind of file holds the item, checked only when chosen.
 */
export interface FileConflict {
  /** Unique within its file. */
  id: Id;
  /**
   * The item, by a key local to its file: `world`, `element:<id>`, `relation:<id>` or `order` in
   * the model file; `package`, `component:<id>`, `relation-type:<id>` or `image:<id>` in a package
   * file; `view`, `position:<element>`, `position:<element> in <container>`, `free-shape:<id>`,
   * `stacking:<container>` or `route:<relation>` in a view file; `scenario`, `step:<id>`, `tour`,
   * `tour-step:<id>`, `thread` or `comment:<id>` in theirs; `project` in the project file.
   *
   * @minLength 1
   * @maxLength 300
   */
  item: string;
  /**
   * Where the value lies inside the item, as a list of keys; empty for the whole item.
   *
   * @maxItems 16
   */
  path: string[];
  why: ConflictReason;
  /** Whose value the file holds in place. */
  kept: 'ours' | 'theirs';
  /** The other side's value; left out when that side removed the item. */
  other?: JsonValue;
  /** The common ancestor's value; left out when it had none. */
  base?: JsonValue;
  /** The names git gave the two sides, when it gave them. */
  sides?: ConflictSides;
}

/**
 * Why a merge could not join: both sides changed a value differently; one removed what the other
 * changed; both added an id with different values; a removal meets what needs what it removes; two
 * additions close a containment cycle; or both sides reordered a list differently.
 */
export type ConflictReason =
  'both-changed' | 'removed-and-changed' | 'both-added' | 'needs-removed' | 'cycle' | 'order';

/** The names of a merge's two sides, as git gave them. */
export interface ConflictSides {
  /**
   * @minLength 1
   * @maxLength 200
   */
  ours?: string;
  /**
   * @minLength 1
   * @maxLength 200
   */
  theirs?: string;
}
