export type { ProjectSnapshot } from './snapshot';

export { BUILTIN_PACKAGES, ESSENCE, RELATES_TO, SYSTEMS, builtinPackage } from './builtin';

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
export { ID_PATTERN, freshId, isId, randomIds, slug } from './ids';

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
  ProjectChangedMessage,
  ProjectOpenedMessage,
  ProjectReloadedMessage,
  ServerMessage,
} from './protocol';
export {
  LIVE_PATH,
  PROTOCOL_VERSION,
  ProtocolError,
  TOKEN_PARAM,
  decodeAppMessage,
  decodeServerMessage,
  encodeMessage,
  encodeServerMessage,
} from './protocol';
