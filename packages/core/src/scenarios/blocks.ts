/**
 * The decisions of a scenario (ADR 0078): blocks over its flat list of steps, each a question with
 * labelled alternatives whose steps are stretches of that list, one after another. What plays depends
 * on the alternative chosen at each decision, which the tab keeps; the steps stay in reading order, so
 * that broken steps, comparisons and merges by id, and every reader of the list keep working.
 *
 * Read once for each scenario object. A scenario whose blocks do not hold together plays every step in
 * order, and opening it warns.
 */
import type {
  Alternative,
  DecisionBlock,
  DecisionChoices,
  Id,
  ScenarioFile,
} from '@visual-anything/schema';

/** The caps on a scenario's decisions (ADR 0078). */
export const DECISION_CAPS = { blocks: 64, alternatives: 8, depth: 3 } as const;

/** An alternative where its steps lie: from `first` to `last` among the scenario's steps, if any. */
export interface AlternativeSpan {
  readonly alternative: Alternative;
  /** Where its steps lie among the scenario's steps, both included; absent for one with none. */
  readonly first?: number;
  readonly last?: number;
}

/** A decision where its steps lie, and where it sits among the others. */
export interface DecisionSpan {
  readonly decision: DecisionBlock;
  readonly alternatives: readonly AlternativeSpan[];
  /** From the first step of its first alternative with steps to the last of its last. */
  readonly first: number;
  readonly last: number;
  /** How deep it sits: 1 for one in no alternative of another. */
  readonly depth: number;
  /** The alternative of another decision it sits inside, if any. */
  readonly within?: { readonly decision: Id; readonly alternative: Id };
}

/** A scenario's decisions as read, in the order of their steps, or why they do not hold together. */
export type BlocksRead =
  | { readonly ok: true; readonly decisions: readonly DecisionSpan[] }
  | { readonly ok: false; readonly message: string };

const NONE: BlocksRead = { ok: true, decisions: [] };
const reads = new WeakMap<object, BlocksRead>();

/** A scenario's decisions, read once for each scenario object. */
export function readBlocks(scenario: Pick<ScenarioFile, 'steps' | 'blocks'>): BlocksRead {
  if (scenario.blocks === undefined || scenario.blocks.length === 0) return NONE;
  let read = reads.get(scenario);
  if (!read) {
    read = readUncached(scenario.steps, scenario.blocks);
    reads.set(scenario, read);
  }
  return read;
}

