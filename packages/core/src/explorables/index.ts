/**
 * Explorables (ADR 0107). A10.0's seam: the types, caps and signatures are fixed here; the bodies
 * that throw `not built yet` are A10.0's core task.
 */
import type { ExplorableParameter, ExplorableParameterValue, Id } from '@visual-anything/schema';
import type { ProjectSnapshot } from '../snapshot';
import type {
  ExplorableApproval,
  FrameDocument,
  FrameInput,
  FrameMessage,
  HostMessage,
  VaData,
} from './types';

export * from './types';

function notBuilt(what: string): never {
  throw new Error(`${what} is not built yet (A10.0).`);
}

/**
 * Builds one frame document (ADR 0107): the runtime, the script libraries inlined as globals, then
 * the explorable's text; CR and CRLF become LF and NUL is escaped before every inline script and
 * style is hashed, and the policy allows scripts and styles by those hashes only. Pure.
 */
export function buildFrame(input: FrameInput): FrameDocument {
  void input;
  return notBuilt('The frame builder');
}

/** A message a frame posted, checked whole and within its cap, or `undefined` to drop it. */
export function readFrameMessage(value: unknown): FrameMessage | undefined {
  void value;
  return notBuilt('Reading a frame’s message');
}

/** A message the app posts, checked as the frame's runtime checks it. */
export function readHostMessage(value: unknown): HostMessage | undefined {
  void value;
  return notBuilt('Reading the app’s message');
}

/** What an explorable shown by an element, or loose, reads as `va.data` (ADR 0107). */
export interface ExplorableDataInput {
  explorable: Id;
  /** The element that shows it, or a loose one is bound to. */
  element?: Id;
  /** The values a tour step sets; the defaults fill the rest. */
  parameters?: Record<string, ExplorableParameterValue>;
  theme: VaData['theme'];
  language: VaData['language'];
  size: VaData['size'];
  step?: VaData['step'];
}

/** `va.data`, version 1, from the project as it is: at most 500 elements, the rest counted. */
export function explorableData(state: ProjectSnapshot, input: ExplorableDataInput): VaData {
  void state;
  void input;
  return notBuilt('va.data');
}

/** The values of an explorable's parameters: those given that it declares and fit, else defaults. */
export function parameterValues(
  parameters: readonly ExplorableParameter[],
  given: Record<string, ExplorableParameterValue> | undefined,
): Record<string, ExplorableParameterValue> {
  void parameters;
  void given;
  return notBuilt('Parameter values');
}

/** The hash an approval is given for: the explorable's text and its script libraries' hashes. */
export function explorableApprovalHash(text: string, libraryHashes: readonly string[]): string {
  void text;
  void libraryHashes;
  return notBuilt('The approval hash');
}

/** Whether these approvals cover a frame's inputs. */
export function isApproved(approvals: readonly ExplorableApproval[], hash: string): boolean {
  void approvals;
  void hash;
  return notBuilt('Reading approvals');
}

/**
 * The approvals after Claude wrote `next` over `previous` (ADR 0107): when `previous` was approved,
 * `next` is approved too, `by: 'claude'`, newest first, at most 1,024; otherwise unchanged.
 */
export function continuedApprovals(
  approvals: readonly ExplorableApproval[],
  explorable: Id,
  previous: string,
  next: string,
): ExplorableApproval[] {
  void approvals;
  void explorable;
  void previous;
  void next;
  return notBuilt('Continuing an approval');
}
