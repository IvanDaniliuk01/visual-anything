/**
 * A tour step's pulse (ADR 0084): a marker that travels along a chain of relations, one after the
 * other, to show what follows what within one step. A chain joins when the marker can run each
 * relation from the end of the one before that it reached, so that it never leaps; one that does not,
 * or that names a relation the step's view does not draw, is a step problem, kept and flagged as other
 * problems are. Pure.
 */
import type { Id, TourStep } from '@visual-anything/schema';
import { nestingTypesInView } from '../containers';
import { shownByScope } from '../scope';
import type { ProjectSnapshot } from '../snapshot';
import { modelIndexOf } from '../state';

/** The most relations a pulse's chain holds. */
export const MAX_PULSE_RELATIONS = 12;
/** How many times a pulse runs, at the least and the most; once when its step does not say. */
export const PULSE_REPEAT = { least: 1, most: 3 } as const;
/** How long the marker takes along each relation, in milliseconds. */
export const PULSE_TIME_PER_RELATION = 600;
/** How far apart the chain's relations are marked under reduced motion, in milliseconds. */
export const PULSE_REDUCED_STEP = 400;

/** A relation of a chain, by its ends. */
export interface ChainLink {
  id: Id;
  from: Id;
  to: Id;
}

/** One relation of a pulse as the marker runs it: from its `from` end to its `to`, or back. */
export interface PulseLeg {
  relation: Id;
  forward: boolean;
}

/**
 * Where a chain breaks: the index of the first relation the marker cannot run next, from the end of
 * the one before that it reached, or -1 when it runs them all, so that the chain joins. The marker
 * may start at either end of the first relation; when neither start runs them all, the break is
 * where the start that runs farther stops.
 */
export function chainBreak(links: readonly ChainLink[]): number {
  const first = links[0];
  if (first === undefined) return -1;
  const fromStart = runsUntil(links, first.from);
  if (fromStart < 0) return -1;
  const fromEnd = runsUntil(links, first.to);
  if (fromEnd < 0) return -1;
  return Math.max(fromStart, fromEnd);
}

/** The index of the first relation the marker cannot run when it starts at `start`, or -1. */
function runsUntil(links: readonly ChainLink[], start: Id): number {
  let at = start;
  for (let index = 0; index < links.length; index++) {
    const link = links[index] as ChainLink;
    if (at !== link.from && at !== link.to) return index;
    at = at === link.from ? link.to : link.from;
  }
  return -1;
}

/**
 * The relations in an order that joins them into a chain: the order given when it joins already,
 * otherwise a walk that runs each relation once; none when no order does, or past
 * {@link MAX_PULSE_RELATIONS}.
 *
 * Relations join in some order exactly when their ends are connected and at most two ends meet an
 * odd number of them, so anything else is refused at once, a star of more than two relations among
 * them. Otherwise the walk is Hierholzer's, in time linear in the relations: from an end that meets an
 * odd number of them when there is one, it follows relations not yet run, in the order given, and
 * splices in the loops it finds when it is stuck.
 */
export function chainOrder(links: readonly ChainLink[]): Id[] | undefined {
  if (links.length === 0 || links.length > MAX_PULSE_RELATIONS) return undefined;
  if (chainBreak(links) < 0) return links.map((link) => link.id);
  // The relations each end meets, in the order given; a relation from an end to itself meets it twice.
  const meets = new Map<Id, number[]>();
  links.forEach((link, index) => {
    for (const end of [link.from, link.to]) {
      const list = meets.get(end);
      if (list) list.push(index);
      else meets.set(end, [index]);
    }
  });
  const odd = [...meets].filter(([, met]) => met.length % 2 === 1).map(([end]) => end);
  if (odd.length > 2) return undefined;
  const first = links[0] as ChainLink;
  // Start at the odd end that the earliest relation given has, so that the walk keeps close to it.
  const start =
    odd.length === 0
      ? first.from
      : (links.flatMap((link) => [link.from, link.to]).find((end) => odd.includes(end)) as Id);
  const run = new Array<boolean>(links.length).fill(false);
  const next = new Map<Id, number>();
  const stack: { at: Id; by: number }[] = [{ at: start, by: -1 }];
  const walked: number[] = [];
  while (stack.length > 0) {
    const top = stack[stack.length - 1] as { at: Id; by: number };
    const met = meets.get(top.at) as number[];
    let cursor = next.get(top.at) ?? 0;
    while (cursor < met.length && run[met[cursor] as number]) cursor++;
    next.set(top.at, cursor);
    if (cursor < met.length) {
      const index = met[cursor] as number;
      const link = links[index] as ChainLink;
      run[index] = true;
      stack.push({ at: top.at === link.from ? link.to : link.from, by: index });
    } else {
      stack.pop();
      if (top.by >= 0) walked.push(top.by);
    }
  }
  // A walk that leaves relations unrun means their ends are not connected.
  if (walked.length !== links.length) return undefined;
  return walked.reverse().map((index) => (links[index] as ChainLink).id);
}

