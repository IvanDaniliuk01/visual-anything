/** Imports (ADR-0042): the plan a reader makes, and the one batch command it becomes. */
export type {
  ImportMapping,
  ImportPlan,
  PlannedCommand,
  PlannedElement,
  PlannedKind,
  PlannedPosition,
  PlannedRelation,
  PlannedView,
} from './plan';
export { IMPORT_LIMITS, planProblems, planToCommand } from './plan';

// The Structurizr, LikeC4 and draw.io readers, and telling their files apart (W30).
export type { DiagramFormat } from './diagram-files';
export { diagramFormatOf, readDiagramFile } from './diagram-files';
export { MAX_FILLED_FILE, MAX_FILLED_LABEL, MAX_PLACEHOLDERS, readDrawio } from './drawio';
export { readLikeC4, readLikeC4Json } from './likec4';
export type { ImportRead, ReadOptions } from './reading';
export { MAX_IMPORTED_NAME, MAX_READ_CHARACTERS, MAX_UNMATCHED } from './reading';
export { readStructurizr, readStructurizrJson } from './structurizr';
export { XML_CAPS } from './xml';
