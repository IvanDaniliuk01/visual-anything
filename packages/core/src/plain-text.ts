/**
 * Plain text with paragraphs and lists, as a tour's captions and speaker notes hold it (ADR 0058) and a
 * comment's text does (ADR 0059). It is never HTML: whatever it holds, markup included, is shown as the
 * text it is. A blank line starts a paragraph; a line that starts with "- " is an item of a list, and
 * one that starts with a number and ". " an item of a numbered list.
 */

/** A part of a plain text, as it is shown. */
export type TextBlock =
  /** Lines shown together, each line break kept. */
  | { kind: 'paragraph'; text: string }
  /** Items shown as a list; a numbered one starts at its first item's number. */
  | { kind: 'list'; ordered: false; items: string[] }
  | { kind: 'list'; ordered: true; start: number; items: string[] };

const BULLET = /^\s*- ([\s\S]*)$/;
const NUMBERED = /^\s*(\d{1,9})\. ([\s\S]*)$/;

/** The paragraphs and lists of a plain text, in order; none when it holds only blank lines. */
export function textBlocks(text: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  let paragraph: string[] = [];
  let list: Extract<TextBlock, { kind: 'list' }> | undefined;
  const endParagraph = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
    paragraph = [];
  };
  const endList = () => {
    if (list) blocks.push(list);
    list = undefined;
  };
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (line.trim() === '') {
      endParagraph();
      endList();
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet) {
      endParagraph();
      if (list?.ordered !== false) {
        endList();
        list = { kind: 'list', ordered: false, items: [] };
      }
      list.items.push((bullet[1] ?? '').trim());
    } else if (numbered) {
      endParagraph();
      if (list?.ordered !== true) {
        endList();
        list = { kind: 'list', ordered: true, start: Number(numbered[1]), items: [] };
      }
      list.items.push((numbered[2] ?? '').trim());
    } else {
      endList();
      paragraph.push(line.trim());
    }
  }
  endParagraph();
  endList();
  return blocks;
}
