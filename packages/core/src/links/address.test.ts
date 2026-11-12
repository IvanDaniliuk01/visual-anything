import { describe, expect, it } from 'vitest';
import { LINK_CAPS, checkLinkAddress, linkHost, mayFetchPreview } from './address';

describe('a link card’s address (ADR 0098, stage 3)', () => {
  it.each([
    ['https://example.org/guide', 'https://example.org/guide'],
    ['HTTPS://Example.ORG', 'https://example.org/'],
    ['http://intranet.local:8080/a?b=c#d', 'http://intranet.local:8080/a?b=c#d'],
    ['  https://example.org/a b  ', 'https://example.org/a%20b'],
    ['https://[2001:db8::1]/', 'https://[2001:db8::1]/'],
  ])('takes %s as %s', (given, kept) => {
    expect(checkLinkAddress(given)).toEqual({ ok: true, url: kept });
  });

  it.each([
    ['', 'is empty'],
    ['example.org', 'is not a web address'],
    ['javascript:alert(1)', 'is not an http or https address'],
    ['data:text/html,<b>hi</b>', 'is not an http or https address'],
    ['file:///etc/passwd', 'is not an http or https address'],
    ['ftp://example.org/', 'is not an http or https address'],
    ['https://user:secret@example.org/', 'holds a user name or a password'],
    ['https://user@example.org/', 'holds a user name or a password'],
    [`https://example.org/${'a'.repeat(LINK_CAPS.url)}`, 'is longer than 2,048 characters'],
    [42, 'is not text'],
  ])('refuses %s: it %s', (given, reason) => {
    expect(checkLinkAddress(given)).toEqual({ ok: false, reason });
  });

  it('names an address by its host, without "www."', () => {
    expect(linkHost('https://www.youtube.com/watch?v=x')).toBe('youtube.com');
    expect(linkHost('http://intranet.local:8080/a')).toBe('intranet.local:8080');
    expect(linkHost('not an address')).toBe('not an address');
  });

  it('fetches a preview only of an https address', () => {
    expect(mayFetchPreview('https://example.org/')).toBe(true);
    expect(mayFetchPreview('http://example.org/')).toBe(false);
    expect(mayFetchPreview('javascript:alert(1)')).toBe(false);
  });
});
