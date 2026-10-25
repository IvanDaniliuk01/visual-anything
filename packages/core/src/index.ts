export type { ProjectSnapshot } from './snapshot';

export {
  BUILTIN_PACKAGES,
  C4,
  DATA_MODELING,
  DATA_SCIENCE,
  ESSENCE,
  RELATES_TO,
  RESERVED_PACKAGE_IDS,
  SYSTEMS,
  builtinPackage,
} from './builtin';

export type {
  AppearanceTrait,
  DetailPart,
  ResolvedDetail,
  TraitOrigin,
  TraitPath,
  TraitSource,
  TraitSources,
  Typed,
} from './appearance';
export {
  APPEARANCE_TRAITS,
  TRAIT_PATHS,
  attributeValue,
  detailParts,
  detailText,
  resolveAppearance,
  startedTypesByElement,
  traitSources,
  valueFitsType,
} from './appearance';

export type {
  Defined,
  Definitions,
  Drawn,
  DrawnRelation,
  RelationAppearanceTrait,
  ResolvedAppearance,
  ResolvedComponent,
  ResolvedRelationAppearance,
  ResolvedRelationType,
  ShapeColors,
} from './definitions';
export {
  RELATION_APPEARANCE_TRAITS,
  appearanceOf,
  appearanceOriginsOf,
  componentOrEssence,
  darkColorsOf,
  definitionsOf,
  drawnColorsOf,
  drawnRelationAppearanceOf,
  isBuiltInDefinition,
  relationAppearanceOf,
  relationAppearanceOriginsOf,
  relationDarkStrokeOf,
  relationTypeOrRelatesTo,
} from './definitions';

export type { FreeShapeColor, FreeShapeTheme } from './colors';
export {
  CANVAS_BACKGROUNDS,
  COLOR_PATTERN,
  MINIMUM_MARK_CONTRAST,
  MINIMUM_TEXT_CONTRAST,
  arrowColorOf,
  contrastRatio,
  isColor,
  legibility,
  noteColorsOf,
  relativeLuminance,
  sameColor,
  storedColor,
} from './colors';
export type { DarkShades } from './builtin/dark';
export { DARK_SHADES, darkShadeOf } from './builtin/dark';
export type { EditableAppearance } from './project-appearances';
export { colorsInUse, editableAppearanceOf, projectAppearanceOf } from './project-appearances';

export type { Placement } from './containment';
export { containmentTree } from './containment';
export type { NestingChoice } from './containers';
export { leavingRelations, nestingTypeFor, nestingTypesInView } from './containers';
export {
  contentsInView,
  modelRankOf,
  orderByStacking,
  stackingKey,
  stackingListFor,
  stackingOperations,
  stackingOrderOf,
  storedStacking,
} from './stacking';

export type { ModelIndex } from './model-index';
export { indexModel } from './model-index';
export { definitionsIn, modelIndexOf } from './state';
// What a view shows through its scope, and the scope's limits (ADR 0040).
export { shownByScope, type ShownByScope } from './scope';
export { shapesInView, type ShapesInView } from './scope-placement';
export { MAX_SCOPE_DEPTH, MAX_SCOPE_RULES } from './commands/scopes';
// How filters and scopes test an attribute (ADR 0025, ADR 0040).
export { meetsCondition, type AttributeTest } from './conditions';
// A relation in words, as the history names it.
export { relationLabel } from './commands/model';

export type { Problem, ProblemCode } from './problems';

// What ships with Visual Anything carries a license that lets it ship (ADR 0047).
export type { ShippableLicense } from './licenses';
export {
  LICENSE_PATTERN,
  MAX_ATTRIBUTION,
  SHIPPABLE_LICENSES,
  VERSION_PATTERN,
  isLicenseId,
  isPackageVersion,
  isShippableLicense,
  shippingProblems,
} from './licenses';
// Packages shared between projects (ADR 0051).
export type {
  ListChanges,
  NamedItem,
  PackageChanges,
  PackageNeeds,
  PackageProperty,
  PropertyChange,
} from './package-sharing';
export { compareVersions, packageChanges, packageNeeds } from './package-sharing';

export type { IdGenerator } from './ids';
export { ID_PATTERN, definitionIdFor, freshId, isId, randomIds, slug } from './ids';

