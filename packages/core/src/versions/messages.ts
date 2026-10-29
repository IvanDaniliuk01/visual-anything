/**
 * The live protocol's messages about versions (ADR 0071) and proposals (ADR 0073).
 *
 * - An app, or Claude's endpoint, asks for the versions the program can list, and to compare one of
 *   them, named only as the program listed it, with the project now. The program answers with the
 *   versions, with the version's project and its comparison worked out, or with why it cannot.
 * - The program shows every app, and Claude, the proposal that waits after each change to it, as the
 *   operations from the project now to the proposed one and its changes; an app accepts some or all
 *   of them, or refuses them; and every app hears how the proposal closed.
 *
 * Each reader of what an app or Claude sends keeps only what its message holds, or says why it cannot
 * be read; the live protocol turns that into its own error. What the program sends is read by its
 * envelope only, as the program's projects and operations are.
 */
import type { Id } from '@visual-anything/schema';
import { isId } from '../ids';
import type { Operation } from '../operations';
import type { Problem } from '../problems';
import type { ProjectSnapshot } from '../snapshot';
import type { Change, Comparison } from './compare';

/** A version an app or Claude names: the project as the program opened it, or a commit it listed. */
export type VersionRef = { kind: 'opened' } | { kind: 'commit'; commit: string };

/** A version the program lists (ADR 0071): what names it, and its commit. */
export interface ListedVersion {
  /** `HEAD`, a local branch, a remote-tracking branch, a tag, or a recent commit on `HEAD`. */
  kind: 'head' | 'branch' | 'remote' | 'tag' | 'commit';
  /** The branch's or tag's name as git gave it, shown as text only; absent for HEAD and a commit. */
  name?: string;
  /** Its commit's id: 40 or 64 hexadecimal digits. */
  commit: string;
  /** The commit's short id. */
  short: string;
  /** The first line of the commit's subject, at most {@link MAX_SUBJECT} characters. */
  subject: string;
  /** Its author's name; the email is never read. */
  author: string;
  /** When it was made, in milliseconds since 1970. */
  time: number;
}

/** The longest subject a listed version carries. */
export const MAX_SUBJECT = 200;

/** Asks for the versions the program can list. */
export interface VersionsListMessage {
  type: 'versions/list';
  requestId: string;
}

/** The versions the program listed, newest first in each kind, or why it could list none. */
export interface VersionsListedMessage {
  type: 'versions/listed';
  requestId: string;
  versions: ListedVersion[];
  /** Why no commit could be listed, such as a folder outside any repository; absent when some were. */
  why?: string;
}

/** Asks to compare a version with the project now, for every view or for one. */
export interface VersionCompareMessage {
  type: 'version/compare';
  requestId: string;
  version: VersionRef;
  view?: Id;
}

/**
 * The comparison of the version asked for with the project now (ADR 0070): the version is the older,
 * the project now the newer. An app gets the version's project too, to draw it; Claude's endpoint
 * does not (ADR-0029).
 */
export interface VersionComparedMessage {
  type: 'version/compared';
  requestId: string;
  version: VersionRef;
  project?: ProjectSnapshot;
  comparison: Comparison;
}

/** Why a version could not be compared: no git, a commit not listed, or files that do not open. */
export interface VersionRefusedMessage {
  type: 'version/refused';
  requestId: string;
  problems: Problem[];
}

/** One change of a proposal as the apps show it: its key, the change, what it needs, and whose too. */
export interface ShownProposalChange {
  key: string;
  change: Change;
  needs: string[];
  changedByYou: boolean;
}

/**
 * The proposal that waits, sent to every app and to Claude whenever it opens or changes: the
 * operations that turn the project now into the proposed one, and its changes.
 */
export interface ProposalShownMessage {
  type: 'proposal/shown';
  proposal: {
    id: Id;
    /** The labels of Claude's commands that joined it, oldest first. */
    labels: string[];
    operations: Operation[];
    changes: ShownProposalChange[];
    /** Every id the changes mention, with its name in either project. */
    names: Comparison['names'];
  };
}

/** Accepts some of a proposal's changes, by their keys, or all of them. */
export interface ProposalAcceptMessage {
  type: 'proposal/accept';
  requestId: string;
  proposal: Id;
  changes: string[] | 'all';
}

/** Refuses a proposal whole. */
export interface ProposalRefuseMessage {
  type: 'proposal/refuse';
  requestId: string;
  proposal: Id;
}

