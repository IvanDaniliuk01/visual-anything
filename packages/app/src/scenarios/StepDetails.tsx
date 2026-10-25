/**
 * The step playback is on, in the step panel: what moves, its description and its data in and out,
 * each edited as one command. A broken step says which relations are gone and offers to fix it; an
 * aggregated step lists the steps it stands for and offers to expand its container.
 */
import {
  deleteStep,
  describeStep,
  modelIndexOf,
  moveStep,
  repairStep,
  setStepData,
  takeOutOfStep,
  type Command,
  type NewStep,
  type ProjectSnapshot,
  type TimelineEntry,
} from '@visual-anything/core';
import type { Id, ScenarioFile, Step } from '@visual-anything/schema';
import { useId } from 'react';
import { nameOfEnd } from '../canvas/announce';
import { useEditor } from '../editor/EditorContext';
import { useT } from '../i18n';
import { fill } from '../i18n/translate';
import { TextControl } from '../shell/inspector/controls';
import { expandCommand, stepOf, stepsCommand } from './commands';
import { jsonText, readJson, sameJson } from './json';

interface StepDetailsProps {
  project: ProjectSnapshot;
  scenario: ScenarioFile;
  entry: TimelineEntry;
  /** Sends a command, and says `done` once it is applied; resolves to whether it was. */
  send: (command: Command, done?: string) => Promise<boolean>;
  /** Brings what the entry highlights into sight on the canvas. */
  onShow: (() => void) | undefined;
}

export function StepDetails({ project, scenario, entry, send, onShow }: StepDetailsProps) {
  const t = useT();
  const editor = useEditor();
  const editable = editor.send !== undefined;
  const index = modelIndexOf(project);
  const name = (id: Id) => index.element(id)?.name ?? id;

  if (entry.kind === 'aggregated') {
    const steps = scenario.steps.slice(entry.first, entry.first + entry.count);
    const container = name(entry.container);
    return (
      <div className="scenario-step-details">
        <p>
          {t(
            {
              one: 'This step happens inside “{container}”, which is collapsed in this view.',
              other:
                'These {count} steps happen inside “{container}”, which is collapsed in this view.',
            },
            { count: entry.count, container },
          )}
        </p>
        <ol className="scenario-aggregated" start={entry.first + 1}>
          {steps.map((step) => (
            <li key={step.id}>{step.description || t('No description yet.')}</li>
          ))}
        </ol>
        <div className="scenario-actions">
          <button
            type="button"
            className="scenario-button"
            disabled={!editable}
            onClick={() =>
              void send(
                expandCommand(scenario.view, entry.container),
                t('Expanded “{container}”.', { container }),
              )
            }
          >
            {t('Expand “{container}”', { container })}
          </button>
          {onShow && (
            <button type="button" className="scenario-button" onClick={onShow}>
              {t('Show on the canvas')}
            </button>
          )}
        </div>
      </div>
    );
  }

  const at = entry.first;
  const step = scenario.steps[at];
  if (!step) return null;
  return (
    <StepEditor
      project={project}
      scenario={scenario}
      step={step}
      at={at}
      missing={entry.missing}
      editable={editable}
      send={send}
      onShow={onShow}
    />
  );
}