export type {
  Collection,
  CollectionItems,
  Item,
  Operation,
  PackageProperties,
  RouteEntry,
  ViewProperties,
} from './operations';
export {
  BULK,
  OperationError,
  applyOperation,
  applyOperations,
  keyOf,
  positionKey,
} from './operations';

export type { DeletePreview, DeleteTargets, RemovedPosition, RemovedRoute } from './rules';
export { containmentCycles, limitWarnings, previewDelete, wouldFormCycle } from './rules';

export type * from './commands/types';
export type { CommandContext, CommandOutcome, ContainerChangePreview } from './commands';
export { executeCommand, previewChangeContainer } from './commands';

export type { Author, History, HistoryEntry, HistorySummary, Step as HistoryStep } from './history';
export {
  EMPTY_HISTORY,
  HISTORY_LIMIT,
  HISTORY_WEIGHT_LIMIT,
  actionWeight,
  record,
  redo,
  summarize,
  undo,
} from './history';

export type { ProjectCheck } from './check';
export { checkProject } from './check';

export * from './images';
export * from './import';

export type {
  AppMessage,
  CommandRejectedMessage,
  NoticeMessage,
  PreferencesChangedMessage,
  PreferencesSetMessage,
  ProjectChangedMessage,
  ProjectOpenedMessage,
  ProjectReloadedMessage,
  ServerMessage,
} from './protocol';
export {
  LIVE_PATH,
  PROTOCOL_VERSION,
  ProtocolError,
  THEME_PARAM,
  TOKEN_PARAM,
  decodeAppMessage,
  decodeServerMessage,
  encodeMessage,
  encodeServerMessage,
} from './protocol';

export type {
  PreferenceChanges,
  PreferenceName,
  Preferences,
  PreferencesRead,
  ThemeChoice,
  ThemeName,
} from './preferences';
export {
  DEFAULT_PREFERENCES,
  MAX_RECENT_COLORS,
  PREFERENCES_VERSION,
  PREFERENCE_NAMES,
  THEME_CHOICES,
  THEME_NAMES,
  applyPreferenceChanges,
  checkPreferenceChanges,
  formatPreferences,
  isThemeChoice,
  readPreferences,
  resolveTheme,
} from './preferences';
export * from './scenarios';
// The live protocol's guidance and launch codes (version 3).
export type { Guidance, GuidanceMessage } from './protocol';
export { LAUNCH_PARAM, MAX_CAPTION_LENGTH, MAX_GUIDANCE_TARGETS, readGuidance } from './protocol';
// Relations routed by hand, per view (ADR 0039).
export type { ResolvedAttachment, ResolvedRoute, RouteLookups, RouteShapes, Side } from './routes';
export { MAX_BEND_POINTS, routeOf } from './routes';
// The live protocol's history list, and undo or redo up to an action (version 5).
export type { HistoryListedMessage, ListedAction } from './protocol';
// The start screen of a folder that holds no project yet (ADR 0051).
export type { OfferedSample, StartCreateMessage, StartOfferedMessage } from './protocol';
export { MAX_START_NAME } from './protocol';
export { readListedActions } from './protocol';
// The view state a view address carries (ADR 0030's addendum of 2026-10-25).
export type {
  ViewCamera,
  ViewFilters,
  ViewFocus,
  ViewState,
  ViewStateCheck,
  ViewStateRead,
} from './view-state';
export {
  MAX_CAMERA_DISTANCE,
  MAX_CAMERA_ZOOM,
  MAX_VIEW_STATE_ADDRESS,
  MAX_VIEW_STATE_IDS,
  MIN_CAMERA_ZOOM,
  VIEW_STATE_KEYS,
  checkViewState,
  readViewState,
  viewStateProblems,
  withViewState,
  writeViewState,
} from './view-state';
// The limits a view state's filters share with guidance's.
export { MAX_FILTER_CONDITIONS, MAX_FILTER_TEXT } from './protocol';
// Package code (ADR 0054): the hooks' types, the checks of their answers, the hash and the approvals.
export * from './code';
// Tours (ADR 0058), and the plain text with paragraphs and lists their captions hold.
export * from './tours';
export type { TextBlock } from './plain-text';
export { textBlocks } from './plain-text';
