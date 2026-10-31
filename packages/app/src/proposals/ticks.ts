/**
 * The ticks of a proposal's changes (ADR 0073): which of them the person accepts with "Accept the
 * ticked changes".
 *
 * - Every change starts ticked, but those the person changed too, which start unticked, so that the
 *   person's own edit stays unless they take Claude's.
 * - Ticking a change ticks what it needs; unticking one unticks what needs it, each as far as it goes.
 *   So the ticked changes always hold what they need, and an acceptance of them is never refused for
 *   lacking one: a change that needs one the person left unticked starts unticked too.
 * - When the proposal is shown anew, the person's ticks stay for the changes it still holds; its new
 *   changes start as above.
 */
import type { ShownProposalChange } from '@visual-anything/core';

/** What ticking or unticking some changes came to: the ticks now, and the others it turned too. */
export interface Ticked {
  ticked: ReadonlySet<string>;
  /** The keys of the changes turned besides those asked for, in the proposal's order. */
  also: string[];
}

/** Every change ticked, but those changed by the person too and what needs them. */
export function initialTicks(changes: readonly ShownProposalChange[]): ReadonlySet<string> {
  const ticked = new Set(changes.filter((each) => !each.changedByYou).map((each) => each.key));
  return closed(changes, ticked);
}

/**
 * Ticks or unticks some changes, by their keys: ticking ticks what they need, unticking unticks what
 * needs them, as far as each goes.
 */
export function tickChanges(
  changes: readonly ShownProposalChange[],
  ticked: ReadonlySet<string>,
  keys: readonly string[],
  on: boolean,
): Ticked {
  const known = new Set(changes.map((each) => each.key));
  const asked = keys.filter((key) => known.has(key));
  const next = new Set(ticked);
  const reached = on ? needed(changes, asked) : needing(changes, asked);
  for (const key of reached) {
    if (on) next.add(key);
    else next.delete(key);
  }
  const askedSet = new Set(asked);
  const also = changes
    .map((each) => each.key)
    .filter((key) => reached.has(key) && !askedSet.has(key) && ticked.has(key) !== on);
  return { ticked: next, also };
}

/**
 * The ticks for the proposal shown anew: the person's for the changes it still holds, the first ticks
 * for its new ones, then what needs a change left unticked unticked too.
 */
export function carryTicks(
  before: readonly ShownProposalChange[],
  ticked: ReadonlySet<string>,
  changes: readonly ShownProposalChange[],
): ReadonlySet<string> {
  const known = new Set(before.map((each) => each.key));
  const next = new Set<string>();
  for (const change of changes) {
    const keep = known.has(change.key) ? ticked.has(change.key) : !change.changedByYou;
    if (keep) next.add(change.key);
  }
  return closed(changes, next);
}

/** The ticks with every change that needs an unticked one unticked, as far as it goes. */
function closed(
  changes: readonly ShownProposalChange[],
  ticked: ReadonlySet<string>,
): ReadonlySet<string> {
  const unticked = changes.map((each) => each.key).filter((key) => !ticked.has(key));
  if (unticked.length === 0) return ticked;
  const next = new Set(ticked);
  for (const key of needing(changes, unticked)) next.delete(key);
  return next;
}

/** The changes these keys need, as far as it goes, with themselves. */
function needed(changes: readonly ShownProposalChange[], keys: readonly string[]): Set<string> {
  const byKey = new Map(changes.map((each) => [each.key, each]));
  const reached = new Set<string>();
  const queue = [...keys];
  while (queue.length > 0) {
    const key = queue.pop() as string;
    if (reached.has(key) || !byKey.has(key)) continue;
    reached.add(key);
    queue.push(...(byKey.get(key)?.needs ?? []));
  }
  return reached;
}

/** The changes that need these keys, as far as it goes, with themselves. */
function needing(changes: readonly ShownProposalChange[], keys: readonly string[]): Set<string> {
  const neededBy = new Map<string, string[]>();
  for (const change of changes) {
    for (const need of change.needs) {
      const list = neededBy.get(need) ?? [];
      list.push(change.key);
      neededBy.set(need, list);
    }
  }
  const known = new Set(changes.map((each) => each.key));
  const reached = new Set<string>();
  const queue = [...keys];
  while (queue.length > 0) {
    const key = queue.pop() as string;
    if (reached.has(key) || !known.has(key)) continue;
    reached.add(key);
    queue.push(...(neededBy.get(key) ?? []));
  }
  return reached;
}

/** The keys of the changes that need this one, directly, in the proposal's order. */
export function neededBy(changes: readonly ShownProposalChange[], key: string): string[] {
  return changes.filter((each) => each.needs.includes(key)).map((each) => each.key);
}
