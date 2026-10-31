/**
 * The history panel's part of Claude's proposals (ADR 0073): the toggle of Review Claude's changes,
 * the person's preference `reviewClaude`, off unless they turn it on; and, while a proposal waits,
 * how many changes it holds, with Review.
 */
import { useContext, useId } from 'react';
import { useT } from '../i18n';
import { LiveContext } from '../live/context';
import { usePreferences } from '../theme/usePreferences';
import { useReview } from './review';
import { proposesText } from './text';
import './proposals.css';

export function ReviewSetting() {
  const t = useT();
  const hint = useId();
  const live = useContext(LiveContext);
  const { preferences, change } = usePreferences();
  const review = useReview();
  const proposal = live?.proposal;
  return (
    <div className="review-setting">
      <label className="review-toggle">
        <input
          type="checkbox"
          checked={preferences.reviewClaude}
          aria-describedby={hint}
          onChange={(event) => change({ reviewClaude: event.currentTarget.checked })}
        />
        {t('Review Claude’s changes')}
      </label>
      <p id={hint} className="review-hint">
        {preferences.reviewClaude
          ? t('Claude’s changes wait for you to accept them, change by change.')
          : t('Claude’s changes apply at once, and you can undo them.')}
      </p>
      {proposal && (
        <p className="review-waiting">
          <span>{proposesText(t, proposal.shown.changes.length)}</span>
          {review && !review.snapshot.reviewing && (
            <button type="button" onClick={() => review.review.open()}>
              {t('Review')}
            </button>
          )}
        </p>
      )}
    </div>
  );
}
