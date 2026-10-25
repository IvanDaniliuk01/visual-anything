/**
 * What a thread is about (ADR 0059): an element, a relation, a view, or a point of a view. A thread
 * names it by id, so a rename never breaks it; one whose anchor is deleted is kept, as a detached
 * thread, and is about it again when the deletion is undone.
 */
import type { CommentAnchor, CommentFile, Id } from '@visual-anything/schema';
import type { ModelIndex } from '../model-index';
import { shownByScope } from '../scope';
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

/**
 * Whether a thread belongs to a view: one about the view or a point of it, or about an element or a
 * relation the view's scope shows. A detached thread belongs to none.
 */
export function threadInView(state: ProjectSnapshot, thread: CommentFile, viewId: Id): boolean {
  const { anchor } = thread;
  if (anchor.kind === 'view' || anchor.kind === 'point') {
    return anchor.view === viewId && state.views.some((view) => view.id === viewId);
  }
  const view = state.views.find((each) => each.id === viewId);
  if (view === undefined || isDetached(state, thread)) return false;
  const shown = shownByScope(state, view);
  return anchor.kind === 'element'
    ? shown.element(anchor.element)
    : shown.relation(anchor.relation);
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
    case 'relation':
      return `"${relationWords(index, anchor.relation)}"`;
    case 'view':
      return `the view "${viewName(state, anchor.view)}"`;
    case 'point':
      return `a point of the view "${viewName(state, anchor.view)}"`;
  }
}

/**
 * A relation in words, as the history names one: its name, or its ends, as in "API → DB"; an end that
 * is a relation is put in parentheses. Its id when it is gone.
 */
function relationWords(index: ModelIndex, id: Id, depth = 0): string {
  const relation = index.relation(id);
  if (!relation) return id;
  if (relation.name !== undefined) return relation.name;
  const end = (each: Id) =>
    index.relation(each) && depth < 3
      ? `(${relationWords(index, each, depth + 1)})`
      : (index.element(each)?.name ?? each);
  return `${end(relation.from)} → ${end(relation.to)}`;
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
