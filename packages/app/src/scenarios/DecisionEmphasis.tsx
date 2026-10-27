/**
 * Sets what the decisions playback meets show on the canvas, as the `decision` source of the emphasis
 * store (ADR 0078): what only their alternatives not chosen use, dimmed and dashed, and the
 * alternative pointed at, previewed. It renders only when the step, the choices or what is pointed at
 * change, never on each frame; it draws nothing itself.
 */
import { decisionsAt, type ProjectSnapshot, type Timeline } from '@visual-anything/core';
import type { ScenarioFile } from '@visual-anything/schema';
import { useMemo, useSyncExternalStore } from 'react';
import { useEmphasisSource } from '../editor/emphasis';
import { decisionEmphasis, lastStepOf } from './decision-emphasis';
import type { ScenarioState } from './session';

interface DecisionEmphasisProps {
  /** The app's scenario session, or the read-only page's playback. */
  session: { subscribe: (listener: () => void) => () => void; getState: () => ScenarioState };
  project: ProjectSnapshot;
  scenario: ScenarioFile | undefined;
  /** The scenario's timeline, while its view is the one open and drawn. */
  timeline: Timeline | undefined;
}

export function DecisionEmphasis({ session, project, scenario, timeline }: DecisionEmphasisProps) {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const { choices, previewing } = state;
  const last = timeline ? lastStepOf(timeline, state.step) : undefined;
  const met = useMemo(
    () =>
      scenario && last !== undefined
        ? decisionsAt(scenario, last, choices).map((each) => each.decision.id)
        : [],
    [scenario, last, choices],
  );
  const key = met.join('\u0000');
  const emphasis = useMemo(
    () =>
      scenario && timeline
        ? decisionEmphasis(
            project,
            scenario,
            choices,
            key === '' ? [] : key.split('\u0000'),
            previewing,
          )
        : undefined,
    [project, scenario, timeline, choices, key, previewing],
  );
  useEmphasisSource('decision', emphasis);
  return null;
}
