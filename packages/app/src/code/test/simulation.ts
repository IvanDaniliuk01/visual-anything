/** The gauges package with a simulation, for the tests of `simulate` in the sandbox and the runner. */
import { codeHash, type ProjectSnapshot } from '@visual-anything/core';
import type { SimulationDefinition } from '@visual-anything/schema';
import type { RunPackage } from '../messages';
import { codeProject, gaugesPackage } from './project';

/** A tank filling at a rate drawn by chance: its level, with its limits, and the last draw. */
export const TANK: SimulationDefinition = {
  parameters: [{ name: 'rate', type: 'number', default: 4, min: 0, max: 100 }],
  values: [
    { name: 'level', type: 'number', min: 0, max: 100_000 },
    { name: 'draw', type: 'number' },
  ],
  tick: { length: 2, unit: 's' },
  ticks: 50,
};

/** `simulate` for {@link TANK}: both of the tick's generators drawn from, the level kept in the state. */
export const TANK_CODE = [
  'export function simulate(element, context) {',
  '  const before = context.state === undefined ? 0 : context.state.level;',
  '  const level = before + Math.floor(context.random() * context.parameters.rate * 2);',
  '  return {',
  '    values: { level, draw: Math.random() },',
  '    state: { level },',
  '    marks: context.tick % 2 === 0 ? [element.id] : [],',
  '  };',
  '}',
];

/** The kitchen, its thermometers simulating `definition` with the package's module `code`. */
export function simulationProject(
  code: readonly string[] = TANK_CODE,
  definition: SimulationDefinition = TANK,
): ProjectSnapshot {
  const pkg = gaugesPackage([...code]);
  return codeProject({
    ...pkg,
    components: pkg.components.map((each) => ({ ...each, simulation: definition })),
  });
}

/** The gauges package, approved, holding `code`. */
export function simulationPackage(
  code: readonly string[] = TANK_CODE,
  extra: Partial<RunPackage> = {},
): RunPackage {
  return {
    package: 'gauges',
    name: 'Gauges',
    hash: codeHash([...code], []),
    code: code.join('\n'),
    granted: [],
    declared: [],
    stops: 0,
    ...extra,
  };
}
