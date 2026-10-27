/**
 * The decision card (ADR 0078): while playback meets a decision, beside the steps, its question and
 * its alternatives as numbered buttons, the one playing pressed. Pressing one chooses it; while the
 * card has focus, the digits choose and the arrow keys go from one alternative to the next. Pointing
 * at an alternative, or focusing it, previews its relations on the canvas. What is chosen is said.
 */
import type { DecisionAt } from '@visual-anything/core';
import { useId, useRef, type KeyboardEvent } from 'react';
import { useT } from '../i18n';
import type { Chosen } from './choosing';
import './decisions.css';

interface DecisionCardProps {
  /** The decisions playback meets now, as the core's `decisionsAt` gives them. */
  decisions: readonly DecisionAt[];
  onChoose: (chosen: Chosen) => void;
  /** Points at an alternative for its preview; undefined stops. */
  onPreview: (chosen: Chosen | undefined) => void;
  /** The read-only page's style instead of the app's. */
  className?: string;
}

export function DecisionCard({ decisions, onChoose, onPreview, className }: DecisionCardProps) {
  const t = useT();
  if (decisions.length === 0) return null;
  return (
    <section className={className ?? 'decision-card'} aria-label={t('Decisions here')}>
      {decisions.map((met) => (
        <DecisionChoice key={met.decision.id} met={met} onChoose={onChoose} onPreview={onPreview} />
      ))}
    </section>
  );
}

function DecisionChoice({
  met,
  onChoose,
  onPreview,
}: {
  met: DecisionAt;
  onChoose: (chosen: Chosen) => void;
  onPreview: (chosen: Chosen | undefined) => void;
}) {
  const t = useT();
  const question = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const { decision, alternative: playing, place } = met;
  const { alternatives } = decision;
  const choose = (at: number) => {
    const alternative = alternatives[at];
    if (alternative) onChoose({ decision: decision.id, alternative: alternative.id });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const digit = /^[1-9]$/.test(event.key) ? Number(event.key) - 1 : undefined;
    if (digit !== undefined) {
      if (digit >= alternatives.length) return;
      event.preventDefault();
      choose(digit);
      buttons.current[digit]?.focus();
      return;
    }
    const focused = buttons.current.findIndex((button) => button === document.activeElement);
    if (focused < 0) return;
    const last = alternatives.length - 1;
    const to =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? Math.min(focused + 1, last)
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? Math.max(focused - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : undefined;
    if (to === undefined) return;
    event.preventDefault();
    buttons.current[to]?.focus();
  };
  return (
    <div className="decision-choice" role="group" aria-labelledby={question} onKeyDown={onKeyDown}>
      <p className="decision-place">
        {place === 'holding' ? t('Decision') : t('Next, a decision')}
      </p>
      <h4 id={question} className="decision-question">
        {decision.question}
      </h4>
      <div className="decision-alternatives">
        {alternatives.map((each, at) => {
          const pressed = each.id === playing.id;
          const chosen = { decision: decision.id, alternative: each.id };
          return (
            <button
              key={each.id}
              ref={(button) => {
                buttons.current[at] = button;
              }}
              type="button"
              className="decision-alternative"
              aria-pressed={pressed}
              aria-keyshortcuts={at < 9 ? String(at + 1) : undefined}
              // One stop in the tab order: the arrows go from one to the next.
              tabIndex={pressed ? 0 : -1}
              onClick={() => onChoose(chosen)}
              onFocus={() => onPreview(pressed ? undefined : chosen)}
              onBlur={() => onPreview(undefined)}
              onMouseEnter={() => onPreview(pressed ? undefined : chosen)}
              onMouseLeave={() => onPreview(undefined)}
            >
              <span className="decision-key" aria-hidden="true">
                {at + 1}
              </span>
              <span className="decision-label">{each.label}</span>
              {each.steps.length === 0 && (
                <span className="decision-note">{t('Nothing happens')}</span>
              )}
              {each.ends && <span className="decision-note">{t('Ends the scenario')}</span>}
            </button>
          );
        })}
      </div>
      <p className="decision-hint">
        {t('Press 1 to {count} to choose; the arrow keys go from one to the next.', {
          count: Math.min(alternatives.length, 9),
        })}
      </p>
    </div>
  );
}
