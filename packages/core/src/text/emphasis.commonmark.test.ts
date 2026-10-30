/**
 * A conformance subset of CommonMark's and GitHub's spec examples for what text emphasis takes
 * (ADR 0082). The examples are copied in `fixtures/commonmark-examples.ts`, under the
 * specifications' licence, CC BY-SA 4.0, which that file states; the tests fetch nothing.
 */
import { describe, expect, it } from 'vitest';
import { htmlBlocks } from '../test/commonmark-html';
import { parseEmphasis } from './emphasis';
import { SPEC_EXAMPLES } from './fixtures/commonmark-examples';

describe('CommonMark and GitHub examples', () => {
  it('holds examples of every part the reader takes', () => {
    const sections = new Set(SPEC_EXAMPLES.map((example) => example.section));
    for (const section of [
      'Backslash escapes',
      'Thematic breaks',
      'ATX headings',
      'Fenced code blocks',
      'Paragraphs',
      'Block quotes',
      'List items',
      'Lists',
      'Code spans',
      'Emphasis and strong emphasis',
      'Links',
      'Tables',
      'Strikethrough',
      'Task list items',
    ]) {
      expect(sections, section).toContain(section);
    }
    expect(SPEC_EXAMPLES.length).toBeGreaterThan(300);
  });

  it.each(SPEC_EXAMPLES.map((example) => [`${example.spec} ${example.example}`, example] as const))(
    'reads %s as its specification says',
    (_, example) => {
      const read: unknown = JSON.parse(
        JSON.stringify(parseEmphasis(example.markdown, { blocks: true })),
      );
      expect(read).toEqual(JSON.parse(JSON.stringify(htmlBlocks(example.html))));
    },
  );
});
