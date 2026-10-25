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
export type { ImportInput, ImportReader, ReadOptions, ReadResult } from './reader';
export { FORBIDDEN_NAME, baseName, hasExtension, own, recordOf } from './reader';
export { IMPORT_READERS, readImport, readerFor } from './read';
export { MERMAID, readMermaid } from './mermaid';
export { MAX_ROWS, TABLE, parseDelimited, readTable } from './table';
export { JSON_READER, MAX_JSON_DEPTH, SIMPLE_FORM_SCHEMA, readJson } from './json';
export { checkAgainstSchema, type SchemaProblem } from './schema-check';
export type { MappingChoice, PreparedImport } from './mapping';
export { mappingChoices, normalizedMapping, prepareImport, suggestMapping } from './mapping';
export { MAX_UNMATCHED, PastLimits, PlanBuilder, type KindInfo } from './builder';
export { References, type MatchBy } from './references';
export {
  MAX_IMPORTED_DESCRIPTION,
  MAX_IMPORTED_NAME,
  MAX_IMPORT_TEXT,
  importedDescription,
  importedName,
  plainText,
  quote,
} from './text';
export { componentForWords, kindSuggester, relationTypeForWords } from './suggest';
