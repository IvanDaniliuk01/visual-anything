/**
 * A read-only page holds no explorable's page (ADR 0107, ADR 0041): only what draws its card, its
 * definition's name, description and script libraries' names, and nothing of its text, which never
 * travels in a page; its policy and its scripts are those of any page.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeBase64, type ProjectSnapshot } from '@visual-anything/core';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { translatorFor } from '../i18n';
import { pageDataOf, readPageData, type PageExplorableStill } from './data';
import { PageExplorables } from './explorables';
import { writePage, type ViewerAssets } from './page';

const ASSETS: ViewerAssets = {
  script: 'document.body.dataset.viewer = "ready";',
  style: ':root { color: CanvasText; }',
};

const TEXT = readFileSync(
  join(import.meta.dirname, '../../../../examples/quadratic-function/explorables/quadratic.html'),
  'utf8',
);

/** The quadratic sample with its explorable's text, as the program holds it, and a loose one. */
function quadratic(): ProjectSnapshot {
  const project = loadSample('quadratic-function');
  return {
    ...project,
    explorableTexts: [{ id: 'quadratic.parabola', text: TEXT }],
    views: project.views.map((view, at) =>
      at === 0
        ? {
            ...view,
            freeShapes: [
              ...view.freeShapes,
              {
                kind: 'explorable',
                id: 'loose-parabola',
                x: 0,
                y: 600,
                width: 320,
                height: 200,
                explorable: 'quadratic.parabola',
              },
            ],
          }
        : view,
    ),
  };
}

describe('a read-only page of a project with explorables', () => {
  it('holds what draws the card, and nothing of the explorable’s page', async () => {
    const data = pageDataOf(quadratic());
    const json = JSON.stringify(data);
    expect(json).not.toContain('explorableTexts');
    expect(json).not.toContain('va.on(');
    expect(json).toContain('"name":"Parabola"');
    const { html } = await writePage({ assets: ASSETS, data, title: 'Quadratic' });
    expect(html).not.toContain('va.on(');
    expect(html).not.toMatch(/<iframe\b/i);
    // Its scripts are the page's own: the policy's, the data and the viewer.
    expect([...html.matchAll(/<script\b/gi)]).toHaveLength(3);
    expect(readPageData(dataOf(html), validateFile).ok).toBe(true);
  });
});

