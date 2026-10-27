/**
 * The steps' list of a scenario with decisions (ADR 0078): the steps in reading order, each decision
 * a header over its alternatives, and each alternative's steps grouped under it. The steps that play
 * are the timeline's entries; the others, in alternatives not chosen or after one that ends the
 * scenario, are listed all the same, so that their broken steps show and they can be gone to. Steps
 * keep their numbers in reading order.
 */
import {
  chosenAlternative,
  playedSteps,
  readBlocks,
  type DecisionSpan,
  type Timeline,
} from '@visual-anything/core';
import type {
  Alternative,
  DecisionBlock,
  DecisionChoices,
  ScenarioFile,
} from '@visual-anything/schema';

/** One item of the list: an entry of the timeline, a step that does not play, or a decision. */
export type ListedStep =
  | { kind: 'entry'; entry: number }
  | { kind: 'step'; step: number }
  | { kind: 'decision'; decision: DecisionBlock; alternatives: ListedAlternative[] };

/** An alternative of a decision in the list, with its steps. */
export interface ListedAlternative {
  alternative: Alternative;
  /** Whether it plays with the choices given, its default when none is made. */
  chosen: boolean;
  /** Its steps and the decisions among them, in reading order. */
  items: ListedStep[];
  /** How many steps it holds, those of the decisions inside it too. */
  steps: number;
  /** How many of them are broken steps. */
  broken: number;
}

/**
 * The list of a scenario with decisions; undefined for one without any, or whose decisions do not
 * hold together, which lists its timeline's entries as ever.
 */
export function listedSteps(
  scenario: ScenarioFile,
  timeline: Timeline,
  choices: DecisionChoices,
  isBroken: (step: number) => boolean,
): ListedStep[] | undefined {
  const read = readBlocks(scenario);
  if (!read.ok || read.decisions.length === 0) return undefined;
  const played = new Set(playedSteps(scenario, choices));
  const inside = new Map<string, DecisionSpan[]>();
  const keyOf = (decision: string, alternative: string) => `${decision}\u0000${alternative}`;
  for (const span of read.decisions) {
    const key = span.within ? keyOf(span.within.decision, span.within.alternative) : '';
    inside.set(key, [...(inside.get(key) ?? []), span]);
  }
  const stepItem = (at: number): ListedStep[] => {
    if (!played.has(at)) return [{ kind: 'step', step: at }];
    const entry = timeline.entryOf[at];
    // A step an aggregated entry plays shows in it, at its first step.
    if (entry === undefined || timeline.entries[entry]?.first !== at) return [];
    return [{ kind: 'entry', entry }];
  };
  const range = (from: number, to: number, spans: readonly DecisionSpan[]): ListedStep[] => {
    const items: ListedStep[] = [];
    let at = from;
    for (const span of spans) {
      for (; at < span.first; at++) items.push(...stepItem(at));
      const chosen = chosenAlternative(span.decision, choices);
      items.push({
        kind: 'decision',
        decision: span.decision,
        alternatives: span.alternatives.map(({ alternative, first, last }) => {
          const held =
            first === undefined || last === undefined
              ? []
              : Array.from({ length: last - first + 1 }, (_, index) => first + index);
          return {
            alternative,
            chosen: alternative === chosen,
            items:
              first === undefined || last === undefined
                ? []
                : range(first, last, inside.get(keyOf(span.decision.id, alternative.id)) ?? []),
            steps: held.length,
            broken: held.filter(isBroken).length,
          };
        }),
      });
      at = span.last + 1;
    }
    for (; at <= to; at++) items.push(...stepItem(at));
    return items;
  };
  return range(0, scenario.steps.length - 1, inside.get('') ?? []);
}
