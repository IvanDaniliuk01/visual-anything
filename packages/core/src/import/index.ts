/**
 * Imports (ADR-0042): the plan a reader makes, the one batch command it becomes, the readers, the
 * built-in mappings, and the prepared import that the dialog, the command line and Claude send.
 */
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

// The readers' list, and what every reader shares.
export type { ImportInput, ImportReader, ReadOptions, ReadResult } from './reader';
export { FORBIDDEN_NAME, baseName, hasExtension, own, recordOf } from './reader';
export { IMPORT_READERS, readImport, readerFor } from './read';

// The Mermaid, spreadsheet and JSON readers (W29).
export { MERMAID, readMermaid } from './mermaid';
export { MAX_ROWS, TABLE, parseDelimited, readTable } from './table';
export { JSON_READER, MAX_JSON_DEPTH, SIMPLE_FORM_SCHEMA, readJson } from './json';
export { checkAgainstSchema, type SchemaProblem } from './schema-check';
export type { MappingChoice, PreparedImport } from './mapping';
export { mappingChoices, normalizedMapping, prepareImport, suggestMapping } from './mapping';
export { PastLimits, PlanBuilder, type KindInfo } from './builder';
export { References, type MatchBy } from './references';
export {
  MAX_IMPORTED_DESCRIPTION,
  MAX_IMPORT_TEXT,
  importedDescription,
  importedName,
  labelText,
  quote,
} from './text';
export { componentForWords, kindSuggester, relationTypeForWords } from './suggest';

// The Structurizr, LikeC4 and draw.io readers, and telling their files apart (W30).
export type { DiagramFormat } from './diagram-files';
export { diagramFormatOf, readDiagramFile } from './diagram-files';
export { MAX_FILLED_FILE, MAX_FILLED_LABEL, MAX_PLACEHOLDERS, readDrawio } from './drawio';
export { readLikeC4, readLikeC4Json } from './likec4';
export type { ImportRead } from './reading';
export { MAX_IMPORTED_NAME, MAX_READ_CHARACTERS, MAX_UNMATCHED } from './reading';
export { readStructurizr, readStructurizrJson } from './structurizr';
export { XML_CAPS } from './xml';
// Crosswalks, and matching by external identifier (ADR 0056).
export type { CrosswalkTable } from './crosswalks';
export { completedIds, crosswalksOf, matchByExternalIds } from './crosswalks';
// HTML imported as a drawing, which the local program makes (ADR 0068).
export type { DrawingImport, DrawingTarget, PreparedDrawing } from './drawing';
export {
  DRAWING_COMPONENT,
  DRAWING_EXTENSIONS,
  DRAWING_LIMITS,
  drawingBaseName,
  drawingLabel,
  drawingShapeSize,
  isDrawingFile,
  prepareDrawingImport,
} from './drawing';
export type { DrawingMadeMessage, DrawingMakeMessage } from './drawing-messages';
export { MAX_DRAWING_NAME, MAX_DRAWING_REPORT } from './drawing-messages';
