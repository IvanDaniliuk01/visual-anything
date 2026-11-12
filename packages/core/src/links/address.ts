/**
 * A link card's web address (ADR 0098, stage 3): absolute, `https:` or `http:`, with a host and no
 * user name or password, at most 2,048 characters, kept as the web's own address reader writes it.
 * Any other scheme, `javascript:`, `data:` and `file:` among them, is refused, so that a card never
 * opens anything but a web page. Only an `https:` address is fetched for its preview.
 */

/** The caps on a link card's text and on fetching its preview. */
export const LINK_CAPS = Object.freeze({
  /** The longest address, in characters. */
  url: 2048,
  /** The longest title, in characters. */
  title: 300,
  /** The longest description, in characters. */
  description: 1000,
  /** The most bytes of a page read for its preview: 512 KiB; past it, what came is read. */
  pageBytes: 512 * 1024,
  /** The most bytes of a preview's image: 8 MiB. */
  imageBytes: 8 * 1024 * 1024,
  /** How long the page may take, its name's resolution and redirects included, in milliseconds. */
  pageMs: 10_000,
  /** How long the image may take, in milliseconds. */
  imageMs: 10_000,
  /** How many redirects are followed, each checked as the first address was. */
  redirects: 3,
  /** How many fetches may be under way at once. */
  underWay: 2,
});

/** What the core reads of a web address, as browsers and Node read it. */
interface ParsedAddress {
  protocol: string;
  username: string;
  password: string;
  host: string;
  hostname: string;
  readonly href: string;
}

/** The web's own reader of addresses, which both browsers and Node have, though the core's types do not. */
const WebAddress = (globalThis as unknown as { URL: new (text: string) => ParsedAddress }).URL;

/** A link card's address, checked: as the web's reader writes it, or why it cannot be one. */
export function checkLinkAddress(
  text: unknown,
): { ok: true; url: string } | { ok: false; reason: string } {
  if (typeof text !== 'string') return { ok: false, reason: 'is not text' };
  const given = text.trim();
  if (given === '') return { ok: false, reason: 'is empty' };
  if (given.length > LINK_CAPS.url) {
    return { ok: false, reason: 'is longer than 2,048 characters' };
  }
  let parsed: ParsedAddress;
  try {
    parsed = new WebAddress(given);
  } catch {
    return { ok: false, reason: 'is not a web address' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'is not an http or https address' };
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return { ok: false, reason: 'holds a user name or a password' };
  }
  if (parsed.hostname === '') return { ok: false, reason: 'has no host' };
  if (parsed.href.length > LINK_CAPS.url) {
    return { ok: false, reason: 'is longer than 2,048 characters' };
  }
  return { ok: true, url: parsed.href };
}

/** What a card writes of its address: its host, with its port, without a leading "www.". */
export function linkHost(url: string): string {
  try {
    const host = new WebAddress(url).host;
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return url;
  }
}

/** Whether an address is one whose preview may be fetched: a link card's, over `https:`. */
export function mayFetchPreview(url: string): boolean {
  const checked = checkLinkAddress(url);
  return checked.ok && checked.url.startsWith('https:');
}
