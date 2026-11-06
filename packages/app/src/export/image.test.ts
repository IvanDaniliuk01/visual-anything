import { describe, expect, it, vi } from 'vitest';
import type { Rect } from '../canvas/geometry';
import {
  IMAGE_CHUNK,
  IMAGE_MARGIN,
  ImageError,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE,
  chunksOf,
  drawInChunks,
  imageFileName,
  planImage,
  saveImage,
  toPng,
} from './image';

const camera = { x: -100, y: 50, scale: 0.5 };
const viewport = { width: 1200, height: 800 };
const bounds: Rect = { x: 0, y: 0, width: 2000, height: 1000 };

describe('planImage', () => {
  it('draws what is visible as the canvas shows it, at the screen’s size or twice it', () => {
    expect(planImage({ area: 'visible', scale: 1 }, { camera, viewport, bounds })).toEqual({
      ok: true,
      plan: {
        frame: { x: 200, y: -100, width: 2400, height: 1600 },
        pixelsPerUnit: 0.5,
        drawingScale: 0.5,
        width: 1200,
        height: 800,
      },
    });
    expect(planImage({ area: 'visible', scale: 2 }, { camera, viewport, bounds })).toMatchObject({
      plan: { pixelsPerUnit: 1, drawingScale: 0.5, width: 2400, height: 1600 },
    });
  });

  it('draws the whole view with room around it, a pixel or two for each canvas unit', () => {
    const frame = {
      x: -IMAGE_MARGIN,
      y: -IMAGE_MARGIN,
      width: 2000 + 2 * IMAGE_MARGIN,
      height: 1000 + 2 * IMAGE_MARGIN,
    };
    expect(planImage({ area: 'view', scale: 1 }, { camera, viewport, bounds })).toEqual({
      ok: true,
      plan: { frame, pixelsPerUnit: 1, drawingScale: 1, width: 2064, height: 1064 },
    });
    expect(planImage({ area: 'view', scale: 2 }, { camera, viewport, bounds })).toMatchObject({
      plan: { frame, pixelsPerUnit: 2, drawingScale: 1, width: 4128, height: 2128 },
    });
  });

  it('rounds a part of a pixel up, so that nothing of the view is cut off', () => {
    const odd = { x: 0.25, y: 0, width: 100.5, height: 10.1 };
    expect(planImage({ area: 'view', scale: 1 }, { camera, viewport, bounds: odd })).toMatchObject({
      plan: { width: 165, height: 75 },
    });
  });

  it('refuses an image wider or taller than the most a side may be, or larger than the most pixels', () => {
    const wide = { x: 0, y: 0, width: MAX_IMAGE_SIDE, height: 100 };
    expect(planImage({ area: 'view', scale: 1 }, { camera, viewport, bounds: wide })).toEqual({
      ok: false,
      problem: { reason: 'too-large', width: MAX_IMAGE_SIDE + 64, height: 164 },
    });
    const side = Math.ceil(Math.sqrt(MAX_IMAGE_PIXELS));
    const square = { x: 0, y: 0, width: side, height: side };
    expect(
      planImage({ area: 'view', scale: 1 }, { camera, viewport, bounds: square }),
    ).toMatchObject({
      ok: false,
      problem: { reason: 'too-large' },
    });
    const fits = { x: 0, y: 0, width: MAX_IMAGE_SIDE - 64, height: 1000 };
    expect(planImage({ area: 'view', scale: 1 }, { camera, viewport, bounds: fits })).toMatchObject(
      {
        ok: true,
      },
    );
  });

  it('has nothing to draw of an empty view, or of a canvas with no size yet', () => {
    expect(planImage({ area: 'view', scale: 1 }, { camera, viewport, bounds: undefined })).toEqual({
      ok: false,
      problem: { reason: 'empty' },
    });
    expect(
      planImage(
        { area: 'visible', scale: 1 },
        { camera, viewport: { width: 0, height: 0 }, bounds },
      ),
    ).toEqual({ ok: false, problem: { reason: 'not-ready' } });
  });
});

describe('chunksOf', () => {
  it('cuts an image into pieces no larger than a chunk, row by row', () => {
    expect(chunksOf(IMAGE_CHUNK * 2 + 10, 20)).toEqual([
      { x: 0, y: 0, width: IMAGE_CHUNK, height: 20 },
      { x: IMAGE_CHUNK, y: 0, width: IMAGE_CHUNK, height: 20 },
      { x: IMAGE_CHUNK * 2, y: 0, width: 10, height: 20 },
    ]);
    expect(chunksOf(10, 25, 10)).toEqual([
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 0, y: 10, width: 10, height: 10 },
      { x: 0, y: 20, width: 10, height: 5 },
    ]);
  });
});

