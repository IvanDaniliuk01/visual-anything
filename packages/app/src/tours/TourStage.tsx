/**
 * Full-screen playback of a tour (ADR 0058, ADR 0077), over the canvas while the panels are hidden:
 * the caption card, with the texts of the reveals shown so far and the card of a scenario the step
 * plays; the progress line; the controls, with the steps' index, Back to the step and a pause control
 * for a step that advances by itself; what screen readers hear; and the keys that move through the
 * steps. It shows a step and says what moves; where the canvas goes is its host's. The speaker notes
 * show in a second window when one is opened. A caption that points at a mark draws its leader line
 * from the card (ADR 0084), and says so when the mark is off the canvas.
 *
 * It knows nothing of the live editor: it takes a project, a tour, a step and what to do on each
 * control, so that the read-only page (ADR 0041) can play tours with it too.
 */
import {
  definitionsIn,
  modelIndexOf,
  plainText,
  tourStepProblems,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { TourFile } from '@visual-anything/schema';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
} from 'react';
import { useT, type Translator } from '../i18n';
import {
  DismissIcon,
  FitIcon,
  ListIcon,
  NextIcon,
  NotesIcon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
} from '../shell/icons';
import { describeMarks } from './describe';
import type { Leader } from './leader';
import { tourKeyAction, type TourKeyAction } from './player';
import { openNotesWindow, type NotesWindow } from './notes-window';
import type { CaptionPlace } from './placement';
import type { StageCue } from './stage-store';
import { TourNotesWindow } from './TourNotes';
import { TourText } from './TourText';
import type { CaptionPhase } from './transition';
import type { StageScenario } from './useTourPlayback';
import './tours.css';

export interface TourStageProps {
  project: ProjectSnapshot;
  tour: TourFile;
  /** The index of the step shown. */
  step: number;
  /** How many of the step's reveals show (ADR 0077); none by default. */
  reveal?: number;
  /**
   * The caption the card shows as the step's transition goes (ADR 0077): the step whose caption it
   * is, whether it fades out, is away, fades in or shows, how long its fade takes, and how many of
   * that step's reveals it shows. The step's own, shown, by default.
   */
  caption?: { step: number; phase: CaptionPhase; fade: number; reveal?: number };
  /** Does what a control or a key asks. */
  onAction: (action: TourKeyAction) => void;
  /** Whether the speaker notes window is offered; it is by default. */
  notes?: boolean;
  /** The scenario the step plays, for the card to say where it is and to pause it. */
  scenario?: StageScenario | undefined;
  /** Present while the step advances by itself: the stage then offers a pause control. */
  advancing?: { paused: boolean } | undefined;
  /** Whether the person looked around, so that Back to the step is offered. */
  looked?: boolean;
  /** Whether the steps' index is open. */
  index?: boolean;
  /** Goes to a step chosen in the steps' index. */
  onGoTo?: (step: number) => void;
  /** Where the card sits when its caption fixes no corner; at the bottom by default. */
  place?: CaptionPlace;
  /** What screen readers are told, each time its count changes. */
  said?: (StageCue & { count: number }) | undefined;
  /** Whether the stages fade (ADR 0077); with fades off, a reveal's text shows at once. */
  fades?: boolean;
  /** The caption card, for its host to see where it is. */
  cardRef?: Ref<HTMLElement>;
  /**
   * The caption's leader line to the mark it points at, on screen, or `off` when that mark is off the
   * canvas (ADR 0084); none by default.
   */
  leader?: Leader | undefined;
}

