/**
 * Whether a text that takes text emphasis (ADR 0082) is drawn as something other than its source:
 * a field then shows it drawn, and an export that writes plain text says what it lost.
 */
import { blocksText, parseEmphasis } from '@visual-anything/core';

/**
 * True when some of it is emphasised, a link, a formula (ADR 0106) or a block other than a
 * paragraph, or when its plain text differs from its source, as an escape does. `blocks` is false for
 * a text of one line.
 */
export function drawsDifferently(text: string, blocks = true): boolean {
  const parsed = parseEmphasis(text, { blocks });
  const shown = blocks ? text.replace(/\r\n?/g, '\n').trim() : text.replace(/\r\n?|\n/g, ' ');
  return (
    parsed.some(
      (block) =>
        block.kind !== 'paragraph' ||
        block.runs.some(
          (run) =>
            run.bold ||
            run.italic ||
            run.strike ||
            run.underline ||
            run.code ||
            run.highlight ||
            run.link !== undefined ||
            run.math !== undefined,
        ),
    ) || blocksText(parsed) !== shown
  );
}
