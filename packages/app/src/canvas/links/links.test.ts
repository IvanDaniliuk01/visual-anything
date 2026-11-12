/**
 * Link cards in the app (ADR 0098, stage 3), without a browser: the scene draws them as pictures that
 * `link` marks; a card is laid out alike for the canvas and the exports; adding one, giving it a
 * picture and setting its preview are one action each; its address opens only in a new tab; the SVG
 * wraps it in a link; and the read-only page holds its picture.
 */
import {
  cleanMedia,
  decodeBase64,
  type LinkPreview,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { LinkCard, MediaRef } from '@visual-anything/schema';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it, vi } from 'vitest';
import { lostPictures } from '../../export/beyond-lost';
import { gatherPageMedia } from '../../export/page-export';
import { exportedMediaOf } from '../../export/pictures';
import { writeSvg } from '../../export/svg';
import { pageDataOf, readPageData } from '../../viewer/data';
import { loadSample } from '../../test/sample';
import { hitAt, indexScene } from '../hit';
import { embeddedMediaFiles } from '../pictures/media';
import { resizeNoteCommand } from '../resize';
import { buildScene, picturesOf } from '../scene';
import { addLinkCardCommand, linkAddressIn, pictureChanges, previewCommand } from './adding';
import { cardLayout, onAddressLine } from './card';
import { addressAt, openLinkAddress } from './open';

/** A 1 × 1 PNG, as cleaning writes it. */
const PNG = (() => {
  const cleaned = cleanMedia(
    decodeBase64(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    ) as Uint8Array,
  );
  if (!cleaned.ok) throw new Error('The test PNG does not clean.');
  return cleaned;
})();

const WIDE: MediaRef = { hash: 'f'.repeat(64), format: 'jpeg', width: 1200, height: 630, bytes: 9 };

const card = (more: Partial<LinkCard> = {}): LinkCard => ({
  kind: 'link',
  id: 'guide',
  x: -2000,
  y: -2000,
  width: 320,
  height: 280,
  url: 'https://www.example.org/intake',
  title: 'The intake guide',
  description: 'How a patient is received at the front desk.',
  ...more,
});

function withCards(cards: LinkCard[]): { project: ProjectSnapshot; viewId: string } {
  const project = loadSample();
  const view = project.views[0];
  if (!view) throw new Error('The sample has no view.');
  const views = project.views.map((each) =>
    each === view ? { ...each, freeShapes: [...each.freeShapes, ...cards] } : each,
  );
  return { project: { ...project, views }, viewId: view.id };
}

describe('link cards in the scene', () => {
  it('are pictures that link marks, named by their title, their picture their media', () => {
    const { project, viewId } = withCards([card({ picture: PNG.ref }), card({ id: 'bare' })]);
    const scene = buildScene(project, viewId);
    const cards = picturesOf(scene).filter((each) => each.link);
    expect(cards.map((each) => [each.id, each.name, each.link?.host, each.media?.hash])).toEqual([
      ['guide', 'The intake guide', 'example.org', PNG.ref.hash],
      ['bare', 'The intake guide', 'example.org', undefined],
    ]);
    // Picked as pictures are, above the shapes.
    const hit = hitAt(indexScene(scene), { x: -1990, y: -1990 }, 1);
    expect(hit).toMatchObject({ kind: 'picture', picture: { id: 'bare' } });
  });
});

describe('a card’s layout', () => {
  const face = {
    url: 'https://example.org/',
    host: 'example.org',
    title:
      'A title long enough to take more than two lines of a card that is not wide at all, and then some more words still',
    description: 'A description.',
  };

  it('puts its picture whole in a band across its top, then its texts, its host last', () => {
    const rect = { x: 0, y: 0, width: 320, height: 400 };
    const layout = cardLayout(rect, face, WIDE);
    // The band is the picture's height at the card's width.
    expect(layout.band).toEqual({ x: 0, y: 0, width: 320, height: 168 });
    expect(layout.picture).toEqual({ x: 0, y: 0, width: 320, height: 168 });
    expect(layout.texts.map((text) => text.role)).toEqual(['title', 'description', 'host']);
    const [title, , host] = layout.texts;
    expect(title?.bold).toBe(true);
    expect(title?.text.lines[0]?.baseline).toBeGreaterThan(168);
    expect(host?.text.lines.map((line) => line.text)).toEqual(['example.org']);
    expect(layout.address.y + layout.address.height).toBe(400);
  });

  it('leaves 72 units for its text, keeping the picture whole and centered in what is left', () => {
    const layout = cardLayout({ x: 0, y: 0, width: 320, height: 200 }, face, WIDE);
    expect(layout.band?.height).toBe(128);
    expect(layout.picture?.height).toBe(128);
    expect(layout.picture?.x).toBeGreaterThan(0);
    expect(layout.picture?.width).toBeLessThan(320);
  });

  it('cuts its title to two lines, and shows no picture without room for one', () => {
    const narrow = cardLayout({ x: 0, y: 0, width: 160, height: 50 }, face, WIDE);
    expect(narrow.band).toBeUndefined();
    const title = narrow.texts.find((text) => text.role === 'title');
    expect(title?.text.lines.length).toBeLessThanOrEqual(2);
    expect(title?.text.lines.at(-1)?.text.endsWith('…')).toBe(true);
  });

  it('opens from its last line only', () => {
    const rect = { x: 0, y: 0, width: 320, height: 112 };
    const layout = cardLayout(rect, face, undefined);
    expect(onAddressLine(layout, 160, 105)).toBe(true);
    expect(onAddressLine(layout, 160, 20)).toBe(false);
    const picture = { rect, link: face };
    expect(addressAt(picture, { x: 160, y: 105 })).toBe('https://example.org/');
    expect(addressAt(picture, { x: 160, y: 20 })).toBeUndefined();
    expect(addressAt({ rect }, { x: 160, y: 105 })).toBeUndefined();
  });
});

