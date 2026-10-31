/**
 * The limits of simulations (ADR 0085), beside those every call of package code keeps (ADR 0054):
 * how many ticks a run plays, how large a tick's answer may be, and how much a run keeps for going
 * back.
 */
export const SIMULATION_LIMITS = Object.freeze({
  /** The most parameters and simulated values a simulation declares, as the schema has them. */
  parameters: 32,
  values: 64,
  /** How many ticks a run plays when its simulation does not say. */
  defaultTicks: 100,
  /** The most ticks one run plays. */
  maxTicks: 10_000,
  /** The seed a run starts from unless another is chosen, and the highest one. */
  defaultSeed: 1,
  maxSeed: 0xffff_ffff,
  /** The longest state a tick may answer, written as JSON, in characters. */
  stateText: 64 * 1024,
  /** How deep a state may nest. */
  stateDepth: 16,
  /** The most marks one tick answers. */
  marks: 64,
  /** The longest string a simulated value may be, and the longest sentence `done` may say. */
  valueText: 200,
  doneText: 200,
  /** How much of a run's ticks, their values and marks, a run keeps, in characters of JSON. */
  keptText: 16 * 1024 * 1024,
  /** How much of a run's states a run keeps, in characters of JSON, before it thins them. */
  stateKeptText: 16 * 1024 * 1024,
  /** Once thinned, the ticks whose states are kept: every one that is a multiple of this. */
  stateEvery: 100,
  /** The most runs one tab plays at once. */
  runsAtOnce: 16,
  /** The speeds a run plays at, in ticks a second; `max` plays as fast as it goes. */
  speeds: Object.freeze([1, 5, 20, 60, 'max'] as const),
});

/** A speed a run plays at. */
export type SimulationSpeed = (typeof SIMULATION_LIMITS.speeds)[number];
