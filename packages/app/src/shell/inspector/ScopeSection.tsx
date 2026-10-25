/**
 * An element and the open view's scope (ADR-0040): whether the view shows it, Leave out of this view
 * for one it shows and Add to this view for one it leaves out; and the relations that leave the view
 * from it, each with Add to this view for its far end, and all of them at once. Each change is one
 * command, so one undoable action; none of them deletes anything from the model.
 */
import { modelIndexOf, shownByScope, type Command } from '@visual-anything/core';
import type { Element, Id } from '@visual-anything/schema';
import { useId, useState } from 'react';
import { nameOfEnd } from '../../canvas/announce';
import { addToViewCommand, endsToAdd, leaveOutCommand, relationsLeaving } from '../../canvas/scope';
import { scopeLabel } from '../../canvas/scopeActions';
import { useEditor } from '../../editor/EditorContext';
import { useT } from '../../i18n';
import '../scope.css';

/** How many of the relations that leave the view the section lists before it says how many more. */
const LISTED = 50;

export function ScopeSection({ element }: { element: Element }) {
  const t = useT();
  const { project, viewId, send } = useEditor();
  const headingId = useId();
  // Each message counts, so that the same words said again are heard again.
  const [message, setMessage] = useState({ text: '', count: 0 });
  const view = project.views.find((each) => each.id === viewId);
  if (!view || element.id === project.model.world.id) return null;
  const editable = send !== undefined;
  const index = modelIndexOf(project);
  const nameOf = (id: Id) => index.element(id)?.name ?? id;
  const shows = shownByScope(project, view).element(element.id);
  const leaving = shows ? relationsLeaving(project, view, element.id) : [];
  const allEnds = endsToAdd(project, view, leaving);

  const run = async (command: Command, done: string) => {
    if (!send) return;
    try {
      const result = await send(command);
      if (result.ok) setMessage((last) => ({ text: `${t.message(done)}.`, count: last.count + 1 }));
    } catch {
      // A refusal is already shown as a notice.
    }
  };
  const add = (ends: readonly Id[]) =>
    void run(addToViewCommand(view.id, ends), scopeLabel('add', view, ends, nameOf));

  return (
    <section className="inspector-section" aria-labelledby={headingId}>
      <h4 id={headingId}>{t('Scope of this view')}</h4>
      {shows ? (
        <>
          {view.scope === undefined && (
            <p className="inspector-notes">{t('This view shows the whole model.')}</p>
          )}
          <div className="scope-actions">
            <button
              type="button"
              className="inspector-action"
              disabled={!editable}
              title={t('Deletes nothing: it stays in the model and in the other views.')}
              onClick={() =>
                void run(
                  leaveOutCommand(view.id, [element.id]),
                  scopeLabel('leave', view, [element.id], nameOf),
                )
              }
            >
              {t('Leave out of this view')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="inspector-notes">
            {t('“{view}” leaves it out: its scope does not show it.', { view: view.name })}
          </p>
          <div className="scope-actions">
            <button
              type="button"
              className="inspector-action"
              disabled={!editable}
              onClick={() => add([element.id])}
            >
              {t('Add to this view')}
            </button>
          </div>
        </>
      )}
      {leaving.length > 0 && (
        <>
          <p className="scope-heading">
            {t(
              {
                one: '{count} relation leaves this view',
                other: '{count} relations leave this view',
              },
              { count: leaving.length },
            )}
          </p>
          <ul className="scope-list">
            {leaving.slice(0, LISTED).map((relation) => {
              const ends = endsToAdd(project, view, [relation]);
              return (
                <li key={relation}>
                  <span className="scope-what">{nameOfEnd(project, relation)}</span>
                  {ends.length > 0 && (
                    <button
                      type="button"
                      className="inspector-action"
                      disabled={!editable}
                      aria-label={t('Add “{name}” to this view', {
                        name: ends.map(nameOf).join(', '),
                      })}
                      onClick={() => add(ends)}
                    >
                      {t('Add to this view')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {leaving.length > LISTED && (
            <p className="inspector-notes">
              {t('and {count} more', { count: leaving.length - LISTED })}
            </p>
          )}
          {allEnds.length > 1 && (
            <div className="scope-actions">
              <button
                type="button"
                className="inspector-action"
                disabled={!editable}
                onClick={() => add(allEnds)}
              >
                {t('Add all {count} to this view', { count: allEnds.length })}
              </button>
            </div>
          )}
        </>
      )}
      <p className="visually-hidden" aria-live="polite">
        {message.text}
        {message.count % 2 === 1 ? ' ' : ''}
      </p>
    </section>
  );
}
