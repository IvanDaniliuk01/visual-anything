/**
 * Writing what people wrote into Markdown as text: every character Markdown or HTML would read as
 * markup escaped, so that a name can never become a heading, a list, a link, an image or a tag where
 * the file is read, on GitHub or anywhere else. A text that takes text emphasis (ADR 0082) is
 * written with the markers of what it draws, and only those.
 */
import { parseEmphasis, type EmphasisBlock, type EmphasisRun } from '@visual-anything/core';

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
  // A text of spaces alone is read as it is; any other is read without one space at each end.
  const padded =
    one.trim() !== '' && (one.startsWith('`') || one.endsWith('`') || one.startsWith(' '))
      ? ` ${one} `
      : one;
  return `${fence}${padded}${fence}`;
}

// Text emphasis (ADR 0082) ------------------------------------------------------------------------

/** A mark the writer opens and closes around runs, outermost first. */
type Mark = 'bold' | 'italic' | 'strike' | 'highlight' | 'underline';
const MARKS: readonly Mark[] = ['bold', 'italic', 'strike', 'highlight', 'underline'];
/** CommonMark's and GitHub's markers; GitHub keeps `<mark>` and `<ins>`, which Markdown lacks. */
const OPENING: Readonly<Record<Mark, string>> = {
  bold: '**',
  italic: '*',
  strike: '~~',
  highlight: '<mark>',
  underline: '<ins>',
};
const CLOSING: Readonly<Record<Mark, string>> = {
  bold: '**',
  italic: '*',
  strike: '~~',
  highlight: '</mark>',
  underline: '</ins>',
};

/**
 * A text that takes text emphasis, as CommonMark and GitHub's Markdown write it: its runs with `**`,
 * `*`, `~~` and backticks, highlight as `<mark>` and underline as `<ins>`, and its blocks as
 * Markdown's. Everything else is escaped as `markdownInline` escapes it, so that nothing a person
 * wrote becomes markup that the text did not draw; the source text is never passed through.
 * `headingLevel` is the level its `#` headings take in the file, so that they sit under the file's
 * own; `##` and `###` take the next ones, up to 6.
 */
export function markdownOfEmphasis(text: string, { headingLevel = 1 } = {}): string {
  return blocksMarkdown(parseEmphasis(text, { blocks: true }), headingLevel).join('\n');
}

/** The runs of one line, such as an attribute's value that takes emphasis, as Markdown. */
export function markdownOfRuns(runs: readonly EmphasisRun[]): string {
  return runsMarkdown(runs, false).replace(/\\\n/g, ' ');
}

function blocksMarkdown(blocks: readonly EmphasisBlock[], level: number): string[] {
  const lines: string[] = [];
  let previous: EmphasisBlock | undefined;
  for (const block of blocks) {
    if (previous !== undefined) lines.push('');
    lines.push(...blockMarkdown(block, previous, level));
    previous = block;
  }
  return lines;
}

