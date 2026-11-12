/** Commands on scenarios, their steps and their decisions (ADR 0078). */
import type {
  Alternative,
  DecisionBlock,
  Id,
  ScenarioFile,
  Step,
  ViewFile,
} from '@visual-anything/schema';
import { isId, slug } from '../ids';
import { stepPicturesProblems } from '../media/steps';
import { readBlocks } from '../scenarios/blocks';
import { inReadingOrder } from '../scenarios/decisions';
import { compact, reject, requireList, requireName, sameJson, type Draft } from './draft';
import { checkedStepPictures } from './step-pictures';
import type {
  CreateScenarioCommand,
  DeleteScenarioCommand,
  NewStep,
  UpdateScenarioCommand,
} from './types';

export function createScenario(draft: Draft, command: CreateScenarioCommand): string {
  const { scenario } = command;
  const name = requireName(scenario.name, 'A scenario');
  const view = draft.view(scenario.view);
  const id = draft.idFor(scenario.id, slug(name, 'scenario'));
  const steps = checkedSteps(draft, requireList(scenario.steps, 'steps'), [], view);
  const created: ScenarioFile = compact({
    id,
    name,
    description: scenario.description,
    view: view.id,
    steps,
    blocks: checkedBlocks(scenario.blocks, steps, id),
  });
  draft.apply({
    op: 'insert',
    collection: { name: 'scenarios' },
    index: draft.state.scenarios.length,
    item: created,
  });
  draft.created.push(id);
  return `Create the scenario "${name}"`;
}

export function updateScenario(draft: Draft, command: UpdateScenarioCommand): string {
  const current = draft.scenario(command.id);
  const { changes } = command;
  const next: ScenarioFile = { ...current };
  if (changes.name !== undefined) next.name = requireName(changes.name, 'A scenario');
  if (changes.description === null) delete next.description;
  else if (changes.description !== undefined) next.description = changes.description;
  if (changes.view !== undefined) next.view = draft.view(changes.view).id;
  if (changes.steps !== undefined) {
    next.steps = checkedSteps(
      draft,
      requireList(changes.steps, 'steps'),
      current.steps,
      draft.view(next.view),
    );
  }
  // Decisions given replace them all; otherwise a change of steps keeps them, without the steps gone.
  const blocks =
    changes.blocks === null
      ? undefined
      : changes.blocks !== undefined
        ? checkedBlocks(changes.blocks, next.steps, current.id)
        : changes.steps !== undefined
          ? keptBlocks(current.blocks, next.steps, current.id)
          : current.blocks;
  if (blocks === undefined) delete next.blocks;
  else next.blocks = blocks;
  draft.apply({ op: 'replace', collection: { name: 'scenarios' }, item: next });
  return `Edit the scenario "${next.name}"`;
}

export function deleteScenario(draft: Draft, command: DeleteScenarioCommand): string {
  const scenario = draft.scenario(command.id);
  draft.apply({ op: 'remove', collection: { name: 'scenarios' }, key: scenario.id });
  return `Delete the scenario "${scenario.name}"`;
}

const MALFORMED =
  'A decision has an id, the kind "decision", a question, its alternatives and maybe a default; an alternative has an id, a label, its steps and maybe ends.';

/**
 * Checks a scenario's decisions given whole: their shape, and that they hold together over its steps
 * (ADR 0078). None given, or an empty list, is none.
 */
function checkedBlocks(
  blocks: readonly DecisionBlock[] | undefined,
  steps: readonly Step[],
  scenario: Id,
): DecisionBlock[] | undefined {
  if (blocks === undefined) return undefined;
  const list = requireList(blocks, 'The decisions of a scenario');
  if (list.length === 0) return undefined;
  const checked = list.map((block) => wellFormed(block));
  return holding(checked, steps, scenario);
}

/**
 * A scenario's decisions after its steps changed: without the steps gone, without a decision left
 * with none, and with each alternative's steps in the order the steps now have.
 */
function keptBlocks(
  blocks: readonly DecisionBlock[] | undefined,
  steps: readonly Step[],
  scenario: Id,
): DecisionBlock[] | undefined {
  if (blocks === undefined) return undefined;
  const ids = new Set(steps.map((step) => step.id));
  const kept = blocks
    .map((block) => ({
      ...block,
      alternatives: block.alternatives.map((alternative) => ({
        ...alternative,
        steps: alternative.steps.filter((step) => ids.has(step)),
      })),
    }))
    .filter((block) => block.alternatives.some((alternative) => alternative.steps.length > 0));
  if (kept.length === 0) return undefined;
  return holding(inReadingOrder(steps, kept), steps, scenario);
}