/** How a proposal closed: accepted, some or all; refused; withdrawn by Claude; or dropped. */
export interface ProposalClosedMessage {
  type: 'proposal/closed';
  proposal: Id;
  how: 'accepted' | 'refused' | 'withdrawn' | 'dropped';
  /** For an accepted proposal: the keys of the changes accepted. */
  accepted?: string[];
  /** The request this answers; only the app that decided gets it. */
  requestId?: string;
}

/** The most changes one acceptance names, and the longest key of one. */
export const MAX_ACCEPTED = 100_000;
export const MAX_CHANGE_KEY = 1000;

/** A message read, or why it could not be. */
export type VersionMessageRead<T> = { ok: true; message: T } | { ok: false; reason: string };

/** Whether text is a commit id: 40 or 64 hexadecimal digits, in lower case. */
export function isCommitId(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value);
}

/** Reads a version an app or Claude names. */
export function readVersionRef(value: unknown): VersionMessageRead<VersionRef> {
  if (isRecord(value) && value.kind === 'opened') return { ok: true, message: { kind: 'opened' } };
  if (isRecord(value) && value.kind === 'commit' && isCommitId(value.commit)) {
    return { ok: true, message: { kind: 'commit', commit: value.commit } };
  }
  return {
    ok: false,
    reason: 'A version is the project as opened, or a commit the program listed, by its id.',
  };
}

/** Reads a request to compare a version with the project now. */
export function readVersionCompare(
  message: Record<string, unknown>,
  requestId: string,
): VersionMessageRead<VersionCompareMessage> {
  const version = readVersionRef(message.version);
  if (!version.ok) return version;
  if (message.view !== undefined && !isId(message.view)) {
    return { ok: false, reason: 'The view to compare is named by its id.' };
  }
  return {
    ok: true,
    message: {
      type: 'version/compare',
      requestId,
      version: version.message,
      ...(message.view === undefined ? {} : { view: message.view }),
    },
  };
}

/** Reads an app's acceptance of a proposal's changes. */
export function readProposalAccept(
  message: Record<string, unknown>,
  requestId: string,
): VersionMessageRead<ProposalAcceptMessage> {
  if (!isId(message.proposal)) return { ok: false, reason: 'A proposal is named by its id.' };
  const { changes } = message;
  if (changes === 'all') {
    return {
      ok: true,
      message: { type: 'proposal/accept', requestId, proposal: message.proposal, changes: 'all' },
    };
  }
  if (
    !Array.isArray(changes) ||
    changes.length > MAX_ACCEPTED ||
    !changes.every(
      (each) => typeof each === 'string' && each !== '' && each.length <= MAX_CHANGE_KEY,
    )
  ) {
    return {
      ok: false,
      reason: `Accepting names "all" the changes, or at most ${MAX_ACCEPTED} of them by their keys.`,
    };
  }
  return {
    ok: true,
    message: {
      type: 'proposal/accept',
      requestId,
      proposal: message.proposal,
      changes: [...(changes as string[])],
    },
  };
}

/** Reads an app's refusal of a proposal. */
export function readProposalRefuse(
  message: Record<string, unknown>,
  requestId: string,
): VersionMessageRead<ProposalRefuseMessage> {
  if (!isId(message.proposal)) return { ok: false, reason: 'A proposal is named by its id.' };
  return { ok: true, message: { type: 'proposal/refuse', requestId, proposal: message.proposal } };
}

/** Reads the versions the program listed, keeping only what each holds. */
export function readListedVersions(value: unknown): VersionMessageRead<ListedVersion[]> {
  if (!Array.isArray(value)) return { ok: false, reason: 'The versions listed are a list.' };
  const versions: ListedVersion[] = [];
  for (const each of value) {
    if (!isRecord(each)) return { ok: false, reason: 'A version listed is an object.' };
    const { kind, name, commit, short, subject, author, time } = each;
    if (
      (kind !== 'head' &&
        kind !== 'branch' &&
        kind !== 'remote' &&
        kind !== 'tag' &&
        kind !== 'commit') ||
      (name !== undefined && typeof name !== 'string') ||
      !isCommitId(commit) ||
      typeof short !== 'string' ||
      typeof subject !== 'string' ||
      subject.length > MAX_SUBJECT ||
      typeof author !== 'string' ||
      typeof time !== 'number' ||
      !Number.isFinite(time)
    ) {
      return {
        ok: false,
        reason: 'A version listed has its kind, its commit, its subject, author and time.',
      };
    }
    versions.push({
      kind,
      ...(name === undefined ? {} : { name }),
      commit,
      short,
      subject,
      author,
      time,
    });
  }
  return { ok: true, message: versions };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
