/**
 * Changes that an action or an importer of a package answers, on their way to the person's review
 * (ADR 0089's M14.0 and M14.3 clarifications). Running one says that it runs, since a call may take
 * up to 2 s; its answer is previewed by the core (`previewPackageChanges`): the comparison of the
 * project now and with the changes, and the one command that applies them all as the person's
 * action. The review shows them as Compare with… shows a comparison, with Accept and Decline. Nothing
 * changes until the person accepts; declining drops them.
 *
 * Accepting first previews the changes again on the project as it is then (ADR 0089, M14's review):
 * the project may have changed under the review, by Undo, by another tab or by Claude. Only when the
 * comparison is the one shown is the command sent; otherwise the review shows the new comparison in
 * its place, saying the project changed, and the person accepts again what they now see.
 */
import {
  previewPackageChanges,
  type ChangesPreview,
  type PackageCodeChanges,
  type Problem,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { PackageAnswer } from '../code/messages';
import type { OfferingPackage } from './offered';

/** What to run: an action or an importer of a package, by the label its file gives it. */
export interface PackageChangesRequest {
  package: OfferingPackage;
  /** What is run, in the package's own words: the action's or the importer's label. */
  label: string;
  /** Calls the package's code, which answers the changes or the problem. */
  ask: () => Promise<PackageAnswer<PackageCodeChanges>>;
  /** Whether what asked shows that it runs itself, as the Import dialog does. */
  quiet?: boolean;
}

/** What the person reviews: the changes, previewed against the project as it was then. */
export interface PackageChangesReview {
  request: PackageChangesRequest;
  changes: PackageCodeChanges;
  preview: Extract<ChangesPreview, { ok: true }>;
  /** The project the changes were previewed on: the older side of the comparison. */
  older: ProjectSnapshot;
  /**
   * Whether this preview took the place of one shown before, since the project changed under it and
   * the changes no longer came to the comparison shown.
   */
  moved?: true;
}

/** What previewing the changes under review again, as the person accepts them, came to. */
export type PackageRecheck =
  /** The comparison is the one shown: the command may be sent. */
  | { kind: 'same'; command: Extract<ChangesPreview, { ok: true }>['command'] }
  /** The project changed so that the comparison differs: the review now shows the new one. */
  | { kind: 'moved' }
  /** The changes no longer apply to the project as it is: why. The review stays. */
  | { kind: 'refused'; problems: Problem[] }
  /** There is no review, or no project, to preview them on. */
  | { kind: 'gone' };

export type PackageChangesState =
  | { state: 'idle' }
  | { state: 'running'; request: PackageChangesRequest }
  | ({ state: 'reviewing' } & PackageChangesReview);

/** How a run ended. */
export type PackageRunOutcome =
  /** Its changes wait for the person's review. */
  | { kind: 'review' }
  /** The code answered no commands, so there is nothing to review. */
  | { kind: 'none' }
  /** The call failed or was refused: the problem, naming the package. */
  | { kind: 'failed'; problem: Problem }
  /** The changes break a rule of the core, so they cannot apply: why. */
  | { kind: 'refused'; problems: Problem[] }
  /** Another run had not ended yet, so this one did not start. */
  | { kind: 'busy' }
  /** The review of another run took its place before it ended. */
  | { kind: 'dropped' };

const IDLE: PackageChangesState = Object.freeze({ state: 'idle' });

/** The run under way or the review shown, one at a time. */
export class PackageChangesStore {
  private state: PackageChangesState = IDLE;
  private readonly listeners = new Set<() => void>();
  private project: () => ProjectSnapshot | undefined = () => undefined;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly snapshot = (): PackageChangesState => this.state;

  /** Lends the project as the tab holds it, which the changes are previewed on. */
  attach(project: () => ProjectSnapshot | undefined): () => void {
    this.project = project;
    return () => {
      if (this.project === project) this.project = () => undefined;
    };
  }

  /**
   * Runs an action or an importer: it says that it runs until the code answers, then shows the
   * changes for review, or ends with why there is nothing to review. One runs at a time.
   */
  async run(request: PackageChangesRequest): Promise<PackageRunOutcome> {
    if (this.state.state === 'running') return { kind: 'busy' };
    const running: PackageChangesState = { state: 'running', request };
    this.change(running);
    const answer = await request.ask();
    // Closed meanwhile, or the review of another run took its place.
    if (this.snapshot() !== running) return { kind: 'dropped' };
    const outcome = this.reviewOf(request, answer);
    if (outcome.kind !== 'review') this.change(IDLE);
    return outcome;
  }

  /**
   * Previews the changes under review again on the project as it is now, as the person accepts
   * them: the same comparison lets the command go; a different one replaces the review, marked as
   * moved, so that what is applied is always what the person saw.
   */
  recheck(): PackageRecheck {
    const shown = this.state;
    if (shown.state !== 'reviewing') return { kind: 'gone' };
    const now = this.project();
    if (now === undefined) return { kind: 'gone' };
    if (now === shown.older) return { kind: 'same', command: shown.preview.command };
    const preview = previewPackageChanges(now, shown.changes);
    if (!preview.ok) return { kind: 'refused', problems: preview.problems };
    if (JSON.stringify(preview.comparison) === JSON.stringify(shown.preview.comparison)) {
      return { kind: 'same', command: preview.command };
    }
    this.change({
      state: 'reviewing',
      request: shown.request,
      changes: shown.changes,
      preview,
      older: now,
      moved: true,
    });
    return { kind: 'moved' };
  }

  /** Drops the changes under review, or forgets a run under way: nothing is applied. */
  close(): void {
    if (this.state.state !== 'idle') this.change(IDLE);
  }

  private reviewOf(
    request: PackageChangesRequest,
    answer: PackageAnswer<PackageCodeChanges>,
  ): PackageRunOutcome {
    if (!answer.ok) return { kind: 'failed', problem: answer.problem };
    const changes = answer.value;
    if (changes.commands.length === 0) return { kind: 'none' };
    const older = this.project();
    if (older === undefined) return { kind: 'dropped' };
    const preview = previewPackageChanges(older, changes);
    if (!preview.ok) return { kind: 'refused', problems: preview.problems };
    this.change({ state: 'reviewing', request, changes, preview, older });
    return { kind: 'review' };
  }

  private change(state: PackageChangesState): void {
    this.state = state;
    for (const listener of [...this.listeners]) listener();
  }
}