export function TourStage({
  project,
  tour,
  step,
  reveal = 0,
  caption,
  onAction,
  notes = true,
  scenario,
  advancing,
  looked = false,
  index = false,
  onGoTo,
  place = 'bottom',
  said,
  fades = true,
  cardRef,
  leader,
}: TourStageProps) {
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
  // The card's caption: the step left's while it fades out, then the step come to's.
  const captioning = caption && tour.steps[caption.step] ? caption : undefined;
  const captioned = (captioning && tour.steps[captioning.step]) ?? shown;
  const phase = captioning?.phase ?? 'shown';
  const fade = captioning?.fade ?? 0;
  const revealed = captioning ? (captioning.reveal ?? 0) : reveal;
  const own = captioned === shown;
  const problems = useMemo(
    () => (captioned ? tourStepProblems(project, captioned) : []),
    [project, captioned],
  );
  const viewGone = problems.some(
    (each) => each.code === 'unknown-view' && each.subject === captioned?.viewState.view,
  );
  // A step's reveals are pressed through before the next step, and back before the one before.
  const atStart = step === 0 && reveal === 0;
  const atEnd = step === total - 1 && reveal >= (shown?.reveal?.length ?? 0);

  // The keys move through the tour wherever the focus is in the tab, before the canvas takes them.
  const act = useRef(onAction);
  const indexOpen = useRef(index);
  useEffect(() => {
    act.current = onAction;
    indexOpen.current = index;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A dialog that shows over the tour, such as a request to approve package code or the steps'
      // index, takes its own keys; only the shortcuts below are kept from the app.
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
      // Escape closes the steps' index first, wherever the focus is.
      act.current(action === 'end' && indexOpen.current ? 'index' : action);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);

  // The stage takes the focus when it opens, so that a screen reader starts reading the tour there,
  // unless something in it, as the steps' index, took it first.
  useEffect(() => {
    const shownStage = stage.current;
    if (shownStage && !shownStage.contains(document.activeElement)) {
      shownStage.focus({ preventScroll: true });
    }
  }, []);

  // What screen readers hear: each step and reveal the person brings in, and the scenario's step
  // when it is paused, from what the cue names; never what changes on a timer.
  const announcement = useMemo(
    () => (said ? announce(t, project, tour, said) : ''),
    [said, t, project, tour],
  );

  if (!shown || !captioned) return null;
  const position = t('Step {n} of {total}', { n: step + 1, total });
  const revealTexts = (captioned.reveal ?? [])
    .slice(0, revealed)
    .flatMap((each) => (each.text === undefined ? [] : [each.text]));
  const played = own ? scenario : undefined;
  const playedFile = played && project.scenarios.find((each) => each.id === played.scenario);
  return (
    <section
      ref={stage}
      className="tour-stage"
      aria-labelledby={heading}
      aria-roledescription={t('tour')}
      tabIndex={-1}
      data-fades={fades ? undefined : 'off'}
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
      {own && leader !== undefined && leader !== 'off' && (
        <svg
          className="tour-leader"
          aria-hidden="true"
          data-phase={phase}
          style={{ transitionDuration: `${fade}ms` }}
        >
          <line x1={leader.from.x} y1={leader.from.y} x2={leader.to.x} y2={leader.to.y} />
          <circle cx={leader.to.x} cy={leader.to.y} r={4} />
        </svg>
      )}
      <article
        ref={cardRef}
        className="tour-card"
        data-phase={phase}
        data-place={captioned.caption.place ?? place}
        style={{ transitionDuration: `${fade}ms` }}
      >
        <h3 className="tour-card-title">{captioned.caption.title}</h3>
        {captioned.caption.text !== undefined && (
          <TourText className="tour-card-text" text={captioned.caption.text} />
        )}
        {revealTexts.map((text, at) => (
          <TourText key={at} className="tour-card-text tour-card-reveal" text={text} />
        ))}
        {own && leader === 'off' && (
          <p className="tour-card-off">{t('It explains something off the canvas.')}</p>
        )}
        {problems.length > 0 && (
          <p className="tour-card-flag">
            {viewGone
              ? t('This step’s view no longer exists, so the canvas stays where it is.')
              : t('This step names what the project no longer holds, and plays without it.')}
          </p>
        )}
        {played && playedFile && (
          <ScenarioCard
            name={playedFile.name}
            step={played.step}
            total={playedFile.steps.length}
            description={playedFile.steps[played.step]?.description}
            state={played.state}
            onAction={onAction}
          />
        )}
      </article>
      <div className="tour-controls" role="toolbar" aria-label={t('Tour')}>
        <button
          type="button"
          onClick={() => onAction('previous')}
          disabled={atStart}
          aria-label={t('Previous step')}
          title={t('Previous step')}
        >
          <PreviousIcon />
        </button>
        <span className="tour-position">{position}</span>
        <button
          type="button"
          onClick={() => onAction('next')}
          disabled={atEnd}
          aria-label={t('Next step')}
          title={t('Next step')}
        >
          <NextIcon />
        </button>
        <button
          type="button"
          aria-expanded={index}
          aria-label={t('Steps')}
          title={t('The steps of the tour (I)')}
          onClick={() => onAction('index')}
        >
          <ListIcon />
        </button>
        {advancing && (
          <button
            type="button"
            aria-label={advancing.paused ? t('Resume advancing') : t('Pause advancing')}
            title={
              advancing.paused ? t('Resume advancing by itself') : t('Pause advancing by itself')
            }
            onClick={() => onAction('hold')}
          >
            {advancing.paused ? <PlayIcon /> : <PauseIcon />}
          </button>
        )}
        {looked && (
          <button
            type="button"
            title={t('Back to the step’s camera (B)')}
            onClick={() => onAction('back')}
          >
            <FitIcon />
            <span>{t('Back to the step')}</span>
          </button>
        )}
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
      {index && (
        <StepsIndex
          tour={tour}
          step={step}
          onGoTo={(to) => onGoTo?.(to)}
          onClose={() => {
            onAction('index');
            stage.current?.focus({ preventScroll: true });
          }}
        />
      )}
      <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
        {said && said.count % 2 === 1 ? ' ' : ''}
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
              <TourText className="tour-notes-text" text={shown.notes} headingLevel={2} />
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

/**
 * The card of a scenario a step plays (ADR 0077): which scenario, the step it is on and its
 * description; Pause and Resume, which keep the step's range; and Play again.
 */
function ScenarioCard({
  name,
  step,
  total,
  description,
  state,
  onAction,
}: {
  name: string;
  step: number;
  total: number;
  description: string | undefined;
  state: StageScenario['state'];
  onAction: (action: TourKeyAction) => void;
}) {
  const t = useT();
  return (
    <section className="tour-scenario" aria-label={t('Scenario “{name}”', { name })}>
      <p className="tour-scenario-name">{t('Plays “{name}”', { name })}</p>
      <p className="tour-scenario-step">
        <span className="tour-scenario-position">
          {t('Step {n} of {total}', { n: step + 1, total })}
        </span>
        {description !== undefined && description !== '' && <span>{description}</span>}
      </p>
      <div className="tour-scenario-actions">
        {state !== 'done' && (
          <button
            type="button"
            className="tour-button"
            title={state === 'playing' ? t('Pause the scenario (P)') : t('Resume the scenario (P)')}
            onClick={() => onAction('pause')}
          >
            {state === 'playing' ? <PauseIcon /> : <PlayIcon />}
            <span>{state === 'playing' ? t('Pause') : t('Resume')}</span>
          </button>
        )}
        <button
          type="button"
          className="tour-button"
          title={t('Play the scenario’s steps again (R)')}
          onClick={() => onAction('replay')}
        >
          <span>{t('Play again')}</span>
        </button>
      </div>
    </section>
  );
}

/**
 * The steps' index (ADR 0077): the titles of the tour's steps, to jump to one at its start. The arrow
 * keys, Home and End move among them; Escape or I closes it.
 */
function StepsIndex({
  tour,
  step,
  onGoTo,
  onClose,
}: {
  tour: TourFile;
  step: number;
  onGoTo: (step: number) => void;
  onClose: () => void;
}) {
  const t = useT();
  const list = useRef<HTMLOListElement>(null);
  // The step shown has the focus when the index opens.
  useEffect(() => {
    const current = list.current?.querySelector<HTMLButtonElement>('[aria-current="step"]');
    (current ?? list.current?.querySelector<HTMLButtonElement>('button'))?.focus({
      preventScroll: false,
    });
  }, []);
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const at = buttons.findIndex((button) => button === document.activeElement);
    const focus = (to: number) => buttons[Math.min(Math.max(0, to), buttons.length - 1)]?.focus();
    switch (event.key) {
      case 'Escape':
      case 'Esc':
      case 'i':
      case 'I':
        onClose();
        break;
      case 'ArrowDown':
        focus(at + 1);
        break;
      case 'ArrowUp':
        focus(at - 1);
        break;
      case 'Home':
        focus(0);
        break;
      case 'End':
        focus(buttons.length - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <div
      className="tour-index"
      role="dialog"
      aria-label={t('The steps of the tour')}
      onKeyDown={onKeyDown}
    >
      <ol ref={list}>
        {tour.steps.map((each, at) => (
          <li key={each.id}>
            <button
              type="button"
              aria-current={at === step ? 'step' : undefined}
              onClick={() => onGoTo(at)}
            >
              <span className="tour-index-number">{at + 1}</span>
              <span>{each.caption.title}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** What a cue tells screen readers, from the tour as it is. */
function announce(t: Translator, project: ProjectSnapshot, tour: TourFile, said: StageCue): string {
  if (said.kind === 'paused') {
    const scenario = project.scenarios.find((each) => each.id === said.scenario);
    if (!scenario) return '';
    const description = scenario.steps[said.step]?.description ?? '';
    const where = { n: said.step + 1, total: scenario.steps.length, name: scenario.name };
    return description === ''
      ? t('Paused on step {n} of {total} of “{name}”.', where)
      : t('Paused on step {n} of {total} of “{name}”: {description}', { ...where, description });
  }
  const step = tour.steps[said.step];
  if (!step) return '';
  const reveals = step.reveal ?? [];
  if (said.kind === 'reveal') {
    const shown = reveals[said.reveal - 1];
    if (!shown) return '';
    const pointTo = step.caption.pointTo;
    return [
      shown.text === undefined ? undefined : plainText(shown.text),
      shown.marks.length > 0 ? describeMarks(t, project, shown.marks) : '',
      pointTo !== undefined && shown.marks.includes(pointTo)
        ? pointingAt(t, project, step.viewState.view, pointTo)
        : undefined,
    ]
      .filter((part) => part !== undefined && part !== '')
      .join(' ');
  }
  const marks = [
    ...new Set([
      ...(step.marks ?? []),
      ...reveals.slice(0, said.reveal).flatMap((each) => each.marks),
    ]),
  ];
  return [
    t('Step {n} of {total}: {title}', {
      n: said.step + 1,
      total: tour.steps.length,
      title: step.caption.title,
    }),
    step.caption.text === undefined ? undefined : plainText(step.caption.text),
    ...reveals
      .slice(0, said.reveal)
      .map((each) => (each.text === undefined ? undefined : plainText(each.text))),
    marks.length > 0 ? describeMarks(t, project, marks) : '',
    step.caption.pointTo !== undefined && marks.includes(step.caption.pointTo)
      ? pointingAt(t, project, step.viewState.view, step.caption.pointTo)
      : undefined,
    pulseOf(t, project, step),
  ]
    .filter((part) => part !== undefined && part !== '')
    .join(' ');
}

/**
 * "Pointing at “X”.", for a caption that points at one of its step's marks (ADR 0084): an element or
 * a relation by its name, a relation without one by its type's; a note by its first words, and an
 * arrow as an arrow, never by their ids.
 */
function pointingAt(t: Translator, project: ProjectSnapshot, view: string, id: string): string {
  const index = modelIndexOf(project);
  const element = index.element(id);
  if (element) return t('Pointing at “{name}”.', { name: element.name });
  if (index.relation(id)) return t('Pointing at “{name}”.', { name: relationName(t, project, id) });
  const free = project.views
    .find((each) => each.id === view)
    ?.freeShapes.find((each) => each.id === id);
  if (free?.kind === 'note') {
    return t('Pointing at the note “{text}”.', { text: firstWords(plainText(free.text)) });
  }
  if (free?.kind === 'arrow') return t('Pointing at an arrow.');
  return t('Pointing at “{name}”.', { name: id });
}

/** A relation's name, or its type's when it has none. */
function relationName(t: Translator, project: ProjectSnapshot, id: string): string {
  const relation = modelIndexOf(project).relation(id);
  if (!relation) return id;
  if (relation.name !== undefined && relation.name !== '') return relation.name;
  const type = relation.relationType;
  return t.definition(type, definitionsIn(project).relationType(type)?.name ?? type);
}

/** The words a note is announced by: its first six, then "…" when it says more. */
const NOTE_WORDS = 6;

function firstWords(text: string): string {
  const words = text.split(/\s+/).filter((each) => each !== '');
  return words.length > NOTE_WORDS ? `${words.slice(0, NOTE_WORDS).join(' ')}…` : words.join(' ');
}

/** The chain a step's pulse runs along, its relations' names in order (ADR 0084). */
function pulseOf(
  t: Translator,
  project: ProjectSnapshot,
  step: TourFile['steps'][number],
): string | undefined {
  const relations = step.pulse?.relations;
  if (!relations || tourStepProblems(project, step).some((each) => each.part === 'pulse')) {
    return undefined;
  }
  const index = modelIndexOf(project);
  const names = relations.map((id) => {
    const relation = index.relation(id);
    const from = relation && (index.element(relation.from)?.name ?? relation.from);
    const to = relation && (index.element(relation.to)?.name ?? relation.to);
    const name = relationName(t, project, id);
    return from && to ? `“${from}” ${name} “${to}”` : `“${name}”`;
  });
  return t('A pulse follows the chain: {names}.', { names: names.join('; ') });
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
