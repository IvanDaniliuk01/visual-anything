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

export type { Problem, ProblemCode } from './problems';

export type { IdGenerator } from './ids';
export { ID_PATTERN, definitionIdFor, freshId, isId, randomIds, slug } from './ids';

export type {
  Collection,
  CollectionItems,
  Item,
  Operation,
  PackageProperties,
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

export type { DeletePreview, DeleteTargets, RemovedPosition } from './rules';
export { containmentCycles, limitWarnings, previewDelete, wouldFormCycle } from './rules';

export type * from './commands/types';
export type { CommandContext, CommandOutcome, ContainerChangePreview } from './commands';
export { executeCommand, previewChangeContainer } from './commands';

export type { Author, History, HistoryEntry, HistorySummary, Step as HistoryStep } from './history';
export { EMPTY_HISTORY, HISTORY_LIMIT, record, redo, summarize, undo } from './history';

export type { ProjectCheck } from './check';
export { checkProject } from './check';

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
