/**
 * The tours panel (ADR 0058): the project's tours, created, renamed, deleted and played full screen
 * from here; and the open tour's steps, each a view state with its caption, marks and speaker notes.
 * Add step takes the canvas as it is now; captions and marks are edited in place; steps are moved,
 * duplicated and deleted, each one action. A step that names what the project no longer holds is
 * kept and flagged, and plays without it.
 */
import {
  MAX_CAPTION_TEXT,
  MAX_CAPTION_TITLE,
  MAX_SPEAKER_NOTES,
  MAX_TOUR_MARKS,
  MAX_TOUR_NAME,
  isBrokenTourStep,
  modelIndexOf,
  savedViewStateOf,
  tourStepProblems,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, TourFile, TourStep } from '@visual-anything/schema';
import { useCallback, useId, useState, type ReactNode } from 'react';
import { useEditor } from '../editor/EditorContext';
import { useT, type Translator } from '../i18n';
import { PlayIcon } from '../shell/icons';
import {
  addStep,
  changeStep,
  createTourCommand,
  deleteStep,
  deleteTourCommand,
  duplicateStep,
  moveStep,
  newTourName,
  renameTourCommand,
  stepOf,
} from './commands';
import { useToursHost } from './context';
import './tours.css';

const NOT_CONNECTED = 'Visual Anything is not connected, so nothing was changed.';

export function ToursPanel({ active }: { active: boolean }) {
  const t = useT();
  const editor = useEditor();
  const { project } = editor;
  const [openId, setOpenId] = useState<Id>();
  const [said, setSaid] = useState({ text: '', count: 0 });
  const announce = useCallback(
    (text: string) => setSaid((last) => ({ text, count: last.count + 1 })),
    [],
  );
  const send = useCallback(
    async (command: Command, done?: string): Promise<Id | undefined | false> => {
      if (!editor.send) {
        announce(t(NOT_CONNECTED));
        return false;
      }
      const result = await editor.send(command);
      if (!result.ok) return false;
      if (done !== undefined) announce(done);
      return result.created?.[0];
    },
    [editor, announce, t],
  );
  // A tour deleted while open, here or elsewhere, leaves the list showing.
  const tour = project.tours.find((each) => each.id === openId);

  return (
    <div className="tours-panel" hidden={!active}>
      {tour ? (
        <OpenTour tour={tour} send={send} onClose={() => setOpenId(undefined)} />
      ) : (
        <TourList send={send} onOpen={setOpenId} />
      )}
      <div aria-live="polite" className="visually-hidden">
        {said.text}
        {said.count % 2 === 1 ? ' ' : ''}
      </div>
    </div>
  );
}

type Send = (command: Command, done?: string) => Promise<Id | undefined | false>;