function blockMarkdown(
  block: EmphasisBlock,
  previous: EmphasisBlock | undefined,
  level: number,
): string[] {
  switch (block.kind) {
    case 'paragraph':
      return runsMarkdown(block.runs, false).split('\n');
    case 'heading':
      return [
        `${'#'.repeat(Math.min(6, level + block.level - 1))} ${runsMarkdown(block.runs, false).replace(/\\\n/g, ' ')}`,
      ];
    case 'list': {
      // Two lists of the same kind in a row would be read as one: the second takes other markers.
      const other = previous?.kind === 'list' && previous.ordered === block.ordered;
      const lines: string[] = [];
      block.items.forEach((item, at) => {
        const marker = block.ordered
          ? `${block.start + at}${other ? ')' : '.'} `
          : other
            ? '* '
            : '- ';
        const task = item.checked === undefined ? '' : item.checked ? '[x] ' : '[ ] ';
        const indent = ' '.repeat(marker.length);
        const inner: string[] = [];
        let before: EmphasisBlock | undefined;
        for (const each of item.blocks) {
          // A list right under an item's paragraph keeps the list tight.
          if (before !== undefined && !(each.kind === 'list' && before.kind === 'paragraph')) {
            inner.push('');
          }
          inner.push(...blockMarkdown(each, before, level));
          before = each;
        }
        if (inner.length === 0) inner.push('');
        inner.forEach((line, index) => {
          if (index === 0) lines.push(`${marker}${task}${line}`.trimEnd());
          else lines.push(line === '' ? '' : `${indent}${line}`);
        });
      });
      return lines;
    }
    case 'quote':
      return blocksMarkdown(block.blocks, level).map((line) => (line === '' ? '>' : `> ${line}`));
    case 'rule':
      return ['---'];
    case 'code': {
      const longest = Math.max(0, ...[...block.text.matchAll(/`+/g)].map((run) => run[0].length));
      const fence = '`'.repeat(Math.max(3, longest + 1));
      return [fence, ...(block.text === '' ? [] : block.text.split('\n')), fence];
    }
    case 'table': {
      const row = (cells: readonly (readonly EmphasisRun[])[]) =>
        `| ${block.align.map((_, column) => runsMarkdown(cells[column] ?? [], true)).join(' | ')} |`;
      const delimiter = block.align.map((align) =>
        align === 'center' ? ':-:' : align === 'left' ? ':--' : align === 'right' ? '--:' : '---',
      );
      return [row(block.head), `| ${delimiter.join(' | ')} |`, ...block.rows.map(row)];
    }
  }
}

/**
 * Runs as Markdown: marks opened and closed as they change from one run to the next, with the spaces
 * and line breaks at their ends left outside the markers, so that the markers flank words as
 * Markdown needs them to. A link's runs are written inside its label. A line break is a hard break,
 * and a line that would start a block is escaped.
 */
function runsMarkdown(runs: readonly EmphasisRun[], inTable: boolean): string {
  let out = '';
  let lineStart = true;
  const write = (text: string, escape: boolean) => {
    text.split('\n').forEach((line, at) => {
      if (at > 0) {
        out += '\\\n';
        lineStart = true;
      }
      if (line === '') return;
      let written = escape ? escapedText(line) : line;
      if (escape && lineStart) {
        written = written.replace(/^([-=])/, '\\$1').replace(/^(\d+)([.)])/, '$1\\$2');
      }
      out += written;
      lineStart = false;
    });
  };
  /** Writes `markers` before the spaces and line breaks that the text so far ends with. */
  const beforeTrailingSpace = (markers: string) => {
    let end = out.length;
    for (;;) {
      if (end > 0 && (out[end - 1] === ' ' || out[end - 1] === '\t')) end--;
      else if (end > 1 && out[end - 1] === '\n' && out[end - 2] === '\\') end -= 2;
      else break;
    }
    out = out.slice(0, end) + markers + out.slice(end);
  };

  for (let at = 0; at < runs.length;) {
    const link = runs[at]!.link;
    const segment: EmphasisRun[] = [];
    while (at < runs.length && runs[at]!.link === link) segment.push(runs[at++]!);
    if (link !== undefined) {
      out += '[';
      lineStart = false;
    }
    const open: Mark[] = [];
    for (const run of segment) {
      const wanted = MARKS.filter((mark) => run[mark]);
      let keep = 0;
      while (keep < open.length && wanted.includes(open[keep]!)) keep++;
      const closing = open.splice(keep).reverse();
      if (closing.length > 0) beforeTrailingSpace(closing.map((mark) => CLOSING[mark]).join(''));
      const opening = wanted.filter((mark) => !open.includes(mark));
      let text = run.text;
      if (opening.length > 0) {
        let lead = 0;
        while (lead < text.length && (text[lead] === ' ' || text[lead] === '\n')) lead++;
        write(text.slice(0, lead), false);
        text = text.slice(lead);
        out += opening.map((mark) => OPENING[mark]).join('');
        lineStart = false;
        open.push(...opening);
      }
      if (run.code) {
        out += codeSpan(inTable ? text.replace(/\|/g, '\\|') : text);
        lineStart = false;
      } else write(text, true);
    }
    if (open.length > 0) {
      beforeTrailingSpace(
        open
          .reverse()
          .map((mark) => CLOSING[mark])
          .join(''),
      );
    }
    if (link !== undefined) out += `](<${link.replace(/[\\<>]/g, (char) => `\\${char}`)}>)`;
  }
  return out;
}

/** A part of a line as Markdown reads it as text: every markup character escaped. */
function escapedText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(INLINE, (character) => `\\${character}`);
}