function readUncached(steps: ScenarioFile['steps'], blocks: readonly DecisionBlock[]): BlocksRead {
  const fail = (message: string): BlocksRead => ({ ok: false, message });
  if (blocks.length > DECISION_CAPS.blocks) {
    return fail('A scenario holds at most 64 decisions.');
  }
  const position = new Map<Id, number>();
  const ids = new Set<Id>();
  for (const [at, step] of steps.entries()) {
    position.set(step.id, at);
    ids.add(step.id);
  }
  const taken = (id: Id) => {
    if (ids.has(id)) return true;
    ids.add(id);
    return false;
  };
  const spans: DecisionSpan[] = [];
  for (const decision of blocks) {
    if (taken(decision.id)) return fail(`The id "${decision.id}" is used twice in the scenario.`);
    const { alternatives } = decision;
    if (alternatives.length < 2 || alternatives.length > DECISION_CAPS.alternatives) {
      return fail(`The decision "${decision.question}" has 2 to 8 alternatives.`);
    }
    const placed: AlternativeSpan[] = [];
    let next: number | undefined;
    for (const alternative of alternatives) {
      if (taken(alternative.id)) {
        return fail(`The id "${alternative.id}" is used twice in the scenario.`);
      }
      if (alternative.steps.length === 0) {
        placed.push({ alternative });
        continue;
      }
      const at: number[] = [];
      for (const step of alternative.steps) {
        const found = position.get(step);
        if (found === undefined) {
          return fail(
            `The alternative "${alternative.label}" lists "${step}", which is not a step of the scenario.`,
          );
        }
        at.push(found);
      }
      const first = at[0] as number;
      if (at.some((each, index) => each !== first + index)) {
        return fail(
          `The steps of the alternative "${alternative.label}" do not follow one another.`,
        );
      }
      if (next !== undefined && first !== next) {
        return fail(
          `The alternatives of the decision "${decision.question}" do not follow one another.`,
        );
      }
      const last = first + at.length - 1;
      next = last + 1;
      placed.push({ alternative, first, last });
    }
    const withSteps = placed.filter((each) => each.first !== undefined);
    if (withSteps.length === 0) {
      return fail(`The decision "${decision.question}" needs an alternative with steps.`);
    }
    if (
      decision.default !== undefined &&
      !alternatives.some((alternative) => alternative.id === decision.default)
    ) {
      return fail(
        `The decision "${decision.question}" names a default that is none of its alternatives.`,
      );
    }
    spans.push({
      decision,
      alternatives: placed,
      first: withSteps[0]?.first as number,
      last: withSteps.at(-1)?.last as number,
      depth: 1,
    });
  }

  // Each decision sits in the innermost alternative of another that holds all its steps, or in none;
  // one that straddles an alternative's edge crosses it.
  spans.sort((a, b) => a.first - b.first || b.last - a.last);
  const placedSpans: DecisionSpan[] = [];
  for (const span of spans) {
    let within: { decision: Id; alternative: Id } | undefined;
    let depth = 1;
    for (const outer of placedSpans) {
      if (span.last < outer.first || span.first > outer.last) continue;
      const holder = outer.alternatives.find(
        (each) =>
          each.first !== undefined &&
          each.last !== undefined &&
          each.first <= span.first &&
          span.last <= each.last,
      );
      if (!holder) {
        return fail(
          `The decisions "${outer.decision.question}" and "${span.decision.question}" cross: one must sit inside an alternative of the other, or stand apart.`,
        );
      }
      if (outer.depth + 1 > depth) {
        depth = outer.depth + 1;
        within = { decision: outer.decision.id, alternative: holder.alternative.id };
      }
    }
    if (depth > DECISION_CAPS.depth) return fail('Decisions sit at most three deep.');
    placedSpans.push({ ...span, depth, ...(within ? { within } : {}) });
  }
  return { ok: true, decisions: placedSpans };
}

/** The alternative a decision plays with these choices: the one chosen, or else its default or first. */
export function chosenAlternative(
  decision: DecisionBlock,
  choices: DecisionChoices | undefined,
): Alternative {
  const asked =
    choices !== undefined && Object.hasOwn(choices, decision.id) ? choices[decision.id] : undefined;
  const byId = (id: Id | undefined) =>
    id === undefined ? undefined : decision.alternatives.find((each) => each.id === id);
  return byId(asked) ?? byId(decision.default) ?? (decision.alternatives[0] as Alternative);
}

/**
 * The indexes of the steps a scenario plays with these choices, in order: every step outside its
 * decisions, and at each decision the steps of the alternative it plays, up to an alternative that
 * ends the scenario. Every step, in order, when it has no decisions or they do not hold together.
 */
export function playedSteps(
  scenario: Pick<ScenarioFile, 'steps' | 'blocks'>,
  choices?: DecisionChoices,
): number[] {
  const read = readBlocks(scenario);
  const all = () => scenario.steps.map((_, at) => at);
  if (!read.ok || read.decisions.length === 0) return all();
  const inside = new Map<string, DecisionSpan[]>();
  const keyOf = (within: DecisionSpan['within']) =>
    within === undefined ? '' : `${within.decision}\u0000${within.alternative}`;
  for (const span of read.decisions) {
    const key = keyOf(span.within);
    inside.set(key, [...(inside.get(key) ?? []), span]);
  }
  const played: number[] = [];
  // Plays from `from` to `to`, both included, with the decisions sitting directly there; true when an
  // alternative that ends the scenario played.
  const playRange = (from: number, to: number, decisions: readonly DecisionSpan[]): boolean => {
    let at = from;
    for (const span of decisions) {
      for (; at < span.first; at++) played.push(at);
      const alternative = chosenAlternative(span.decision, choices);
      const placed = span.alternatives.find((each) => each.alternative === alternative);
      if (placed?.first !== undefined && placed.last !== undefined) {
        const nested = inside.get(
          keyOf({ decision: span.decision.id, alternative: alternative.id }),
        );
        if (playRange(placed.first, placed.last, nested ?? [])) return true;
      }
      if (alternative.ends) return true;
      at = span.last + 1;
    }
    for (; at <= to; at++) played.push(at);
    return false;
  };
  playRange(0, scenario.steps.length - 1, inside.get('') ?? []);
  return played;
}

