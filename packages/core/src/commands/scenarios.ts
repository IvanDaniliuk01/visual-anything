/** Commands on scenarios. */
import type { Id, ScenarioFile, Step } from '@visual-anything/schema';
import { slug } from '../ids';
import { compact, reject, requireList, requireName, type Draft } from './draft';
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
  const created: ScenarioFile = compact({
    id,
    name,
    description: scenario.description,
    view: view.id,
    steps: checkedSteps(draft, requireList(scenario.steps, 'steps'), []),
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
    next.steps = checkedSteps(draft, requireList(changes.steps, 'steps'), current.steps);
  }
  draft.apply({ op: 'replace', collection: { name: 'scenarios' }, item: next });
  return `Edit the scenario "${next.name}"`;
}

export function deleteScenario(draft: Draft, command: DeleteScenarioCommand): string {
  const scenario = draft.scenario(command.id);
  draft.apply({ op: 'remove', collection: { name: 'scenarios' }, key: scenario.id });
  return `Delete the scenario "${scenario.name}"`;
}

/**
 * Checks the steps of a scenario. A step activates at least one relation, each one once, and every
 * relation must exist, except in a step kept exactly as it was: a broken step stays until it is fixed.
 */
function checkedSteps(draft: Draft, steps: readonly NewStep[], before: readonly Step[]): Step[] {
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
    return compact({
      id,
      description: step.description,
      relations: [...relations],
      dataIn: step.dataIn,
      dataOut: step.dataOut,
    });
  });
}
