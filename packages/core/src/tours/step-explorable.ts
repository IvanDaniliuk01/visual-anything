/**
 * A tour step's explorable (ADR 0107), as the tours panel's step editor changes it and as the step
 * plays: the explorable it shows live while it plays, the values it sets by parameter name, a
 * parameter left out taking its default, and the repair of a broken step, which keeps what its
 * explorable still declares and takes. Pure: each answers a new step, or the same one unchanged.
 */
import type {
  ExplorableParameter,
  ExplorableParameterValue,
  Id,
  JsonValue,
  TourStep,
} from '@visual-anything/schema';
import { explorablesIn } from '../explorables/catalog';
import { explorableParameterProblem, parameterValues } from '../explorables/data';
import type { ProjectSnapshot } from '../snapshot';

type WithExplorable = Pick<TourStep, 'explorable'>;

/**
 * The step showing this explorable, or none. Choosing the one it shows keeps the values it sets;
 * choosing another sets none, so that each of its parameters takes its default.
 */
export function withStepExplorable<T extends WithExplorable>(step: T, id: Id | undefined): T {
  const next = { ...step };
  if (id === undefined) {
    delete next.explorable;
    return next;
  }
  next.explorable = step.explorable?.id === id ? { ...step.explorable } : { id };
  return next;
}

/**
 * The step setting a parameter of its explorable to a value, or taking it back to its default when
 * the value is `undefined`. A step that shows no explorable is answered unchanged.
 */
export function withStepParameter<T extends WithExplorable>(
  step: T,
  name: string,
  value: ExplorableParameterValue | undefined,
): T {
  const shown = step.explorable;
  if (shown === undefined) return step;
  const parameters: Record<string, JsonValue> = {};
  for (const [key, each] of Object.entries(shown.parameters ?? {})) {
    if (key !== name) define(parameters, key, each);
  }
  if (value !== undefined) define(parameters, name, value);
  return {
    ...step,
    explorable:
      Object.keys(parameters).length === 0 ? { id: shown.id } : { id: shown.id, parameters },
  };
}

/**
 * The step without what makes its explorable broken: the values of parameters its explorable no
 * longer declares, and those it no longer takes; and the explorable itself when no package defines
 * it. A step whose explorable plays as written is answered unchanged.
 */
export function repairedStepExplorable<T extends WithExplorable>(
  project: ProjectSnapshot,
  step: T,
): T {
  const shown = step.explorable;
  if (shown === undefined) return step;
  const defined = explorablesIn(project).explorable(shown.id);
  if (!defined) return withStepExplorable(step, undefined);
  const declared = new Map(
    (defined.definition.parameters ?? []).map((each) => [each.name, each] as const),
  );
  const kept: Record<string, JsonValue> = {};
  let dropped = false;
  for (const [name, value] of Object.entries(shown.parameters ?? {})) {
    const parameter = declared.get(name);
    if (parameter === undefined || explorableParameterProblem(parameter, value) !== undefined) {
      dropped = true;
      continue;
    }
    define(kept, name, value);
  }
  if (!dropped) return step;
  return {
    ...step,
    explorable:
      Object.keys(kept).length === 0 ? { id: shown.id } : { id: shown.id, parameters: kept },
  };
}

/**
 * The values a step's explorable shows while it plays: those it sets that its parameters take, and
 * each other parameter's default. `undefined` when it shows no explorable, or one no package defines.
 */
export function stepExplorableValues(
  project: ProjectSnapshot,
  step: WithExplorable,
): Record<string, ExplorableParameterValue> | undefined {
  const shown = step.explorable;
  if (shown === undefined) return undefined;
  const defined = explorablesIn(project).explorable(shown.id);
  if (!defined) return undefined;
  const given: Record<string, ExplorableParameterValue> = {};
  for (const [name, value] of Object.entries(shown.parameters ?? {})) {
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
      define(given, name, value);
    }
  }
  return parameterValues(defined.definition.parameters ?? [], given);
}

/**
 * What a person typed for a number or an integer parameter: its value, read with a point or a comma
 * for decimals, or why it is not one the parameter takes, in the core's words.
 */
export function readParameterText(
  parameter: ExplorableParameter,
  text: string,
): { ok: true; value: number } | { ok: false; problem: string } {
  const written = text.trim().replace(',', '.');
  const value = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(written) ? Number(written) : NaN;
  const problem =
    explorableParameterProblem(parameter, value) ??
    (parameter.kind === 'number' || parameter.kind === 'integer'
      ? undefined
      : `"${parameter.name}" takes no number.`);
  return problem === undefined ? { ok: true, value } : { ok: false, problem };
}

/** Sets a key of a record made here, whatever its name, as an own property. */
function define<V>(record: Record<string, V>, key: string, value: V): void {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}
