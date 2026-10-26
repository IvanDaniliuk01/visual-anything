/**
 * The relation types the open view leaves out (ADR 0064), in the inspector's view section beside its
 * scope: each with whether the types derived from it go with it, drawn again one by one, and a form
 * that leaves out one more. A relation type the view nests by draws containment, so it is never
 * offered. Each change is one `set-relation-types-left-out`, so one undoable action, and none of
 * them deletes anything from the model.
 */
import {
  nestingTypesInView,
  relationTypeOrRelatesTo,
  type Command,
  type Definitions,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, RelationTypeLeftOut, ViewFile } from '@visual-anything/schema';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { useEditor } from '../../editor/EditorContext';
import { useT, type Translator } from '../../i18n';
import '../scope.css';

export function LeftOutTypes({ view }: { view: ViewFile }) {
  const t = useT();
  const { project, definitions, send } = useEditor();
  const [adding, setAdding] = useState(false);
  // Each message counts, so that the same words said again are heard again.
  const [message, setMessage] = useState({ text: '', count: 0 });
  const editable = send !== undefined;
  const listed = view.relationTypesLeftOut ?? [];

  const setList = async (relationTypes: RelationTypeLeftOut[], done: string) => {
    if (!send) return;
    const command: Command = { type: 'set-relation-types-left-out', view: view.id, relationTypes };
    try {
      const result = await send(command);
      if (result.ok) setMessage((last) => ({ text: `${t.message(done)}.`, count: last.count + 1 }));
    } catch {
      // A refusal is already shown as a notice.
    }
  };
  const nameOf = (id: Id) => typeName(t, definitions, id);

  return (
    <>
      <p className="scope-heading">{t('Relation types it leaves out')}</p>
      {listed.length === 0 ? (
        <p className="scope-summary">{t('It draws the relations of every relation type.')}</p>
      ) : (
        <ul className="scope-list">
          {listed.map((entry) => {
            const name = nameOf(entry.relationType);
            return (
              <li key={entry.relationType}>
                <span className="scope-what">
                  {entry.exactly
                    ? t('“{name}” only', { name })
                    : t('“{name}”, and what derives from it', { name })}
                </span>
                <button
                  type="button"
                  className="inspector-action"
                  disabled={!editable}
                  aria-label={t('Draw the relations of “{name}” again', { name })}
                  onClick={() =>
                    void setList(
                      listed.filter((each) => each.relationType !== entry.relationType),
                      listed.length === 1
                        ? `Draw every relation type in "${view.name}"`
                        : `Draw the relations of "${name}" in "${view.name}" again`,
                    )
                  }
                >
                  {t('Draw again')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {adding ? (
        <LeaveOutForm
          project={project}
          definitions={definitions}
          view={view}
          onLeaveOut={(entry) => {
            setAdding(false);
            void setList(
              [...listed, entry],
              `Leave the relations of "${nameOf(entry.relationType)}" out of "${view.name}"`,
            );
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <div className="scope-actions">
          <button
            type="button"
            className="inspector-action"
            disabled={!editable}
            onClick={() => setAdding(true)}
          >
            {t('Leave out a relation type…')}
          </button>
        </div>
      )}
      <p className="visually-hidden" aria-live="polite">
        {message.text}
        {message.count % 2 === 1 ? ' ' : ''}
      </p>
    </>
  );
}

/** A relation type's name, as the language reads it. */
function typeName(t: Translator, definitions: Definitions, id: Id): string {
  return t.definition(id, relationTypeOrRelatesTo(definitions, id).name);
}

/** The form that leaves out one more relation type: which, and whether what derives from it goes too. */
function LeaveOutForm({
  project,
  definitions,
  view,
  onLeaveOut,
  onCancel,
}: {
  project: ProjectSnapshot;
  definitions: Definitions;
  view: ViewFile;
  onLeaveOut: (entry: RelationTypeLeftOut) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const ids = { type: useId(), derived: useId() };
  const [chosen, setChosen] = useState('');
  const [derived, setDerived] = useState(true);
  const [problem, setProblem] = useState<string>();
  const choices = useMemo(() => {
    const nesting = new Set(nestingTypesInView(project, view));
    const listed = new Set((view.relationTypesLeftOut ?? []).map((each) => each.relationType));
    return [...new Set(['relates-to', ...definitions.relationTypes.keys()])]
      .filter((id) => !nesting.has(id) && !listed.has(id))
      .map((id) => ({ id, name: typeName(t, definitions, id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [t, project, definitions, view]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const type = chosen || choices[0]?.id;
    if (type === undefined) {
      setProblem(t('There is nothing of this kind to choose.'));
      return;
    }
    onLeaveOut({ relationType: type, ...(derived ? {} : { exactly: true }) });
  };

  return (
    <form
      className="scope-form"
      aria-label={t('Leave out a relation type')}
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <label htmlFor={ids.type}>{t('Relation type')}</label>
      <select
        id={ids.type}
        value={chosen || choices[0]?.id || ''}
        onChange={(event) => setChosen(event.target.value)}
      >
        {choices.map((each) => (
          <option key={each.id} value={each.id}>
            {each.name}
          </option>
        ))}
      </select>
      <div className="scope-form-row">
        <input
          id={ids.derived}
          type="checkbox"
          checked={derived}
          onChange={(event) => setDerived(event.target.checked)}
        />
        <label htmlFor={ids.derived}>{t('And what derives from it')}</label>
      </div>
      {problem !== undefined && (
        <p className="inspector-problem" role="alert">
          {problem}
        </p>
      )}
      <div className="scope-form-row">
        <button type="submit" className="inspector-action">
          {t('Leave out')}
        </button>
        <button type="button" className="inspector-action" onClick={onCancel}>
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
}
