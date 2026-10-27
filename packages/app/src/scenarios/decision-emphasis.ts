/**
 * What a decision shows on the canvas while playback meets it (ADR 0078): the relations that only its
 * alternatives not chosen use, drawn dimmed and dashed, never hidden; and the alternative pointed at
 * on the decision card or in the steps' list, whose relations are previewed, drawn in full but still
 * dashed. The sets hold at most the scenario's relations, and change only with the step, the choices
 * or what is pointed at, never on each frame.
 */
import {
  chosenAlternative,
  entryOfStep,
  modelIndexOf,
  playedSteps,
  readBlocks,
  type ProjectSnapshot,
  type Timeline,
} from '@visual-anything/core';
import type { DecisionChoices, Id, ScenarioFile } from '@visual-anything/schema';
import type { Emphasis } from '../editor/emphasis';
import type { Chosen } from './choosing';

/**
 * The emphasis of the decisions met, by their ids, and of the alternative previewed: what only their
 * alternatives not chosen use is dimmed and dashed, the previewed one's dashed alone. None when
 * nothing is aside.
 */
export function decisionEmphasis(
  project: ProjectSnapshot,
  scenario: ScenarioFile,
  choices: DecisionChoices,
  met: readonly Id[],
  previewing: Chosen | undefined,
): Emphasis | undefined {
  const read = readBlocks(scenario);
  if (!read.ok || read.decisions.length === 0) return undefined;
  const asked = new Set(met);
  if (previewing) asked.add(previewing.decision);
  if (asked.size === 0) return undefined;
  const index = modelIndexOf(project);
  const byId = new Map(scenario.steps.map((step) => [step.id, step]));
  const playing = new Set<Id>();
  for (const at of playedSteps(scenario, choices)) {
    for (const relation of scenario.steps[at]?.relations ?? []) playing.add(relation);
  }
  const usedBy = (steps: readonly Id[]): Id[] =>
    steps.flatMap((id) =>
      (byId.get(id)?.relations ?? []).filter(
        (relation) => !playing.has(relation) && index.relation(relation) !== undefined,
      ),
    );
  const dashed = new Set<Id>();
  const previewed = new Set<Id>();
  for (const span of read.decisions) {
    if (!asked.has(span.decision.id)) continue;
    const chosen = chosenAlternative(span.decision, choices);
    for (const { alternative } of span.alternatives) {
      if (alternative === chosen) continue;
      const aside = usedBy(alternative.steps);
      for (const relation of aside) dashed.add(relation);
      const pointed =
        previewing?.decision === span.decision.id && previewing.alternative === alternative.id;
      if (pointed) for (const relation of aside) previewed.add(relation);
    }
  }
  if (dashed.size === 0) return undefined;
  const dimmed = new Set([...dashed].filter((relation) => !previewed.has(relation)));
  return { dashed, ...(dimmed.size > 0 ? { dimmed } : {}) };
}

/**
 * The last step of the timeline entry playback is on, by the step it is on: an aggregated step meets
 * the decisions that come after its last step.
 */
export function lastStepOf(timeline: Timeline, step: number): number | undefined {
  const at = entryOfStep(timeline, step);
  const entry = at === undefined ? undefined : timeline.entries[at];
  return entry ? entry.first + entry.count - 1 : undefined;
}
