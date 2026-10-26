/**
 * The commands the comments panel sends (ADR 0059), each one action. The person's comments carry the
 * name and email their preferences hold, read when the command is made, so a comment written right
 * after the name was set carries it; the program signs Claude's itself.
 */
import type { AuthorPreference, Command } from '@visual-anything/core';
import type { CommentAnchor, Id, PersonAuthor } from '@visual-anything/schema';

/** The person as their comments name them, or undefined until their preferences give a name. */
export function personOf(author: AuthorPreference | null): PersonAuthor | undefined {
  const name = author?.name.trim() ?? '';
  if (author === null || name === '') return undefined;
  const email = author.email?.trim();
  return email === undefined || email === ''
    ? { kind: 'person', name }
    : { kind: 'person', name, email };
}

export function createThreadCommand(
  anchor: CommentAnchor,
  text: string,
  author: PersonAuthor,
): Command {
  return { type: 'create-thread', thread: { anchor, comment: { text, author } } };
}

export function replyCommand(thread: Id, text: string, author: PersonAuthor): Command {
  return { type: 'add-comment', thread, comment: { text, author } };
}

export function editCommand(thread: Id, comment: Id, text: string, author: PersonAuthor): Command {
  return { type: 'edit-comment', thread, comment, text, author };
}

export function resolveCommand(thread: Id, resolved: boolean): Command {
  return { type: 'resolve-thread', thread, resolved };
}

export function deleteThreadCommand(thread: Id): Command {
  return { type: 'delete-thread', thread };
}