/** Where a step sits among a scenario's decisions: each decision and alternative holding it, outermost first. */
export function alternativesOf(
  scenario: Pick<ScenarioFile, 'steps' | 'blocks'>,
  step: Id,
): { decision: Id; alternative: Id }[] {
  const read = readBlocks(scenario);
  if (!read.ok) return [];
  const at = scenario.steps.findIndex((each) => each.id === step);
  if (at < 0) return [];
  const path: { decision: Id; alternative: Id; depth: number }[] = [];
  for (const span of read.decisions) {
    const holder = span.alternatives.find(
      (each) =>
        each.first !== undefined && each.last !== undefined && each.first <= at && at <= each.last,
    );
    if (holder) {
      path.push({
        decision: span.decision.id,
        alternative: holder.alternative.id,
        depth: span.depth,
      });
    }
  }
  return path
    .sort((a, b) => a.depth - b.depth)
    .map(({ decision, alternative }) => ({ decision, alternative }));
}

/** The innermost decision and alternative a step sits in, if any. */
export function alternativeOf(
  scenario: Pick<ScenarioFile, 'steps' | 'blocks'>,
  step: Id,
): { decision: Id; alternative: Id } | undefined {
  return alternativesOf(scenario, step).at(-1);
}

/**
 * The choices that make a scenario play a step: `choices` with, at every decision holding the step,
 * the alternative that holds it. Undefined for a step no choices reach, as one after an alternative
 * that ends the scenario whatever is chosen there, or one the scenario does not have.
 */
export function choicesToReach(
  scenario: Pick<ScenarioFile, 'steps' | 'blocks'>,
  step: Id,
  choices: DecisionChoices = {},
): DecisionChoices | undefined {
  const at = scenario.steps.findIndex((each) => each.id === step);
  if (at < 0) return undefined;
  const reached: DecisionChoices = { ...choices };
  const holding = new Set<Id>();
  for (const { decision, alternative } of alternativesOf(scenario, step)) {
    reached[decision] = alternative;
    holding.add(decision);
  }
  if (playedSteps(scenario, reached).includes(at)) return reached;
  // An alternative chosen before it may end the scenario: choose, at each of those, one that does not.
  // The decisions that hold the step keep the alternatives that hold it, which end only after it.
  const read = readBlocks(scenario);
  if (!read.ok) return undefined;
  for (const span of read.decisions) {
    if (span.first > at || holding.has(span.decision.id)) continue;
    const playing = chosenAlternative(span.decision, reached);
    if (!playing.ends) continue;
    const other = span.decision.alternatives.find((each) => !each.ends);
    if (other) reached[span.decision.id] = other.id;
  }
  return playedSteps(scenario, reached).includes(at) ? reached : undefined;
}

/** How many ways a scenario can play, counting each choice at each decision, up to `cap`. */
export function combinationsOf(
  scenario: Pick<ScenarioFile, 'steps' | 'blocks'>,
  cap = 1000,
): number {
  const read = readBlocks(scenario);
  if (!read.ok || read.decisions.length === 0) return 1;
  const children = new Map<string, DecisionSpan[]>();
  for (const span of read.decisions) {
    const key = span.within ? `${span.within.decision}\u0000${span.within.alternative}` : '';
    children.set(key, [...(children.get(key) ?? []), span]);
  }
  const ways = (spans: readonly DecisionSpan[]): number => {
    let total = 1;
    for (const span of spans) {
      let here = 0;
      for (const { alternative } of span.alternatives) {
        here += ways(children.get(`${span.decision.id}\u0000${alternative.id}`) ?? []);
        if (here >= cap) return cap;
      }
      total = Math.min(cap, total * here);
    }
    return total;
  };
  return ways(children.get('') ?? []);
}
