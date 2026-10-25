/**
 * Laying out the texts an exported drawing writes, as the canvas lays out its labels: wrapped to the
 * width a shape gives them, cut with "…" to the room it gives them, and left out when not even one
 * line fits. Widths are Roboto's, with a margin for the system fonts browsers draw in (`measure.ts`).
 *
 * Each line is placed by its baseline, worked out here, so that a browser and the PDF writer, which
 * measure fonts differently, put every line in the same place.
 */
import { textWidth } from './measure';

/** How tall a line is, in ems: about what the app's fonts take with their ascent and descent. */
export const LINE_HEIGHT = 1.25;

/**
 * How far below the middle of its line a line's baseline lies, in ems, so that the letters look
 * centred on it in the app's fonts.
 */
export const BASELINE_BELOW_MIDDLE = 0.35;

const ELLIPSIS = '…';

/** What a text block is, before it is laid out. */
export interface TextSpec {
  text: string;
  size: number;
  bold?: boolean;
  /** Where the block lines up across: its left, its middle or its right lies at `x`. */
  x: number;
  align: 'start' | 'middle' | 'end';
  /** Where the block lies down: its top, its middle or its bottom lies at `y`. */
  y: number;
  anchor: 'top' | 'middle' | 'bottom';
  /** The widest a line may be; absent, the text is one line, its line breaks become spaces. */
  wrap?: number;
  /** The tallest the block may be: lines past it go, and the last one kept ends in "…". */
  room?: number;
}

/** A line laid out: its text and its baseline. */
export interface TextLine {
  text: string;
  baseline: number;
}

/** A text laid out: its lines, none when not even one fits its room. */
export interface LaidOutText {
  lines: TextLine[];
  /** How tall a line is. */
  lineHeight: number;
}

/** Lays out a text: wrapped, cut to its room, each line with its baseline. */
export function layOutText(spec: TextSpec): LaidOutText {
  const lineHeight = spec.size * LINE_HEIGHT;
  let lines =
    spec.wrap === undefined
      ? [oneLine(spec.text)]
      : wrapText(spec.text, spec.wrap, spec.size, spec.bold ?? false);
  lines = lines.length === 0 ? [''] : lines;
  if (spec.room !== undefined) {
    // A little leeway, so that a room of exactly one line holds it.
    const most = Math.floor(spec.room / lineHeight + 1e-6);
    if (most < 1) return { lines: [], lineHeight };
    if (lines.length > most) {
      const kept = lines.slice(0, most);
      const last = kept[most - 1] as string;
      kept[most - 1] = withEllipsis(last, spec.wrap, spec.size, spec.bold ?? false);
      lines = kept;
    }
  }
  if (lines.every((line) => line === '')) return { lines: [], lineHeight };
  const height = lines.length * lineHeight;
  const top =
    spec.anchor === 'top'
      ? spec.y
      : spec.anchor === 'bottom'
        ? spec.y - height
        : spec.y - height / 2;
  return {
    lineHeight,
    lines: lines.map((text, at) => ({
      text,
      baseline: top + at * lineHeight + lineHeight / 2 + BASELINE_BELOW_MIDDLE * spec.size,
    })),
  };
}

/** A text on one line: its line breaks and runs of white space become single spaces. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * A text wrapped to a width, as the canvas wraps labels: its own line breaks kept, words kept whole
 * where they fit, and a word wider than the width broken where it reaches it.
 */
export function wrapText(text: string, width: number, size: number, bold = false): string[] {
  const fits = (line: string) => textWidth(line, size, bold) <= width;
  const lines: string[] = [];
  for (const paragraph of text.split(/\r\n|\r|\n/)) {
    const words = paragraph.split(/[ \t\f\v]+/).filter((word) => word !== '');
    let line = '';
    for (const word of words) {
      const joined = line === '' ? word : `${line} ${word}`;
      if (fits(joined)) {
        line = joined;
        continue;
      }
      if (line !== '') lines.push(line);
      // A word too wide for a line of its own is broken where it reaches the width.
      let rest = word;
      while (!fits(rest)) {
        let cut = '';
        for (const character of rest) {
          if (!fits(cut + character) && cut !== '') break;
          cut += character;
        }
        lines.push(cut);
        rest = rest.slice(cut.length);
        if (rest === '') break;
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

/** A line that ends in "…", within `width` when given. */
function withEllipsis(
  line: string,
  width: number | undefined,
  size: number,
  bold: boolean,
): string {
  let kept = line.trimEnd();
  if (width === undefined) return `${kept}${ELLIPSIS}`;
  while (kept !== '' && textWidth(`${kept}${ELLIPSIS}`, size, bold) > width) {
    kept = [...kept].slice(0, -1).join('').trimEnd();
  }
  return `${kept}${ELLIPSIS}`;
}
