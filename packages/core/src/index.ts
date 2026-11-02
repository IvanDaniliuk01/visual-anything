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
  FaceTraitPath,
  ResolvedDetail,
  TraitOrigin,
  TraitPath,
  TraitSource,
  TraitSources,
  Typed,
} from './appearance';
export {
  APPEARANCE_TRAITS,
  FACE_PARTS,
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
  MINIMUM_COLOR_DIFFERENCE,
  MINIMUM_MARK_CONTRAST,
  MINIMUM_TEXT_CONTRAST,
  arrowColorOf,
  colorDifference,
  contrastRatio,
  isColor,
  labOf,
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
// The relation types a view leaves out (ADR 0064).
export {
  leavesOutRelationTypes,
  relationTypesLeftOutBy,
  showsPart,
  type LeftOutTypes,
} from './scope';
export { shapesInView, type ShapesInView } from './scope-placement';
// Whether the app's placement of what an action added joins that action (ADR 0065).
export { placementJoins, type PlacementJoin } from './placement-joins';
export { MAX_RELATION_TYPES_LEFT_OUT, MAX_SCOPE_DEPTH, MAX_SCOPE_RULES } from './commands/scopes';
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
  extendNewest,
  record,
  redo,
  summarize,
  undo,
} from './history';

export type { ProjectCheck } from './check';
export { checkProject } from './check';