function StepEditor({
  project,
  scenario,
  step,
  at,
  missing,
  editable,
  send,
  onShow,
}: {
  project: ProjectSnapshot;
  scenario: ScenarioFile;
  step: Step;
  at: number;
  missing: Id[];
  editable: boolean;
  send: StepDetailsProps['send'];
  onShow: (() => void) | undefined;
}) {
  const t = useT();
  const editor = useEditor();
  const ids = { description: useId(), dataIn: useId(), dataOut: useId(), moves: useId() };
  const index = modelIndexOf(project);
  const exists = (id: Id) => index.relation(id) !== undefined;
  const label = stepOf(scenario, at);
  const broken = missing.length > 0;
  const kept = step.relations.filter(exists);

  const change = (steps: NewStep[] | undefined, history: string, done?: string) =>
    steps ? send(stepsCommand(scenario, steps, history), done) : Promise.resolve(false);

  // The one relation selected on the canvas, which can take the place of the ones that are gone.
  const [chosen] = editor.selection.relations;
  const selectedRelation =
    editor.selection.relations.size === 1 &&
    editor.selection.elements.size === 0 &&
    editor.selection.freeShapes.size === 0 &&
    chosen !== undefined &&
    exists(chosen) &&
    !step.relations.includes(chosen)
      ? chosen
      : undefined;

  const commitData = (which: 'dataIn' | 'dataOut') => async (text: string) => {
    const read = readJson(text);
    if (!read.ok) return;
    const history =
      which === 'dataIn'
        ? fill('Change what {step} takes in', { step: label })
        : fill('Change what {step} produces', { step: label });
    await change(setStepData(scenario.steps, at, which, read.value), history);
  };

  return (
    <div className="scenario-step-details">
      <h4 id={ids.moves}>
        {step.relations.length === 1 ? t('Relation') : t('Relations, at once')}
      </h4>
      <ul className="scenario-relations" aria-labelledby={ids.moves}>
        {kept.map((relation) => (
          <li key={relation}>
            <span>{nameOfEnd(project, relation)}</span>
            {!broken && step.relations.length > 1 && (
              <button
                type="button"
                className="scenario-button scenario-button-small"
                disabled={!editable}
                onClick={() =>
                  void change(
                    takeOutOfStep(scenario.steps, at, relation, exists),
                    fill('Take a relation out of {step}', { step: label }),
                    t('Taken out of step {n}.', { n: at + 1 }),
                  )
                }
              >
                {t('Take out')}
                <span className="visually-hidden"> {nameOfEnd(project, relation)}</span>
              </button>
            )}
          </li>
        ))}
        {missing.map((relation) => (
          <li key={relation} className="scenario-missing">
            <span className="scenario-badge scenario-badge-broken">{t('Broken')}</span>
            <span>
              {t('A relation this step used no longer exists ({relation}).', { relation })}
            </span>
          </li>
        ))}
      </ul>
      {broken && (
        <div className="scenario-fix">
          <p>
            {missing.length === 1
              ? t('This is a broken step: the relation above was deleted.')
              : t('This is a broken step: {count} of its relations were deleted.', {
                  count: missing.length,
                })}{' '}
            {t('Select the relation that replaces it on the canvas, or take out what is gone.')}
          </p>
          <div className="scenario-actions">
            <button
              type="button"
              className="scenario-button"
              disabled={!editable || selectedRelation === undefined}
              title={
                selectedRelation === undefined
                  ? t('Select one relation on the canvas first.')
                  : undefined
              }
              onClick={() =>
                void change(
                  repairStep(scenario.steps, at, exists, selectedRelation),
                  fill('Fix {step}', { step: label }),
                  t('Step {n} is fixed.', { n: at + 1 }),
                )
              }
            >
              {t('Use the selected relation')}
            </button>
            {kept.length > 0 && (
              <button
                type="button"
                className="scenario-button"
                disabled={!editable}
                onClick={() =>
                  void change(
                    repairStep(scenario.steps, at, exists),
                    fill('Fix {step}', { step: label }),
                    t('Step {n} is fixed.', { n: at + 1 }),
                  )
                }
              >
                {t('Take out what is gone')}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="scenario-field">
        <label htmlFor={ids.description}>{t('Description')}</label>
        <TextControl
          id={ids.description}
          disabled={!editable}
          multiline
          value={step.description}
          onCommit={(text) =>
            change(describeStep(scenario.steps, at, text), fill('Describe {step}', { step: label }))
          }
        />
      </div>
      <div className="scenario-field scenario-data">
        <label htmlFor={ids.dataIn}>{t('Data in (JSON)')}</label>
        <TextControl
          id={ids.dataIn}
          disabled={!editable}
          multiline
          value={jsonText(step.dataIn)}
          problemOf={(text) => {
            const read = readJson(text);
            return read.ok ? undefined : t.message(read.reason);
          }}
          same={sameJson}
          onCommit={commitData('dataIn')}
        />
      </div>
      <div className="scenario-field scenario-data">
        <label htmlFor={ids.dataOut}>{t('Data out (JSON)')}</label>
        <TextControl
          id={ids.dataOut}
          disabled={!editable}
          multiline
          value={jsonText(step.dataOut)}
          problemOf={(text) => {
            const read = readJson(text);
            return read.ok ? undefined : t.message(read.reason);
          }}
          same={sameJson}
          onCommit={commitData('dataOut')}
        />
      </div>

      <div className="scenario-actions">
        {onShow && (
          <button type="button" className="scenario-button" onClick={onShow}>
            {t('Show on the canvas')}
          </button>
        )}
        <button
          type="button"
          className="scenario-button"
          disabled={!editable || at === 0}
          onClick={() =>
            void change(
              moveStep(scenario.steps, at, at - 1),
              fill('Move {step} up', { step: label }),
              t('Step {n} is now step {to}.', { n: at + 1, to: at }),
            )
          }
        >
          {t('Move up')}
        </button>
        <button
          type="button"
          className="scenario-button"
          disabled={!editable || at === scenario.steps.length - 1}
          onClick={() =>
            void change(
              moveStep(scenario.steps, at, at + 1),
              fill('Move {step} down', { step: label }),
              t('Step {n} is now step {to}.', { n: at + 1, to: at + 2 }),
            )
          }
        >
          {t('Move down')}
        </button>
        <button
          type="button"
          className="scenario-button scenario-button-danger"
          disabled={!editable}
          onClick={() =>
            void change(
              deleteStep(scenario.steps, at),
              fill('Delete {step}', { step: label }),
              t('Step {n} is deleted.', { n: at + 1 }),
            )
          }
        >
          {t('Delete step')}
        </button>
      </div>
      <p className="scenario-hint">
        {t('Enter saves a field; Shift+Enter starts a new line. Leave data blank for none.')}
      </p>
    </div>
  );
}
