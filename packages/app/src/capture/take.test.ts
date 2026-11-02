/**
 * How the tab the person used last takes a picture for Claude (ADR 0081): of the view its canvas
 * draws only, framed and sized as asked, drawn by the canvas in its own theme or off screen in the
 * other, and sent as base64 within the cap, or with why it took none.
 */
import { MAX_CAPTURE_BYTES, type CaptureAsk } from '@visual-anything/core';
import { describe, expect, it, vi } from 'vitest';
import type { IndexedScene } from '../canvas/hit';
import type { CaptureImage } from '../canvas/renderer';
import { ImageError } from '../export/image';
import { IMAGE_MARGIN } from '../export/image';
import { takeCapture, type CaptureCanvas } from './take';

/** A scene of two shapes, holding only what framing reads. */
const indexed = {
  scene: { bounds: { x: 0, y: 0, width: 936, height: 436 }, notes: [], arrows: [] },
  byElement: new Map([
    ['api', [{ key: 'api', rect: { x: 0, y: 0, width: 200, height: 100 } }]],
    ['db', [{ key: 'db', rect: { x: 736, y: 336, width: 200, height: 100 } }]],
  ]),
} as unknown as IndexedScene;

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function canvas(change: Partial<CaptureCanvas> = {}) {
  const drawn: { theme: string; image: CaptureImage }[] = [];
  const draw = (theme: string) => (image: CaptureImage) => {
    drawn.push({ theme, image });
    return Promise.resolve({
      blob: new Blob([PNG_BYTES], { type: 'image/png' }),
      width: image.width,
      height: image.height,
    });
  };
  const target: CaptureCanvas = {
    view: 'overview',
    theme: 'light',
    seen: () => ({
      indexed,
      camera: { x: 0, y: 0, scale: 1 },
      viewport: { width: 1000, height: 500 },
      hidden: new Set(),
    }),
    draw: draw('light'),
    drawIn: (theme, image) => draw(theme)(image),
    ...change,
  };
  return { target, drawn };
}

const ASK: CaptureAsk = { view: 'overview', region: 'whole', width: 1000 };

describe('takeCapture', () => {
  it('draws the whole view at the width asked for, and sends it as base64', async () => {
    const { target, drawn } = canvas();
    const taken = await takeCapture(ASK, target);
    const width = 936 + 2 * IMAGE_MARGIN;
    expect(drawn).toEqual([
      {
        theme: 'light',
        image: {
          frame: { x: -IMAGE_MARGIN, y: -IMAGE_MARGIN, width, height: 436 + 2 * IMAGE_MARGIN },
          pixelsPerUnit: 1000 / width,
          width: 1000,
          height: Math.round((436 + 2 * IMAGE_MARGIN) * (1000 / width)),
          asShown: false,
          whole: true,
        },
      },
    ]);
    expect(taken).toEqual({
      picture: {
        png: btoa(String.fromCharCode(...PNG_BYTES)),
        width: 1000,
        height: drawn[0]?.image.height,
        view: 'overview',
        theme: 'light',
        scale: 1000 / width,
      },
    });
  });

  it('pictures the view the canvas draws when none is named, and never another', async () => {
    const { target } = canvas();
    expect(await takeCapture({ region: 'whole', width: 600 }, target)).toMatchObject({
      picture: { view: 'overview' },
    });
    expect(await takeCapture({ ...ASK, view: 'billing' }, target)).toEqual({
      failed: 'other-view',
      shows: 'overview',
    });
  });

  it('draws in the other theme off screen, and in its own on the canvas', async () => {
    const { target, drawn } = canvas();
    await takeCapture({ ...ASK, theme: 'dark' }, target);
    await takeCapture({ ...ASK, theme: 'light' }, target);
    expect(drawn.map((each) => each.theme)).toEqual(['dark', 'light']);
  });

  it('frames the elements named, and names those with no shape drawn', async () => {
    const { target, drawn } = canvas();
    const taken = await takeCapture({ ...ASK, region: ['api', 'ghost'] }, target);
    expect(drawn[0]?.image.whole).toBe(false);
    expect(taken).toMatchObject({ picture: { missing: ['ghost'] } });
  });

  it('says why it took none: no canvas, nothing drawn, nothing to frame', async () => {
    expect(await takeCapture(ASK, canvas({ seen: () => undefined }).target)).toEqual({
      failed: 'no-canvas',
    });
    expect(await takeCapture({ ...ASK, region: ['ghost'] }, canvas().target)).toEqual({
      failed: 'not-drawn',
    });
    const empty = {
      ...indexed,
      scene: { bounds: undefined, notes: [], arrows: [] },
    } as unknown as IndexedScene;
    const nothing = canvas({
      seen: () => ({
        indexed: empty,
        camera: { x: 0, y: 0, scale: 1 },
        viewport: { width: 1, height: 1 },
        hidden: new Set(),
      }),
    });
    expect(await takeCapture(ASK, nothing.target)).toEqual({ failed: 'empty' });
  });

  it('refuses a picture past 4 MiB in base64, saying how large it would be', async () => {
    const large = 3 * 1024 * 1024 + 1;
    const { target } = canvas({
      draw: () =>
        Promise.resolve({ blob: new Blob([new Uint8Array(large)]), width: 2048, height: 4096 }),
    });
    const taken = await takeCapture(ASK, target);
    expect(taken).toEqual({ failed: 'too-large', bytes: 4 * Math.ceil(large / 3) });
    expect((taken as { bytes: number }).bytes).toBeGreaterThan(MAX_CAPTURE_BYTES);
  });

  it('says why drawing failed, in a few words', async () => {
    const failing = (error: Error) => canvas({ draw: vi.fn(() => Promise.reject(error)) }).target;
    expect(await takeCapture(ASK, failing(new ImageError({ reason: 'not-ready' })))).toEqual({
      failed: 'no-canvas',
    });
    expect(await takeCapture(ASK, failing(new Error('No WebGL.')))).toEqual({
      failed: 'failed',
      why: 'No WebGL.',
    });
    const long = await takeCapture(ASK, failing(new Error('x'.repeat(900))));
    expect(long).toEqual({ failed: 'failed', why: `${'x'.repeat(499)}…` });
  });
});
