/**
 * What is wrong with the simulations a project's packages declare (ADR 0085), as warnings: the
 * project opens, and a simulation that cannot be one never runs.
 */
import { packageCodeOf } from '../code/packages';
import { problem, type Problem } from '../problems';
import type { ProjectSnapshot } from '../snapshot';
import { simulationProblems } from './definition';

/** The warnings about the simulations the project's packages declare. */
export function simulationWarnings(state: ProjectSnapshot): Problem[] {
  const warnings: Problem[] = [];
  for (const file of state.packages) {
    const declaring = file.components.filter((each) => each.simulation !== undefined);
    if (declaring.length === 0) continue;
    if (packageCodeOf(file) === undefined) {
      warnings.push(
        problem(
          'invalid-simulation',
          `The package "${file.name}" declares simulations but holds no code to work them out.`,
          [file.id],
        ),
      );
    }
    for (const component of declaring) {
      for (const each of simulationProblems(component.simulation!)) {
        warnings.push(
          problem(
            'invalid-simulation',
            `In the simulation of "${component.name}" in the package "${file.name}": ${each}`,
            [file.id, component.id],
          ),
        );
      }
    }
  }
  return warnings;
}
