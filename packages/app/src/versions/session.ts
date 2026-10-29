/**
 * Compare with… in one tab (ADR 0070): the version asked for, while the program reads it, or why it
 * could not; the program's latest listing as this tab heard it, which names a commit Claude asks for;
 * and the version each comparison shown came from, which its summary names. Whether the person chose
 * the version or Claude's guidance named it, the same path asks the program and shows the answer.
 */
import type { ListedVersion, ProjectSnapshot } from '@visual-anything/core';
import { useSyncExternalStore } from 'react';
import type { ComparisonRequest, ShownComparison } from '../canvas/comparison/mode';
import type { ComparisonDrawing } from '../canvas/comparison/scene';
import type { SummaryVersion } from '../export/comparison-summary';
import type { Translator } from '../i18n';
import type { ComparedResult, RequestProblem } from '../live/connection';
import type { Live } from '../live/context';
import { chosenOf, refOf, summaryVersionOf, versionTitle, type ChosenVersion } from './versions';

/** A version asked for: while the program reads it, or once it said why it could not. */
export type Asking =
  | { serial: number; chosen: ChosenVersion; state: 'waiting' }
  | { serial: number; chosen: ChosenVersion; state: 'refused'; problems: RequestProblem[] };

/** What comparing needs of the tab: the program to ask, and the canvas to show the answer on. */
export interface CompareWith {
  ask: NonNullable<Live['compareVersion']>;
  show: (request: ComparisonRequest) => unknown;
  t: Translator;
  /** The drawing the comparison opens on; the comparison unless said. */
  drawing?: ComparisonDrawing;
}

/** How a request to compare ended: shown, refused, or dropped for a later one or a cancel. */
export type Compared = 'shown' | 'refused' | 'dropped';

/** Which kind of version names a commit best, first to last. */
const NAMING: readonly ListedVersion['kind'][] = ['branch', 'tag', 'remote', 'head', 'commit'];

export class CompareSession {
  private asking: Asking | undefined;
  private serial = 0;
  private listing: readonly ListedVersion[] = [];
  /** The version the comparison shown last came from, by its older project. */
  private from: { older: ProjectSnapshot; chosen: ChosenVersion } | undefined;
  private readonly listeners = new Set<() => void>();

  /** The version asked for, or undefined; the same object until it changes. */
  get = (): Asking | undefined => this.asking;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Keeps the program's latest listing, as this tab heard it. */
  listed(versions: readonly ListedVersion[]): void {
    this.listing = versions;
  }

  /**
   * A commit named by Claude, as the guidance names it: the version this tab saw listed with that id,
   * by a branch's or a tag's name before HEAD and a commit's id, or else the commit alone.
   */
  named(commit: string): ChosenVersion {
    let best: ListedVersion | undefined;
    for (const each of this.listing) {
      if (each.commit !== commit) continue;
      if (!best || NAMING.indexOf(each.kind) < NAMING.indexOf(best.kind)) best = each;
    }
    return best ? chosenOf(best) : { kind: 'named', commit };
  }

  /**
   * Asks the program for a version and shows it as compared with the project now, which it follows;
   * a request asked later, or a cancel, drops the answer to this one.
   */
  async compare(chosen: ChosenVersion, { ask, show, t, drawing }: CompareWith): Promise<Compared> {
    this.serial += 1;
    const serial = this.serial;
    this.set({ serial, chosen, state: 'waiting' });
    let result: ComparedResult;
    try {
      result = await ask(refOf(chosen));
    } catch (error) {
      result = {
        ok: false,
        problems: [
          {
            code: 'program-failed',
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
    if (this.asking?.serial !== serial) return 'dropped';
    if (!result.ok) {
      this.set({ serial, chosen, state: 'refused', problems: result.problems });
      return 'refused';
    }
    this.from = { older: result.older, chosen };
    this.set(undefined);
    show({
      older: result.older,
      newer: result.newer,
      comparison: result.comparison,
      title: versionTitle(t, chosen),
      follows: true,
      ...(drawing === undefined ? {} : { drawing }),
    });
    return 'shown';
  }

  /** Stops waiting for the version asked for, or forgets why it could not be compared. */
  cancel(): void {
    if (this.asking) this.set(undefined);
  }

  /**
   * The two versions of a comparison shown, as its summary names them: the version Compare with…
   * asked for, and the project now; undefined for a comparison it did not show.
   */
  versionsOf(
    shown: ShownComparison,
    t: Translator,
    now: number = Date.now(),
  ): { older: SummaryVersion; newer: SummaryVersion } | undefined {
    if (this.from?.older !== shown.older) return undefined;
    return {
      older: summaryVersionOf(t, this.from.chosen),
      newer: { name: t('The project now'), date: now },
    };
  }

  private set(asking: Asking | undefined): void {
    this.asking = asking;
    for (const listener of this.listeners) listener();
  }
}

const NO_SESSION = { get: (): Asking | undefined => undefined, subscribe: () => () => {} };

/** The version Compare with… asked for, while the program reads it or once it refused it. */
export function useAsking(session: CompareSession | null): Asking | undefined {
  const store = session ?? NO_SESSION;
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
