/**
 * Reading what a component can simulate (ADR 0085): its own simulation, or the nearest one along
 * what it derives from, inherited whole; and what is wrong with one, which the schema cannot say.
 */
import type {
  Id,
  ParameterDefinition,
  SimulatedValueDefinition,
  SimulationDefinition,
} from '@visual-anything/schema';
import type { Definitions } from '../definitions';
import { SIMULATION_LIMITS } from './limits';

/** A component's simulation, and the component and package that declare it. */
export interface ComponentSimulation {
  definition: SimulationDefinition;
  /** The component that declares it: the one asked about, or one it derives from. */
  declaredBy: Id;
  package: Id;
}

/** What a component can simulate, inherited whole from the nearest that declares it; or nothing. */
export function simulationOf(
  definitions: Definitions,
  component: Id,
): ComponentSimulation | undefined {
  const resolved = definitions.component(component);
  if (!resolved) return undefined;
  for (const id of resolved.lineage) {
    const defined = definitions.components.get(id);
    const definition = defined?.definition.simulation;
    if (defined && definition) return { definition, declaredBy: id, package: defined.package };
  }
  return undefined;
}

/** How many ticks a run of this simulation plays unless more are asked for. */
export function ticksOf(definition: SimulationDefinition): number {
  return definition.ticks ?? SIMULATION_LIMITS.defaultTicks;
}

/**
 * What is wrong with a simulation that the schema lets through, each in a sentence: names given
 * twice, defaults that are not of their type or not within their range, ranges upside down, and
 * choices on what is not a choice.
 */
export function simulationProblems(definition: SimulationDefinition): string[] {
  const problems: string[] = [];
  twice(
    definition.parameters.map((each) => each.name),
    'parameter',
    problems,
  );
  twice(
    definition.values.map((each) => each.name),
    'simulated value',
    problems,
  );
  for (const parameter of definition.parameters) problems.push(...parameterProblems(parameter));
  for (const value of definition.values) problems.push(...valueProblems(value));
  return problems;
}

function twice(names: readonly string[], what: string, problems: string[]): void {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) problems.push(`The ${what} ${JSON.stringify(name)} is declared twice.`);
    seen.add(name);
  }
}

function parameterProblems(parameter: ParameterDefinition): string[] {
  const named = `The parameter ${JSON.stringify(parameter.name)}`;
  const problems: string[] = [];
  const { type, min, max } = parameter;
  if (
    type !== 'number' &&
    (min !== undefined || max !== undefined || parameter.step !== undefined)
  ) {
    problems.push(`${named} has a range or a step, which only a number has.`);
  }
  if (type !== 'number' && parameter.unit !== undefined) {
    problems.push(`${named} has a unit, which only a number has.`);
  }
  if (type !== 'choice' && parameter.choices !== undefined) {
    problems.push(`${named} has choices, which only a choice has.`);
  }
  if (type === 'choice' && parameter.choices === undefined) {
    problems.push(`${named} is a choice without its choices.`);
  }
  if (min !== undefined && max !== undefined && min > max) {
    problems.push(`${named} has a lowest value above its highest.`);
  }
  const wrong = parameterValueProblem(parameter, parameter.default);
  if (wrong !== undefined) problems.push(`The default of ${wrong}`);
  return problems;
}

function valueProblems(value: SimulatedValueDefinition): string[] {
  const named = `The simulated value ${JSON.stringify(value.name)}`;
  const problems: string[] = [];
  if (value.type !== 'number' && (value.min !== undefined || value.max !== undefined)) {
    problems.push(`${named} has limits, which only a number has.`);
  }
  if (value.type !== 'number' && value.unit !== undefined) {
    problems.push(`${named} has a unit, which only a number has.`);
  }
  if (value.type !== 'string' && value.choices !== undefined) {
    problems.push(`${named} has choices, which only a string has.`);
  }
  if (value.min !== undefined && value.max !== undefined && value.min > value.max) {
    problems.push(`${named} has a lowest limit above its highest.`);
  }
  return problems;
}

/**
 * Why a value is not one a parameter may take, as the end of a sentence that starts with the
 * parameter's name in lowercase ("the parameter "arrivals" is …"); undefined when it may.
 */
export function parameterValueProblem(
  parameter: ParameterDefinition,
  value: unknown,
): string | undefined {
  const named = `the parameter ${JSON.stringify(parameter.name)}`;
  switch (parameter.type) {
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${named} is not a number.`;
      if (parameter.min !== undefined && value < parameter.min) {
        return `${named} is below its lowest, ${parameter.min}.`;
      }
      if (parameter.max !== undefined && value > parameter.max) {
        return `${named} is above its highest, ${parameter.max}.`;
      }
      return undefined;
    }
    case 'boolean':
      return typeof value === 'boolean' ? undefined : `${named} is not true or false.`;
    case 'choice':
      return typeof value === 'string' && (parameter.choices ?? []).includes(value)
        ? undefined
        : `${named} is not one of its choices.`;
  }
}
