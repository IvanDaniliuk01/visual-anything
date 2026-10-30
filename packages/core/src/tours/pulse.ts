/**
 * A tour step's pulse (ADR 0084): a marker that travels along a chain of relations, one after the
 * other, to show what follows what within one step. A chain joins when each relation shares an end
 * with the next; one that does not, or that names a relation the step's view does not draw, is a step
 * problem, kept and flagged as other problems are. Pure.
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
 * Where a chain breaks: the index of the first relation that shares no end with the one before it,
 * or -1 when every relation does, so that the chain joins.
 */
export function chainBreak(links: readonly ChainLink[]): number {
  for (let at = 1; at < links.length; at++) {
    const before = links[at - 1] as ChainLink;
    const link = links[at] as ChainLink;
    if (!shares(before, link)) return at;
  }
  return -1;
}

function shares(a: ChainLink, b: ChainLink): boolean {
  return a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to;
}

/**
 * The relations in an order that joins them into a chain: the order given when it joins already,
 * otherwise the first order found; none when no order does, or past {@link MAX_PULSE_RELATIONS}.
 */
export function chainOrder(links: readonly ChainLink[]): Id[] | undefined {
  if (links.length === 0 || links.length > MAX_PULSE_RELATIONS) return undefined;
  if (chainBreak(links) < 0) return links.map((link) => link.id);
  const used = new Array<boolean>(links.length).fill(false);
  const order: number[] = [];
  const extend = (): boolean => {
    if (order.length === links.length) return true;
    const last = order.length === 0 ? undefined : links[order.at(-1) as number];
    for (let at = 0; at < links.length; at++) {
      if (used[at]) continue;
      const link = links[at] as ChainLink;
      if (last && !shares(last, link)) continue;
      used[at] = true;
      order.push(at);
      if (extend()) return true;
      order.pop();
      used[at] = false;
    }
    return false;
  };
  return extend() ? order.map((at) => (links[at] as ChainLink).id) : undefined;
}

/**
 * Which way the marker runs each relation of a joined chain: it starts at the end of the first that
 * the second does not share, and runs each next one from the end it arrived at.
 */
export function pulseLegs(links: readonly ChainLink[]): PulseLeg[] {
  const legs: PulseLeg[] = [];
  let at: Id | undefined;
  links.forEach((link, index) => {
    let forward: boolean;
    if (index === 0) {
      const next = links[1];
      // Backwards only when the next relation meets this one's start and not its end.
      forward = !(
        next !== undefined &&
        (next.from === link.from || next.to === link.from) &&
        next.from !== link.to &&
        next.to !== link.to
      );
    } else forward = at !== link.to;
    legs.push({ relation: link.id, forward });
    at = forward ? link.to : link.from;
  });
  return legs;
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
        message: `The pulse is not a chain: relation ${broken + 1}, "${nameOf(project, two.id)}", shares no end with relation ${broken}, "${nameOf(project, one.id)}".`,
        subject: two.id,
      });
    }
  }
  return problems;
}

function nameOf(project: ProjectSnapshot, id: Id): string {
  return modelIndexOf(project).relation(id)?.name ?? id;
}
