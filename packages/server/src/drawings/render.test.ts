import { readFileSync } from 'node:fs';
import { cleanSvg } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { robotoFonts } from './fonts';
import { covers } from './glyphs';
import { renderDrawing } from './render';

const CARD = `<!doctype html>
<html><head><style>
  .card { display: flex; flex-direction: column; padding: 16px; border: 2px solid #1D4F91; border-radius: 12px; background-color: #FFFFFF }
  h2 { margin: 0; color: #1D4F91 }
  .price { font-size: 28px; font-weight: bold }
</style></head>
<body><div class="card"><h2>Basic</h2><p class="price">$10 a month</p><ul><li>One user</li><li>Every feature</li></ul></div></body></html>`;

async function rendered(html: string, width = 400) {
  const outcome = await renderDrawing(html, width);
  if (!outcome.ok) throw new Error(outcome.problem.message);
  return outcome;
}

describe('Roboto', () => {
  it('is the same Roboto the PDF export embeds, with its license beside it', () => {
    const here = (name: string) => readFileSync(new URL(`./fonts/${name}`, import.meta.url));
    const app = (name: string) =>
      readFileSync(new URL(`../../../app/src/export/fonts/${name}`, import.meta.url));
    expect(here('roboto.json').equals(app('roboto.json'))).toBe(true);
    expect(here('LICENSE-roboto.txt').equals(app('LICENSE-roboto.txt'))).toBe(true);
  });

  it('draws Latin text, and no emoji or CJK', () => {
    const { coverage } = robotoFonts();
    for (const character of 'Aé€ñ—')
      expect(covers(coverage, character.codePointAt(0) as number)).toBe(true);
    for (const character of ['😀', '你', '✓']) {
      expect(covers(coverage, character.codePointAt(0) as number)).toBe(false);
    }
  });
});

describe('renderDrawing', () => {
  it('draws a card as SVG of the width asked for, its text as outlines, which the core keeps', async () => {
    const { svg, report } = await rendered(CARD);
    expect(svg).toMatch(/^<svg width="400" height="\d+" viewBox="0 0 400 \d+"/);
    expect(svg).not.toContain('<text');
    expect(report).toEqual([]);
    const cleaned = cleanSvg(svg);
    expect(cleaned.ok).toBe(true);
    if (cleaned.ok) expect(cleaned.value.width).toBe(400);
  });

  it('leaves out characters Roboto lacks rather than drawing empty boxes', async () => {
    const plain = await rendered('<p>Hi</p>');
    const emoji = await rendered('<p>Hi😀</p>');
    expect(emoji.svg).toBe(plain.svg);
    expect(emoji.report).toEqual(['1 character Roboto cannot draw, such as an emoji']);
  });

  it('cuts a page at 4000 pixels high, and says so', async () => {
    const { svg, report } = await rendered('<div style="height: 5000px">x</div>');
    expect(svg).toContain('height="4000"');
    expect(report).toEqual(['The drawing is cut at 4000 pixels high.']);
  });

  it('reports values the layout cannot read, and draws the rest', async () => {
    const { report } = await rendered('<p style="width: 12zz">x</p><p style="height: 3zz">y</p>');
    expect(report).toEqual(['2 style values the layout could not read']);
  });

  it('refuses what the reader refuses', async () => {
    const outcome = await renderDrawing('<div>'.repeat(200), 400);
    expect(outcome).toEqual({
      ok: false,
      problem: { code: 'image-too-large', message: 'The HTML nests elements over 128 deep.' },
    });
  });
});
