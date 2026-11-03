/**
 * Approvals of package code (ADR 0054): the person approves a package's code, and each capability it
 * declares, by the hash of its text and capabilities. Approvals are the person's preferences, never
 * the project's, so that a cloned repository cannot approve itself; any change to the code or to its
 * capabilities changes the hash, and asks again.
 */
import type { Capability, Id } from '@visual-anything/schema';
import { isId } from '../ids';
import { capabilityProblem, isCapability, sortedCapabilities } from './capabilities';
import type { PackageCode } from './packages';

/** One approval: of the code with this hash, with the capabilities granted to it. */
export interface CodeApproval {
  /** The SHA-256 the code was approved by, in 64 small hexadecimal digits. */
  hash: string;
  /** The package it was approved in, to name it to the person. */
  package: Id;
  /** The capabilities the person granted it, sorted; any it declares beyond them stay off. */
  capabilities: Capability[];
}

/** The most approvals kept; approving one more forgets the oldest. */
export const MAX_CODE_APPROVALS = 256;

/** Where a package's code stands: approved, with what it may reach, or not. */
export type CodeStatus =
  | { state: 'unapproved' }
  | {
      state: 'approved';
      granted: Capability[];
      /**
       * Built-in code (ADR 0089's M14.6 clarification): the program's own, which runs without an
       * approval and with every capability it declares.
       */
      builtIn?: true;
    }
  /** Over 256 KiB: it never runs, approved or not. */
  | { state: 'too-large' };

const HASH = /^[0-9a-f]{64}$/;

/** Where a package's code stands under these approvals. */
export function codeStatusOf(code: PackageCode, approvals: readonly CodeApproval[]): CodeStatus {
  if (code.tooLarge) return { state: 'too-large' };
  if (code.builtIn === true) {
    return { state: 'approved', granted: [...code.capabilities], builtIn: true };
  }
  const approval = approvals.find((each) => each.hash === code.hash);
  if (!approval) return { state: 'unapproved' };
  return {
    state: 'approved',
    granted: sortedCapabilities(
      approval.capabilities.filter((each) => code.capabilities.includes(each)),
    ),
  };
}

/** The approvals with this one, newest first, in place of any with its hash, at most so many. */
export function withApproval(
  approvals: readonly CodeApproval[],
  approval: CodeApproval,
): CodeApproval[] {
  const fresh: CodeApproval = {
    hash: approval.hash,
    package: approval.package,
    capabilities: sortedCapabilities(approval.capabilities),
  };
  return [fresh, ...approvals.filter((each) => each.hash !== approval.hash)].slice(
    0,
    MAX_CODE_APPROVALS,
  );
}

/** The approvals without the one with this hash. */
export function withoutApproval(approvals: readonly CodeApproval[], hash: string): CodeApproval[] {
  return approvals.filter((each) => each.hash !== hash);
}

/**
 * Approvals as the preferences file holds them, read leniently: keys a later version adds are left
 * out; a list with any approval it cannot read cannot be read, and approves nothing.
 */
export function readCodeApprovals(value: unknown): CodeApproval[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_CODE_APPROVALS) return undefined;
  const approvals: CodeApproval[] = [];
  const seen = new Set<string>();
  for (const each of value as unknown[]) {
    const read = approvalIn(each);
    if (read === undefined || seen.has(read.hash)) return undefined;
    seen.add(read.hash);
    approvals.push(read);
  }
  return approvals;
}

/** Approvals as an app sends them, checked strictly; capabilities come back sorted. */
export function checkCodeApprovals(
  value: unknown,
): { ok: true; value: CodeApproval[] } | { ok: false; message: string } {
  if (!Array.isArray(value)) {
    return { ok: false, message: '"codeApprovals" must be a list of approvals of package code.' };
  }
  if (value.length > MAX_CODE_APPROVALS) {
    return {
      ok: false,
      message: `"codeApprovals" holds ${value.length} approvals, more than ${MAX_CODE_APPROVALS}.`,
    };
  }
  const approvals: CodeApproval[] = [];
  const seen = new Set<string>();
  for (const each of value as unknown[]) {
    if (!isRecord(each) || Object.keys(each).some((key) => !APPROVAL_KEYS.includes(key))) {
      return {
        ok: false,
        message:
          'An approval of package code has a hash, a package and capabilities, and nothing else.',
      };
    }
    if (typeof each.hash !== 'string' || !HASH.test(each.hash)) {
      return {
        ok: false,
        message: 'An approval of package code names its SHA-256 in 64 small hexadecimal digits.',
      };
    }
    if (!isId(each.package)) {
      return {
        ok: false,
        message: 'An approval of package code names the package it was made in.',
      };
    }
    if (!Array.isArray(each.capabilities)) {
      return {
        ok: false,
        message: 'An approval of package code lists the capabilities it grants.',
      };
    }
    for (const capability of each.capabilities as unknown[]) {
      const problem = capabilityProblem(capability);
      if (problem !== undefined) return { ok: false, message: problem };
    }
    if (seen.has(each.hash)) {
      return { ok: false, message: `"codeApprovals" approves ${each.hash} twice.` };
    }
    seen.add(each.hash);
    approvals.push({
      hash: each.hash,
      package: each.package,
      capabilities: sortedCapabilities(each.capabilities as Capability[]),
    });
  }
  return { ok: true, value: approvals };
}

const APPROVAL_KEYS: readonly string[] = ['hash', 'package', 'capabilities'];

function approvalIn(value: unknown): CodeApproval | undefined {
  if (!isRecord(value)) return undefined;
  const { hash, package: id, capabilities } = value;
  if (typeof hash !== 'string' || !HASH.test(hash) || !isId(id)) return undefined;
  if (!Array.isArray(capabilities) || !(capabilities as unknown[]).every(isCapability)) {
    return undefined;
  }
  return { hash, package: id, capabilities: sortedCapabilities(capabilities as Capability[]) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
