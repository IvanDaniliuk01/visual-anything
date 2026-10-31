/**
 * Deciding about Claude's proposal (ADR 0073), above its changes in the Changes tab: what Claude did,
 * then Accept, Accept the ticked changes and Refuse. Every acceptance names the revision the review
 * draws; one the program refuses as no longer shown is said, and the review shows the proposal as the
 * program shows it again. Below a change chosen in the list: what it needs, what needs it, and whether
 * the person changed it too.
 */
import { useContext, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import type { RequestProblem } from '../live/connection';
import { LiveContext } from '../live/context';
import { SparklesIcon } from '../shell/icons';
import { useReview } from './review';
import { changeName, namesOf } from './text';
import { neededBy } from './ticks';
import './proposals.css';

export function ProposalDecision() {
  const t = useT();
  const live = useContext(LiveContext);
  const review = useReview();
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<readonly RequestProblem[]>([]);
  const waiting = useRef(false);
  const proposal = review?.snapshot.proposal;
  if (!review || !proposal) return null;
  const { shown } = proposal;
  const total = shown.changes.length;
  const ticked = shown.changes.filter((each) => review.snapshot.ticked.has(each.key)).length;
  const connected = live?.status === 'open';
  const accept = connected ? live.acceptProposal : undefined;
  const refuse = connected ? live.refuseProposal : undefined;

  const decide = async (asked: () => Promise<{ ok: boolean; problems?: RequestProblem[] }>) => {
    if (waiting.current) return;
    waiting.current = true;
    setBusy(true);
    setProblems([]);
    try {
      const answer = await asked();
      if (!answer.ok) setProblems(answer.problems ?? []);
    } finally {
      waiting.current = false;
      setBusy(false);
    }
  };

  const usable = !busy && accept !== undefined && refuse !== undefined;
  const acceptAll = () => {
    if (accept) void decide(() => accept(shown.id, shown.revision, 'all'));
  };
  const acceptTicked = () => {
    if (!accept) return;
    const keys = shown.changes
      .filter((each) => review.snapshot.ticked.has(each.key))
      .map((each) => each.key);
    void decide(() => accept(shown.id, shown.revision, keys));
  };
  const refuseAll = () => {
    if (refuse) void decide(() => refuse(shown.id));
  };

  return (
    <div
      className="proposal-decision"
      role="group"
      aria-label={t('Decide about Claude’s proposal')}
    >
      <p className="proposal-labels">
        <SparklesIcon size={12} />
        <span>
          {t('What Claude did: {labels}', {
            labels: shown.labels.map((label) => t.message(label)).join('; '),
          })}
        </span>
      </p>
      <div className="proposal-buttons">
        <button
          type="button"
          className="proposal-accept"
          aria-disabled={usable ? undefined : true}
          onClick={usable ? acceptAll : undefined}
        >
          {t('Accept')}
        </button>
        <button
          type="button"
          aria-disabled={usable && ticked > 0 ? undefined : true}
          onClick={usable && ticked > 0 ? acceptTicked : undefined}
        >
          {t('Accept the ticked changes ({ticked} of {total})', { ticked, total })}
        </button>
        <button
          type="button"
          aria-disabled={usable ? undefined : true}
          onClick={usable ? refuseAll : undefined}
        >
          {t('Refuse')}
        </button>
      </div>
      {!connected && <p className="proposal-note">{t('Visual Anything is not connected')}</p>}
      {problems.length > 0 && (
        <p className="proposal-problems" role="alert">
          {problems.map((each) => t.message(each.message)).join(' ')}
        </p>
      )}
    </div>
  );
}

/** Below a change of the proposal chosen in the list: what it needs, what needs it, and whose too. */
export function ProposalChangeDetails({ changeKey }: { changeKey: string }) {
  const t = useT();
  const proposal = useReview()?.snapshot.proposal;
  const shown = proposal?.shown;
  const names = useMemo(() => (proposal ? namesOf(proposal) : undefined), [proposal]);
  const byKey = useMemo(
    () => new Map((shown?.changes ?? []).map((each) => [each.key, each])),
    [shown],
  );
  const change = byKey.get(changeKey);
  if (!proposal || !shown || !names || !change) return null;
  const named = (keys: readonly string[]) =>
    keys.map((key) => changeName(t, byKey.get(key), key, names)).join(', ');
  const needing = neededBy(shown.changes, changeKey);
  return (
    <div className="proposal-details">
      {change.changedByYou && (
        <p>
          {t(
            'You changed this too: it starts unticked, so that your edit stays unless you take Claude’s.',
          )}
        </p>
      )}
      {change.needs.length > 0 && (
        <p>{t('It needs: {changes}.', { changes: named(change.needs) })}</p>
      )}
      {needing.length > 0 && <p>{t('Needed by: {changes}.', { changes: named(needing) })}</p>}
    </div>
  );
}
