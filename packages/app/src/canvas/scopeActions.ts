/**
 * What the shape menu and the outline's menu offer for a view's scope (ADR-0040): Leave out of this
 * view, for the element pressed or the selection that holds it, and Add to this view for the elements
 * at the far ends of the relations that leave the view from them. Each is one command, so one
 * undoable action, and neither ever deletes anything from the model.
 */
import { modelIndexOf, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import type { Selection } from '../editor/selection';
import { t } from '../i18n';
import { addToViewCommand, endsToAdd, leaveOutCommand, relationsLeaving } from './scope';

/** One of the menu's scope items: what it says, what it sends, and what is said once it is done. */
export interface ScopeAction {
  label: string;
  command: Command;
  /** What the history calls the action, as the core labels it: the app says it once it is done. */
  done: string;
}

export interface ScopeActions {
  leaveOut?: ScopeAction;
  add?: ScopeAction;
}

/**
 * The scope items for an element pressed in a view: for it alone, or for every element selected
 * when the selection holds it.
 */
export function scopeActions(
  project: ProjectSnapshot,
  viewId: Id,
  selection: Selection,
  element: Id,
): ScopeActions {
  const view = project.views.find((each) => each.id === viewId);
  if (!view || element === project.model.world.id) return {};
  const index = modelIndexOf(project);
  const elements = selection.elements.has(element)
    ? [...selection.elements].filter((id) => id !== project.model.world.id && index.element(id))
    : [element];
  if (elements.length === 0) return {};
  const name = (id: Id) => index.element(id)?.name ?? id;
  const [only] = elements;
  const one = elements.length === 1 && only !== undefined;
  const actions: ScopeActions = {
    leaveOut: {
      label: one
        ? t('Leave "{name}" out of this view', { name: name(only) })
        : t(
            {
              one: 'Leave {count} element out of this view',
              other: 'Leave {count} elements out of this view',
            },
            { count: elements.length },
          ),
      command: leaveOutCommand(view.id, elements),
      done: scopeLabel('leave', view, elements, name),
    },
  };
  const relations = elements.flatMap((id) => relationsLeaving(project, view, id));
  const ends = endsToAdd(project, view, relations);
  if (ends.length > 0) {
    actions.add = {
      label: t(
        {
          one: 'Add to this view the element they relate to',
          other: 'Add to this view the {count} elements they relate to',
        },
        { count: ends.length },
      ),
      command: addToViewCommand(view.id, ends),
      done: scopeLabel('add', view, ends, name),
    };
  }
  return actions;
}

/**
 * What the history calls adding elements to a view or leaving them out, as the core labels it, in
 * English: the app translates it as it translates every label of the core.
 */
export function scopeLabel(
  kind: 'add' | 'leave',
  view: Pick<ViewFile, 'name'>,
  elements: readonly Id[],
  name: (id: Id) => string,
): string {
  const [only] = elements;
  if (elements.length === 1 && only !== undefined) {
    return kind === 'add'
      ? `Add "${name(only)}" to "${view.name}"`
      : `Leave "${name(only)}" out of "${view.name}"`;
  }
  return kind === 'add'
    ? `Add ${elements.length} elements to "${view.name}"`
    : `Leave ${elements.length} elements out of "${view.name}"`;
}
