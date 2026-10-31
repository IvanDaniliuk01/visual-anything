/**
 * The inspector's Simulation section (ADR 0085), for an element whose component simulates: its
 * parameters as controls and its seed; Play, Pause, Back a tick, Forward a tick, Run from here,
 * Reset and the speed; the tick shown and the simulated time it stands for; the stop and why; each
 * value at the tick shown with its limits, marked `∿`; and a chart of each number over the ticks
 * held, on which a click, or the arrow keys, go to a tick.
 *
 * Nothing here is saved: the run lives in the tab's simulation store. Only this section renders as a
 * run plays; the canvas reads the values through the attribute lookup.
 */
import {
  SIMULATION_LIMITS,
  checkParameters,
  simulationOf,
  type ComponentSimulation,
  type SimulationSpeed,
} from '@visual-anything/core';
import type {
  Element,
  ParameterDefinition,
  ParameterValue,
  SimulatedValueDefinition,
} from '@visual-anything/schema';
import { useId } from 'react';
import { useCode } from '../code/context';
import { useEditor } from '../editor/EditorContext';
import { useT, type Translator } from '../i18n';
import { SIMULATED_MARK } from '../live-values/details';
import { CheckboxControl, SelectControl, TextControl } from '../shell/inspector/controls';
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from '../shell/icons';
import { SimulationChart } from './SimulationChart';
import { useSimulations, useSimulationVersion } from './context';
import type { SimulationShown, SimulationStore } from './store';
import { numberText, speedText, stopText, tickText, unavailableText, valueText } from './words';
import './simulation.css';

export function SimulationSection({ element }: { element: Element }) {
  const t = useT();
  const store = useSimulations();
  const { definitions, project } = useEditor();
  useSimulationVersion(store);
  const headingId = useId();
  const simulation = simulationOf(definitions, element.component);
  if (!store || !simulation) return null;
  const run = store.get(element.id);
  const packageName =
    project.packages.find((each) => each.id === simulation.package)?.name ?? simulation.package;
  const { description } = simulation.definition;

  return (
    <section className="inspector-section simulation" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Simulation')}</h4>
      {description !== undefined && <p className="inspector-notes">{description}</p>}
      {run ? (
        <RunControls
          store={store}
          run={run}
          element={element}
          packageName={packageName}
          labelledBy={headingId}
        />
      ) : (
        <>
          <p className="panel-empty">
            {t(
              'Open it to choose its parameters and play it tick by tick. Nothing it works out is saved.',
            )}
          </p>
          <button
            type="button"
            className="inspector-action"
            onClick={() => store.open(element.id, simulation)}
          >
            {t('Open the simulation')}
          </button>
        </>
      )}
    </section>
  );
}

interface RunControlsProps {
  store: SimulationStore;
  run: SimulationShown;
  element: Element;
  packageName: string;
  labelledBy: string;
}

