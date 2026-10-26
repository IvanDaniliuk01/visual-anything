/**
 * Full-screen playback of a tour (ADR 0058), over the canvas while the panels are hidden: the caption
 * card, the progress line, the controls, and the keys that move through the steps. It shows a step and
 * says what moves; where the canvas goes is its host's. The speaker notes show in a second window when
 * one is opened.
 *
 * It knows nothing of the live editor: it takes a project, a tour, a step and what to do on each
 * control, so that the read-only page (ADR 0041) can play tours with it too.
 */
import { tourStepProblems, type ProjectSnapshot } from '@visual-anything/core';
import type { TourFile } from '@visual-anything/schema';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import { DismissIcon, NextIcon, NotesIcon, PreviousIcon } from '../shell/icons';
import { tourKeyAction, type TourKeyAction } from './player';
import { openNotesWindow, type NotesWindow } from './notes-window';
import { TourNotesWindow } from './TourNotes';
import { TourText } from './TourText';
import './tours.css';

export interface TourStageProps {
  project: ProjectSnapshot;
  tour: TourFile;
  /** The index of the step shown. */
  step: number;
  /** Does what a control or a key asks. */
  onAction: (action: TourKeyAction) => void;
  /** Whether the speaker notes window is offered; it is by default. */
  notes?: boolean;
}

export function TourStage({ project, tour, step, onAction, notes = true }: TourStageProps) {
  const t = useT();
  const heading = useId();
  const stage = useRef<HTMLElement>(null);
  const [notesWindow, setNotesWindow] = useState<NotesWindow>();
  const toggleNotes = () => {
    if (notesWindow === undefined) setNotesWindow(openNotesWindow());
    else setNotesWindow(undefined);
  };
  const shown = tour.steps[step];
  const total = tour.steps.length;
  const problems = useMemo(() => (shown ? tourStepProblems(project, shown) : []), [project, shown]);
  const viewGone = problems.some(
    (each) => each.code === 'unknown-view' && each.subject === shown?.viewState.view,
  );

  // The keys move through the tour wherever the focus is in the tab, before the canvas takes them.
  const act = useRef(onAction);
  useEffect(() => {
    act.current = onAction;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A dialog that shows over the tour, such as a request to approve package code, takes its
      // own keys; only the shortcuts below are kept from the app.
      if (inDialog(event.target)) {
        if (event.ctrlKey || event.metaKey || event.altKey) event.stopPropagation();
        return;
      }
      // Playing changes nothing (ADR 0058): no key reaches the app's own shortcuts while the tour
      // plays, such as undo and redo, the stacking keys, deleting, copying and pasting. What the
      // browser does with a key, such as Ctrl+R or Ctrl+L, it still does: nothing prevents it.
      event.stopPropagation();
      // Space and Enter on a control of the stage press it, as on any button.
      if (pressesControl(event)) return;
      const action = tourKeyAction(event);
      if (action === undefined) return;
      event.preventDefault();
      act.current(action);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);

  // The stage takes the focus when it opens, so that a screen reader starts reading the tour there.
  useEffect(() => {
    stage.current?.focus({ preventScroll: true });
  }, []);

  if (!shown) return null;
  const position = t('Step {n} of {total}', { n: step + 1, total });
  return (
    <section
      ref={stage}
      className="tour-stage"
      aria-labelledby={heading}
      aria-roledescription={t('tour')}
      tabIndex={-1}
    >
      <h2 id={heading} className="visually-hidden">
        {t('Tour “{name}”', { name: tour.name })}
      </h2>
      <div
        className="tour-progress"
        role="progressbar"
        aria-label={t('Progress through the tour')}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step + 1}
        aria-valuetext={position}
      >
        <span
          className="tour-progress-done"
          style={{ transform: `scaleX(${(step + 1) / total})` }}
        />
      </div>
      <article className="tour-card" aria-live="polite">
        <h3 className="tour-card-title">{shown.caption.title}</h3>
        {shown.caption.text !== undefined && (
          <TourText className="tour-card-text" text={shown.caption.text} />
        )}
        {problems.length > 0 && (
          <p className="tour-card-flag">
            {viewGone
              ? t('This step’s view no longer exists, so the canvas stays where it is.')
              : t('This step names what the project no longer holds, and plays without it.')}
          </p>
        )}
      </article>
      <div className="tour-controls" role="toolbar" aria-label={t('Tour')}>
        <button
          type="button"
          onClick={() => onAction('previous')}
          disabled={step === 0}
          aria-label={t('Previous step')}
          title={t('Previous step')}
        >
          <PreviousIcon />
        </button>
        <span className="tour-position">{position}</span>
        <button
          type="button"
          onClick={() => onAction('next')}
          disabled={step === total - 1}
          aria-label={t('Next step')}
          title={t('Next step')}
        >
          <NextIcon />
        </button>
        {notes && (
          <button
            type="button"
            aria-pressed={notesWindow !== undefined && notesWindow !== 'blocked'}
            onClick={toggleNotes}
            title={t('Speaker notes in a second window')}
          >
            <NotesIcon />
            <span>{t('Speaker notes')}</span>
          </button>
        )}
        <button
          type="button"
          className="tour-end"
          onClick={() => onAction('end')}
          aria-label={t('End the tour')}
          title={t('End the tour (Escape)')}
        >
          <DismissIcon />
        </button>
      </div>
      {notesWindow !== undefined && (
        <TourNotesWindow
          notes={notesWindow}
          title={t('Speaker notes: {name}', { name: tour.name })}
          onClosed={() => setNotesWindow(undefined)}
          onKey={(action) => act.current(action)}
        >
          <div className="tour-notes">
            <p className="tour-notes-position">{position}</p>
            <h1 className="tour-notes-title">{shown.caption.title}</h1>
            {shown.notes !== undefined ? (
              <TourText className="tour-notes-text" text={shown.notes} />
            ) : (
              <p className="tour-notes-none">{t('This step has no speaker notes.')}</p>
            )}
            {tour.steps[step + 1] !== undefined && (
              <p className="tour-notes-next">
                {t('Next: {title}', { title: tour.steps[step + 1]?.caption.title ?? '' })}
              </p>
            )}
          </div>
        </TourNotesWindow>
      )}
    </section>
  );
}

/** Whether a key presses the control that has the focus: Space or Enter on a button. */
function pressesControl(event: KeyboardEvent): boolean {
  if (event.key !== ' ' && event.key !== 'Spacebar' && event.key !== 'Enter') return false;
  return (
    event.target instanceof Element && event.target.closest('button, [role="button"]') !== null
  );
}

/** Whether a key is pressed in a dialog. */
function inDialog(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('[role="dialog"], [role="alertdialog"], dialog') !== null
  );
}
