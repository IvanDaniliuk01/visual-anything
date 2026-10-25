/**
 * Commands on threads of comments (ADR 0059): starting a thread, answering it, editing one's own
 * comment, resolving it or opening it again, and deleting it. Each is one action. A thread is never
 * deleted by anything else: one whose anchor goes is kept, detached.
 */
import type {
  CommentAnchor,
  CommentAuthor,
  CommentFile,
  Id,
  ThreadComment,
} from '@visual-anything/schema';
import { anchorPhrase } from '../comments/anchors';
import { checkPerson, isSameAuthor } from '../comments/authors';
import { commentTextProblem, mentionsIn, normalizeCommentText } from '../comments/text';
import { slug } from '../ids';
import { problem } from '../problems';
import { reject, requireNumber, type Draft } from './draft';
import type {
  AddCommentCommand,
  CreateThreadCommand,
  DeleteThreadCommand,
  EditCommentCommand,
  NewComment,
  ResolveThreadCommand,
} from './types';

/** The most comments a thread holds, as the file format says. */
export const MAX_THREAD_COMMENTS = 1000;

/** A time as a comment keeps it: ISO 8601 in UTC, to the millisecond. */
const COMMENT_TIME = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?Z$/;

export function createThread(draft: Draft, command: CreateThreadCommand): string {
  const asked = command.thread;
  if (typeof asked !== 'object' || asked === null) {
    reject('invalid-command', 'A new thread needs its anchor and its first comment.');
  }
  const anchor = checkedAnchor(draft, asked.anchor);
  const text = checkedText(asked.comment?.text);
  const id = draft.idFor(asked.id, slug(text.slice(0, 60), 'thread'));
  const comment = newComment(draft, asked.comment, text, []);
  warnOfMentions(draft, text, '');
  const thread: CommentFile = { id, anchor, comments: [comment] };
  draft.apply({
    op: 'insert',
    collection: { name: 'comments' },
    index: draft.state.comments.length,
    item: thread,
  });
  draft.created.push(id, comment.id);
  return `Comment on ${anchorPhrase(draft.state, anchor)}`;
}

export function addComment(draft: Draft, command: AddCommentCommand): string {
  const thread = threadOf(draft, command.thread);
  if (thread.comments.length >= MAX_THREAD_COMMENTS) {
    reject(
      'invalid-comment',
      `The thread holds ${MAX_THREAD_COMMENTS} comments, as many as one holds: start another.`,
      [thread.id],
    );
  }
  const text = checkedText(command.comment?.text);
  const comment = newComment(
    draft,
    command.comment,
    text,
    thread.comments.map((each) => each.id),
  );
  warnOfMentions(draft, text, '');
  // An answer means there is more to say: a resolved thread opens again.
  draft.apply({
    op: 'replace',
    collection: { name: 'comments' },
    item: { ...opened(thread), comments: [...thread.comments, comment] },
  });
  draft.created.push(comment.id);
  return `Reply to the thread on ${anchorPhrase(draft.state, thread.anchor)}`;
}

export function editComment(draft: Draft, command: EditCommentCommand): string {
  const thread = threadOf(draft, command.thread);
  const at = thread.comments.findIndex((each) => each.id === command.comment);
  const current = thread.comments[at];
  if (current === undefined) {
    reject(
      'unknown-comment',
      `The thread "${thread.id}" has no comment "${String(command.comment)}".`,
      [thread.id],
    );
  }
  const editor = authorOf(draft, command.author);
  if (!isSameAuthor(current.author, editor)) {
    reject(
      'not-your-comment',
      editor.kind === 'claude'
        ? 'Claude edits only its own comments.'
        : 'Only the person who wrote a comment edits it.',
      [thread.id],
    );
  }
  const label = `Edit a comment on ${anchorPhrase(draft.state, thread.anchor)}`;
  const text = checkedText(command.text);
  if (text === current.text) return label;
  warnOfMentions(draft, text, current.text);
  const edited: ThreadComment = { ...current, edited: timeNow(draft), text };
  draft.apply({
    op: 'replace',
    collection: { name: 'comments' },
    item: { ...thread, comments: thread.comments.map((each, i) => (i === at ? edited : each)) },
  });
  return label;
}

export function resolveThread(draft: Draft, command: ResolveThreadCommand): string {
  const thread = threadOf(draft, command.thread);
  if (typeof command.resolved !== 'boolean') {
    reject('invalid-command', 'Say whether the thread is resolved: true or false.');
  }
  const phrase = anchorPhrase(draft.state, thread.anchor);
  const label = command.resolved
    ? `Resolve the thread on ${phrase}`
    : `Reopen the thread on ${phrase}`;
  if ((thread.resolved === true) === command.resolved) return label;
  draft.apply({
    op: 'replace',
    collection: { name: 'comments' },
    item: command.resolved ? { ...opened(thread), resolved: true } : opened(thread),
  });
  return label;
}

