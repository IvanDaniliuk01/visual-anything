/**
 * A name broken into the lines it is written on, in widths of its own (ADR 0088): wrapped at spaces,
 * a word too wide broken where it reaches the width, the last line kept ending in "…" past the lines
 * it may take, or on one line cut with "…". Pure; it measures with the function it is given.
 */
import type { FontVariant, Measure } from '../text/layout';

const ELLIPSIS = '…';

/** A name broken into lines, each with its width, and whether some of it was left out. */
export interface NameLines {
  lines: string[];
  widths: number[];
  cut: boolean;
}

/**
 * A name's lines: wrapped at spaces to `width`, a word wider than it broken where it reaches it, at
 * most `most` lines, the last one kept ending in "…" when some is left out; without `wrap`, one line
 * cut with "…".
 */
export function nameLinesOf(
  name: string,
  width: number,
  look: { variant: FontVariant; size: number },
  measure: Measure,
  most = Infinity,
  wrap = true,
): NameLines {
  const widthOf = (text: string) => measure(text, look.variant, look.size);
  const words = name.split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return { lines: [], widths: [], cut: false };
  if (!wrap || most <= 1) {
    const whole = words.join(' ');
    const line = cutToWidth(whole, width, widthOf);
    return { lines: [line], widths: [widthOf(line)], cut: line !== whole };
  }
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const longer = line === '' ? word : `${line} ${word}`;
    if (widthOf(longer) <= width) {
      line = longer;
      continue;
    }
    if (line !== '') lines.push(line);
    // A word too wide for a line of its own is broken where it reaches the width.
    let rest = word;
    while (widthOf(rest) > width) {
      let piece = '';
      for (const character of rest) {
        if (piece !== '' && widthOf(piece + character) > width) break;
        piece += character;
      }
      lines.push(piece);
      rest = rest.slice(piece.length);
    }
    line = rest;
  }
  if (line !== '') lines.push(line);
  if (lines.length <= most) return { lines, widths: lines.map(widthOf), cut: false };
  const kept = lines.slice(0, Math.max(1, most));
  const last = kept.length - 1;
  kept[last] = withEllipsis(kept[last] as string, width, widthOf);
  return { lines: kept, widths: kept.map(widthOf), cut: true };
}

/** A text cut with "…" to `width`; itself when it fits. */
function cutToWidth(text: string, width: number, widthOf: (text: string) => number): string {
  return widthOf(text) <= width ? text : withEllipsis(text, width, widthOf);
}

/** A line that ends in "…", taking characters from its end until it fits `width`. */
function withEllipsis(line: string, width: number, widthOf: (text: string) => number): string {
  let kept = line.trimEnd();
  while (kept !== '' && widthOf(`${kept}${ELLIPSIS}`) > width) kept = kept.slice(0, -1).trimEnd();
  return `${kept}${ELLIPSIS}`;
}
