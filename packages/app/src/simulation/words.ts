/**
 * What the app says of simulation runs (ADR 0085), in the language read in (ADR-0038): a tick and
 * the simulated time it stands for, why a run stopped, and why one cannot run.
 */
import type { SimulatedValue, SimulationSpeed, SimulationStop } from '@visual-anything/core';
import type { SimulationDefinition } from '@visual-anything/schema';
import type { Translator } from '../i18n';
import type { SimulationUnavailable } from './messages';

/** A number as the section writes it: whole, or with no more than six significant digits. */
export function numberText(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)));
}

/** A simulated value as the section writes it, its unit after a number. */
export function valueText(t: Translator, value: SimulatedValue, unit?: string): string {
  if (typeof value === 'boolean') return value ? t('true') : t('false');
  if (typeof value === 'number') {
    return unit === undefined ? numberText(value) : `${numberText(value)} ${unit}`;
  }
  return value;
}

/** The simulated time a tick stands for, "12 s"; none for a simulation whose ticks have no unit. */
export function simulatedTime(definition: SimulationDefinition, tick: number): string | undefined {
  const length = definition.tick;
  if (length === undefined) return undefined;
  return `${numberText(tick * length.length)} ${length.unit}`;
}

/** The tick shown, out of how many a run plays, with the simulated time it stands for. */
export function tickText(
  t: Translator,
  definition: SimulationDefinition,
  tick: number,
  planned: number,
): string {
  const time = simulatedTime(definition, tick);
  const last = Math.max(0, planned - 1);
  return time === undefined
    ? t('Tick {tick} of {last}', { tick, last })
    : t('Tick {tick} of {last}, at {time}', { tick, last, time });
}

/** Why a run stopped, in a sentence or two, with the tick it stopped at. */
export function stopText(
  t: Translator,
  stop: SimulationStop,
  definition: SimulationDefinition,
): string {
  switch (stop.kind) {
    case 'done':
      return stop.message === undefined
        ? t('It ended by itself at tick {tick}.', { tick: stop.tick })
        : t('It ended by itself at tick {tick}: {message}', {
            tick: stop.tick,
            message: stop.message,
          });
    case 'ticks':
      return t(
        { one: 'It played its {count} tick.', other: 'It played its {count} ticks.' },
        { count: stop.tick + 1 },
      );
    case 'limit':
      return limitText(t, stop, definition);
    case 'failed':
      return failedText(t, stop);
    case 'full':
      return t(
        'What it keeps for going back is full, so it stopped before tick {tick}. Run from here plays on from an earlier tick.',
        { tick: stop.tick },
      );
    case 'changed':
      return t(
        'The model changed, so it stopped before tick {tick}. Reset plays it again from the model as it is now.',
        { tick: stop.tick },
      );
  }
}

function limitText(
  t: Translator,
  stop: Extract<SimulationStop, { kind: 'limit' }>,
  definition: SimulationDefinition,
): string {
  const unit = definition.values.find((each) => each.name === stop.value)?.unit;
  const got = valueText(t, stop.got, unit);
  const bound = stop.bound === undefined ? '' : valueText(t, stop.bound, unit);
  const values = { tick: stop.tick, value: stop.value, bound, got };
  switch (stop.limit) {
    case 'min':
      return t(
        'At tick {tick}, “{value}” went below its lowest limit, {bound}: it was {got}. The ticks before it are kept.',
        values,
      );
    case 'max':
      return t(
        'At tick {tick}, “{value}” went above its highest limit, {bound}: it was {got}. The ticks before it are kept.',
        values,
      );
    case 'choices':
      return t(
        'At tick {tick}, “{value}” was “{got}”, which is not one of its choices. The ticks before it are kept.',
        values,
      );
    case 'finite':
      return t(
        'At tick {tick}, “{value}” was not a finite number. The ticks before it are kept.',
        values,
      );
  }
}

function failedText(t: Translator, stop: Extract<SimulationStop, { kind: 'failed' }>): string {
  const { failure, tick } = stop;
  switch (failure.kind) {
    case 'threw':
      return t('At tick {tick}, the code failed: {message}', { tick, message: failure.message });
    case 'time':
      return t('At tick {tick}, the code was stopped: it ran past its time.', { tick });
    case 'memory':
      return t('At tick {tick}, the code was stopped: it took more memory than it may.', { tick });
    case 'answer':
      return t('At tick {tick}, the code’s answer was refused: {reason}', {
        tick,
        reason: t.message(failure.reason),
      });
  }
}

/** A speed in words: "5 ticks a second", or "As fast as it goes". */
export function speedText(t: Translator, speed: SimulationSpeed): string {
  return speed === 'max'
    ? t('As fast as it goes')
    : t({ one: '{count} tick a second', other: '{count} ticks a second' }, { count: speed });
}

/** Why an element's simulation cannot run, naming the package that declares it. */
export function unavailableText(
  t: Translator,
  reason: SimulationUnavailable,
  packageName: string,
): string {
  switch (reason) {
    case 'no-simulation':
      return t('Its component simulates nothing now.');
    case 'no-code':
      return t(
        'The package “{name}” declares this simulation, but its code exports no simulate hook.',
        { name: packageName },
      );
    case 'not-approved':
      return t(
        'The code of “{name}” is not approved, so it cannot simulate. Review it to approve it.',
        { name: packageName },
      );
    case 'off':
      return t(
        'The code of “{name}” is turned off after it failed too many times in a row. Review it to run it again.',
        { name: packageName },
      );
    case 'too-many':
      return t(
        'This tab runs as many simulations as it may at once. Close one, then press Reset to run this one.',
      );
  }
}
