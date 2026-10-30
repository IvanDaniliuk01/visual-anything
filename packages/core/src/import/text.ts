/**
 * Text as imports take it (ADR-0042): labels that may hold HTML become plain text, every name is one
 * line of at most `MAX_IMPORTED_NAME` characters, and what a report quotes is short. Nothing here
 * ever builds markup: tags are dropped, entities are decoded into the characters they stand for, and
 * the result is only ever shown as text.
 */
import { MAX_IMPORTED_NAME } from './reading';

/** The longest name an import gives an element, a relation or a view, in characters: every reader's. */
export { MAX_IMPORTED_NAME };

/** The longest description an import gives, in characters. */
export const MAX_IMPORTED_DESCRIPTION = 10_000;

/** The longest quote of the file a report shows, in characters. */
export const MAX_QUOTE = 120;

/** The most a file of text may hold to be read, in characters: as much as a compressed file inflates to. */
export const MAX_IMPORT_TEXT = 32 * 1024 * 1024;

/** A name or text cut to its limit, and whether it was. */
export interface Cut {
  text: string;
  cut: boolean;
}

/** The entities HTML labels use most, by name; any other named entity stays as written. */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  middot: '·',
  bull: '•',
  deg: '°',
  times: '×',
  divide: '÷',
  plusmn: '±',
  micro: 'µ',
  para: '¶',
  sect: '§',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  larr: '←',
  rarr: '→',
  uarr: '↑',
  darr: '↓',
  harr: '↔',
  le: '≤',
  ge: '≥',
  ne: '≠',
};

/** Characters that only steer how text is drawn, which a name never needs: bidirectional controls. */
const STEERING = /[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/g;

/** Control characters, which become spaces. */
// eslint-disable-next-line no-control-regex -- control characters are what it matches
const CONTROLS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g;

/** Elements whose content is code or styling, never text: dropped with what they hold. */
const DROPPED_WITH_CONTENT = new Set([
  'script',
  'style',
  'template',
  'iframe',
  'object',
  'svg',
  'math',
]);

/** Tags that end a line of text, which become a space. */
const BREAKS = new Set(['br', 'p', 'div', 'li', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/** Whether a character after `<` starts a tag, a comment or a declaration. */
function startsTag(code: number): boolean {
  return (
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    code === 0x2f ||
    code === 0x21 ||
    code === 0x3f
  );
}

/**
 * The plain text of a label that may hold HTML, as Mermaid's and draw.io's do: code and styling
 * elements dropped with their content, other tags and comments dropped, line breaks as spaces,
 * entities decoded once, one line, trimmed. A tag never closed drops the rest of the label. It reads
 * the label once from start to end, whatever it holds, and a text with no HTML comes back as it is,
 * but on one line.
 */
export function labelText(label: string): string {
  let out = '';
  let at = 0;
  const removed = (gap = '') => {
    // A "<" of the text never comes to start a tag with what follows the tag removed after it.
    out += gap === '' && out.endsWith('<') ? ' ' : gap;
  };
  while (at < label.length) {
    const open = label.indexOf('<', at);
    if (open < 0) {
      out += label.slice(at);
      break;
    }
    out += label.slice(at, open);
    if (!startsTag(label.charCodeAt(open + 1))) {
      out += '<';
      at = open + 1;
      continue;
    }
    if (label.startsWith('<!--', open)) {
      const end = label.indexOf('-->', open + 4);
      at = end < 0 ? label.length : end + 3;
      removed();
      continue;
    }
    const close = label.indexOf('>', open + 1);
    if (close < 0) break;
    const tag = /^<\/?([A-Za-z][A-Za-z0-9-]{0,31})/
      .exec(label.slice(open, open + 34))?.[1]
      ?.toLowerCase();
    at = close + 1;
    if (
      tag !== undefined &&
      DROPPED_WITH_CONTENT.has(tag) &&
      label[open + 1] !== '/' &&
      label[close - 1] !== '/'
    ) {
      const ending = new RegExp(`</${tag}`, 'gi');
      ending.lastIndex = at;
      const found = ending.exec(label);
      const end = found === null ? -1 : label.indexOf('>', found.index);
      at = end < 0 ? label.length : end + 1;
      removed(' ');
      continue;
    }
    removed(tag !== undefined && BREAKS.has(tag) ? ' ' : '');
  }
  return oneLine(decodeEntities(out));
}

/** A character or entity reference: numeric, or a name. */
const REFERENCE = /&(#[0-9]{1,8}|#[xX][0-9A-Fa-f]{1,7}|[A-Za-z][A-Za-z0-9]{1,31});/g;

/**
 * Character and entity references replaced by what they stand for: numeric ones, and the named ones
 * HTML labels use most. A reference to no character becomes U+FFFD, one to a control character a
 * space, and an unknown name stays as written.
 */
export function decodeEntities(text: string): string {
  return text.replace(REFERENCE, (whole, reference: string) => {
    if (reference.startsWith('#')) {
      const hex = reference[1] === 'x' || reference[1] === 'X';
      const code = Number.parseInt(reference.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '\uFFFD';
      if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return ' ';
      return String.fromCodePoint(code);
    }
    return Object.hasOwn(NAMED_ENTITIES, reference) ? (NAMED_ENTITIES[reference] as string) : whole;
  });
}

/** Text on one line: controls as spaces, steering characters dropped, runs of space as one, trimmed. */
export function oneLine(text: string): string {
  return text.replace(STEERING, '').replace(CONTROLS, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * A text cut to at most `max` characters, counted by code point so that no character is split, with
 * an ellipsis in place of what was left out.
 */
export function cutTo(text: string, max: number): Cut {
  if (text.length <= max) return { text, cut: false };
  // Only the first `max` code points are needed, so a megabyte is never split whole.
  const points = Array.from(text.slice(0, max * 2 + 2));
  if (points.length <= max && text.length <= max * 2 + 2) return { text, cut: false };
  return {
    text: `${points
      .slice(0, max - 1)
      .join('')
      .trimEnd()}…`,
    cut: true,
  };
}

/** A name for something imported: one line, at most `MAX_IMPORTED_NAME` characters. */
export function importedName(text: string): Cut {
  return cutTo(oneLine(text), MAX_IMPORTED_NAME);
}

/**
 * A description for something imported: control characters but line breaks as spaces, steering
 * characters dropped, trimmed, at most `MAX_IMPORTED_DESCRIPTION` characters.
 */
export function importedDescription(text: string): Cut {
  const cleaned = text
    .replace(STEERING, '')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex -- control characters are what it matches
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, ' ')
    .trim();
  return cutTo(cleaned, MAX_IMPORTED_DESCRIPTION);
}

/** What a report quotes of the file: one line, at most `MAX_QUOTE` characters. */
export function quote(text: string): string {
  return cutTo(oneLine(text.slice(0, MAX_QUOTE * 4)), MAX_QUOTE).text;
}
