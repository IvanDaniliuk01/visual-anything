/**
 * Pictures across the app (ADR 0098): the scene draws them under the notes and picks them above the
 * shapes; adding one places it at its size; resizing stores it as one action; the SVG writes each file
 * once and a missing one as a gray box; Mermaid and Structurizr say they leave pictures out; and the
 * read-only page carries their files, read strictly.
 */
import {
  checkMediaFile,
  cleanMedia,
  encodeBase64,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { MediaRef, Picture } from '@visual-anything/schema';
import { validateFile } from '@visual-anything/schema/validate';
import { describe, expect, it } from 'vitest';
import { exportView } from '../../export/exports';
import { exportedMediaOf } from '../../export/pictures';
import { writeSvg } from '../../export/svg';
import { pageDataOf, readPageData } from '../../viewer/data';
import { loadSample } from '../../test/sample';
import { enclosedBy, hitAt, indexScene } from '../hit';
import { resizeNoteCommand } from '../resize';
import { buildScene, picturesOf } from '../scene';
import { addPictureCommand, pictureFilesIn, pictureNameOf } from './adding';
import { embeddedMediaFiles } from './media';
import { gifOf } from './test-gifs';

/** A 1 × 1 PNG, as cleaning writes it. */
const PNG = (() => {
  const raw = Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    ),
    (each) => each.charCodeAt(0),
  );
  const cleaned = cleanMedia(raw);
  if (!cleaned.ok) throw new Error('The test PNG does not clean.');
  return cleaned;
})();

/** A GIF of two frames, as cleaning writes it. */
const GIF = (() => {
  const cleaned = cleanMedia(gifOf([{ indices: [1], delay: 10 }, { indices: [2] }], 0));
  if (!cleaned.ok) throw new Error('The test GIF does not clean.');
  return cleaned;
})();

const MISSING: MediaRef = { hash: 'e'.repeat(64), format: 'png', width: 10, height: 10, bytes: 5 };

/** The sample with pictures in its first view: a PNG, a GIF and one whose file is missing. */
function pictured(): { project: ProjectSnapshot; viewId: string; pictures: Picture[] } {
  const project = loadSample();
  const view = project.views[0];
  if (!view) throw new Error('The sample has no view.');
  const pictures: Picture[] = [
    {
      kind: 'picture',
      id: 'desk',
      x: -2000,
      y: -2000,
      width: 64,
      height: 48,
      media: PNG.ref,
      name: 'Desk',
    },
    { kind: 'picture', id: 'flow', x: -1900, y: -2000, width: 64, height: 64, media: GIF.ref },
    {
      kind: 'picture',
      id: 'lost',
      x: -1800,
      y: -2000,
      width: 64,
      height: 64,
      media: MISSING,
      name: 'Lost one',
    },
    { kind: 'picture', id: 'desk-2', x: -1700, y: -2000, width: 32, height: 24, media: PNG.ref },
  ];
  const views = project.views.map((each) =>
    each === view ? { ...each, freeShapes: [...each.freeShapes, ...pictures] } : each,
  );
  return { project: { ...project, views }, viewId: view.id, pictures };
}

const files = embeddedMediaFiles({ [PNG.ref.hash]: PNG.bytes, [GIF.ref.hash]: GIF.bytes });

describe('the scene', () => {
  it('holds a view’s pictures, picks them by their rectangles and encloses them in a box', () => {
    const { project, viewId } = pictured();
    const scene = buildScene(project, viewId);
    expect(picturesOf(scene).map((each) => [each.id, each.name, each.named])).toEqual([
      ['desk', 'Desk', true],
      ['flow', 'Picture', false],
      ['lost', 'Lost one', true],
      ['desk-2', 'Picture', false],
    ]);
    const indexed = indexScene(scene);
    expect(hitAt(indexed, { x: -1990, y: -1990 }, 1)).toMatchObject({
      kind: 'picture',
      picture: { id: 'desk' },
    });
    const box = { x: -2010, y: -2010, width: 200, height: 100 };
    expect(enclosedBy(indexed, box).pictures.map((each) => each.id)).toEqual(['desk', 'flow']);
    // The scene's bounds hold them.
    expect(scene.bounds?.x).toBeLessThanOrEqual(-2000);
  });
});

