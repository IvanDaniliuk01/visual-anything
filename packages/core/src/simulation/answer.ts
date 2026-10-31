/**
 * The check of what `simulate` answers for one tick (ADR 0085). The answer comes from code nobody
 * trusts: it is kept only when it is plain data within its caps, naming only declared values of
 * their types and marking only what lies around the element. A number past its limits, a string not
 * among its choices or a number that is not finite stops the run cleanly; anything else wrong drops
 * the answer as a failure of the code.
 */
import type { Id, JsonValue, SimulationDefinition } from '@visual-anything/schema';
import { plainSizeOf } from '../code/answers';
import { SIMULATION_LIMITS } from './limits';

/** A simulated value as a tick answers it. */
export type SimulatedValue = number | string | boolean;

/** One tick as a run keeps it: its values, by name, and its marks. */
export interface SimulatedTick {
  /** The declared values it answered, by name in the order they are declared; one may be left out. */
  values: Readonly<Record<string, SimulatedValue>>;
  /** The element, relations and elements around it it marks, each once, in the order answered. */
  marks: readonly Id[];
}

/** Which limit a value went past. */
export type LimitKind = 'min' | 'max' | 'choices' | 'finite';

/** What one tick's answer comes to. */
export type CheckedTick =
  | {
      kind: 'tick';
      tick: SimulatedTick;
      /** What the next tick is given as `context.state`; undefined when it answered none. */
      state: JsonValue | undefined;
      /** How long that state is, written as JSON, in characters. */
      stateSize: number;
      /** Present when the behavior ended by itself: `true`, or the sentence it said. */
      done?: true | string;
    }
  | {
      kind: 'limit';
      value: string;
      limit: LimitKind;
      /** The limit it went past, for `min` and `max`. */
      limitValue?: number;
      got: SimulatedValue;
    }
  | { kind: 'dropped'; reason: string };

const ANSWER_KEYS = new Set(['values', 'state', 'marks', 'done']);

/**
 * Checks what `simulate` answered for one tick of a run of `definition` on an element, where
 * `markable` holds what a tick may mark: the element, its relations, their ends, its containers and
 * its contents.
 */
export function checkSimulateAnswer(
  definition: SimulationDefinition,
  answer: unknown,
  markable: ReadonlySet<Id>,
): CheckedTick {
  // Values are checked one by one rather than as JSON, so that a number that is not finite, which
  // JSON cannot hold, stops the run at its limit instead of dropping the answer.
  if (!isRecord(answer)) return dropped('it is not an object with its values');
  for (const key of Object.keys(answer)) {
    if (!ANSWER_KEYS.has(key))
      return dropped(`it has ${JSON.stringify(key)}, which a tick has not`);
  }
  if (!isRecord(answer.values)) return dropped('its values are not an object of values by name');
  if (Object.keys(answer.values).length > SIMULATION_LIMITS.values) {
    return dropped(`it answers more than ${SIMULATION_LIMITS.values} values`);
  }

  const declared = new Map(definition.values.map((each) => [each.name, each]));
  for (const name of Object.keys(answer.values)) {
    if (!declared.has(name)) {
      return dropped(`it answers ${JSON.stringify(name)}, which the simulation does not declare`);
    }
  }
  const values: Record<string, SimulatedValue> = {};
  for (const each of definition.values) {
    if (!Object.hasOwn(answer.values, each.name)) continue;
    const value = answer.values[each.name];
    const named = JSON.stringify(each.name);
    switch (each.type) {
      case 'number': {
        if (typeof value !== 'number') return dropped(`the value of ${named} is not a number`);
        if (!Number.isFinite(value)) return limit(each.name, 'finite', value);
        if (each.min !== undefined && value < each.min)
          return limit(each.name, 'min', value, each.min);
        if (each.max !== undefined && value > each.max)
          return limit(each.name, 'max', value, each.max);
        break;
      }
      case 'string': {
        if (typeof value !== 'string') return dropped(`the value of ${named} is not a string`);
        if (value.length > SIMULATION_LIMITS.valueText) {
          return dropped(`the value of ${named} is over ${SIMULATION_LIMITS.valueText} characters`);
        }
        if (each.choices !== undefined && !each.choices.includes(value)) {
          return limit(each.name, 'choices', value);
        }
        break;
      }
      case 'boolean': {
        if (typeof value !== 'boolean')
          return dropped(`the value of ${named} is not true or false`);
        break;
      }
    }
    Object.defineProperty(values, each.name, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  const marks: Id[] = [];
  if (answer.marks !== undefined) {
    if (!Array.isArray(answer.marks)) return dropped('its marks are not a list of ids');
    if (answer.marks.length > SIMULATION_LIMITS.marks) {
      return dropped(`it marks more than ${SIMULATION_LIMITS.marks} things`);
    }
    const seen = new Set<Id>();
    for (const mark of answer.marks) {
      if (typeof mark !== 'string' || !markable.has(mark)) {
        return dropped(`it marks ${JSON.stringify(mark)}, which is not the element or around it`);
      }
      if (seen.has(mark)) continue;
      seen.add(mark);
      marks.push(mark);
    }
  }

  let state: JsonValue | undefined;
  let stateSize = 0;
  if (answer.state !== undefined) {
    const size = plainSizeOf(
      answer.state,
      SIMULATION_LIMITS.stateDepth,
      SIMULATION_LIMITS.stateText,
    );
    if (!size.ok) return dropped(`its state is not kept: ${size.reason}`);
    state = structuredClone(answer.state) as JsonValue;
    stateSize = size.size;
  }

  let done: true | string | undefined;
  if (answer.done !== undefined && answer.done !== false) {
    if (answer.done === true) done = true;
    else if (typeof answer.done === 'string' && answer.done.length <= SIMULATION_LIMITS.doneText) {
      done = answer.done.length === 0 ? true : answer.done;
    } else {
      return dropped(
        `its done is not true, false or a sentence of at most ${SIMULATION_LIMITS.doneText} characters`,
      );
    }
  }

  return {
    kind: 'tick',
    tick: { values, marks },
    state,
    stateSize,
    ...(done === undefined ? {} : { done }),
  };
}

function dropped(reason: string): CheckedTick {
  return { kind: 'dropped', reason };
}

function limit(
  value: string,
  kind: LimitKind,
  got: SimulatedValue,
  limitValue?: number,
): CheckedTick {
  return {
    kind: 'limit',
    value,
    limit: kind,
    got,
    ...(limitValue === undefined ? {} : { limitValue }),
  };
}

/** A plain object: one that derives from Object or from nothing, without a `__proto__` key. */
function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) && !Object.hasOwn(value, '__proto__')
  );
}
