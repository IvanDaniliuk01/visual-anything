import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { attributes, element, empty, escapeXml, num, textElement, xmlSafe } from './markup';

/** Whether a browser's XML parser reads a text without an error. */
function parses(xml: string): boolean {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  return parsed.getElementsByTagName('parsererror').length === 0;
}

describe('escapeXml', () => {
  it('escapes what would end a value or start markup', () => {
    expect(escapeXml(`<script>alert("x") & 'y'</script>`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;) &amp; &apos;y&apos;&lt;/script&gt;',
    );
  });

  it('writes any text as content and as a value that an XML parser reads back as it was', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (text) => {
        const xml = `<a b="${escapeXml(text)}">${escapeXml(text)}</a>`;
        const parsed = new DOMParser().parseFromString(xml, 'application/xml');
        expect(parsed.getElementsByTagName('parsererror')).toHaveLength(0);
        const root = parsed.documentElement;
        // A parser normalizes line breaks in content and white space in values; the rest comes back.
        const kept = xmlSafe(text);
        expect(root.textContent).toBe(kept.replace(/\r\n?/g, '\n'));
        expect(root.getAttribute('b')).toBe(kept.replace(/\r\n|[\r\n\t]/g, ' '));
      }),
    );
  });

  it('replaces characters XML cannot hold, lone surrogates among them', () => {
    expect(xmlSafe('a\u0000b\u001Fc\uD800d\uDC00e\uFFFE')).toBe(
      'a\uFFFDb\uFFFDc\uFFFDd\uFFFDe\uFFFD',
    );
    expect(xmlSafe('tab\tline\nemoji 😀')).toBe('tab\tline\nemoji 😀');
  });
});

describe('num', () => {
  it('writes at most two decimals, without trailing zeros or a negative zero', () => {
    expect(num(1)).toBe('1');
    expect(num(1.5)).toBe('1.5');
    expect(num(1.005)).toBe('1');
    expect(num(2 / 3)).toBe('0.67');
    expect(num(-0.001)).toBe('0');
    expect(num(Number.NaN)).toBe('0');
    expect(num(Infinity)).toBe('0');
  });
});

describe('elements', () => {
  it('leaves out attributes without a value and escapes the rest', () => {
    expect(attributes({ a: 'x"y', b: undefined, c: 1.25 })).toBe(' a="x&quot;y" c="1.25"');
    expect(empty('rect', { x: 0, width: 10 })).toBe('<rect x="0" width="10"/>');
    expect(element('g', { id: 'a' }, '<rect/>')).toBe('<g id="a"><rect/></g>');
    expect(textElement('title', {}, '<b>')).toBe('<title>&lt;b&gt;</title>');
    expect(parses(element('svg', {}, textElement('title', {}, 'a & b')))).toBe(true);
  });
});
