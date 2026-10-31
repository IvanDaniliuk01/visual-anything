/** What the review of Claude's proposal says (ADR 0073), in the language the app reads in. */
import type { ShownProposalChange } from '@visual-anything/core';
import type { Translator } from '../i18n';
import type { WaitingProposal } from '../live/connection';
import { ChangeNames, changeTitle, statusName } from '../versions/changes/describe';
import { comparisonOf } from './review';

/** How many changes Claude proposes, as the header and the history panel say it. */
export function proposesText(t: Translator, count: number): string {
  return t(
    { one: 'Claude proposes {count} change', other: 'Claude proposes {count} changes' },
    { count },
  );
}

/** The names of what a proposal's changes mention, in the project now or the proposed one. */
export function namesOf(proposal: WaitingProposal): ChangeNames {
  return new ChangeNames(
    proposal.base,
    proposal.proposed,
    comparisonOf(proposal.shown.changes, proposal.shown.names),
  );
}

/** A change of the proposal named in a few words, with what happens to it: “SMS (added)”. */
export function changeName(
  t: Translator,
  change: ShownProposalChange | undefined,
  key: string,
  names: ChangeNames,
): string {
  if (change === undefined) return key;
  return t('{what} ({status})', {
    what: changeTitle(t, change.change, names),
    status: statusName(t, change.change.status).toLowerCase(),
  });
}

/**
 * What ticking or unticking a change turned besides, as the list says it each time: “Also ticked,
 * since it needs them: SMS (added).”; nothing when it turned nothing else.
 */
export function alsoTickedText(
  t: Translator,
  also: readonly string[],
  on: boolean,
  byKey: ReadonlyMap<string, ShownProposalChange>,
  proposal: WaitingProposal,
): string {
  if (also.length === 0) return '';
  const names = namesOf(proposal);
  const list = also.map((key) => changeName(t, byKey.get(key), key, names)).join(', ');
  return on
    ? t('Also ticked, since it needs them: {changes}.', { changes: list })
    : t('Also unticked, since they need it: {changes}.', { changes: list });
}
