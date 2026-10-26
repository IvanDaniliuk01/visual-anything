/**
 * What a comment's text holds (ADR 0059): plain text, never HTML. A blank line starts a paragraph, a
 * line that starts with "- " or with a number and ". " is an item of a list, and `@[id]` mentions an
 * element or a relation of the model by its id. Reading it gives blocks of text and mentions, which
 * the app writes as text nodes and Claude reads as they are: nothing in a comment is ever markup.
 */
import type { Id } from '@visual-anything/schema';

/** The most characters a comment holds, as the file format says. */
export const MAX_COMMENT_TEXT = 20_000;

/** A part of a line: text as written, or a mention of an element or relation by its id. */
export type CommentInline = { kind: 'text'; text: string } | { kind: 'mention'; id: Id };

/** A paragraph, line by line, or a list, item by item. */
export type CommentBlock =
  | { kind: 'paragraph'; lines: CommentInline[][] }
  | { kind: 'list'; ordered: false; items: CommentInline[][] }
  | { kind: 'list'; ordered: true; start: number; items: CommentInline[][] };

/** A mention: `@[` and an id, as the `Id` pattern writes one, and `]`. */
const MENTION = /@\[([A-Za-z0-9][A-Za-z0-9._-]{0,127})\]/g;

/** Control characters but the tab and the line feed, which plain text has no use for. */
// eslint-disable-next-line no-control-regex -- finding them is what this pattern is for
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/;

/** A list item: its marker, and what follows it. */
const ITEM = /^[ \t]*(?:(- )|(\d{1,9})\. )(.*)$/;

/**
 * The text as a comment keeps it: lines ended by LF alone, with no spaces or tabs at their ends, and
 * no blank space before or after the whole.
 */
export function normalizeCommentText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

/** Why a comment cannot hold this text, once normalized; undefined when it can. */
export function commentTextProblem(text: unknown): string | undefined {
  if (typeof text !== 'string' || text === '') return 'A comment needs some text.';
  if (text.length > MAX_COMMENT_TEXT) return 'A comment holds at most 20,000 characters.';
  if (CONTROL.test(text)) return 'A comment is plain text: it holds no control characters.';
  return undefined;
}

/** The ids a text mentions, each once, in the order it first mentions them. */
export function mentionsIn(text: string): Id[] {
  return [...new Set([...text.matchAll(MENTION)].map((match) => match[1] as Id))];
}

/** Reads a comment's text into paragraphs and lists, with its mentions. */
export function readCommentText(text: string): CommentBlock[] {
  const blocks: CommentBlock[] = [];
  let open: CommentBlock | undefined;
  for (const line of normalizeCommentText(text).split('\n')) {
    if (line.trim() === '') {
      open = undefined;
      continue;
    }
    const item = ITEM.exec(line);
    if (item === null) {
      if (open?.kind !== 'paragraph') {
        open = { kind: 'paragraph', lines: [] };
        blocks.push(open);
      }
      open.lines.push(inlineOf(line));
      continue;
    }
    const ordered = item[2] !== undefined;
    if (open?.kind !== 'list' || open.ordered !== ordered) {
      open = ordered
        ? { kind: 'list', ordered: true, start: Number(item[2]), items: [] }
        : { kind: 'list', ordered: false, items: [] };
      blocks.push(open);
    }
    open.items.push(inlineOf(item[3] ?? ''));
  }
  return blocks;
}

/** A line, split into text and mentions. */
function inlineOf(line: string): CommentInline[] {
  const parts: CommentInline[] = [];
  let last = 0;
  for (const match of line.matchAll(MENTION)) {
    if (match.index > last) parts.push({ kind: 'text', text: line.slice(last, match.index) });
    parts.push({ kind: 'mention', id: match[1] as Id });
    last = match.index + match[0].length;
  }
  if (last < line.length || parts.length === 0) {
    parts.push({ kind: 'text', text: line.slice(last) });
  }
  return parts;
}
