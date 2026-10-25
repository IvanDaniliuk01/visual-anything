/**
 * The threads the comments panel lists (ADR 0059): those its filters keep, the latest written in
 * first, with the detached ones apart, and everyone who wrote in them, to filter by.
 */
import {
  anchorTargetOf,
  authorKeyOf,
  authorNameOf,
  isDetached,
  isResolved,
  lastActivityOf,
  threadInView,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { CommentFile, Id } from '@visual-anything/schema';
import type { CommentFilters } from './store';

export interface ThreadRow {
  thread: CommentFile;
  /** When it was last written in. */
  last: string;
}

export interface ThreadRows {
  /** The threads whose anchor is there, as the filters keep them. */
  attached: ThreadRow[];
  /** The threads whose anchor was deleted, as the state and author filters keep them. */
  detached: ThreadRow[];
  /** Everyone who wrote in any thread, by name, each once. */
  authors: { key: string; name: string }[];
}

export function threadRows(
  project: ProjectSnapshot,
  viewId: Id | undefined,
  filters: Readonly<CommentFilters>,
): ThreadRows {
  const attached: ThreadRow[] = [];
  const detached: ThreadRow[] = [];
  const authors = new Map<string, string>();
  for (const thread of project.comments) {
    for (const comment of thread.comments) {
      const key = authorKeyOf(comment.author);
      if (!authors.has(key)) authors.set(key, authorNameOf(comment.author));
    }
    if (filters.state !== 'all' && isResolved(thread) !== (filters.state === 'resolved')) continue;
    if (
      filters.author !== undefined &&
      !thread.comments.some((comment) => authorKeyOf(comment.author) === filters.author)
    ) {
      continue;
    }
    if (filters.about !== undefined && anchorTargetOf(thread.anchor) !== filters.about) continue;
    const row = { thread, last: lastActivityOf(thread) };
    if (isDetached(project, thread)) {
      detached.push(row);
      continue;
    }
    if (
      filters.where === 'view' &&
      (viewId === undefined || !threadInView(project, thread, viewId))
    ) {
      continue;
    }
    attached.push(row);
  }
  const latestFirst = (a: ThreadRow, b: ThreadRow) =>
    a.last < b.last ? 1 : a.last > b.last ? -1 : 0;
  return {
    attached: attached.sort(latestFirst),
    detached: detached.sort(latestFirst),
    authors: [...authors]
      .map(([key, name]) => ({ key, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
