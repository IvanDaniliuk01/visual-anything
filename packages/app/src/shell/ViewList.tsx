/**
 * The project's views, in the Model tab: each one opens on the canvas when chosen, and its settings
 * change its name, description, perspective and the nesting relation types that arrange it, or delete
 * it. A new view is made from a name and a perspective. Each change is one command, so one undoable
 * action; while the project cannot be changed, the controls are off.
 */
import {
  nestingTypesInView,
  relationTypeOrRelatesTo,
  type Command,
  type Definitions,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useEditor } from '../editor/EditorContext';
import { CheckboxControl, TextControl } from './inspector/controls';
import { perform } from './inspector/send';
import { Secondary } from './Secondary';
import './views.css';

interface ViewListProps {
  project: ProjectSnapshot;
  definitions: Definitions;
  /** The view drawn on the canvas, if any. */
  openViewId: Id | undefined;
  /** The id of the heading that names the list. */
  labelledBy: string;
}

export function ViewList({ project, definitions, openViewId, labelledBy }: ViewListProps) {
  const { send, openView } = useEditor();
  const [editing, setEditing] = useState<Id>();
  const [creating, setCreating] = useState(false);
  const newButton = useRef<HTMLButtonElement>(null);
  const editable = send !== undefined;

  const closeNew = () => {
    setCreating(false);
    // The button comes back once the form goes, and takes the focus back then.
    setTimeout(() => newButton.current?.focus(), 0);
  };

  return (
    <>
      {project.views.length > 0 ? (
        <ul className="item-list view-list" aria-labelledby={labelledBy}>
          {project.views.map((view) => (
            <ViewRow
              key={view.id}
              project={project}
              definitions={definitions}
              view={view}
              open={view.id === openViewId}
              editing={editing === view.id}
              editable={editable}
              onOpen={() => openView?.(view.id)}
              onEdit={(value) => setEditing(value ? view.id : undefined)}
            />
          ))}
        </ul>
      ) : (
        <p className="panel-empty">This project has no views yet.</p>
      )}
      {creating && editable ? (
        <NewViewForm
          onCreated={(id) => {
            closeNew();
            openView?.(id);
          }}
          onCancel={closeNew}
        />
      ) : (
        <button
          ref={newButton}
          type="button"
          className="view-action"
          disabled={!editable}
          onClick={() => setCreating(true)}
        >
          New view…
        </button>
      )}
    </>
  );
}

interface ViewRowProps {
  project: ProjectSnapshot;
  definitions: Definitions;
  view: ViewFile;
  open: boolean;
  editing: boolean;
  editable: boolean;
  onOpen: () => void;
  onEdit: (editing: boolean) => void;
}

/** One view: its name and perspective, which open it, and its settings, shown on demand. */
function ViewRow({
  project,
  definitions,
  view,
  open,
  editing,
  editable,
  onOpen,
  onEdit,
}: ViewRowProps) {
  const settingsId = useId();
  return (
    <li aria-current={open ? 'true' : undefined} className="view-row">
      <div className="view-row-line">
        <button
          type="button"
          className="view-open"
          title={open ? 'This view is open on the canvas' : `Open "${view.name}" on the canvas`}
          onClick={onOpen}
        >
          <span className="item-name">{view.name}</span>
          <Secondary text={view.perspective.name} />
        </button>
        {open && (
          <span className="item-badge" aria-hidden="true">
            Open
          </span>
        )}
        <button
          type="button"
          className="view-action"
          aria-label={`Settings of "${view.name}"`}
          aria-expanded={editing}
          aria-controls={editing ? settingsId : undefined}
          onClick={() => onEdit(!editing)}
        >
          Settings
        </button>
      </div>
      {editing && (
        <ViewSettings
          id={settingsId}
          project={project}
          definitions={definitions}
          view={view}
          editable={editable}
          onDeleted={() => onEdit(false)}
        />
      )}
    </li>
  );
}

interface ViewSettingsProps {
  id: string;
  project: ProjectSnapshot;
  definitions: Definitions;
  view: ViewFile;
  editable: boolean;
  onDeleted: () => void;
}

