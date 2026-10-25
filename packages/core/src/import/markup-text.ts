/**
 * A label written as HTML, as draw.io writes labels with `html=1`, as plain text (ADR-0042): its tags
 * dropped, scripts, styles and comments with what they hold, its entities decoded, and the text made
 * one line. Nothing is parsed by a browser and nothing in the label is kept as markup, so the label
 * of draw.io's CVE-2026-46642 is only text here. Text that only looks like a tag, as in "a < b", stays.
 */
import { cleanText } from './reading';

/** Elements whose contents are dropped with them: they hold code or data, not what a label reads. */
const DROPPED_WITH_CONTENTS = new Set(['script', 'style', 'template', 'textarea', 'title', 'xmp']);

/** Elements that end a line or a block, and so leave a space between the words on either side. */
const BREAKS = new Set([
  'br',
  'p',
  'div',
  'li',
  'ul',
  'ol',
  'tr',
  'td',
  'th',
  'table',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'blockquote',
  'pre',
  'section',
  'article',
  'header',
  'footer',
  'dt',
  'dd',
]);

/** The names of the entities from U+00A0 to U+00FF, in order. */
const LATIN_1 = (
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 ' +
  'sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc ' +
  'Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve ' +
  'Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute ' +
  'acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ' +
  'ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'
).split(' ');

/** The named entities a label is read with: Latin-1's and the punctuation labels use. */
const ENTITIES: ReadonlyMap<string, string> = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ...LATIN_1.map((name, at): [string, string] => [name, String.fromCharCode(0xa0 + at)]),
  ['ensp', '\u2002'],
  ['emsp', '\u2003'],
  ['thinsp', '\u2009'],
  ['ndash', '–'],
  ['mdash', '—'],
  ['lsquo', '‘'],
  ['rsquo', '’'],
  ['sbquo', '‚'],
  ['ldquo', '“'],
  ['rdquo', '”'],
  ['bdquo', '„'],
  ['bull', '•'],
  ['hellip', '…'],
  ['trade', '™'],
  ['euro', '€'],
  ['larr', '←'],
  ['uarr', '↑'],
  ['rarr', '→'],
  ['darr', '↓'],
  ['harr', '↔'],
  ['lArr', '⇐'],
  ['rArr', '⇒'],
  ['hArr', '⇔'],
  ['le', '≤'],
  ['ge', '≥'],
  ['ne', '≠'],
  ['asymp', '≈'],
  ['infin', '∞'],
]);

/** The plain text an HTML label reads as, on one line. */
export function plainTextOfHtml(html: string): string {
  let out = '';
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    const next = html.charCodeAt(lt + 1);
    const startsTag =
      (next >= 0x41 && next <= 0x5a) || // A-Z
      (next >= 0x61 && next <= 0x7a) || // a-z
      next === 0x2f || // /
      next === 0x21 || // !
      next === 0x3f; // ?
    if (!startsTag) {
      out += '<';
      i = lt + 1;
      continue;
    }
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    const end = tagEnd(html, lt + 1);
    const name = /^<\/?([A-Za-z][A-Za-z0-9-]*)/
      .exec(html.slice(lt, Math.min(end, lt + 40)))?.[1]
      ?.toLowerCase();
    const closing = html[lt + 1] === '/';
    if (name !== undefined && !closing && DROPPED_WITH_CONTENTS.has(name)) {
      const close = closingTag(html, name, end);
      i = close === -1 ? html.length : tagEnd(html, close + 2);
      continue;
    }
    if (name !== undefined && BREAKS.has(name)) out += ' ';
    i = end;
  }
  return cleanText(decodeHtmlEntities(out));
}

/** Where the first closing tag of an element starts, whatever its case; -1 when none does. */
function closingTag(html: string, name: string, from: number): number {
  for (let at = html.indexOf('</', from); at !== -1; at = html.indexOf('</', at + 2)) {
    if (html.slice(at + 2, at + 2 + name.length).toLowerCase() === name) return at;
  }
  return -1;
}

/** Where a tag that starts before `from` ends: after its `>`, outside quoted values. */
function tagEnd(html: string, from: number): number {
  let quote: string | undefined;
  for (let i = from; i < html.length; i++) {
    const char = html[i];
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '>') return i + 1;
  }
  return html.length;
}

/** Text with HTML's character references decoded; an entity it does not know stays as written. */
function decodeHtmlEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(
    /&(#[xX][0-9a-fA-F]{1,8}|#[0-9]{1,10}|[A-Za-z][A-Za-z0-9]{1,31});/g,
    (whole, name: string) => {
      if (name.startsWith('#')) {
        const code =
          name[1] === 'x' || name[1] === 'X'
            ? parseInt(name.slice(2), 16)
            : parseInt(name.slice(1), 10);
        const valid = code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
        return valid ? String.fromCodePoint(code) : '\uFFFD';
      }
      return ENTITIES.get(name) ?? whole;
    },
  );
}