/** The project's tours, to open or play one, and a way to start one from the canvas. */
function TourList({ send, onOpen }: { send: Send; onOpen: (id: Id) => void }) {
  const t = useT();
  const { project, viewId } = useEditor();
  const host = useToursHost();
  const editable = useEditor().send !== undefined;
  const view = project.views.find((each) => each.id === viewId);

  const create = async () => {
    const current = host?.current();
    const name = newTourName(project.tours);
    const first = current && view ? stepOf(current, view.name) : undefined;
    const id = await send(createTourCommand(name, first), t('Created “{name}”.', { name }));
    if (typeof id === 'string') onOpen(id);
  };

  return (
    <>
      {project.tours.length > 0 ? (
        <ul className="tour-list" aria-label={t('Tours of the project')}>
          {project.tours.map((tour) => {
            const broken = tour.steps.filter((step) => isBrokenTourStep(project, step)).length;
            return (
              <li key={tour.id} className="tour-list-item">
                <button type="button" className="tour-open" onClick={() => onOpen(tour.id)}>
                  <span className="tour-open-name">{tour.name}</span>
                  <span className="tour-open-detail">
                    {t(
                      { one: '{count} step', other: '{count} steps' },
                      { count: tour.steps.length },
                    )}
                    {broken > 0 &&
                      ` · ${t(
                        {
                          one: '{count} names what is gone',
                          other: '{count} name what is gone',
                        },
                        { count: broken },
                      )}`}
                  </span>
                </button>
                <PlayButton tour={tour} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="panel-empty">
          {t(
            'This project has no tours yet. A tour walks someone through it, one view state at a time: start one from what the canvas shows now.',
          )}
        </p>
      )}
      <button
        type="button"
        className="tour-button"
        disabled={!editable || view === undefined}
        onClick={() => void create()}
      >
        {t('New tour from the canvas')}
      </button>
      {!editable && <p className="panel-empty">{t(NOT_CONNECTED)}</p>}
    </>
  );
}

/** Plays a tour full screen, from a step: the first unless another is given. */
function PlayButton({ tour, step = 0, label }: { tour: TourFile; step?: number; label?: string }) {
  const t = useT();
  const host = useToursHost();
  const name = label ?? t('Play “{name}” full screen', { name: tour.name });
  return (
    <button
      type="button"
      className="tour-button tour-play"
      disabled={host === undefined || tour.steps.length === 0}
      aria-label={name}
      title={name}
      onClick={() => host?.player.start(tour, step)}
    >
      <PlayIcon />
    </button>
  );
}

/** The open tour: its name, playing and deleting it, and its steps. */
function OpenTour({ tour, send, onClose }: { tour: TourFile; send: Send; onClose: () => void }) {
  const t = useT();
  const editor = useEditor();
  const { project, viewId } = editor;
  const host = useToursHost();
  const editable = editor.send !== undefined;
  const nameId = useId();
  const [deleting, setDeleting] = useState(false);
  const view = project.views.find((each) => each.id === viewId);

  const add = async () => {
    const current = host?.current();
    if (!current || !view) return;
    await send(
      addStep(tour, stepOf(current, view.name)),
      t('Added step {n}, showing the canvas as it is now.', { n: tour.steps.length + 1 }),
    );
  };

  const remove = async () => {
    setDeleting(false);
    if (
      (await send(deleteTourCommand(tour), t('Deleted “{name}”.', { name: tour.name }))) !== false
    ) {
      onClose();
    }
  };

  return (
    <div className="tour-open-tour">
      <div className="tour-head">
        <button type="button" className="tour-button" onClick={onClose}>
          {t('All tours')}
        </button>
        <PlayButton tour={tour} />
      </div>
      <Field
        id={nameId}
        label={t('Name of the tour')}
        value={tour.name}
        max={MAX_TOUR_NAME}
        disabled={!editable}
        required
        onCommit={(name) =>
          void send(renameTourCommand(tour, name), t('Renamed to “{name}”.', { name }))
        }
      />
      {tour.steps.length > 0 ? (
        <ol className="tour-steps" aria-label={t('Steps of “{name}”', { name: tour.name })}>
          {tour.steps.map((step, at) => (
            <StepItem
              key={step.id}
              tour={tour}
              step={step}
              at={at}
              send={send}
              editable={editable}
            />
          ))}
        </ol>
      ) : (
        <p className="panel-empty">
          {t('This tour has no steps yet. Add one: it takes the canvas as it is now.')}
        </p>
      )}
      <div className="tour-actions">
        <button
          type="button"
          className="tour-button"
          disabled={!editable || view === undefined || host === undefined}
          onClick={() => void add()}
        >
          {t('Add step')}
        </button>
        {deleting ? (
          <span className="tour-confirm" role="group" aria-label={t('Delete the tour?')}>
            <span>{t('Delete “{name}”?', { name: tour.name })}</span>
            <button type="button" className="tour-button tour-danger" onClick={() => void remove()}>
              {t('Delete')}
            </button>
            <button type="button" className="tour-button" onClick={() => setDeleting(false)}>
              {t('Keep')}
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="tour-button"
            disabled={!editable}
            onClick={() => setDeleting(true)}
          >
            {t('Delete tour')}
          </button>
        )}
      </div>
    </div>
  );
}

/** One step: its caption, marks and notes edited in place, and what can be done with it. */
function StepItem({
  tour,
  step,
  at,
  send,
  editable,
}: {
  tour: TourFile;
  step: TourStep;
  at: number;
  send: Send;
  editable: boolean;
}) {
  const t = useT();
  const editor = useEditor();
  const { project, selection } = editor;
  const host = useToursHost();
  const ids = { title: useId(), text: useId(), notes: useId() };
  const n = at + 1;
  const problems = tourStepProblems(project, step);
  const selected = [...selection.elements, ...selection.relations].slice(0, MAX_TOUR_MARKS);
  const change = (update: (step: TourStep) => TourStep, done: string) =>
    void send(changeStep(tour, step.id, update), done);
  const moved = (by: number) => {
    const command = moveStep(tour, step.id, by);
    if (command) {
      void send(command, t('Moved step {n} to {to}.', { n, to: n + by }));
    }
  };

  return (
    <li className={problems.length > 0 ? 'tour-step tour-step-broken' : 'tour-step'}>
      <div className="tour-step-head">
        <span className="tour-step-number">{t('Step {n}', { n })}</span>
        <span className="tour-step-shows">{describeShown(t, project, step)}</span>
      </div>
      {problems.length > 0 && (
        <div className="tour-step-problems">
          <p>{t('This step names what the project no longer holds, and plays without it:')}</p>
          <ul>
            {problems.map((problem, index) => (
              <li key={index}>{t.message(problem.message)}</li>
            ))}
          </ul>
        </div>
      )}
      <Field
        id={ids.title}
        label={t('Title')}
        value={step.caption.title}
        max={MAX_CAPTION_TITLE}
        disabled={!editable}
        required
        onCommit={(title) =>
          change(
            (each) => ({ ...each, caption: { ...each.caption, title } }),
            t('Changed the title of step {n}.', { n }),
          )
        }
      />
      <Field
        id={ids.text}
        label={t('Caption')}
        value={step.caption.text ?? ''}
        max={MAX_CAPTION_TEXT}
        disabled={!editable}
        multiline
        hint={t(
          'Plain text: a blank line starts a paragraph, and lines starting with “- ” make a list.',
        )}
        onCommit={(text) =>
          change(
            (each) => {
              const caption: TourStep['caption'] = { ...each.caption, text };
              if (text === '') delete caption.text;
              return { ...each, caption };
            },
            t('Changed the caption of step {n}.', { n }),
          )
        }
      />
      <details className="tour-step-notes">
        <summary>{t('Speaker notes')}</summary>
        <Field
          id={ids.notes}
          label={t('Speaker notes')}
          labelHidden
          value={step.notes ?? ''}
          max={MAX_SPEAKER_NOTES}
          disabled={!editable}
          multiline
          onCommit={(notes) =>
            change(
              (each) => {
                const next: TourStep = { ...each, notes };
                if (notes === '') delete next.notes;
                return next;
              },
              t('Changed the speaker notes of step {n}.', { n }),
            )
          }
        />
      </details>
      <div className="tour-step-marks">
        <span>{describeMarks(t, project, step)}</span>
        <button
          type="button"
          className="tour-button"
          disabled={!editable || selected.length === 0}
          onClick={() =>
            change(
              (each) => ({ ...each, marks: selected }),
              t('Step {n} marks the selection.', { n }),
            )
          }
        >
          {t('Mark the selection')}
        </button>
        {step.marks !== undefined && (
          <button
            type="button"
            className="tour-button"
            disabled={!editable}
            onClick={() =>
              change(
                (each) => {
                  const next = { ...each };
                  delete next.marks;
                  return next;
                },
                t('Step {n} marks nothing.', { n }),
              )
            }
          >
            {t('Clear marks')}
          </button>
        )}
      </div>
      <div className="tour-step-actions" role="group" aria-label={t('Step {n}', { n })}>
        <button
          type="button"
          className="tour-button"
          disabled={!host}
          onClick={() => host?.show(step)}
        >
          {t('Show')}
        </button>
        <button
          type="button"
          className="tour-button"
          disabled={!editable || !host}
          onClick={() => {
            const current = host?.current();
            if (current) {
              change(
                (each) => ({ ...each, viewState: savedViewStateOf(current) }),
                t('Step {n} shows the canvas as it is now.', { n }),
              );
            }
          }}
        >
          {t('Take the canvas')}
        </button>
        <PlayButton tour={tour} step={at} label={t('Play full screen from step {n}', { n })} />
        <StepButton disabled={!editable || at === 0} onClick={() => moved(-1)}>
          {t('Move up')}
        </StepButton>
        <StepButton disabled={!editable || at === tour.steps.length - 1} onClick={() => moved(1)}>
          {t('Move down')}
        </StepButton>
        <StepButton
          disabled={!editable}
          onClick={() => {
            const command = duplicateStep(tour, step.id);
            if (command) void send(command, t('Duplicated step {n}.', { n }));
          }}
        >
          {t('Duplicate')}
        </StepButton>
        <StepButton
          disabled={!editable}
          onClick={() => void send(deleteStep(tour, step.id), t('Deleted step {n}.', { n }))}
        >
          {t('Delete')}
        </StepButton>
      </div>
    </li>
  );
}

function StepButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="tour-button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

/**
 * A text edited in place: it is sent once the person leaves it, or presses Enter in one line, and
 * Escape puts it back as it was.
 */
function Field({
  id,
  label,
  labelHidden = false,
  value,
  max,
  disabled,
  multiline = false,
  required = false,
  hint,
  onCommit,
}: {
  id: string;
  label: string;
  labelHidden?: boolean;
  value: string;
  max: number;
  disabled: boolean;
  multiline?: boolean;
  required?: boolean;
  hint?: string;
  onCommit: (value: string) => void;
}) {
  const hintId = useId();
  const [draft, setDraft] = useState<string>();
  const shown = draft ?? value;
  const commit = () => {
    if (draft === undefined) return;
    setDraft(undefined);
    const next = multiline ? draft : draft.trim();
    if (next === value || (required && next === '')) return;
    onCommit(next);
  };
  const common = {
    id,
    value: shown,
    maxLength: max,
    disabled,
    'aria-describedby': hint === undefined ? undefined : hintId,
    onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
    onBlur: commit,
  };
  return (
    <div className="tour-field">
      <label htmlFor={id} className={labelHidden ? 'visually-hidden' : undefined}>
        {label}
      </label>
      {multiline ? (
        <textarea
          {...common}
          rows={3}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setDraft(undefined);
          }}
        />
      ) : (
        <input
          {...common}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            else if (event.key === 'Escape') setDraft(undefined);
          }}
        />
      )}
      {hint !== undefined && (
        <p id={hintId} className="tour-field-hint">
          {hint}
        </p>
      )}
    </div>
  );
}

