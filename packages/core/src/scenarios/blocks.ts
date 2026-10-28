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

  // Every step is reached by some choices: no step may follow, in its stretch, a decision whose every
  // alternative ends the scenario, by itself or through a decision inside it that always ends.
  const ending = endingOf(placedSpans);
  for (const span of placedSpans) {
    if (!ending.decision(span.decision.id)) continue;
    const holder =
      span.within &&
      placedSpans
        .find((outer) => outer.decision.id === span.within?.decision)
        ?.alternatives.find((each) => each.alternative.id === span.within?.alternative);
    const stretchEnd = holder ? (holder.last as number) : steps.length - 1;
    if (span.last < stretchEnd) {
      return fail(
        `Every alternative of the decision "${span.decision.question}" ends the scenario, so the steps after it can never play.`,
      );
    }
  }
  return { ok: true, decisions: placedSpans };
}

/**
 * The choices that name a decision of the scenario and one of its alternatives, in their order; the
 * others are dropped, as what a view state or a tour's step names that is gone is (ADR 0078).
 * Undefined when none is left, or none was given.
 */
export function knownChoices(
  scenario: Pick<ScenarioFile, 'blocks'>,
  choices: DecisionChoices | undefined,
): DecisionChoices | undefined {
  if (choices === undefined) return undefined;
  const kept = Object.entries(choices).filter(([decision, alternative]) =>
    scenario.blocks?.some(
      (block) =>
        block.id === decision && block.alternatives.some((each) => each.id === alternative),
    ),
  );
  if (kept.length === 0) return undefined;
  return kept.length === Object.keys(choices).length ? choices : Object.fromEntries(kept);
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
  const played: number[] = [];
  const read = readBlocks(scenario);
  if (!read.ok || read.decisions.length === 0) return scenario.steps.map((_, at) => at);
  walk(scenario.steps.length, read.decisions, choices, (at) => played.push(at));
  return played;
}

/**
 * The decisions playback reaches with these choices, in the order it reaches them, each with the
 * alternative it plays there: those outside every alternative and those inside the alternatives it
 * plays, up to an alternative that ends the scenario. None when it has no decisions, or they do not
 * hold together.
 */
export function decisionsReached(
  scenario: Pick<ScenarioFile, 'steps' | 'blocks'>,
  choices?: DecisionChoices,
): { decision: DecisionBlock; alternative: Alternative }[] {
  const read = readBlocks(scenario);
  if (!read.ok || read.decisions.length === 0) return [];
  const reached: { decision: DecisionBlock; alternative: Alternative }[] = [];
  walk(
    scenario.steps.length,
    read.decisions,
    choices,
    () => {},
    (span, alternative) => reached.push({ decision: span.decision, alternative }),
  );
  return reached;
}

/**
 * Walks what a scenario plays with these choices, in order: `step` for each step that plays, and
 * `decision` for each decision playback reaches, as it reaches it, before the steps of the
 * alternative it plays.
 */
function walk(
  count: number,
  decisions: readonly DecisionSpan[],
  choices: DecisionChoices | undefined,
  step: (at: number) => void,
  decision?: (span: DecisionSpan, alternative: Alternative) => void,
): void {
  const inside = new Map<string, DecisionSpan[]>();
  const keyOf = (within: DecisionSpan['within']) =>
    within === undefined ? '' : `${within.decision}\u0000${within.alternative}`;
  for (const span of decisions) {
    const key = keyOf(span.within);
    inside.set(key, [...(inside.get(key) ?? []), span]);
  }
  // Plays from `from` to `to`, both included, with the decisions sitting directly there; true when an
  // alternative that ends the scenario played.
  const playRange = (from: number, to: number, spans: readonly DecisionSpan[]): boolean => {
    let at = from;
    for (const span of spans) {
      for (; at < span.first; at++) step(at);
      const alternative = chosenAlternative(span.decision, choices);
      decision?.(span, alternative);
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
    for (; at <= to; at++) step(at);
    return false;
  };
  playRange(0, count - 1, inside.get('') ?? []);
}

/** A decision as playback meets it on a step (ADR 0078). */
export interface DecisionAt {
  readonly decision: DecisionBlock;
  /** The alternative it plays with the choices given. */
  readonly alternative: Alternative;
  /**
   * `holding`: the step is in the alternative it plays; `ahead`: playback reaches it after the step,
   * before the next step that plays; `before`: playback reaches it before the first step that plays,
   * which meets it.
   */
  readonly place: 'holding' | 'ahead' | 'before';
}

/**
 * The decisions playback meets on a step, by the step's index, with these choices: those holding the
 * step, outermost first, then those it reaches after the step and before the next step that plays, in
 * the order it reaches them. The first step that plays also meets those reached before it, first.
 * None for a step that does not play, or decisions that do not hold together.
 */
export function decisionsAt(
  scenario: Pick<ScenarioFile, 'steps' | 'blocks'>,
  step: number,
  choices?: DecisionChoices,
): DecisionAt[] {
  const read = readBlocks(scenario);
  if (!read.ok || read.decisions.length === 0) return [];
  const before: DecisionAt[] = [];
  const ahead: DecisionAt[] = [];
  let first = true;
  let reached = false;
  let done = false;
  walk(
    scenario.steps.length,
    read.decisions,
    choices,
    (at) => {
      if (reached) done = true;
      else if (at === step) reached = true;
      else before.length = 0;
      first = false;
    },
    (span, alternative) => {
      if (done) return;
      const met = { decision: span.decision, alternative };
      if (reached) ahead.push({ ...met, place: 'ahead' });
      else if (first) before.push({ ...met, place: 'before' });
    },
  );
  if (!reached) return [];
  const id = scenario.steps[step]?.id as Id;
  const holding = alternativesOf(scenario, id).map(({ decision }): DecisionAt => {
    const span = read.decisions.find((each) => each.decision.id === decision) as DecisionSpan;
    return {
      decision: span.decision,
      alternative: chosenAlternative(span.decision, choices),
      place: 'holding',
    };
  });
  return [...before, ...holding, ...ahead];
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
 * What always ends a scenario, its decisions read: an alternative that ends it, or that holds a
 * decision whose every alternative always ends it; and such a decision.
 */
function endingOf(decisions: readonly DecisionSpan[]): {
  alternative(decision: Id, alternative: Alternative): boolean;
  decision(decision: Id): boolean;
} {
  const always = new Map<Id, boolean>();
  const alternative = (decision: Id, chosen: Alternative): boolean =>
    chosen.ends === true ||
    decisions.some(
      (inner) =>
        inner.within?.decision === decision &&
        inner.within.alternative === chosen.id &&
        always.get(inner.decision.id) === true,
    );
  // The deepest first, so that a decision reads what those inside its alternatives do.
  for (const span of [...decisions].sort((a, b) => b.depth - a.depth)) {
    always.set(
      span.decision.id,
      span.alternatives.every((each) => alternative(span.decision.id, each.alternative)),
    );
  }
  return { alternative, decision: (decision) => always.get(decision) === true };
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
  const ending = endingOf(read.decisions);
  for (const span of read.decisions) {
    if (span.first > at || holding.has(span.decision.id)) continue;
    const id = span.decision.id;
    if (!ending.alternative(id, chosenAlternative(span.decision, reached))) continue;
    const other = span.decision.alternatives.find((each) => !ending.alternative(id, each));
    if (other) reached[id] = other.id;
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
