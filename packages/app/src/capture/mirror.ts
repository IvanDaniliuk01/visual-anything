/**
 * A canvas off screen, for a picture Claude asks for in the other theme than the tab's (ADR 0081): a
 * renderer of its own, started in that theme in a host outside the window, given what the tab's
 * canvas draws from (its scene, emphasis, overlays' legend, package code's drawings and comparison),
 * and the camera of the tab for what it shows now. It draws one frame, then the picture through the
 * PNG export's path, and goes. The person's canvas is never touched: it does not move or flicker.
 */
import { MAX_CAPTURE_WAIT } from '../canvas/capture';
import type { Camera } from '../canvas/camera';
import type { Size } from '../canvas/geometry';
import {
  CanvasRenderer,
  type CaptureImage,
  type DrawnFrom,
  type DrawnImage,
} from '../canvas/renderer';
import type { CanvasTheme } from '../theme/themes';
import { ImageError } from '../export/image';

/** How long the canvas off screen has to start, in milliseconds. */
export const MIRROR_START_WAIT = 10_000;

/** What the tab's canvas shows, for a picture of what it shows now. */
export interface MirrorView {
  camera: Camera;
  viewport: Size;
}

/**
 * Draws a picture off screen in `theme`, from what the tab's canvas draws. With `view`, it looks
 * where the tab's canvas looks, at the tab's size, as a picture of what it shows now needs.
 */
export async function drawOffScreen(
  from: DrawnFrom,
  theme: CanvasTheme,
  image: CaptureImage,
  view?: MirrorView,
  target: Document = document,
): Promise<DrawnImage> {
  const indexed = from.indexed;
  if (indexed === undefined) throw new ImageError({ reason: 'not-ready' });
  const host = target.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  const size = view?.viewport ?? { width: image.width, height: image.height };
  Object.assign(host.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    width: `${Math.max(1, Math.round(size.width))}px`,
    height: `${Math.max(1, Math.round(size.height))}px`,
    pointerEvents: 'none',
  });
  target.body.append(host);
  let renderer: CanvasRenderer | undefined;
  try {
    let failed: (error: unknown) => void = () => {};
    const ready = new Promise<void>((resolve, reject) => {
      failed = reject;
      renderer = new CanvasRenderer(
        host,
        { onFailure: (error) => failed(error), onThemeShown: () => resolve() },
        { theme, firstFit: 'whole' },
      );
    });
    await within(ready, MIRROR_START_WAIT, 'The canvas off screen did not start in time.');
    const mirror = renderer as unknown as CanvasRenderer;
    if (from.codeDrawings !== undefined) mirror.setCodeDrawings(from.codeDrawings);
    mirror.setLegend(from.legend);
    if (from.comparison !== undefined) mirror.setComparison(from.comparison);
    mirror.setEmphasis(from.emphasis);
    mirror.show(indexed);
    if (view !== undefined) mirror.setCamera(view.camera);
    // One frame, as the canvas draws one before an image: what it plans and the pictures it makes.
    await new Promise<void>((resolve) => {
      let stop: () => void = () => {};
      const timer = setTimeout(() => {
        stop();
        resolve();
      }, MAX_CAPTURE_WAIT);
      stop = mirror.afterNextFrame(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    return await mirror.captureImage(image);
  } finally {
    renderer?.destroy();
    host.remove();
  }
}

/** A promise, or a failure once `ms` milliseconds pass. */
function within<T>(promise: Promise<T>, ms: number, why: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(why)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
