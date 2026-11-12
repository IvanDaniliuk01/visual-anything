/**
 * What a link card's preview keeps of a page (ADR 0098, stage 3): its title, its description and the
 * address of its preview image, read from the HTML the local program fetched, never run.
 *
 * - **One pass, in linear time.** The reader walks the text once, from tag to tag, and reads only
 *   `<title>` and the `content` of `<meta>` elements by their `property` or `name`. It stops at
 *   `</head>` or `<body>`, and at the first thing that does not end, such as a comment or a quoted
 *   value left open.
 * - **What it skips.** Comments, declarations, and what `<script>`, `<style>`, `<template>`,
 *   `<noscript>`, `<textarea>`, `<svg>`, `<math>` and their kind hold.
 * - **Nothing else is read.** No DOM is built, nothing is fetched or followed, and no DTD or entity is
 *   read: only HTML's character references, numeric ones and `&amp;`, `&lt;`, `&gt;`, `&quot;`,
 *   `&apos;` and `&nbsp;`.
 * - **What it keeps.** The title is `og:title`, else `twitter:title`, else `<title>`; the description
 *   `og:description`, else `twitter:description`, else `description`; the image `og:image:secure_url`,
 *   else `og:image:url`, else `og:image`, else `twitter:image`, resolved against the page's address
 *   and kept only when it is an `https:` address a card could hold. Text becomes one line without
 *   control characters, cut to 300 and 1,000 characters.
 */
import { LINK_CAPS, checkLinkAddress } from './address';

/** What a page's preview holds; each part only when the page has it. */
export interface LinkPreviewRead {
  title?: string;
  description?: string;
  /** The preview image's address: absolute and `https:`. */
  image?: string;
}

/** The elements whose content is skipped whole, up to their end tag. */
const SKIPPED = new Set([
  'script',
  'style',
  'template',
  'noscript',
  'textarea',
  'svg',
  'math',
  'xmp',
  'iframe',
  'noembed',
  'noframes',
  'object',
]);

/** The `<meta>` keys each part is read from, the first found winning. */
const TITLE_KEYS = ['og:title', 'twitter:title'];
const DESCRIPTION_KEYS = ['og:description', 'twitter:description', 'description'];
const IMAGE_KEYS = ['og:image:secure_url', 'og:image:url', 'og:image', 'twitter:image'];
const KEYS = new Set([...TITLE_KEYS, ...DESCRIPTION_KEYS, ...IMAGE_KEYS]);

/** The most attributes of one tag that are kept; the rest are read past. */
const MOST_ATTRIBUTES = 32;

/** Reads a page's preview from its HTML; `page` is the page's own address, for a relative image. */
export function readLinkPreview(html: string, page: string): LinkPreviewRead {
  const text = html.length > LINK_CAPS.pageBytes ? html.slice(0, LINK_CAPS.pageBytes) : html;
  // Lowercased in ASCII only, so that every index into it is an index into the text.
  const lower = text.replace(/[A-Z]+/g, (letters) => letters.toLowerCase());
  const metas = new Map<string, string>();
  let titleText: string | undefined;
  let at = 0;
  while (at < lower.length) {
    const open = lower.indexOf('<', at);
    if (open < 0) break;
    if (lower.startsWith('<!--', open)) {
      const end = lower.indexOf('-->', open + 4);
      if (end < 0) break;
      at = end + 3;
      continue;
    }
    const next = lower.charCodeAt(open + 1);
    if (next === 0x21 /* ! */ || next === 0x3f /* ? */) {
      const end = lower.indexOf('>', open + 2);
      if (end < 0) break;
      at = end + 1;
      continue;
    }
    if (next === 0x2f /* / */) {
      const name = tagNameAt(lower, open + 2);
      if (name === 'head' || name === 'html') break;
      const end = lower.indexOf('>', open + 2);
      if (end < 0) break;
      at = end + 1;
      continue;
    }
    const name = tagNameAt(lower, open + 1);
    if (name === '') {
      at = open + 1;
      continue;
    }
    const tag = readAttributes(text, lower, open + 1 + name.length);
    if (tag === undefined) break;
    at = tag.end;
    if (name === 'body') break;
    if (name === 'meta') {
      const key = (tag.attributes.get('property') ?? tag.attributes.get('name'))?.trim();
      const content = tag.attributes.get('content');
      if (key !== undefined && content !== undefined) {
        const known = key.toLowerCase();
        if (KEYS.has(known) && !metas.has(known)) metas.set(known, content);
      }
      continue;
    }
    if (tag.closed) continue;
    if (name === 'title' || SKIPPED.has(name)) {
      const close = lower.indexOf(`</${name}`, at);
      if (close < 0) break;
      if (name === 'title' && titleText === undefined) titleText = text.slice(at, close);
      at = close;
    }
  }
  const first = (keys: readonly string[]) =>
    keys.map((key) => metas.get(key)).find((value) => value !== undefined);
  const title = oneLine(first(TITLE_KEYS) ?? titleText, LINK_CAPS.title);
  const description = oneLine(first(DESCRIPTION_KEYS), LINK_CAPS.description);
  const image = IMAGE_KEYS.map((key) => imageAddress(metas.get(key), page)).find(
    (address) => address !== undefined,
  );
  return {
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    ...(image === undefined ? {} : { image }),
  };
}

