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
export type { FileMergeOptions, ItemConflict, MergedFile, MergedItem, MergePolicy } from './merge';
export { mergeFile, mergeItem } from './merge';
export type { Proposal, ProposalChange, ProposalChanges, ProposeOutcome } from './proposals';
export {
  PROPOSAL_LIMIT,
  acceptProposal,
  acceptedLabel,
  changeKey,
  propose,
  proposalChanges,
  rebaseProposal,
} from './proposals';
export type {
  ListedVersion,
  ProposalAcceptMessage,
  ProposalClosedMessage,
  ProposalRefuseMessage,
  ProposalShownMessage,
  ShownProposalChange,
  VersionCompareMessage,
  VersionComparedMessage,
  VersionRef,
  VersionRefusedMessage,
  VersionsListMessage,
  VersionsListedMessage,
} from './messages';
export {
  MAX_ACCEPTED,
  MAX_CHANGE_KEY,
  MAX_SUBJECT,
  isCommitId,
  readListedVersions,
  readVersionRef,
} from './messages';
