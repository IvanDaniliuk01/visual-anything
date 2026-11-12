/**
 * The frame builder (ADR 0107): one document holding the `va` runtime, the explorable's script
 * libraries inlined as globals in their order, and the explorable's text; and the policy it is served
 * with, which lets scripts and styles run only by the hashes of what the builder put in.
 *
 * The browser hashes an inline script or style as it reads it, after the HTML parser's own rewriting:
 * CR and CRLF become LF everywhere, and NUL becomes U+FFFD. So the builder makes every line ending LF
 * and escapes NUL first (`\x00` inside scripts, where it is JavaScript's escape, and U+FFFD
 * elsewhere, as the parser would), then hashes the text exactly as it writes it.
 *
 * The runtime and the libraries are the app's and the registry's code: each is written as one inline
 * script, with `</script` written `<\/script` and `<!--` written `<\x21--`, so that whatever it holds
 * the parser ends it at the builder's own end tag (ADR 0041's rule). They come before the
 * explorable's text, and HTML is read in one pass, so nothing in that text can change how they read.
 *
 * The explorable's text is the page as its author wrote it. The builder reads it with the HTML
 * tokenizer's own rules (comments, raw text, attributes with quoted `>`, a script's escaped states,
 * SVG and MathML) and hashes each `<script>` without `src` and each `<style>` it finds where HTML
 * reads one. Where it cannot be sure, it hashes nothing, and what the browser finds there does not
 * run: a mistake only ever stops the author's own code. The header policy is the line: it allows no
 * `'unsafe-inline'`, `'unsafe-hashes'` or `'unsafe-eval'`, so event-handler and `style` attributes and
 * `javascript:` addresses never run, and a `<meta http-equiv>` in the text, which could only narrow a
 * policy, is renamed `data-va-http-equiv` so that it does nothing at all.
 */
import { sha256 } from '../code/hash';
import { encodeBase64 } from '../images/base64';
import { MAX_EXPLORABLE_BYTES, MAX_SCRIPT_LIBRARY_BYTES } from './types';
import type { FrameDocument, FrameInput } from './types';

/** Why a frame cannot be built: past a cap, or an input that is not one. */
export class FrameRefusal extends Error {
  override name = 'FrameRefusal';
}

