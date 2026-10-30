/**
 * The caps on faces (ADR 0083), which bound reading and laying one out as ADR 0027's bound the image
 * cleaner. A command refuses a face past them with `face-too-large`; opening a project only warns, and
 * a face past them is drawn as the shape's name.
 */
export const FACE_CAPS = Object.freeze({
  /** Lines of markup, the variants' included. */
  markupLines: 200,
  /** UTF-8 bytes of markup, the variants' included, its lines joined by line feeds. */
  markupBytes: 16 * 1024,
  /** Style rules. */
  styleRules: 128,
  /** UTF-8 bytes of style. */
  styleBytes: 16 * 1024,
  /** Characters in one line of markup or style. */
  lineCharacters: 2_000,
  variants: 8,
  /** How deep elements nest in a markup. */
  depth: 16,
  /** Boxes laid out in one face drawing. */
  boxes: 256,
  /** Text runs laid out in one face drawing. */
  runs: 256,
  /** Characters a slot writes; past them it is cut and ends in "…". */
  slotCharacters: 2_000,
  /** Times `<each of="…">` repeats over a list attribute. */
  eachItems: 32,
  /** Times `<each of="attributes">` repeats. */
  eachAttributes: 64,
  /** Bytes of faces in one package: their markup and style, as stored. */
  packageBytes: 512 * 1024,
  /** Columns `grid-template-columns` names. */
  gridColumns: 12,
  /** Simple selectors in one selector, joined by spaces. */
  selectorDepth: 4,
  /** Selectors in one rule, separated by commas. */
  selectorsPerRule: 16,
});

/** The smallest and largest size text takes, in px. */
export const FACE_FONT_SIZES = Object.freeze({ min: 8, max: 32 });
