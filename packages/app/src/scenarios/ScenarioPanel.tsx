/**
 * The scenario panel, beside the canvas: the project's scenarios, created, opened, renamed and
 * deleted here; and the open one played and recorded over its view, with the step panel listing its
 * steps. The step playback is on is highlighted on the canvas, with a marker travelling along its
 * relations, and the panel shows its description and its data in and out, to edit.
 *
 * A scenario with decisions (ADR 0078) shows the decision card while playback meets one, lists the
 * steps of each alternative under it, and records alternatives as it records steps.
 *
 * Opening a scenario opens its view. Playing never changes the project, and nor does choosing.
 */
import {
  SPEEDS,
  decisionsAt,
  entryOfStep,
  isBroken,
  isOutside,
  missingShown,
  modelIndexOf,
  readBlocks,
  scenarioTimeline,
  type Command,
  type Speed,
  type Timeline,
  type TimelineEntry,
} from '@visual-anything/core';
import type { DecisionChoices, Id, ScenarioFile, ViewFile } from '@visual-anything/schema';
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { viewAsDrawn } from '../canvas/overlays/collapsed';
import { ZoomExpansionContext, useZoomExpanded } from '../canvas/overlays/useZoomExpansion';
import { useEditor } from '../editor/EditorContext';
import { useT, type Translator } from '../i18n';
import {
  createScenarioCommand,
  deleteScenarioCommand,
  removeDecisionsCommand,
  newScenarioName,
  renameScenarioCommand,
} from './commands';
import { AlternativeForm } from './AlternativeForm';
import { hasDecisions } from './choosing';
import { DecisionCard } from './DecisionCard';
import { lastStepOf } from './decision-emphasis';
import { DecisionEmphasis } from './DecisionEmphasis';
import { highlightOf } from './emphasis';
import { listedSteps, type ListedAlternative, type ListedStep } from './groups';
import { PlaybackEmphasis } from './PlaybackEmphasis';
import { PlaybackFollow } from './PlaybackFollow';
import { SpacePlaybackFollow } from '../space/SpacePlaybackFollow';
import { decisionHolding } from './record-decisions';
import './scenarios.css';
import type { ScenarioSession, ScenarioState } from './session';
import { StepDetails } from './StepDetails';
import { EmphasisBlocks } from '../text/EmphasisText';
import type { CanvasCamera } from '../view-state/canvas';

const NOT_CONNECTED = 'Visual Anything is not connected, so nothing was changed.';

const STEPS_OVER = { one: '{count} step over {view}', other: '{count} steps over {view}' };