/** How the app's origin is written in `frame-ancestors`: a scheme, a host and a port, nothing else. */
const ORIGIN =
  /^https?:\/\/(?:[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?|\[[0-9a-f:.]{2,45}\])(?::\d{1,5})?$/;

/** The global a script library sets, as its definition names it. */
const GLOBAL = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/;

/** What the builder writes before the runtime: a document in no quirks mode, read as UTF-8. */
const HEAD = '<!DOCTYPE html><html><head><meta charset="utf-8">';

/** The attribute a `<meta http-equiv>` of the explorable's text is renamed to, so that it does nothing. */
export const NEUTRAL_HTTP_EQUIV = 'data-va-http-equiv';

export function buildFrame(input: FrameInput): FrameDocument {
  const { text, scriptLibraries, runtime, appOrigin } = input;
  if (typeof appOrigin !== 'string' || !ORIGIN.test(appOrigin)) {
    throw new FrameRefusal('The app’s origin is a scheme, a host and a port.');
  }
  if (typeof text !== 'string' || typeof runtime !== 'string') {
    throw new FrameRefusal('An explorable and the runtime are text.');
  }
  if (utf8Length(text) > MAX_EXPLORABLE_BYTES) {
    throw new FrameRefusal(`An explorable's text is at most ${MAX_EXPLORABLE_BYTES} bytes.`);
  }
  const scriptHashes: string[] = [];
  const parts = [HEAD];
  const inline = (code: string) => {
    const written = scriptBody(code);
    scriptHashes.push(cspHash(written));
    parts.push('<script>', written, '</script>');
  };
  inline(runtime);
  for (const library of scriptLibraries) {
    if (typeof library.global !== 'string' || !GLOBAL.test(library.global)) {
      throw new FrameRefusal('A script library sets a global named as JavaScript names one.');
    }
    if (typeof library.text !== 'string') throw new FrameRefusal('A script library is text.');
    if (utf8Length(library.text) > MAX_SCRIPT_LIBRARY_BYTES) {
      throw new FrameRefusal(`A script library is at most ${MAX_SCRIPT_LIBRARY_BYTES} bytes.`);
    }
    inline(library.text);
  }
  const page = explorablePage(text);
  parts.push(page.html);
  scriptHashes.push(...page.scripts.map(cspHash));
  const styleHashes = page.styles.map(cspHash);
  return {
    html: parts.join(''),
    policy: framePolicy(scriptHashes, styleHashes, appOrigin),
    scriptHashes,
    styleHashes,
  };
}

/**
 * The frame's policy (ADR 0107): scripts and styles only by their hashes, no `eval`, no network, no
 * workers, no nested frames, pictures and fonts only from `data:` (and pictures from `blob:`), in a
 * sandbox that allows scripts and nothing else, framed only by the app.
 */
export function framePolicy(
  scriptHashes: readonly string[],
  styleHashes: readonly string[],
  appOrigin: string,
): string {
  if (!ORIGIN.test(appOrigin))
    throw new FrameRefusal('The app’s origin is a scheme, a host and a port.');
  const sources = (hashes: readonly string[]) => {
    const unique = [...new Set(hashes)];
    for (const hash of unique) {
      if (!CSP_HASH.test(hash)) throw new FrameRefusal(`"${hash}" is not a SHA-256 source.`);
    }
    // 'report-sample' lets the runtime tell the author what was blocked; it allows nothing.
    return unique.length === 0
      ? "'none'"
      : ["'report-sample'", ...unique.map((hash) => `'${hash}'`)].join(' ');
  };
  return [
    "default-src 'none'",
    `script-src ${sources(scriptHashes)}`,
    `style-src ${sources(styleHashes)}`,
    'img-src data: blob:',
    'font-src data:',
    "connect-src 'none'",
    "worker-src 'none'",
    "child-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${appOrigin}`,
    'sandbox allow-scripts',
  ].join('; ');
}

/** How a hash source is written: `sha256-` and the digest in base64. */
export const CSP_HASH = /^sha256-[A-Za-z0-9+/]{43}=$/;

/** The hash source of a text as the browser reads it: `sha256-` and the SHA-256 of its UTF-8, in base64. */
export function cspHash(text: string): string {
  const hex = sha256(text);
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return `sha256-${encodeBase64(bytes)}`;
}

/** How many bytes a text takes in UTF-8. */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

/** A script of the app's or a library's as the builder writes it inside `<script>…</script>`. */
export function scriptBody(code: string): string {
  return lineFeeds(code)
    .replace(/<\/(script)/gi, '<\\/$1')
    .replace(/<!--/g, '<\\x21--')
    .replace(/\0/g, '\\x00');
}

/** A text with CR and CRLF made LF, as the HTML parser reads every document. */
function lineFeeds(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

// ——— The explorable's own page ———

/** The explorable's text as the builder writes it, and the scripts and styles it holds, as written. */
export interface ExplorablePage {
  html: string;
  scripts: string[];
  styles: string[];
}

/**
 * The explorable's text as the frame holds it: line feeds made LF, NUL escaped, every
 * `<meta http-equiv>` made inert; with the text of each inline script and style the HTML parser finds
 * where the builder is sure it does, in order.
 */
export function explorablePage(text: string): ExplorablePage {
  const source = lineFeeds(text);
  const { spans, renames } = scanPage(source);
  const edits: (Span | { start: number; end: number; kind: 'rename' })[] = [
    ...spans,
    ...renames.map((range) => ({ ...range, kind: 'rename' as const })),
  ].sort((a, b) => a.start - b.start);
  const out: string[] = [];
  const scripts: string[] = [];
  const styles: string[] = [];
  let at = 0;
  for (const edit of edits) {
    out.push(markup(source.slice(at, edit.start)));
    const inside = source.slice(edit.start, edit.end);
    if (edit.kind === 'rename') {
      out.push(NEUTRAL_HTTP_EQUIV);
    } else if (edit.kind === 'script') {
      const written = inside.replace(/\0/g, '\\x00');
      if (edit.hashed) scripts.push(written);
      out.push(written);
    } else {
      const written = markup(inside);
      if (edit.hashed) styles.push(written);
      out.push(written);
    }
    at = edit.end;
  }
  out.push(markup(source.slice(at)));
  return { html: out.join(''), scripts, styles };
}

/** Markup outside scripts, with NUL made U+FFFD as the parser makes it. */
function markup(text: string): string {
  return text.replace(/\0/g, '�');
}

/** The content of a script or a style, and whether the builder hashes it. */
interface Span {
  start: number;
  end: number;
  kind: 'script' | 'style';
  hashed: boolean;
}

/** Where the scan stands: in HTML, in SVG or MathML, or in HTML again inside one of them. */
type Frame = { kind: 'foreign' } | { kind: 'html'; name: string };

const RAW_TEXT: ReadonlySet<string> = new Set([
  'style',
  'xmp',
  'iframe',
  'noembed',
  'noframes',
  // The frame runs scripts, so `noscript` holds raw text.
  'noscript',
]);
const RCDATA: ReadonlySet<string> = new Set(['title', 'textarea']);
/** The HTML start tags that end SVG or MathML wherever they come. */
const BREAKOUT: ReadonlySet<string> = new Set(
  (
    'b big blockquote body br center code dd div dl dt em embed h1 h2 h3 h4 h5 h6 head hr i img li ' +
    'listing menu meta nobr ol p pre ruby s small span strong strike sub sup table tt u ul var'
  ).split(' '),
);
/** The elements of SVG and MathML whose contents HTML reads as HTML. */
const INTEGRATION: ReadonlySet<string> = new Set([
  'foreignobject',
  'desc',
  'title',
  'mi',
  'mo',
  'mn',
  'ms',
  'mtext',
]);

interface Tag {
  name: string;
  attributes: { name: string; start: number; end: number; value: string }[];
  selfClosing: boolean;
  /** Just past its `>`; the text's length when the text ends inside it. */
  end: number;
  /** Whether it ends with `>` before the text does: an unended tag is no tag. */
  complete: boolean;
}

/**
 * The scripts and styles HTML finds in a page, and every `http-equiv` attribute of a `<meta>`, by
 * the tokenizer's rules. Its text has LF line endings already; NUL never changes how HTML reads.
 */
function scanPage(source: string): {
  spans: Span[];
  renames: { start: number; end: number }[];
} {
  const spans: Span[] = [];
  const renames: { start: number; end: number }[] = [];
  const stack: Frame[] = [];
  const length = source.length;
  const foreign = () => stack.at(-1)?.kind === 'foreign';
  let i = 0;
  while (i < length) {
    const lt = source.indexOf('<', i);
    if (lt < 0) break;
    i = lt + 1;
    const next = source[i];
    if (next === '!') {
      i = markupDeclaration(source, i + 1, foreign());
      continue;
    }
    if (next === '/') {
      const after = source[i + 1];
      if (after !== undefined && isAlpha(after)) {
        const tag = readTag(source, i + 1);
        i = tag.end;
        if (tag.complete) endTag(tag.name);
      } else if (after === '>') {
        i += 2;
      } else if (after === undefined) {
        i = length;
      } else {
        i = untilGreaterThan(source, i + 1);
      }
      continue;
    }
    if (next === '?') {
      i = untilGreaterThan(source, i);
      continue;
    }
    if (next === undefined || !isAlpha(next)) continue;
    const tag = readTag(source, i);
    i = tag.end;
    if (!tag.complete) break;
    i = startTag(tag, i);
  }
  return { spans, renames };

  function endTag(name: string): void {
    const top = stack.at(-1);
    if (top === undefined) return;
    if (top.kind === 'foreign') {
      if (name === 'svg' || name === 'math') stack.pop();
      else if (name === 'p' || name === 'br') popForeign();
    } else if (top.name === name) {
      stack.pop();
    }
  }

  function popForeign(): void {
    while (stack.at(-1)?.kind === 'foreign') stack.pop();
  }

  /** Reads what a start tag begins, and gives where reading goes on. */
  function startTag(tag: Tag, at: number): number {
    const { name } = tag;
    if (foreign()) {
      const font =
        name === 'font' &&
        tag.attributes.some((each) => ['color', 'face', 'size'].includes(each.name));
      if (!BREAKOUT.has(name) && !font) {
        if (tag.selfClosing) return at;
        if (name === 'svg' || name === 'math') stack.push({ kind: 'foreign' });
        else if (
          INTEGRATION.has(name) ||
          (name === 'annotation-xml' &&
            tag.attributes.some(
              (each) =>
                each.name === 'encoding' &&
                ['text/html', 'application/xhtml+xml'].includes(each.value.toLowerCase()),
            ))
        ) {
          stack.push({ kind: 'html', name });
        }
        return at;
      }
      popForeign();
    }
    if (name === 'svg' || name === 'math') {
      if (!tag.selfClosing) stack.push({ kind: 'foreign' });
      return at;
    }
    if (name === 'meta') {
      for (const attribute of tag.attributes) {
        if (attribute.name === 'http-equiv') {
          renames.push({ start: attribute.start, end: attribute.end });
        }
      }
      return at;
    }
    if (name === 'plaintext') return length;
    if (name === 'script') {
      const end = scriptEnd(source, at);
      spans.push({
        start: at,
        end,
        kind: 'script',
        hashed: !tag.attributes.some((each) => each.name === 'src'),
      });
      return afterEndTag(end);
    }
    if (RAW_TEXT.has(name) || RCDATA.has(name)) {
      const end = rawEnd(source, at, name);
      if (name === 'style') spans.push({ start: at, end, kind: 'style', hashed: true });
      return afterEndTag(end);
    }
    return at;
  }

  function afterEndTag(at: number): number {
    if (at >= length) return length;
    // At `</name`: the end tag runs to its `>`, past any attributes it holds.
    return readTag(source, at + 2).end;
  }
}

function isAlpha(char: string): boolean {
  const code = char.charCodeAt(0) | 0x20;
  return code >= 0x61 && code <= 0x7a;
}

function isSpace(char: string | undefined): boolean {
  return char === '\t' || char === '\n' || char === '\f' || char === ' ';
}

/** Just past the next `>`, or the text's end: a bogus comment, or a doctype. */
function untilGreaterThan(source: string, from: number): number {
  const at = source.indexOf('>', from);
  return at < 0 ? source.length : at + 1;
}

/** Where reading goes on after `<!`: a comment, a doctype, CDATA in SVG or MathML, or a bogus comment. */
function markupDeclaration(source: string, at: number, foreign: boolean): number {
  if (source.startsWith('--', at)) {
    const body = at + 2;
    if (source[body] === '>') return body + 1;
    if (source[body] === '-' && source[body + 1] === '>') return body + 2;
    let end = source.length;
    const plain = source.indexOf('-->', body);
    if (plain >= 0) end = plain + 3;
    const bang = source.indexOf('--!>', body);
    if (bang >= 0 && bang + 4 < end) end = bang + 4;
    return end;
  }
  if (source.slice(at, at + 7).toLowerCase() === 'doctype') return untilGreaterThan(source, at + 7);
  if (foreign && source.startsWith('[CDATA[', at)) {
    const end = source.indexOf(']]>', at + 7);
    return end < 0 ? source.length : end + 3;
  }
  return untilGreaterThan(source, at);
}

/** A start or end tag from its name's first letter, with its attributes, as the tokenizer reads it. */
function readTag(source: string, from: number): Tag {
  const length = source.length;
  let i = from;
  while (i < length && !isSpace(source[i]) && source[i] !== '/' && source[i] !== '>') i += 1;
  const name = lower(source.slice(from, i));
  const attributes: Tag['attributes'] = [];
  const incomplete = (): Tag => ({
    name,
    attributes,
    selfClosing: false,
    end: length,
    complete: false,
  });
  for (;;) {
    while (isSpace(source[i])) i += 1;
    if (i >= length) return incomplete();
    const char = source[i];
    if (char === '>') return { name, attributes, selfClosing: false, end: i + 1, complete: true };
    if (char === '/') {
      i += 1;
      if (source[i] === '>')
        return { name, attributes, selfClosing: true, end: i + 1, complete: true };
      continue;
    }
    // An attribute's name: its first character may be `=`.
    const start = i;
    i += 1;
    while (
      i < length &&
      !isSpace(source[i]) &&
      source[i] !== '/' &&
      source[i] !== '>' &&
      source[i] !== '='
    ) {
      i += 1;
    }
    const end = i;
    let value = '';
    while (isSpace(source[i])) i += 1;
    if (source[i] === '=') {
      i += 1;
      while (isSpace(source[i])) i += 1;
      const quote = source[i];
      if (quote === '"' || quote === "'") {
        const close = source.indexOf(quote, i + 1);
        if (close < 0) return incomplete();
        value = source.slice(i + 1, close);
        i = close + 1;
      } else if (quote !== '>') {
        const from = i;
        while (i < length && !isSpace(source[i]) && source[i] !== '>') i += 1;
        if (i >= length) return incomplete();
        value = source.slice(from, i);
      }
    }
    attributes.push({ name: lower(source.slice(start, end)), start, end, value });
  }
}

/** ASCII letters made small, as HTML compares tag and attribute names. */
function lower(text: string): string {
  return text.replace(/[A-Z]/g, (char) => char.toLowerCase());
}

/** Whether `</name` stands at `at`, followed by a space, `/` or `>`: the end tag of raw text. */
function endTagAt(source: string, at: number, name: string): boolean {
  if (source[at] !== '<' || source[at + 1] !== '/') return false;
  let i = at + 2;
  while (i < source.length && isAlpha(source[i] as string)) i += 1;
  if (lower(source.slice(at + 2, i)) !== name) return false;
  const after = source[i];
  return isSpace(after) || after === '/' || after === '>';
}

/** Where the raw text or RCDATA of a `<name>` element ends: at its end tag, or the text's end. */
function rawEnd(source: string, from: number, name: string): number {
  let at = source.indexOf('</', from);
  while (at >= 0) {
    if (endTagAt(source, at, name)) return at;
    at = source.indexOf('</', at + 2);
  }
  return source.length;
}

/**
 * Where a script's text ends, by the tokenizer's script data states: at `</script`, unless a `<!--`
 * followed by `<script` has put it in the double-escaped state, where `</script` only leaves it.
 */
function scriptEnd(source: string, from: number): number {
  type State =
    | 'data'
    | 'escaped'
    | 'escaped-dash'
    | 'escaped-dash-dash'
    | 'double'
    | 'double-dash'
    | 'double-dash-dash';
  let state: State = 'data';
  const length = source.length;
  /** The letters from `at` on, small, and the character after them. */
  const word = (at: number): { word: string; after: string | undefined; end: number } => {
    let i = at;
    while (i < length && isAlpha(source[i] as string)) i += 1;
    return { word: lower(source.slice(at, i)), after: source[i], end: i };
  };
  const ends = (after: string | undefined) => isSpace(after) || after === '/' || after === '>';
  let i = from;
  while (i < length) {
    const char = source[i] as string;
    switch (state) {
      case 'data':
        if (char === '<') {
          if (endTagAt(source, i, 'script')) return i;
          if (source.startsWith('<!--', i)) {
            state = 'escaped-dash-dash';
            i += 4;
            continue;
          }
        }
        break;
      case 'escaped':
      case 'escaped-dash':
      case 'escaped-dash-dash':
        if (char === '-') {
          state = state === 'escaped' ? 'escaped-dash' : 'escaped-dash-dash';
        } else if (char === '<') {
          if (endTagAt(source, i, 'script')) return i;
          state = 'escaped';
          if (isAlpha(source[i + 1] ?? '')) {
            const read = word(i + 1);
            if (read.word === 'script' && ends(read.after)) {
              state = 'double';
              i = read.end;
              continue;
            }
          }
        } else if (char === '>' && state === 'escaped-dash-dash') {
          state = 'data';
        } else {
          state = 'escaped';
        }
        break;
      default:
        if (char === '-') {
          state = state === 'double' ? 'double-dash' : 'double-dash-dash';
        } else if (char === '<') {
          state = 'double';
          if (source[i + 1] === '/') {
            const read = word(i + 2);
            if (read.word === 'script' && ends(read.after)) {
              state = 'escaped';
              i = read.end;
              continue;
            }
          }
        } else if (char === '>' && state === 'double-dash-dash') {
          state = 'data';
        } else {
          state = 'double';
        }
    }
    i += 1;
  }
  return length;
}
