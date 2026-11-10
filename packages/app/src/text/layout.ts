/**
 * Laying out text emphasis (ADR 0082) for drawing: runs and blocks, as the core reads them, broken
 * into lines of pieces, each placed and in its font variant, with the bands drawn behind, under or
 * through them. It is pure and measures with the function it is given, so that the canvas lays out
 * with its bitmap fonts' advances and the exports with Roboto's widths, by the same rules.
 *
 * - A detail is one paragraph (`layOutRuns`): it wraps at spaces, across runs, to its width, and stops
 *   at its lines or its height, the last line kept ending in "…".
 * - A note, a caption or a description takes blocks (`layOutBlocks`): headings at three sizes, lists
 *   with their markers, task boxes, quotes with a bar, rules, code blocks on their back, tables in
 *   columns and math blocks centered on lines of their own. It stops at its height.
 *
 * Math (ADR 0106) is typeset here, as text is laid out, never while a frame draws: a formula is a
 * piece of its own (`LaidPiece.math`), measured by its drawing's box at `MATH_EM` times its text's
 * size, and never broken. A line that holds one is as tall as its tallest formula; one wider than its
 * line is shrunk, down to 70 %, then cut, ending in "…", and the text counts as cut so that the hover
 * card shows it whole. Its rules are bands of kind `rule`; its glyphs and paths are drawn from its
 * drawing. A formula that fails is its TeX as written in Roboto Mono, with a dotted line under it.
 *
 * Every band belongs to a line, so that a line cut takes its bands with it. Positions are from the
 * top left of the text's box; a centred line is centred in the box's width.
 */
import {
  MATH_EM,
  MATH_LEAST_SCALE,
  MATH_LINE_GAP,
  typesetMath,
  warningDashes,
  type EmphasisBlock,
  type EmphasisItem,
  type EmphasisRun,
  type MathDrawing,
  type TableAlign,
} from '@visual-anything/core';

/** The fonts a run is drawn in. */
export type FontVariant = 'regular' | 'bold' | 'italic' | 'boldItalic' | 'mono';

/** How wide a text is in a font variant at a size. */
export type Measure = (text: string, variant: FontVariant, size: number) => number;

/**
 * How tall a line is, in ems, where the drawing defaults say nothing else: a paragraph laid out with
 * their `text.lineHeight` takes it in its place (ADR 0086).
 */
export const LINE_HEIGHT = 1.3;
/** How far below the middle of its line a line's baseline lies, in ems (`export/text-layout.ts`). */
export const BASELINE_BELOW_MIDDLE = 0.35;
const ELLIPSIS = '…';
const EPSILON = 1e-9;

/** A formula as a piece draws it (ADR 0106). */
export interface LaidMath {
  /** Its TeX, without delimiters, and its style. */
  tex: string;
  display: boolean;
  drawing: MathDrawing;
  /** An em of its drawing, in units: `MATH_EM` times its text's size, times `scale`. */
  size: number;
  /** How much it was shrunk to fit its line: 1 when it was not, never under 0.7. */
  scale: number;
  /** Set when it was cut: how much of its width is drawn, from the piece's `x`; the rest is not. */
  clip?: number;
}

/** A part of a line drawn in one font variant and size. */
export interface LaidPiece {
  /** Its characters; for a formula, its TeX as written, delimiters and all, as text reads it. */
  text: string;
  /** Where it starts, from the box's left. */
  x: number;
  variant: FontVariant;
  size: number;
  /** Set on a formula: drawn from its drawing on the line's baseline, in place of `text`. */
  math?: LaidMath;
}

/**
 * What is drawn behind, under or through text, or beside it:
 * - `highlight` and `code`, behind a run, in the backs of `emphasisBacks`;
 * - `underline`, `strike`, `rule` (a note's rule and a formula's lines), `bar` (a quote's), `box` (a
 *   task's, twice when done) and `warning` (a dash of the dotted line under a formula that failed),
 *   in the text's color.
 */
export type BandKind =
  'highlight' | 'code' | 'underline' | 'strike' | 'rule' | 'bar' | 'box' | 'warning';

export interface LaidBand {
  kind: BandKind;
  x: number;
  y: number;
  width: number;
  height: number;
  /** For a box: drawn as an outline of this width rather than filled. */
  outline?: number;
}

export interface LaidLine {
  top: number;
  height: number;
  /** Where its letters stand. */
  baseline: number;
  /** How wide its text is, from its first piece's start to its last one's end. */
  width: number;
  pieces: LaidPiece[];
  bands: LaidBand[];
}

