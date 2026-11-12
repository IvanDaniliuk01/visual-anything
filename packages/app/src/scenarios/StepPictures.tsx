/**
 * What a scenario's or a tour's step shows of its view's pictures, videos and link cards (ADR 0098,
 * stage 4), in the step's editor: a checkbox each, and beside each video whether it plays while the
 * step shows. What the step names that the view no longer holds is listed, and taken out on request;
 * any other change leaves it out too, since a changed list names only what the view holds.
 */
import {
  isVideoShape,
  linkHost,
  missingShown,
  showableOf,
  withoutMissingShown,
  type ShowableShape,
} from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import { useId } from 'react';
import { useT, type Translator } from '../i18n';
import './step-pictures.css';

/** A step's two lists. */
export interface PictureLists {
  shows?: Id[];
  playing?: Id[];
}

interface StepPicturesProps {
  /** The step's view: its scenario's, or its view state's. */
  view: ViewFile | undefined;
  lists: PictureLists;
  /** Whether a step of its scenario or tour lists any, so that what the others do not list hides. */
  chooses: boolean;
  owner: 'scenario' | 'tour';
  editable: boolean;
  onChange: (lists: PictureLists) => void;
}

export function StepPictures({
  view,
  lists,
  chooses,
  owner,
  editable,
  onChange,
}: StepPicturesProps) {
  const t = useT();
  const heading = useId();
  const showable = view ? showableOf(view) : [];
  const missing = missingShown(view, lists);
  if (showable.length === 0 && missing.length === 0) return null;
  const shows = lists.shows ?? [];
  const playing = lists.playing ?? [];
  // A changed list names only what the view holds.
  const kept = withoutMissingShown(view, lists);
  const toggled = (list: readonly Id[] | undefined, id: Id, on: boolean) =>
    on
      ? [...(list ?? []).filter((each) => each !== id), id]
      : (list ?? []).filter((each) => each !== id);
  const show = (id: Id, on: boolean) => {
    const nextShows = toggled(kept.shows, id, on);
    onChange({
      shows: nextShows,
      playing: (kept.playing ?? []).filter((each) => nextShows.includes(each)),
    });
  };
  const play = (id: Id, on: boolean) =>
    onChange({
      ...(kept.shows ? { shows: kept.shows } : {}),
      playing: toggled(kept.playing, id, on),
    });

  const hint = !chooses
    ? owner === 'scenario'
      ? t('No step chooses: the scenario shows every picture, video and link card of its view.')
      : t('No step chooses: the tour shows every picture, video and link card of its view.')
    : shows.length === 0
      ? t('This step shows none of the view’s pictures, videos and link cards.')
      : undefined;

  return (
    <fieldset className="step-pictures" aria-labelledby={heading}>
      <legend id={heading}>{t('Shows')}</legend>
      {hint && <p className="step-pictures-hint">{hint}</p>}
      <ul className="step-pictures-list">
        {showable.map((shape) => {
          const name = nameOf(t, shape);
          const shown = shows.includes(shape.id);
          return (
            <li key={shape.id}>
              <label>
                <input
                  type="checkbox"
                  checked={shown}
                  disabled={!editable}
                  onChange={(event) => show(shape.id, event.currentTarget.checked)}
                />
                <span>{name}</span>
              </label>
              {isVideoShape(shape) && (
                <label className="step-pictures-plays">
                  <input
                    type="checkbox"
                    checked={playing.includes(shape.id)}
                    disabled={!editable || !shown}
                    aria-label={t('Play “{name}” while the step shows', {
                      name: shape.kind === 'picture' ? (shape.name ?? t('Video')) : name,
                    })}
                    onChange={(event) => play(shape.id, event.currentTarget.checked)}
                  />
                  <span aria-hidden="true">{t('Plays')}</span>
                </label>
              )}
            </li>
          );
        })}
        {missing.map((id) => (
          <li key={id} className="step-pictures-missing">
            {t('No longer in the view ({id}).', { id })}
          </li>
        ))}
      </ul>
      {missing.length > 0 && (
        <button
          type="button"
          className={owner === 'scenario' ? 'scenario-button' : 'tour-button'}
          disabled={!editable}
          onClick={() => onChange(kept)}
        >
          {t('Take out what is gone')}
        </button>
      )}
    </fieldset>
  );
}

/** What a picture, a video or a link card is called in the list, with what it is. */
function nameOf(t: Translator, shape: ShowableShape): string {
  if (shape.kind === 'link')
    return t('Link card: {title}, {host}', { title: shape.title, host: linkHost(shape.url) });
  const name = shape.name ?? (isVideoShape(shape) ? t('Video') : t('Picture'));
  return isVideoShape(shape) ? t('Video: {name}', { name }) : t('Picture: {name}', { name });
}