/** A thread as it is while open: `resolved` is left out, as the file format keeps it. */
function opened(thread: CommentFile): CommentFile {
  const open: CommentFile = { id: thread.id, anchor: thread.anchor, comments: thread.comments };
  return open;
}

export function deleteThread(draft: Draft, command: DeleteThreadCommand): string {
  const thread = threadOf(draft, command.thread);
  const label = `Delete the thread on ${anchorPhrase(draft.state, thread.anchor)}`;
  draft.apply({ op: 'remove', collection: { name: 'comments' }, key: thread.id });
  return label;
}

/** A thread of the project. */
function threadOf(draft: Draft, id: Id): CommentFile {
  const thread = draft.state.comments.find((each) => each.id === id);
  if (!thread) reject('unknown-thread', `There is no thread "${String(id)}".`, [id]);
  return thread;
}

/**
 * The anchor a new thread is about, checked: an element but World, a relation, a view, or a point of a
 * view within the canvas. Only what an anchor has is kept.
 */
function checkedAnchor(draft: Draft, anchor: unknown): CommentAnchor {
  if (typeof anchor !== 'object' || anchor === null) {
    reject(
      'invalid-command',
      'A thread needs an anchor: an element, a relation, a view or a point.',
    );
  }
  const given = anchor as Record<string, unknown>;
  switch (given.kind) {
    case 'element': {
      const element = draft.element(given.element as Id);
      if (element.id === draft.index.world.id) {
        reject('world-not-allowed', 'A thread cannot be about World: comment on a view instead.', [
          element.id,
        ]);
      }
      return { kind: 'element', element: element.id };
    }
    case 'relation':
      return { kind: 'relation', relation: draft.relation(given.relation as Id).id };
    case 'view':
      return { kind: 'view', view: draft.view(given.view as Id).id };
    case 'point':
      return {
        kind: 'point',
        view: draft.view(given.view as Id).id,
        x: requireNumber(given.x, 'The x of a point'),
        y: requireNumber(given.y, 'The y of a point'),
      };
    default:
      reject(
        'invalid-command',
        `"${String(given.kind)}" is not an anchor: a thread is about an element, a relation, a view or a point.`,
      );
  }
}

/** The text of a comment, normalized and checked. */
function checkedText(text: unknown): string {
  const normalized = typeof text === 'string' ? normalizeCommentText(text) : text;
  const why = commentTextProblem(normalized);
  if (why !== undefined) reject('invalid-comment', why);
  return normalized as string;
}

/**
 * Who writes a comment: Claude, when Claude sends the command, whatever it says; else the person it
 * names, as their preferences do.
 */
function authorOf(draft: Draft, given: CommentAuthor | undefined): CommentAuthor {
  if (draft.author === 'claude') {
    if (given !== undefined && (given as { kind?: unknown }).kind !== 'claude') {
      reject('invalid-author', 'Claude’s comments are signed as Claude: they never name a person.');
    }
    return { kind: 'claude' };
  }
  const checked = checkPerson(given);
  if (!checked.ok) reject(checked.code, checked.message);
  return checked.author;
}

/** A new comment, with its id, author and time. */
function newComment(
  draft: Draft,
  asked: NewComment | undefined,
  text: string,
  taken: readonly Id[],
): ThreadComment {
  const author = authorOf(draft, asked?.author);
  const id = draft.idFor(asked?.id, 'comment', (each) => taken.includes(each));
  return { id, author, time: timeNow(draft), text };
}

/** The time now, as a comment keeps it. */
function timeNow(draft: Draft): string {
  const now = draft.now();
  // Dates reach 8.64e15 ms either side of 1970; past it, there is no time to write.
  const time = Number.isFinite(now) && Math.abs(now) <= 8.64e15 ? new Date(now).toISOString() : '';
  if (!COMMENT_TIME.test(time)) {
    reject('invalid-command', 'The clock gives a time a comment cannot keep.');
  }
  return time;
}

/** Warns of what a text newly mentions that the model does not hold; it is kept as written. */
function warnOfMentions(draft: Draft, text: string, before: string): void {
  const already = new Set(mentionsIn(before));
  for (const id of mentionsIn(text)) {
    if (already.has(id) || draft.index.has(id)) continue;
    draft.warnings.push(
      problem(
        'unknown-mention',
        `The comment mentions "${id}", which is no element or relation of the model.`,
        [id],
      ),
    );
  }
}
