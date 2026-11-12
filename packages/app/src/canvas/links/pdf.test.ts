// @vitest-environment node
/**
 * A link card in the PDF (ADR 0098, stage 3): made from the SVG, which wraps the card in a link, so
 * the PDF holds a link to its address over the card, and writes its title; it fetches nothing.
 */
import type { LinkCard } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { writePdf } from '../../export/pdf';
import { loadSample } from '../../test/sample';

const latin1 = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

describe('a link card in the PDF', () => {
  it('holds a link to its address over the card', async () => {
    const project = loadSample();
    const view = project.views[0];
    if (!view) throw new Error('The sample has no view.');
    const card: LinkCard = {
      kind: 'link',
      id: 'guide',
      x: -2000,
      y: -2000,
      width: 320,
      height: 112,
      url: 'https://example.org/intake',
      title: 'The intake guide',
    };
    const views = project.views.map((each) =>
      each === view ? { ...each, freeShapes: [...each.freeShapes, card] } : each,
    );
    const pdf = await writePdf({ ...project, views }, view.id, {
      date: new Date('2026-11-12T12:00:00Z'),
      compress: false,
    });
    const text = latin1(pdf.bytes);
    expect(text).toContain('/URI (https://example.org/intake)');
    expect(pdf.lost).toEqual([]);
  }, 60_000);
});
