/**
 * Laying out text emphasis (ADR 0082) for drawing: runs and blocks, as the core reads them, broken
 * into lines of pieces, each placed and in its font variant, with the bands drawn behind, under or
 * through them. It is pure and measures with the function it is given, so that the canvas lays out
 * with its bitmap fonts' advances and the exports with Roboto's widths, by the same rules.
 *
 * - A detail is one paragraph (`layOutRuns`): it wraps at spaces, across runs, to its width, and stops
 *   at its lines, the last one ending in "…".
 * - A note, a caption or a description takes blocks (`layOutBlocks`): headings at three sizes, lists
 *   with their markers, task boxes, quotes with a bar, rules, code blocks on their back and tables in
 *   columns. It stops at its height.
 *
 * Every band belongs to a line, so that a line cut takes its bands with it. Positions are from the
 * top left of the text's box; a centred line is centred in the box's width.
 */
import type { EmphasisBlock, EmphasisItem, EmphasisRun, TableAlign } from '@visual-anything/core';

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

/** A part of a line drawn in one font variant and size. */
export interface LaidPiece {
  text: string;
  /** Where it starts, from the box's left. */
  x: number;
  variant: FontVariant;
  size: number;
}

/**
 * What is drawn behind, under or through text, or beside it:
 * - `highlight` and `code`, behind a run, in the backs of `emphasisBacks`;
 * - `underline`, `strike`, `rule`, `bar` (a quote's) and `box` (a task's, twice when done), in the
 *   text's color.
 */
export type BandKind = 'highlight' | 'code' | 'underline' | 'strike' | 'rule' | 'bar' | 'box';

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
  /** Whether some of the text was left out, past its lines or its height. */
  cut: boolean;
}

