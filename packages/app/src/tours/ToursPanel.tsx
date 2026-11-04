/**
 * The tours panel (ADR 0058): the project's tours, created, renamed, deleted and played full screen
 * from here; and the open tour's steps, each a view state with its caption, marks and speaker notes.
 * Add step takes the canvas as it is now; captions and marks are edited in place; steps are moved,
 * duplicated and deleted, each one action. A step that names what the project no longer holds is
 * kept and flagged, and plays without it. Under each step, the tour's check says where it cuts, what
 * its marks miss and whether it could be a reveal of the step before (ADR 0077), as `check_tour` does,
 * and whether it glides its shapes into another view, points at what it does not mark or sends a
 * pulse that is not a chain (ADR 0084). Each step chooses the mark its caption points at, whether it
 * always cuts, and the chain its pulse runs along, taken from the selected relations.
 */
import {
  MAX_CAPTION_TEXT,
  MAX_CAPTION_TITLE,
  MAX_SPEAKER_NOTES,
  MAX_TOUR_MARKS,
  MAX_TOUR_NAME,
  MIN_GLIDE_SHARED,
  TOUR_CHECK_SCREEN,
  chainOrder,
  checkTour,
  marksOf,
  modelIndexOf,
  isBrokenTourStep,
  savedViewStateOf,
  tourStepProblems,
  type Command,
  type ProjectSnapshot,
  type TourStepCheck,
} from '@visual-anything/core';
import type { CaptionCorner, Id, TourFile, TourStep } from '@visual-anything/schema';
import { useCallback, useContext, useId, useMemo, useState, type ReactNode } from 'react';
import { useEditor } from '../editor/EditorContext';
import { useT, type Translator } from '../i18n';
import { LIVE_MESSAGE_LIMIT } from '../import/importing';
import { LiveContext } from '../live/context';
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
  tooLargeToSend,
} from './commands';
import { useToursHost } from './context';
import { describeMarks } from './describe';
import { drawnBounds, drawnShapes } from './drawn-bounds';
import { CaptionLook } from './CaptionLook';
import { MotionPreferences } from './MotionPreferences';
import { stepJointsFrom, withStepJoints } from './step-joints';
import { useSpacePanel, useSpacePanelState } from '../space/context';
import { NO_POSITIONS } from '../space/joints';
import { useSimulations, useSimulationVersion } from '../simulation/context';
import { EmphasisPreview } from '../text/EmphasisText';
import { useEmphasisKeys } from '../text/useEmphasisKeys';
import './tours.css';

