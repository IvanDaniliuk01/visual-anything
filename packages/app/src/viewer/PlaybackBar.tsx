/**
 * Playing a scenario in a read-only page: the list of the project's scenarios, and the bar that
 * plays the one open, step by step, with its description and the data each step takes in and
 * produces. It plays over the scenario's view, which opening it opens; it changes nothing.
 */
import {
  SPEEDS,
  decisionsAt,
  entryOfStep,
  isBroken,
  type ProjectSnapshot,
  type Speed,
  type Timeline,
  type TimelineEntry,
} from '@visual-anything/core';
import type { Id, JsonValue, ScenarioFile } from '@visual-anything/schema';
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useEditor } from '../editor/EditorContext';
import { useT, type Translator } from '../i18n';
import { hasDecisions } from '../scenarios/choosing';
import { DecisionCard } from '../scenarios/DecisionCard';
import { lastStepOf } from '../scenarios/decision-emphasis';
import { DismissIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon } from '../shell/icons';
import type { PlaybackSession } from './playback';

const STEPS_OVER = { one: '{count} step over {view}', other: '{count} steps over {view}' };

/** The project's scenarios, to open one. */
export function ScenarioChooser({
  project,
  open,
  onOpen,
  onClose,
}: {
  project: ProjectSnapshot;
  open: Id | undefined;
  onOpen: (id: Id) => void;
  onClose: () => void;
}) {
  const t = useT();
  const heading = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('button[aria-current="true"], li button')?.focus();
  }, []);
  const viewNames = new Map(project.views.map((view) => [view.id, view.name]));
  return (
    <div
      ref={panel}
      className="viewer-popover viewer-scenarios"
      role="dialog"
      aria-labelledby={heading}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="viewer-popover-head">
        <h2 id={heading}>{t('Scenarios')}</h2>
        <button
          type="button"
          className="viewer-dismiss"
          aria-label={t('Close')}
          title={t('Close (Escape)')}
          onClick={onClose}
        >
          <DismissIcon />
        </button>
      </div>
      <ul className="viewer-scenario-list">
        {project.scenarios.map((scenario) => (
          <li key={scenario.id}>
            <button
              type="button"
              className="viewer-scenario"
              aria-current={scenario.id === open ? 'true' : undefined}
              onClick={() => onOpen(scenario.id)}
            >
              <span className="viewer-scenario-name">{scenario.name}</span>
              <span className="viewer-scenario-detail">
                {t(STEPS_OVER, {
                  count: scenario.steps.length,
                  view: viewNames.get(scenario.view) ?? scenario.view,
                })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface PlaybackBarProps {
  session: PlaybackSession;
  scenario: ScenarioFile;
  timeline: Timeline;
  /** Whether the scenario's view is the one open, which it plays over. */
  active: boolean;
  viewName: string;
  onOpenView: () => void;
}

/** The scenario open: play and pause, the previous and next steps, the speed, and the step. */
export function PlaybackBar({
  session,
  scenario,
  timeline,
  active,
  viewName,
  onOpenView,
}: PlaybackBarProps) {
  const t = useT();
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const speedId = useId();
  const [showData, setShowData] = useState(false);
  const at = timeline.steps === 0 ? undefined : entryOfStep(timeline, state.step);
  const entry = at === undefined ? undefined : timeline.entries[at];
  const finished = session.finished;
  // The decisions playback meets now, chosen here as in the app's panel (ADR 0078).
  const decided = hasDecisions(scenario);
  const last = active && decided ? lastStepOf(timeline, state.step) : undefined;
  const met = useMemo(
    () => (last === undefined ? [] : decisionsAt(scenario, last, state.choices)),
    [scenario, last, state.choices],
  );
  return (
    <section
      className="viewer-sheet viewer-playback"
      aria-label={t('Scenario “{name}”', { name: scenario.name })}
    >
      <div className="viewer-sheet-head">
        <h2>{scenario.name}</h2>
        <button
          type="button"
          className="viewer-dismiss"
          aria-label={t('Close the scenario')}
          title={t('Close the scenario')}
          onClick={() => session.close()}
        >
          <DismissIcon />
        </button>
      </div>
      {!active ? (
        <p className="viewer-note">
          {t('It plays over “{view}”.', { view: viewName })}{' '}
          <button type="button" className="viewer-button" onClick={onOpenView}>
            {t('Open “{view}”', { view: viewName })}
          </button>
        </p>
      ) : (
        <>
          <div className="viewer-transport" role="group" aria-label={t('Playback')}>
            <button
              type="button"
              className="viewer-button"
              aria-label={t('Previous')}
              title={t('Previous')}
              disabled={at === undefined || at === 0}
              onClick={() => session.previous()}
            >
              <PreviousIcon />
            </button>
            <button
              type="button"
              className="viewer-button viewer-button-primary"
              disabled={timeline.steps === 0}
              onClick={() => session.toggle()}
            >
              {state.mode === 'playing' ? <PauseIcon /> : <PlayIcon />}
              <span>
                {state.mode === 'playing' ? t('Pause') : finished ? t('Play again') : t('Play')}
              </span>
            </button>
            <button
              type="button"
              className="viewer-button"
              aria-label={t('Next')}
              title={t('Next')}
              disabled={at === undefined || at >= timeline.entries.length - 1}
              onClick={() => session.next()}
            >
              <NextIcon />
            </button>
            <span className="viewer-position" aria-live="polite">
              {positionOf(t, entry, timeline)}
            </span>
            <label htmlFor={speedId} className="viewer-speed">
              {t('Speed')}
            </label>
            <select
              id={speedId}
              value={state.speed}
              onChange={(event) => session.setSpeed(Number(event.target.value) as Speed)}
            >
              {SPEEDS.map((speed) => (
                <option key={speed} value={speed}>
                  {`${speed}×`}
                </option>
              ))}
            </select>
            {decided && (
              <label className="viewer-speed">
                <input
                  type="checkbox"
                  checked={state.stopAtDecisions}
                  onChange={(event) => session.setStopAtDecisions(event.target.checked)}
                />{' '}
                {t('Stop at each decision')}
              </label>
            )}
          </div>
          <DecisionCard
            decisions={met}
            onChoose={(chosen) => session.choose(chosen)}
            onPreview={(chosen) => session.preview(chosen)}
          />
          {entry && (
            <StepText
              scenario={scenario}
              entry={entry}
              showData={showData}
              onShowData={setShowData}
            />
          )}
        </>
      )}
    </section>
  );
}

/** What the step playback is on says: its description, whether it is broken, and its data. */
function StepText({
  scenario,
  entry,
  showData,
  onShowData,
}: {
  scenario: ScenarioFile;
  entry: TimelineEntry;
  showData: boolean;
  onShowData: (shown: boolean) => void;
}) {
  const t = useT();
  const { project } = useEditor();
  if (entry.kind === 'aggregated') {
    const container = project.model.elements.find((each) => each.id === entry.container);
    return (
      <p className="viewer-step">
        {t(
          {
            one: '{count} step inside “{container}”, which this view shows collapsed.',
            other: '{count} steps inside “{container}”, which this view shows collapsed.',
          },
          { count: entry.count, container: container?.name ?? entry.container },
        )}
      </p>
    );
  }
  const step = scenario.steps[entry.first];
  if (!step) return null;
  const data = [
    ...(step.dataIn === undefined ? [] : [{ name: t('Takes in'), value: step.dataIn }]),
    ...(step.dataOut === undefined ? [] : [{ name: t('Produces'), value: step.dataOut }]),
  ];
  return (
    <div className="viewer-step">
      {step.description !== '' && <p>{step.description}</p>}
      {isBroken(entry) && (
        <p className="viewer-note">
          {t('A relation of this step is no longer in the model, so this step is broken.')}
        </p>
      )}
      {data.length > 0 && (
        <>
          <button
            type="button"
            className="viewer-button"
            aria-expanded={showData}
            onClick={() => onShowData(!showData)}
          >
            {showData ? t('Hide the data') : t('Show the data')}
          </button>
          {showData && (
            <dl className="viewer-data">
              {data.map(({ name, value }) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>
                    <pre>{jsonText(value)}</pre>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </div>
  );
}

function jsonText(value: JsonValue): string {
  return JSON.stringify(value, null, 2);
}

function positionOf(t: Translator, entry: TimelineEntry | undefined, timeline: Timeline): string {
  if (!entry) return t('No steps yet');
  if (entry.count === 1) {
    return t('Step {n} of {total}', { n: entry.first + 1, total: timeline.steps });
  }
  return t('Steps {first}–{last} of {total}', {
    first: entry.first + 1,
    last: entry.first + entry.count,
    total: timeline.steps,
  });
}