describe('opening a card’s address', () => {
  it('opens it in a new tab, noopener and noreferrer, and never another kind of address', () => {
    const open = vi.fn();
    expect(openLinkAddress('https://example.org/a', open)).toBe(true);
    expect(open).toHaveBeenCalledWith('https://example.org/a', '_blank', 'noopener,noreferrer');
    expect(openLinkAddress('javascript:alert(1)', open)).toBe(false);
    expect(openLinkAddress('data:text/html,hi', open)).toBe(false);
    expect(open).toHaveBeenCalledOnce();
  });
});

describe('adding a card and setting its preview', () => {
  it('takes pasted text that is exactly one web address', () => {
    expect(linkAddressIn('  https://Example.org/a?b=c  ')).toBe('https://example.org/a?b=c');
    expect(linkAddressIn('http://intranet.local/')).toBe('http://intranet.local/');
    expect(linkAddressIn('see https://example.org/')).toBeUndefined();
    expect(linkAddressIn('https://a.org/ https://b.org/')).toBeUndefined();
    expect(linkAddressIn('javascript:alert(1)')).toBeUndefined();
    expect(linkAddressIn('ftp://example.org/')).toBeUndefined();
  });

  it('adds a card at a point, titled after its host', () => {
    expect(addLinkCardCommand('v', 'https://www.example.org/a', { x: 0, y: 0 })).toEqual({
      type: 'create-free-shape',
      view: 'v',
      shape: {
        kind: 'link',
        x: -160,
        y: -56,
        width: 320,
        height: 112,
        url: 'https://www.example.org/a',
        title: 'example.org',
      },
    });
    expect(addLinkCardCommand('v', 'file:///a', { x: 0, y: 0 })).toBeUndefined();
  });

  it('grows a card that had no picture to show one, at most 240 units', () => {
    const bare = card({ height: 112 });
    expect(pictureChanges(bare, WIDE)).toEqual({ picture: WIDE, height: 280 });
    expect(pictureChanges(bare, PNG.ref)).toEqual({ picture: PNG.ref, height: 352 });
    expect(pictureChanges(card({ picture: PNG.ref }), WIDE)).toEqual({ picture: WIDE });
  });

  it('sets what a preview found as one action, and nothing when it found nothing', () => {
    const preview: LinkPreview = { title: 'Intake', description: 'How.', picture: WIDE };
    expect(previewCommand('v', card({ height: 112 }), preview)).toEqual({
      type: 'batch',
      label: 'Fetch the preview of a link card',
      commands: [
        {
          type: 'update-free-shape',
          view: 'v',
          id: 'guide',
          changes: { title: 'Intake', description: 'How.', picture: WIDE, height: 280 },
        },
      ],
    });
    expect(previewCommand('v', card(), {})).toBeUndefined();
  });

  it('stores a card resized by hand as one action named for it, and a video’s for a video', () => {
    const { project, viewId } = withCards([card()]);
    const view = project.views.find((each) => each.id === viewId);
    if (!view) throw new Error('No view.');
    expect(
      resizeNoteCommand(view, 'guide', { x: -2000, y: -2000, width: 400, height: 100 }),
    ).toMatchObject({ label: 'Resize a link card' });
    const video = {
      kind: 'picture' as const,
      id: 'video',
      x: 0,
      y: 0,
      width: 64,
      height: 36,
      media: { ...WIDE, format: 'mp4' as const },
    };
    const withVideo = { ...view, freeShapes: [...view.freeShapes, video] };
    expect(
      resizeNoteCommand(withVideo, 'video', { x: 0, y: 0, width: 128, height: 72 }),
    ).toMatchObject({ label: 'Resize a video' });
  });
});

describe('link cards in the exports and the page', () => {
  it('are drawn in the SVG from their data, inside a link that opens a new tab', async () => {
    const { project, viewId } = withCards([card({ picture: PNG.ref })]);
    const media = await exportedMediaOf(
      project.views,
      embeddedMediaFiles({ [PNG.ref.hash]: PNG.bytes }),
    );
    expect([...media.keys()]).toEqual([PNG.ref.hash]);
    const { text } = writeSvg(project, viewId, { media });
    expect(text).toContain(
      '<a href="https://www.example.org/intake" target="_blank" rel="noopener noreferrer">',
    );
    expect(text).toContain('data-link="https://www.example.org/intake"');
    expect(text).toContain('>The intake guide<');
    expect(text).toContain('>example.org<');
    expect(text).toContain('href="#va-media-1"');
  });

  it('say in Mermaid and Structurizr that they are left out, apart from pictures', () => {
    expect(lostPictures([{}, { link: { url: 'u', host: 'h', title: 't' } }])).toEqual([
      'One picture is left out: pictures are drawn only in the canvas, the PNG, the SVG, the PDF and the read-only page.',
      'One link card is left out: link cards are drawn only in the canvas, the PNG, the SVG, the PDF and the read-only page.',
    ]);
  });

  it('carry their pictures in the read-only page, which reads them strictly', async () => {
    const { project } = withCards([card({ picture: PNG.ref })]);
    const gathered = await gatherPageMedia(
      project,
      embeddedMediaFiles({ [PNG.ref.hash]: PNG.bytes }),
    );
    expect(Object.keys(gathered.media)).toEqual([PNG.ref.hash]);
    const read = readPageData(
      JSON.stringify(pageDataOf(project, { media: gathered.media })),
      validateFile,
    );
    expect(read.ok && Object.keys(read.media ?? {})).toEqual([PNG.ref.hash]);
  });
});