export function ScenarioPanel({
  session,
  canvas,
  held = false,
}: {
  session: ScenarioSession;
  /** The canvas's camera, which playback moves to bring the step it plays into view. */
  canvas?: CanvasCamera | undefined;
  /**
   * While a tour plays, playback leaves the camera to it: the tour moves the camera itself and
   * brings the scenario's steps into view as its step says (ADR 0077).
   */
  held?: boolean;
}) {
  const t = useT();
  const editor = useEditor();
  const { project, viewId, send } = editor;
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const heading = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [announcement, setAnnouncement] = useState({ text: '', count: 0 });
  const announce = useCallback(
    (text: string) => setAnnouncement((last) => ({ text, count: last.count + 1 })),
    [],
  );

  const scenario = project.scenarios.find((each) => each.id === state.scenario);
  const active = scenario !== undefined && scenario.view === viewId;
  // Playback goes over its view as the canvas draws it: a container the zoom expands plays expanded
  // (ADR 0055), and its steps on their own lines, until the zoom collapses it again.
  const zoom = useContext(ZoomExpansionContext);
  const zoomed = useZoomExpanded(zoom, active ? viewId : undefined);
  const stored = scenario && project.views.find((each) => each.id === scenario.view);
  const drawn = stored && active ? viewAsDrawn(stored, zoomed) : stored;
  // The alternatives the tab chose at the scenario's decisions play (ADR 0078).
  const { choices } = state;
  const timeline = useMemo(
    () => (scenario ? scenarioTimeline(project, scenario, drawn, choices) : undefined),
    [project, scenario, drawn, choices],
  );
  const playing = active ? timeline : undefined;

  useLayoutEffect(() => {
    session.sync({ project, viewId, send, timeline: playing, choices, touring: held, announce });
  }, [session, project, viewId, send, playing, choices, held, announce]);
  useEffect(() => () => session.stop(), [session]);

  /** Sends a command, and says `done` once it is applied. */
  const sendCommand = useCallback(
    async (command: Command, done?: string): Promise<boolean> => {
      if (!send) {
        announce(t(NOT_CONNECTED));
        return false;
      }
      const result = await send(command);
      if (result.ok && done !== undefined) announce(done);
      return result.ok;
    },
    [send, announce, t],
  );

  const view = active ? drawn : undefined;

  return (
    <aside className="panel scenario-panel" aria-labelledby={heading}>
      <h2 id={heading} ref={headingRef} tabIndex={-1}>
        {t('Scenarios')}
      </h2>
      {scenario && timeline ? (
        <OpenScenario
          session={session}
          state={state}
          scenario={scenario}
          timeline={timeline}
          view={view}
          active={active}
          send={sendCommand}
          onClosed={() => headingRef.current?.focus()}
        />
      ) : (
        <ScenarioList session={session} />
      )}
      <div aria-live="polite" className="visually-hidden">
        {announcement.text}
        {announcement.count % 2 === 1 ? ' ' : ''}
      </div>
      <PlaybackEmphasis
        session={session}
        project={project}
        view={view}
        scene={active ? editor.scene : undefined}
        timeline={playing}
      />
      <DecisionEmphasis
        session={session}
        project={project}
        scenario={active ? scenario : undefined}
        timeline={playing}
      />
      <PlaybackFollow
        session={session}
        project={project}
        view={view}
        scene={active ? editor.scene : undefined}
        timeline={playing}
        canvas={canvas}
        held={held}
      />
      <SpacePlaybackFollow session={session} project={project} view={view} timeline={playing} />
    </aside>
  );
}