/**
 * Which way the marker runs each relation of a joined chain: from the end of the first at which it
 * runs them all, its `from` when both do, then each next one from the end it arrived at.
 */
export function pulseLegs(links: readonly ChainLink[]): PulseLeg[] {
  const first = links[0];
  if (first === undefined) return [];
  let at = runsUntil(links, first.from) < 0 ? first.from : first.to;
  return links.map((link) => {
    const forward = at === link.from;
    at = forward ? link.to : link.from;
    return { relation: link.id, forward };
  });
}

/**
 * How long a pulse takes: each relation {@link PULSE_TIME_PER_RELATION} ms, as many times as it
 * repeats; under reduced motion, each marked {@link PULSE_REDUCED_STEP} ms after the one before.
 */
export function pulseTimes(
  relations: number,
  repeat: number,
  reduced: boolean,
): { perRelation: number; total: number } {
  const perRelation = reduced ? PULSE_REDUCED_STEP : PULSE_TIME_PER_RELATION;
  return { perRelation, total: perRelation * relations * Math.max(1, repeat) };
}

/** What is wrong with a step's pulse, each with the relation it is about. */
export interface PulseProblem {
  message: string;
  subject: Id;
}

/**
 * What is wrong with a step's pulse: a relation the project does not hold, one its view does not draw
 * as a line, and the first place its chain does not join. Empty for a step without one, or with one
 * that plays as written.
 */
export function pulseProblems(
  project: ProjectSnapshot,
  step: Pick<TourStep, 'pulse' | 'viewState'>,
): PulseProblem[] {
  const pulse = step.pulse;
  if (!pulse) return [];
  const index = modelIndexOf(project);
  const view = project.views.find((each) => each.id === step.viewState.view);
  const shown = view ? shownByScope(project, view) : undefined;
  const nesting = new Set(view ? nestingTypesInView(project, view) : []);
  const problems: PulseProblem[] = [];
  const links: ChainLink[] = [];
  pulse.relations.forEach((id, at) => {
    const relation = index.relation(id);
    if (relation === undefined) {
      problems.push({
        message: `Relation ${at + 1} of the pulse, "${id}", is not a relation the project holds.`,
        subject: id,
      });
      return;
    }
    if (view && (!shown?.relation(id) || nesting.has(relation.relationType))) {
      problems.push({
        message: `The pulse runs along "${relation.name ?? id}", which the view "${view.name}" does not draw as a line.`,
        subject: id,
      });
    }
    links.push({ id, from: relation.from, to: relation.to });
  });
  // Where the relations it still holds do not join, when all are there to judge.
  if (links.length === pulse.relations.length) {
    const broken = chainBreak(links);
    if (broken > 0) {
      const one = links[broken - 1] as ChainLink;
      const two = links[broken] as ChainLink;
      problems.push({
        message: `The pulse is not a chain: relation ${broken + 1}, "${nameOf(project, two.id)}", does not start where relation ${broken}, "${nameOf(project, one.id)}", leaves the marker.`,
        subject: two.id,
      });
    }
  }
  return problems;
}

function nameOf(project: ProjectSnapshot, id: Id): string {
  return modelIndexOf(project).relation(id)?.name ?? id;
}
