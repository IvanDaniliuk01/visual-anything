/**
 * The painter of exports' solids in the app (ADR 0075): the solid worker draws each picture through the
 * app's solid client, and the browser's canvas reads its pixels. Only the app imports it; the local
 * program has no GPU, and its exports draw placeholders.
 */
import type { SolidClient } from '../solids/solid-client';
import { SOLID_PICTURES_WAIT, type SolidPainter, type SolidPixels } from './solid-pictures';

/** The pixels of a picture the worker drew, which the browser holds as an `ImageBitmap`. */
export function bitmapPixels(bitmap: ImageBitmap): SolidPixels {
  const { width, height } = bitmap;
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height });
  const context = canvas.getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!context) throw new Error('The browser has no canvas to read a solid’s picture on.');
  context.drawImage(bitmap, 0, 0);
  return { width, height, pixels: context.getImageData(0, 0, width, height).data };
}

/**
 * The painter of the app's solid client: it waits for each picture at most `wait` milliseconds, and
 * reads its pixels with `pixelsOf`, the browser's canvas by default.
 */
export function solidPainterOf(
  client: SolidClient,
  pixelsOf: (bitmap: ImageBitmap) => SolidPixels = bitmapPixels,
  wait = SOLID_PICTURES_WAIT,
): SolidPainter {
  return {
    async paint(asks) {
      if (asks.length === 0) return [];
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<undefined[]>((resolve) => {
        timer = setTimeout(() => resolve(asks.map(() => undefined)), wait);
      });
      const drawn = await Promise.race([client.draw(asks), late]);
      clearTimeout(timer);
      return drawn.map((picture) => {
        if (!picture) return undefined;
        try {
          return {
            ...pixelsOf(picture.bitmap),
            ...(picture.partBuffer ? { partBuffer: picture.partBuffer } : {}),
          };
        } catch {
          return undefined;
        }
      });
    },
  };
}