export interface LaidText {
  lines: LaidLine[];
  /** From the first line's top to the last one's bottom. */
  height: number;
  /** The widest line. */
  width: number;
  /**
   * Whether some of the text was left out, past its lines or its height, or a formula was shrunk or
   * cut to fit its line: the hover card then shows the whole.
   */
  cut: boolean;
}

export interface LayoutOptions {
  measure: Measure;
  /** The size of its body text. */
  size: number;
  /** The widest a line may be. */
  width: number;
  /** Right, for a shape's detail whose text aligns it so (ADR 0088). */
  align: 'left' | 'center' | 'right';
  /** The most lines it takes: past them it ends in "…". */
  maxLines?: number;
  /** The tallest it may be: lines past it go, and the last one kept ends in "…". */
  maxHeight?: number;
  /** How tall a line of a paragraph is, in ems: `LINE_HEIGHT` unless given. */
  lineHeight?: number;
}

/** The font variant a run is drawn in: code is monospace whatever else it takes. */
export function variantOf(run: Pick<EmphasisRun, 'bold' | 'italic' | 'code'>): FontVariant {
  if (run.code) return 'mono';
  if (run.bold) return run.italic ? 'boldItalic' : 'bold';
  return run.italic ? 'italic' : 'regular';
}

/** The text of a line, its pieces one after the other. */
export function lineText(line: LaidLine): string {
  return line.pieces.map((piece) => piece.text).join('');
}

/** Whether a text holds a formula, typeset or not: its fonts are then wanted. */
export function holdsMath(laid: LaidText): boolean {
  return laid.lines.some((line) => line.pieces.some((piece) => piece.math !== undefined));
}

/** Lays out the runs of one paragraph, as a detail is drawn. */
export function layOutRuns(runs: readonly EmphasisRun[], options: LayoutOptions): LaidText {
  const lines: LaidLine[] = [];
  const cut = paragraph(
    runs,
    {
      ...options,
      x: 0,
      top: 0,
      size: options.size,
      ...(options.maxHeight === undefined ? {} : { maxHeight: options.maxHeight }),
    },
    lines,
    options.maxLines,
  );
  aligned(lines, options);
  return finished(lines, cut);
}

/** Lays out the blocks of a text of several lines, as a note is drawn. */
export function layOutBlocks(blocks: readonly EmphasisBlock[], options: LayoutOptions): LaidText {
  const lines: LaidLine[] = [];
  const state: BlockState = {
    measure: options.measure,
    size: options.size,
    lines,
    y: 0,
    shrunk: false,
  };
  blocksAt(blocks, state, 0, options.width, 0);
  aligned(lines, options);
  let cut = state.shrunk;
  if (options.maxHeight !== undefined) {
    const kept = lines.filter((line) => line.top + line.height <= options.maxHeight! + 1e-6);
    if (kept.length < lines.length) {
      cut = true;
      lines.length = kept.length;
      const last = lines.at(-1);
      if (last) withEllipsis(last, options.measure, options.width);
    }
  }
  return finished(lines, cut);
}

function finished(lines: LaidLine[], cut: boolean): LaidText {
  const last = lines.at(-1);
  const first = lines[0];
  return {
    lines,
    height: first && last ? last.top + last.height - first.top : 0,
    width: lines.reduce((widest, line) => Math.max(widest, line.width), 0),
    cut,
  };
}

/** Centres each line in the width, or sets it against its right, with its bands. */
function aligned(lines: readonly LaidLine[], options: LayoutOptions): void {
  if (options.align === 'left') return;
  const share = options.align === 'center' ? 0.5 : 1;
  for (const line of lines) {
    const shift = (options.width - line.width) * share - (line.pieces[0]?.x ?? 0);
    if (shift === 0) continue;
    for (const piece of line.pieces) piece.x += shift;
    for (const band of line.bands) band.x += shift;
  }
}

/** A formula typeset, as a fragment holds it. */
interface FragmentMath {
  tex: string;
  display: boolean;
  drawing: MathDrawing;
  /** How much it is shrunk, once placed. */
  scale: number;
  /** Set once placed and cut. */
  clip?: number;
}

/** A part of a word in one run, or a formula. */
interface Fragment {
  text: string;
  run: EmphasisRun;
  variant: FontVariant;
  math?: FragmentMath;
  /** The TeX of a formula that failed: drawn with a dotted line under it. */
  failed?: boolean;
}

