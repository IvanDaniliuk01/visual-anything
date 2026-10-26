/**
 * What a scenario plays, step by step, over its view as the view is now. Consecutive steps that happen
 * entirely inside a collapsed container play as one aggregated step; expanding the container plays
 * them one by one again. A broken step always plays on its own, so that it shows and can be fixed.
 * A step whose relations are all out of the scope of its view is outside the view (ADR-0040), as is one
 * whose relations are all of relation types the view leaves out (ADR 0064): it plays on its own too,
 * saying so, and is not a broken step.
 * The timeline is worked out from the files and never stored: playing changes nothing.
 */
import type { Id, ScenarioFile, Step, ViewFile } from '@visual-anything/schema';
import { showsPart, shownByScope, type ShownByScope } from '../scope';
import type { ProjectSnapshot } from '../snapshot';
import { modelIndexOf } from '../state';
import { collapsedIn, containmentInView, endsOf } from './containment';

/** One step of the scenario, played on its own. */
export interface TimelineStep {
  kind: 'step';
  /** Where the step is among the scenario's steps, from 0. */
  first: number;
  count: 1;
  /** The step's id. */
  steps: [Id];
  /** The relations it activates that are in the model, in the step's order. */
  relations: Id[];
  /** The relations it activates that are not: a step with any of them is a broken step. */
  missing: Id[];
  /**
   * Present on a step outside the view: every relation it activates is in the model, and the view it
   * plays over shows none of them, through its scope or the relation types it leaves out (ADR-0040,
   * ADR 0064).
   */
  outside?: true;
}

/** Consecutive steps that happen entirely inside a collapsed container, played as one. */
export interface TimelineAggregate {
  kind: 'aggregated';
  /** Where the first of them is among the scenario's steps, from 0. */
  first: number;
  /** How many steps it stands for. */
  count: number;
  /** Their ids, in order. */
  steps: Id[];
  /** The collapsed container they happen inside, as the view draws it. */
  container: Id;
  /** Every relation they activate, each once, in order. */
  relations: Id[];
}

export type TimelineEntry = TimelineStep | TimelineAggregate;

/** A scenario as it plays over its view now. */
export interface Timeline {
  /** What plays, in order: each step of the scenario is in exactly one entry. */
  entries: TimelineEntry[];
  /** For each step of the scenario, by its index, the index of the entry that plays it. */
  entryOf: number[];
  /** How many steps the scenario has. */
  steps: number;
}

/** Whether an entry is a broken step: one that uses a relation that no longer exists. */
export function isBroken(entry: TimelineEntry): boolean {
  return entry.kind === 'step' && entry.missing.length > 0;
}

/** Whether an entry is a step outside the view: the view's scope shows none of its relations. */
export function isOutside(entry: TimelineEntry): boolean {
  return entry.kind === 'step' && entry.outside === true;
}

/**
 * What a scenario plays over a view, by default its own. A run of consecutive steps becomes one
 * aggregated step when every relation of each is in the model and every element those relations end
 * on, directly or through a relation they end on, sits inside the same collapsed container, at any
 * depth. The container is the outermost such one, which the view draws; when an element's several
 * containers leave a choice, the first in model order.
 */
export function scenarioTimeline(
  project: ProjectSnapshot,
  scenario: ScenarioFile,
  view: ViewFile | undefined = project.views.find((each) => each.id === scenario.view),
): Timeline {
  const index = modelIndexOf(project);
  // A view with a scope, or one that leaves out relation types, may not draw a step (ADR-0040, ADR 0064).
  const shown = view === undefined || !showsPart(view) ? undefined : shownByScope(project, view);
  const insideOf = view ? containerFinder(project, view, shown) : () => undefined;
  const entries: TimelineEntry[] = [];
  const entryOf: number[] = [];

  scenario.steps.forEach((step, at) => {
    const relations = step.relations.filter((id) => index.relation(id) !== undefined);
    const missing = step.relations.filter((id) => index.relation(id) === undefined);
    // Only a step whose every relation the view shows can happen inside a container it draws.
    const showing = shown === undefined ? relations : relations.filter((id) => shown.relation(id));
    const outside = missing.length === 0 && relations.length > 0 && showing.length === 0;
    const container =
      missing.length === 0 && showing.length === relations.length ? insideOf(step) : undefined;
    const last = entries.at(-1);
    if (container !== undefined && last?.kind === 'aggregated' && last.container === container) {
      last.count += 1;
      last.steps.push(step.id);
      for (const relation of relations) {
        if (!last.relations.includes(relation)) last.relations.push(relation);
      }
    } else if (container !== undefined) {
      entries.push({
        kind: 'aggregated',
        first: at,
        count: 1,
        steps: [step.id],
        container,
        relations: [...new Set(relations)],
      });
    } else {
      entries.push({
        kind: 'step',
        first: at,
        count: 1,
        steps: [step.id],
        relations,
        missing,
        ...(outside ? { outside: true as const } : {}),
      });
    }
    entryOf.push(entries.length - 1);
  });

  return { entries, entryOf, steps: scenario.steps.length };
}

/**
 * The index of the entry that plays the step at this index, the nearest one for an index outside the
 * steps; undefined when the scenario has none.
 */
export function entryOfStep(timeline: Timeline, step: number): number | undefined {
  if (timeline.steps === 0) return undefined;
  const at = Math.min(Math.max(Math.trunc(step) || 0, 0), timeline.steps - 1);
  return timeline.entryOf[at];
}

/** A broken step of a scenario: its id, where it is, and the relations it uses that no longer exist. */
export interface BrokenStep {
  step: Id;
  index: number;
  missing: Id[];
}

/** The broken steps of a scenario, in order. */
export function brokenStepsOf(project: ProjectSnapshot, scenario: ScenarioFile): BrokenStep[] {
  const index = modelIndexOf(project);
  return scenario.steps.flatMap((step, at) => {
    const missing = step.relations.filter((id) => index.relation(id) === undefined);
    return missing.length > 0 ? [{ step: step.id, index: at, missing }] : [];
  });
}

/**
 * Finds the collapsed container a step happens entirely inside, in a view: the outermost of those
 * holding every element its relations reach, or undefined. A container the view's scope leaves out is
 * not drawn, so nothing happens inside it there.
 */
function containerFinder(
  project: ProjectSnapshot,
  view: ViewFile,
  shown: ShownByScope | undefined,
): (step: Step) => Id | undefined {
  const listed = collapsedIn(project, view);
  const collapsed =
    shown === undefined ? listed : new Set([...listed].filter((id) => shown.element(id)));
  if (collapsed.size === 0) return () => undefined;
  const containment = containmentInView(project, view);
  const order = new Map(project.model.elements.map((element, at) => [element.id, at]));
  return (step) => {
    let candidates: Id[] | undefined;
    for (const relation of step.relations) {
      const ends = endsOf(project, relation);
      if (ends.length === 0) return undefined;
      for (const end of ends) {
        const around = containment.enclosing(end);
        candidates = (candidates ?? [...collapsed]).filter((container) => around.has(container));
        if (candidates.length === 0) return undefined;
      }
    }
    if (!candidates) return undefined;
    // The outermost: a candidate that sits inside no other candidate.
    const outermost = candidates.filter(
      (container) =>
        !candidates.some(
          (other) => other !== container && containment.enclosing(container).has(other),
        ),
    );
    const pool = outermost.length > 0 ? outermost : candidates;
    return pool.reduce((best, each) =>
      (order.get(each) ?? Infinity) < (order.get(best) ?? Infinity) ? each : best,
    );
  };
}
