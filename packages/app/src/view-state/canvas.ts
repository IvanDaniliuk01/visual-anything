/**
 * What the view state reads of the canvas, and how it moves the camera: the canvas area hands one to
 * the shell once its canvas is made. Bringing a shape into sight moves the camera there in a short,
 * eased glide, or at once when the system asks for reduced motion or the move is too small to see.
 */
import type { Camera } from '../canvas/camera';
import type { CanvasController } from '../canvas/controller';
import type { Size } from '../canvas/geometry';

/** The canvas's camera, as the view state reads and moves it. */
export interface CanvasCamera {
  /** Where the camera is; absent until the canvas has drawn its first frame. */
  camera(): Camera | undefined;
  /** The canvas's size on screen, in pixels. */
  viewport(): Size;
  /** Moves the camera at once, stopping any glide. */
  setCamera(camera: Camera): void;
  /** Calls `listener` each time the camera moves, until the function it returns is called. */
  subscribe: (listener: () => void) => () => void;
  /**
   * Brings a shape into sight as the canvas does when it is chosen in the outline, and makes it the
   * one the keys move on from: an element shape by its key, a relation or a free shape by its id.
   * With `glide`, the camera moves there over a moment instead of at once.
   */
  reveal(key: string, glide: boolean): void;
}

/** Where the camera is, as the canvas area keeps it for what follows it. */
export interface CameraSource {
  current(): Camera | undefined;
  subscribe(listener: () => void): () => void;
}

/** The frames a glide moves on with: the browser's by default. */
export interface Frames {
  request(callback: (time: number) => void): number;
  cancel(handle: number): void;
  now(): number;
}

const BROWSER_FRAMES: Frames = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
  now: () => performance.now(),
};

/** How long a glide takes, in milliseconds: short, so that it reads as a move and not a flight. */
export const GLIDE_TIME = 320;

/** The canvas camera of a canvas area's controller. */
export function canvasCamera(
  controller: Pick<CanvasController, 'camera' | 'reveal' | 'zoomBy' | 'renderer'>,
  cameras: CameraSource,
  frames: Frames = BROWSER_FRAMES,
): CanvasCamera {
  let glide: { frame: number; last: Camera } | undefined;
  const stop = () => {
    if (glide) frames.cancel(glide.frame);
    glide = undefined;
  };
  const set = (camera: Camera) => controller.renderer.setCamera(camera);
  return {
    camera: () => cameras.current(),
    viewport: () => controller.renderer.viewport,
    setCamera: (camera) => {
      stop();
      set(camera);
      // Marks drawn at a size on screen follow the new zoom, as after a zoom by key.
      controller.zoomBy(1);
    },
    subscribe: (listener) => cameras.subscribe(listener),
    reveal: (key, smooth) => {
      stop();
      const from = controller.camera;
      // The canvas works out where its reveal goes; the glide then gets there from where it was.
      controller.reveal(key);
      const to = controller.camera;
      if (!smooth || sameCamera(from, to)) return;
      set(from);
      const start = frames.now();
      const step = (time: number) => {
        // Panning or zooming during the glide is the person's: the glide stops there.
        if (!glide || !sameCamera(controller.camera, glide.last)) {
          glide = undefined;
          return;
        }
        const done = Math.min(1, (time - start) / GLIDE_TIME);
        const next = done >= 1 ? to : between(from, to, controller.renderer.viewport, ease(done));
        set(next);
        if (done >= 1) {
          glide = undefined;
          controller.zoomBy(1);
          return;
        }
        glide = { frame: frames.request(step), last: next };
      };
      glide = { frame: frames.request(step), last: from };
    },
  };
}

/**
 * The camera part of the way from one to another: the point at the middle of the canvas moves in a
 * straight line, and the zoom changes evenly in steps of size rather than of scale.
 */
export function between(from: Camera, to: Camera, viewport: Size, part: number): Camera {
  const half = { x: viewport.width / 2, y: viewport.height / 2 };
  const middle = (camera: Camera) => ({
    x: (half.x - camera.x) / camera.scale,
    y: (half.y - camera.y) / camera.scale,
  });
  const a = middle(from);
  const b = middle(to);
  const scale = Math.exp(Math.log(from.scale) + (Math.log(to.scale) - Math.log(from.scale)) * part);
  const x = a.x + (b.x - a.x) * part;
  const y = a.y + (b.y - a.y) * part;
  return { scale, x: half.x - x * scale, y: half.y - y * scale };
}

/** Starts quickly and settles gently. */
function ease(part: number): number {
  return 1 - (1 - part) ** 3;
}

function sameCamera(a: Camera, b: Camera): boolean {
  return a.x === b.x && a.y === b.y && a.scale === b.scale;
}
