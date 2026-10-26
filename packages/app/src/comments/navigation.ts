/**
 * Selecting what a thread, or a mention, is about (ADR 0059): an element or a relation in the open
 * view when it shows there, or else in the first view that shows it; a view opens; a point comes into
 * the middle of the canvas in its view. Nothing is selected of what is gone.
 */
import { modelIndexOf, shownByScope, type ProjectSnapshot } from '@visual-anything/core';
import type { CommentAnchor, Id } from '@visual-anything/schema';
import { useCallback } from 'react';
import { useEditor } from '../editor/EditorContext';
import { selectionOf, type Selectable } from '../editor/selection';
import { useComments } from './store';

/** The view to show an element or a relation in: the open one when it shows it, or else the first. */
export function viewShowing(
  project: ProjectSnapshot,
  target: Selectable,
  openView: Id | undefined,
): Id | undefined {
  const shows = (viewId: Id) => {
    const view = project.views.find((each) => each.id === viewId);
    if (!view) return false;
    const shown = shownByScope(project, view);
    return target.kind === 'element' ? shown.element(target.id) : shown.relation(target.id);
  };
  if (openView !== undefined && shows(openView)) return openView;
  return project.views.find((view) => shows(view.id))?.id;
}

export function useAnchorSelect(): {
  selectAnchor: (anchor: CommentAnchor) => void;
  selectMention: (id: Id) => void;
} {
  const editor = useEditor();
  const [store] = useComments();
  const { project, viewId, select, openView } = editor;

  const selectTarget = useCallback(
    (target: Selectable) => {
      const view = viewShowing(project, target, viewId);
      if (view === undefined) return;
      const goTo = store.actions.goTo;
      if (goTo) goTo({ kind: 'jump', view, target });
      else {
        if (view !== viewId) openView?.(view);
        select(selectionOf([target]));
      }
    },
    [project, viewId, select, openView, store],
  );

  const selectAnchor = useCallback(
    (anchor: CommentAnchor) => {
      switch (anchor.kind) {
        case 'element':
          selectTarget({ kind: 'element', id: anchor.element });
          return;
        case 'relation':
          selectTarget({ kind: 'relation', id: anchor.relation });
          return;
        case 'view':
          if (anchor.view !== viewId && project.views.some((view) => view.id === anchor.view)) {
            openView?.(anchor.view);
          }
          return;
        case 'point':
          if (!project.views.some((view) => view.id === anchor.view)) return;
          if (anchor.view !== viewId) openView?.(anchor.view);
          store.goToPoint(anchor.view, anchor.x, anchor.y);
      }
    },
    [selectTarget, viewId, project, openView, store],
  );

  const selectMention = useCallback(
    (id: Id) => {
      const index = modelIndexOf(project);
      if (index.element(id)) selectTarget({ kind: 'element', id });
      else if (index.relation(id)) selectTarget({ kind: 'relation', id });
    },
    [project, selectTarget],
  );

  return { selectAnchor, selectMention };
}
