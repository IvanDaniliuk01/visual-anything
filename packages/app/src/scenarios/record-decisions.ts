/**
 * Recording a scenario with decisions (ADR 0078): where the next click puts its step, and what it
 * sends. A click records after the current step, in the alternatives that hold it; once recording
 * ends an alternative, after that decision; and once Add an alternative here is asked, as the first
 * step of the new alternative, which its click creates with it. Each click is one `update-scenario`,
 * which the core's editing helpers work out, so that every step it does not change stays as it was.
 */
import {
  addAlternativeAfter,
  alternativeOf,
  freshId,
  insertStep,
  modelIndexOf,
  randomIds,
  readBlocks,
  slug,
  type Command,
  type EditedDecisions,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, ScenarioFile } from '@visual-anything/schema';
import { fill } from '../i18n/translate';
import type { Chosen } from './choosing';
import { stepOf } from './commands';

/** The words of an alternative being added: its label, and a new decision's question and first label. */
export interface AlternativeWords {
  label: string;
  /** For a new decision: its question. */
  question: string;
  /** For a new decision: the label of the alternative that keeps the steps that followed. */
  kept: string;
}

/**
 * Where the next step recorded goes: after the current step, in the alternatives holding it; after a
 * decision, once recording ended an alternative of it; or as the first step of an alternative being
 * added after a step, by its index.
 */
export type RecordingPlace =
  | { kind: 'after-step' }
  | { kind: 'after-decision'; decision: Id }
  | { kind: 'new-alternative'; after: number; words: AlternativeWords };

/**
 * What a click records: the command, where its step goes, and the alternative it created, if any; or
 * why the decisions would not hold together, in the core's words, when nothing can be recorded there.
 */
export type RecordedInDecisions =
  | {
      command: Command;
      /** The index of the step recorded. */
      at: number;
      /** The new alternative the step is the first of, which recording chooses so that it plays. */
      created?: Chosen;
    }
  | { refused: string };

/**
 * The decision an alternative added after a step joins: the one that starts right after it, in the
 * alternative it is in; none when the alternative starts a new decision.
 */
export function decisionRightAfter(
  scenario: Pick<ScenarioFile, 'steps' | 'blocks'>,
  at: number,
): Id | undefined {
  const read = readBlocks(scenario);
  const step = scenario.steps[at];
  if (!read.ok || !step) return undefined;
  const within = alternativeOf(scenario, step.id);
  return read.decisions.find(
    (span) =>
      span.first === at + 1 &&
      span.within?.decision === within?.decision &&
      span.within?.alternative === within?.alternative,
  )?.decision.id;
}

/**
 * The innermost decision whose alternative holds a step, by the step's index: the one End the
 * alternative records after.
 */
export function decisionHolding(
  scenario: Pick<ScenarioFile, 'steps' | 'blocks'>,
  at: number,
): Id | undefined {
  const step = scenario.steps[at];
  return step ? alternativeOf(scenario, step.id)?.decision : undefined;
}

/**
 * Works out what a click on a relation records at a place, over a scenario that has decisions or
 * gets its first one now. Undefined when the place is no longer there.
 */
export function recordInDecisions(
  project: ProjectSnapshot,
  scenario: ScenarioFile,
  relation: Id,
  place: RecordingPlace,
  current: number,
): RecordedInDecisions | undefined {
  const taken = takenIn(project, scenario);
  const step = { id: freshId(randomIds(), 'step', taken), description: '', relations: [relation] };
  if (place.kind === 'new-alternative') {
    const after = scenario.steps[place.after];
    if (!after) return undefined;
    const joins = decisionRightAfter(scenario, place.after);
    const alternative = {
      id: freshId(randomIds(), slug(place.words.label, 'alternative'), taken),
      label: place.words.label,
    };
    const decision = joins ?? freshId(randomIds(), slug(place.words.question, 'decision'), taken);
    const edited = addAlternativeAfter(scenario, after.id, {
      step,
      alternative,
      decision: {
        id: decision,
        question: place.words.question,
        kept: {
          id: freshId(
            randomIds(),
            slug(place.words.kept, 'alternative'),
            (id) => taken(id) || id === alternative.id,
          ),
          label: place.words.kept,
        },
      },
    });
    if (!edited) return undefined;
    const refused = refusalOf(edited);
    if (refused !== undefined) return { refused };
    const label = joins
      ? fill('Add the alternative “{label}” after {step}', {
          label: alternative.label,
          step: stepOf(scenario, place.after),
        })
      : fill('Add the decision “{question}” after {step}', {
          question: place.words.question,
          step: stepOf(scenario, place.after),
        });
    return {
      command: decisionsCommand(scenario, edited, label),
      at: indexOf(edited, step.id),
      created: { decision, alternative: alternative.id },
    };
  }
  const after = scenario.steps[current];
  const edited =
    place.kind === 'after-decision'
      ? insertStep(scenario, step, { afterDecision: place.decision })
      : after && insertStep(scenario, step, { after: after.id });
  if (!edited) return undefined;
  const refused = refusalOf(edited);
  if (refused !== undefined) return { refused };
  return {
    command: decisionsCommand(
      scenario,
      edited,
      fill('Record {step}', { step: stepOf(scenario, edited.at) }),
    ),
    at: edited.at,
  };
}

/** Why an edit's decisions would not hold together, as the core would refuse it; none when they do. */
function refusalOf(edited: EditedDecisions): string | undefined {
  if (!edited.blocks) return undefined;
  const steps = edited.steps.map((step, at) => ({ ...step, id: step.id ?? `new-${at}` }));
  const read = readBlocks({ steps, blocks: edited.blocks });
  return read.ok ? undefined : read.message;
}

/** Changes a scenario's steps and decisions, as one action named `label`. */
export function decisionsCommand(
  scenario: ScenarioFile,
  edited: EditedDecisions,
  label: string,
): Command {
  return {
    type: 'batch',
    label,
    commands: [
      {
        type: 'update-scenario',
        id: scenario.id,
        changes: { steps: edited.steps, blocks: edited.blocks },
      },
    ],
  };
}

function indexOf(edited: EditedDecisions, id: Id): number {
  return edited.steps.findIndex((step) => step.id === id);
}

/** Whether an id is taken in the model or in the scenario, by a step, a decision or an alternative. */
function takenIn(project: ProjectSnapshot, scenario: ScenarioFile): (id: Id) => boolean {
  const index = modelIndexOf(project);
  const own = new Set<Id>([scenario.id]);
  for (const step of scenario.steps) own.add(step.id);
  for (const block of scenario.blocks ?? []) {
    own.add(block.id);
    for (const alternative of block.alternatives) own.add(alternative.id);
  }
  return (id) =>
    own.has(id) ||
    index.has(id) ||
    project.scenarios.some((each) => each.id === id) ||
    project.views.some((view) => view.id === id);
}
