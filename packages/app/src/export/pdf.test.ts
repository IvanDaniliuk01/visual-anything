// @vitest-environment node
// In Node, as the command line and Claude make PDFs: under jsdom, PDFKit would compress arrays that
// jsdom's TextEncoder makes in another realm, which the browser and Node never hand it.
import { inflateSync } from 'node:zlib';
import type { ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { buildScene } from '../canvas/scene';
import { SAMPLE_VIEW, richSample } from '../test/exports';
import { loadSample } from '../test/sample';
import { LARGEST_PAGE_SIDE, writePdf } from './pdf';
import { SVG_MARGIN, writeSvg } from './svg';

const DATE = new Date(Date.UTC(2026, 9, 25, 12, 0, 0));

/** A PDF's bytes as Latin-1 text, which keeps every byte, to look for its objects in. */
function latin1(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

/** A string as a PDF writes it in its dictionaries: in parentheses, or in UTF-16 when not ASCII. */
function pdfString(text: string): RegExp {
  const escaped = text.replace(/[\\()]/g, (character) => `\\${character}`);
  const utf16 = [...text]
    .map((character) => (character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0'))
    .join('');
  const pattern = escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\(${pattern}\\)|<FEFF${utf16}>`, 'i');
}

/** What the page of a PDF draws: its content stream, inflated. */
function pageContent(bytes: Uint8Array): string {
  const text = latin1(bytes);
  const contents = /\/Type \/Page\n[^]*?\/Contents (\d+) 0 R/.exec(text)?.[1];
  const object = text.indexOf(`\n${contents} 0 obj\n`);
  const start = text.indexOf('stream\n', object) + 'stream\n'.length;
  const end = text.indexOf('\nendstream', start);
  return new TextDecoder('latin1').decode(inflateSync(bytes.subarray(start, end)));
}

describe('writePdf', () => {
  it('draws the view on its page: shapes, lines and text in the embedded fonts', async () => {
    const pdf = await writePdf(richSample(), SAMPLE_VIEW, { date: DATE });
    const content = pageContent(pdf.bytes);
    // Filled and stroked paths, curves, text set in a font, and pictures.
    expect(content).toMatch(/\bB\n/);
    expect(content).toMatch(/ c\n/);
    expect(content).toMatch(/BT\n\/F\d+ 14 Tf/);
    expect(content).toMatch(/\/I\d+ Do/);
    expect(content).toMatch(/\[\d+(\.\d+)? \d+(\.\d+)?\] 0 d/);
  }, 60_000);

  it('makes one page the size of the view, a canvas unit to three quarters of a point', async () => {
    const project = loadSample();
    const scene = buildScene(project, SAMPLE_VIEW);
    const pdf = await writePdf(project, SAMPLE_VIEW, { date: DATE });
    const text = latin1(pdf.bytes);
    expect(text.startsWith('%PDF-1.')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    const bounds = scene.bounds as NonNullable<typeof scene.bounds>;
    expect(pdf.page.width).toBeCloseTo((bounds.width + 2 * SVG_MARGIN) * 0.75);
    expect(pdf.page.height).toBeCloseTo((bounds.height + 2 * SVG_MARGIN) * 0.75);
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(1);
    expect(pdf.lost).toEqual([]);
  }, 60_000);

  it('embeds the fonts it writes in, and takes its title and subject from the view', async () => {
    const project = loadSample();
    const view = project.views.find((each) => each.id === SAMPLE_VIEW);
    const text = latin1((await writePdf(project, SAMPLE_VIEW, { date: DATE })).bytes);
    expect(text).toMatch(/\/BaseFont \/[A-Z]{6}\+Roboto/);
    expect(text).toMatch(/\/BaseFont \/[A-Z]{6}\+Roboto-Bold/);
    expect(text).toMatch(/\/FontFile2/);
    expect(text).toMatch(pdfString(view?.name ?? ''));
    expect(text).toMatch(pdfString(view?.description ?? ''));
    expect(text).toMatch(pdfString('Visual Anything'));
    expect(text).toMatch(/\/DisplayDocTitle true/);
    expect(text).toMatch(pdfString('en'));
  }, 60_000);

  it('attaches the view’s outline, its long description', async () => {
    const outline = '# System overview\n\n- Patient\n';
    const text = latin1(
      (
        await writePdf(loadSample(), SAMPLE_VIEW, {
          date: DATE,
          outline: { text: outline, file: 'My systems - System overview.md' },
        })
      ).bytes,
    );
    expect(text).toMatch(/\/Type \/EmbeddedFile/);
    expect(text).toMatch(pdfString('My systems - System overview.md'));
    expect(text).toMatch(/\/Subtype \/text#2Fmarkdown/);
  }, 60_000);

  it('makes the same file each time from the same view and date', async () => {
    const project = richSample();
    const first = await writePdf(project, SAMPLE_VIEW, { date: DATE });
    const second = await writePdf(project, SAMPLE_VIEW, { date: DATE });
    expect(second.bytes).toEqual(first.bytes);
  }, 60_000);

  it('draws pictures, and says what it lost: characters its font lacks and bitmap silhouettes', async () => {
    const project = richSample();
    const tinted: ProjectSnapshot = {
      ...project,
      model: {
        ...project.model,
        elements: project.model.elements.map((element) =>
          element.id === 'patient'
            ? { ...element, appearance: { image: { image: 'pictures.photo', tint: '#123456' } } }
            : element,
        ),
      },
      views: project.views.map((view) => ({
        ...view,
        freeShapes: view.freeShapes.map((shape) =>
          shape.kind === 'note' ? { ...shape, text: 'Notes in 中文 → too' } : shape,
        ),
      })),
    };
    const pdf = await writePdf(tinted, SAMPLE_VIEW, { date: DATE });
    const text = latin1(pdf.bytes);
    expect(text).toMatch(/\/Subtype \/Image/);
    expect(pdf.lost).toContain('Bitmaps shown as silhouettes are drawn in their own colors.');
    expect(pdf.lost).toContain('The embedded font has no 中 文 →, which show as empty boxes.');
  }, 60_000);

  it('draws the legend of the view’s overlays below the drawing, as text in the embedded fonts', async () => {
    const project = loadSample();
    const overlaid: ProjectSnapshot = {
      ...project,
      views: project.views.map((view) =>
        view.id === SAMPLE_VIEW
          ? {
              ...view,
              overlays: [
                {
                  id: 'team',
                  name: 'Team',
                  of: 'elements',
                  attribute: 'owner',
                  channel: 'fill',
                  mapping: {
                    kind: 'discrete',
                    cases: [{ value: 'Scheduling team', color: '#FFFF00' }],
                    otherwise: '#123456',
                  },
                },
              ],
            }
          : view,
      ),
    };
    const plain = await writePdf(project, SAMPLE_VIEW, { date: DATE });
    const pdf = await writePdf(overlaid, SAMPLE_VIEW, { date: DATE });
    const drawing = writeSvg(overlaid, SAMPLE_VIEW, { bitmaps: ['png', 'jpeg'], filters: false });
    const legend = drawing.legend as NonNullable<typeof drawing.legend>;
    // The page holds the drawing as before, and the legend below it.
    expect(pdf.page.width).toBeCloseTo(plain.page.width);
    expect(pdf.page.height).toBeCloseTo(plain.page.height + legend.height * 0.75);
    const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;
    const content = pageContent(pdf.bytes);
    const before = pageContent(plain.bytes);
    // The legend's title, subtitle and two entries, each set as text; its title at 13.
    expect(count(content, /\bBT\n/g)).toBeGreaterThanOrEqual(count(before, /\bBT\n/g) + 4);
    expect(count(content, /BT\n\/F\d+ 13 Tf/g)).toBe(count(before, /BT\n\/F\d+ 13 Tf/g) + 1);
    expect(pdf.lost).toEqual([]);
  }, 60_000);

  it('scales a view too large for a page down to the largest page readers open', async () => {
    const project = loadSample();
    const wide: ProjectSnapshot = {
      ...project,
      views: project.views.map((view) => ({
        ...view,
        freeShapes: [
          ...view.freeShapes,
          { kind: 'note', id: 'far', x: 40_000, y: 0, width: 200, height: 80, text: 'Far away' },
        ],
      })),
    };
    const pdf = await writePdf(wide, SAMPLE_VIEW, { date: DATE });
    expect(pdf.page.width).toBeCloseTo(LARGEST_PAGE_SIDE);
    expect(pdf.page.height).toBeLessThan(LARGEST_PAGE_SIDE);
    expect(pdf.lost.join(' ')).toMatch(/Drawn at \d+(\.\d)?% of its size/);
  }, 60_000);
});
