import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { textBlocks, type TextBlock } from '../plain-text';
import {
  MAX_COMMENT_TEXT,
  commentTextProblem,
  mentionsIn,
  normalizeCommentText,
  readCommentText,
  type CommentBlock,
  type CommentInline,
} from './text';

describe('normalizeCommentText', () => {
  it('ends lines with LF only, drops spaces at line ends and around the text', () => {
    expect(normalizeCommentText('\r\n  Hello  \r\nthere\t\r\rbye \n\n')).toBe(
      'Hello\nthere\n\nbye',
    );
  });

  it('keeps blank lines between paragraphs, and indentation inside', () => {
    expect(normalizeCommentText('One\n\n\n  - two')).toBe('One\n\n\n  - two');
  });
});

describe('commentTextProblem', () => {
  it('accepts plain text with tabs and line breaks', () => {
    expect(commentTextProblem('A\tB\nC <b>not HTML</b> & "quotes"')).toBeUndefined();
  });

  it('refuses no text, too much text and control characters', () => {
    expect(commentTextProblem('')).toBe('A comment needs some text.');
    expect(commentTextProblem('x'.repeat(MAX_COMMENT_TEXT + 1))).toBe(
      'A comment holds at most 20,000 characters.',
    );
    expect(commentTextProblem(`bell\u0007`)).toBe(
      'A comment is plain text: it holds no control characters.',
    );
    expect(commentTextProblem(`nul\u0000`)).toBeDefined();
    expect(commentTextProblem(`del\u007F`)).toBeDefined();
  });

  it('refuses what is not text at all', () => {
    expect(commentTextProblem(5)).toBe('A comment needs some text.');
  });
});

describe('mentionsIn', () => {
  it('lists each id mentioned once, in order', () => {
    expect(mentionsIn('See @[api] and @[db], then @[api] again; @[] and @[-x] are not.')).toEqual([
      'api',
      'db',
    ]);
  });
});

describe('readCommentText', () => {
  it('reads paragraphs, split by blank lines, with their lines', () => {
    expect(readCommentText('One\ntwo\n\nThree')).toEqual<CommentBlock[]>([
      {
        kind: 'paragraph',
        lines: [[{ kind: 'text', text: 'One' }], [{ kind: 'text', text: 'two' }]],
      },
      { kind: 'paragraph', lines: [[{ kind: 'text', text: 'Three' }]] },
    ]);
  });

  it('reads lists of "- " items and of numbered items', () => {
    expect(readCommentText('Do:\n- this\n- that\n\n3. third\n4. fourth')).toEqual<CommentBlock[]>([
      { kind: 'paragraph', lines: [[{ kind: 'text', text: 'Do:' }]] },
      {
        kind: 'list',
        ordered: false,
        items: [[{ kind: 'text', text: 'this' }], [{ kind: 'text', text: 'that' }]],
      },
      {
        kind: 'list',
        ordered: true,
        start: 3,
        items: [[{ kind: 'text', text: 'third' }], [{ kind: 'text', text: 'fourth' }]],
      },
    ]);
  });

  it('starts another list when the kind of item changes', () => {
    const blocks = readCommentText('- a\n1. b');
    expect(blocks.map((block) => block.kind === 'list' && block.ordered)).toEqual([false, true]);
  });

  it('reads mentions inside text', () => {
    expect(readCommentText('Ask @[api] about @[db].')).toEqual<CommentBlock[]>([
      {
        kind: 'paragraph',
        lines: [
          [
            { kind: 'text', text: 'Ask ' },
            { kind: 'mention', id: 'api' },
            { kind: 'text', text: ' about ' },
            { kind: 'mention', id: 'db' },
            { kind: 'text', text: '.' },
          ],
        ],
      },
    ]);
  });

  it('reads paragraphs and lists as captions and speaker notes are read, with the same reader', () => {
    expect(readCommentText('  Indented\n - an item\n   2. numbered')).toEqual<CommentBlock[]>([
      { kind: 'paragraph', lines: [[{ kind: 'text', text: 'Indented' }]] },
      { kind: 'list', ordered: false, items: [[{ kind: 'text', text: 'an item' }]] },
      { kind: 'list', ordered: true, start: 2, items: [[{ kind: 'text', text: 'numbered' }]] },
    ]);
    const unit = fc.constantFrom(' ', '\t', '\n', '\r', ' ', '-', '1', '.', 'a', '@', '[', ']');
    const written = (parts: CommentInline[]) =>
      parts.map((part) => (part.kind === 'text' ? part.text : `@[${part.id}]`)).join('');
    fc.assert(
      fc.property(fc.string({ unit, maxLength: 120 }), (text) => {
        const blocks = readCommentText(text).map((block): TextBlock => {
          if (block.kind === 'paragraph') {
            return { kind: 'paragraph', text: block.lines.map(written).join('\n') };
          }
          const items = block.items.map(written);
          return block.ordered
            ? { kind: 'list', ordered: true, start: block.start, items }
            : { kind: 'list', ordered: false, items };
        });
        expect(blocks).toEqual(textBlocks(normalizeCommentText(text)));
      }),
    );
  });

  it('keeps every character of a line, HTML included, as text', () => {
    const line = fc
      .string({ maxLength: 300 })
      .filter(
        (text) => !/[\n\r]/.test(text) && !/^\s*(- |\d+\. )/.test(text) && text.trim() !== '',
      );
    fc.assert(
      fc.property(line, (text) => {
        const blocks = readCommentText(text);
        expect(blocks).toHaveLength(1);
        const [block] = blocks;
        const parts = block?.kind === 'paragraph' ? block.lines.flat() : [];
        const written = parts
          .map((part) => (part.kind === 'text' ? part.text : `@[${part.id}]`))
          .join('');
        expect(written).toBe(normalizeCommentText(text));
      }),
    );
    expect(readCommentText('<img src=x onerror=alert(1)>')).toEqual([
      {
        kind: 'paragraph',
        lines: [[{ kind: 'text', text: '<img src=x onerror=alert(1)>' }]],
      },
    ]);
  });
});
