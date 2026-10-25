/**
 * What a thread is about (ADR 0059): an element, a relation, a view, or a point of a view. A thread
 * names it by id, so a rename never breaks it; one whose anchor is deleted is kept, as a detached
 * thread, and is about it again when the deletion is undone.
 */
import type { CommentAnchor, CommentFile, Id } from '@visual-anything/schema';
import type { ModelIndex } from '../model-index';
import type { ProjectSnapshot } from '../snapshot';
import { modelIndexOf } from '../state';

/** The id of what an anchor names: its element, its relation, or its view. */
export function anchorTargetOf(anchor: CommentAnchor): Id {
  switch (anchor.kind) {
    case 'element':
      return anchor.element;
    case 'relation':
      return anchor.relation;
    case 'view':
    case 'point':
      return anchor.view;
  }
}

/** The view an anchor belongs to, for a view or a point; none for an element or a relation. */
export function anchorViewOf(anchor: CommentAnchor): Id | undefined {
  return anchor.kind === 'view' || anchor.kind === 'point' ? anchor.view : undefined;
}

/** Whether what a thread is about is gone: its element, its relation, or its view. */
export function isDetached(state: ProjectSnapshot, thread: CommentFile): boolean {
  return !anchorExists(state, thread.anchor, modelIndexOf(state));
}

/** The threads whose anchor is gone, in the project's order. */
export function detachedThreads(state: ProjectSnapshot): CommentFile[] {
  const index = modelIndexOf(state);
  return state.comments.filter((thread) => !anchorExists(state, thread.anchor, index));
}

/** Whether a thread is resolved. */
export function isResolved(thread: CommentFile): boolean {
  return thread.resolved === true;
}

/** When a thread was last written in: the latest time of its comments, written or edited. */
export function lastActivityOf(thread: CommentFile): string {
  let last = '';
  for (const comment of thread.comments) {
    for (const time of [comment.time, comment.edited]) {
      if (time !== undefined && time > last) last = time;
    }
  }
  return last;
}

/** The threads about one element, relation or view, in the project's order. */
export function threadsAbout(state: ProjectSnapshot, id: Id): CommentFile[] {
  return state.comments.filter((thread) => anchorTargetOf(thread.anchor) === id);
}

/**
 * How labels and messages name what a thread is about: `"Booking API"`, `the view "Overview"` or
 * `a point of the view "Overview"`; by its id when it is gone.
 */
export function anchorPhrase(state: ProjectSnapshot, anchor: CommentAnchor): string {
  const index = modelIndexOf(state);
  switch (anchor.kind) {
    case 'element':
      return `"${index.element(anchor.element)?.name ?? anchor.element}"`;
    case 'relation': {
      const relation = index.relation(anchor.relation);
      return `"${relation?.name ?? relation?.id ?? anchor.relation}"`;
    }
    case 'view':
      return `the view "${viewName(state, anchor.view)}"`;
    case 'point':
      return `a point of the view "${viewName(state, anchor.view)}"`;
  }
}

function viewName(state: ProjectSnapshot, id: Id): string {
  return state.views.find((view) => view.id === id)?.name ?? id;
}

function anchorExists(state: ProjectSnapshot, anchor: CommentAnchor, index: ModelIndex): boolean {
  switch (anchor.kind) {
    case 'element':
      return index.element(anchor.element) !== undefined;
    case 'relation':
      return index.relation(anchor.relation) !== undefined;
    case 'view':
    case 'point':
      return state.views.some((view) => view.id === anchor.view);
  }
}
