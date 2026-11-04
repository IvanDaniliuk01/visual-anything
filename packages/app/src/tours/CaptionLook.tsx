/**
 * The look of an open tour's caption cards (ADR 0096): a face's markup and style, each in a text
 * area, with the problems the faces' subset finds at their lines and a preview on the first step's
 * caption. Nothing is sent while typing: Apply sends the look as one `update-tour`, and Remove takes
 * it away, back to the plain card.
 */
import {
  STARTING_CAPTION_FACE,
  compileCaptionFace,
  faceMessage,
  type Command,
} from '@visual-anything/core';
import type { CaptionFace, TourFile } from '@visual-anything/schema';
import { useId, useMemo, useState } from 'react';
import { useT } from '../i18n';
import { CaptionFaceDrawing } from './CaptionFace';

/** How wide the preview lays the face out, in pixels: about a card at a side of the screen. */
const PREVIEW_WIDTH = 280;

export function CaptionLook({
  tour,
  editable,
  send,
}: {
  tour: TourFile;
  editable: boolean;
  send: (command: Command, done: string) => void;
}) {
  // A new draft for each look stored, so that an Apply, an undo or Claude's change starts it again.
  return (
    <CaptionLookDraft
      key={JSON.stringify(tour.captionFace ?? null)}
      tour={tour}
      editable={editable}
      send={send}
    />
  );
}

function CaptionLookDraft({
  tour,
  editable,
  send,
}: {
  tour: TourFile;
  editable: boolean;
  send: (command: Command, done: string) => void;
}) {
  const t = useT();
  const ids = { markup: useId(), style: useId() };
  const stored = tour.captionFace;
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
  const apply = (captionFace: CaptionFace | null, done: string) =>
    send({ type: 'update-tour', id: tour.id, changes: { captionFace } }, done);

  return (
    <details className="tour-caption-look">
      <summary>{t('Caption look')}</summary>
      {stored === undefined && markup === '' ? (
        <div className="tour-field">
          <p className="tour-field-hint">
            {t(
              'The captions show their title and text. Give them a look of your own, in the HTML and CSS of faces: {title} is the title, {text} the text, {step} and {steps} where the step is.',
              { title: '{{name}}', text: '{{text}}', step: '{{step}}', steps: '{{steps}}' },
            )}
          </p>
          <button
            type="button"
            className="tour-button"
            disabled={!editable}
            onClick={() => {
              setMarkup(STARTING_CAPTION_FACE.markup.join('\n'));
              setStyle((STARTING_CAPTION_FACE.style ?? []).join('\n'));
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
          {errors.length === 0 && draft.markup.length > 0 && tour.steps.length > 0 && (
            <div className="tour-look-preview" aria-label={t('Preview on the first step')}>
              <CaptionFaceDrawing face={draft} tour={tour} step={0} width={PREVIEW_WIDTH} />
            </div>
          )}
          <div className="tour-actions">
            <button
              type="button"
              className="tour-button"
              disabled={!editable || !changed || errors.length > 0 || draft.markup.length === 0}
              onClick={() =>
                apply(draft, t('The captions of “{name}” take this look.', { name: tour.name }))
              }
            >
              {t('Apply')}
            </button>
            {stored !== undefined && (
              <button
                type="button"
                className="tour-button"
                disabled={!editable}
                onClick={() =>
                  apply(
                    null,
                    t('The captions of “{name}” show their title and text again.', {
                      name: tour.name,
                    }),
                  )
                }
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
