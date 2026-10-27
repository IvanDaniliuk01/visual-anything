/**
 * The caps on making a drawing of HTML (ADR 0068), each a named constant, so that no product of capped
 * factors makes reading, cleaning or laying it out slow:
 *
 * - **reading**, where past a cap the HTML is refused: its size, the attributes of one tag, how deep
 *   the parser's open elements go and how many nodes it makes;
 * - **cleaning**, where past a cap what is left is dropped and reported: the elements kept, how deep
 *   they nest and the text they hold; and, as the SVG cleaner refuses (ADR 0027), the style rules, the
 *   selectors of one rule and the steps folding them takes;
 * - **laying out**, in a worker of its own: its memory and its time.
 */
import { DRAWING_LIMITS } from '@visual-anything/core';

export const HTML_CAPS = {
  /** Bytes of UTF-8 text. */
  input: DRAWING_LIMITS.input,
  /** Attributes of one tag; the rest are dropped as they are read, and reported. */
  attributesPerTag: 256,
  /** Elements open at once while the text is read; deeper HTML is refused. */
  parseDepth: 128,
  /** Elements, texts and comments the reader makes; more is refused. */
  parseNodes: 25_000,
  /** Elements kept; the rest, in document order, are dropped with their contents. */
  elements: 5_000,
  /** How deeply kept elements nest, `html` at 1; deeper ones are dropped with their contents. */
  depth: 64,
  /**
   * Characters of text kept; the rest is dropped. Text is drawn as the outlines of its glyphs, about
   * 230 bytes a character, so even this much is past what a cleaned picture holds (ADR 0027); the cap
   * keeps laying out such a page within a second or two.
   */
  text: 4_000,
  /** `<style>` rules, `@` rules included. */
  styleRules: 256,
  /** Selectors in one rule. */
  selectorsPerRule: 16,
  /**
   * Folding in all: each declaration a rule or a `style` attribute applies to an element counts once,
   * and each rule an element's name, class or id finds counts once more, before anything is folded.
   */
  foldBudget: 100_000,
  /** Characters of one value. */
  valueLength: 256,
  /** The memory of the worker that lays the drawing out, in MiB. */
  memoryMb: 256,
  /** How long the worker may take, in milliseconds, before it is stopped. */
  timeMs: 10_000,
} as const;
