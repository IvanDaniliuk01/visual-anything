/**
 * Editing a scenario's decisions (ADR 0078), as recording and Claude's tools do: adding an
 * alternative after a step, rejoining the common steps after a decision, and taking a decision away.
 * Each function takes the scenario and gives the steps and decisions to send in their place with
 * `update-scenario`; every step it does not change is kept exactly, id included, so that a broken step
 * stays as it was.
 */
import type { Alternative, DecisionBlock, Id, ScenarioFile } from '@visual-anything/schema';
import type { NewStep } from '../commands/types';
import { chosenAlternative, readBlocks, type DecisionSpan } from './blocks';

/** What to send with `update-scenario`: the steps, and the decisions, `null` for none. */
export interface EditedDecisions {
  steps: NewStep[];
  blocks: DecisionBlock[] | null;
}

/** The ids and words of an alternative added after a step. */
export interface NewAlternative {
  /** The step recorded first in the alternative; it carries its own new id. */
  step: NewStep & { id: Id };
  /** The new alternative's id and label. */
  alternative: { id: Id; label: string };
  /**
   * For a new decision: its id and question, and the id and label of the alternative that keeps the
   * steps that followed.
   */
  decision: { id: Id; question: string; kept: { id: Id; label: string } };
}

/**
 * Adds an alternative after a step, as recording's "Add an alternative here" does with its first
 * click. When a decision starts right after the step, in the same stretch, the alternative joins it,
 * last. Otherwise a new decision starts after the step: its first alternative keeps the steps that
 * followed, to the end of the stretch the step is in, and its second holds the step recorded.
 * Undefined for a step the scenario does not have, or decisions that do not hold together.
 */
export function addAlternativeAfter(
  scenario: ScenarioFile,
  after: Id,
  added: NewAlternative,
): EditedDecisions | undefined {
  const read = readBlocks(scenario);
  const at = scenario.steps.findIndex((step) => step.id === after);
  if (!read.ok || at < 0) return undefined;
  const blocks = (scenario.blocks ?? []).map(copy);
  const stretch = stretchOf(read.decisions, at, scenario.steps.length);
  const starting = read.decisions.find(
    (span) => span.first === at + 1 && sameWithin(span.within, stretch.within),
  );
  const steps: NewStep[] = [...scenario.steps];
  if (starting) {
    const decision = blocks.find((block) => block.id === starting.decision.id) as DecisionBlock;
    decision.alternatives.push({ ...added.alternative, steps: [added.step.id] });
    steps.splice(starting.last + 1, 0, added.step);
    return { steps, blocks };
  }
  const followed = scenario.steps.slice(at + 1, stretch.last + 1).map((step) => step.id);
  // The decisions among the steps that followed now sit in the alternative that keeps them.
  blocks.push({
    id: added.decision.id,
    kind: 'decision',
    question: added.decision.question,
    alternatives: [
      { ...added.decision.kept, steps: followed },
      { ...added.alternative, steps: [added.step.id] },
    ],
  });
  steps.splice(stretch.last + 1, 0, added.step);
  return { steps, blocks };
}

/**
 * Rejoins at a step of an alternative, as recording's "Rejoin here": that step and the ones after it
 * in its alternative leave the decision and become the steps that follow it, whichever way it went.
 * Undefined for a step in no alternative.
 */
export function rejoinAt(scenario: ScenarioFile, step: Id): EditedDecisions | undefined {
  const read = readBlocks(scenario);
  const at = scenario.steps.findIndex((each) => each.id === step);
  if (!read.ok || at < 0) return undefined;
  const span = innermost(read.decisions, at);
  if (!span) return undefined;
  const holder = span.alternatives.find(
    (each) =>
      each.first !== undefined && each.last !== undefined && each.first <= at && at <= each.last,
  );
  if (holder?.last === undefined) return undefined;
  const leaving = scenario.steps.slice(at, holder.last + 1);
  const leavingIds = new Set(leaving.map((each) => each.id));
  const steps: NewStep[] = scenario.steps.filter((each) => !leavingIds.has(each.id));
  // After the decision's last step, which moved up by as many steps as left.
  steps.splice(span.last + 1 - leaving.length, 0, ...leaving);
  const blocks = (scenario.blocks ?? []).map(copy).map((block) =>
    block.id === span.decision.id
      ? {
          ...block,
          alternatives: block.alternatives.map((alternative) =>
            alternative.id === holder.alternative.id
              ? { ...alternative, steps: alternative.steps.filter((id) => !leavingIds.has(id)) }
              : alternative,
          ),
        }
      : block,
  );
  return finished(steps, blocks);
}

