/**
 * What a drawing of HTML is made from and at, as ADR 0068 caps it. A module of its own, importing
 * nothing, so that the live protocol can read its messages without loading the commands.
 */
export const DRAWING_LIMITS = {
  /** Bytes of UTF-8 text an HTML file or fragment may hold. */
  input: 512 * 1024,
  /** The width the page is laid out at, in CSS pixels. */
  width: { least: 64, most: 2000, initial: 800 },
  /** The tallest a drawing is, in CSS pixels; what lies below is cut. */
  height: 4000,
} as const;
