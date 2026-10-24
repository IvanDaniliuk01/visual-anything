/**
 * Recording a scenario on the canvas, and editing its steps. Each function takes a scenario's steps and
 * gives the steps to send in their place with `update-scenario`: every step it does not change is
 * kept exactly, id included, so that a broken step stays as it was until it is fixed.
 *
 * The core accepts a broken step only unchanged, so any change to a step's relations also leaves out
 * the ones that no longer exist: adding a relation to a broken step, or taking one out, fixes it.
 */
import type { Id, JsonValue } from '@visual-anything/schema';
import type { NewStep } from '../commands/types';

/** A click on a relation while recording. */
export interface RecordClick {
  relation: Id;
  /** Shift was held: the relation happens at the same time as the current step's. */
  simultaneous: boolean;
  /** The index of the current step; by default the last. */
  at?: number;
}

/** What a click recorded. */
export interface Recorded {
  /** The steps to send in place of the scenario's. */
  steps: NewStep[];
  /** The index of the step the click recorded into, which is the current step from then on. */
  at: number;
  /**
   * `new-step`: a step after the current one, activating the relation; `added` and `removed`: the
   * relation joined or left the current step; `unchanged`: it was the current step's only relation.
   */
  change: 'new-step' | 'added' | 'removed' | 'unchanged';
}

/**
 * Records a click on a relation. A click adds a step after the current one, so clicking relations in
 * order records them in order. A click with Shift adds the relation to the current step, or takes it
 * out when it is there already, unless it is the step's only one; with no step yet it starts the
 * first. `exists` says whether a relation is in the model.
 */
export function recordRelation(
  steps: readonly NewStep[],
  click: RecordClick,
  exists: (relation: Id) => boolean,
): Recorded {
  const at = currentIndex(steps, click.at);
  const current = at === undefined ? undefined : steps[at];
  if (!click.simultaneous || at === undefined || !current) {
    const after = at === undefined ? 0 : at + 1;
    const added: NewStep = { description: '', relations: [click.relation] };
    return {
      steps: [...steps.slice(0, after), added, ...steps.slice(after)],
      at: after,
      change: 'new-step',
    };
  }
  if (current.relations.includes(click.relation)) {
    const left = current.relations.filter((id) => id !== click.relation && exists(id));
    if (left.length === 0) return { steps: [...steps], at, change: 'unchanged' };
    return { steps: replaced(steps, at, { ...current, relations: left }), at, change: 'removed' };
  }
  const joined = [...current.relations.filter(exists), click.relation];
  return { steps: replaced(steps, at, { ...current, relations: joined }), at, change: 'added' };
}

/** The steps with one step's description changed. */
export function describeStep(
  steps: readonly NewStep[],
  at: number,
  description: string,
): NewStep[] {
  const step = steps[at];
  return step ? replaced(steps, at, { ...step, description }) : [...steps];
}

/** The steps with what one step takes in, or produces, changed; undefined takes it away. */
export function setStepData(
  steps: readonly NewStep[],
  at: number,
  which: 'dataIn' | 'dataOut',
  value: JsonValue | undefined,
): NewStep[] {
  const step = steps[at];
  if (!step) return [...steps];
  const changed: NewStep = { ...step };
  if (value === undefined) delete changed[which];
  else changed[which] = value;
  return replaced(steps, at, changed);
}

/**
 * The steps with a relation taken out of one step, and with it any the step uses that no longer
 * exist; undefined when that would leave the step with none, or there is no such step.
 */
export function takeOutOfStep(
  steps: readonly NewStep[],
  at: number,
  relation: Id,
  exists: (relation: Id) => boolean,
): NewStep[] | undefined {
  const step = steps[at];
  if (!step) return undefined;
  const left = step.relations.filter((id) => id !== relation && exists(id));
  return left.length === 0 ? undefined : replaced(steps, at, { ...step, relations: left });
}

/**
 * Fixes a broken step: the relations it uses that no longer exist leave it, and `by`, when given,
 * joins it in their place. Undefined when that would leave the step with none, or there is no such
 * step.
 */
export function repairStep(
  steps: readonly NewStep[],
  at: number,
  exists: (relation: Id) => boolean,
  by?: Id,
): NewStep[] | undefined {
  const step = steps[at];
  if (!step) return undefined;
  const left = step.relations.filter(exists);
  const relations = by === undefined || left.includes(by) ? left : [...left, by];
  return relations.length === 0 ? undefined : replaced(steps, at, { ...step, relations });
}

/** The steps with one moved to another place, the nearest one for a place outside them. */
export function moveStep(steps: readonly NewStep[], from: number, to: number): NewStep[] {
  const step = steps[from];
  if (!step) return [...steps];
  const rest = steps.filter((_, position) => position !== from);
  const place = Math.min(Math.max(Math.trunc(to) || 0, 0), rest.length);
  return [...rest.slice(0, place), step, ...rest.slice(place)];
}

/** The steps without one. */
export function deleteStep(steps: readonly NewStep[], at: number): NewStep[] {
  return steps.filter((_, position) => position !== at);
}

function currentIndex(steps: readonly NewStep[], at: number | undefined): number | undefined {
  if (steps.length === 0) return undefined;
  if (at === undefined || !Number.isFinite(at)) return steps.length - 1;
  return Math.min(Math.max(Math.trunc(at), 0), steps.length - 1);
}

function replaced(steps: readonly NewStep[], at: number, step: NewStep): NewStep[] {
  return steps.map((each, position) => (position === at ? step : each));
}
