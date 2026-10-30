/**
 * What is wrong with a face (ADR 0083), at its line and column. Each problem has a stable code and an
 * English message the app's Spanish catalog translates as a template (ADR 0038):
 *
 * - `invalid-face`: markup the strict reader refuses, an element or attribute outside the subset, a
 *   slot or condition that cannot be read; and, only as warnings, style the subset drops;
 * - `face-too-large`: a face past its caps (`limits.ts`);
 * - `unknown-face-attribute`, only a warning: a slot or condition naming an attribute the component
 *   does not have;
 * - `face-contrast`, only a warning: text under 4.5:1, or 3:1 when large, on what it is drawn on.
 */
import type { Id } from '@visual-anything/schema';
import { problem, type Problem } from '../problems';

export type FaceProblemCode =
  'invalid-face' | 'face-too-large' | 'unknown-face-attribute' | 'face-contrast';

/** Where in a face a problem is: its markup, its style, or one of its variants' markup. */
export type FacePart = { kind: 'markup' } | { kind: 'style' } | { kind: 'variant'; id: string };

export interface FaceProblem {
  code: FaceProblemCode;
  /** Errors keep a command from setting the face; warnings only report. */
  severity: 'error' | 'warning';
  part: FacePart;
  /**
   * From 1. A problem in a face's text always has one, a cap's at the first line past it; 0 only
   * for what is about the face as a whole rather than a place in its text: a `collapsed` variant it
   * lacks, a fill past its caps found while laying out, or contrast checked only in part.
   */
  line: number;
  /** From 1, a cap's at the first character past it; 0 when `line` is. */
  column: number;
  /** What is wrong, in a sentence that starts with a capital and ends with a period. */
  reason: string;
}

/** "the markup", "the style" or `the variant "far"`. */
export function partName(part: FacePart): string {
  return part.kind === 'variant' ? `the variant "${part.id}"` : `the ${part.kind}`;
}

/** Where a problem is, as a message says it: "Line 3, column 5 of the markup". */
export function whereOf(found: Pick<FaceProblem, 'part' | 'line' | 'column'>): string {
  const of = partName(found.part);
  if (found.line === 0) return `In ${of}`;
  if (found.column === 0) return `Line ${found.line} of ${of}`;
  return `Line ${found.line}, column ${found.column} of ${of}`;
}

/** A face problem as one sentence: where it is, then what is wrong. */
export function faceMessage(found: FaceProblem): string {
  const reason = found.reason.charAt(0).toLowerCase() + found.reason.slice(1);
  return `${whereOf(found)}: ${reason}`;
}

/** A face problem as a problem of the core, saying whose face it is. */
export function faceProblemOf(found: FaceProblem, of: string, subjects?: readonly Id[]): Problem {
  return problem(found.code, `The face of ${of}: ${faceMessage(found)}`, subjects);
}