/** What a step shows, in brief: its view, and what else its view state sets. */
function describeShown(t: Translator, project: ProjectSnapshot, step: TourStep): string {
  const { viewState } = step;
  const view = project.views.find((each) => each.id === viewState.view);
  const parts: string[] = [];
  if (viewState.camera) parts.push(t('a place on the canvas'));
  if (viewState.select) {
    parts.push(
      t({ one: '{count} selected', other: '{count} selected' }, { count: viewState.select.length }),
    );
  }
  if (viewState.filters) parts.push(t('filters'));
  if (viewState.focus) parts.push(t('focus'));
  if (viewState.scenario !== undefined || step.play) parts.push(t('a scenario'));
  const name = view?.name ?? viewState.view;
  return parts.length === 0
    ? t('Shows “{view}”', { view: name })
    : t('Shows “{view}”: {parts}', { view: name, parts: parts.join(', ') });
}

/** What a step marks, in words. */
function describeMarks(t: Translator, project: ProjectSnapshot, step: TourStep): string {
  const marks = step.marks ?? [];
  if (marks.length === 0) return t('Marks nothing.');
  const index = modelIndexOf(project);
  const names = marks
    .slice(0, 3)
    .map((id) => `“${index.element(id)?.name ?? index.relation(id)?.name ?? id}”`);
  return marks.length > 3
    ? t('Marks {names} and {count} more.', { names: names.join(', '), count: marks.length - 3 })
    : t('Marks {names}.', { names: names.join(', ') });
}
