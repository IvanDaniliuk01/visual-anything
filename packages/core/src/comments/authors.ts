/**
 * Who writes comments (ADR 0059): a person, by the name and optional email their preferences hold
 * (ADR 0032), or Claude. The person's tab signs their comments; the local program signs Claude's, so
 * that Claude never writes as a person and a person never as Claude.
 */
import type { CommentAuthor, PersonAuthor } from '@visual-anything/schema';
import type { ProblemCode } from '../problems';

/** The longest name and email an author has, as the file format says. */
export const MAX_AUTHOR_NAME = 200;
export const MAX_AUTHOR_EMAIL = 254;

/** An email as the file format takes one: something, an at sign, something, with no spaces. */
const EMAIL = /^[^\s@]+@[^\s@]+$/;

/** A person checked, or why not. */
export type CheckedPerson =
  { ok: true; author: PersonAuthor } | { ok: false; code: ProblemCode; message: string };

/**
 * Checks a person as a command names them: a name, trimmed, of 1 to 200 characters, and an email,
 * trimmed, left out when empty. Only those are kept, so nothing else reaches the file.
 */
export function checkPerson(value: unknown): CheckedPerson {
  if (typeof value !== 'object' || value === null) {
    return {
      ok: false,
      code: 'no-comment-author',
      message: 'A comment needs the name of who writes it: set it in your preferences.',
    };
  }
  const { kind, name, email } = value as Record<string, unknown>;
  if (kind !== 'person') {
    return { ok: false, code: 'invalid-author', message: 'Only Claude signs as Claude.' };
  }
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed === '') {
    return {
      ok: false,
      code: 'no-comment-author',
      message: 'A comment needs the name of who writes it: set it in your preferences.',
    };
  }
  if (trimmed.length > MAX_AUTHOR_NAME) {
    return {
      ok: false,
      code: 'invalid-author',
      message: 'An author’s name holds at most 200 characters.',
    };
  }
  if (email !== undefined && typeof email !== 'string') {
    return { ok: false, code: 'invalid-author', message: 'An author’s email must be text.' };
  }
  const address = email?.trim() ?? '';
  if (address !== '' && (address.length > MAX_AUTHOR_EMAIL || !EMAIL.test(address))) {
    return {
      ok: false,
      code: 'invalid-author',
      message: `"${address.slice(0, MAX_AUTHOR_EMAIL)}" is not an email address.`,
    };
  }
  return {
    ok: true,
    author:
      address === ''
        ? { kind: 'person', name: trimmed }
        : { kind: 'person', name: trimmed, email: address },
  };
}

/**
 * Whether two authors are the same: Claude is Claude; two people are the same when their emails
 * match, if both have one, and else when their names do, whatever their case and the spaces around.
 */
export function isSameAuthor(a: CommentAuthor, b: CommentAuthor): boolean {
  if (a.kind === 'claude' || b.kind === 'claude') return a.kind === b.kind;
  if (a.email !== undefined && b.email !== undefined) {
    return folded(a.email) === folded(b.email);
  }
  return folded(a.name) === folded(b.name);
}

/** How an author is named where comments show: their name, or Claude. */
export function authorNameOf(author: CommentAuthor): string {
  return author.kind === 'claude' ? 'Claude' : author.name;
}

/**
 * A key that is the same for the comments of one author, to filter by: `claude`, a person's email, or
 * their name when they gave none.
 */
export function authorKeyOf(author: CommentAuthor): string {
  if (author.kind === 'claude') return 'claude';
  return author.email !== undefined
    ? `email:${folded(author.email)}`
    : `name:${folded(author.name)}`;
}

function folded(text: string): string {
  return text.trim().toLowerCase();
}