/** The run an ellipsis after a formula cut is written in. */
const ELLIPSIS_RUN: EmphasisRun = plainRun(ELLIPSIS);

/** What a paragraph is laid out with: where its lines start, and at what size. */
interface ParagraphAt {
  measure: Measure;
  size: number;
  width: number;
  x: number;
  top: number;
  /** A variant every run takes as well, as a heading takes bold. */
  bold?: boolean;
  /** The pieces a first line starts with, as a list item's marker. */
  lead?: LaidPiece[];
  leadBands?: LaidBand[];
  /** How tall a line is, in ems: `LINE_HEIGHT` unless given. */
  lineHeight?: number | undefined;
  /** The lowest a line may reach: a line past it is left out, and the paragraph stops. */
  maxHeight?: number;
}

/** How wide a fragment is: a formula by its drawing's box at its scale, or as far as it is cut. */
function fragmentWidth(fragment: Fragment, measure: Measure, size: number): number {
  const { math } = fragment;
  if (math === undefined) return measure(fragment.text, fragment.variant, size);
  return math.clip ?? math.drawing.width * size * MATH_EM * math.scale;
}

/**
 * Breaks runs into lines, appended to `lines`: at spaces, across runs, and at the line breaks a text
 * of several lines keeps. Answers whether it was cut: stopped at `maxLines` or `maxHeight` with text
 * left, or a formula shrunk or cut to fit.
 */
function paragraph(
  runs: readonly EmphasisRun[],
  at: ParagraphAt,
  lines: LaidLine[],
  maxLines = Infinity,
): boolean {
  const { measure, size } = at;
  const lineHeight = size * (at.lineHeight ?? LINE_HEIGHT);
  const widthOf = (fragment: Fragment) => fragmentWidth(fragment, measure, size);
  let current: Fragment[] = [];
  let currentWidth = 0;
  let count = 0;
  /** How much taller than `lineHeight` each the lines so far are, for lines holding formulas. */
  let grown = 0;
  let pendingSpace: Fragment | undefined;
  let word: Fragment[] = [];
  let first = true;
  let stopped = false;
  let shrunk = false;

  const push = (): boolean => {
    if (count >= maxLines) {
      stopped = true;
      return false;
    }
    // Placed as a line of text alone is, to the unit, unless lines before it grew.
    const top = grown === 0 ? at.top + count * lineHeight : at.top + count * lineHeight + grown;
    const line = lineOf(current, at, top, lineHeight, first ? at.lead : undefined);
    if (at.maxHeight !== undefined && line.top + line.height > at.maxHeight + 1e-6) {
      stopped = true;
      return false;
    }
    if (first && at.leadBands) {
      for (const band of at.leadBands) line.bands.push({ ...band, y: band.y + top });
    }
    lines.push(line);
    grown += line.height - lineHeight;
    count += 1;
    first = false;
    current = [];
    currentWidth = 0;
    return true;
  };

  /** Places a formula whole: after what is on the line, on a line of its own, or shrunk and cut. */
  const placeMath = (fragment: Fragment & { math: FragmentMath }): boolean => {
    const full = widthOf(fragment);
    if (current.length > 0 && currentWidth + full > at.width + EPSILON && !push()) return false;
    const room = at.width - currentWidth;
    if (full > room + EPSILON) {
      shrunk = true;
      fragment.math.scale = Math.max(MATH_LEAST_SCALE, room / full);
      const shrunkWidth = widthOf(fragment);
      if (shrunkWidth > room + EPSILON) {
        // Cut where an ellipsis after it still fits.
        const ellipsis = measure(ELLIPSIS, 'regular', size);
        fragment.math.clip = Math.max(0, room - ellipsis);
        current.push(fragment);
        currentWidth += widthOf(fragment);
        current.push({ text: ELLIPSIS, run: ELLIPSIS_RUN, variant: 'regular' });
        currentWidth += ellipsis;
        return true;
      }
    }
    current.push(fragment);
    currentWidth += widthOf(fragment);
    return true;
  };

  const placeWord = (): boolean => {
    if (word.length === 0) return true;
    const wordWidth = word.reduce((sum, fragment) => sum + widthOf(fragment), 0);
    const spaceWidth = pendingSpace && current.length > 0 ? widthOf(pendingSpace) : 0;
    if (current.length > 0 && currentWidth + spaceWidth + wordWidth > at.width + EPSILON) {
      if (!push()) return false;
    } else if (pendingSpace && current.length > 0) {
      current.push(pendingSpace);
      currentWidth += spaceWidth;
    }
    pendingSpace = undefined;
    // A word too wide for a line of its own is broken where it reaches the width; a formula in it
    // never is (ADR 0106).
    for (const fragment of word) {
      if (fragment.math) {
        if (!placeMath(fragment as Fragment & { math: FragmentMath })) return false;
        continue;
      }
      let rest = fragment.text;
      while (rest !== '') {
        const piece = { ...fragment, text: rest };
        const width = widthOf(piece);
        if (currentWidth + width <= at.width + EPSILON) {
          current.push(piece);
          currentWidth += width;
          break;
        }
        const room = at.width - currentWidth;
        const fits = longestFitting(rest, (text) => measure(text, fragment.variant, size), room);
        if (fits === '' && current.length === 0) {
          // Not even one character fits: it goes alone on its line.
          const one = [...rest][0] as string;
          current.push({ ...fragment, text: one });
          currentWidth += measure(one, fragment.variant, size);
          rest = rest.slice(one.length);
        } else {
          if (fits !== '') {
            current.push({ ...fragment, text: fits });
            currentWidth += measure(fits, fragment.variant, size);
          }
          rest = rest.slice(fits.length);
        }
        if (rest !== '' && !push()) return false;
      }
    }
    word = [];
    return true;
  };

  outer: for (const run of runs) {
    let variant = variantOf(at.bold ? { ...run, bold: true } : run);
    let failed = false;
    if (run.math) {
      const typeset = typesetMath(run.math.tex, { display: run.math.display });
      if (typeset.ok) {
        // A formula is a part of the word it touches, and is never split at its spaces.
        word.push({
          text: run.text,
          run,
          variant: 'regular',
          math: {
            tex: run.math.tex,
            display: run.math.display,
            drawing: typeset.drawing,
            scale: 1,
          },
        });
        continue;
      }
      // Drawn as its TeX as written, in Roboto Mono, with a dotted line under it.
      variant = 'mono';
      failed = true;
    }
    for (const part of run.text.split(/( +|\n)/)) {
      if (part === '') continue;
      if (part === '\n') {
        if (!placeWord()) break outer;
        pendingSpace = undefined;
        if (!push()) break outer;
        continue;
      }
      if (part.startsWith(' ')) {
        if (!placeWord()) break outer;
        pendingSpace = { text: ' ', run, variant, ...(failed ? { failed } : {}) };
        continue;
      }
      word.push({ text: part, run, variant, ...(failed ? { failed } : {}) });
    }
  }
  if (!stopped && placeWord() && (current.length > 0 || first)) push();
  if (stopped) {
    const last = lines.at(-1);
    if (last) withEllipsis(last, measure, at.x + at.width);
  }
  return stopped || shrunk;
}

