import { describe, expect, it } from 'vitest';
import { decodePage, pageCharset, readLinkPreview } from './preview';

const PAGE = 'https://example.org/guides/intake';

function head(inner: string): string {
  return `<!doctype html><html><head>${inner}</head><body><p>Body</p></body></html>`;
}

describe('reading a page’s preview (ADR 0098, stage 3)', () => {
  it('takes the og: tags first', () => {
    const html = head(`
      <title>The page's own title</title>
      <meta name="description" content="Its plain description">
      <meta property="og:title" content="The intake guide">
      <meta property="og:description" content="How a patient is received.">
      <meta property="og:image" content="/images/intake.png">`);
    expect(readLinkPreview(html, PAGE)).toEqual({
      title: 'The intake guide',
      description: 'How a patient is received.',
      image: 'https://example.org/images/intake.png',
    });
  });

  it('falls back to twitter: tags, then to the title and the description', () => {
    expect(
      readLinkPreview(
        head(`<meta name="twitter:title" content="Tweeted"><title>Own</title>
          <meta name="twitter:description" content="Said briefly">
          <meta name="twitter:image" content="https://cdn.example.org/a.jpg">`),
        PAGE,
      ),
    ).toEqual({
      title: 'Tweeted',
      description: 'Said briefly',
      image: 'https://cdn.example.org/a.jpg',
    });
    expect(
      readLinkPreview(head('<title>Own</title><meta name="description" content="Plain">'), PAGE),
    ).toEqual({ title: 'Own', description: 'Plain' });
  });

  it('prefers og:image:secure_url and og:image:url over og:image', () => {
    const html = head(`<meta property="og:image" content="https://a.org/1.png">
      <meta property="og:image:url" content="https://a.org/2.png">
      <meta property="og:image:secure_url" content="https://a.org/3.png">`);
    expect(readLinkPreview(html, PAGE).image).toBe('https://a.org/3.png');
  });

  it('keeps the first of each tag', () => {
    const html = head(
      '<meta property="og:title" content="First"><meta property="og:title" content="Second">',
    );
    expect(readLinkPreview(html, PAGE).title).toBe('First');
  });

  it('reads attributes in any order, case and quoting', () => {
    const html = head(
      `<META CONTENT='Quoted once' PROPERTY='og:title'><meta content=Bare name=description>`,
    );
    expect(readLinkPreview(html, PAGE)).toEqual({ title: 'Quoted once', description: 'Bare' });
  });

  it('decodes character references, and no others', () => {
    const html = head(
      '<title>Tom &amp; Jerry&#39;s &#x201C;guide&#x201D;&nbsp;&lt;1&gt; &quot;a&quot; &apos;b&apos; &copy; &#0; &#xD800;</title>',
    );
    expect(readLinkPreview(html, PAGE).title).toBe(
      "Tom & Jerry's “guide” <1> \"a\" 'b' &copy; � �",
    );
  });

  it('makes text one line, without control characters, cut to its cap', () => {
    const html = head(
      `<title>  A\n\tsplit \u0007title\r\n  </title><meta name="description" content="${'d'.repeat(1200)}">`,
    );
    const read = readLinkPreview(html, PAGE);
    expect(read.title).toBe('A split title');
    expect(read.description).toHaveLength(1000);
    expect(read.description?.endsWith('…')).toBe(true);
    const long = readLinkPreview(head(`<title>${'t'.repeat(400)}</title>`), PAGE);
    expect(long.title).toHaveLength(300);
  });

  it('skips comments and what scripts, styles and templates hold', () => {
    const html = head(`
      <!-- <meta property="og:title" content="In a comment"> -->
      <script>document.write('<meta property="og:title" content="From a script">')</script>
      <style>/* <title>From a style</title> */</style>
      <template><meta property="og:description" content="From a template"></template>
      <noscript><meta property="og:image" content="https://a.org/n.png"></noscript>
      <svg><title>An SVG's title</title></svg>
      <title>The real one</title>`);
    expect(readLinkPreview(html, PAGE)).toEqual({ title: 'The real one' });
  });

  it('reads a script that never ends as the end of the page', () => {
    expect(readLinkPreview('<head><title>Kept</title><script>no end', PAGE)).toEqual({
      title: 'Kept',
    });
    expect(readLinkPreview('<head><!-- <title>never</title>', PAGE)).toEqual({});
  });

  it('stops at the end of the head, or at the body', () => {
    const after = '<meta property="og:title" content="Too late">';
    expect(readLinkPreview(`<head></head>${after}`, PAGE)).toEqual({});
    expect(readLinkPreview(`<title>Early</title><body>${after}`, PAGE)).toEqual({ title: 'Early' });
  });

  it.each([
    ['http://a.org/insecure.png'],
    ['javascript:alert(1)'],
    ['data:image/png;base64,AAAA'],
    ['https://user:pw@a.org/x.png'],
  ])('leaves out an image at %s', (image) => {
    const html = head(`<meta property="og:image" content="${image}">`);
    expect(readLinkPreview(html, PAGE)).toEqual({});
  });

  it('reads a hostile page in time that grows linearly with it', () => {
    const pieces = [
      '<'.repeat(400_000),
      '<meta '.repeat(80_000),
      `<meta content="${'"'.repeat(1)}${'a'.repeat(400_000)}`,
      '<!--'.repeat(100_000),
      `<title>${'&#'.repeat(200_000)}`,
      `<meta ${'a='.repeat(200_000)}>`,
    ];
    for (const piece of pieces) {
      const started = performance.now();
      readLinkPreview(piece, PAGE);
      expect(performance.now() - started).toBeLessThan(1000);
    }
  });
});

describe('a page’s charset', () => {
  const bytes = (text: string) => new TextEncoder().encode(text);

  it('is its Content-Type’s, else a meta charset early on, else UTF-8', () => {
    expect(pageCharset('text/html; charset=ISO-8859-1', bytes('<meta charset="utf-8">'))).toBe(
      'iso-8859-1',
    );
    expect(pageCharset('text/html', bytes('<head><meta charset="windows-1252">'))).toBe(
      'windows-1252',
    );
    expect(
      pageCharset(
        'text/html',
        bytes('<meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS">'),
      ),
    ).toBe('shift_jis');
    expect(pageCharset(undefined, bytes(`${' '.repeat(1100)}<meta charset="koi8-r">`))).toBe(
      'utf-8',
    );
  });

  it('decodes a page by it, and by UTF-8 for a label no one knows', () => {
    const latin = new Uint8Array([0x63, 0x61, 0x66, 0xe9]);
    expect(decodePage(latin, 'text/html; charset=iso-8859-1')).toBe('café');
    expect(decodePage(bytes('café'), 'text/html; charset=no-such-charset')).toBe('café');
    expect(decodePage(bytes('﻿hi'), 'text/html')).toBe('hi');
  });
});
