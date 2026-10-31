/**
 * The review of Claude's proposal in one tab (ADR 0073): whether the person is reviewing it, and the
 * ticks of its changes, kept as the program shows the proposal anew. Nothing of it is stored: the
 * proposal lives in the local program, and the ticks in the tab that reviews it.
 */
import type { Comparison, ShownProposalChange } from '@visual-anything/core';
import { createContext, useContext, useSyncExternalStore } from 'react';
import type { WaitingProposal } from '../live/connection';
import { carryTicks, initialTicks, tickChanges, type Ticked } from './ticks';

/** What the review holds now. */
export interface ReviewSnapshot {
  /** Whether the review shows: the proposal drawn on the canvas, and its changes in the Changes tab. */
  reviewing: boolean;
  /** The proposal the ticks are for, as the program showed it last. */
  proposal: WaitingProposal | undefined;
  /** The keys of the changes ticked. */
  ticked: ReadonlySet<string>;
}

const NO_TICKS: ReadonlySet<string> = new Set();

export class ProposalReview {
  private snapshot: ReviewSnapshot = { reviewing: false, proposal: undefined, ticked: NO_TICKS };
  private readonly listeners = new Set<() => void>();

  get = (): ReviewSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Follows the proposal the program shows: a new one starts with its first ticks, one shown anew
   * keeps the person's, and once none waits the review ends.
   */
  follow(proposal: WaitingProposal | undefined): void {
    const last = this.snapshot.proposal;
    if (proposal === last) return;
    if (proposal === undefined) {
      this.set({ reviewing: false, proposal: undefined, ticked: NO_TICKS });
      return;
    }
    const ticked =
      last?.shown.id === proposal.shown.id
        ? carryTicks(last.shown.changes, this.snapshot.ticked, proposal.shown.changes)
        : initialTicks(proposal.shown.changes);
    const reviewing = this.snapshot.reviewing && last?.shown.id === proposal.shown.id;
    this.set({ reviewing, proposal, ticked });
  }

  /** Opens the review of the proposal that waits. */
  open(): void {
    if (this.snapshot.proposal !== undefined && !this.snapshot.reviewing) {
      this.set({ ...this.snapshot, reviewing: true });
    }
  }

  /** Ends the review; the proposal still waits. */
  close(): void {
    if (this.snapshot.reviewing) this.set({ ...this.snapshot, reviewing: false });
  }

  /** Ticks or unticks changes, with what they need or what needs them; says which it turned too. */
  tick(keys: readonly string[], on: boolean): Ticked['also'] {
    const { proposal, ticked } = this.snapshot;
    if (proposal === undefined) return [];
    const next = tickChanges(proposal.shown.changes, ticked, keys, on);
    this.set({ ...this.snapshot, ticked: next.ticked });
    return next.also;
  }

  private set(snapshot: ReviewSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of [...this.listeners]) listener();
  }
}

/** The proposal's changes as a comparison of the project now with the proposed one (ADR 0070). */
export function comparisonOf(changes: readonly ShownProposalChange[], names: Comparison['names']) {
  const comparison: Comparison = {
    changes: changes.map((each) => each.change),
    counts: { added: 0, removed: 0, changed: 0, moved: 0 },
    names,
  };
  for (const each of comparison.changes) comparison.counts[each.status] += 1;
  return comparison;
}

/** The tab's review; null outside the shell. */
export const ProposalReviewContext = createContext<ProposalReview | null>(null);

const NO_REVIEW = {
  get: (): ReviewSnapshot | undefined => undefined,
  subscribe: () => () => {},
};

/** The tab's review as it is now; undefined outside the shell. */
export function useReview(): { review: ProposalReview; snapshot: ReviewSnapshot } | undefined {
  const review = useContext(ProposalReviewContext);
  const store = review ?? NO_REVIEW;
  const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get);
  return review && snapshot ? { review, snapshot } : undefined;
}
