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
import type { CaptionAt, CaptionSize, TourFile } from '@visual-anything/schema';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
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
import { leaderArrival, leaderPath, type Leader } from './leader';
import { tourKeyAction, type TourKeyAction } from './player';
import { openNotesWindow, type NotesWindow } from './notes-window';
import { CaptionFaceDrawing } from './CaptionFace';
import { placeName, type CaptionPlace } from './placement';
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
  /**
   * Keeps the place the person dragged the card to for the step whose caption it shows (ADR 0095),
   * with its size when they resized it (ADR 0096). Without it, as in the read-only page, the card
   * can be neither dragged nor resized.
   */
  onPlace?: (step: number, at: CaptionAt, size?: CaptionSize) => void;
}

/** How far, in pixels, the pointer moves on the card before it drags it rather than clicks it. */
const DRAG_THRESHOLD = 4;

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
  onPlace,
}: TourStageProps) {
  const t = useT();
  const heading = useId();
  const stage = useRef<HTMLElement>(null);
  const [notesWindow, setNotesWindow] = useState<NotesWindow>();
  // Where the card is, and how big, while it is dragged or resized, and once dropped until the step's
  // caption changes from the place and size it had then, `basis`.
  const [dragged, setDragged] = useState<{
    step: number;
    at: CaptionAt;
    size: CaptionSize | undefined;
    basis: string;
  }>();
  // The room inside the card that a face is laid out in (ADR 0096), measured as it changes.
  const [faceBox, setFaceBox] = useState({ width: FACE_WIDTH, height: 0 });
  // A card is measured while the tour, or any of its steps, gives captions a look.
  const faced =
    tour.captionFace !== undefined || tour.steps.some((each) => each.caption.face !== undefined);
  useEffect(() => {
    const card = stage.current?.querySelector<HTMLElement>('.tour-card');
    if (!faced || !card || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const style = getComputedStyle(card);
      const across = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const down = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const width = Math.max(1, Math.round(card.clientWidth - across));
      const height = Math.max(1, Math.round(card.clientHeight - down));
      setFaceBox((was) => (was.width === width && was.height === height ? was : { width, height }));
    });
    observer.observe(card);
    return () => observer.disconnect();
  }, [faced]);
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
  const captionStep = captioning?.step ?? step;
  const basis = JSON.stringify([captioned.caption.place ?? null, captioned.caption.size ?? null]);
  const held = dragged?.step === captionStep && dragged.basis === basis ? dragged : undefined;
  const at = held ? held.at : captioned.caption.place;
  const size = held ? held.size : captioned.caption.size;
  const cardPlace: CaptionPlace = at ?? place;
  /**
   * Follows the pointer from a press on the card, or on one of its handles, until it is let go: the
   * card's new rectangle on the stage, from where it was and how far the pointer went, shown while it
   * moves, and sent as the step's place, with its size.
   */
  const follow = (
    event: ReactPointerEvent<HTMLElement>,
    card: HTMLElement,
    reshape: (from: DOMRect, dx: number, dy: number) => Box,
    sizes: (box: Box, bounds: DOMRect) => CaptionSize | undefined,
  ) => {
    const room = stage.current;
    if (!onPlace || !room || event.button !== 0 || phase !== 'shown') return;
    event.stopPropagation();
    const start = { x: event.clientX, y: event.clientY };
    const from = card.getBoundingClientRect();
    let moving: { at: CaptionAt; size: CaptionSize | undefined } | undefined;
    const onMove = (move: PointerEvent) => {
      const dx = move.clientX - start.x;
      const dy = move.clientY - start.y;
      if (moving === undefined && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      const bounds = room.getBoundingClientRect();
      const box = reshape(from, dx, dy);
      const fraction = (offset: number, free: number) =>
        free > 0 ? Math.min(1, Math.max(0, offset / free)) : 0;
      moving = {
        at: {
          x: fraction(box.left - bounds.left, bounds.width - box.width),
          y: fraction(box.top - bounds.top, bounds.height - box.height),
        },
        size: sizes(box, bounds),
      };
      setDragged({ step: captionStep, ...moving, basis });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (moving === undefined) return;
      const kept = {
        at: { x: round3(moving.at.x), y: round3(moving.at.y) },
        size: moving.size && roundedSize(moving.size),
      };
      setDragged({ step: captionStep, ...kept, basis });
      onPlace(captionStep, kept.at, kept.size);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };
  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    // Its controls, as a scenario's, and its text's links, are pressed, not dragged.
    if (event.target instanceof Element && event.target.closest('button, a, input, select')) return;
    follow(
      event,
      event.currentTarget,
      (from, dx, dy) => ({
        left: from.left + dx,
        top: from.top + dy,
        width: from.width,
        height: from.height,
      }),
      () => size,
    );
  };
  const startResize = (edge: Edge) => (event: ReactPointerEvent<HTMLElement>) => {
    const card = event.currentTarget.parentElement;
    if (!card) return;
    follow(
      event,
      card,
      (from, dx, dy) => resized(from, edge, dx, dy, stage.current?.getBoundingClientRect()),
      (box, bounds) => {
        const width = Math.max(MIN_SIZE, Math.min(1, box.width / bounds.width));
        // The height is kept once a handle that moves it is used, or when the step had one.
        const tall = edge.includes('n') || edge.includes('s') || size?.height !== undefined;
        return tall
          ? { width, height: Math.max(MIN_SIZE, Math.min(1, box.height / bounds.height)) }
          : { width };
      },
    );
  };
  const cardStyle: CSSProperties &
    Record<'--card-x' | '--card-y' | '--card-w' | '--card-h', string | undefined> = {
    transitionDuration: `${fade}ms`,
    '--card-x': typeof cardPlace === 'string' ? undefined : String(cardPlace.x),
    '--card-y': typeof cardPlace === 'string' ? undefined : String(cardPlace.y),
    '--card-w': size === undefined ? undefined : String(size.width),
    '--card-h': size?.height === undefined ? undefined : String(size.height),
  };
  // The step's own look, else the tour's (ADR 0096).
  const face = captioned.caption.face ?? tour.captionFace;
  // How the step's line is drawn (ADR 0097): its shape and end.
  const leaderStyle = captioned.caption.leader;
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
          <path d={leaderPath(leader, leaderStyle?.shape)} />
          {(leaderStyle?.end ?? 'dot') === 'dot' && (
            <circle cx={leader.to.x} cy={leader.to.y} r={4} />
          )}
          {leaderStyle?.end === 'arrow' && (
            <polygon points={arrowHead(leader.to, leaderArrival(leader, leaderStyle.shape))} />
          )}
        </svg>
      )}
      <article
        ref={cardRef}
        className="tour-card"
        data-phase={phase}
        data-place={placeName(cardPlace)}
        data-draggable={onPlace ? '' : undefined}
        data-sized={size === undefined ? undefined : size.height === undefined ? 'width' : 'both'}
        style={cardStyle}
        title={
          onPlace
            ? t('Drag the caption to place it where it reads best, or its edges to resize it')
            : undefined
        }
        onPointerDown={startDrag}
      >
        {face === undefined ? (
          <>
            <h3 className="tour-card-title">{captioned.caption.title}</h3>
            {captioned.caption.text !== undefined && (
              <TourText className="tour-card-text" text={captioned.caption.text} />
            )}
          </>
        ) : (
          <>
            <h3 className="visually-hidden">{captioned.caption.title}</h3>
            <CaptionFaceDrawing
              face={face}
              tour={tour}
              step={captionStep}
              width={faceBox.width}
              height={size?.height === undefined ? undefined : faceBox.height}
            />
          </>
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
        {onPlace &&
          EDGES.map((edge) => (
            <span
              key={edge}
              className="tour-card-handle"
              data-edge={edge}
              aria-hidden="true"
              onPointerDown={startResize(edge)}
            />
          ))}
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

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** A face's width before the card is measured, as in tests, in pixels. */
const FACE_WIDTH = 400;

/** The least a card's size may be, as a fraction of the screen (ADR 0096). */
const MIN_SIZE = 0.1;
/** The least a card may be on screen, in pixels. */
const MIN_WIDTH = 160;
const MIN_HEIGHT = 64;

/** A side or a corner of the card that a handle resizes it from. */
type Edge = 'n' | 'e' | 's' | 'w' | 'ne' | 'se' | 'sw' | 'nw';
const EDGES: readonly Edge[] = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'];

/** A rectangle on the page. */
interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The card's rectangle after a handle moved by `dx` and `dy`: the sides it names follow the pointer,
 * the others stay, never smaller than 160 by 64 pixels nor past the stage.
 */
function resized(from: DOMRect, edge: Edge, dx: number, dy: number, bounds?: DOMRect): Box {
  let left = from.left;
  let right = from.left + from.width;
  let top = from.top;
  let bottom = from.top + from.height;
  const lowX = bounds?.left ?? -Infinity;
  const highX = bounds ? bounds.left + bounds.width : Infinity;
  const lowY = bounds?.top ?? -Infinity;
  const highY = bounds ? bounds.top + bounds.height : Infinity;
  if (edge.includes('w')) left = Math.max(lowX, Math.min(right - MIN_WIDTH, left + dx));
  if (edge.includes('e')) right = Math.min(highX, Math.max(left + MIN_WIDTH, right + dx));
  if (edge.includes('n')) top = Math.max(lowY, Math.min(bottom - MIN_HEIGHT, top + dy));
  if (edge.includes('s')) bottom = Math.min(highY, Math.max(top + MIN_HEIGHT, bottom + dy));
  return { left, top, width: right - left, height: bottom - top };
}

function roundedSize(size: CaptionSize): CaptionSize {
  return size.height === undefined
    ? { width: round3(size.width) }
    : { width: round3(size.width), height: round3(size.height) };
}

/** The arrowhead a leader line ends in (ADR 0097): 10 pixels long, pointing along `along` at `tip`. */
function arrowHead(tip: { x: number; y: number }, along: { x: number; y: number }): string {
  const back = { x: tip.x - along.x * 10, y: tip.y - along.y * 10 };
  const side = { x: -along.y * 5, y: along.x * 5 };
  return `${tip.x},${tip.y} ${back.x + side.x},${back.y + side.y} ${back.x - side.x},${back.y - side.y}`;
}