/** The name of the tag that starts at `at`, lowercased; empty where none does. */
function tagNameAt(lower: string, at: number): string {
  let end = at;
  while (end < lower.length) {
    const code = lower.charCodeAt(end);
    const letter = code >= 0x61 && code <= 0x7a;
    const other = (code >= 0x30 && code <= 0x39) || code === 0x2d || code === 0x3a;
    if (!letter && !(other && end > at)) break;
    end += 1;
  }
  return lower.slice(at, end);
}

function isSpace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d;
}

/**
 * A tag's attributes, read from just after its name to its `>`: their names lowercased, their values
 * as written, the first of each name kept. Undefined when the tag never ends.
 */
function readAttributes(
  text: string,
  lower: string,
  from: number,
): { attributes: Map<string, string>; end: number; closed: boolean } | undefined {
  const attributes = new Map<string, string>();
  let at = from;
  let closed = false;
  for (;;) {
    while (at < lower.length && isSpace(lower.charCodeAt(at))) at += 1;
    if (at >= lower.length) return undefined;
    const code = lower.charCodeAt(at);
    if (code === 0x3e /* > */) return { attributes, end: at + 1, closed };
    if (code === 0x2f /* / */) {
      closed = true;
      at += 1;
      continue;
    }
    closed = false;
    const nameStart = at;
    while (at < lower.length) {
      const each = lower.charCodeAt(at);
      if (isSpace(each) || each === 0x3d /* = */ || each === 0x3e || each === 0x2f) break;
      at += 1;
    }
    // A name starts with any character but these, even "=" (HTML's own rule).
    if (at === nameStart) at += 1;
    const name = lower.slice(nameStart, at);
    let probe = at;
    while (probe < lower.length && isSpace(lower.charCodeAt(probe))) probe += 1;
    let value = '';
    if (lower.charCodeAt(probe) === 0x3d) {
      at = probe + 1;
      while (at < lower.length && isSpace(lower.charCodeAt(at))) at += 1;
      if (at >= lower.length) return undefined;
      const quote = lower.charCodeAt(at);
      if (quote === 0x22 || quote === 0x27) {
        const end = lower.indexOf(String.fromCharCode(quote), at + 1);
        if (end < 0) return undefined;
        value = text.slice(at + 1, end);
        at = end + 1;
      } else {
        const start = at;
        while (at < lower.length) {
          const each = lower.charCodeAt(at);
          if (isSpace(each) || each === 0x3e) break;
          at += 1;
        }
        value = text.slice(start, at);
      }
    }
    if (attributes.size < MOST_ATTRIBUTES && !attributes.has(name)) attributes.set(name, value);
  }
}

/** The named character references a preview decodes; any other stays as written. */
const NAMED: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Text with its character references decoded: numeric ones, and the few named ones above. */
function decodeReferences(text: string): string {
  return text.replace(
    /&(?:#(\d{1,8})|#[xX]([0-9a-fA-F]{1,8})|([a-zA-Z]{2,4}));/g,
    (whole, decimal?: string, hex?: string, named?: string) => {
      if (named !== undefined) return NAMED[named] ?? whole;
      const code = decimal === undefined ? Number.parseInt(hex ?? '', 16) : Number(decimal);
      const valid =
        code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) && code !== 0xfffe;
      return valid ? String.fromCodePoint(code) : '�';
    },
  );
}

// eslint-disable-next-line no-control-regex -- finding them is what this pattern is for
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;

/** Text decoded, on one line without control characters, cut to `most` characters; none if empty. */
function oneLine(text: string | undefined, most: number): string | undefined {
  if (text === undefined) return undefined;
  const line = decodeReferences(text).replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  if (line === '') return undefined;
  if (line.length <= most) return line;
  let cut = most - 1;
  // Never between the two halves of a character.
  const last = line.charCodeAt(cut - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut -= 1;
  return `${line.slice(0, cut)}…`;
}

/** A preview image's address, resolved against the page's: kept only when https and well formed. */
function imageAddress(value: string | undefined, page: string): string | undefined {
  if (value === undefined) return undefined;
  const given = decodeReferences(value).trim();
  if (given === '') return undefined;
  let resolved: string;
  try {
    resolved = new (
      globalThis as unknown as { URL: new (a: string, b: string) => { href: string } }
    ).URL(given, page).href;
  } catch {
    return undefined;
  }
  const checked = checkLinkAddress(resolved);
  return checked.ok && checked.url.startsWith('https:') ? checked.url : undefined;
}

/**
 * A page's charset: its `Content-Type`'s, else a `<meta charset>` or `http-equiv` in its first 1,024
 * bytes, else UTF-8; lowercased.
 */
export function pageCharset(contentType: string | undefined, bytes: Uint8Array): string {
  const charset = /charset\s*=\s*["']?([\w.:-]{1,40})/i;
  const said = contentType === undefined ? null : charset.exec(contentType);
  if (said?.[1]) return said[1].toLowerCase();
  let early = '';
  const most = Math.min(bytes.length, 1024);
  for (let at = 0; at < most; at += 1) early += String.fromCharCode(bytes[at] as number);
  const meta = /<meta\b[^>]{0,400}?charset\s*=\s*["']?([\w.:-]{1,40})/i.exec(early);
  return meta?.[1] ? meta[1].toLowerCase() : 'utf-8';
}

/** A page's bytes as text, in its charset, or in UTF-8 when no decoder knows it. */
export function decodePage(bytes: Uint8Array, contentType: string | undefined): string {
  const label = pageCharset(contentType, bytes);
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}
