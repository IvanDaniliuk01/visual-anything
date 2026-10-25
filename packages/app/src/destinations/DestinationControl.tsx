/**
 * The inspector's control for a destination attribute's value (ADR 0056): what it opens — a view of
 * this project, another project or a web address — and then where. A view is picked from the
 * project's views and can focus on the selection; another project is a path from this project's
 * folder, with the view to open there; a web address is an https: address. Each commit sends the
 * whole destination, which the core reads again before it stores it.
 */
import {
  projectPathProblem,
  readDestination,
  webAddressProblem,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Destination, Id, JsonValue } from '@visual-anything/schema';
import { useContext, useId, useState } from 'react';
import { EditorContext } from '../editor/EditorContext';
import { useT } from '../i18n';
import { TextControl } from '../shell/inspector/controls';
import './destinations.css';

type Kind = 'view' | 'project' | 'web';

interface DestinationControlProps {
  /** The id of its first control, which the attribute's label names. */
  id: string;
  value: JsonValue | undefined;
  disabled: boolean;
  describedBy?: string;
  onSet: (value: JsonValue) => Promise<boolean>;
}

function kindOf(destination: Destination | undefined): Kind {
  if (destination === undefined) return 'view';
  if ('url' in destination) return 'web';
  if ('project' in destination) return 'project';
  return 'view';
}

/** A view to open by default: the open one, or else the project's first. */
function defaultView(project: ProjectSnapshot | undefined, open: Id | undefined): Id | undefined {
  return open ?? project?.views[0]?.id;
}

export function DestinationControl({
  id,
  value,
  disabled,
  describedBy,
  onSet,
}: DestinationControlProps) {
  const t = useT();
  const editor = useContext(EditorContext);
  const project = editor?.project;
  const read = readDestination(value);
  const destination = read.ok ? read.destination : undefined;
  // The kind picked last, while the value is the one it was picked for: an undo shows the value's.
  const [picked, setPicked] = useState<{ value: string; kind: Kind }>();
  const valueKey = JSON.stringify(value ?? null);
  const shown: Kind = picked?.value === valueKey ? picked.kind : kindOf(destination);
  const viewId = useId();
  const pathId = useId();
  const otherViewId = useId();
  const urlId = useId();
  const set = (next: Destination) => onSet(next as unknown as JsonValue);

  const changeKind = (next: Kind) => {
    setPicked({ value: valueKey, kind: next });
    // A view can be opened at once; another project and a web address wait for where.
    if (next === 'view' && kindOf(destination) !== 'view') {
      const view = defaultView(project, editor?.viewId);
      if (view !== undefined) void set({ view });
    }
  };

  const current =
    destination !== undefined && kindOf(destination) === shown ? destination : undefined;

  return (
    <div className="destination-control">
      <select
        id={id}
        value={shown}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(event) => changeKind(event.target.value as Kind)}
      >
        <option value="view">{t('A view of this project')}</option>
        <option value="project">{t('Another project')}</option>
        <option value="web">{t('A web address')}</option>
      </select>
      {shown === 'view' && (
        <ViewFields
          ids={{ view: viewId }}
          project={project}
          destination={
            current !== undefined && 'view' in current && !('project' in current)
              ? current
              : undefined
          }
          selected={editor === undefined ? [] : [...editor.selection.elements]}
          disabled={disabled}
          onSet={set}
        />
      )}
      {shown === 'project' && (
        <>
          <label htmlFor={pathId}>{t('Folder, from this project’s folder')}</label>
          <TextControl
            id={pathId}
            value={current !== undefined && 'project' in current ? current.project : ''}
            disabled={disabled}
            problemOf={(text) =>
              projectPathProblem(text) === undefined
                ? undefined
                : t.message(projectPathProblem(text) as string)
            }
            onCommit={(text) =>
              set({
                project: text,
                ...(current !== undefined && 'project' in current && current.view !== undefined
                  ? { view: current.view }
                  : {}),
              })
            }
          />
          <label htmlFor={otherViewId}>{t('View id there, if any')}</label>
          <TextControl
            id={otherViewId}
            value={current !== undefined && 'project' in current ? (current.view ?? '') : ''}
            disabled={disabled || current === undefined}
            onCommit={(text) => {
              if (current === undefined || !('project' in current)) return Promise.resolve(false);
              const trimmed = text.trim();
              return set(
                trimmed === ''
                  ? { project: current.project }
                  : { project: current.project, view: trimmed },
              );
            }}
          />
        </>
      )}
      {shown === 'web' && (
        <>
          <label htmlFor={urlId}>{t('Web address, starting with https://')}</label>
          <TextControl
            id={urlId}
            value={current !== undefined && 'url' in current ? current.url : ''}
            disabled={disabled}
            problemOf={(text) => {
              const why = webAddressProblem(text);
              return why === undefined ? undefined : t.message(why);
            }}
            onCommit={(text) => set({ url: text })}
          />
        </>
      )}
    </div>
  );
}

interface ViewFieldsProps {
  ids: { view: string };
  project: ProjectSnapshot | undefined;
  destination: { view: Id; focus?: Id[] } | undefined;
  selected: readonly Id[];
  disabled: boolean;
  onSet: (destination: Destination) => Promise<boolean>;
}

/** The view a destination opens, and the elements it focuses on there. */
function ViewFields({ ids, project, destination, selected, disabled, onSet }: ViewFieldsProps) {
  const t = useT();
  const views = project?.views ?? [];
  const focus = destination?.focus ?? [];
  return (
    <>
      <label htmlFor={ids.view}>{t('View')}</label>
      <select
        id={ids.view}
        value={destination?.view ?? ''}
        disabled={disabled || views.length === 0}
        onChange={(event) => {
          const view = event.target.value;
          if (view !== '') void onSet({ view, ...(focus.length === 0 ? {} : { focus }) });
        }}
      >
        {destination === undefined && <option value="">{t('Choose a view')}</option>}
        {destination !== undefined && !views.some((view) => view.id === destination.view) && (
          <option value={destination.view}>
            {t('{view}, which the project does not have', { view: destination.view })}
          </option>
        )}
        {views.map((view) => (
          <option key={view.id} value={view.id}>
            {view.name}
          </option>
        ))}
      </select>
      <p className="inspector-notes">
        {focus.length === 0
          ? t('It opens the whole view.')
          : t(
              {
                one: 'It selects {count} element there.',
                other: 'It selects {count} elements there.',
              },
              { count: focus.length },
            )}
      </p>
      {destination !== undefined && (
        <div>
          <button
            type="button"
            className="inspector-action"
            disabled={disabled || selected.length === 0}
            onClick={() =>
              void onSet({ view: destination.view, focus: [...new Set(selected)].slice(0, 100) })
            }
          >
            {t('Focus on the selection')}
          </button>{' '}
          {focus.length > 0 && (
            <button
              type="button"
              className="inspector-action"
              disabled={disabled}
              onClick={() => void onSet({ view: destination.view })}
            >
              {t('Open the whole view')}
            </button>
          )}
        </div>
      )}
    </>
  );
}
