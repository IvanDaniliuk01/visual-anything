/**
 * The header's sign that Claude proposes changes (ADR 0073): while a proposal waits, a button that
 * says how many changes it holds and opens the review, and says so to screen readers when one opens.
 * Nothing shows while none waits.
 */
import { useContext } from 'react';
import { useT } from '../i18n';
import { LiveContext } from '../live/context';
import { SparklesIcon } from '../shell/icons';
import { useReview } from './review';
import { proposesText } from './text';
import './proposals.css';

export function ProposalButton() {
  const t = useT();
  const live = useContext(LiveContext);
  const review = useReview();
  const proposal = live?.proposal;
  if (!proposal || !review) return null;
  const count = proposal.shown.changes.length;
  const reviewing = review.snapshot.reviewing;
  const said = proposesText(t, count);
  return (
    <>
      <button
        type="button"
        className="proposal-button"
        aria-pressed={reviewing}
        title={reviewing ? t('Reviewing Claude’s proposal') : t('Review Claude’s proposal')}
        onClick={() => {
          if (reviewing) review.review.close();
          else review.review.open();
        }}
      >
        <SparklesIcon size={14} />
        <span>{said}</span>
      </button>
      {/* Only while a proposal waits unreviewed, so that the header holds no live region of its own. */}
      {!reviewing && (
        <span className="visually-hidden" role="status">
          {t('{proposes}: review them before they apply.', { proposes: said })}
        </span>
      )}
    </>
  );
}
