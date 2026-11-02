/**
 * Package code (ADR 0054): the hooks' types, what they are given, the checks of what they answer,
 * the hash the person approves code by, and the approvals kept in the person's preferences. The core
 * never runs code: the app's worker and Claude's tools do, in QuickJS inside WebAssembly.
 */
export type { CheckedAnswer, CodeProblem, ComputedAttribute } from './answers';
export {
  checkAttributesAnswer,
  checkDrawAnswer,
  checkProblemsAnswer,
  plainSizeOf,
} from './answers';
export type { CodeApproval, CodeStatus } from './approvals';
export {
  MAX_CODE_APPROVALS,
  checkCodeApprovals,
  codeStatusOf,
  readCodeApprovals,
  withApproval,
  withoutApproval,
} from './approvals';
export type { ReadCapability } from './capabilities';
export {
  capabilityProblem,
  isCapability,
  readCapability,
  sortedCapabilities,
} from './capabilities';
export { codeWarnings } from './check';
export type {
  Drawing,
  DrawingItem,
  DrawnArc,
  DrawnImage,
  DrawnLine,
  DrawnShape,
  DrawnText,
} from './drawing';
export { codeHash, sha256, utf8 } from './hash';
export type {
  CodeElement,
  CodeEnd,
  CodeNeighbor,
  CodeRelation,
  HookContext,
  HookInput,
  ModelReader,
} from './input';
export { hookInputOf, modelReaderOf } from './input';
export { CODE_LIMITS } from './limits';
export type { CodeFailure, ExtensionHookName, HookName, Named } from './messages';
export {
  HOOK_NAMES,
  callMsOf,
  callProblem,
  checkedProblem,
  extensionProblem,
  fileTooLongProblem,
  undeclaredProblem,
  loadProblem,
  notApprovedProblem,
  offProblem,
  stalledProblem,
  tooLargeProblem,
} from './messages';
export type { PackageCode } from './packages';
export { codePackagesOn, packageCodeOf, packagesWithCode } from './packages';
export type {
  ActionInput,
  ChangesPreview,
  ExportFileInput,
  ImportFileInput,
  PackageChanges,
  PanelBlock,
  PanelInput,
  PanelSeries,
} from './extensions';
export {
  checkChangesAnswer,
  checkExportAnswer,
  checkPanelAnswer,
  checkedExtensions,
  previewPackageChanges,
} from './extensions';