describe('a read-only page’s stills of explorables', () => {
  const VIEW = 'the-function';
  const still = (overrides: Partial<PageExplorableStill> = {}): PageExplorableStill => ({
    view: VIEW,
    spot: 'loose-parabola',
    explorable: 'quadratic.parabola',
    theme: 'light',
    png: encodeBase64(png(512, 3)),
    ...overrides,
  });
  const read = (project: ProjectSnapshot, stills: unknown[]) =>
    readPageData(
      JSON.stringify({ ...pageDataOf(project), explorableStills: stills }),
      validateFile,
    );

  it('holds the stills the tab keeps, each read strictly as a PNG of a still’s width', () => {
    const data = pageDataOf(quadratic(), { explorableStills: [still()] });
    const opened = readPageData(JSON.stringify(data), validateFile);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.explorableStills).toEqual([
      expect.objectContaining({
        view: VIEW,
        spot: 'loose-parabola',
        theme: 'light',
        width: 512,
        height: 3,
      }),
    ]);
    // A page without stills writes none.
    expect(JSON.stringify(pageDataOf(quadratic(), { explorableStills: [] }))).not.toContain(
      'explorableStills',
    );
  });

  it('takes a still of an element’s shape that shows the explorable', () => {
    const opened = read(withVertexShowing(quadratic()), [
      still({ spot: 'quadratic-function/vertex', theme: 'dark' }),
    ]);
    expect(opened.ok && opened.explorableStills?.length).toBe(1);
  });

  it('leaves out, with a warning, a still that is not a clean PNG of a still’s width', () => {
    const opened = read(quadratic(), [
      still({ png: encodeBase64(png(300, 2)) }),
      still({ theme: 'dark', png: encodeBase64(new TextEncoder().encode('<svg/>')) }),
    ]);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.explorableStills).toBeUndefined();
    expect(opened.warnings.filter((each) => each.code === 'media-not-clean')).toHaveLength(2);
  });

  it('refuses stills of places no view shows the explorable in, or that are not only data', () => {
    const refused = (stills: unknown[]) => expect(read(quadratic(), stills).ok).toBe(false);
    refused([still({ spot: 'nowhere' })]);
    refused([still({ view: 'no-view' })]);
    refused([still({ explorable: 'quadratic.other' })]);
    refused([still({ spot: 'quadratic-function/vertex' })]);
    refused([still(), still()]);
    refused([{ ...still(), script: 'alert(1)' }]);
    refused([still({ theme: 'sepia' as 'light' })]);
    refused([still({ png: 'A'.repeat(2 * 1024 * 1024) })]);
    refused(new Array(257).fill(still()));
  });

  it('draws the still the page holds where it holds one, and the card that says why elsewhere', async () => {
    const decoded: Uint8Array[] = [];
    const page = new PageExplorables(
      [
        {
          view: VIEW,
          spot: 'loose-parabola',
          explorable: 'quadratic.parabola',
          theme: 'light',
          png: png(512, 3),
          width: 512,
          height: 3,
        },
      ],
      (bytes) => {
        decoded.push(bytes);
        return Promise.resolve({ decoded: true });
      },
    );
    let changed = 0;
    page.listen(() => (changed += 1));
    page.update({ project: quadratic(), view: VIEW, theme: 'light', t: translatorFor('es') });
    expect(page.face('quadratic.parabola')).toMatchObject({
      name: 'Parabola',
      runs: false,
      why: translatorFor('es')('It runs only in the Visual Anything app, which shows it live.'),
    });
    const spot = {
      spot: 'loose-parabola',
      explorable: 'quadratic.parabola',
      width: 320,
      height: 200,
      bucket: 512 as const,
      distance: 0,
    };
    expect(page.still(spot)).toBeUndefined();
    await Promise.resolve();
    expect(changed).toBe(1);
    expect(page.still(spot)).toMatchObject({ width: 512, height: 3, picture: { decoded: true } });
    expect(decoded).toHaveLength(1);
    page.update({ project: quadratic(), view: VIEW, theme: 'dark', t: translatorFor('en') });
    expect(page.still(spot)).toBeUndefined();
    expect(page.still({ ...spot, spot: 'the-parabola' })).toBeUndefined();
  });
});

/** The quadratic sample's vertex, a plain shape, showing the parabola too. */
function withVertexShowing(project: ProjectSnapshot): ProjectSnapshot {
  return {
    ...project,
    model: {
      ...project.model,
      elements: project.model.elements.map((element) =>
        element.id === 'vertex'
          ? {
              ...element,
              appearance: {
                ...element.appearance,
                explorable: { explorable: 'quadratic.parabola' },
              },
            }
          : element,
      ),
    },
  };
}

// ——— A PNG of 8-bit RGBA pixels, stored without compression ———

function crc32(bytes: readonly number[]): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const be32 = (value: number) => [
  value >>> 24,
  (value >>> 16) & 255,
  (value >>> 8) & 255,
  value & 255,
];
function chunk(type: string, data: number[]): number[] {
  const body = [...type].map((char) => char.charCodeAt(0)).concat(data);
  return [...be32(data.length), ...body, ...be32(crc32(body))];
}
function adler32(bytes: readonly number[]): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}
function png(width: number, height: number): Uint8Array {
  const raw: number[] = [];
  for (let y = 0; y < height; y += 1) raw.push(0, ...new Array<number>(width * 4).fill(128));
  const stored = [0x78, 0x01, 1, raw.length & 255, raw.length >>> 8];
  stored.push(~raw.length & 255, (~raw.length >>> 8) & 255, ...raw, ...be32(adler32(raw)));
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', [...be32(width), ...be32(height), 8, 6, 0, 0, 0]),
    ...chunk('IDAT', stored),
    ...chunk('IEND', []),
  ]);
}

function dataOf(html: string): string {
  const found = /<script type="application\/json" id="[^"]+">([\s\S]*?)<\/script>/.exec(html);
  if (!found) throw new Error('The page holds no data.');
  return found[1] ?? '';
}
