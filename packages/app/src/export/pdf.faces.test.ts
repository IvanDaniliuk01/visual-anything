// @vitest-environment node
/**
 * Faces in the PDF (ADR 0083, F3): made from the SVG, which draws each face as the canvas does, so the
 * PDF draws it whole, in the Roboto styles its runs use, embedded, and loses nothing of it.
 */
import { describe, expect, it } from 'vitest';
import { FACES_VIEW, facedProject } from '../test/faces';
import { writePdf } from './pdf';
import { writeSvg } from './svg';

const DATE = new Date('2026-10-30T12:00:00Z');
const latin1 = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);
const fonts = (bytes: Uint8Array) =>
  [...latin1(bytes).matchAll(/\/BaseFont \/[A-Z]{6}\+([A-Za-z-]+)/g)].map((match) => match[1]);

describe('faces in the PDF (ADR 0083)', () => {
  it('draws the faces the SVG draws, embedding the Roboto styles their runs use', async () => {
    const project = facedProject();
    const svg = writeSvg(project, FACES_VIEW);
    const pdf = await writePdf(project, FACES_VIEW, { date: DATE, compress: false });
    // A column's name in Roboto Mono, its type in Roboto Italic, a name in Roboto Bold.
    const embedded = fonts(pdf.bytes);
    expect(embedded).toContain('Roboto-Bold');
    expect(embedded).toContain('Roboto-Italic');
    expect(embedded.some((name) => name?.startsWith('RobotoMono'))).toBe(true);
    // The page is the drawing's size, and nothing of it was lost.
    expect(pdf.page.width).toBeCloseTo(svg.viewBox.width * 0.75, 1);
    expect(pdf.page.height).toBeCloseTo(svg.viewBox.height * 0.75, 1);
    expect(pdf.lost).toEqual(svg.lost);
  }, 60_000);

  it('writes the same PDF each time', async () => {
    const project = facedProject({ collapsed: true });
    const once = await writePdf(project, FACES_VIEW, { date: DATE });
    const again = await writePdf(structuredClone(project), FACES_VIEW, { date: DATE });
    expect(again.bytes).toEqual(once.bytes);
  }, 60_000);
});
