/**
 * Labels become plain text (ADR-0042): tags dropped, code and styling dropped with what they hold,
 * entities decoded once into characters, one line; names are cut to their limit; and nothing takes
 * longer than the label is long.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_IMPORTED_NAME,
  cutTo,
  decodeEntities,
  importedDescription,
  importedName,
  oneLine,
  plainText,
  quote,
} from './text';
import { cpuNow } from '../test/cpu';

describe('plainText', () => {
  it.each([
    ['Plain', 'Plain'],
    ['<b>Bold</b> and <i>italic</i>', 'Bold and italic'],
    ['Line one<br>line two<br/>three<BR />four', 'Line one line two three four'],
    ['<script>alert(1)</script>Safe', 'Safe'],
    ['A<SCRIPT type="x">alert(1)</ScRiPt >B', 'A B'],
    ['<style>p { color: red }</style>Styled', 'Styled'],
    ['<img src=x onerror=alert(1)>Picture', 'Picture'],
    ['<a href="javascript:alert(1)">Link</a>', 'Link'],
    ['Fish &amp; chips &lt;3', 'Fish & chips <3'],
    ['&lt;script&gt;alert(1)&lt;/script&gt;', '<script>alert(1)</script>'],
    ['&#60;b&#62; and &#x3C;i&#x3E;', '<b> and <i>'],
    ['&unknown; stays', '&unknown; stays'],
    ['a < b and c > d', 'a < b and c > d'],
    ['Tab\there\nand\r\nthere', 'Tab here and there'],
    ['<!-- a comment -->Shown', 'Shown'],
    ['<svg><script>x</script></svg>After', 'After'],
    ['Open <b', 'Open'],
    ['<script>never closed', ''],
    ['Bidi\u202Eevil\u202C name', 'Bidievil name'],
    ['&#0; &#xD800; &#1114112;', '\uFFFD \uFFFD'],
  ])('reads %j as %j', (label, text) => {
    expect(plainText(label)).toBe(text);
  });

  it('decodes once, so that an encoded tag stays text and is never read as a tag', () => {
    expect(plainText('&amp;lt;b&amp;gt;')).toBe('&lt;b&gt;');
  });

  it('never leaves a tag, a control character or a line break', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 200 }), (label) => {
        const text = plainText(label.replaceAll('&', ''));
        // Without entities to decode, no "<" followed by a letter survives.
        expect(text).not.toMatch(/<[A-Za-z/!?]/);
        // eslint-disable-next-line no-control-regex -- control characters are what it looks for
        expect(text).not.toMatch(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/);
        expect(text).toBe(text.trim());
      }),
    );
  });

  it('takes time in proportion to the label, whatever it holds', () => {
    const hostile = [
      '<script'.repeat(150_000),
      '<br'.repeat(300_000),
      '<!--'.repeat(250_000),
      '<a '.repeat(300_000),
      '&#1'.repeat(250_000),
    ];
    for (const label of hostile) {
      const start = cpuNow();
      plainText(label);
      expect(cpuNow() - start).toBeLessThan(1_000);
    }
  });
});

describe('decodeEntities', () => {
  it('decodes numeric references and the common named ones, and keeps the rest', () => {
    expect(decodeEntities('&copy; &#169; &#xA9; &nbsp;&hellip; &bogus;')).toBe('© © ©  … &bogus;');
  });
});

describe('names and quotes', () => {
  it('cuts a long name to its limit, with an ellipsis, by code point', () => {
    const long = '😀'.repeat(MAX_IMPORTED_NAME + 10);
    const { text, cut } = importedName(long);
    expect(cut).toBe(true);
    expect(Array.from(text)).toHaveLength(MAX_IMPORTED_NAME);
    expect(text.endsWith('…')).toBe(true);
    expect(importedName('  Short\nname ')).toEqual({ text: 'Short name', cut: false });
  });

  it('cuts a megabyte label quickly', () => {
    const label = 'x'.repeat(1024 * 1024);
    const start = cpuNow();
    const { text, cut } = importedName(plainText(label));
    expect(cpuNow() - start).toBeLessThan(1_000);
    expect(cut).toBe(true);
    expect(text).toHaveLength(MAX_IMPORTED_NAME);
  });

  it('keeps the line breaks of a description, but no other control', () => {
    expect(importedDescription(' One\r\ntwo\u0007three ').text).toBe('One\ntwo three');
  });

  it('quotes at most a short line', () => {
    expect(quote('a\nb')).toBe('a b');
    expect(quote('y'.repeat(500)).length).toBeLessThanOrEqual(120);
    expect(cutTo('abc', 3)).toEqual({ text: 'abc', cut: false });
    expect(oneLine(' a  b ')).toBe('a b');
  });
});
