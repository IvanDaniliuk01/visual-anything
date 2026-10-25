/**
 * Labels written as HTML become plain text (ADR-0042): tags dropped, scripts and styles with what they
 * hold, entities decoded, and the text one line.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { plainTextOfHtml } from './markup-text';

describe('plainTextOfHtml', () => {
  it('drops tags, and what scripts and styles hold', () => {
    expect(plainTextOfHtml('<b>Order</b> <i>service</i>')).toBe('Order service');
    expect(plainTextOfHtml('<img src=x onerror="alert(1)">Cart')).toBe('Cart');
    expect(plainTextOfHtml('<script>alert(1)</script>Billing<SCRIPT >x</SCRIPT>')).toBe('Billing');
    expect(plainTextOfHtml('<style>b{color:red}</style>API')).toBe('API');
    expect(plainTextOfHtml('<svg><script>alert(1)</script></svg>Queue')).toBe('Queue');
    expect(plainTextOfHtml('Name<!-- <b>hidden</b> -->')).toBe('Name');
    expect(plainTextOfHtml('<a href="javascript:alert(1)" title="a > b">Link</a>')).toBe('Link');
    expect(plainTextOfHtml('<script>never closed')).toBe('');
  });

  it('turns line breaks and blocks into spaces, and inline tags into nothing', () => {
    expect(plainTextOfHtml('Web app<br>(React)')).toBe('Web app (React)');
    expect(plainTextOfHtml('<div>One</div><div>Two</div>')).toBe('One Two');
    expect(plainTextOfHtml('Pay<b>ments</b>')).toBe('Payments');
    expect(plainTextOfHtml('<p>\n  Many\n\n  lines  </p>')).toBe('Many lines');
  });

  it('decodes entities, keeping what is written as text as text', () => {
    expect(plainTextOfHtml('A&nbsp;&amp;&nbsp;B')).toBe('A & B');
    expect(plainTextOfHtml('Caf&eacute; &#233; &#xE9; &copy;')).toBe('Café é é ©');
    expect(plainTextOfHtml('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe(
      '<script>alert(1)</script>',
    );
    expect(plainTextOfHtml('a < b and c > d')).toBe('a < b and c > d');
    expect(plainTextOfHtml('&bogus; &#0; &#xD800; &#x110000;')).toBe(
      '&bogus; \uFFFD \uFFFD \uFFFD',
    );
    expect(plainTextOfHtml('Right\u202Eto left\u200B')).toBe('Rightto left');
  });

  it('gives one line, never longer than what it was given', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.string({ maxLength: 12 }),
            fc.constantFrom(
              '<b>',
              '</b>',
              '<br>',
              '<script>',
              '</script>',
              '&amp;',
              '&#128512;',
              '<!--',
            ),
          ),
          { maxLength: 20 },
        ),
        (parts) => {
          const html = parts.join('');
          const text = plainTextOfHtml(html);
          expect(text.length).toBeLessThanOrEqual(html.length);
          expect(text).not.toMatch(/[\n\r\t]|^ | $| {2}/);
        },
      ),
      { numRuns: 1000 },
    );
  });
});