/** The project's scenarios, to open one, and a way to create one over the open view. */
function ScenarioList({ session }: { session: ScenarioSession }) {
  const t = useT();
  const editor = useEditor();
  const { project, viewId } = editor;
  const nameId = useId();
  const [creating, setCreating] = useState<string>();
  const viewNames = new Map(project.views.map((view) => [view.id, view.name]));
  const openView = viewId === undefined ? undefined : viewNames.get(viewId);

  const open = (scenario: ScenarioFile) => {
    session.open(scenario.id);
    if (scenario.view !== viewId) editor.openView?.(scenario.view);
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const name = creating?.trim();
    if (!name || viewId === undefined || !editor.send) return;
    setCreating(undefined);
    const result = await editor.send(createScenarioCommand(name, viewId));
    const id = result.created?.[0];
    if (!result.ok || id === undefined) return;
    session.open(id);
    session.setRecording(true);
  };

  return (
    <>
      {project.scenarios.length > 0 ? (
        <ul className="scenario-list" aria-label={t('Scenarios of the project')}>
          {project.scenarios.map((scenario) => (
            <li key={scenario.id}>
              <button type="button" className="scenario-open" onClick={() => open(scenario)}>
                <span className="scenario-open-name">{scenario.name}</span>
                <span className="scenario-open-detail">
                  {t(STEPS_OVER, {
                    count: scenario.steps.length,
                    view: viewNames.get(scenario.view) ?? scenario.view,
                  })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel-empty">
          {t(
            'This project has no scenarios yet. Create one, then click relations on the canvas in the order they happen.',
          )}
        </p>
      )}
      {creating === undefined ? (
        <button
          type="button"
          className="scenario-button"
          disabled={!editor.send || viewId === undefined}
          title={
            openView === undefined ? t('Open a view to create a scenario over it.') : undefined
          }
          onClick={() => setCreating(newScenarioName(project.scenarios))}
        >
          {t('New scenario')}
        </button>
      ) : (
        <form className="scenario-form" onSubmit={(event) => void create(event)}>
          <label htmlFor={nameId}>
            {t('Name of the new scenario over “{view}”', { view: openView ?? '' })}
          </label>
          <input
            id={nameId}
            value={creating}
            // The form opens for typing the name.
            autoFocus
            onChange={(event) => setCreating(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setCreating(undefined);
            }}
          />
          <div className="scenario-actions">
            <button type="submit" className="scenario-button" disabled={!creating.trim()}>
              {t('Create and record')}
            </button>
            <button
              type="button"
              className="scenario-button"
              onClick={() => setCreating(undefined)}
            >
              {t('Cancel')}
            </button>
          </div>
        </form>
      )}
      {editor.send === undefined && <p className="panel-empty">{t(NOT_CONNECTED)}</p>}
    </>
  );
}

/** The open scenario: its name, its playback and recording controls, and its steps. */
function OpenScenario({
  session,
  state,
  scenario,
  timeline,
  view,
  active,
  send,
  onClosed,
}: {
  session: ScenarioSession;
  state: ScenarioState;
  scenario: ScenarioFile;
  timeline: Timeline;
  /** The scenario's view as the canvas draws it, while it is the one open. */
  view: ViewFile | undefined;
  active: boolean;
  send: (command: Command, done?: string) => Promise<boolean>;
  /** Gives the focus a place once the scenario closes, or is deleted. */
  onClosed: () => void;
}) {
  const t = useT();
  const editor = useEditor();
  const { project } = editor;
  const editable = editor.send !== undefined;
  const [renaming, setRenaming] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  const renameId = useId();
  const speedId = useId();
  // The title takes the focus when the scenario opens, and back from the rename form.
  const title = useRef<HTMLHeadingElement>(null);
  const [titleRequest, setTitleRequest] = useState(1);
  useEffect(() => {
    title.current?.focus();
  }, [titleRequest]);
  const stopRenaming = () => {
    setRenaming(undefined);
    setTitleRequest((count) => count + 1);
  };
  const viewName = project.views.find((view) => view.id === scenario.view)?.name ?? scenario.view;
  const at = entryOfStep(timeline, state.step);
  const entry = at === undefined ? undefined : timeline.entries[at];
  const finished = session.finished;
  // The decisions playback meets now, for the card (ADR 0078).
  const decided = hasDecisions(scenario);
  const last = active && decided ? lastStepOf(timeline, state.step) : undefined;
  const met = useMemo(
    () => (last === undefined ? [] : decisionsAt(scenario, last, state.choices)),
    [scenario, last, state.choices],
  );
  // The step after which an alternative is being added, while its words are asked for.
  const [adding, setAdding] = useState<number>();

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    const name = renaming?.trim();
    stopRenaming();
    if (!name || name === scenario.name) return;
    await send(renameScenarioCommand(scenario, name), t('Renamed to “{name}”.', { name }));
  };

  // Decisions that do not hold together play every step in order, and refuse every change of steps.
  const blocks = readBlocks(scenario);
  const removeDecisions = async () => {
    await send(
      removeDecisionsCommand(scenario),
      t('Removed the decisions of “{name}”.', { name: scenario.name }),
    );
  };

  const remove = async () => {
    setDeleting(false);
    if (
      await send(deleteScenarioCommand(scenario), t('Deleted “{name}”.', { name: scenario.name }))
    ) {
      onClosed();
    }
  };

  return (
    <div className="scenario-open-scenario">
      {renaming === undefined ? (
        <div className="scenario-head">
          <h3 ref={title} tabIndex={-1} className="scenario-title">
            {scenario.name}
          </h3>
          <div className="scenario-actions">
            <button
              type="button"
              className="scenario-button"
              disabled={!editable}
              onClick={() => setRenaming(scenario.name)}
            >
              {t('Rename')}
            </button>
            <button
              type="button"
              className="scenario-button"
              disabled={!editable}
              onClick={() => setDeleting(true)}
            >
              {t('Delete')}
            </button>
            <button
              type="button"
              className="scenario-button"
              onClick={() => {
                session.close();
                onClosed();
              }}
            >
              {t('Close')}
            </button>
          </div>
        </div>
      ) : (
        <form className="scenario-form" onSubmit={(event) => void rename(event)}>
          <label htmlFor={renameId}>{t('Name of the scenario')}</label>
          <input
            id={renameId}
            value={renaming}
            // The form opens for typing the name.
            autoFocus
            onChange={(event) => setRenaming(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') stopRenaming();
            }}
          />
          <div className="scenario-actions">
            <button type="submit" className="scenario-button" disabled={!renaming.trim()}>
              {t('Rename')}
            </button>
            <button type="button" className="scenario-button" onClick={stopRenaming}>
              {t('Cancel')}
            </button>
          </div>
        </form>
      )}
      {deleting && (
        <div className="scenario-confirm" role="alertdialog" aria-label={t('Delete the scenario?')}>
          <p>
            {t(
              {
                one: 'Delete “{name}” and its {count} step? You can undo it.',
                other: 'Delete “{name}” and its {count} steps? You can undo it.',
              },
              { name: scenario.name, count: scenario.steps.length },
            )}
          </p>
          <div className="scenario-actions">
            <button
              type="button"
              className="scenario-button scenario-button-danger"
              // The question opens for answering it.
              autoFocus
              onClick={() => void remove()}
            >
              {t('Delete scenario')}
            </button>
            <button
              type="button"
              className="scenario-button"
              onClick={() => {
                setDeleting(false);
                setTitleRequest((count) => count + 1);
              }}
            >
              {t('Cancel')}
            </button>
          </div>
        </div>
      )}
      {scenario.description !== undefined && (
        <EmphasisBlocks
          className="scenario-description"
          text={scenario.description}
          headingLevel={4}
        />
      )}
      {!blocks.ok && (
        <div className="scenario-confirm" role="note">
          <p>
            {t(
              'Its decisions do not hold together, so it plays every step in order and its steps cannot change: {why}',
              { why: t.message(blocks.message) },
            )}
          </p>
          <div className="scenario-actions">
            <button
              type="button"
              className="scenario-button"
              disabled={!editable}
              onClick={() => void removeDecisions()}
            >
              {t('Remove the decisions')}
            </button>
          </div>
        </div>
      )}
      {!active && (
        <p className="scenario-elsewhere">
          {t('It plays over “{view}”.', { view: viewName })}{' '}
          <button
            type="button"
            className="scenario-button"
            onClick={() => editor.openView?.(scenario.view)}
          >
            {t('Open “{view}”', { view: viewName })}
          </button>
        </p>
      )}

      <div className="scenario-transport" role="group" aria-label={t('Playback')}>
        <button
          type="button"
          className="scenario-button"
          disabled={!active || at === undefined}
          onClick={() => session.previous()}
        >
          {t('Previous')}
        </button>
        <button
          type="button"
          className="scenario-button scenario-button-primary"
          disabled={!active || timeline.steps === 0}
          onClick={() => session.toggle()}
        >
          {state.mode === 'playing' ? t('Pause') : finished ? t('Play again') : t('Play')}
        </button>
        <button
          type="button"
          className="scenario-button"
          disabled={!active || at === undefined || at >= timeline.entries.length - 1}
          onClick={() => session.next()}
        >
          {t('Next')}
        </button>
        <span className="scenario-position">{positionOf(t, entry, timeline)}</span>
      </div>
      <div className="scenario-options">
        <label htmlFor={speedId}>{t('Speed')}</label>
        <select
          id={speedId}
          value={state.speed}
          onChange={(event) => session.setSpeed(Number(event.target.value) as Speed)}
        >
          {SPEEDS.map((speed) => (
            <option key={speed} value={speed}>
              {speed}×
            </option>
          ))}
        </select>
        <button
          type="button"
          className="scenario-button scenario-record"
          aria-pressed={state.recording}
          disabled={!active || !editable}
          onClick={() => session.setRecording(!state.recording)}
        >
          {state.recording ? t('Stop recording') : t('Record')}
        </button>
        {decided && (
          <label className="scenario-check">
            <input
              type="checkbox"
              checked={state.stopAtDecisions}
              onChange={(event) => session.setStopAtDecisions(event.target.checked)}
            />
            {t('Stop at each decision')}
          </label>
        )}
      </div>
      {state.recording && (
        <p className="scenario-hint scenario-recording-hint">
          {recordingHint(t, state, scenario, timeline)}
        </p>
      )}
      {state.recording && state.canRecord && timeline.steps > 0 && (
        <div
          className="scenario-actions scenario-recording-bar"
          role="group"
          aria-label={t('Recording')}
        >
          <button
            type="button"
            className="scenario-button"
            aria-expanded={adding !== undefined}
            onClick={() => setAdding(adding === undefined ? state.step : undefined)}
          >
            {t('Add an alternative here')}
          </button>
          <button
            type="button"
            className="scenario-button"
            disabled={decisionHolding(scenario, state.step) === undefined}
            title={
              decisionHolding(scenario, state.step) === undefined
                ? t('The step recording follows is in no alternative.')
                : undefined
            }
            onClick={() => session.endAlternative()}
          >
            {t('End the alternative')}
          </button>
          {state.place.kind !== 'after-step' && (
            <button type="button" className="scenario-button" onClick={() => session.cancelPlace()}>
              {t('Record after the step again')}
            </button>
          )}
        </div>
      )}
      {adding !== undefined && (
        <AlternativeForm
          scenario={scenario}
          after={adding}
          onAdd={(words) => {
            setAdding(undefined);
            session.addAlternative(words, adding);
          }}
          onCancel={() => setAdding(undefined)}
        />
      )}
      {active && (
        <DecisionCard
          decisions={met}
          onChoose={(chosen) => session.choose(chosen)}
          onPreview={(chosen) => session.preview(chosen)}
        />
      )}

      <StepList
        session={session}
        scenario={scenario}
        timeline={timeline}
        current={at}
        entry={entry}
        view={view}
        active={active}
        send={send}
        choices={state.choices}
        onAddAlternative={editable ? setAdding : undefined}
      />
    </div>
  );
}

/** What the recording hint says: where the next click puts its step. */
function recordingHint(
  t: Translator,
  state: ScenarioState,
  scenario: ScenarioFile,
  timeline: Timeline,
): string {
  if (!state.canRecord) {
    return t('Recording waits until the scenario’s view is open and Visual Anything is connected.');
  }
  const { place } = state;
  if (place.kind === 'new-alternative') {
    return t(
      'Click the relation the alternative “{label}” starts with: it comes after step {n}. Shift+click does the same.',
      { label: place.words.label, n: place.after + 1 },
    );
  }
  if (place.kind === 'after-decision') {
    const question = scenario.blocks?.find((each) => each.id === place.decision)?.question ?? '';
    return t(
      'Click relations on the canvas in the order they happen: the next click adds a step after “{question}”, whichever way it went.',
      { question },
    );
  }
  return timeline.steps === 0
    ? t(
        'Click relations on the canvas in the order they happen: each click adds a step after the start. Shift+click adds a relation to that step. From the keyboard, ] and [ select a relation, Enter records it and follows it, and Shift+Enter adds it to the step.',
      )
    : t(
        'Click relations on the canvas in the order they happen: each click adds a step after step {n}. Shift+click adds a relation to that step. From the keyboard, ] and [ select a relation, Enter records it and follows it, and Shift+Enter adds it to the step.',
        { n: state.step + 1 },
      );
}

/** "Step 2 of 5", or "Steps 4–5 of 5" for an aggregated step. */
function positionOf(t: Translator, entry: TimelineEntry | undefined, timeline: Timeline): string {
  if (!entry) return t('No steps yet');
  if (entry.count === 1) {
    const position = t('Step {n} of {total}', { n: entry.first + 1, total: timeline.steps });
    // A step outside the view plays all the same, saying so (ADR-0040).
    return isOutside(entry) ? `${position} · ${t('Outside the view')}` : position;
  }
  return t('Steps {first}–{last} of {total}', {
    first: entry.first + 1,
    last: entry.first + entry.count,
    total: timeline.steps,
  });
}

/**
 * The steps as they play: each step, or each aggregated step with its count. Choosing one goes there;
 * the arrow keys go from one to the next. The one playback is on shows its details.
 *
 * A scenario with decisions lists each decision as a header over its alternatives, each with its
 * steps under it (ADR 0078): the one chosen open, the others folded, greyed and dashed, their broken
 * steps marked all the same. Pressing an alternative chooses it; a step of one not chosen goes there
 * and chooses it.
 */
function StepList({
  session,
  scenario,
  timeline,
  current,
  entry,
  view,
  active,
  send,
  choices,
  onAddAlternative,
}: {
  session: ScenarioSession;
  scenario: ScenarioFile;
  timeline: Timeline;
  current: number | undefined;
  entry: TimelineEntry | undefined;
  /** The scenario's view as the canvas draws it, while it is the one open. */
  view: ViewFile | undefined;
  active: boolean;
  send: (command: Command, done?: string) => Promise<boolean>;
  choices: DecisionChoices;
  /** Asks for the words of an alternative to add after a step, by its index. */
  onAddAlternative: ((after: number) => void) | undefined;
}) {
  const t = useT();
  const editor = useEditor();
  const { project } = editor;
  const heading = useId();
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const index = modelIndexOf(project);
  const nameOf = (id: Id) => index.element(id)?.name ?? id;
  // Whether a step, by its index, shows a picture, video or link card its view no longer holds
  // (ADR 0098, stage 4): flagged in the list as its editor lists them, though it is no broken step.
  const ownView = project.views.find((each) => each.id === scenario.view);
  const showsGone = (at: number) => {
    const step = scenario.steps[at];
    return step !== undefined && missingShown(ownView, step).length > 0;
  };
  const goneBadge = (
    <span className="scenario-badge scenario-badge-gone">{t('Shows what is gone')}</span>
  );
  // The alternatives not chosen that the person unfolded, by decision and alternative.
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(() => new Set());
  const listed = useMemo(() => {
    const model = modelIndexOf(project);
    return listedSteps(scenario, timeline, choices, (at) =>
      (scenario.steps[at]?.relations ?? []).some((id) => model.relation(id) === undefined),
    );
  }, [project, scenario, timeline, choices]);

  if (scenario.steps.length === 0 || (timeline.entries.length === 0 && !listed)) {
    return (
      <p className="panel-empty">
        {t('No steps yet. Turn on Record, then click relations on the canvas in order.')}
      </p>
    );
  }

  const choose = (at: number) => {
    if (active) session.goTo(at);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, at: number) => {
    const last = timeline.entries.length - 1;
    const target =
      event.key === 'ArrowDown'
        ? Math.min(at + 1, last)
        : event.key === 'ArrowUp'
          ? Math.max(at - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : undefined;
    if (target === undefined) return;
    event.preventDefault();
    choose(target);
    buttons.current.get(target)?.focus();
  };

  // What the current entry highlights, to bring into sight on request.
  const shown =
    active && view && editor.scene && entry
      ? [...highlightOf(project, view, editor.scene, entry)]
      : [];
  const [first] = shown;
  const onShow = first === undefined ? undefined : () => editor.reveal(first);

  const renderEntry = (each: TimelineEntry, at: number) => {
    const isCurrent = at === current;
    const broken = isBroken(each);
    const description =
      each.kind === 'aggregated'
        ? t(
            {
              one: '{count} step inside “{container}”',
              other: '{count} steps inside “{container}”',
            },
            { count: each.count, container: nameOf(each.container) },
          )
        : scenario.steps[each.first]?.description || t('No description yet');
    return (
      <li
        key={each.steps[0]}
        className={`scenario-step${isCurrent ? ' scenario-step-current' : ''}${broken ? ' scenario-step-broken' : ''}`}
        aria-current={isCurrent ? 'step' : undefined}
      >
        <button
          ref={(element) => {
            if (element) buttons.current.set(at, element);
            else buttons.current.delete(at);
          }}
          type="button"
          className="scenario-step-head"
          tabIndex={isCurrent || (current === undefined && at === 0) ? 0 : -1}
          aria-disabled={!active || undefined}
          onClick={() => choose(at)}
          onKeyDown={(event) => onKeyDown(event, at)}
        >
          <span className="scenario-step-number">
            {each.count === 1 ? each.first + 1 : `${each.first + 1}–${each.first + each.count}`}
          </span>
          <span className="scenario-step-text">{description}</span>
          {broken && <span className="scenario-badge scenario-badge-broken">{t('Broken')}</span>}
          {Array.from({ length: each.count }, (_, step) => each.first + step).some(showsGone) &&
            goneBadge}
          {isOutside(each) && <span className="scenario-badge">{t('Outside the view')}</span>}
          {each.kind === 'aggregated' && (
            <span className="scenario-badge" aria-hidden="true">
              ×{each.count}
            </span>
          )}
        </button>
        {isCurrent && (
          <StepDetails
            project={project}
            scenario={scenario}
            entry={each}
            send={send}
            onShow={onShow}
            onAddAlternative={onAddAlternative}
          />
        )}
      </li>
    );
  };

  /** A step that does not play now, which going to chooses what reaches it. */
  const renderAside = (at: number) => {
    const step = scenario.steps[at];
    if (!step) return null;
    const broken = step.relations.some((id) => index.relation(id) === undefined);
    return (
      <li
        key={step.id}
        className={`scenario-step scenario-step-aside${broken ? ' scenario-step-broken' : ''}`}
      >
        <button
          type="button"
          className="scenario-step-head"
          aria-disabled={!active || undefined}
          onClick={() => {
            if (active) session.goToStep(at);
          }}
        >
          <span className="scenario-step-number">{at + 1}</span>
          <span className="scenario-step-text">{step.description || t('No description yet')}</span>
          {broken && <span className="scenario-badge scenario-badge-broken">{t('Broken')}</span>}
          {showsGone(at) && goneBadge}
        </button>
      </li>
    );
  };

  const renderItems = (items: readonly ListedStep[]) =>
    items.map((item) => {
      if (item.kind === 'entry') {
        const each = timeline.entries[item.entry];
        return each ? renderEntry(each, item.entry) : null;
      }
      if (item.kind === 'step') return renderAside(item.step);
      const { decision } = item;
      return (
        <li key={decision.id} className="scenario-decision">
          <p className="scenario-decision-question">
            <span className="scenario-badge">{t('Decision')}</span> {decision.question}
          </p>
          <ul className="scenario-alternatives" aria-label={decision.question}>
            {item.alternatives.map((listedAlternative) =>
              renderAlternative(decision.id, listedAlternative),
            )}
          </ul>
        </li>
      );
    });

  const renderAlternative = (decision: Id, listed: ListedAlternative) => {
    const { alternative, chosen, items, steps: count, broken } = listed;
    const key = `${decision}\u0000${alternative.id}`;
    const open = chosen || unfolded.has(key);
    const target = { decision, alternative: alternative.id };
    const fold = () =>
      setUnfolded((now) => {
        const next = new Set(now);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    return (
      <li
        key={alternative.id}
        className={`scenario-alternative${chosen ? ' scenario-alternative-chosen' : ' scenario-alternative-aside'}`}
        onMouseEnter={chosen ? undefined : () => session.preview(target)}
        onMouseLeave={chosen ? undefined : () => session.preview(undefined)}
      >
        <div className="scenario-alternative-head">
          <button
            type="button"
            className="scenario-alternative-choose"
            aria-pressed={chosen}
            disabled={!active}
            onClick={() => session.choose(target)}
            onFocus={chosen ? undefined : () => session.preview(target)}
            onBlur={chosen ? undefined : () => session.preview(undefined)}
          >
            {alternative.label}
          </button>
          <span className="scenario-alternative-detail">
            {count === 0
              ? t('Nothing happens')
              : t({ one: '{count} step', other: '{count} steps' }, { count })}
            {alternative.ends ? ` · ${t('Ends the scenario')}` : ''}
          </span>
          {broken > 0 && (
            <span className="scenario-badge scenario-badge-broken">
              {t({ one: '{count} broken', other: '{count} broken' }, { count: broken })}
            </span>
          )}
          {!chosen && count > 0 && (
            <button
              type="button"
              className="scenario-button scenario-button-small"
              aria-expanded={open}
              onClick={fold}
            >
              {open ? t('Hide its steps') : t('Show its steps')}
              <span className="visually-hidden"> {alternative.label}</span>
            </button>
          )}
        </div>
        {open && items.length > 0 && <ol className="scenario-steps">{renderItems(items)}</ol>}
      </li>
    );
  };

  return (
    <>
      <h3 id={heading} className="scenario-steps-heading">
        {t('Steps')}
      </h3>
      <ol className="scenario-steps" aria-labelledby={heading}>
        {listed ? renderItems(listed) : timeline.entries.map(renderEntry)}
      </ol>
    </>
  );
}
