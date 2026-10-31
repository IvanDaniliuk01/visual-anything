import { describe, expect, it } from 'vitest';
import { checkProject } from '../check';
import { testProject } from '../test/fixtures';
import { QUEUE } from '../test/simulation';
import { simulationWarnings } from './check';

function withSimulation(simulation: typeof QUEUE, code?: string[]) {
  const state = testProject();
  state.packages = state.packages.map((pkg) => ({
    ...pkg,
    ...(code ? { code } : {}),
    components: pkg.components.map((each) =>
      each.id === 'test.service' ? { ...each, simulation } : each,
    ),
  }));
  return state;
}

describe('simulationWarnings', () => {
  it('warns of a package that declares simulations but holds no code', () => {
    expect(simulationWarnings(withSimulation(QUEUE)).map((each) => each.message)).toEqual([
      'The package "Test" declares simulations but holds no code to work them out.',
    ]);
  });

  it('warns of what is wrong in a simulation, naming its component', () => {
    const broken = { ...QUEUE, parameters: [{ ...QUEUE.parameters[0]!, default: 500 }] };
    const warnings = simulationWarnings(withSimulation(broken, ['export function simulate() {}']));
    expect(warnings.map((each) => each.message)).toEqual([
      'In the simulation of "Service" in the package "Test": The default of the parameter "arrivals" is above its highest, 100.',
    ]);
    expect(warnings[0]?.subjects).toEqual(['test', 'test.service']);
  });

  it('is among the project’s warnings, and finds nothing in a sound one', () => {
    const sound = withSimulation(QUEUE, ['export function simulate() {}']);
    expect(simulationWarnings(sound)).toEqual([]);
    const report = checkProject(withSimulation(QUEUE));
    expect(report.warnings.some((each) => each.code === 'invalid-simulation')).toBe(true);
  });
});
