/**
 * Versions of a project (ADR 0070): the items a project is made of, comparing two versions by id,
 * one view of a comparison, following an action, and the operations between two versions.
 */
export type { ItemRef, ProjectItem } from './items';
export { ITEM_KINDS, fileItemKey, isOwnPackage, itemKey, projectItems, sameValue } from './items';
export type {
  Change,
  ChangeStatus,
  Comparison,
  Difference,
  ViewComparison,
  ViewItemState,
} from './compare';
export { compareProjects, compareView, differencesOf, recompare } from './compare';
export { operationsBetween } from './operations-between';
