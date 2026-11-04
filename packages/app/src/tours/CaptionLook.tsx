/**
 * The look of caption cards (ADR 0096), the tour's, which every step without one of its own takes,
 * or a step's own: a face's markup and style, each in a text area, with the problems the faces'
 * subset finds at their lines and a preview on a step's caption. Nothing is sent while typing: Apply
 * sends the look as one action, and Remove takes it away.
 */
import { compileCaptionFace, faceMessage } from '@visual-anything/core';
import type { CaptionFace, TourFile } from '@visual-anything/schema';
import { useId, useMemo, useState } from 'react';
import { useT } from '../i18n';
import { CaptionFaceDrawing } from './CaptionFace';

/** How wide the preview lays the face out, in pixels: about a card at a side of the screen. */
const PREVIEW_WIDTH = 280;

export interface CaptionLookProps {
  tour: TourFile;
  /** The look this level keeps; none while it keeps none. */
  stored: CaptionFace | undefined;
  /** What a new look starts from: the tour's for a step, else the starting look. */
  start: CaptionFace;
  /** The step whose caption the preview shows. */
  step: number;
  /** The heading of its section. */
  label: string;
  /** What the section says while this level keeps no look. */
  hint: string;
  editable: boolean;
  /** Keeps a look, or takes it away with `null`. */
  onApply: (face: CaptionFace | null) => void;
}

export function CaptionLook(props: CaptionLookProps) {
  // A new draft for each look stored, so that an Apply, an undo or Claude's change starts it again.
  return <CaptionLookDraft key={JSON.stringify(props.stored ?? null)} {...props} />;
}

function CaptionLookDraft({
  tour,
  stored,
  start,
  step,
  label,
  hint,
  editable,
  onApply,
}: CaptionLookProps) {
  const t = useT();
  const ids = { markup: useId(), style: useId() };
  const [markup, setMarkup] = useState((stored?.markup ?? []).join('\n'));
  const [style, setStyle] = useState((stored?.style ?? []).join('\n'));
  const draft = useMemo((): CaptionFace => {
    const lines = (text: string) => (text === '' ? [] : text.split(/\r?\n/));
    const styled = lines(style);
    return styled.length === 0
      ? { markup: lines(markup) }
      : { markup: lines(markup), style: styled };
  }, [markup, style]);
  const problems = useMemo(() => compileCaptionFace(draft, false).problems, [draft]);
  const errors = problems.filter((each) => each.severity === 'error');
  const changed = JSON.stringify(draft) !== JSON.stringify(stored ?? null);

  return (
    <details className="tour-caption-look">
      <summary>{label}</summary>
      {stored === undefined && markup === '' ? (
        <div className="tour-field">
          <p className="tour-field-hint">{hint}</p>
          <p className="tour-field-hint">
            {t(
              'Write it in the HTML and CSS of faces: {title} is the title, {text} the text, {step} and {steps} where the step is.',
              { title: '{{name}}', text: '{{text}}', step: '{{step}}', steps: '{{steps}}' },
            )}
          </p>
          <button
            type="button"
            className="tour-button"
            disabled={!editable}
            onClick={() => {
              setMarkup(start.markup.join('\n'));
              setStyle((start.style ?? []).join('\n'));
            }}
          >
            {t('Start a look')}
          </button>
        </div>
      ) : (
        <>
          <div className="tour-field">
            <label htmlFor={ids.markup}>{t('Markup')}</label>
            <textarea
              id={ids.markup}
              className="tour-code"
              rows={6}
              spellCheck={false}
              value={markup}
              disabled={!editable}
              onChange={(event) => setMarkup(event.target.value)}
            />
          </div>
          <div className="tour-field">
            <label htmlFor={ids.style}>{t('Style')}</label>
            <textarea
              id={ids.style}
              className="tour-code"
              rows={4}
              spellCheck={false}
              value={style}
              disabled={!editable}
              onChange={(event) => setStyle(event.target.value)}
            />
          </div>
          {problems.length > 0 && (
            <ul className="tour-look-problems" aria-label={t('What the look’s HTML and CSS say')}>
              {problems.map((problem, at) => (
                <li key={at} data-severity={problem.severity}>
                  {t.message(faceMessage(problem))}
                </li>
              ))}
            </ul>
          )}
          {errors.length === 0 && draft.markup.length > 0 && tour.steps[step] !== undefined && (
            <div className="tour-look-preview" aria-label={t('Preview')}>
              <CaptionFaceDrawing face={draft} tour={tour} step={step} width={PREVIEW_WIDTH} />
            </div>
          )}
          <div className="tour-actions">
            <button
              type="button"
              className="tour-button"
              disabled={!editable || !changed || errors.length > 0 || draft.markup.length === 0}
              onClick={() => onApply(draft)}
            >
              {t('Apply')}
            </button>
            {stored !== undefined && (
              <button
                type="button"
                className="tour-button"
                disabled={!editable}
                onClick={() => onApply(null)}
              >
                {t('Remove the look')}
              </button>
            )}
          </div>
        </>
      )}
    </details>
  );
}
