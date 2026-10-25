/**
 * PNG export of the open view (R27): what an image shows and how large it is, how it is drawn in
 * pieces that any GPU can hold, and how the browser saves it. The renderer draws it
 * (`CanvasRenderer.exportImage`); the local program writes nothing.
 *
 * "What is visible" is the canvas as it shows now, at the screen's size (1×) or twice it (2×). "The
 * whole view" is everything the view draws, with some room around it, at one pixel for each canvas
 * unit (1×) or two (2×). Either is drawn in the current theme, with what filters and focus hide or dim,
 * and without the marks of the selection, of guidance or of a gesture.
 */
import { visibleRect, type Camera } from '../canvas/camera';
import { grow, type Rect, type Size } from '../canvas/geometry';

/** What an image shows: what the canvas shows now, or the whole view. */
export type ImageArea = 'visible' | 'view';

/** How many pixels the image has for each pixel of the screen, or each canvas unit of the view. */
export type ImageScale = 1 | 2;

export interface ImageRequest {
  area: ImageArea;
  scale: ImageScale;
}

/** The most pixels an image has on a side, as most GPUs and browsers can draw. */
export const MAX_IMAGE_SIDE = 16_384;

/** The most pixels an image has in all: 64 megapixels, a quarter of a gigabyte while it is drawn. */
export const MAX_IMAGE_PIXELS = 64_000_000;

/** The room left around the whole view, in canvas units. */
export const IMAGE_MARGIN = 32;

/** The side of the pieces an image is drawn in, in pixels: within what every GPU can hold. */
export const IMAGE_CHUNK = 2048;

/** How an image is drawn. */
export interface ImagePlan {
  /** What it shows, in canvas units. */
  frame: Rect;
  /** How many of its pixels each canvas unit takes. */
  pixelsPerUnit: number;
  /**
   * The scale the canvas would draw at to show it at 1×, which sets how much it writes: names and
   * details as the canvas writes them at that scale.
   */
  drawingScale: number;
  /** Its size in pixels. */
  width: number;
  height: number;
}

/** Why an image cannot be drawn. */
export type ImageProblem =
  /** The canvas has not started, or has no size yet. */
  | { reason: 'not-ready' }
  /** The view draws nothing. */
  | { reason: 'empty' }
  /** It would be larger than {@link MAX_IMAGE_SIDE} or {@link MAX_IMAGE_PIXELS}. */
  | { reason: 'too-large'; width: number; height: number }
  /** The browser could not draw it or make the PNG. */
  | { reason: 'failed'; detail: string };

/** An image that cannot be drawn, and why. */
export class ImageError extends Error {
  override name = 'ImageError';

  constructor(readonly problem: ImageProblem) {
    super(describeProblem(problem));
  }
}

function describeProblem(problem: ImageProblem): string {
  switch (problem.reason) {
    case 'not-ready':
      return 'The canvas is not ready to draw an image.';
    case 'empty':
      return 'The view draws nothing.';
    case 'too-large':
      return `The image would be ${problem.width} × ${problem.height} pixels, more than ${MAX_IMAGE_SIDE} a side or ${MAX_IMAGE_PIXELS} in all.`;
    case 'failed':
      return `The image could not be drawn: ${problem.detail}`;
  }
}

/** What the canvas shows when an image is asked for. */
export interface ImageSeen {
  camera: Camera;
  /** The canvas's size on screen, in CSS pixels. */
  viewport: Size;
  /** Where everything the view draws lies, in canvas units; none when it draws nothing. */
  bounds: Rect | undefined;
}

/** How an image would be drawn, or why it cannot be. */
export function planImage(
  request: ImageRequest,
  { camera, viewport, bounds }: ImageSeen,
): { ok: true; plan: ImagePlan } | { ok: false; problem: ImageProblem } {
  let plan: ImagePlan;
  if (request.area === 'visible') {
    if (viewport.width <= 0 || viewport.height <= 0 || !(camera.scale > 0)) {
      return { ok: false, problem: { reason: 'not-ready' } };
    }
    plan = {
      frame: visibleRect(camera, viewport),
      pixelsPerUnit: camera.scale * request.scale,
      drawingScale: camera.scale,
      width: Math.ceil(viewport.width * request.scale),
      height: Math.ceil(viewport.height * request.scale),
    };
  } else {
    if (bounds === undefined) return { ok: false, problem: { reason: 'empty' } };
    const frame = grow(bounds, IMAGE_MARGIN);
    plan = {
      frame,
      pixelsPerUnit: request.scale,
      drawingScale: 1,
      width: Math.ceil(frame.width * request.scale),
      height: Math.ceil(frame.height * request.scale),
    };
  }
  const { width, height } = plan;
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_IMAGE_PIXELS) {
    return { ok: false, problem: { reason: 'too-large', width, height } };
  }
  return { ok: true, plan };
}

/** The pieces an image of this size is drawn in, row by row, none larger than `size` a side. */
export function chunksOf(width: number, height: number, size = IMAGE_CHUNK): Rect[] {
  const chunks: Rect[] = [];
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      chunks.push({ x, y, width: Math.min(size, width - x), height: Math.min(size, height - y) });
    }
  }
  return chunks;
}

/**
 * Draws an image piece by piece into one canvas of its size: `draw` gives each piece's pixels, its
 * rectangle given in the image's pixels.
 */
export function drawInChunks(
  plan: ImagePlan,
  draw: (chunk: Rect) => CanvasImageSource,
  { make = () => document.createElement('canvas'), chunk = IMAGE_CHUNK } = {},
): HTMLCanvasElement {
  const canvas = make();
  canvas.width = plan.width;
  canvas.height = plan.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new ImageError({ reason: 'failed', detail: 'the browser has no canvas to draw it on.' });
  }
  for (const piece of chunksOf(plan.width, plan.height, chunk)) {
    context.drawImage(draw(piece), piece.x, piece.y);
  }
  return canvas;
}

/** The PNG of a canvas. */
export function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else
        reject(new ImageError({ reason: 'failed', detail: 'the browser could not make a PNG.' }));
    }, 'image/png');
  });
}

/** The longest name a file gets before its extension. */
const MAX_NAME = 120;

/**
 * The name the image is saved under: the project's and the view's, without what Windows, macOS or
 * Linux cannot hold in a file name.
 */
export function imageFileName(project: string, view: string): string {
  const clean = (text: string) =>
    text
      // eslint-disable-next-line no-control-regex -- control characters cannot be in a file name
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '-')
      .trim()
      .replace(/^\.+|\.+$/g, '');
  const parts = [clean(project), clean(view)].filter((part) => part !== '');
  const name = parts.join(' - ').slice(0, MAX_NAME).trim();
  return `${name === '' ? 'view' : name}.png`;
}

/** How long the browser has to start saving before the image is let go. */
const RELEASE_AFTER = 60_000;

/** Has the browser save an image, as it saves a download; nothing reaches the local program. */
export function saveImage(blob: Blob, name: string, target: Document = document): void {
  const address = URL.createObjectURL(blob);
  const link = target.createElement('a');
  link.href = address;
  link.download = name;
  link.hidden = true;
  target.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(address), RELEASE_AFTER);
  }
}
