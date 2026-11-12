/**
 * What a tour step shows live while it plays (ADR 0107), in the step's editor: an explorable of the
 * project's packages, chosen from a list, and the values it sets, through a form built from the
 * parameters the explorable declares: a number or a whole number within its range, yes or no, or one
 * of its choices, each showing its default and taken back to it on request. A step whose explorable no
 * package defines, or that sets a parameter no longer declared or a value its parameter no longer
 * takes, is a broken step, kept and played without it: the core marks it, and this says so beside the
 * explorable with a way to fix it.
 */
import {
  explorablesIn,
  readParameterText,
  repairedStepExplorable,
  stepExplorableValues,
  tourExplorableProblems,
  withStepExplorable,
  withStepParameter,
} from '@visual-anything/core';
import type {
  ExplorableParameter,
  ExplorableParameterValue,
  Id,
  TourStep,
} from '@visual-anything/schema';
import { useId, useState, type ReactNode } from 'react';
import { useEditor } from '../editor/EditorContext';
import { useT, type Translator } from '../i18n';

interface StepExplorableProps {
  step: TourStep;
  /** The step's number, from 1. */
  n: number;
  editable: boolean;
  change: (update: (step: TourStep) => TourStep, done: string) => void;
}

export function StepExplorable({ step, n, editable, change }: StepExplorableProps) {
  const t = useT();
  const { project } = useEditor();
  const heading = useId();
  const chooser = useId();
  const catalog = explorablesIn(project);
  const shown = step.explorable;
  const defined = shown ? catalog.explorable(shown.id) : undefined;
  const choices = [...catalog.explorables.values()]
    .map(({ definition }) => definition)
    .sort((a, b) => a.name.localeCompare(b.name, t.language));
  // Only what the explorable part of the step names: its other problems are listed above.
  const problems = tourExplorableProblems(project, step);
  const values = stepExplorableValues(project, step);
  const nameOf = (id: Id) => catalog.explorable(id)?.definition.name ?? id;
  // A project without explorables offers none, as a view without pictures offers none to show.
  if (choices.length === 0 && shown === undefined) return null;

  return (
    <fieldset className="tour-step-explorable" aria-labelledby={heading}>
      <legend id={heading}>{t('Explorable')}</legend>
      <div className="tour-field">
        <label htmlFor={chooser}>{t('Shows live while it plays')}</label>
        <select
          id={chooser}
          value={shown?.id ?? ''}
          disabled={!editable}
          onChange={(event) => {
            const chosen = event.target.value;
            change(
              (each) => withStepExplorable(each, chosen === '' ? undefined : chosen),
              chosen === ''
                ? t('Step {n} shows no explorable.', { n })
                : t('Step {n} shows the explorable “{name}”.', { n, name: nameOf(chosen) }),
            );
          }}
        >
          <option value="">{t('None')}</option>
          {shown !== undefined && defined === undefined && (
            <option value={shown.id}>
              {t('“{id}”, which no package defines', { id: shown.id })}
            </option>
          )}
          {choices.map((definition) => (
            <option key={definition.id} value={definition.id}>
              {definition.name}
            </option>
          ))}
        </select>
        <p className="tour-field-hint">
          {t(
            'It shows live beside the caption while the step plays, with the values set here; a value left out takes its default.',
          )}
        </p>
      </div>
      {problems.length > 0 && (
        <div className="tour-step-explorable-broken" role="group" aria-label={t('What is broken')}>
          <p>
            {defined === undefined
              ? t('No package defines this explorable now, so the step plays without it.')
              : t(
                  'The step sets what the explorable no longer takes, so it plays with the defaults instead:',
                )}
          </p>
          {defined !== undefined && (
            <ul>
              {problems.map((problem, at) => (
                <li key={at}>{t.message(problem.message)}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="tour-button"
            disabled={!editable}
            onClick={() =>
              change(
                (each) => repairedStepExplorable(project, each),
                defined === undefined
                  ? t('Step {n} shows no explorable.', { n })
                  : t('Step {n} sets only what its explorable takes.', { n }),
              )
            }
          >
            {defined === undefined ? t('Show none') : t('Take out what it no longer takes')}
          </button>
        </div>
      )}
      {defined !== undefined && values !== undefined && (
        <div className="tour-step-parameters">
          {(defined.definition.parameters ?? []).length === 0 ? (
            <p className="tour-field-hint">{t('It declares no parameter to set.')}</p>
          ) : (
            (defined.definition.parameters ?? []).map((parameter) => (
              <ParameterField
                key={`${defined.definition.id} ${parameter.name}`}
                parameter={parameter}
                value={values[parameter.name] ?? parameter.default}
                set={
                  shown?.parameters !== undefined && Object.hasOwn(shown.parameters, parameter.name)
                }
                editable={editable}
                onSet={(value) =>
                  change(
                    (each) => withStepParameter(each, parameter.name, value),
                    value === undefined
                      ? t('Step {n} takes the default of “{name}”.', {
                          n,
                          name: labelOf(parameter),
                        })
                      : t('Step {n} sets “{name}” to {value}.', {
                          n,
                          name: labelOf(parameter),
                          value: valueText(t, value),
                        }),
                  )
                }
              />
            ))
          )}
        </div>
      )}
    </fieldset>
  );
}

/** What the form calls a parameter: its label, else its name. */
function labelOf(parameter: ExplorableParameter): string {
  return parameter.label ?? parameter.name;
}

/** A value as the form says it: yes and no in words, numbers in the language read in. */
function valueText(t: Translator, value: ExplorableParameterValue): string {
  if (typeof value === 'boolean') return value ? t('yes') : t('no');
  if (typeof value === 'number')
    return value.toLocaleString(t.language, { maximumFractionDigits: 6 });
  return value;
}

/** One parameter's field, with its default, and a way back to it once the step sets it. */
function ParameterField({
  parameter,
  value,
  set,
  editable,
  onSet,
}: {
  parameter: ExplorableParameter;
  value: ExplorableParameterValue;
  /** Whether the step sets it, rather than leaving it at its default. */
  set: boolean;
  editable: boolean;
  onSet: (value: ExplorableParameterValue | undefined) => void;
}) {
  const t = useT();
  const id = useId();
  const hint = useId();
  const label = labelOf(parameter);
  const defaultText = t('Default: {value}', { value: valueText(t, parameter.default) });
  const back = set && (
    <button
      type="button"
      className="tour-button tour-parameter-default"
      disabled={!editable}
      aria-label={t('Take “{name}” back to its default', { name: label })}
      onClick={() => onSet(undefined)}
    >
      {t('Default')}
    </button>
  );

  if (parameter.kind === 'boolean') {
    return (
      <div className="tour-parameter">
        <label className="tour-parameter-check">
          <input
            type="checkbox"
            checked={value === true}
            disabled={!editable}
            aria-describedby={hint}
            onChange={(event) => onSet(event.currentTarget.checked)}
          />
          <span>{label}</span>
        </label>
        <span id={hint} className="tour-field-hint">
          {defaultText}
        </span>
        {back}
      </div>
    );
  }

  if (parameter.kind === 'choice') {
    return (
      <div className="tour-parameter">
        <label htmlFor={id}>{label}</label>
        <select
          id={id}
          value={String(value)}
          disabled={!editable}
          aria-describedby={hint}
          onChange={(event) => onSet(event.target.value)}
        >
          {parameter.choices.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
        <span id={hint} className="tour-field-hint">
          {defaultText}
        </span>
        {back}
      </div>
    );
  }

  // Made again when the step's value changes elsewhere, by undo, Claude or Default, to show it.
  return (
    <NumberField
      key={String(value)}
      parameter={parameter}
      value={typeof value === 'number' ? value : parameter.default}
      label={label}
      hintText={t('{default}, from {min} to {max}', {
        default: defaultText,
        min: parameter.min.toLocaleString(t.language),
        max: parameter.max.toLocaleString(t.language),
      })}
      editable={editable}
      back={back}
      onSet={onSet}
    />
  );
}

/** A number's field: typed, and sent once it is left or Enter is pressed, when its parameter takes it. */
function NumberField({
  parameter,
  value,
  label,
  hintText,
  editable,
  back,
  onSet,
}: {
  parameter: Extract<ExplorableParameter, { kind: 'number' | 'integer' }>;
  value: number;
  label: string;
  hintText: string;
  editable: boolean;
  back: ReactNode;
  onSet: (value: number) => void;
}) {
  const t = useT();
  const id = useId();
  const hint = useId();
  const [text, setText] = useState(String(value));
  const [problem, setProblem] = useState<string>();
  const commit = () => {
    const read = readParameterText(parameter, text);
    if (!read.ok) {
      setProblem(read.problem);
      return;
    }
    setProblem(undefined);
    if (read.value !== value) onSet(read.value);
    else setText(String(value));
  };
  return (
    <div className="tour-parameter">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode={parameter.kind === 'integer' ? 'numeric' : 'decimal'}
        value={text}
        disabled={!editable}
        aria-describedby={hint}
        aria-invalid={problem === undefined ? undefined : true}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') {
            setText(String(value));
            setProblem(undefined);
          }
        }}
      />
      <span id={hint} className="tour-field-hint">
        {hintText}
      </span>
      {back}
      {problem !== undefined && (
        <p className="tour-parameter-problem" role="alert">
          {t.message(problem)}
        </p>
      )}
    </div>
  );
}
