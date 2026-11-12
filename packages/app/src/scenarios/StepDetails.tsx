/**
 * The step playback is on, in the step panel: what moves, its description and its data in and out,
 * and the pictures, videos and link cards it shows (ADR 0098, stage 4), each edited as one command. A broken step says which relations are gone and offers to fix it; an
 * aggregated step lists the steps it stands for and offers to expand its container. A step can start
 * an alternative after it, and one in an alternative can rejoin the steps after the decision there
 * (ADR 0078).
 */
import {
  alternativesOf,
  choosesPictures,
  deleteStep,
  describeStep,
  isOutside,
  modelIndexOf,
  moveStep,
  rejoinAt,
  repairStep,
  setStepData,
  setStepPictures,
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
import { OutsideNote } from './OutsideNote';
import { decisionsCommand } from './record-decisions';
import { StepPictures } from './StepPictures';

interface StepDetailsProps {
  project: ProjectSnapshot;
  scenario: ScenarioFile;
  entry: TimelineEntry;
  /** Sends a command, and says `done` once it is applied; resolves to whether it was. */
  send: (command: Command, done?: string) => Promise<boolean>;
  /** Brings what the entry highlights into sight on the canvas. */
  onShow: (() => void) | undefined;
  /** Asks for the words of an alternative to add after a step, by its index; none while read-only. */
  onAddAlternative?: ((after: number) => void) | undefined;
}

export function StepDetails({
  project,
  scenario,
  entry,
  send,
  onShow,
  onAddAlternative,
}: StepDetailsProps) {
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
  const details = (
    <StepEditor
      project={project}
      scenario={scenario}
      step={step}
      at={at}
      missing={entry.missing}
      editable={editable}
      send={send}
      onShow={onShow}
      onAddAlternative={onAddAlternative}
    />
  );
  // A step outside the view says so first (ADR-0040).
  if (!isOutside(entry)) return details;
  return (
    <>
      <OutsideNote
        project={project}
        scenario={scenario}
        step={step}
        editable={editable}
        send={send}
      />
      {details}
    </>
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
  onAddAlternative,
}: {
  project: ProjectSnapshot;
  scenario: ScenarioFile;
  step: Step;
  at: number;
  missing: Id[];
  editable: boolean;
  send: StepDetailsProps['send'];
  onShow: (() => void) | undefined;
  onAddAlternative: ((after: number) => void) | undefined;
}) {
  const t = useT();
  const editor = useEditor();
  const ids = { description: useId(), dataIn: useId(), dataOut: useId(), moves: useId() };
  const index = modelIndexOf(project);
  const exists = (id: Id) => index.relation(id) !== undefined;
  const label = stepOf(scenario, at);
  const broken = missing.length > 0;
  const kept = step.relations.filter(exists);
  // A step moves only among the steps of its own stretch: the alternative it is in, or none.
  const stretch = (position: number) => {
    const each = scenario.steps[position];
    return each
      ? alternativesOf(scenario, each.id)
          .map((holding) => holding.alternative)
          .join('/')
      : undefined;
  };
  const canMove = (to: number) => stretch(to) !== undefined && stretch(to) === stretch(at);
  const rejoined = scenario.blocks ? rejoinAt(scenario, step.id) : undefined;

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

      <StepPictures
        view={project.views.find((each) => each.id === scenario.view)}
        lists={{
          ...(step.shows ? { shows: step.shows } : {}),
          ...(step.playing ? { playing: step.playing } : {}),
        }}
        chooses={choosesPictures(scenario.steps)}
        owner="scenario"
        editable={editable}
        onChange={(lists) =>
          void change(
            setStepPictures(scenario.steps, at, lists),
            fill('Choose what {step} shows', { step: label }),
            t('Changed what step {n} shows.', { n: at + 1 }),
          )
        }
      />

      <div className="scenario-actions">
        {onShow && (
          <button type="button" className="scenario-button" onClick={onShow}>
            {t('Show on the canvas')}
          </button>
        )}
        {onAddAlternative && (
          <button
            type="button"
            className="scenario-button"
            disabled={!editable}
            onClick={() => onAddAlternative(at)}
          >
            {t('Add an alternative here')}
          </button>
        )}
        {rejoined && (
          <button
            type="button"
            className="scenario-button"
            disabled={!editable}
            title={t(
              'This step and the ones after it in its alternative follow the decision, whichever way it goes.',
            )}
            onClick={() =>
              void send(
                decisionsCommand(scenario, rejoined, fill('Rejoin at {step}', { step: label })),
                t('Step {n} and the steps after it in its alternative now follow the decision.', {
                  n: at + 1,
                }),
              )
            }
          >
            {t('Rejoin here')}
          </button>
        )}
        <button
          type="button"
          className="scenario-button"
          disabled={!editable || at === 0 || !canMove(at - 1)}
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
          disabled={!editable || at === scenario.steps.length - 1 || !canMove(at + 1)}
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
