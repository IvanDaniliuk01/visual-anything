export type { ProjectSnapshot } from './snapshot';

export {
  BUILTIN_PACKAGES,
  DATA_MODELING,
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
  ResolvedAppearance,
  ResolvedComponent,
  ResolvedRelationAppearance,
  ResolvedRelationType,
} from './definitions';
export {
  appearanceOf,
  componentOrEssence,
  definitionsOf,
  relationTypeOrRelatesTo,
} from './definitions';

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

export type { Problem, ProblemCode } from './problems';

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
