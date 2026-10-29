// @vitest-environment node
// In Node, as the command line makes PDFs (see pdf.test.ts).
import { describe, expect, it } from 'vitest';
import { comparedSample, VIEW } from '../test/comparison';
import { writeComparisonPdf } from './comparison';

/** A string as a PDF writes it in its dictionaries: in parentheses, or in UTF-16 when not ASCII. */
function pdfString(text: string): RegExp {
  const escaped = text.replace(/[\\()]/g, (character) => `\\${character}`);
  const utf16 = [...text]
    .map((character) => (character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0'))
    .join('');
  const pattern = escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\(${pattern}\\)|<FEFF${utf16}>`, 'i');
}

describe('writeComparisonPdf', () => {
  it('makes a PDF of the comparison’s drawing, from its SVG as it is', async () => {
    const { older, newer, comparison } = comparedSample();
    const pdf = await writeComparisonPdf(older, newer, VIEW, comparison, {
      title: 'Compared with HEAD',
      compress: false,
      date: new Date(Date.UTC(2026, 9, 29)),
    });
    const text = new TextDecoder('latin1').decode(pdf.bytes);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toMatch(pdfString('Compared with HEAD: System overview, Comparison'));
    expect(pdf.lost).toEqual([]);
  }, 60_000);
});
