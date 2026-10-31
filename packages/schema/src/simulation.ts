/**
 * Simulations (M12, ADR 0085): what a programmable component declares it can simulate, as plain data
 * in its package, and the one simulation a view state can show. The package's code works out each
 * tick; nothing here runs.
 */
import type { Id } from './files';

/**
 * What a component can simulate: its parameters, its simulated values with their limits, how long a
 * tick stands for and how many ticks a run plays. A component inherits it whole from the one it
 * derives from, and replaces it whole by declaring its own.
 */
export interface SimulationDefinition {
  /**
   * @minItems 1
   * @maxItems 32
   */
  parameters: ParameterDefinition[];
  /**
   * @minItems 1
   * @maxItems 64
   */
  values: SimulatedValueDefinition[];
  /** How long one tick stands for; left out, one tick of no unit. */
  tick?: TickLength;
  /**
   * How many ticks a run plays unless the person asks for more: 100 when left out.
   *
   * @minimum 1
   * @maximum 10000
   * @asType integer
   */
  ticks?: number;
  description?: string;
}

/** A value a simulation run starts from, which the person, a view state or Claude chooses. */
export interface ParameterDefinition {
  /**
   * @minLength 1
   * @maxLength 64
   */
  name: string;
  type: 'number' | 'boolean' | 'choice';
  /** The value a run starts from unless another is chosen: of its type, within its range. */
  default: ParameterValue;
  /** For a number, the lowest it may be. */
  min?: number;
  /** For a number, the highest it may be. */
  max?: number;
  /**
   * For a number, the step its control moves by.
   *
   * @exclusiveMinimum 0
   */
  step?: number;
  /**
   * For a number, the unit it is in, such as "items/s".
   *
   * @minLength 1
   * @maxLength 16
   */
  unit?: string;
  /**
   * For a choice, the values it may take, offered in this order.
   *
   * @minItems 2
   * @maxItems 32
   * @uniqueItems true
   */
  choices?: string[];
  description?: string;
}

/** A parameter's value: a number, a boolean, or one of its choices. */
export type ParameterValue = number | boolean | ParameterChoice;

/**
 * One of a choice parameter's choices.
 *
 * @minLength 1
 */
export type ParameterChoice = string;

/** A value each tick answers, such as a queue's length. */
export interface SimulatedValueDefinition {
  /**
   * Its name; one named like an attribute of the element is read in its place while a run is shown.
   *
   * @minLength 1
   * @maxLength 64
   */
  name: string;
  type: 'number' | 'string' | 'boolean';
  /** For a number, its lowest limit: a tick that answers less stops the run. */
  min?: number;
  /** For a number, its highest limit: a tick that answers more stops the run. */
  max?: number;
  /**
   * For a number, the unit it is in.
   *
   * @minLength 1
   * @maxLength 16
   */
  unit?: string;
  /**
   * For a string, the values it may take: a tick that answers another stops the run.
   *
   * @minItems 1
   * @maxItems 64
   * @uniqueItems true
   */
  choices?: string[];
  description?: string;
}

/** How long one tick stands for, such as 1 s or 1 day. */
export interface TickLength {
  /** @exclusiveMinimum 0 */
  length: number;
  /**
   * @minLength 1
   * @maxLength 16
   */
  unit: string;
}

/**
 * One simulation a view state shows (ADR 0085): the element simulating, the parameters it chose,
 * the seed and the tick shown. Reading it changes nothing in the project.
 */
export interface SavedSimulation {
  element: Id;
  /** The parameters chosen, by name; those left out keep their defaults. */
  parameters?: Record<string, ParameterValue>;
  /**
   * The run's seed; 1 when left out.
   *
   * @minimum 0
   * @maximum 4294967295
   * @asType integer
   */
  seed?: number;
  /**
   * The tick shown; 0 when left out.
   *
   * @minimum 0
   * @maximum 10000
   * @asType integer
   */
  tick?: number;
}
