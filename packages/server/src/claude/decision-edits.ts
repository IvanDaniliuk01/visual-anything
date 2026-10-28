/**
 * What Claude's scenario tools do with decisions (ADR 0078), apart from the tools themselves: a tree
 * of steps and decisions turned into the flat list of steps with blocks over it, as
 * create_scenario_from_steps takes it; update_scenario's decision operations, worked out with the
 * core's editing helpers on the scenario as the edits before them left it; the choices a playback
 * tool is given, checked against the scenario; and the decisions in the words read_scenario and the
 * playback tools answer with. Nothing here sends anything: every change goes as one command.
 */
import {
  addAlternativeAfter,
  alternativeOf,
  chosenAlternative,
  decisionsReached,
  freshId,
  inReadingOrder,
  insertStep,
  modelIndexOf,
  randomIds,
  readBlocks,
  rejoinAt,
  removeDecision,
  slug,
  stepsRemovedWith,
  type DecisionSpan,
  type NewStep,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type {
  Alternative,
  DecisionBlock,
  DecisionChoices,
  Id,
  ScenarioFile,
  Step,
} from '@visual-anything/schema';

/** A step as the tools take it, before it has an id. */
export type GivenStep = Omit<NewStep, 'id'>;

/** A decision in a tree of steps, as create_scenario_from_steps takes it. */
export interface GivenDecision {
  decision: string;
  alternatives: { label: string; steps: TreeItem[]; ends?: boolean | undefined }[];
  /** The label of the alternative that plays when nothing chooses. */
  default?: string | undefined;
}

/** A step, or a decision whose alternatives hold more of them. */
export type TreeItem = GivenStep | GivenDecision;

/** The steps and decisions being edited: every step has its id, new ones too. */
export interface Working {
  steps: Step[];
  blocks: DecisionBlock[] | undefined;
}

/** Whether an id is taken in the project or by the scenario's own steps, decisions and alternatives. */
export type Taken = (id: Id) => boolean;

/** What is taken, for new ids in a scenario: the model's, views', scenarios' ids and its own. */
export function takenIn(
  project: ProjectSnapshot,
  scenario: Pick<ScenarioFile, 'steps' | 'blocks'> | undefined,
): { taken: Taken; take: (id: Id) => Id } {
  const index = modelIndexOf(project);
  const own = new Set<Id>();
  for (const step of scenario?.steps ?? []) own.add(step.id);
  for (const block of scenario?.blocks ?? []) {
    own.add(block.id);
    for (const alternative of block.alternatives) own.add(alternative.id);
  }
  const taken: Taken = (id) =>
    own.has(id) ||
    index.has(id) ||
    project.scenarios.some(
      (each) => each.id === id || each.steps.some((step) => step.relations.includes(id)),
    ) ||
    project.views.some((view) => view.id === id);
  return {
    taken,
    take: (id) => {
      own.add(id);
      return id;
    },
  };
}

/** A new id from a base, unused by anything `taken` names, then taken. */
function newId(ids: ReturnType<typeof takenIn>, base: string): Id {
  return ids.take(freshId(randomIds(), base, ids.taken));
}

/** A new step's id, unused by anything `taken` names, then taken. */
export function newStepId(ids: ReturnType<typeof takenIn>): Id {
  return newId(ids, 'step');
}

// ——— A tree of steps ———

/**
 * The flat list of steps a tree holds, in reading order, and the decisions over it, outer ones
 * first, each new step, decision and alternative with an id of its own. A default names an
 * alternative by its label; the first is the default without one, so none is written for it.
 */
export function flattenTree(
  items: readonly TreeItem[],
  ids: ReturnType<typeof takenIn>,
): { ok: true; steps: Step[]; blocks: DecisionBlock[] } | { ok: false; message: string } {
  const steps: Step[] = [];
  const blocks: DecisionBlock[] = [];
  const walk = (list: readonly TreeItem[]): string | undefined => {
    for (const item of list) {
      if (!('decision' in item)) {
        steps.push({ id: newId(ids, 'step'), ...item });
        continue;
      }
      const at = blocks.length;
      const id = newId(ids, slug(item.decision, 'decision'));
      blocks.push({ id, kind: 'decision', question: item.decision, alternatives: [] });
      const alternatives: Alternative[] = [];
      for (const given of item.alternatives) {
        const start = steps.length;
        const failed = walk(given.steps);
        if (failed !== undefined) return failed;
        alternatives.push({
          id: newId(ids, slug(given.label, 'alternative')),
          label: given.label,
          steps: steps.slice(start).map((step) => step.id),
          ...(given.ends ? { ends: true as const } : {}),
        });
      }
      const block: DecisionBlock = { id, kind: 'decision', question: item.decision, alternatives };
      if (item.default !== undefined) {
        const chosen = alternatives.find((alternative) => alternative.label === item.default);
        if (!chosen) {
          return `the decision "${item.decision}" has no alternative labelled "${item.default}" to play by default: it has ${listed(alternatives.map((each) => `"${each.label}"`))}.`;
        }
        if (chosen !== alternatives[0]) block.default = chosen.id;
      }
      blocks[at] = block;
    }
    return undefined;
  };
  const failed = walk(items);
  return failed === undefined ? { ok: true, steps, blocks } : { ok: false, message: failed };
}

// ——— Editing decisions ———

/** One of update_scenario's decision operations, as the tool takes it. */
export type DecisionEdit =
  | { op: 'insert'; step: GivenStep; after?: Id | number; afterDecision?: Id }
  | {
      op: 'add-alternative';
      label: string;
      steps?: GivenStep[];
      ends?: boolean;
      after?: Id | number;
      decision?: Id;
      question?: string;
      keptLabel?: string;
    }
  | {
      op: 'add-decision';
      question: string;
      alternatives: { label: string; steps: (Id | number)[]; ends?: boolean }[];
      default?: string;
    }
  | { op: 'rejoin'; step: Id | number }
  | { op: 'remove-decision'; decision: Id }
  | { op: 'set-decision'; decision: Id; question?: string; default?: Id | null }
  | { op: 'set-alternative'; alternative: Id; label?: string; ends?: boolean }
  | { op: 'remove-decisions' };

/** The names of the decision operations. */
export const DECISION_OPS: ReadonlySet<string> = new Set([
  'insert',
  'add-alternative',
  'add-decision',
  'rejoin',
  'remove-decision',
  'set-decision',
  'set-alternative',
  'remove-decisions',
]);

/** What a decision operation leaves, or why it cannot be done, in a sentence. */
export type Edited =
  { ok: true; working: Working; removed?: Id[] } | { ok: false; message: string };

/**
 * Applies one decision operation to the steps and decisions as the edits before it left them, with
 * the core's helpers. It names steps by their id, or by their number from 1 among those steps, and
 * decisions and alternatives by their id; each new step, decision and alternative gets an id of its
 * own from `ids`.
 */
export function applyDecisionEdit(
  scenario: ScenarioFile,
  working: Working,
  edit: DecisionEdit,
  ids: ReturnType<typeof takenIn>,
): Edited {
  const current: ScenarioFile = withWorking(scenario, working);
  const fail = (message: string): Edited => ({ ok: false, message });
  const read = readBlocks(current);
  const readFailed = () =>
    fail(
      read.ok
        ? 'the decisions do not hold together there.'
        : `${read.message} remove-decisions takes them away, keeping every step.`,
    );
  const stepAt = (ref: Id | number) => indexOf(working.steps, ref);
  const noStep = (ref: Id | number) =>
    `the scenario has no step ${typeof ref === 'number' ? ref : `"${ref}"`} there: it has ${working.steps.length} ${working.steps.length === 1 ? 'step' : 'steps'}.`;
  const decisionNamed = (id: Id) => working.blocks?.find((block) => block.id === id);
  const noDecision = (id: Id) =>
    `the scenario has no decision "${id}": read_scenario lists its decisions.`;
  const step = (given: GivenStep): Step => ({ id: newId(ids, 'step'), ...given });
  const done = (edited: { steps: NewStep[]; blocks: DecisionBlock[] | null }): Edited => ({
    ok: true,
    working: { steps: edited.steps as Step[], blocks: edited.blocks ?? undefined },
  });

  switch (edit.op) {
    case 'insert': {
      if ((edit.after === undefined) === (edit.afterDecision === undefined)) {
        return fail('give after, the step it follows, or afterDecision, the decision it follows.');
      }
      let place: { after: Id } | { afterDecision: Id };
      if (edit.after !== undefined) {
        const at = stepAt(edit.after);
        if (at === undefined) return fail(noStep(edit.after));
        place = { after: working.steps[at]?.id as Id };
      } else {
        if (!decisionNamed(edit.afterDecision as Id))
          return fail(noDecision(edit.afterDecision as Id));
        place = { afterDecision: edit.afterDecision as Id };
      }
      const inserted = insertStep(current, step(edit.step), place);
      return inserted ? done(inserted) : readFailed();
    }

    case 'add-alternative': {
      if ((edit.after === undefined) === (edit.decision === undefined)) {
        return fail(
          'give after, the step the alternative follows, or decision, the decision it joins last.',
        );
      }
      if (!read.ok) return readFailed();
      const given = edit.steps ?? [];
      const alternative = { id: newId(ids, slug(edit.label, 'alternative')), label: edit.label };
      // Its first step, if it has any: the one its other steps follow.
      const first = given[0] === undefined ? undefined : step(given[0]);
      let edited: Working;
      if (edit.decision !== undefined) {
        const span = read.decisions.find((each) => each.decision.id === edit.decision);
        if (!span) return fail(noDecision(edit.decision));
        if (first === undefined) {
          edited = {
            steps: working.steps,
            blocks: joinedLast(working.blocks, edit.decision, { ...alternative, steps: [] }),
          };
        } else {
          const inserted = insertStep(current, first, { afterDecision: edit.decision });
          if (!inserted) return readFailed();
          edited = {
            steps: inserted.steps as Step[],
            blocks: joinedLast(inserted.blocks ?? [], edit.decision, {
              ...alternative,
              steps: [first.id],
            }),
          };
        }
      } else {
        const at = stepAt(edit.after as Id | number);
        if (at === undefined) return fail(noStep(edit.after as Id | number));
        const after = working.steps[at] as Step;
        const joins = decisionRightAfter(current, read.decisions, at);
        if (!joins && (edit.question === undefined || edit.keptLabel === undefined)) {
          return fail(
            `no decision starts right after step ${at + 1}, so this alternative starts one: give its question, and keptLabel for the alternative that keeps the steps that follow.`,
          );
        }
        // With no steps of its own, the alternative is added with a stand-in, taken out again.
        const added = first ?? step({ description: '', relations: [] });
        const made = addAlternativeAfter(current, after.id, {
          step: added,
          alternative,
          decision: {
            id: joins ?? newId(ids, slug(edit.question ?? '', 'decision')),
            question: edit.question ?? '',
            kept: {
              id: newId(ids, slug(edit.keptLabel ?? '', 'alternative')),
              label: edit.keptLabel ?? '',
            },
          },
        });
        if (!made) return readFailed();
        edited = { steps: made.steps as Step[], blocks: made.blocks ?? undefined };
        if (first === undefined) edited = without(edited, added.id);
      }
      // Its other steps follow its first, in every alternative that holds that one: its own too.
      let last = first;
      for (const more of given.slice(1)) {
        if (!last) break;
        const next = step(more);
        const inserted = insertStep(withWorking(scenario, edited), next, { after: last.id });
        if (!inserted) return readFailed();
        edited = { steps: inserted.steps as Step[], blocks: inserted.blocks ?? undefined };
        last = next;
      }
      if (edit.ends) {
        edited = {
          ...edited,
          blocks: edited.blocks?.map((block) => ({
            ...block,
            alternatives: block.alternatives.map((each) =>
              each.id === alternative.id ? { ...each, ends: true as const } : each,
            ),
          })),
        };
      }
      return { ok: true, working: edited };
    }

    case 'add-decision': {
      const alternatives: Alternative[] = [];
      for (const given of edit.alternatives) {
        const stepsOf: Id[] = [];
        for (const ref of given.steps) {
          const at = stepAt(ref);
          if (at === undefined) return fail(noStep(ref));
          stepsOf.push(working.steps[at]?.id as Id);
        }
        alternatives.push({
          id: newId(ids, slug(given.label, 'alternative')),
          label: given.label,
          steps: stepsOf,
          ...(given.ends ? { ends: true as const } : {}),
        });
      }
      const block: DecisionBlock = {
        id: newId(ids, slug(edit.question, 'decision')),
        kind: 'decision',
        question: edit.question,
        alternatives,
      };
      if (edit.default !== undefined) {
        const chosen = alternatives.find((each) => each.label === edit.default);
        if (!chosen) {
          return fail(
            `the decision "${edit.question}" has no alternative labelled "${edit.default}" to play by default: it has ${listed(alternatives.map((each) => `"${each.label}"`))}.`,
          );
        }
        if (chosen !== alternatives[0]) block.default = chosen.id;
      }
      return {
        ok: true,
        working: {
          steps: working.steps,
          blocks: inReadingOrder(working.steps, [...(working.blocks ?? []), block]),
        },
      };
    }

    case 'rejoin': {
      const at = stepAt(edit.step);
      if (at === undefined) return fail(noStep(edit.step));
      if (!read.ok) return readFailed();
      const id = working.steps[at]?.id as Id;
      if (!alternativeOf(current, id)) {
        return fail(`step ${at + 1} is in no alternative, so nothing rejoins there.`);
      }
      const rejoined = rejoinAt(current, id);
      return rejoined ? done(rejoined) : readFailed();
    }

    case 'remove-decision': {
      if (!decisionNamed(edit.decision)) return fail(noDecision(edit.decision));
      if (!read.ok) return readFailed();
      const removed = stepsRemovedWith(current, edit.decision);
      const edited = removeDecision(current, edit.decision);
      if (!edited) return readFailed();
      return {
        ok: true,
        working: { steps: edited.steps as Step[], blocks: edited.blocks ?? undefined },
        removed,
      };
    }

    case 'set-decision': {
      const block = decisionNamed(edit.decision);
      if (!block) return fail(noDecision(edit.decision));
      const changed: DecisionBlock = { ...block };
      if (edit.question !== undefined) changed.question = edit.question;
      if (edit.default === null) delete changed.default;
      else if (edit.default !== undefined) {
        const chosen = block.alternatives.find((each) => each.id === edit.default);
        if (!chosen) {
          return fail(
            `the decision "${block.question}" has no alternative "${edit.default}": its alternatives are ${alternativesListed(block)}.`,
          );
        }
        if (chosen === block.alternatives[0]) delete changed.default;
        else changed.default = chosen.id;
      }
      return {
        ok: true,
        working: {
          steps: working.steps,
          blocks: working.blocks?.map((each) => (each === block ? changed : each)),
        },
      };
    }

    case 'set-alternative': {
      const block = working.blocks?.find((each) =>
        each.alternatives.some((alternative) => alternative.id === edit.alternative),
      );
      if (!block) {
        return fail(
          `the scenario has no alternative "${edit.alternative}": read_scenario lists its decisions and their alternatives.`,
        );
      }
      const alternatives = block.alternatives.map((alternative): Alternative => {
        if (alternative.id !== edit.alternative) return alternative;
        const changed: Alternative = { ...alternative };
        if (edit.label !== undefined) changed.label = edit.label;
        if (edit.ends === true) changed.ends = true;
        else if (edit.ends === false) delete changed.ends;
        return changed;
      });
      return {
        ok: true,
        working: {
          steps: working.steps,
          blocks: working.blocks?.map((each) =>
            each === block ? { ...block, alternatives } : each,
          ),
        },
      };
    }

    case 'remove-decisions':
      return { ok: true, working: { steps: working.steps, blocks: undefined } };
  }
}

/**
 * The decisions after the steps changed by an edit that knows nothing of them, as the core keeps
 * them: without the steps gone, without a decision left with none, each alternative's steps in the
 * order the steps now have.
 */
export function keptWith(
  steps: readonly Step[],
  blocks: DecisionBlock[] | undefined,
): DecisionBlock[] | undefined {
  if (blocks === undefined) return undefined;
  const ids = new Set(steps.map((step) => step.id));
  const kept = blocks
    .map((block) => ({
      ...block,
      alternatives: block.alternatives.map((alternative) => ({
        ...alternative,
        steps: alternative.steps.filter((id) => ids.has(id)),
      })),
    }))
    .filter((block) => block.alternatives.some((alternative) => alternative.steps.length > 0));
  return kept.length === 0 ? undefined : inReadingOrder(steps, kept);
}

/** Why the decisions would not hold together over the steps, in the core's words; none when they do. */
export function decisionsProblem(working: {
  steps: Step[];
  blocks?: DecisionBlock[] | undefined;
}): string | undefined {
  if (working.blocks === undefined || working.blocks.length === 0) return undefined;
  const read = readBlocks({ steps: working.steps, blocks: working.blocks });
  return read.ok ? undefined : read.message;
}

/** The scenario with these steps and decisions. */
export function withWorking(scenario: ScenarioFile, working: Working): ScenarioFile {
  const next: ScenarioFile = { ...scenario, steps: working.steps };
  if (working.blocks === undefined || working.blocks.length === 0) delete next.blocks;
  else next.blocks = working.blocks;
  return next;
}

/** The decision that starts right after the step at `at`, in the alternative it is in. */
function decisionRightAfter(
  scenario: ScenarioFile,
  decisions: readonly DecisionSpan[],
  at: number,
): Id | undefined {
  const step = scenario.steps[at];
  if (!step) return undefined;
  const within = alternativeOf(scenario, step.id);
  return decisions.find(
    (span) =>
      span.first === at + 1 &&
      span.within?.decision === within?.decision &&
      span.within?.alternative === within?.alternative,
  )?.decision.id;
}

/** The decisions with an alternative added last to one of them. */
function joinedLast(
  blocks: readonly DecisionBlock[] | undefined,
  decision: Id,
  alternative: Alternative,
): DecisionBlock[] {
  return (blocks ?? []).map((block) =>
    block.id === decision
      ? { ...block, alternatives: [...block.alternatives, alternative] }
      : block,
  );
}

/** The steps and decisions without one step, which no alternative then lists. */
function without(working: Working, id: Id): Working {
  return {
    steps: working.steps.filter((step) => step.id !== id),
    blocks: working.blocks?.map((block) => ({
      ...block,
      alternatives: block.alternatives.map((alternative) => ({
        ...alternative,
        steps: alternative.steps.filter((each) => each !== id),
      })),
    })),
  };
}

/** Where a step is among these steps, by its id or its number from 1. */
export function indexOf(steps: readonly { id?: Id }[], ref: Id | number): number | undefined {
  if (typeof ref === 'number') return ref >= 1 && ref <= steps.length ? ref - 1 : undefined;
  const at = steps.findIndex((step) => step.id === ref);
  return at < 0 ? undefined : at;
}

// ——— Choices ———

/**
 * Checks the choices a playback tool is given: each names a decision of the scenario and one of its
 * alternatives. Says what is wrong, in a sentence, or nothing.
 */
export function choicesProblem(
  scenario: ScenarioFile,
  choices: DecisionChoices,
): string | undefined {
  for (const [decision, alternative] of Object.entries(choices)) {
    const block = scenario.blocks?.find((each) => each.id === decision);
    if (!block) {
      return `The scenario "${scenario.name}" has no decision "${decision}": read_scenario lists its decisions and their alternatives.`;
    }
    if (!block.alternatives.some((each) => each.id === alternative)) {
      return `The decision "${block.question}" has no alternative "${alternative}": its alternatives are ${alternativesListed(block)}.`;
    }
  }
  return undefined;
}

/** A decision and the alternative that plays there, in the words the tools answer with. */
export interface Played {
  decision: Id;
  question: string;
  alternative: Id;
  label: string;
  ends?: true;
}

/** What plays at a decision, as the tools say it. */
export function playedAt(decision: DecisionBlock, alternative: Alternative): Played {
  return {
    decision: decision.id,
    question: decision.question,
    alternative: alternative.id,
    label: alternative.label,
    ...(alternative.ends ? { ends: true as const } : {}),
  };
}

/** The decisions playback reaches with these choices, in order, and what plays at each. */
export function alternativesPlayed(scenario: ScenarioFile, choices: DecisionChoices): Played[] {
  return decisionsReached(scenario, choices).map(({ decision, alternative }) =>
    playedAt(decision, alternative),
  );
}

/** The alternatives holding a step, outermost first, as the tools say them. */
export function alternativesHolding(scenario: ScenarioFile, step: Id): Played[] {
  const read = readBlocks(scenario);
  if (!read.ok) return [];
  const at = scenario.steps.findIndex((each) => each.id === step);
  return read.decisions
    .flatMap((span) => {
      const holder = span.alternatives.find(
        (each) =>
          each.first !== undefined &&
          each.last !== undefined &&
          each.first <= at &&
          at <= each.last,
      );
      return holder ? [{ span, alternative: holder.alternative }] : [];
    })
    .sort((a, b) => a.span.depth - b.span.depth)
    .map(({ span, alternative }) => playedAt(span.decision, alternative));
}

// ——— Reading ———

/** Where a step sits, as read_scenario says it: its innermost decision and alternative. */
export interface Within {
  decision: Id;
  question: string;
  alternative: Id;
  label: string;
}

/**
 * A scenario's decisions as read_scenario gives them, in reading order: each with its question, the
 * alternative it plays by default and where it sits, and each alternative with the numbers of the
 * steps it holds, whether it ends the scenario, and its broken steps; and for each step the innermost
 * alternative holding it. Undefined without decisions; the core's words when they do not hold together.
 */
export function readDecisions(
  scenario: ScenarioFile,
  broken: ReadonlySet<number>,
):
  | undefined
  | { ok: false; message: string }
  | {
      ok: true;
      decisions: unknown[];
      within: Map<number, Within>;
    } {
  if (scenario.blocks === undefined || scenario.blocks.length === 0) return undefined;
  const read = readBlocks(scenario);
  if (!read.ok) return { ok: false, message: read.message };
  const within = new Map<number, Within & { depth: number }>();
  const decisions = read.decisions.map((span) => {
    const alternatives = span.alternatives.map(({ alternative, first, last }) => {
      const numbers: number[] = [];
      if (first !== undefined && last !== undefined) {
        for (let at = first; at <= last; at++) {
          numbers.push(at + 1);
          const known = within.get(at);
          if (!known || known.depth < span.depth) {
            within.set(at, {
              decision: span.decision.id,
              question: span.decision.question,
              alternative: alternative.id,
              label: alternative.label,
              depth: span.depth,
            });
          }
        }
      }
      const brokenHere = numbers.filter((number) => broken.has(number));
      return {
        id: alternative.id,
        label: alternative.label,
        steps: numbers,
        ...(alternative.ends ? { ends: true } : {}),
        ...(brokenHere.length > 0 ? { broken: brokenHere } : {}),
      };
    });
    return {
      id: span.decision.id,
      question: span.decision.question,
      playsByDefault: chosenAlternative(span.decision, undefined).id,
      ...(span.within ? { within: span.within } : {}),
      alternatives,
    };
  });
  const plain = new Map<number, Within>();
  for (const [at, { decision, question, alternative, label }] of within) {
    plain.set(at, { decision, question, alternative, label });
  }
  return { ok: true, decisions, within: plain };
}

/** "a", "a and b", "a, b and c". */
export function listed(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}

/** A decision's alternatives by id and label: "yes" (Yes) and "no" (No). */
function alternativesListed(block: DecisionBlock): string {
  return listed(block.alternatives.map((each) => `"${each.id}" (${each.label})`));
}