/** A canvas that records what is drawn on it, as jsdom draws nothing. */
function recordingCanvas() {
  const drawn: [unknown, number, number][] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: (image: unknown, x: number, y: number) => drawn.push([image, x, y]),
    }),
  };
  return { canvas: canvas as unknown as HTMLCanvasElement, drawn };
}

describe('drawInChunks', () => {
  it('draws each piece where it goes in one canvas of the image’s size', () => {
    const { canvas, drawn } = recordingCanvas();
    const plan = {
      frame: { x: 0, y: 0, width: 30, height: 15 },
      pixelsPerUnit: 1,
      drawingScale: 1,
      width: 30,
      height: 15,
    };
    const asked: Rect[] = [];

    const result = drawInChunks(
      plan,
      (chunk) => {
        asked.push(chunk);
        return `piece ${asked.length}` as unknown as CanvasImageSource;
      },
      { make: () => canvas, chunk: 20 },
    );

    expect(result).toBe(canvas);
    expect([canvas.width, canvas.height]).toEqual([30, 15]);
    expect(asked).toEqual([
      { x: 0, y: 0, width: 20, height: 15 },
      { x: 20, y: 0, width: 10, height: 15 },
    ]);
    expect(drawn).toEqual([
      ['piece 1', 0, 0],
      ['piece 2', 20, 0],
    ]);
  });

  it('fails as an image error when the browser has no canvas to draw on', () => {
    const plan = {
      frame: { x: 0, y: 0, width: 1, height: 1 },
      pixelsPerUnit: 1,
      drawingScale: 1,
      width: 1,
      height: 1,
    };
    const blank = { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement;
    expect(() => drawInChunks(plan, () => blank, { make: () => blank })).toThrow(ImageError);
  });
});

describe('toPng', () => {
  it('asks the canvas for a PNG', async () => {
    const png = new Blob(['png'], { type: 'image/png' });
    const canvas = {
      toBlob: vi.fn((done: (blob: Blob | null) => void, type: string) => {
        expect(type).toBe('image/png');
        done(png);
      }),
    } as unknown as HTMLCanvasElement;
    await expect(toPng(canvas)).resolves.toBe(png);
  });

  it('fails as an image error when the browser cannot make one', async () => {
    const canvas = {
      toBlob: (done: (blob: Blob | null) => void) => done(null),
    } as unknown as HTMLCanvasElement;
    await expect(toPng(canvas)).rejects.toBeInstanceOf(ImageError);
  });

  it('encodes at once in a tab in the background, whose browser may put toBlob off (#16)', async () => {
    const bytes =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    // Never called back, as a hidden tab may keep it waiting.
    const toBlob = vi.fn();
    const canvas = {
      toBlob,
      toDataURL: vi.fn((type: string) => `data:${type};base64,${bytes}`),
    } as unknown as HTMLCanvasElement;
    const blob = await toPng(canvas, true);
    expect(toBlob).not.toHaveBeenCalled();
    expect(blob.type).toBe('image/png');
    const read = new Uint8Array(await blob.arrayBuffer());
    expect(btoa(String.fromCharCode(...read))).toBe(bytes);
  });

  it('fails as an image error in the background too when the browser makes no PNG', async () => {
    const canvas = { toDataURL: () => 'data:,' } as unknown as HTMLCanvasElement;
    await expect(toPng(canvas, true)).rejects.toBeInstanceOf(ImageError);
  });
});

describe('imageFileName', () => {
  it('names the image after the project and the view', () => {
    expect(imageFileName('My systems', 'System overview')).toBe('My systems - System overview.png');
  });

  it('leaves out what a file name cannot hold, on any system', () => {
    expect(imageFileName('a/b', 'c:d*e?"f"<g>|h\\i')).toBe('a-b - c-d-e--f--g--h-i.png');
    expect(imageFileName('  ', '..')).toBe('view.png');
    expect(imageFileName('Shop', 'x'.repeat(300)).length).toBeLessThanOrEqual(124);
  });
});

describe('saveImage', () => {
  it('has the browser save the image under its name, and lets go of it after', () => {
    vi.useFakeTimers();
    const blob = new Blob(['png'], { type: 'image/png' });
    const created = vi.fn(() => 'blob:image');
    const revoked = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: created, revokeObjectURL: revoked });
    const clicked: HTMLAnchorElement[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });

    saveImage(blob, 'Shop - Overview.png');

    expect(created).toHaveBeenCalledWith(blob);
    expect(clicked).toHaveLength(1);
    expect(clicked[0]?.download).toBe('Shop - Overview.png');
    expect(clicked[0]?.getAttribute('href')).toBe('blob:image');
    expect(clicked[0]?.isConnected).toBe(false);
    vi.runAllTimers();
    expect(revoked).toHaveBeenCalledWith('blob:image');
    click.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
