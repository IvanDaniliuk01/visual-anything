/**
 * Approvals of explorables (ADR 0107), kept as package code's are (ADR 0060): the person's
 * preference `explorableApprovals`, outside every project, newest first, at most 1,024. Each approves
 * a frame's inputs by their hash: the explorable's text and its script libraries' hashes, in order.
 * Claude never approves; its write continues an approval only when the text it wrote over was
 * approved for that same explorable, and that approval says `by: 'claude'`.
 */
import type { Id } from '@visual-anything/schema';
import { sha256 } from '../code/hash';
import { isId } from '../ids';
import { MAX_EXPLORABLE_APPROVALS, type ExplorableApproval } from './types';

const HASH = /^[0-9a-f]{64}$/;

/** The SHA-256 of an explorable's text, in lowercase hexadecimal: what its definition's `hash` is. */
export function explorableTextHash(text: string): string {
  return sha256(text);
}

/**
 * The hash an approval is given for, from the text's hash and the script libraries' hashes in the
 * order the frame inlines them: the SHA-256 of `["explorable", textHash, libraryHashes]` as JSON.
 * The app works it out from the definitions alone; the text's hash is its definition's.
 */
export function approvalHashOf(textHash: string, libraryHashes: readonly string[]): string {
  return sha256(JSON.stringify(['explorable', textHash, [...libraryHashes]]));
}

export function explorableApprovalHash(text: string, libraryHashes: readonly string[]): string {
  return approvalHashOf(explorableTextHash(text), libraryHashes);
}

export function isApproved(approvals: readonly ExplorableApproval[], hash: string): boolean {
  return approvals.some((each) => each.hash === hash);
}

export function continuedApprovals(
  approvals: readonly ExplorableApproval[],
  explorable: Id,
  previous: string,
  next: string,
): ExplorableApproval[] {
  // Only an approval given to this same explorable continues (A10's review): a copy of an approved
  // text in another explorable never inherits it.
  const approvedHere = approvals.some(
    (each) => each.hash === previous && each.explorable === explorable,
  );
  if (!approvedHere || isApproved(approvals, next)) return [...approvals];
  return [{ hash: next, explorable, by: 'claude' as const }, ...approvals].slice(
    0,
    MAX_EXPLORABLE_APPROVALS,
  );
}

/** The approvals with the person's approval of this hash, newest first, in place of any with it. */
export function withExplorableApproval(
  approvals: readonly ExplorableApproval[],
  hash: string,
  explorable: Id,
): ExplorableApproval[] {
  return [
    { hash, explorable, by: 'person' as const },
    ...approvals.filter((each) => each.hash !== hash),
  ].slice(0, MAX_EXPLORABLE_APPROVALS);
}

/** The approvals without the one with this hash: revoked, its explorable shows its card again. */
export function withoutExplorableApproval(
  approvals: readonly ExplorableApproval[],
  hash: string,
): ExplorableApproval[] {
  return approvals.filter((each) => each.hash !== hash);
}

/**
 * Approvals as the preferences file holds them, read leniently: keys a later version adds are left
 * out; a list with any approval it cannot read cannot be read, and approves nothing.
 */
export function readExplorableApprovals(value: unknown): ExplorableApproval[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_EXPLORABLE_APPROVALS) return undefined;
  const approvals: ExplorableApproval[] = [];
  const seen = new Set<string>();
  for (const each of value as unknown[]) {
    if (typeof each !== 'object' || each === null || Array.isArray(each)) return undefined;
    const { hash, explorable, by } = each as Record<string, unknown>;
    if (typeof hash !== 'string' || !HASH.test(hash) || !isId(explorable)) return undefined;
    if (by !== 'person' && by !== 'claude') return undefined;
    if (seen.has(hash)) return undefined;
    seen.add(hash);
    approvals.push({ hash, explorable, by });
  }
  return approvals;
}

/** Approvals as an app sends them, checked strictly. */
export function checkExplorableApprovals(
  value: unknown,
): { ok: true; value: ExplorableApproval[] } | { ok: false; message: string } {
  if (!Array.isArray(value)) {
    return { ok: false, message: '"explorableApprovals" must be a list of approvals.' };
  }
  if (value.length > MAX_EXPLORABLE_APPROVALS) {
    return {
      ok: false,
      message: `"explorableApprovals" holds ${value.length} approvals, more than ${MAX_EXPLORABLE_APPROVALS}.`,
    };
  }
  for (const each of value as unknown[]) {
    if (
      typeof each !== 'object' ||
      each === null ||
      Array.isArray(each) ||
      Object.keys(each).some((key) => key !== 'hash' && key !== 'explorable' && key !== 'by')
    ) {
      return {
        ok: false,
        message:
          'An approval of an explorable has a hash, an explorable and who gave it, and nothing else.',
      };
    }
  }
  const read = readExplorableApprovals(value);
  if (read === undefined) {
    return {
      ok: false,
      message:
        'An approval of an explorable names its SHA-256 in 64 small hexadecimal digits, once, its explorable by id, and "person" or "claude".',
    };
  }
  return { ok: true, value: read };
}
