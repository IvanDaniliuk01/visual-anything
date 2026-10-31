/**
 * Simulations (M12, ADR 0085): what a component declares it can simulate, checking parameters and
 * each tick's answer, the seeded chance of a tick, and the record of a run. The core never runs
 * code: the app's code worker and Claude's tools call `simulate`, and record what it answers here.
 */
export type { CheckedTick, LimitKind, SimulatedTick, SimulatedValue } from './answer';
export { checkSimulateAnswer } from './answer';
export { simulationWarnings } from './check';
export type { ComponentSimulation } from './definition';
export { parameterValueProblem, simulationOf, simulationProblems, ticksOf } from './definition';
export type { SimulateContext, SimulateInput } from './input';
export { markableOf, simulateInputAt, simulationInputOf } from './input';
export type { SimulationSpeed } from './limits';
export { SIMULATION_LIMITS } from './limits';
export type { RunParameters } from './parameters';
export { checkParameters, chosenParameters, defaultParameters } from './parameters';
export type { SavedSimulationRead } from './saved';
export { readSavedSimulation } from './saved';
export { TICK_RANDOM_SOURCE, seededRandom, tickRandom, tickSeed } from './random';
export type { ResumePoint, RunBudget, RunStart, SimulationStop } from './run';
export { SimulationRun, isFailure } from './run';