function RunControls({ store, run, element, packageName, labelledBy }: RunControlsProps) {
  const t = useT();
  const code = useCode();
  const { definitions } = useEditor();
  const { definition } = run.simulation;
  const id = element.id;
  const last = run.ticks.length - 1;
  const atEnd = run.shown >= last;
  const tick = run.ticks[run.shown];
  const canPlay =
    run.unavailable === undefined &&
    !(atEnd && run.stop !== undefined && run.stop.kind !== 'ticks') &&
    !(atEnd && run.stop?.kind === 'ticks' && run.planned >= SIMULATION_LIMITS.maxTicks);
  const attributes = new Set(
    (definitions.component(element.component)?.attributes ?? []).map((each) => each.name),
  );
  for (const name of Object.keys(element.attributes ?? {})) attributes.add(name);

  return (
    <>
      {run.unavailable !== undefined && (
        <div className="simulation-unavailable">
          <p className="inspector-warning">{unavailableText(t, run.unavailable, packageName)}</p>
          {(run.unavailable === 'not-approved' || run.unavailable === 'off') && code && (
            <button
              type="button"
              className="inspector-action"
              onClick={() => code.review(run.simulation.package)}
            >
              {t('Review the code of “{name}”…', { name: packageName })}
            </button>
          )}
        </div>
      )}
      <fieldset className="simulation-parameters">
        <legend>{t('Parameters')}</legend>
        {definition.parameters.map((parameter) => (
          <ParameterControl
            key={parameter.name}
            parameter={parameter}
            simulation={run.simulation}
            value={run.parameters[parameter.name] ?? parameter.default}
            onChange={(value) => store.setParameters(id, { [parameter.name]: value })}
          />
        ))}
        <SeedControl store={store} run={run} />
      </fieldset>
      <div className="simulation-transport" role="group" aria-labelledby={labelledBy}>
        {run.playing ? (
          <button
            type="button"
            className="simulation-button"
            aria-label={t('Pause')}
            title={t('Pause')}
            onClick={() => store.pause(id)}
          >
            <PauseIcon />
          </button>
        ) : (
          <button
            type="button"
            className="simulation-button"
            aria-label={t('Play')}
            title={t('Play')}
            disabled={!canPlay}
            onClick={() => store.play(id)}
          >
            <PlayIcon />
          </button>
        )}
        <button
          type="button"
          className="simulation-button"
          aria-label={t('Back a tick')}
          title={t('Back a tick')}
          disabled={run.shown <= 0}
          onClick={() => store.back(id)}
        >
          <PreviousIcon />
        </button>
        <button
          type="button"
          className="simulation-button"
          aria-label={t('Forward a tick')}
          title={t('Forward a tick')}
          disabled={run.unavailable !== undefined || (atEnd && run.stop !== undefined)}
          onClick={() => store.forward(id)}
        >
          <NextIcon />
        </button>
        <button
          type="button"
          className="inspector-action simulation-text-button"
          disabled={run.unavailable !== undefined || run.ticks.length === 0 || (atEnd && !run.stop)}
          onClick={() => store.fromHere(id)}
        >
          {t('Run from here')}
        </button>
        <button
          type="button"
          className="inspector-action simulation-text-button"
          onClick={() => store.reset(id)}
        >
          {t('Reset')}
        </button>
        <SpeedControl store={store} run={run} />
      </div>
      <p className="simulation-tick">{tickText(t, definition, run.shown, run.planned)}</p>
      {run.stop !== undefined &&
        (atEnd || !run.playing) &&
        // Code turned off or no longer approved first ends the run as the model changing: why it
        // cannot run says more.
        !(run.unavailable !== undefined && run.stop.kind === 'changed') && (
          <p
            className={
              run.stop.kind === 'failed' || run.stop.kind === 'limit'
                ? 'inspector-warning simulation-stop'
                : 'simulation-stop'
            }
          >
            {stopText(t, run.stop, definition)}
          </p>
        )}
      {run.target !== undefined && run.unavailable === undefined && (
        <p className="simulation-waiting">
          {t('Working out the ticks up to tick {tick}…', { tick: run.target })}
        </p>
      )}
      <ul className="simulation-values" aria-label={t('Simulated values')}>
        {definition.values.map((value) => (
          <ValueRow
            key={value.name}
            value={value}
            run={run}
            shown={tick?.values[value.name]}
            packageName={packageName}
            inPlace={attributes.has(value.name)}
            onGoTo={(to) => store.goTo(id, to)}
          />
        ))}
      </ul>
      <button type="button" className="inspector-action" onClick={() => store.close(id)}>
        {t('Close the simulation')}
      </button>
    </>
  );
}

interface ParameterControlProps {
  parameter: ParameterDefinition;
  simulation: ComponentSimulation;
  value: ParameterValue;
  onChange: (value: ParameterValue) => void;
}

