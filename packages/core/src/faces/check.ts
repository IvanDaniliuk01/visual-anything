/**
 * Everything wrong with a face as a component's shapes would show it (ADR 0083): what compiling it
 * finds, the attributes its slots name that the component does not have, and its contrast in both
 * themes.
 */
import type { ThemeName } from '../preferences';
import { compileFace, type CompiledFace, type ResolvedFace } from './compile';
import { faceContrastProblems } from './contrast';
import type { FacePalette } from './palette';
import type { FaceProblem } from './problems';

/** A warning for each attribute a face names that the component does not have, once each. */
export function faceAttributeProblems(
  compiled: CompiledFace,
  known: ReadonlySet<string>,
): FaceProblem[] {
  const said = new Set<string>();
  const problems: FaceProblem[] = [];
  for (const named of compiled.attributes) {
    if (known.has(named.name) || said.has(named.name)) continue;
    said.add(named.name);
    problems.push({
      code: 'unknown-face-attribute',
      severity: 'warning',
      part: named.part,
      line: named.at.line,
      column: named.at.column,
      reason: `It names the attribute "${named.name}", which the component does not have.`,
    });
  }
  return problems;
}

export interface FaceContext {
  /** The attributes the component has. */
  attributes: ReadonlySet<string>;
  /** The colors of its shapes' tokens in each theme. */
  palettes: Readonly<Record<ThemeName, FacePalette>>;
}

/** Every problem of a face for a component: errors first, then warnings. */
export function faceProblems(face: ResolvedFace, context: FaceContext): FaceProblem[] {
  const compiled = compileFace(face);
  const problems = [...compiled.problems];
  if (compiled.ok) {
    problems.push(...faceAttributeProblems(compiled, context.attributes));
    problems.push(...faceContrastProblems(compiled, context.palettes));
  }
  return problems.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
}
