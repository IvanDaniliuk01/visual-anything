/**
 * Texts that take text emphasis (ADR 0082), written as plain text by an export whose format has no
 * emphasis of its own that every host draws alike, such as Mermaid and Structurizr DSL. The export
 * then says among what it lost that emphasis was written as plain text, once, and only when some
 * text it wrote had any.
 *
 * Math (ADR 0106) is written as its TeX, as typed: the notation itself, and no loss. A text whose
 * only markup is Math does not make the export say so.
 */
import {
  blocksText,
  parseEmphasis,
  plainText,
  type EmphasisBlock,
  type EmphasisRun,
} from '@visual-anything/core';
import { t } from '../i18n';

export const EMPHASIS_LOST = 'Text emphasis (bold, italic and the rest) is written as plain text.';

export interface PlainTexts {
  /** The text without its markers, its formulas as their TeX; an absent text is empty. */
  plain: (text: string | undefined) => string;
  /** What the export says it lost, once a text it wrote had emphasis. */
  lost: () => string[];
}

export function plainTexts(): PlainTexts {
  let emphasised = false;
  return {
    plain(text) {
      if (text === undefined || text === '') return '';
      if (!emphasised && losesEmphasis(text)) emphasised = true;
      return plainText(text);
    },
    lost: () => (emphasised ? [t(EMPHASIS_LOST)] : []),
  };
}

/**
 * Whether writing a text as plain text loses some of how it is drawn, as `drawsDifferently` says, but
 * for Math: some of it is emphasised, a link, or a block other than a paragraph or a formula; or,
 * when it holds no formula, its plain text differs from its source, as an escape makes it. A
 * formula's plain text is its TeX, which may differ from its source in its delimiters alone.
 */
export function losesEmphasis(text: string): boolean {
  const parsed = parseEmphasis(text, { blocks: true });
  let math = false;
  const emphasised = (runs: readonly EmphasisRun[]): boolean =>
    runs.some((run) => {
      if (run.math !== undefined) {
        math = true;
        return false;
      }
      return (
        run.bold ||
        run.italic ||
        run.strike ||
        run.underline ||
        run.code ||
        run.highlight ||
        run.link !== undefined
      );
    });
  const differs = (block: EmphasisBlock): boolean => {
    if (block.kind === 'math') {
      math = true;
      return false;
    }
    return block.kind !== 'paragraph' || emphasised(block.runs);
  };
  if (parsed.some(differs)) return true;
  return !math && blocksText(parsed) !== text.replace(/\r\n?/g, '\n').trim();
}