/**
 * Takes a decision away, keeping the steps of the alternative it plays by default in the sequence and
 * taking out the steps of its others, with the decisions inside them. Taking steps out deletes them,
 * which the person sees in a preview first. Undefined for a decision the scenario does not have.
 */
export function removeDecision(scenario: ScenarioFile, decision: Id): EditedDecisions | undefined {
  const read = readBlocks(scenario);
  if (!read.ok) return undefined;
  const span = read.decisions.find((each) => each.decision.id === decision);
  if (!span) return undefined;
  const kept = chosenAlternative(span.decision, undefined);
  const gone = new Set<Id>();
  for (const { alternative } of span.alternatives) {
    if (alternative !== kept) for (const id of alternative.steps) gone.add(id);
  }
  const steps: NewStep[] = scenario.steps.filter((step) => !gone.has(step.id));
  const blocks = (scenario.blocks ?? [])
    .filter((block) => block.id !== decision)
    .map(copy)
    .map((block) => ({
      ...block,
      alternatives: block.alternatives.map((alternative) => ({
        ...alternative,
        steps: alternative.steps.filter((id) => !gone.has(id)),
      })),
    }));
  return finished(steps, blocks);
}

/** The steps a decision's removal would take out, for its preview. */
export function stepsRemovedWith(scenario: ScenarioFile, decision: Id): Id[] {
  const edited = removeDecision(scenario, decision);
  if (!edited) return [];
  const left = new Set(edited.steps.map((step) => step.id));
  return scenario.steps.filter((step) => !left.has(step.id)).map((step) => step.id);
}

/** Decisions without any that are left with no steps, or `null` for none at all. */
function finished(steps: NewStep[], blocks: DecisionBlock[]): EditedDecisions {
  const left = blocks.filter((block) =>
    block.alternatives.some((alternative) => alternative.steps.length > 0),
  );
  return { steps, blocks: left.length > 0 ? left : null };
}

function copy(block: DecisionBlock): DecisionBlock {
  return {
    ...block,
    alternatives: block.alternatives.map((alternative): Alternative => ({
      ...alternative,
      steps: [...alternative.steps],
    })),
  };
}

/** The innermost decision whose alternatives hold a step. */
function innermost(decisions: readonly DecisionSpan[], at: number): DecisionSpan | undefined {
  let found: DecisionSpan | undefined;
  for (const span of decisions) {
    const holds = span.alternatives.some(
      (each) =>
        each.first !== undefined && each.last !== undefined && each.first <= at && at <= each.last,
    );
    if (holds && (found === undefined || span.depth > found.depth)) found = span;
  }
  return found;
}

/** The stretch a step sits in: the innermost alternative holding it, or the whole scenario. */
function stretchOf(
  decisions: readonly DecisionSpan[],
  at: number,
  count: number,
): { last: number; within?: { decision: Id; alternative: Id } } {
  const span = innermost(decisions, at);
  if (!span) return { last: count - 1 };
  const holder = span.alternatives.find(
    (each) =>
      each.first !== undefined && each.last !== undefined && each.first <= at && at <= each.last,
  );
  return {
    last: holder?.last ?? count - 1,
    within: { decision: span.decision.id, alternative: holder?.alternative.id ?? '' },
  };
}

function sameWithin(
  a: { decision: Id; alternative: Id } | undefined,
  b: { decision: Id; alternative: Id } | undefined,
): boolean {
  return a?.decision === b?.decision && a?.alternative === b?.alternative;
}