/** The longest start of a text that fits in a width. */
function longestFitting(text: string, width: (text: string) => number, room: number): string {
  let fits = '';
  for (const character of text) {
    if (width(fits + character) > room + EPSILON) break;
    fits += character;
  }
  return fits;
}

/**
 * A line of fragments: neighbours drawn alike become one piece; each run's bands come with it. A
 * line that holds a formula taller than its text grows to hold it and a gap above and below.
 */
function lineOf(
  fragments: readonly Fragment[],
  at: ParagraphAt,
  top: number,
  height: number,
  lead: readonly LaidPiece[] | undefined,
): LaidLine {
  const { measure, size } = at;
  const textAbove = height / 2 + BASELINE_BELOW_MIDDLE * size;
  let above = textAbove;
  let below = height - textAbove;
  for (const fragment of fragments) {
    const { math } = fragment;
    if (!math) continue;
    const em = size * MATH_EM * math.scale;
    above = Math.max(above, math.drawing.height * em + MATH_LINE_GAP * size);
    below = Math.max(below, math.drawing.depth * em + MATH_LINE_GAP * size);
  }
  const grew = above !== textAbove || below !== height - textAbove;
  const lineHeight = grew ? above + below : height;
  const baseline = grew ? top + above : top + height / 2 + BASELINE_BELOW_MIDDLE * size;
  const pieces: LaidPiece[] = lead ? lead.map((piece) => ({ ...piece })) : [];
  const bands: LaidBand[] = [];
  let x = at.x;
  let last: { fragment: Fragment; piece: LaidPiece } | undefined;
  for (const fragment of fragments) {
    const width = fragmentWidth(fragment, measure, size);
    const { math } = fragment;
    if (math) {
      const em = size * MATH_EM * math.scale;
      const piece: LaidPiece = {
        text: fragment.text,
        x,
        variant: 'regular',
        size,
        math: {
          tex: math.tex,
          display: math.display,
          drawing: math.drawing,
          size: em,
          scale: math.scale,
          ...(math.clip === undefined ? {} : { clip: math.clip }),
        },
      };
      pieces.push(piece);
      last = undefined;
      bands.push(...mathRuleBands(math.drawing, x, baseline, em, math.clip));
      x += width;
      continue;
    }
    if (last && sameLook(last.fragment, fragment) && last.piece.variant === fragment.variant) {
      last.piece.text += fragment.text;
    } else {
      const piece = { text: fragment.text, x, variant: fragment.variant, size };
      pieces.push(piece);
      last = { fragment, piece };
    }
    if (fragment.failed) {
      for (const dash of warningDashes(width, size)) {
        bands.push({
          kind: 'warning',
          x: x + dash.x,
          y: baseline + size * 0.18,
          width: dash.width,
          height: Math.max(1, size / 14) * 1.5,
        });
      }
    } else bandsOf(fragment.run, x, width, top, height, baseline, size, bands);
    x += width;
  }
  const start = pieces[0]?.x ?? at.x;
  return { top, height: lineHeight, baseline, width: x - start, pieces, bands: merged(bands) };
}

