import { describe, expect, it } from 'vitest';
import { HTML_CAPS } from './caps';
import { DrawingRefusal, readHtml, type HtmlElement, type HtmlNode } from './read';
import { DrawingReport } from './report';
import { timed } from './test/cpu';

const SIZE = HTML_CAPS.input;

/** Reads HTML, saying what it refused, if anything, and how long it took. */
function read(html: string) {
  const report = new DrawingReport();
  return timed(() => {
    try {
      return { document: readHtml(html, report), report: report.lines() };
    } catch (error) {
      if (error instanceof DrawingRefusal) return { refused: error.problem };
      throw error;
    }
  });
}

function elements(node: { childNodes?: HtmlNode[] }): HtmlElement[] {
  const found: HtmlElement[] = [];
  const visit = (each: { childNodes?: HtmlNode[] }) => {
    for (const child of each.childNodes ?? []) {
      if ('tagName' in child) found.push(child);
      visit(child as { childNodes?: HtmlNode[] });
    }
  };
  visit(node);
  return found;
}

describe('readHtml', () => {
  it('reads a fragment as the standard does, into data', () => {
    const { value } = read('<p>Hi <b>there</b>');
    if (!('document' in value)) throw new Error('refused');
    expect(elements(value.document).map((each) => each.tagName)).toEqual([
      'html',
      'head',
      'body',
      'p',
      'b',
    ]);
  });

  it('refuses text past 512 KiB of UTF-8', () => {
    const { value } = read('é'.repeat(SIZE / 2 + 1));
    expect(value).toEqual({
      refused: {
        code: 'image-too-large',
        message: 'The HTML is over 512 KiB: shorten it, or import a part of the page.',
      },
    });
  });

  it('keeps a tag’s first 256 attributes and reports the rest', () => {
    const attributes = Array.from({ length: 300 }, (_, at) => `a${at}="1"`).join(' ');
    const { value } = read(`<div ${attributes}></div>`);
    if (!('document' in value)) throw new Error('refused');
    const div = elements(value.document).find((each) => each.tagName === 'div');
    expect(div?.attrs).toHaveLength(256);
    expect(value.report).toEqual(['44 attributes past the 256 a tag keeps']);
  });
});

/** Hostile HTML of the largest size read, each kind made to cost the most the standard lets it. */
const HOSTILE: readonly [string, string][] = [
  ['nested divs', '<div>'.repeat(SIZE / 5)],
  ['nested list items', '<ul><li>'.repeat(SIZE / 8)],
  ['nested tables', '<table><tr><td>'.repeat(SIZE / 15)],
  ['nested formatting', '<b><b><b><b>x</b>'.repeat(SIZE / 17)],
  ['formatting reconstructed', Array.from({ length: SIZE / 20 }, (_, at) => `<p><b x=${at}></p>`).join('')],
  ['stray end tags under deep nesting', `${'<div>'.repeat(120)}${'</p>'.repeat((SIZE - 600) / 4)}`],
  ['stray end tags of other names', `${'<div>'.repeat(120)}${'</span>'.repeat((SIZE - 600) / 7)}`],
  ['one tag of many distinct attributes', `<div ${Array.from({ length: SIZE / 10 }, (_, at) => `a${at}=1`).join(' ')}>`],
  ['many tags of many distinct attributes', Array.from({ length: 200 }, (_, tag) => `<i ${Array.from({ length: 300 }, (_, at) => `a${tag}x${at}`).join(' ')}>`).join('')],
  ['html tags giving attributes', Array.from({ length: 2000 }, (_, tag) => `<html ${Array.from({ length: 30 }, (_, at) => `h${tag}x${at}`).join(' ')}>`).join('')],
  ['entities', '&amp;&lt;&#x26;&#38;&notin;'.repeat(SIZE / 27)],
  ['foster parented text and elements', `<table>${'x<b>'.repeat((SIZE - 7) / 4)}`],
  ['comments', '<!--x-->'.repeat(SIZE / 8)],
  ['select options', '<select><option>'.repeat(SIZE / 16)],
  ['nobr', '<nobr>x'.repeat(SIZE / 7)],
  ['headings', '<h1>'.repeat(SIZE / 4)],
  ['svg nested', '<svg><g>'.repeat(SIZE / 8)],
  ['templates', '<template>'.repeat(SIZE / 10)],
  ['words', 'word '.repeat(SIZE / 5)],
];

describe('readHtml on hostile HTML', () => {
  it.each(HOSTILE)('reads or refuses %s within its CPU budget', (_name, html) => {
    expect(Buffer.byteLength(html)).toBeLessThanOrEqual(SIZE);
    const { value, took } = read(html);
    expect(took).toBeLessThan(1_500);
    if ('refused' in value) expect(value.refused.code).toBe('image-too-large');
  });

  it('refuses nesting past the cap, and too many nodes', () => {
    const deep = read('<div>'.repeat(200)).value;
    expect(deep).toEqual({
      refused: { code: 'image-too-large', message: 'The HTML nests elements over 128 deep.' },
    });
    const many = read('<p>x</p>'.repeat(15_000)).value;
    expect(many).toEqual({
      refused: {
        code: 'image-too-large',
        message: 'The HTML makes over 25000 elements, texts and comments.',
      },
    });
  });
});
