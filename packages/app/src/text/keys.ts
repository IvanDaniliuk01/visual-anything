/**
 * The editor keys of text emphasis (ADR 0082): Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Shift+X, Ctrl+E and
 * Ctrl+Shift+H, with ⌘ on a Mac, wrap the selection in markers or take them away. The field edits
 * the source, markers and all; the text is drawn from it once it is committed.
 */

/** A mark the keys put on a selection or take away from it. */
export type EmphasisMark = 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'highlight';

/** The markers each mark is written with. */
export const MARKERS: Readonly<Record<EmphasisMark, string>> = {
  bold: '**',
  italic: '*',
  underline: '++',
  strike: '~~',
  code: '`',
  highlight: '==',
};

/** What a key press asks for, if it is one of the keys of text emphasis. */
export function emphasisKeyOf(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): EmphasisMark | undefined {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return undefined;
  const key = event.key.toLowerCase();
  if (event.shiftKey) {
    if (key === 'x') return 'strike';
    if (key === 'h') return 'highlight';
    return undefined;
  }
  if (key === 'b') return 'bold';
  if (key === 'i') return 'italic';
  if (key === 'u') return 'underline';
  if (key === 'e') return 'code';
  return undefined;
}

/** A text with its selection, after a key of text emphasis. */
export interface ToggledText {
  text: string;
  start: number;
  end: number;
}

/**
 * Wraps the selection from `start` to `end` in a mark's markers, or takes them away when they are
 * already around it or at its ends. The spaces at the selection's ends stay outside the markers, so
 * that the markers flank its words as the reader needs them to. With nothing selected, the cursor
 * goes between the new markers.
 */
export function toggleEmphasis(
  text: string,
  start: number,
  end: number,
  mark: EmphasisMark,
): ToggledText {
  let from = Math.max(0, Math.min(start, end));
  let to = Math.min(text.length, Math.max(start, end));
  while (from < to && /\s/.test(text[from]!)) from++;
  while (to > from && /\s/.test(text[to - 1]!)) to--;
  const marker = MARKERS[mark];
  const size = marker.length;
  const char = marker[0]!;

  const around = Math.min(runBefore(text, from, char, 0), runAfter(text, to, char, text.length));
  if (holds(mark, around)) {
    return {
      text: text.slice(0, from - size) + text.slice(from, to) + text.slice(to + size),
      start: from - size,
      end: to - size,
    };
  }
  if (to - from >= 2 * size) {
    const inside = Math.min(runAfter(text, from, char, to), runBefore(text, to, char, from));
    if (holds(mark, inside) && 2 * inside <= to - from) {
      return {
        text: text.slice(0, from) + text.slice(from + size, to - size) + text.slice(to),
        start: from,
        end: to - 2 * size,
      };
    }
  }
  return {
    text: text.slice(0, from) + marker + text.slice(from, to) + marker + text.slice(to),
    start: from + size,
    end: to + size,
  };
}

/** Whether `count` of a mark's character on each side hold that mark. */
function holds(mark: EmphasisMark, count: number): boolean {
  if (mark === 'italic') return count === 1 || count >= 3;
  return count >= MARKERS[mark].length;
}

/** How many of `char` come right before `at`, down to `limit`. */
function runBefore(text: string, at: number, char: string, limit: number): number {
  let count = 0;
  while (at - count > limit && text[at - count - 1] === char) count++;
  return count;
}

/** How many of `char` come from `at` on, up to `limit`. */
function runAfter(text: string, at: number, char: string, limit: number): number {
  let count = 0;
  while (at + count < limit && text[at + count] === char) count++;
  return count;
}