/** A parameter's control: a slider with its field for a number with a range, a list, a check box. */
function ParameterControl({ parameter, simulation, value, onChange }: ParameterControlProps) {
  const t = useT();
  const fieldId = useId();
  const sliderId = useId();
  const descriptionId = useId();
  const label =
    parameter.unit === undefined ? parameter.name : `${parameter.name} (${parameter.unit})`;
  const described = parameter.description === undefined ? undefined : descriptionId;
  const description = parameter.description !== undefined && (
    <p id={descriptionId} className="simulation-hint">
      {parameter.description}
    </p>
  );
  const commit = (next: ParameterValue) => {
    onChange(next);
    return Promise.resolve();
  };

  if (parameter.type === 'boolean') {
    return (
      <div className="inspector-control inspector-check simulation-parameter">
        <CheckboxControl
          id={fieldId}
          disabled={false}
          describedBy={described}
          checked={value === true}
          onCommit={commit}
        />
        <label htmlFor={fieldId}>{label}</label>
        {description}
      </div>
    );
  }
  if (parameter.type === 'choice') {
    return (
      <div className="inspector-control simulation-parameter">
        <label htmlFor={fieldId}>{label}</label>
        <SelectControl
          id={fieldId}
          disabled={false}
          describedBy={described}
          value={String(value)}
          onCommit={commit}
        >
          {(parameter.choices ?? []).map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </SelectControl>
        {description}
      </div>
    );
  }
  const ranged = parameter.min !== undefined && parameter.max !== undefined;
  const number = typeof value === 'number' ? value : Number(parameter.default);
  return (
    <div className="inspector-control simulation-parameter">
      <label htmlFor={fieldId}>{label}</label>
      <div className="simulation-number">
        {ranged && (
          <input
            id={sliderId}
            type="range"
            aria-label={t('{name}, as a slider', { name: parameter.name })}
            aria-describedby={described}
            min={parameter.min}
            max={parameter.max}
            step={parameter.step ?? 'any'}
            value={number}
            onChange={(event) => onChange(Number(event.target.value))}
          />
        )}
        <TextControl
          id={fieldId}
          inputType="number"
          disabled={false}
          describedBy={described}
          value={numberText(number)}
          problemOf={(text) => numberProblem(t, simulation, parameter, text)}
          onCommit={(text) => commit(Number(text))}
        />
      </div>
      {description}
    </div>
  );
}

/** Why a typed number cannot be a parameter's value, in words; none when it can. */
function numberProblem(
  t: Translator,
  simulation: ComponentSimulation,
  parameter: ParameterDefinition,
  text: string,
): string | undefined {
  const number = text.trim() === '' ? Number.NaN : Number(text);
  const checked = checkParameters(simulation.definition, { [parameter.name]: number });
  return checked.ok ? undefined : t.message(checked.reason);
}

function SeedControl({ store, run }: { store: SimulationStore; run: SimulationShown }) {
  const t = useT();
  const seedId = useId();
  const hintId = useId();
  return (
    <div className="inspector-control simulation-parameter">
      <label htmlFor={seedId}>{t('Seed')}</label>
      <div className="simulation-number">
        <TextControl
          id={seedId}
          inputType="number"
          disabled={false}
          describedBy={hintId}
          value={String(run.seed)}
          problemOf={(text) => {
            const seed = text.trim() === '' ? Number.NaN : Number(text);
            return Number.isInteger(seed) && seed >= 0 && seed <= SIMULATION_LIMITS.maxSeed
              ? undefined
              : t('A seed is a whole number from 0 to {max}.', { max: SIMULATION_LIMITS.maxSeed });
          }}
          onCommit={(text) => {
            store.setSeed(run.element, Number(text));
            return Promise.resolve();
          }}
        />
        <button
          type="button"
          className="inspector-action simulation-text-button"
          onClick={() => store.setSeed(run.element, newSeed(run.seed))}
        >
          {t('New seed')}
        </button>
      </div>
      <p id={hintId} className="simulation-hint">
        {t('The same seed and parameters always play the same ticks.')}
      </p>
    </div>
  );
}

/** A seed other than the one given, drawn at random. */
function newSeed(was: number): number {
  for (;;) {
    const seed = Math.floor(Math.random() * (SIMULATION_LIMITS.maxSeed + 1));
    if (seed !== was) return seed;
  }
}

function SpeedControl({ store, run }: { store: SimulationStore; run: SimulationShown }) {
  const t = useT();
  const speedId = useId();
  return (
    <span className="simulation-speed">
      <label htmlFor={speedId}>{t('Speed')}</label>
      <SelectControl
        id={speedId}
        disabled={false}
        value={String(run.speed)}
        onCommit={(value) => {
          store.setSpeed(run.element, speedOf(value));
          return Promise.resolve();
        }}
      >
        {SIMULATION_LIMITS.speeds.map((speed) => (
          <option key={speed} value={String(speed)}>
            {speedText(t, speed)}
          </option>
        ))}
      </SelectControl>
    </span>
  );
}

function speedOf(value: string): SimulationSpeed {
  const found = SIMULATION_LIMITS.speeds.find((speed) => String(speed) === value);
  return found ?? 5;
}

interface ValueRowProps {
  value: SimulatedValueDefinition;
  run: SimulationShown;
  shown: number | string | boolean | undefined;
  packageName: string;
  /** Whether the element has an attribute of its name, which the value is read in place of. */
  inPlace: boolean;
  onGoTo: (tick: number) => void;
}

function ValueRow({ value, run, shown, packageName, inPlace, onGoTo }: ValueRowProps) {
  const t = useT();
  const limits = limitsText(t, value);
  return (
    <li className="simulation-value">
      <span className="simulation-value-name">{value.name}</span>
      <span className="simulation-value-text">
        {shown === undefined ? t('none at this tick') : valueText(t, shown, value.unit)}
      </span>
      <span
        className="simulation-mark"
        title={t('Simulated by the code of “{name}”, and never saved.', { name: packageName })}
      >
        <span aria-hidden="true">{SIMULATED_MARK}</span>
        <span className="visually-hidden">
          {t('Simulated by the code of “{name}”, and never saved.', { name: packageName })}
        </span>
      </span>
      {limits !== undefined && <span className="simulation-value-limits">{limits}</span>}
      {inPlace && (
        <span className="simulation-value-limits">
          {t('Shown on the canvas in place of the attribute “{name}”.', { name: value.name })}
        </span>
      )}
      {value.type === 'number' && run.ticks.length > 0 && (
        <SimulationChart value={value} run={run} onGoTo={onGoTo} />
      )}
    </li>
  );
}

/** A value's limits in words; none when it has none. */
function limitsText(t: Translator, value: SimulatedValueDefinition): string | undefined {
  const of = (bound: number) => valueText(t, bound, value.unit);
  if (value.min !== undefined && value.max !== undefined) {
    return t('Limits: from {min} to {max}', { min: of(value.min), max: of(value.max) });
  }
  if (value.min !== undefined) return t('Limit: at least {min}', { min: of(value.min) });
  if (value.max !== undefined) return t('Limit: at most {max}', { max: of(value.max) });
  if (value.choices !== undefined) {
    return t('One of: {choices}', { choices: value.choices.join(', ') });
  }
  return undefined;
}
