/**
 * The session's one proposal (ADR 0073): Claude's changes, waiting for the person's review, kept on top
 * of the project as it is now and only in the local program's memory. The core works everything out
 * (`propose`, `rebaseProposal`, `proposalChanges`, `acceptProposal`); this keeps the proposal that
 * waits, rebases it after every change of the project now, says what the apps and Claude are shown,
 * and remembers how the last one ended.
 *
 * Nothing here writes a file or touches the history: the session saves and records only the action an
 * acceptance makes.
 */
import {
  acceptProposal,
  operationsBetween,
  propose,
  proposalChanges,
  rebaseProposal,
  type Command,
  type CommandContext,
  type CommandOutcome,
  type Operation,
  type Problem,
  type ProjectSnapshot,
  type Proposal,
  type ProposalChanges,
  type ProposalClosedMessage,
  type ProposalShownMessage,
  type ProposeOutcome,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';

/**
 * The commands of Claude's that go to the project now even while the person reviews Claude's changes
 * or a proposal waits: comments, which are Claude's own words, signed as Claude (ADR 0073). The core's
 * `propose` refuses them, and `resolve-conflicts` too; but resolving conflicts is not here, since
 * conflicts are resolved with the review off (ADR 0073's clarification of 2026-10-29): while the
 * person reviews, a proposal waits or the command asks to be proposed, it goes to `propose`, which
 * refuses it.
 */
export const COMMENT_COMMANDS: ReadonlySet<string> = new Set([
  'create-thread',
  'add-comment',
  'edit-comment',
  'resolve-thread',
  'delete-thread',
]);

/**
 * Whether a command of Claude's goes to the project now whatever the review says: every command it
 * holds, a batch's included, is a comment's. A batch that mixes them with other commands is proposed,
 * and `propose` refuses it, so that Claude sends its comments on their own.
 */
export function goesToProjectNow(command: Command): boolean {
  if (typeof command !== 'object' || command === null) return false;
  if (command.type === 'batch') {
    const { commands } = command as { commands?: unknown };
    return (
      Array.isArray(commands) &&
      commands.length > 0 &&
      commands.every((each) => goesToProjectNow(each as Command))
    );
  }
  return COMMENT_COMMANDS.has(command.type);
}

/** How long a program started with `--stop-when-idle` keeps a waiting proposal after its last change. */
export const PROPOSAL_IDLE_LIMIT = 60 * 60_000;

/** How the last proposal ended, as `read_proposal` says it. */
export type ProposalEnding = Omit<ProposalClosedMessage, 'type' | 'requestId'>;

/** What an acceptance came to: the core's outcome and the keys of the changes it took, or why not. */
export type Accepted =
  | {
      ok: true;
      outcome: Extract<CommandOutcome, { ok: true }>;
      /** The keys of the changes accepted. */
      accepted: string[];
      /** How many changes the proposal held. */
      total: number;
    }
  | { ok: false; problems: Problem[] };

/** Why nothing was decided: no proposal waits. */
export const NO_PROPOSAL = 'No proposal of Claude’s waits, so nothing was decided.';

/** Why an acceptance of a revision the proposal no longer is was refused. */
export const STALE_PROPOSAL = 'The proposal changed since it was shown: review it again.';

/** The session's proposal: at most one, which grows until the person decides. */
export class SessionProposal {
  #open: Proposal | undefined;
  /** Its changes, worked out once for each state of the proposal. */
  #listed: { proposal: Proposal; changes: ProposalChanges } | undefined;
  /** When the last change joined it, in milliseconds since 1970. */
  #lastJoined: number | undefined;
  #ended: ProposalEnding | undefined;
  /** Raised each time the proposal is shown anew; it goes on counting from one proposal to the next. */
  #revision = 0;
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  /** The proposal that waits, if any. */
  get open(): Proposal | undefined {
    return this.#open;
  }

  /** When the last change joined the proposal that waits; undefined when none waits. */
  get lastJoined(): number | undefined {
    return this.#open === undefined ? undefined : this.#lastJoined;
  }

  /** How the last proposal ended; undefined before one has. */
  get ended(): ProposalEnding | undefined {
    return this.#ended;
  }

  /**
   * Runs a command of Claude's on the proposed project, the proposal's or the project now's for the
   * first, which opens it; the project now never changes. A command that changes nothing opens none.
   */
  propose(
    project: ProjectSnapshot,
    command: Command,
    context: CommandContext,
  ): { outcome: ProposeOutcome; joined: boolean } {
    const outcome = propose(this.#open, project, command, context);
    if (!outcome.ok || outcome.proposal === undefined) return { outcome, joined: false };
    // A command that joins adds its label; one that changes nothing leaves the proposal as it was.
    const joined = outcome.proposal.labels.length !== (this.#open?.labels.length ?? 0);
    if (joined) this.#lastJoined = this.#now();
    this.#open = outcome.proposal;
    return { outcome, joined };
  }

  /**
   * Rebases the proposal that waits on the project as it is now, after the operations that changed
   * it, or after a reload when none are given; does nothing when none waits.
   */
  rebase(project: ProjectSnapshot, operations?: readonly Operation[]): void {
    if (this.#open === undefined) return;
    this.#open = rebaseProposal(this.#open, project, operations);
  }

  /** The proposal's changes, each with what it needs and whether the person changed it too. */
  changes(): ProposalChanges | undefined {
    const open = this.#open;
    if (open === undefined) return undefined;
    if (this.#listed?.proposal !== open) {
      this.#listed = { proposal: open, changes: proposalChanges(open) };
    }
    return this.#listed.changes;
  }

  /** The keys of the proposal's changes, in the comparison's order. */
  changeKeys(): string[] {
    return this.changes()?.changes.map((each) => each.key) ?? [];
  }

  /** The revision of the proposal last shown, which an acceptance must name. */
  get revision(): number {
    return this.#revision;
  }

  /**
   * What every app and Claude are shown of the proposal that waits; undefined when none waits. With
   * `anew`, after the proposal changed or was rebased, it gets the next revision; without, as when an
   * app connects, it is shown at the revision last shown.
   */
  shown(anew: boolean): ProposalShownMessage | undefined {
    const open = this.#open;
    const listed = this.changes();
    if (open === undefined || listed === undefined) return undefined;
    if (anew) this.#revision += 1;
    return {
      type: 'proposal/shown',
      proposal: {
        id: open.id,
        revision: this.#revision,
        labels: [...open.labels],
        operations: operationsBetween(open.base, open.proposed),
        changes: listed.changes.map(({ key, change, needs, changedByYou }) => ({
          key,
          change,
          needs,
          changedByYou,
        })),
        names: listed.comparison.names,
      },
    };
  }

  /** Why a proposal an app names is not the one that waits; undefined when it is. */
  check(id: Id): Problem | undefined {
    if (this.#open === undefined) return { code: 'invalid-command', message: NO_PROPOSAL };
    if (this.#open.id !== id) {
      return {
        code: 'invalid-command',
        message: `The proposal "${id}" is no longer the one that waits, so nothing was decided.`,
      };
    }
    return undefined;
  }

  /**
   * Works out the acceptance of some changes, or all of them, on the project now: one action of
   * Claude's, which keeps what the person did meanwhile. The proposal stays open until it is closed,
   * once the action is saved.
   */
  accept(
    project: ProjectSnapshot,
    changes: readonly string[] | 'all',
    context: CommandContext,
  ): Accepted {
    const open = this.#open;
    if (open === undefined) {
      return { ok: false, problems: [{ code: 'invalid-command', message: NO_PROPOSAL }] };
    }
    const keys = this.changeKeys();
    const outcome = acceptProposal(open, project, changes, context);
    if (!outcome.ok) return outcome;
    const chosen = new Set(changes === 'all' ? keys : changes);
    return {
      ok: true,
      outcome,
      accepted: keys.filter((key) => chosen.has(key)),
      total: keys.length,
    };
  }

  /** Closes the proposal that waits, and says how; undefined when none waits. */
  close(how: ProposalClosedMessage['how'], accepted?: string[]): ProposalClosedMessage | undefined {
    const open = this.#open;
    if (open === undefined) return undefined;
    this.#open = undefined;
    this.#listed = undefined;
    this.#lastJoined = undefined;
    const ending: ProposalEnding = {
      proposal: open.id,
      how,
      ...(accepted === undefined ? {} : { accepted }),
    };
    this.#ended = ending;
    return { type: 'proposal/closed', ...ending };
  }
}