/**
 * The bands a formula's rules are drawn as (fraction lines, overlines, borders and separators), from
 * its left at `x` on `baseline`, an em of its drawing `size` units, as far as `clip` when it was cut.
 * A dashed rule is its dashes, each three times as long as the rule is thick, with gaps as long.
 */
export function mathRuleBands(
  drawing: MathDrawing,
  x: number,
  baseline: number,
  size: number,
  clip?: number,
): LaidBand[] {
  const bands: LaidBand[] = [];
  const right = clip === undefined ? Infinity : x + clip;
  const add = (left: number, top: number, width: number, height: number) => {
    const shown = Math.min(width, right - left);
    if (shown > 0 && height > 0)
      bands.push({ kind: 'rule', x: left, y: top, width: shown, height });
  };
  for (const rule of drawing.rules) {
    const left = x + rule.x * size;
    const top = baseline + rule.y * size;
    const width = rule.width * size;
    const height = rule.height * size;
    if (!rule.dashed) {
      add(left, top, width, height);
      continue;
    }
    const across = width >= height;
    const length = across ? width : height;
    const dash = 3 * Math.max(1e-3, across ? height : width);
    for (let at = 0; at < length && bands.length < 2_000; at += 2 * dash) {
      const piece = Math.min(dash, length - at);
      if (across) add(left + at, top, piece, height);
      else add(left, top + at, width, piece);
    }
  }
  return bands;
}

function sameLook(a: Fragment, b: Fragment): boolean {
  const [one, other] = [a.run, b.run];
  return (
    a.failed === b.failed &&
    one.bold === other.bold &&
    one.italic === other.italic &&
    one.code === other.code &&
    one.strike === other.strike &&
    one.underline === other.underline &&
    one.highlight === other.highlight &&
    one.link === other.link
  );
}

/** The bands a run's part takes, from `x` over `width`. */
function bandsOf(
  run: EmphasisRun,
  x: number,
  width: number,
  top: number,
  height: number,
  baseline: number,
  size: number,
  bands: LaidBand[],
): void {
  const back = { x, y: top + (height - size * 1.2) / 2, width, height: size * 1.2 };
  if (run.highlight) bands.push({ kind: 'highlight', ...back });
  if (run.code) bands.push({ kind: 'code', ...back });
  const thickness = Math.max(1, size / 14);
  if (run.underline || run.link !== undefined) {
    bands.push({ kind: 'underline', x, y: baseline + size * 0.12, width, height: thickness });
  }
  if (run.strike) {
    bands.push({ kind: 'strike', x, y: baseline - size * 0.3, width, height: thickness });
  }
}

