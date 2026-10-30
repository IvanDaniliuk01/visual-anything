/**
 * Texts that take text emphasis (ADR 0082), written as plain text by an export whose format has no
 * emphasis of its own that every host draws alike, such as Mermaid and Structurizr DSL. The export
 * then says among what it lost that emphasis was written as plain text, once, and only when some
 * text it wrote had any.
 */
import { plainText } from '@visual-anything/core';
import { t } from '../i18n';
import { drawsDifferently } from '../text/drawn';

export const EMPHASIS_LOST = 'Text emphasis (bold, italic and the rest) is written as plain text.';

export interface PlainTexts {
  /** The text without its markers; an absent text is empty. */
  plain: (text: string | undefined) => string;
  /** What the export says it lost, once a text it wrote had emphasis. */
  lost: () => string[];
}

export function plainTexts(): PlainTexts {
  let emphasised = false;
  return {
    plain(text) {
      if (text === undefined || text === '') return '';
      if (drawsDifferently(text)) emphasised = true;
      return plainText(text);
    },
    lost: () => (emphasised ? [t(EMPHASIS_LOST)] : []),
  };
}