export * from './images';
// Solids (ADR 0075): the canonical form's reader, the camera's maths and the catalog.
export * from './solids';
// Physical space (ADR 0076): poses and what is in physical space under a root.
export * from './space';
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
  AuthorPreference,
  MotionChoice,
  PreferenceChanges,
  PreferenceName,
  Preferences,
  PreferencesRead,
  SidePanelPreference,
  SidePanelsPreference,
  ThemeChoice,
  ThemeName,
} from './preferences';
export {
  DEFAULT_PREFERENCES,
  MAX_RECENT_COLORS,
  MAX_SIDE_PANEL_WIDTH,
  MIN_SIDE_PANEL_WIDTH,
  MOTION_CHOICES,
  PREFERENCES_VERSION,
  PREFERENCE_NAMES,
  THEME_CHOICES,
  THEME_NAMES,
  applyPreferenceChanges,
  checkPreferenceChanges,
  formatPreferences,
  isMotionChoice,
  isThemeChoice,
  readPreferences,
  reducedMotionOf,
  resolveTheme,
} from './preferences';
export * from './scenarios';
// The live protocol's guidance and launch codes (version 3).
export type { Guidance, GuidanceMessage } from './protocol';
export { LAUNCH_PARAM, MAX_CAPTION_LENGTH, MAX_GUIDANCE_TARGETS, readGuidance } from './protocol';
// Layout guidance the app answers, once laid out (M3d).
export type {
  LayoutDoneMessage,
  LayoutEnding,
  LayoutPass,
  LayoutReport,
  LayoutResult,
} from './layout-answer';
export { LAYOUT_ENDINGS, LAYOUT_PASSES, MAX_LAYOUT_WHY } from './layout-answer';
// A picture of a view as the app draws it, for Claude (ADR 0081).
export type {
  CaptureAnswerMessage,
  CaptureAsk,
  CaptureFailure,
  CaptureFailureKind,
  CapturePass,
  CapturePicture,
  CaptureRead,
  CaptureRegion,
  CaptureReport,
  CaptureRequestMessage,
} from './capture';
export {
  CAPTURE_FAILURES,
  CAPTURE_PASSES,
  CAPTURE_WAIT,
  CAPTURE_WIDTH,
  MAX_CAPTURE_BYTES,
  MAX_CAPTURE_ELEMENTS,
  MAX_CAPTURE_HEIGHT,
  MAX_CAPTURE_SIDE,
  MAX_CAPTURE_WHY,
  base64Length,
  readCaptureAnswer,
  readCaptureAsk,
  readCaptureFailure,
  readCapturePicture,
  readCaptureRequest,
} from './capture';
// Relations routed by hand, per view (ADR 0039).
export type { ResolvedAttachment, ResolvedRoute, RouteLookups, RouteShapes, Side } from './routes';
export { MAX_BEND_POINTS, automaticRouteStyleOf, routeOf, storedRoute } from './routes';
// The live protocol's history list, and undo or redo up to an action (version 5).
export type { HistoryListedMessage, ListedAction } from './protocol';
// The start screen of a folder that holds no project yet (ADR 0051).
export type { OfferedSample, StartCreateMessage, StartOfferedMessage } from './protocol';
export { MAX_START_NAME } from './protocol';
// Following a destination to another project (version 6, ADR 0056).
export type { OpenOtherProjectMessage, OtherProjectOpenedMessage } from './protocol';
export { readListedActions } from './protocol';
// The view state a view address carries (ADR 0030's addendum of 2026-10-25).
export type {
  ViewCamera,
  ViewFilters,
  ViewFocus,
  ViewState,
  ViewStateCheck,
  ViewSimulation,
  ViewSpace,
  ViewStateRead,
  ViewTimeRange,
} from './view-state';
export {
  MAX_CAMERA_DISTANCE,
  MAX_CAMERA_ZOOM,
  MAX_SPACE_DISTANCE,
  MAX_VIEW_STATE_ADDRESS,
  MAX_VIEW_STATE_CHOICES,
  MAX_VIEW_STATE_IDS,
  MIN_CAMERA_ZOOM,
  VIEW_STATE_KEYS,
  checkViewState,
  choiceProblems,
  copiedSimulation,
  copiedSpace,
  readViewState,
  viewStateProblems,
  withViewState,
  writeViewState,
} from './view-state';
// The limits a view state's filters share with guidance's.
export { MAX_FILTER_CONDITIONS, MAX_FILTER_TEXT } from './protocol';
// Package code (ADR 0054): the hooks' types, the checks of their answers, the hash and the approvals.
export * from './code';
// Simulations (M12, ADR 0085): what a component simulates, each tick checked, and a run's record.
export * from './simulation';
// Tours (ADR 0058), and the plain text with paragraphs and lists their captions hold.
export * from './tours';
export * from './versions';
export type { TextBlock } from './plain-text';
export { textBlocks } from './plain-text';
// Text emphasis (ADR 0082): the Markdown subset texts take, read into blocks and runs.
export * from './text/emphasis';
// Roboto's widths (ADR 0083), which faces are laid out in and the exports measure with.
export type { RobotoVariant } from './text/roboto';
export { ROBOTO_VARIANTS, robotoEms, robotoWidth, unmeasuredEms } from './text/roboto';
// Faces (ADR 0083): read, compiled, laid out and checked.
export * from './faces';
// Overlays, their legend, and levels of detail (ADR 0055).
export * from './overlays';
export * from './drawing';
export { MAX_OVERLAY_CASES, MAX_OVERLAY_STOPS } from './commands/overlays';
export {
  LEVEL_EXIT,
  LEVEL_PARTS,
  MAX_LEVELS,
  MAX_LEVEL_SCALE,
  expandedAt,
  levelAt,
  levelsKey,
  partsAt,
  sortedLevels,
} from './levels';
// External identifiers and destinations (M8, ADR 0056).
export {
  MAX_EXTERNAL_ID_LENGTH,
  MAX_SCHEMES,
  SCHEME_PATTERN,
  changedExternalIds,
  checkedExternalIds,
  duplicateExternalIdWarnings,
  elementsWithExternalId,
  externalIdQuery,
  isExternalId,
  isScheme,
  matchesExternalId,
  sameExternalIds,
} from './external-ids';
export type { DestinationKind, DestinationRead, FoundDestination } from './destinations';
export {
  MAX_DESTINATION_FOCUS,
  MAX_PROJECT_PATH_LENGTH,
  MAX_WEB_ADDRESS_LENGTH,
  destinationKind,
  destinationsOf,
  isDestination,
  projectPathProblem,
  readDestination,
  resolveProjectPath,
  webAddressHost,
  webAddressProblem,
} from './destinations';
export { destinationWarnings, projectDestinationPaths } from './destination-checks';
// Live values (ADR 0057, ADR 0063): what one is, its checks and limits, the program's store, the
// live protocol's messages for them, and how an attribute reads over them.
export * from './live';
// Time ranges (R43): a filter on a date, time or number attribute.
export type { RangeKind } from './time-range';
export {
  RANGE_KINDS,
  // Checked alike in view states and in guidance that filters (ADR 0057).
  checkTimeRange,
  periodMeetsRange,
  pointInRange,
  rangeKindOf,
  rangePointOf,
} from './time-range';
// Threads of comments kept in the project (ADR 0059).
export * from './comments';
// Free geometry: its outline, read once, and everything asked of it fitted to a shape (ADR 0066).
export * from './geometry';
