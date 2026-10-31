/**
 * What `simulate` is given for one tick (ADR 0085): what every hook gets (ADR 0054), and the run's
 * parameters, the state the tick before answered, the tick and its simulated time. The sandbox adds
 * `context.random()`, which no plain data can carry.
 */
import type { Id, JsonValue, TickLength } from '@visual-anything/schema';
import type { HookContext, HookInput } from '../code/input';
import { hookInputOf } from '../code/input';
import type { ProjectSnapshot } from '../snapshot';
import type { RunParameters } from './parameters';

/** What lies around the element, and where the run is. */
export interface SimulateContext extends HookContext {
  parameters: RunParameters;
  /** What the tick before answered as its state; undefined at tick 0, or when it answered none. */
  state: JsonValue | undefined;
  /** The tick, from 0. */
  tick: number;
  /** The tick's simulated time: the tick times the length of one, in its unit. Never the clock. */
  time: number;
  /** The unit of `time`; absent when a tick has none. */
  unit?: string;
}

/** What one call of `simulate` is given: `simulate(element, context)`. */
export interface SimulateInput extends HookInput {
  context: SimulateContext;
}

/**
 * What a run of an element reads once, when it starts: the element and what lies around it. Each
 * tick's input is made from it by `simulateInputAt`. Undefined when no element has the id.
 */
export function simulationInputOf(state: ProjectSnapshot, element: Id): HookInput | undefined {
  return hookInputOf(state, element);
}

/** The input of one tick, from what the run read when it started. */
export function simulateInputAt(
  base: HookInput,
  at: {
    parameters: RunParameters;
    state: JsonValue | undefined;
    tick: number;
    tickLength?: TickLength;
  },
): SimulateInput {
  const length = at.tickLength?.length ?? 1;
  return {
    element: base.element,
    context: {
      ...base.context,
      parameters: at.parameters,
      state: at.state,
      tick: at.tick,
      time: at.tick * length,
      ...(at.tickLength === undefined ? {} : { unit: at.tickLength.unit }),
    },
  };
}

/** What a tick of a run on this input may mark: the element, its relations, their ends, its
 * containers and its contents. */
export function markableOf(base: HookInput): Set<Id> {
  const markable = new Set<Id>([base.element.id]);
  for (const relation of base.context.relations) markable.add(relation.id);
  for (const end of base.context.ends) markable.add(end.id);
  for (const each of base.context.containers) markable.add(each.id);
  for (const each of base.context.contents) markable.add(each.id);
  return markable;
}