/** Decisions that hold together over the steps, or the refusal that says why not. */
function holding(blocks: DecisionBlock[], steps: readonly Step[], scenario: Id): DecisionBlock[] {
  const read = readBlocks({ steps: [...steps], blocks });
  if (!read.ok) reject('invalid-decision', read.message, [scenario]);
  return blocks;
}

/** A decision as a command gives it, checked for its shape and copied with only its own keys. */
function wellFormed(block: unknown): DecisionBlock {
  const malformed = (): never => reject('invalid-command', MALFORMED);
  if (typeof block !== 'object' || block === null || Array.isArray(block)) malformed();
  const {
    id,
    kind,
    question,
    alternatives,
    default: chosen,
    ...rest
  } = block as Record<string, unknown>;
  if (Object.keys(rest).length > 0 || kind !== 'decision' || !isId(id)) malformed();
  if (typeof question !== 'string' || question.trim() === '' || question.length > 200) malformed();
  if (!Array.isArray(alternatives) || alternatives.length < 2 || alternatives.length > 8) {
    malformed();
  }
  if (chosen !== undefined && !isId(chosen)) malformed();
  return compact({
    id: id as Id,
    kind: 'decision' as const,
    question: question as string,
    alternatives: (alternatives as unknown[]).map((alternative) =>
      wellFormedAlternative(alternative),
    ),
    default: chosen as Id | undefined,
  });
}

function wellFormedAlternative(alternative: unknown): Alternative {
  const malformed = (): never => reject('invalid-command', MALFORMED);
  if (typeof alternative !== 'object' || alternative === null || Array.isArray(alternative)) {
    malformed();
  }
  const { id, label, steps, ends, ...rest } = alternative as Record<string, unknown>;
  if (Object.keys(rest).length > 0 || !isId(id)) malformed();
  if (typeof label !== 'string' || label.trim() === '' || label.length > 200) malformed();
  if (!Array.isArray(steps) || steps.length > 10000 || !steps.every((step) => isId(step))) {
    malformed();
  }
  if (new Set(steps as Id[]).size !== (steps as Id[]).length) malformed();
  if (ends !== undefined && ends !== true) malformed();
  return compact({
    id: id as Id,
    label: label as string,
    steps: [...(steps as Id[])],
    ends: ends as true | undefined,
  });
}

/**
 * Checks the steps of a scenario. A step activates at least one relation, each one once, and every
 * relation must exist, except in a step kept exactly as it was: a broken step stays until it is fixed.
 * What it shows (ADR 0098, stage 4) must be pictures, videos and link cards of the scenario's view,
 * and what it plays videos among them, except in lists kept exactly as they were.
 */
function checkedSteps(
  draft: Draft,
  steps: readonly NewStep[],
  before: readonly Step[],
  view: ViewFile,
): Step[] {
  const previous = new Map(before.map((step) => [step.id, step]));
  const ids = new Set<Id>();
  return steps.map((step, position) => {
    const relations = requireList(step.relations, 'The relations of a step');
    if (relations.length === 0) {
      reject(
        'invalid-command',
        `Step ${position + 1} activates no relation; a step needs at least one.`,
      );
    }
    if (new Set(relations).size !== relations.length) {
      reject('invalid-command', `Step ${position + 1} lists the same relation twice.`);
    }
    const kept = step.id !== undefined ? previous.get(step.id) : undefined;
    const unchanged =
      kept !== undefined &&
      kept.relations.length === relations.length &&
      kept.relations.every((id, at) => id === relations[at]);
    if (!unchanged) {
      for (const id of relations) {
        if (!draft.index.relation(id)) {
          reject(
            'unknown-step-relation',
            `Step ${position + 1} uses "${id}", which is not a relation of the model.`,
            [id],
          );
        }
      }
    }
    const id =
      step.id !== undefined && previous.has(step.id) && !ids.has(step.id)
        ? step.id
        : draft.idFor(step.id, 'step', (each) => ids.has(each) || previous.has(each));
    ids.add(id);
    if (typeof step.description !== 'string') {
      reject('invalid-command', `Step ${position + 1} needs a description.`);
    }
    const pictures = checkedStepPictures(step, `Step ${position + 1}`);
    const keptPictures =
      kept !== undefined &&
      sameJson(pictures.shows, kept.shows) &&
      sameJson(pictures.playing, kept.playing);
    if (!keptPictures) {
      const [problem] = stepPicturesProblems(view, pictures);
      if (problem) {
        reject(problem.code, `Step ${position + 1}: ${problem.message}`, [problem.subject]);
      }
    }
    return compact({
      id,
      description: step.description,
      relations: [...relations],
      dataIn: step.dataIn,
      dataOut: step.dataOut,
      shows: pictures.shows,
      playing: pictures.playing,
    });
  });
}