/** What a view is: its name, description and perspective, how it nests, and deleting it. */
function ViewSettings({ id, project, definitions, view, editable, onDeleted }: ViewSettingsProps) {
  const { send } = useEditor();
  const ids = {
    name: useId(),
    description: useId(),
    perspective: useId(),
    perspectiveDescription: useId(),
    nesting: useId(),
  };
  const [confirming, setConfirming] = useState(false);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const update = (changes: Extract<Command, { type: 'update-view' }>['changes']) =>
    perform(send, { type: 'update-view', id: view.id, changes });
  const nesting = nestingTypesInView(project, view);
  const players = project.scenarios.filter((scenario) => scenario.view === view.id);
  const perspective = view.perspective;

  return (
    <div id={id} className="view-settings" role="group" aria-label={`Settings of "${view.name}"`}>
      <div className="view-control">
        <label htmlFor={ids.name}>Name</label>
        <TextControl
          id={ids.name}
          disabled={!editable}
          value={view.name}
          problemOf={(text) => (text.trim() === '' ? 'A view needs a name.' : undefined)}
          onCommit={(name) => update({ name })}
        />
      </div>
      <div className="view-control">
        <label htmlFor={ids.description}>Description</label>
        <TextControl
          id={ids.description}
          disabled={!editable}
          multiline
          value={view.description ?? ''}
          onCommit={(text) => update({ description: text.trim() === '' ? null : text })}
        />
      </div>
      <div className="view-control">
        <label htmlFor={ids.perspective}>Perspective</label>
        <TextControl
          id={ids.perspective}
          disabled={!editable}
          value={perspective.name}
          problemOf={(text) =>
            text.trim() === '' ? 'A perspective needs a name, such as Security.' : undefined
          }
          onCommit={(name) => update({ perspective: { ...perspective, name } })}
        />
      </div>
      <div className="view-control">
        <label htmlFor={ids.perspectiveDescription}>What the perspective looks at</label>
        <TextControl
          id={ids.perspectiveDescription}
          disabled={!editable}
          multiline
          value={perspective.description ?? ''}
          onCommit={(text) =>
            update({
              perspective:
                text.trim() === ''
                  ? { name: perspective.name }
                  : { ...perspective, description: text },
            })
          }
        />
      </div>
      <fieldset className="view-nesting" aria-describedby={ids.nesting}>
        <legend>Nesting relation types</legend>
        <p id={ids.nesting} className="view-note">
          The relation types whose relations put shapes inside containers in this view.
        </p>
        {definitions.nestingRelationTypes.size === 0 ? (
          <p className="view-note">The packages in use define no relation type that nests.</p>
        ) : (
          <ul className="view-nesting-types">
            {[...definitions.nestingRelationTypes].map((type) => (
              <NestingType
                key={type}
                name={relationTypeOrRelatesTo(definitions, type).name}
                checked={nesting.includes(type)}
                disabled={!editable}
                onCommit={(checked) =>
                  update({
                    nestingRelationTypes: checked
                      ? [...nesting.filter((each) => each !== type), type]
                      : nesting.filter((each) => each !== type),
                  })
                }
              />
            ))}
          </ul>
        )}
      </fieldset>
      {players.length > 0 ? (
        <p className="view-note">
          {players.map((scenario) => `"${scenario.name}"`).join(', ')}{' '}
          {players.length === 1 ? 'plays' : 'play'} over this view, so it cannot be deleted.
        </p>
      ) : confirming ? (
        <div className="view-confirm" role="group" aria-label={`Delete "${view.name}"?`}>
          <p>
            Delete &quot;{view.name}&quot;? Its positions, stacking order and free shapes go with
            it; the model stays as it is. Undo brings it back.
          </p>
          <button
            type="button"
            className="view-action view-delete"
            disabled={!editable}
            onClick={() => {
              void perform(send, { type: 'delete-view', id: view.id }).then((done) => {
                if (done) onDeleted();
              });
            }}
          >
            Delete
          </button>
          <button
            type="button"
            className="view-action"
            onClick={() => {
              setConfirming(false);
              setTimeout(() => deleteButton.current?.focus(), 0);
            }}
          >
            Keep it
          </button>
        </div>
      ) : (
        <button
          ref={deleteButton}
          type="button"
          className="view-action"
          disabled={!editable}
          onClick={() => setConfirming(true)}
        >
          Delete view…
        </button>
      )}
    </div>
  );
}

/** A nesting relation type, checked while it arranges the view. */
function NestingType({
  name,
  checked,
  disabled,
  onCommit,
}: {
  name: string;
  checked: boolean;
  disabled: boolean;
  onCommit: (checked: boolean) => Promise<unknown>;
}) {
  const id = useId();
  return (
    <li>
      <CheckboxControl id={id} disabled={disabled} checked={checked} onCommit={onCommit} />
      <label htmlFor={id}>{name}</label>
    </li>
  );
}

/** Makes a new view from a name and a perspective; every relation type that nests arranges it. */
function NewViewForm({
  onCreated,
  onCancel,
}: {
  onCreated: (id: Id) => void;
  onCancel: () => void;
}) {
  const { send } = useEditor();
  const ids = { heading: useId(), name: useId(), perspective: useId(), problem: useId() };
  const [name, setName] = useState('');
  const [perspective, setPerspective] = useState('');
  const [problem, setProblem] = useState<string>();
  const [sending, setSending] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameInput.current?.focus();
  }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === '') {
      setProblem('Give the view a name.');
      return;
    }
    if (perspective.trim() === '') {
      setProblem('Name the perspective it is seen from, such as Security or Ownership.');
      return;
    }
    if (!send) return;
    setProblem(undefined);
    setSending(true);
    try {
      const result = await send({
        type: 'create-view',
        view: { name: name.trim(), perspective: { name: perspective.trim() } },
      });
      const created = result.created?.[0];
      if (result.ok && created !== undefined) onCreated(created);
    } catch {
      // A refusal is already shown as a notice.
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      className="view-new"
      aria-labelledby={ids.heading}
      onSubmit={(event) => void create(event)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <p id={ids.heading} className="view-new-title">
        New view
      </p>
      <div className="view-control">
        <label htmlFor={ids.name}>Name</label>
        <input
          id={ids.name}
          ref={nameInput}
          value={name}
          placeholder="Security overview"
          aria-describedby={problem ? ids.problem : undefined}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="view-control">
        <label htmlFor={ids.perspective}>Perspective</label>
        <input
          id={ids.perspective}
          value={perspective}
          placeholder="Security"
          aria-describedby={problem ? ids.problem : undefined}
          onChange={(event) => setPerspective(event.target.value)}
        />
      </div>
      <p className="view-note">
        Every relation type that nests arranges it at first; its settings change that.
      </p>
      {problem !== undefined && (
        <p id={ids.problem} role="alert" className="view-problem">
          {problem}
        </p>
      )}
      <div className="view-new-actions">
        <button type="submit" className="view-action" disabled={sending}>
          Create
        </button>
        <button type="button" className="view-action" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
