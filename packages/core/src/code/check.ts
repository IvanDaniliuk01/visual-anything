/**
 * What is wrong with the code a project's files hold (ADR 0054), as warnings: the project opens, and
 * the code that cannot run never runs. Nothing here runs it.
 */
import type { ProjectSnapshot } from '../snapshot';
import { problem, type Problem } from '../problems';
import { isCapability } from './capabilities';
import { tooLargeProblem } from './messages';
import { packageCodeOf } from './packages';

/** The warnings about the code the project's packages hold. */
export function codeWarnings(state: ProjectSnapshot): Problem[] {
  const warnings: Problem[] = [];
  for (const file of state.packages) {
    const code = packageCodeOf(file);
    if (code?.tooLarge) warnings.push(tooLargeProblem({ id: file.id, name: file.name }));
    for (const declared of file.capabilities ?? []) {
      if (isCapability(declared)) continue;
      warnings.push(
        problem(
          'invalid-code',
          `The package "${file.name}" declares ${JSON.stringify(declared)}, which is not a capability; its code never gets it.`,
          [file.id],
        ),
      );
    }
    if (code === undefined && (file.capabilities?.length ?? 0) > 0) {
      warnings.push(
        problem(
          'invalid-code',
          `The package "${file.name}" declares capabilities but holds no code; they have no effect.`,
          [file.id],
        ),
      );
    }
  }
  return warnings;
}