export interface LayoutOptions {
  measure: Measure;
  /** The size of its body text. */
  size: number;
  /** The widest a line may be. */
  width: number;
  align: 'left' | 'center';
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

/** Lays out the runs of one paragraph, as a detail is drawn. */
export function layOutRuns(runs: readonly EmphasisRun[], options: LayoutOptions): LaidText {
  const lines: LaidLine[] = [];
  const cut = paragraph(
    runs,
    { ...options, x: 0, top: 0, size: options.size },
    lines,
    options.maxLines,
  );
  aligned(lines, options);
  return finished(lines, cut);
}

/** Lays out the blocks of a text of several lines, as a note is drawn. */
export function layOutBlocks(blocks: readonly EmphasisBlock[], options: LayoutOptions): LaidText {
  const lines: LaidLine[] = [];
  const state: BlockState = { measure: options.measure, size: options.size, lines, y: 0 };
  blocksAt(blocks, state, 0, options.width, 0);
  aligned(lines, options);
  let cut = false;
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

/** Centres each line in the width, with its bands. */
function aligned(lines: readonly LaidLine[], options: LayoutOptions): void {
  if (options.align !== 'center') return;
  for (const line of lines) {
    const shift = (options.width - line.width) / 2 - (line.pieces[0]?.x ?? 0);
    if (shift === 0) continue;
    for (const piece of line.pieces) piece.x += shift;
    for (const band of line.bands) band.x += shift;
  }
}

/** A part of a word in one run. */
interface Fragment {
  text: string;
  run: EmphasisRun;
  variant: FontVariant;
}

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
}

/**
 * Breaks runs into lines, appended to `lines`: at spaces, across runs, and at the line breaks a text
 * of several lines keeps. Answers whether it stopped at `maxLines` with text left.
 */
function paragraph(
  runs: readonly EmphasisRun[],
  at: ParagraphAt,
  lines: LaidLine[],
  maxLines = Infinity,
): boolean {
  const { measure, size } = at;
  const lineHeight = size * (at.lineHeight ?? LINE_HEIGHT);
  const widthOf = (fragment: Fragment) => measure(fragment.text, fragment.variant, size);
  let current: Fragment[] = [];
  let currentWidth = 0;
  let count = 0;
  let pendingSpace: Fragment | undefined;
  let word: Fragment[] = [];
  let first = true;
  let stopped = false;

  const push = (): boolean => {
    if (count >= maxLines) {
      stopped = true;
      return false;
    }
    const top = at.top + count * lineHeight;
    const line = lineOf(current, at, top, lineHeight, first ? at.lead : undefined);
    if (first && at.leadBands) {
      for (const band of at.leadBands) line.bands.push({ ...band, y: band.y + top });
    }
    lines.push(line);
    count += 1;
    first = false;
    current = [];
    currentWidth = 0;
    return true;
  };

  const placeWord = (): boolean => {
    if (word.length === 0) return true;
    const wordWidth = word.reduce((sum, fragment) => sum + widthOf(fragment), 0);
    const spaceWidth = pendingSpace && current.length > 0 ? widthOf(pendingSpace) : 0;
    if (current.length > 0 && currentWidth + spaceWidth + wordWidth > at.width + 1e-9) {
      if (!push()) return false;
    } else if (pendingSpace && current.length > 0) {
      current.push(pendingSpace);
      currentWidth += spaceWidth;
    }
    pendingSpace = undefined;
    // A word too wide for a line of its own is broken where it reaches the width.
    for (const fragment of word) {
      let rest = fragment.text;
      while (rest !== '') {
        const piece = { ...fragment, text: rest };
        const width = widthOf(piece);
        if (currentWidth + width <= at.width + 1e-9) {
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
    const variant = variantOf(at.bold ? { ...run, bold: true } : run);
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
        pendingSpace = { text: ' ', run, variant };
        continue;
      }
      word.push({ text: part, run, variant });
    }
  }
  if (!stopped && placeWord() && (current.length > 0 || first)) push();
  if (stopped) {
    const last = lines.at(-1);
    if (last) withEllipsis(last, measure, at.x + at.width);
  }
  return stopped;
}

/** The longest start of a text that fits in a width. */
function longestFitting(text: string, width: (text: string) => number, room: number): string {
  let fits = '';
  for (const character of text) {
    if (width(fits + character) > room + 1e-9) break;
    fits += character;
  }
  return fits;
}

/** A line of fragments: neighbours drawn alike become one piece; each run's bands come with it. */
function lineOf(
  fragments: readonly Fragment[],
  at: ParagraphAt,
  top: number,
  height: number,
  lead: readonly LaidPiece[] | undefined,
): LaidLine {
  const { measure, size } = at;
  const baseline = top + height / 2 + BASELINE_BELOW_MIDDLE * size;
  const pieces: LaidPiece[] = lead ? lead.map((piece) => ({ ...piece })) : [];
  const bands: LaidBand[] = [];
  let x = at.x;
  let last: { fragment: Fragment; piece: LaidPiece } | undefined;
  for (const fragment of fragments) {
    const width = measure(fragment.text, fragment.variant, size);
    if (
      last &&
      sameLook(last.fragment.run, fragment.run) &&
      last.piece.variant === fragment.variant
    ) {
      last.piece.text += fragment.text;
    } else {
      const piece = { text: fragment.text, x, variant: fragment.variant, size };
      pieces.push(piece);
      last = { fragment, piece };
    }
    bandsOf(fragment.run, x, width, top, height, baseline, size, bands);
    x += width;
  }
  const start = pieces[0]?.x ?? at.x;
  return { top, height, baseline, width: x - start, pieces, bands: merged(bands) };
}

function sameLook(a: EmphasisRun, b: EmphasisRun): boolean {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.code === b.code &&
    a.strike === b.strike &&
    a.underline === b.underline &&
    a.highlight === b.highlight &&
    a.link === b.link
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
    const last = [...out].reverse().find((each) => each.kind === band.kind);
    if (last && last.y === band.y && Math.abs(last.x + last.width - band.x) < 1e-6) {
      last.width += band.width;
    } else {
      out.push({ ...band });
    }
  }
  // Backs first, so that a renderer drawing in order puts them under what they are behind.
  const order: BandKind[] = ['highlight', 'code', 'underline', 'strike', 'rule', 'bar', 'box'];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

/** Ends a line in "…", taking characters from its end until it fits in `right`. */
function withEllipsis(line: LaidLine, measure: Measure, right: number): void {
  const last = line.pieces.at(-1);
  if (!last) return;
  const end = () => last.x + measure(last.text, last.variant, last.size);
  last.text = last.text.trimEnd();
  last.text += ELLIPSIS;
  while (end() > right + 1e-9 && last.text.length > ELLIPSIS.length) {
    last.text =
      [...last.text.slice(0, -ELLIPSIS.length)].slice(0, -1).join('').trimEnd() + ELLIPSIS;
  }
  const lineEnd = end();
  line.width = lineEnd - (line.pieces[0]?.x ?? 0);
  for (const band of line.bands) {
    if (band.x + band.width > lineEnd) band.width = Math.max(0, lineEnd - band.x);
  }
}

/** Where blocks are laid out, and what they add to. */
interface BlockState {
  measure: Measure;
  size: number;
  lines: LaidLine[];
  /** The top of the next block. */
  y: number;
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

function blockAt(
  block: EmphasisBlock,
  state: BlockState,
  x: number,
  width: number,
  depth: number,
): void {
  const { measure, size, lines } = state;
  const runsAt = (runs: readonly EmphasisRun[], at: Partial<ParagraphAt> = {}) => {
    const lineSize = at.size ?? size;
    const from = lines.length;
    paragraph(runs, { measure, size: lineSize, width, x, top: state.y, ...at }, lines);
    const added = lines.slice(from);
    state.y = added.length > 0 ? (added.at(-1) as LaidLine).top + lineSize * LINE_HEIGHT : state.y;
  };
  switch (block.kind) {
    case 'paragraph':
      runsAt(block.runs);
      return;
    case 'heading':
      runsAt(block.runs, { size: size * HEADING_SIZES[block.level], bold: true });
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
    paragraph(
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
    const added = lines.slice(from);
    state.y = added.length > 0 ? (added.at(-1) as LaidLine).top + lineSize * LINE_HEIGHT : state.y;
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

/** A table: each cell on one line, cut with "…" to its column, the head bold with a rule under it. */
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
    runs.reduce(
      (sum, run) => sum + measure(run.text, variantOf(bold ? { ...run, bold: true } : run), size),
      0,
    );
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
    let cellX = x;
    widths.forEach((cellRoom, column) => {
      const runs = (cells[column] ?? []).map((run) => (bold ? { ...run, bold: true } : run));
      const cellLines: LaidLine[] = [];
      paragraph(runs, { measure, size, width: Math.max(1, cellRoom), x: 0, top }, cellLines, 1);
      const laid = cellLines[0];
      if (laid) {
        const align: TableAlign = block.align[column] ?? 'none';
        const shift =
          align === 'right'
            ? cellRoom - laid.width
            : align === 'center'
              ? (cellRoom - laid.width) / 2
              : 0;
        for (const piece of laid.pieces) line.pieces.push({ ...piece, x: piece.x + cellX + shift });
        for (const band of laid.bands) line.bands.push({ ...band, x: band.x + cellX + shift });
      }
      cellX += cellRoom + gap;
    });
    line.width = cellX - gap - x;
    lines.push(line);
    state.y = top + lineHeight;
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
