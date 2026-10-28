/**
 * Choosing at a scenario's decisions (ADR 0078), as the app's scenario session and the read-only
 * page's playback both do: where playback goes once an alternative is chosen, where Stop at each
 * decision pauses, the choices that reach a step of an alternative not chosen, and what each of them
 * says. The choices belong to the tab: nothing here is stored.
 */
import {
  choicesToReach,
  chosenAlternative,
  decisionsAt,
  playedSteps,
  readBlocks,
} from '@visual-anything/core';
import type { DecisionChoices, Id, ScenarioFile } from '@visual-anything/schema';
import { t } from '../i18n';
import type { RecordingPlace } from './record-decisions';

/** An alternative of a decision, by their ids. */
export interface Chosen {
  decision: Id;
  alternative: Id;
}

/** No choices made: every decision plays its default. */
export const NO_CHOICES: DecisionChoices = Object.freeze({});

/** Recording after the current step, as it does unless asked otherwise. */
export const AFTER_STEP: RecordingPlace = Object.freeze({ kind: 'after-step' as const });

/** Whether a scenario holds decisions that hold together, which the panels then show. */
export function hasDecisions(scenario: Pick<ScenarioFile, 'steps' | 'blocks'>): boolean {
  if (scenario.blocks === undefined || scenario.blocks.length === 0) return false;
  const read = readBlocks(scenario);
  return read.ok && read.decisions.length > 0;
}

/** The choices with one more made, a new object; the same when it is made already. */
export function withChoice(choices: DecisionChoices, chosen: Chosen): DecisionChoices {
  return choices[chosen.decision] === chosen.alternative
    ? choices
    : { ...choices, [chosen.decision]: chosen.alternative };
}

/**
 * Where playback goes once a decision's alternative is chosen, by the step's index: the step it is
 * on while the choices still play it; else the first step of the alternative chosen that plays; else
 * the first step that plays after the decision; else the last that plays.
 */
export function stepAfterChoice(
  scenario: ScenarioFile,
  choices: DecisionChoices,
  step: number,
  decision: Id,
): number {
  const played = playedSteps(scenario, choices);
  if (played.includes(step)) return step;
  const read = readBlocks(scenario);
  const span = read.ok ? read.decisions.find((each) => each.decision.id === decision) : undefined;
  const alternative = span?.alternatives.find(
    (each) => each.alternative.id === choices[decision] && each.first !== undefined,
  );
  if (alternative?.first !== undefined && alternative.last !== undefined) {
    const { first, last } = alternative;
    const inside = played.find((at) => at >= first && at <= last);
    if (inside !== undefined) return inside;
  }
  if (span) {
    const after = played.find((at) => at > span.last);
    if (after !== undefined) return after;
  }
  return played.at(-1) ?? 0;
}

/**
 * The decision Stop at each decision pauses before, when playback goes from the step at `from` on to
 * another: the first that playback reaches after it, before the next step that plays.
 */
export function decisionAhead(
  scenario: ScenarioFile,
  choices: DecisionChoices,
  from: number,
): Chosen | undefined {
  const ahead = decisionsAt(scenario, from, choices).find((each) => each.place === 'ahead');
  return ahead && { decision: ahead.decision.id, alternative: ahead.alternative.id };
}

/**
 * The choices that make a scenario play a step it does not play now, by the step's index, and the
 * alternatives they change; undefined when it plays already, or no choices reach it.
 */
export function choicesReaching(
  scenario: ScenarioFile,
  step: number,
  choices: DecisionChoices,
): { choices: DecisionChoices; changed: Chosen[] } | undefined {
  if (playedSteps(scenario, choices).includes(step)) return undefined;
  const id = scenario.steps[step]?.id;
  const reached = id === undefined ? undefined : choicesToReach(scenario, id, choices);
  if (!reached) return undefined;
  return { choices: reached, changed: alternativesChanged(scenario, choices, reached) };
}

/**
 * The alternatives that play once `after` replaces `before`, at each decision where they differ:
 * what plays at a decision is its choice, or else its default, so only a change of that counts.
 */
export function alternativesChanged(
  scenario: Pick<ScenarioFile, 'blocks'>,
  before: DecisionChoices,
  after: DecisionChoices,
): Chosen[] {
  return (scenario.blocks ?? []).flatMap((block) => {
    const now = chosenAlternative(block, before).id;
    const then = chosenAlternative(block, after).id;
    return now === then ? [] : [{ decision: block.id, alternative: then }];
  });
}

/** The question and the label of a chosen alternative, as the scenario holds them. */
export function wordsOf(
  scenario: Pick<ScenarioFile, 'blocks'>,
  chosen: Chosen,
): { question: string; label: string } | undefined {
  const decision = scenario.blocks?.find((each) => each.id === chosen.decision);
  const alternative = decision?.alternatives.find((each) => each.id === chosen.alternative);
  return decision && alternative
    ? { question: decision.question, label: alternative.label }
    : undefined;
}

/** What choosing says: "“No” plays at “Is every item in stock?”." */
export function sayChosen(scenario: Pick<ScenarioFile, 'blocks'>, chosen: Chosen): string {
  const words = wordsOf(scenario, chosen);
  return words ? t('“{label}” plays at “{question}”.', words) : '';
}

/** What going to a step of an alternative not chosen says, with the alternatives it chose. */
export function sayReached(scenario: Pick<ScenarioFile, 'blocks'>, changed: Chosen[]): string {
  return changed.map((each) => sayChosen(scenario, each)).join(' ');
}

/** What pausing before a decision says, for the person to think what happens. */
export function sayStopped(scenario: Pick<ScenarioFile, 'blocks'>, chosen: Chosen): string {
  const words = wordsOf(scenario, chosen);
  return words ? t('Paused before “{question}”. Choose an alternative, then play on.', words) : '';
}
