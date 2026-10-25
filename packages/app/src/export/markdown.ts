/**
 * Writing what people wrote into Markdown as text: every character Markdown or HTML would read as
 * markup escaped, so that a name can never become a heading, a list, a link, an image or a tag where
 * the file is read, on GitHub or anywhere else.
 */

/** The characters CommonMark reads as markup within a line, escaped with a backslash. */
const INLINE = /[\\`*_[\]{}()#+!|~<>]/g;

/** What starts a block in CommonMark at the start of a line: a list item, a quote, a heading, a rule. */
const BLOCK_START = /^([-+*=>#]|\d+[.)])/;

/** A text on one line, as Markdown reads it as text. */
export function markdownInline(text: string): string {
  return text
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(INLINE, (character) => `\\${character}`)
    .trim();
}

/**
 * A text of paragraphs, as Markdown reads it as text: its lines kept, without the indent that would
 * make code of them, none of them starting a block.
 */
export function markdownBlock(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) =>
      line
        .trim()
        .replace(/&/g, '&amp;')
        .replace(INLINE, (character) => `\\${character}`)
        .replace(BLOCK_START, (start: string) =>
          start.length > 1 ? `${start.slice(0, -1)}\\${start.slice(-1)}` : `\\${start}`,
        ),
    )
    .join('\n')
    .trim();
}

/** A code span holding a text as it is: fenced by more backticks than any run in it. */
export function codeSpan(text: string): string {
  const one = text.replace(/[\r\n]+/g, ' ');
  const longest = Math.max(0, ...[...one.matchAll(/`+/g)].map((run) => run[0].length));
  const fence = '`'.repeat(longest + 1);
  const padded = one.startsWith('`') || one.endsWith('`') || one.startsWith(' ') ? ` ${one} ` : one;
  return `${fence}${padded}${fence}`;
}
