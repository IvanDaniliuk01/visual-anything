import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { textBlocks } from './plain-text';

describe('textBlocks', () => {
  it('splits a text into paragraphs at blank lines, keeping the line breaks inside one', () => {
    expect(textBlocks('One line\nand the next.\n\n  \nAnother paragraph.')).toEqual([
      { kind: 'paragraph', text: 'One line\nand the next.' },
      { kind: 'paragraph', text: 'Another paragraph.' },
    ]);
  });

  it('reads lines that start with "- " as a list, and lines that start with a number and ". " as a numbered one', () => {
    expect(textBlocks('Three parts:\n- the bot\n- the API\n\n2. first\n3. then')).toEqual([
      { kind: 'paragraph', text: 'Three parts:' },
      { kind: 'list', ordered: false, items: ['the bot', 'the API'] },
      { kind: 'list', ordered: true, start: 2, items: ['first', 'then'] },
    ]);
  });

  it('starts a new list when the kind of item changes, and a paragraph after a list', () => {
    expect(textBlocks('- a\n1. b\nafter')).toEqual([
      { kind: 'list', ordered: false, items: ['a'] },
      { kind: 'list', ordered: true, start: 1, items: ['b'] },
      { kind: 'paragraph', text: 'after' },
    ]);
  });

  it('gives nothing for a text with nothing in it', () => {
    expect(textBlocks('')).toEqual([]);
    expect(textBlocks(' \n\n\t')).toEqual([]);
  });

  it('keeps markup as the plain text it is', () => {
    expect(textBlocks('<script>alert(1)</script>\n- <b>bold</b>')).toEqual([
      { kind: 'paragraph', text: '<script>alert(1)</script>' },
      { kind: 'list', ordered: false, items: ['<b>bold</b>'] },
    ]);
  });

  it('reads Windows line endings as line breaks', () => {
    expect(textBlocks('a\r\n\r\n- b\r\n- c')).toEqual([
      { kind: 'paragraph', text: 'a' },
      { kind: 'list', ordered: false, items: ['b', 'c'] },
    ]);
  });

  it('never loses a character that is not a line break or a list mark', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 200 }), (text) => {
        const blocks = textBlocks(text);
        const kept = blocks
          .flatMap((block) => (block.kind === 'paragraph' ? [block.text] : block.items))
          .join('');
        const visible = (value: string) => value.replace(/\s/g, '');
        // Only the list marks at the start of lines go: what is left of the text is all there.
        const marks = text
          .split(/\r?\n|\r/)
          .map((line) => /^\s*(?:- |\d{1,9}\. )/.exec(line)?.[0] ?? '')
          .join('');
        expect(visible(kept).length).toBe(visible(text).length - visible(marks).length);
      }),
    );
  });
});
