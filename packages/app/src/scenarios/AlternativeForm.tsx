/**
 * Add an alternative here (ADR 0078): the words of the alternative recording adds after a step. For a
 * decision that starts right after the step, only the new alternative's label; otherwise a new
 * decision's question, the label of its first alternative, which keeps the steps that follow, and the
 * label of the second, where recording goes on. Nothing changes until the next click on a relation,
 * which records the alternative's first step and the alternative with it, as one action.
 */
import { DECISION_CAPS } from '@visual-anything/core';
import type { ScenarioFile } from '@visual-anything/schema';
import { useId, useState, type FormEvent } from 'react';
import { useT } from '../i18n';
import { decisionRightAfter, type AlternativeWords } from './record-decisions';

/** The longest question or label a decision holds. */
const LONGEST = 200;

export function AlternativeForm({
  scenario,
  after,
  onAdd,
  onCancel,
}: {
  scenario: ScenarioFile;
  /** The index of the step the alternative comes after. */
  after: number;
  onAdd: (words: AlternativeWords) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const ids = { question: useId(), kept: useId(), label: useId() };
  const joins = decisionRightAfter(scenario, after);
  const decision =
    joins === undefined ? undefined : scenario.blocks?.find((each) => each.id === joins);
  const full = decision !== undefined && decision.alternatives.length >= DECISION_CAPS.alternatives;
  const [question, setQuestion] = useState('');
  const [kept, setKept] = useState(() => t('Yes'));
  const [label, setLabel] = useState(() =>
    decision ? t('Alternative {n}', { n: decision.alternatives.length + 1 }) : t('No'),
  );
  const ready =
    !full &&
    label.trim() !== '' &&
    (decision !== undefined || (question.trim() !== '' && kept.trim() !== ''));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    onAdd({ label: label.trim(), question: question.trim(), kept: kept.trim() });
  };

  return (
    <form
      className="scenario-form scenario-alternative-form"
      aria-label={t('Add an alternative here')}
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
    >
      <p className="scenario-hint">
        {decision
          ? t('One more alternative for “{question}”, after step {n}.', {
              question: decision.question,
              n: after + 1,
            })
          : t(
              'A new decision after step {n}: its first alternative keeps the steps that follow, and recording goes on in the second.',
              { n: after + 1 },
            )}
      </p>
      {full && (
        <p className="scenario-hint">
          {t('“{question}” has 8 alternatives already, as many as a decision holds.', {
            question: decision?.question ?? '',
          })}
        </p>
      )}
      {!decision && (
        <>
          <label htmlFor={ids.question}>{t('Question')}</label>
          <input
            id={ids.question}
            value={question}
            maxLength={LONGEST}
            placeholder={t('Is every item in stock?')}
            // The form opens for typing the question.
            autoFocus
            onChange={(event) => setQuestion(event.target.value)}
          />
          <label htmlFor={ids.kept}>{t('Label of the steps that follow')}</label>
          <input
            id={ids.kept}
            value={kept}
            maxLength={LONGEST}
            onChange={(event) => setKept(event.target.value)}
          />
        </>
      )}
      <label htmlFor={ids.label}>{t('Label of the new alternative')}</label>
      <input
        id={ids.label}
        value={label}
        maxLength={LONGEST}
        // The form opens for typing the label when it asks for nothing else.
        autoFocus={decision !== undefined}
        onChange={(event) => setLabel(event.target.value)}
      />
      <div className="scenario-actions">
        <button type="submit" className="scenario-button" disabled={!ready}>
          {t('Record the alternative')}
        </button>
        <button type="button" className="scenario-button" onClick={onCancel}>
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
}
