/**
 * A stand-in for package code's `simulate`, for tests: a work queue whose arrivals are drawn from
 * the tick's generator, as code in the sandbox would draw them, and a driver that plays a run with
 * it as the app's worker does, checking each answer and recording it.
 */
import type { JsonValue, SimulationDefinition } from '@visual-anything/schema';
import { checkSimulateAnswer } from '../simulation/answer';
import type { RunParameters } from '../simulation/parameters';
import { tickRandom } from '../simulation/random';
import type { SimulationRun } from '../simulation/run';

/** What one tick of the stand-in answers: arrivals in, workers' work out, the queue between. */
export function queueTick(
  parameters: RunParameters,
  state: JsonValue | undefined,
  tick: number,
  random: () => number,
): unknown {
  const queue =
    typeof state === 'object' && state !== null && 'queue' in state ? (state.queue as number) : 0;
  const arrivals = Math.floor(random() * (parameters.arrivals as number) * 2);
  const served = (parameters.workers as number) * 2;
  const next = Math.max(0, queue + arrivals - served);
  return {
    values: { queue: next, phase: next > 20 ? 'busy' : 'calm', saturated: next > served },
    marks: tick % 2 === 0 ? ['q1'] : [],
    state: { queue: next, history: tick % 7 },
  };
}

const MARKABLE = new Set(['q1']);

/** What tick `tick` of a run answers, checked, from the state the tick before answered. */
export function checkedTickOf(
  definition: SimulationDefinition,
  run: SimulationRun,
  tick: number,
  state: JsonValue | undefined,
) {
  return checkSimulateAnswer(
    definition,
    queueTick(run.parameters, state, tick, tickRandom(run.seed, tick)),
    MARKABLE,
  );
}

/** Plays a run on until it stops or reaches `until` ticks held, working back from its resume point. */
export function play(definition: SimulationDefinition, run: SimulationRun, until = Infinity): void {
  const resume = run.resumePoint();
  let state = resume.state;
  for (let tick = resume.tick; tick < run.next; tick++) {
    const checked = checkedTickOf(definition, run, tick, state);
    if (checked.kind !== 'tick')
      throw new Error(`Tick ${tick} answered otherwise when worked again.`);
    run.restore(tick, checked.state, checked.stateSize);
    state = checked.state;
  }
  while (!run.stop && run.length < until) {
    const tick = run.next;
    const checked = checkedTickOf(definition, run, tick, run.stateForNext());
    run.record(tick, checked);
  }
}
