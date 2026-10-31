/**
 * One simulation as a view state and Claude's guidance carry it (ADR 0085): the element, the
 * parameters chosen, the seed and the tick, read strictly. Whether the element simulates and its
 * simulation takes those parameters is checked against the project, by `viewStateProblems`.
 */
import type { ParameterValue, SavedSimulation } from '@visual-anything/schema';
import { isId } from '../ids';
import { SIMULATION_LIMITS } from './limits';

const KEYS: ReadonlySet<string> = new Set(['element', 'parameters', 'seed', 'tick']);

/** The longest name and choice of a parameter, as the schema has them. */
const PARAMETER_NAME = 64;
const PARAMETER_CHOICE = 200;

/** A simulation read, or why it is not one. */
export type SavedSimulationRead =
  { ok: true; simulation: SavedSimulation } | { ok: false; message: string };

/**
 * Reads one simulation, with what says nothing left out: the seed 1, the tick 0 and no parameters
 * chosen; the parameters in the order of their names, a negative zero as 0. `more` names the other
 * keys the value may hold, which are left for the caller.
 */
export function readSavedSimulation(
  value: unknown,
  more: readonly string[] = [],
): SavedSimulationRead {
  const refuse = (message: string): SavedSimulationRead => ({ ok: false, message });
  if (!isRecord(value)) return refuse('A simulation is an object.');
  for (const key of Object.keys(value)) {
    if (!KEYS.has(key) && !more.includes(key)) {
      return refuse(`A simulation has no "${shortened(key)}".`);
    }
  }
  if (!isId(value.element)) {
    return refuse(`"${shortened(String(value.element))}" is not an id.`);
  }
  const simulation: SavedSimulation = { element: value.element };
  const seed = wholeWithin(value.seed, SIMULATION_LIMITS.maxSeed);
  if (seed === null) {
    return refuse(`A simulation's seed is a whole number from 0 to ${SIMULATION_LIMITS.maxSeed}.`);
  }
  if (seed !== undefined && seed !== SIMULATION_LIMITS.defaultSeed) simulation.seed = seed;
  const tick = wholeWithin(value.tick, SIMULATION_LIMITS.maxTicks);
  if (tick === null) {
    return refuse(`A simulation's tick is a whole number from 0 to ${SIMULATION_LIMITS.maxTicks}.`);
  }
  if (tick !== undefined && tick !== 0) simulation.tick = tick;
  if (value.parameters !== undefined) {
    if (!isRecord(value.parameters)) {
      return refuse("A simulation's parameters are an object of values by name.");
    }
    const entries = Object.entries(value.parameters);
    if (entries.length > SIMULATION_LIMITS.parameters) {
      return refuse(`A simulation chooses at most ${SIMULATION_LIMITS.parameters} parameters.`);
    }
    const parameters: Record<string, ParameterValue> = {};
    for (const [name, each] of [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      if (name.length === 0 || name.length > PARAMETER_NAME || !encodable(name)) {
        return refuse(`"${shortened(name)}" is not a name a parameter may have.`);
      }
      if (!isParameterValue(each)) {
        return refuse(
          `The parameter "${shortened(name)}" is a number, true or false, or one of its choices.`,
        );
      }
      own(parameters, name, each === 0 ? 0 : each);
    }
    if (entries.length > 0) simulation.parameters = parameters;
  }
  return { ok: true, simulation };
}

/** A copy of a simulation, sharing nothing with it. */
export function copiedSimulation(simulation: SavedSimulation): SavedSimulation {
  return {
    ...simulation,
    ...(simulation.parameters ? { parameters: { ...simulation.parameters } } : {}),
  };
}

/** Sets a key of a record as its own, so that even `__proto__` is a key like any other. */
export function own<T>(record: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(record, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/** A whole number from 0 to `max`; undefined when left out, null when it is not one. */
function wholeWithin(value: unknown, max: number): number | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max
    ? value
    : null;
}

function isParameterValue(value: unknown): value is ParameterValue {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= PARAMETER_CHOICE &&
    encodable(value)
  );
}

/** Whether a text can be percent-encoded: it holds no half of a surrogate pair on its own. */
function encodable(text: string): boolean {
  try {
    encodeURIComponent(text);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A text shown in a message, cut short when it is long. */
function shortened(text: string): string {
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}