describe('adding and resizing', () => {
  it('places a picture with its middle at a point, at its own size within 480', () => {
    const command = addPictureCommand(
      'overview',
      { ...PNG.ref, width: 1600, height: 1200 },
      { x: 100, y: 100 },
      'Desk',
    );
    expect(command).toMatchObject({
      type: 'create-free-shape',
      shape: { kind: 'picture', x: -140, y: -80, width: 480, height: 360, name: 'Desk' },
    });
  });

  it('takes image files only, and names a picture after its file but for a pasted one', () => {
    const file = (name: string, type: string) => new File(['x'], name, { type });
    expect(
      pictureFilesIn([
        file('a.png', 'image/png'),
        file('b.txt', 'text/plain'),
        file('c.svg', ''),
        file('d.bmp', 'image/bmp'),
      ]).map((each) => each.name),
    ).toEqual(['a.png', 'c.svg']);
    expect(pictureNameOf('front desk.jpg', false)).toBe('front desk');
    expect(pictureNameOf('image.png', true)).toBeUndefined();
  });

  it('stores a picture resized by hand as one action named for it', () => {
    const { project, viewId } = pictured();
    const view = project.views.find((each) => each.id === viewId);
    if (!view) throw new Error('No view.');
    const command = resizeNoteCommand(view, 'desk', { x: -2000, y: -2000, width: 128, height: 96 });
    expect(command).toMatchObject({
      type: 'batch',
      label: 'Resize a picture',
      commands: [{ shape: { kind: 'picture', id: 'desk', width: 128, height: 96 } }],
    });
  });
});

describe('the SVG', () => {
  it('writes each file once, a GIF at its first frame, and a missing one as a gray box', async () => {
    const { project, viewId } = pictured();
    const media = await exportedMediaOf(project.views, files);
    expect(media.get(GIF.ref.hash)).toMatchObject({ kind: 'bitmap', format: 'png' });
    const drawing = writeSvg(project, viewId, { media });
    const symbols = drawing.text.match(/<symbol[^>]*id="va-media-\d+"/g) ?? [];
    expect(symbols).toHaveLength(2);
    expect(drawing.text.match(/href="#va-media-1"/g)).toHaveLength(2);
    expect(drawing.text).toContain('data-free-shape="lost"');
    expect(drawing.text).toContain('Lost one');
    expect(drawing.lost).toContain('Pictures whose files are missing are drawn as gray boxes.');
  });

  it('draws every picture as a gray box without the files, as from the command line', async () => {
    const { project, viewId } = pictured();
    const exported = await exportView(project, viewId, 'svg');
    expect(exported.text).not.toContain('va-media-');
    expect(exported.lost).toContain('Pictures whose files are missing are drawn as gray boxes.');
  });
});

describe('Mermaid and Structurizr', () => {
  it('say they leave pictures out', async () => {
    const { project, viewId } = pictured();
    const mermaid = await exportView(project, viewId, 'mermaid');
    expect(mermaid.lost).toContain(
      '4 pictures are left out: pictures are drawn only in the canvas, the PNG, the SVG, the PDF and the read-only page.',
    );
  });
});

describe('the read-only page', () => {
  it('carries the files its pictures name, and reads them back checked', () => {
    const { project } = pictured();
    const data = pageDataOf(project, {
      media: { [PNG.ref.hash]: encodeBase64(PNG.bytes), [GIF.ref.hash]: encodeBase64(GIF.bytes) },
    });
    const read = readPageData(JSON.stringify(data), validateFile);
    expect(read.ok && Object.keys(read.media ?? {}).sort()).toEqual(
      [PNG.ref.hash, GIF.ref.hash].sort(),
    );
  });

  it('refuses a file no picture names, and leaves out one that is not what cleaning writes', () => {
    const { project } = pictured();
    const stray = readPageData(
      JSON.stringify(pageDataOf(project, { media: { ['f'.repeat(64)]: encodeBase64(PNG.bytes) } })),
      validateFile,
    );
    expect(stray.ok).toBe(false);
    // The PNG's bytes under the GIF's name are not its name's.
    const swapped = readPageData(
      JSON.stringify(pageDataOf(project, { media: { [GIF.ref.hash]: encodeBase64(PNG.bytes) } })),
      validateFile,
    );
    expect(swapped.ok && swapped.media).toBeUndefined();
    expect(swapped.ok && swapped.warnings.map((each) => each.code)).toContain('media-not-clean');
    expect(checkMediaFile(PNG.bytes, PNG.ref.hash, 'png').ok).toBe(true);
  });
});
