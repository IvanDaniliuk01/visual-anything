/**
 * Math (ADR 0106): TeX notation in a text, parsed and measured by KaTeX and laid out by the core
 * into a math drawing that the canvas, the panels' fallbacks, the exports and Claude's captures draw
 * alike. Everything here is in ems of the formula's own font size: x grows to the right and y down,
 * from the left end of the formula on its baseline.
 */

/** The most characters one formula takes; a longer one is drawn as its TeX, with `math-error`. */
export const MAX_MATH_CHARACTERS = 2_000;

/** The most formulas one text typesets; the rest are drawn as their TeX. */
export const MAX_MATH_PER_TEXT = 200;

/**
 * Commands a formula may not use, since ADR 0082 keeps colors to the theme and links to their own
 * syntax. A formula that uses one fails with `math-error`.
 */
export const REFUSED_MATH_COMMANDS: readonly string[] = [
  '\\color',
  '\\textcolor',
  '\\colorbox',
  '\\href',
];

/**
 * The fonts KaTeX draws with, by the name of their file without `KaTeX_` and the extension, such as
 * `Main-Regular`, `Math-Italic` or `Size1-Regular`.
 */
export type MathFont =
  | 'AMS-Regular'
  | 'Caligraphic-Bold'
  | 'Caligraphic-Regular'
  | 'Fraktur-Bold'
  | 'Fraktur-Regular'
  | 'Main-Bold'
  | 'Main-BoldItalic'
  | 'Main-Italic'
  | 'Main-Regular'
  | 'Math-BoldItalic'
  | 'Math-Italic'
  | 'SansSerif-Bold'
  | 'SansSerif-Italic'
  | 'SansSerif-Regular'
  | 'Script-Regular'
  | 'Size1-Regular'
  | 'Size2-Regular'
  | 'Size3-Regular'
  | 'Size4-Regular'
  | 'Typewriter-Regular';

/** One character drawn in one of KaTeX's fonts. */
export interface MathGlyph {
  /** One code point. */
  char: string;
  font: MathFont;
  /** Where the pen starts, in ems. */
  x: number;
  /** The glyph's baseline, in ems below the formula's baseline (negative above it). */
  baseline: number;
  /** Its font size, in ems of the formula's font size: 1 in the text, smaller in scripts. */
  size: number;
}

/** A filled band: a fraction's line, an overline, a border, a column separator. */
export interface MathRule {
  x: number;
  /** Its top edge. */
  y: number;
  width: number;
  height: number;
  /** Set for a dashed separator (`:` in an array, `\hdashline`). */
  dashed?: true;
}

/**
 * A piece KaTeX draws as an SVG path: a surd, a stretchy delimiter, a brace, a wide accent, an arrow
 * or a cancel stroke. Its path data is KaTeX's own, in the units of its view box, fitted into the
 * piece's box as SVG's `preserveAspectRatio` says.
 */
export interface MathPath {
  /** The path data, `d`, in the view box's units; a piece of several paths joins them. */
  d: string;
  x: number;
  /** Its top edge. */
  y: number;
  width: number;
  height: number;
  viewBox: { x: number; y: number; width: number; height: number };
  /** As SVG's attribute, such as `xMinYMin slice` or `none`. */
  preserveAspectRatio: string;
}

/** A formula laid out: what to draw and the box it takes. */
export interface MathDrawing {
  /** How far it advances the line, in ems. */
  width: number;
  /** How far it reaches above its baseline, in ems. */
  height: number;
  /** How far it reaches below its baseline, in ems. */
  depth: number;
  glyphs: MathGlyph[];
  rules: MathRule[];
  paths: MathPath[];
  /** Every font its glyphs use, so that what draws it can install them before the first frame. */
  fonts: MathFont[];
}

/** What typesetting a formula gives: its drawing, or why it is drawn as its TeX. */
export type TypesetMath =
  | { ok: true; drawing: MathDrawing }
  /** KaTeX's message, or ours for a refused command, a formula too long or a construct not laid out. */
  | { ok: false; error: string };

export interface TypesetOptions {
  /** True for a block of its own, or `$$…$$` within a line: display style, centered when a block. */
  display: boolean;
}
