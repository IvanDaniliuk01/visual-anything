/**
 * A run's parameters (ADR 0085): its simulation's defaults, with what the person, a view state or
 * Claude chose in their place, each checked against its declaration before a run starts. A value
 * out of range or of the wrong type is refused, never brought within range.
 */
import type { ParameterValue, SimulationDefinition } from '@visual-anything/schema';
import { parameterValueProblem } from './definition';
import { own } from './saved';

/** A run's parameters, by name: every one its simulation declares. */
export type RunParameters = Readonly<Record<string, ParameterValue>>;

/** Every parameter of a simulation at its default. */
export function defaultParameters(definition: SimulationDefinition): RunParameters {
  const parameters: Record<string, ParameterValue> = {};
  for (const each of definition.parameters) own(parameters, each.name, each.default);
  return parameters;
}

/**
 * The parameters a run starts from: the defaults, with the chosen values in their places; or why
 * the chosen values cannot start one, in a sentence. Nothing chosen starts from the defaults.
 */
export function checkParameters(
  definition: SimulationDefinition,
  chosen: unknown,
): { ok: true; value: RunParameters } | { ok: false; reason: string } {
  const parameters: Record<string, ParameterValue> = {};
  for (const [name, value] of Object.entries(defaultParameters(definition)))
    own(parameters, name, value);
  if (chosen === undefined || chosen === null) return { ok: true, value: parameters };
  if (typeof chosen !== 'object' || Array.isArray(chosen)) {
    return { ok: false, reason: 'The parameters are not an object of values by name.' };
  }
  const byName = new Map(definition.parameters.map((each) => [each.name, each]));
  for (const [name, value] of Object.entries(chosen)) {
    const parameter = byName.get(name);
    if (!parameter) {
      return { ok: false, reason: `The simulation has no parameter ${JSON.stringify(name)}.` };
    }
    const problem = parameterValueProblem(parameter, value);
    if (problem !== undefined) return { ok: false, reason: capitalized(problem) };
    own(parameters, name, value as ParameterValue);
  }
  return { ok: true, value: parameters };
}

/** The parameters that differ from their defaults, by name in order; what a view state keeps. */
export function chosenParameters(
  definition: SimulationDefinition,
  parameters: RunParameters,
): Record<string, ParameterValue> {
  const chosen: Record<string, ParameterValue> = {};
  for (const each of [...definition.parameters].sort((a, b) => compare(a.name, b.name))) {
    const value = parameters[each.name];
    if (value !== undefined && value !== each.default) own(chosen, each.name, value);
  }
  return chosen;
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