/** Bands of one kind that touch on one line become one. */
function merged(bands: readonly LaidBand[]): LaidBand[] {
  const out: LaidBand[] = [];
  for (const band of bands) {
    const last = band.kind === 'rule' ? undefined : lastOfKind(out, band.kind);
    if (last && last.y === band.y && Math.abs(last.x + last.width - band.x) < 1e-6) {
      last.width += band.width;
    } else {
      out.push({ ...band });
    }
  }
  // Backs first, so that a renderer drawing in order puts them under what they are behind.
  const order: BandKind[] = [
    'highlight',
    'code',
    'underline',
    'strike',
    'rule',
    'bar',
    'box',
    'warning',
  ];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

function lastOfKind(bands: readonly LaidBand[], kind: BandKind): LaidBand | undefined {
  for (let at = bands.length - 1; at >= 0; at--) {
    if (bands[at]!.kind === kind) return bands[at];
  }
  return undefined;
}

/**
 * Ends a line in "…", taking characters from its end until it fits in `right`. A formula is never
 * broken: one at the line's end is cut where the ellipsis starts, or left out when none of it shows.
 */
function withEllipsis(line: LaidLine, measure: Measure, right: number): void {
  let last = line.pieces.at(-1);
  if (!last) return;
  if (last.math) {
    const ellipsis = measure(ELLIPSIS, 'regular', last.size);
    const math = last.math;
    const shown = math.clip ?? math.drawing.width * math.size;
    const room = right - ellipsis - last.x;
    if (shown > room + EPSILON) {
      if (room > EPSILON) math.clip = room;
      else line.pieces.pop();
    }
    const kept = line.pieces.at(-1);
    const from = kept ? pieceEnd(kept, measure) : (line.pieces[0]?.x ?? 0);
    const piece: LaidPiece = { text: ELLIPSIS, x: from, variant: 'regular', size: last.size };
    line.pieces.push(piece);
    last = piece;
  } else {
    const piece = last;
    const end = () => piece.x + measure(piece.text, piece.variant, piece.size);
    piece.text = piece.text.trimEnd();
    piece.text += ELLIPSIS;
    while (end() > right + EPSILON && piece.text.length > ELLIPSIS.length) {
      piece.text =
        [...piece.text.slice(0, -ELLIPSIS.length)].slice(0, -1).join('').trimEnd() + ELLIPSIS;
    }
  }
  const lineEnd = pieceEnd(last, measure);
  line.width = lineEnd - (line.pieces[0]?.x ?? 0);
  for (const band of line.bands) {
    if (band.x + band.width > lineEnd) band.width = Math.max(0, lineEnd - band.x);
  }
}

/** Where a piece ends: a formula at its drawing's width, or as far as it was cut. */
function pieceEnd(piece: LaidPiece, measure: Measure): number {
  if (piece.math) return piece.x + (piece.math.clip ?? piece.math.drawing.width * piece.math.size);
  return piece.x + measure(piece.text, piece.variant, piece.size);
}

/** Where blocks are laid out, and what they add to. */
interface BlockState {
  measure: Measure;
  size: number;
  lines: LaidLine[];
  /** The top of the next block. */
  y: number;
  /** Whether a formula was shrunk or cut to fit its line. */
  shrunk: boolean;
}

const HEADING_SIZES = { 1: 1.5, 2: 1.3, 3: 1.15 } as const;
const BULLETS = ['•', '◦', '▪'];

/** Lays out blocks from `x`, `width` wide, `depth` lists deep, one under the other. */
function blocksAt(
  blocks: readonly EmphasisBlock[],
  state: BlockState,
  x: number,
  width: number,
  depth: number,
  bar?: (line: LaidLine) => void,
): void {
  const { size } = state;
  blocks.forEach((block, at) => {
    if (at > 0) state.y += size * 0.5;
    const from = state.lines.length;
    blockAt(block, state, x, width, depth);
    if (bar) for (const line of state.lines.slice(from)) bar(line);
  });
}

/** Where the next block starts after lines were added from `from`: under the last of them. */
function belowAdded(lines: readonly LaidLine[], from: number, y: number): number {
  const last = lines.length > from ? lines.at(-1) : undefined;
  return last ? last.top + last.height : y;
}

function blockAt(
  block: EmphasisBlock,
  state: BlockState,
  x: number,
  width: number,
  depth: number,
): void {
  const { measure, size, lines } = state;
  const runsAt = (runs: readonly EmphasisRun[], at: Partial<ParagraphAt> = {}) => {
    const from = lines.length;
    if (paragraph(runs, { measure, size, width, x, top: state.y, ...at }, lines)) {
      state.shrunk = true;
    }
    state.y = belowAdded(lines, from, state.y);
  };
  switch (block.kind) {
    case 'paragraph':
      runsAt(block.runs);
      return;
    case 'heading':
      runsAt(block.runs, { size: size * HEADING_SIZES[block.level], bold: true });
      return;
    case 'math':
      mathBlock(block.tex, state, x, width);
      return;
    case 'list':
      block.items.forEach((item, index) => {
        if (index > 0) state.y += size * 0.2;
        listItem(
          item,
          block.ordered ? `${block.start + index}.` : undefined,
          state,
          x,
          width,
          depth,
        );
      });
      return;
    case 'quote': {
      const indent = size;
      blocksAt(block.blocks, state, x + indent, Math.max(1, width - indent), depth, (line) => {
        line.bands.push({
          kind: 'bar',
          x: x + size * 0.15,
          y: line.top,
          width: size * 0.2,
          height: line.height,
        });
      });
      return;
    }
    case 'rule': {
      const height = size * LINE_HEIGHT * 0.6;
      const top = state.y;
      lines.push({
        top,
        height,
        baseline: top + height,
        width,
        pieces: [],
        bands: [{ kind: 'rule', x, y: top + height / 2, width, height: Math.max(1, size / 14) }],
      });
      state.y = top + height;
      return;
    }
    case 'code': {
      const pad = size * 0.4;
      for (const text of block.text.split('\n')) {
        const from = lines.length;
        const run = plainRun(text === '' ? ' ' : text, { code: true });
        paragraph(
          [run],
          { measure, size, width: Math.max(1, width - 2 * pad), x: x + pad, top: state.y },
          lines,
        );
        for (const line of lines.slice(from)) {
          // The whole block's width, rather than its text's, behind each of its lines.
          line.bands = [{ kind: 'code', x, y: line.top, width, height: line.height }];
          state.y = line.top + line.height;
        }
      }
      return;
    }
    case 'table':
      table(block, state, x, width);
      return;
  }
}

/**
 * A math block (ADR 0106): its formula in display style, centered on a line of its own, shrunk and
 * cut as a formula within a line is. One that fails is its TeX as typed, `$$` and all, in Roboto
 * Mono with a dotted line under it, wrapped as a paragraph.
 */
function mathBlock(tex: string, state: BlockState, x: number, width: number): void {
  const { measure, size, lines } = state;
  const run: EmphasisRun = { ...plainRun(`$$${tex}$$`), math: { tex, display: true } };
  const from = lines.length;
  if (paragraph([run], { measure, size, width, x, top: state.y }, lines)) state.shrunk = true;
  for (const line of lines.slice(from)) {
    if (!line.pieces.some((piece) => piece.math)) continue;
    const shift = (width - line.width) / 2 - ((line.pieces[0]?.x ?? x) - x);
    if (shift <= 0) continue;
    for (const piece of line.pieces) piece.x += shift;
    for (const band of line.bands) band.x += shift;
  }
  state.y = belowAdded(lines, from, state.y);
}

/** A list item: its marker, or its task box, then its blocks, indented. */
function listItem(
  item: EmphasisItem,
  number: string | undefined,
  state: BlockState,
  x: number,
  width: number,
  depth: number,
): void {
  const { measure, size, lines } = state;
  const indent = size * (number === undefined ? 1.2 : 1.8);
  const contentX = x + indent;
  const contentWidth = Math.max(1, width - indent);
  const marker = number ?? BULLETS[Math.min(depth, BULLETS.length - 1)] ?? '•';
  const lead: LaidPiece[] =
    item.checked === undefined ? [{ text: marker, x, variant: 'regular', size }] : [];
  const leadBands: LaidBand[] = [];
  if (item.checked !== undefined) {
    const side = size * 0.75;
    const lineHeight = size * LINE_HEIGHT;
    const box = { x, y: (lineHeight - side) / 2, width: side, height: side };
    leadBands.push({ kind: 'box', ...box, outline: Math.max(1, size / 12) });
    if (item.checked) {
      const inset = side * 0.25;
      leadBands.push({
        kind: 'box',
        x: box.x + inset,
        y: box.y + inset,
        width: side - 2 * inset,
        height: side - 2 * inset,
      });
    }
  }
  const [first, ...rest] = item.blocks;
  const from = lines.length;
  if (first && (first.kind === 'paragraph' || first.kind === 'heading')) {
    const lineSize = first.kind === 'heading' ? size * HEADING_SIZES[first.level] : size;
    const cut = paragraph(
      first.runs,
      {
        measure,
        size: lineSize,
        width: contentWidth,
        x: contentX,
        top: state.y,
        ...(first.kind === 'heading' ? { bold: true } : {}),
        lead,
        leadBands,
      },
      lines,
    );
    if (cut) state.shrunk = true;
    state.y = belowAdded(lines, from, state.y);
    if (rest.length > 0) {
      state.y += size * 0.2;
      blocksAt(rest, state, contentX, contentWidth, depth + 1);
    }
    return;
  }
  // An item that starts with another block, or holds none: its marker on a line of its own.
  paragraph(
    [],
    { measure, size, width: contentWidth, x: contentX, top: state.y, lead, leadBands },
    lines,
  );
  state.y += size * LINE_HEIGHT;
  if (item.blocks.length > 0) blocksAt(item.blocks, state, contentX, contentWidth, depth + 1);
}

/**
 * A table: each cell on one line, cut with "…" to its column, the head bold with a rule under it. A
 * row whose cells hold formulas is as tall as its tallest cell, its cells on one baseline.
 */
function table(
  block: Extract<EmphasisBlock, { kind: 'table' }>,
  state: BlockState,
  x: number,
  width: number,
): void {
  const { measure, size, lines } = state;
  const columns = block.head.length;
  if (columns === 0) return;
  const gap = size * 0.8;
  const cellWidth = (runs: readonly EmphasisRun[], bold: boolean) =>
    runs.reduce((sum, run) => {
      if (run.math) {
        const typeset = typesetMath(run.math.tex, { display: run.math.display });
        if (typeset.ok) return sum + typeset.drawing.width * size * MATH_EM;
        return sum + measure(run.text, 'mono', size);
      }
      return sum + measure(run.text, variantOf(bold ? { ...run, bold: true } : run), size);
    }, 0);
  const natural = block.head.map((cell, column) =>
    Math.max(
      cellWidth(cell, true),
      ...block.rows.map((row) => cellWidth(row[column] ?? [], false)),
      size,
    ),
  );
  const room = Math.max(columns, width - gap * (columns - 1));
  const total = natural.reduce((sum, each) => sum + each, 0);
  const widths = total <= room ? natural : natural.map((each) => (each * room) / total);
  const lineHeight = size * LINE_HEIGHT;
  const row = (cells: readonly (readonly EmphasisRun[])[], bold: boolean) => {
    const top = state.y;
    const line: LaidLine = {
      top,
      height: lineHeight,
      baseline: top + lineHeight / 2 + BASELINE_BELOW_MIDDLE * size,
      width: 0,
      pieces: [],
      bands: [],
    };
    const laidCells: { laid: LaidLine; cellX: number; shift: number }[] = [];
    let cellX = x;
    widths.forEach((cellRoom, column) => {
      const runs = (cells[column] ?? []).map((run) => (bold ? { ...run, bold: true } : run));
      const cellLines: LaidLine[] = [];
      if (paragraph(runs, { measure, size, width: Math.max(1, cellRoom), x: 0, top }, cellLines, 1))
        if (runs.some((run) => run.math)) state.shrunk = true;
      const laid = cellLines[0];
      if (laid) {
        const align: TableAlign = block.align[column] ?? 'none';
        const shift =
          align === 'right'
            ? cellRoom - laid.width
            : align === 'center'
              ? (cellRoom - laid.width) / 2
              : 0;
        laidCells.push({ laid, cellX, shift });
      }
      cellX += cellRoom + gap;
    });
    // Cells taller than a line, for their formulas, make the row taller, on one baseline.
    const above = Math.max(
      line.baseline - top,
      ...laidCells.map(({ laid }) => laid.baseline - laid.top),
    );
    const below = Math.max(
      top + lineHeight - line.baseline,
      ...laidCells.map(({ laid }) => laid.top + laid.height - laid.baseline),
    );
    if (above > line.baseline - top || below > top + lineHeight - line.baseline) {
      line.height = above + below;
      line.baseline = top + above;
    }
    for (const { laid, cellX: at, shift } of laidCells) {
      const down = line.baseline - laid.baseline;
      for (const piece of laid.pieces) line.pieces.push({ ...piece, x: piece.x + at + shift });
      for (const band of laid.bands) {
        line.bands.push({ ...band, x: band.x + at + shift, y: band.y + down });
      }
    }
    line.width = cellX - gap - x;
    lines.push(line);
    state.y = top + line.height;
    return line;
  };
  const head = row(block.head, true);
  head.bands.push({
    kind: 'rule',
    x,
    y: head.top + head.height - Math.max(1, size / 14),
    width: head.width,
    height: Math.max(1, size / 14),
  });
  for (const cells of block.rows) row(cells, false);
}

function plainRun(text: string, own: Partial<EmphasisRun> = {}): EmphasisRun {
  return {
    text,
    bold: false,
    italic: false,
    strike: false,
    underline: false,
    code: false,
    highlight: false,
    ...own,
  };
}