const NOT_CONNECTED = 'Visual Anything is not connected, so nothing was changed.';
const TOO_LARGE =
  'This change to the tour was not made: with its steps, the tour takes more than the {limit} MiB one change from the app carries. Delete some of its steps, or put them in another tour.';

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
  const live = useContext(LiveContext);
  const send = useCallback(
    async (command: Command, done?: string): Promise<Id | undefined | false> => {
      if (!editor.send) {
        announce(t(NOT_CONNECTED));
        return false;
      }
      // Refused here, clearly, rather than closing the connection on the way.
      if (tooLargeToSend(command)) {
        const refused = t(TOO_LARGE, { limit: LIVE_MESSAGE_LIMIT / 1024 / 1024 });
        announce(refused);
        live?.notify('warning', refused);
        return false;
      }
      const result = await editor.send(command);
      if (!result.ok) return false;
      if (done !== undefined) announce(done);
      return result.created?.[0];
    },
    [editor, announce, t, live],
  );
  // A tour deleted while open, here or elsewhere, leaves the list showing.
  const tour = project.tours.find((each) => each.id === openId);

  return (
    <div className="tours-panel" hidden={!active}>
      {tour ? (
        <OpenTour tour={tour} send={send} active={active} onClose={() => setOpenId(undefined)} />
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
      <MotionPreferences />
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
      onClick={() => host?.play(tour, step)}
    >
      <PlayIcon />
    </button>
  );
}

/**
 * The open tour: its name, playing and deleting it, its steps, and what `checkTour` says of each
 * (ADR 0077), read on the reference screen from the views' scenes as `check_tour` reads them. The
 * check is worked out once for each tour and project while the panel shows, never per frame.
 */
function OpenTour({
  tour,
  send,
  active,
  onClose,
}: {
  tour: TourFile;
  send: Send;
  active: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const editor = useEditor();
  const { project, viewId } = editor;
  const host = useToursHost();
  const editable = editor.send !== undefined;
  const nameId = useId();
  const [deleting, setDeleting] = useState(false);
  const view = project.views.find((each) => each.id === viewId);
  const checks = useMemo(
    () =>
      active
        ? checkTour(project, tour, {
            boundsOf: drawnBounds(project),
            shapesOf: drawnShapes(project),
          })
        : undefined,
    [active, project, tour],
  );
  const warnings = checks?.reduce((sum, check) => sum + check.warnings.length, 0) ?? 0;

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
      <CaptionLook
        tour={tour}
        editable={editable}
        send={(command, done) => void send(command, done)}
      />
      {checks && tour.steps.length > 0 && (
        <p className="tour-check-summary">
          {warnings === 0
            ? t('Read on a screen of {width} by {height} pixels: nothing to look at.', SCREEN)
            : t(
                {
                  one: 'Read on a screen of {width} by {height} pixels: {count} thing to look at, under its step.',
                  other:
                    'Read on a screen of {width} by {height} pixels: {count} things to look at, under their steps.',
                },
                { count: warnings, ...SCREEN },
              )}
        </p>
      )}
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
              check={checks?.[at]}
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

/**
 * One step: its caption, marks and notes edited in place, what can be done with it, and what the
 * tour's check says of it.
 */
function StepItem({
  tour,
  step,
  at,
  send,
  editable,
  check,
}: {
  tour: TourFile;
  step: TourStep;
  at: number;
  send: Send;
  editable: boolean;
  check: TourStepCheck | undefined;
}) {
  const t = useT();
  const editor = useEditor();
  const { project, selection } = editor;
  const host = useToursHost();
  const ids = { title: useId(), text: useId(), notes: useId() };
  const n = at + 1;
  const problems = tourStepProblems(project, step);
  const looks = check ? whatToLookAt(t, tour, check) : [];
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
      {looks.length > 0 && (
        <ul className="tour-step-checks" aria-label={t('What to look at in step {n}', { n })}>
          {looks.map((look, index) => (
            <li key={index} className={look.warning ? 'tour-step-warning' : undefined}>
              {look.text}
            </li>
          ))}
        </ul>
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
        emphasis
        hint={t(
          'Markdown: **bold**, *italic*, `code`, lists, headings and links; a blank line starts a paragraph.',
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
          emphasis
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
        <span>{describeMarks(t, project, step.marks ?? [])}</span>
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
      <StepExplains step={step} n={n} editable={editable} change={change} />
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
        <UseJointsButton step={step} n={n} editable={editable} change={change} />
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

/**
 * What a step adds to explain (ADR 0084): the mark its caption points at, one of its own or its
 * reveals' marks; whether it always cuts; and its pulse, along the selected relations put in the
 * order that joins them, run one to three times.
 */
function StepExplains({
  step,
  n,
  editable,
  change,
}: {
  step: TourStep;
  n: number;
  editable: boolean;
  change: (update: (step: TourStep) => TourStep, done: string) => void;
}) {
  const t = useT();
  const { project, selection } = useEditor();
  const ids = { pointTo: useId(), place: useId(), repeat: useId() };
  const index = modelIndexOf(project);
  const nameOf = (id: string) => index.element(id)?.name ?? index.relation(id)?.name ?? id;
  const marks = marksOf(step);
  const pointTo = step.caption.pointTo;
  const choices = pointTo !== undefined && !marks.includes(pointTo) ? [...marks, pointTo] : marks;
  const selected = [...selection.relations].flatMap((id) => {
    const relation = index.relation(id);
    return relation ? [{ id, from: relation.from, to: relation.to }] : [];
  });
  const [refused, setRefused] = useState(false);
  const pulse = step.pulse;
  return (
    <div className="tour-step-explains">
      <div className="tour-field">
        <label htmlFor={ids.pointTo}>{t('The caption points at')}</label>
        <select
          id={ids.pointTo}
          value={pointTo ?? ''}
          disabled={!editable || choices.length === 0}
          onChange={(event) => {
            const chosen = event.target.value;
            change(
              (each) => {
                const caption: TourStep['caption'] = { ...each.caption, pointTo: chosen };
                if (chosen === '') delete caption.pointTo;
                return { ...each, caption };
              },
              chosen === ''
                ? t('Step {n} points at nothing.', { n })
                : t('Step {n} points at “{name}”.', { n, name: nameOf(chosen) }),
            );
          }}
        >
          <option value="">{t('Nothing')}</option>
          {choices.map((id) => (
            <option key={id} value={id}>
              {nameOf(id)}
            </option>
          ))}
        </select>
      </div>
      <div className="tour-field">
        <label htmlFor={ids.place}>{t('Where the caption sits')}</label>
        <select
          id={ids.place}
          value={placeValue(step.caption.place)}
          disabled={!editable}
          onChange={(event) => {
            const chosen = event.target.value;
            if (chosen === 'free') return;
            change(
              (each) => {
                const caption: TourStep['caption'] = { ...each.caption };
                if (chosen === '') delete caption.place;
                else caption.place = chosen as CaptionCorner;
                return { ...each, caption };
              },
              chosen === ''
                ? t('Step {n}’s caption sits where it reads best.', { n })
                : t('Step {n}’s caption sits in a corner.', { n }),
            );
          }}
        >
          <option value="">{t('Where it reads best')}</option>
          <option value="top-left">{t('Top left')}</option>
          <option value="top-right">{t('Top right')}</option>
          <option value="bottom-left">{t('Bottom left')}</option>
          <option value="bottom-right">{t('Bottom right')}</option>
          {typeof step.caption.place === 'object' && (
            <option value="free">{t('Where it was dragged')}</option>
          )}
        </select>
        <p className="tour-field-hint">
          {t('While the tour plays, drag the caption to place it, or its edges to resize it.')}
        </p>
        {step.caption.size !== undefined && (
          <p className="tour-field-hint">
            {step.caption.size.height === undefined
              ? t('Size: {width} % of the screen wide.', {
                  width: Math.round(step.caption.size.width * 100),
                })
              : t('Size: {width} % by {height} % of the screen.', {
                  width: Math.round(step.caption.size.width * 100),
                  height: Math.round(step.caption.size.height * 100),
                })}{' '}
            <button
              type="button"
              className="tour-button"
              disabled={!editable}
              onClick={() =>
                change(
                  (each) => {
                    const caption: TourStep['caption'] = { ...each.caption };
                    delete caption.size;
                    return { ...each, caption };
                  },
                  t('Step {n}’s caption fits its content again.', { n }),
                )
              }
            >
              {t('Fit to its content')}
            </button>
          </p>
        )}
      </div>
      <label className="tour-step-check">
        <input
          type="checkbox"
          checked={step.transition === 'cut'}
          disabled={!editable}
          onChange={(event) => {
            const cut = event.target.checked;
            change(
              (each) => {
                const next: TourStep = { ...each, transition: 'cut' };
                if (!cut) delete next.transition;
                return next;
              },
              cut
                ? t('Step {n} always cuts.', { n })
                : t('Step {n} glides its shapes when it can.', { n }),
            );
          }}
        />
        {t('Always cut, never glide its shapes')}
      </label>
      <div className="tour-step-marks">
        <span>
          {pulse
            ? t('Pulses along {names}.', {
                names: pulse.relations.map((id) => `“${nameOf(id)}”`).join(', '),
              })
            : t('No pulse.')}
        </span>
        <button
          type="button"
          className="tour-button"
          disabled={!editable || selected.length === 0}
          onClick={() => {
            const order = chainOrder(selected);
            setRefused(order === undefined);
            if (!order) return;
            change(
              (each) => ({
                ...each,
                pulse: {
                  relations: order,
                  ...(each.pulse?.repeat ? { repeat: each.pulse.repeat } : {}),
                },
              }),
              t('Step {n} pulses along the selected relations.', { n }),
            );
          }}
        >
          {t('Pulse along the selected relations')}
        </button>
        {pulse && (
          <>
            <label htmlFor={ids.repeat} className="visually-hidden">
              {t('How many times it runs')}
            </label>
            <select
              id={ids.repeat}
              value={pulse.repeat ?? 1}
              disabled={!editable}
              onChange={(event) => {
                const repeat = Number(event.target.value);
                change(
                  (each) => ({
                    ...each,
                    pulse: {
                      relations: each.pulse?.relations ?? pulse.relations,
                      ...(repeat > 1 ? { repeat } : {}),
                    },
                  }),
                  t(
                    { one: 'Step {n} pulses once.', other: 'Step {n} pulses {count} times.' },
                    {
                      n,
                      count: repeat,
                    },
                  ),
                );
              }}
            >
              <option value={1}>{t('Once')}</option>
              <option value={2}>{t('Twice')}</option>
              <option value={3}>{t('Three times')}</option>
            </select>
            <button
              type="button"
              className="tour-button"
              disabled={!editable}
              onClick={() =>
                change(
                  (each) => {
                    const next = { ...each };
                    delete next.pulse;
                    return next;
                  },
                  t('Step {n} sends no pulse.', { n }),
                )
              }
            >
              {t('No pulse')}
            </button>
          </>
        )}
        {refused && (
          <p className="tour-field-hint" role="status">
            {t(
              'The selected relations do not join into a chain: the marker must run each from where the one before left it.',
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * "Use the joints' positions here" (ADR 0090): gives the step, as its `space.joints`, the positions
 * the physical-space panel of its view shows its joints at now, and changes nothing else of it;
 * disabled, saying why, while that cannot be done.
 */
function UseJointsButton({
  step,
  n,
  editable,
  change,
}: {
  step: TourStep;
  n: number;
  editable: boolean;
  change: (update: (step: TourStep) => TourStep, done: string) => void;
}) {
  const t = useT();
  const { project } = useEditor();
  const reasonId = useId();
  const store = useSpacePanel();
  const panel = useSpacePanelState(store, step.viewState.view);
  const simulations = useSimulations();
  // The simulations' version changes with their joints' positions, and renders this again.
  useSimulationVersion(simulations);
  const simulated = simulations?.joints() ?? NO_POSITIONS;
  // Worked out once for each change of what it reads: it walks the panel's space.
  const taken = useMemo(
    () => stepJointsFrom(project, step, panel, simulated),
    [project, step, panel, simulated],
  );
  const reason = taken.ok ? undefined : t(taken.reason, { view: taken.view ?? '' });
  return (
    <>
      <button
        type="button"
        className="tour-button"
        disabled={!editable || !taken.ok}
        aria-describedby={reason === undefined ? undefined : reasonId}
        title={reason}
        onClick={() => {
          if (!taken.ok) return;
          change(
            (each) => withStepJoints(each, taken.joints),
            t(
              {
                one: 'Step {n} gives the position of {count} joint.',
                other: 'Step {n} gives the positions of {count} joints.',
              },
              { n, count: taken.count },
            ),
          );
        }}
      >
        {t('Use the joints’ positions here')}
      </button>
      {reason !== undefined && (
        <span id={reasonId} className="visually-hidden">
          {reason}
        </span>
      )}
    </>
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
  emphasis = false,
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
  /** Whether the text takes text emphasis (ADR 0082): its keys, and the text drawn under it. */
  emphasis?: boolean;
  hint?: string;
  onCommit: (value: string) => void;
}) {
  const hintId = useId();
  const keys = useEmphasisKeys();
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
            if (emphasis && keys.onKeyDown(event, setDraft)) return;
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
      {emphasis && <EmphasisPreview text={shown} headingLevel={6} />}
      {hint !== undefined && (
        <p id={hintId} className="tour-field-hint">
          {hint}
        </p>
      )}
    </div>
  );
}

/** The screen a tour is read on, as `check_tour` reads it unless told otherwise. */
const SCREEN = { width: TOUR_CHECK_SCREEN.width, height: TOUR_CHECK_SCREEN.height };

/**
 * What the check says of a step, in the language read in: its warnings but that it is broken, which
 * the step's problems already say in full, and where it cuts into another view, which is no warning.
 */
function whatToLookAt(
  t: Translator,
  tour: TourFile,
  check: TourStepCheck,
): { text: string; warning: boolean }[] {
  const looks = check.warnings
    .filter((warning) => warning.kind !== 'broken')
    .map((warning) => ({ text: t.message(warning.message), warning: true }));
  const before = tour.steps[check.n - 2];
  const step = tour.steps[check.n - 1];
  const where = { n: check.n, m: check.n - 1 };
  const { shapes } = check;
  // Into another view: whether its shapes glide there, and why it cuts (ADR 0084).
  if (shapes?.kind === 'glide') {
    looks.push({
      text: t(
        {
          one: 'Step {n} glides the {count} shape it shares with step {m} into another view.',
          other: 'Step {n} glides the {count} shapes it shares with step {m} into another view.',
        },
        { ...where, count: shapes.shared },
      ),
      warning: false,
    });
  } else if (shapes?.kind === 'cut' && shapes.reason === 'opted-out') {
    looks.push({
      text: t('Step {n} cuts from step {m} with a cross-fade, as it asks to.', where),
      warning: false,
    });
  } else if (shapes?.kind === 'cut' && shapes.reason === 'too-few') {
    looks.push({
      text: t(
        'Step {n} cuts from step {m} with a cross-fade, into another view: they share fewer than {least} shapes.',
        { ...where, least: MIN_GLIDE_SHARED },
      ),
      warning: false,
    });
  } else if (
    shapes === undefined &&
    check.camera === 'cut' &&
    before &&
    step &&
    before.viewState.view !== step.viewState.view
  ) {
    looks.push({
      text: t('Step {n} cuts from step {m} with a cross-fade, into another view.', where),
      warning: false,
    });
  }
  return looks;
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
  if (viewState.space) parts.push(t('the physical-space panel'));
  const name = view?.name ?? viewState.view;
  return parts.length === 0
    ? t('Shows “{view}”', { view: name })
    : t('Shows “{view}”: {parts}', { view: name, parts: parts.join(', ') });
}

/** The value the place's control shows: none for where it reads best, `free` where it was dragged. */
function placeValue(place: TourStep['caption']['place']): string {
  if (place === undefined) return '';
  return typeof place === 'string' ? place : 'free';
}
