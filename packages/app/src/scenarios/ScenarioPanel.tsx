/**
 * The scenario panel, beside the canvas: the project's scenarios, created, opened, renamed and
 * deleted here; and the open one played and recorded over its view, with the step panel listing its
 * steps. The step playback is on is highlighted on the canvas, with a marker travelling along its
 * relations, and the panel shows its description and its data in and out, to edit.
 *
 * Opening a scenario opens its view. Playing never changes the project.
 */
import {
  SPEEDS,
  entryOfStep,
  isBroken,
  modelIndexOf,
  scenarioTimeline,
  type Command,
  type Speed,
  type Timeline,
  type TimelineEntry,
} from '@visual-anything/core';
import type { Id, ScenarioFile } from '@visual-anything/schema';
import {
  useCallback,
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
import { useEditor } from '../editor/EditorContext';
import {
  createScenarioCommand,
  deleteScenarioCommand,
  newScenarioName,
  renameScenarioCommand,
} from './commands';
import { highlightOf } from './emphasis';
import { PlaybackEmphasis } from './PlaybackEmphasis';
import './scenarios.css';
import type { ScenarioSession, ScenarioState } from './session';
import { StepDetails } from './StepDetails';

const NOT_CONNECTED = 'Visual Anything is not connected, so nothing was changed.';

export function ScenarioPanel({ session }: { session: ScenarioSession }) {
  const editor = useEditor();
  const { project, viewId, send } = editor;
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const heading = useId();
  const [announcement, setAnnouncement] = useState({ text: '', count: 0 });
  const announce = useCallback(
    (text: string) => setAnnouncement((last) => ({ text, count: last.count + 1 })),
    [],
  );

  const scenario = project.scenarios.find((each) => each.id === state.scenario);
  const active = scenario !== undefined && scenario.view === viewId;
  const timeline = useMemo(
    () => (scenario ? scenarioTimeline(project, scenario) : undefined),
    [project, scenario],
  );
  const playing = active ? timeline : undefined;

  useLayoutEffect(() => {
    session.sync({ project, viewId, send, timeline: playing, announce });
  }, [session, project, viewId, send, playing, announce]);
  useEffect(() => () => session.stop(), [session]);

  /** Sends a command, and says `done` once it is applied. */
  const sendCommand = useCallback(
    async (command: Command, done?: string): Promise<boolean> => {
      if (!send) {
        announce(NOT_CONNECTED);
        return false;
      }
      const result = await send(command);
      if (result.ok && done !== undefined) announce(done);
      return result.ok;
    },
    [send, announce],
  );

  const view = active ? project.views.find((each) => each.id === scenario.view) : undefined;

  return (
    <aside className="panel scenario-panel" aria-labelledby={heading}>
      <h2 id={heading}>Scenarios</h2>
      {scenario && timeline ? (
        <OpenScenario
          session={session}
          state={state}
          scenario={scenario}
          timeline={timeline}
          active={active}
          send={sendCommand}
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
    </aside>
  );
}

/** The project's scenarios, to open one, and a way to create one over the open view. */
function ScenarioList({ session }: { session: ScenarioSession }) {
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
        <ul className="scenario-list" aria-label="Scenarios of the project">
          {project.scenarios.map((scenario) => (
            <li key={scenario.id}>
              <button type="button" className="scenario-open" onClick={() => open(scenario)}>
                <span className="scenario-open-name">{scenario.name}</span>
                <span className="scenario-open-detail">
                  {counted(scenario.steps.length, 'step', 'steps')} over{' '}
                  {viewNames.get(scenario.view) ?? scenario.view}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel-empty">
          This project has no scenarios yet. Create one, then click relations on the canvas in the
          order they happen.
        </p>
      )}
      {creating === undefined ? (
        <button
          type="button"
          className="scenario-button"
          disabled={!editor.send || viewId === undefined}
          title={openView === undefined ? 'Open a view to create a scenario over it.' : undefined}
          onClick={() => setCreating(newScenarioName(project.scenarios))}
        >
          New scenario
        </button>
      ) : (
        <form className="scenario-form" onSubmit={(event) => void create(event)}>
          <label htmlFor={nameId}>Name of the new scenario over “{openView}”</label>
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
              Create and record
            </button>
            <button
              type="button"
              className="scenario-button"
              onClick={() => setCreating(undefined)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {editor.send === undefined && <p className="panel-empty">{NOT_CONNECTED}</p>}
    </>
  );
}

/** The open scenario: its name, its playback and recording controls, and its steps. */
function OpenScenario({
  session,
  state,
  scenario,
  timeline,
  active,
  send,
}: {
  session: ScenarioSession;
  state: ScenarioState;
  scenario: ScenarioFile;
  timeline: Timeline;
  active: boolean;
  send: (command: Command, done?: string) => Promise<boolean>;
}) {
  const editor = useEditor();
  const { project } = editor;
  const editable = editor.send !== undefined;
  const [renaming, setRenaming] = useState<string>();
  const [deleting, setDeleting] = useState(false);
  const renameId = useId();
  const speedId = useId();
  const viewName = project.views.find((view) => view.id === scenario.view)?.name ?? scenario.view;
  const at = entryOfStep(timeline, state.step);
  const entry = at === undefined ? undefined : timeline.entries[at];
  const finished = session.finished;

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    const name = renaming?.trim();
    setRenaming(undefined);
    if (!name || name === scenario.name) return;
    await send(renameScenarioCommand(scenario, name), `Renamed to “${name}”.`);
  };

  const remove = async () => {
    setDeleting(false);
    await send(deleteScenarioCommand(scenario), `Deleted “${scenario.name}”.`);
  };

  return (
    <div className="scenario-open-scenario">
      {renaming === undefined ? (
        <div className="scenario-head">
          <h3 className="scenario-title">{scenario.name}</h3>
          <div className="scenario-actions">
            <button
              type="button"
              className="scenario-button"
              disabled={!editable}
              onClick={() => setRenaming(scenario.name)}
            >
              Rename
            </button>
            <button
              type="button"
              className="scenario-button"
              disabled={!editable}
              onClick={() => setDeleting(true)}
            >
              Delete
            </button>
            <button type="button" className="scenario-button" onClick={() => session.close()}>
              Close
            </button>
          </div>
        </div>
      ) : (
        <form className="scenario-form" onSubmit={(event) => void rename(event)}>
          <label htmlFor={renameId}>Name of the scenario</label>
          <input
            id={renameId}
            value={renaming}
            // The form opens for typing the name.
            autoFocus
            onChange={(event) => setRenaming(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setRenaming(undefined);
            }}
          />
          <div className="scenario-actions">
            <button type="submit" className="scenario-button" disabled={!renaming.trim()}>
              Rename
            </button>
            <button
              type="button"
              className="scenario-button"
              onClick={() => setRenaming(undefined)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {deleting && (
        <div className="scenario-confirm" role="alertdialog" aria-label="Delete the scenario?">
          <p>
            Delete “{scenario.name}” and its {counted(scenario.steps.length, 'step', 'steps')}? You
            can undo it.
          </p>
          <div className="scenario-actions">
            <button
              type="button"
              className="scenario-button scenario-button-danger"
              // The question opens for answering it.
              autoFocus
              onClick={() => void remove()}
            >
              Delete scenario
            </button>
            <button type="button" className="scenario-button" onClick={() => setDeleting(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {scenario.description !== undefined && (
        <p className="scenario-description">{scenario.description}</p>
      )}
      {!active && (
        <p className="scenario-elsewhere">
          It plays over “{viewName}”.{' '}
          <button
            type="button"
            className="scenario-button"
            onClick={() => editor.openView?.(scenario.view)}
          >
            Open “{viewName}”
          </button>
        </p>
      )}

      <div className="scenario-transport" role="group" aria-label="Playback">
        <button
          type="button"
          className="scenario-button"
          disabled={!active || at === undefined}
          onClick={() => session.previous()}
        >
          Previous
        </button>
        <button
          type="button"
          className="scenario-button scenario-button-primary"
          disabled={!active || timeline.steps === 0}
          onClick={() => session.toggle()}
        >
          {state.mode === 'playing' ? 'Pause' : finished ? 'Play again' : 'Play'}
        </button>
        <button
          type="button"
          className="scenario-button"
          disabled={!active || at === undefined || at >= timeline.entries.length - 1}
          onClick={() => session.next()}
        >
          Next
        </button>
        <span className="scenario-position">{positionOf(entry, timeline)}</span>
      </div>
      <div className="scenario-options">
        <label htmlFor={speedId}>Speed</label>
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
          {state.recording ? 'Stop recording' : 'Record'}
        </button>
      </div>
      {state.recording && (
        <p className="scenario-hint scenario-recording-hint">
          {state.canRecord
            ? `Click relations on the canvas in the order they happen: each click adds a step after ${
                timeline.steps === 0 ? 'the start' : `step ${state.step + 1}`
              }. Shift+click adds a relation to that step. From the keyboard, ] and [ select a relation, Enter records it and follows it, and Shift+Enter adds it to the step.`
            : 'Recording waits until the scenario’s view is open and Visual Anything is connected.'}
        </p>
      )}

      <StepList
        session={session}
        scenario={scenario}
        timeline={timeline}
        current={at}
        entry={entry}
        active={active}
        send={send}
      />
    </div>
  );
}

/** "Step 2 of 5", or "Steps 4–5 of 5" for an aggregated step. */
function positionOf(entry: TimelineEntry | undefined, timeline: Timeline): string {
  if (!entry) return 'No steps yet';
  if (entry.count === 1) return `Step ${entry.first + 1} of ${timeline.steps}`;
  return `Steps ${entry.first + 1}–${entry.first + entry.count} of ${timeline.steps}`;
}

/**
 * The steps as they play: each step, or each aggregated step with its count. Choosing one goes there;
 * the arrow keys go from one to the next. The one playback is on shows its details.
 */
function StepList({
  session,
  scenario,
  timeline,
  current,
  entry,
  active,
  send,
}: {
  session: ScenarioSession;
  scenario: ScenarioFile;
  timeline: Timeline;
  current: number | undefined;
  entry: TimelineEntry | undefined;
  active: boolean;
  send: (command: Command, done?: string) => Promise<boolean>;
}) {
  const editor = useEditor();
  const { project } = editor;
  const heading = useId();
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  const index = modelIndexOf(project);
  const nameOf = (id: Id) => index.element(id)?.name ?? id;
  const view = project.views.find((each) => each.id === scenario.view);

  if (timeline.entries.length === 0) {
    return (
      <p className="panel-empty">
        No steps yet. Turn on Record, then click relations on the canvas in order.
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

  return (
    <>
      <h3 id={heading} className="scenario-steps-heading">
        Steps
      </h3>
      <ol className="scenario-steps" aria-labelledby={heading}>
        {timeline.entries.map((each, at) => {
          const isCurrent = at === current;
          const broken = isBroken(each);
          const description =
            each.kind === 'aggregated'
              ? `${counted(each.count, 'step', 'steps')} inside “${nameOf(each.container)}”`
              : scenario.steps[each.first]?.description || 'No description yet';
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
                  {each.count === 1
                    ? each.first + 1
                    : `${each.first + 1}–${each.first + each.count}`}
                </span>
                <span className="scenario-step-text">{description}</span>
                {broken && <span className="scenario-badge scenario-badge-broken">Broken</span>}
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
                />
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function counted(amount: number, one: string, many: string): string {
  return `${amount} ${amount === 1 ? one : many}`;
}
