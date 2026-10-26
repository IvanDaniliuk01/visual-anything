/**
 * What the step panel says of a step outside the view (CONTEXT.md, ADR-0040): the scope of the view
 * it plays over shows none of its relations, so playback marks nothing for it there and goes on; it is
 * not a broken step. Add to this view brings in the ends its relations need, as one action. A step
 * whose relations are of relation types the view leaves out (ADR 0064) says so instead, and has no
 * ends to add.
 */
import {
  modelIndexOf,
  shownByScope,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, ScenarioFile, Step } from '@visual-anything/schema';
import { addToViewCommand, endsToAdd } from '../canvas/scope';
import { scopeLabel } from '../canvas/scopeActions';
import { useT } from '../i18n';

export function OutsideNote({
  project,
  scenario,
  step,
  editable,
  send,
}: {
  project: ProjectSnapshot;
  scenario: ScenarioFile;
  step: Step;
  editable: boolean;
  send: (command: Command, done?: string) => Promise<boolean>;
}) {
  const t = useT();
  const view = project.views.find((each) => each.id === scenario.view);
  if (!view) return null;
  const index = modelIndexOf(project);
  const nameOf = (id: Id) => index.element(id)?.name ?? id;
  const ends = endsToAdd(project, view, step.relations);
  // Every relation's ends show: only the relation types the view leaves out keep it from drawing them.
  const shown = shownByScope(project, view);
  const byType = step.relations.every((id) => shown.relationByScope(id));
  return (
    <div className="scenario-outside">
      <p>
        <span className="scenario-badge">{t('Outside the view')}</span>{' '}
        {byType
          ? t(
              '“{view}” leaves out the relation types of this step’s relations, so it draws no line for them. It plays all the same.',
              { view: view.name },
            )
          : t(
              'The scope of “{view}” shows none of this step’s relations, so nothing is marked for it there. It plays all the same.',
              { view: view.name },
            )}
      </p>
      {ends.length > 0 && (
        <div className="scenario-actions">
          <button
            type="button"
            className="scenario-button"
            disabled={!editable}
            onClick={() =>
              void send(
                addToViewCommand(view.id, ends),
                `${t.message(scopeLabel('add', view, ends, nameOf))}.`,
              )
            }
          >
            {t(
              {
                one: 'Add its end to this view',
                other: 'Add its {count} ends to this view',
              },
              { count: ends.length },
            )}
          </button>
        </div>
      )}
    </div>
  );
}
