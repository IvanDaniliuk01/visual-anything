/**
 * What the view state reads of the canvas, and how it moves the camera: the canvas area hands one to
 * the shell once its canvas is made. Bringing a shape into sight moves the camera there in a short,
 * eased glide, or at once when the system asks for reduced motion or the move is too small to see. A
 * tour's step, and playback bringing a step into view, move it along van Wijk and Nuij's smooth path
 * instead, or cut, with a capture of the frame before to cross-fade (ADR 0077).
 */
import {
  easeInOut,
  tourEase,
  tourMove,
  type TourMove,
  type ViewCamera,
} from '@visual-anything/core';
import type { Camera } from '../canvas/camera';
import { FrameCapture } from '../canvas/capture';
import type { CanvasController } from '../canvas/controller';
import type { Size } from '../canvas/geometry';

/** How a glide goes, besides its time. */
export interface GlideOptions {
  /**
   * The camera a part of the way along the path it takes, from 0 to 1, paced by a tour's sinusoidal
   * ease (`tourEase`); without one, the camera's middle moves in a straight line with a cubic ease.
   */
  along?: (part: number) => Camera;
  /** How long it waits before it starts, in milliseconds, as for a transition's out stage. */
  delay?: number;
}

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
  /**
   * Where the camera would go to bring a shape into sight, as `reveal` brings it, or to show the whole
   * view, without moving it: a tour works out its move from it (ADR 0058).
   */
  targetOf(goal: { key: string } | { whole: true }): Camera;
  /**
   * Moves the camera to `camera` over `duration` milliseconds, starting and ending gently, as a tour's
   * steps move it, along the path `options` give; at once when the duration is 0. Panning or zooming
   * meanwhile, or while it waits to start, stops it there.
   */
  glideTo(camera: Camera, duration: number, options?: GlideOptions): void;
  /**
   * A capture of the last frame the canvas drew, laid over it, for a transition to fade out (ADR
   * 0077); none where the canvas cannot copy its frames.
   */
  capture?(): FrameCapture | undefined;
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
  /**
   * Glides from where the camera is to `to`, over `time` milliseconds after `delay`, with an ease,
   * along a path when one is given.
   */
  const glideFrom = (
    from: Camera,
    to: Camera,
    time: number,
    curve: (part: number) => number,
    options: GlideOptions = {},
  ) => {
    const { along, delay = 0 } = options;
    const start = frames.now() + Math.max(0, delay);
    const step = (now: number) => {
      // Panning or zooming during the glide is the person's: the glide stops there.
      if (!glide || !sameCamera(controller.camera, glide.last)) {
        glide = undefined;
        return;
      }
      if (now < start) {
        glide = { frame: frames.request(step), last: glide.last };
        return;
      }
      const done = Math.min(1, (now - start) / time);
      const next =
        done >= 1
          ? to
          : along
            ? along(curve(done))
            : between(from, to, controller.renderer.viewport, curve(done));
      set(next);
      if (done >= 1) {
        glide = undefined;
        controller.zoomBy(1);
        return;
      }
      glide = { frame: frames.request(step), last: next };
    };
    glide = { frame: frames.request(step), last: from };
  };
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
      glideFrom(from, to, GLIDE_TIME, ease);
    },
    targetOf: (goal) => {
      stop();
      const from = controller.camera;
      if ('key' in goal) controller.reveal(goal.key);
      else controller.renderer.fit();
      const to = controller.camera;
      set(from);
      return to;
    },
    glideTo: (to, duration, options) => {
      stop();
      const from = controller.camera;
      if (duration <= 0 || sameCamera(from, to)) {
        set(to);
        controller.zoomBy(1);
        return;
      }
      glideFrom(from, to, duration, options?.along ? tourEase : easeInOut, options);
    },
    // A canvas that cannot copy its frames, as in tests, lends none.
    capture: () => {
      const { renderer } = controller;
      const element =
        typeof renderer.captureFrame === 'function' ? renderer.captureFrame() : undefined;
      return element === undefined
        ? undefined
        : new FrameCapture(element, undefined, (listener) => renderer.afterNextFrame(listener));
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

/** How the camera gets from one place to another for a tour's step or playback (ADR 0077). */
export interface CameraGlide {
  /** As the core's `tourMove` says, or `stay` when the camera is there already. */
  move: TourMove | 'stay';
  /** For a move that eases, the canvas's camera a part of the way along its path, unpaced. */
  along?: (part: number) => Camera;
}

/**
 * How a tour's step, or playback bringing a step into view, gets the camera from where it is to `to`:
 * it stays when it is there already; it cuts as the core's `tourMove` says, into another view, under
 * reduced motion, from no camera and past the path's bounds; otherwise it eases along the smooth
 * zoom-and-pan path, worked out from the cameras as they are rather than rounded as an address keeps
 * them, so that the glide ends where it goes.
 */
export function tourGlide(
  from: Camera | undefined,
  to: Camera,
  viewport: Size,
  options: { reducedMotion: boolean; sameView: boolean },
): CameraGlide {
  if (options.sameView && from !== undefined && nearlySame(from, to)) return { move: 'stay' };
  const end = viewCameraOf(to, viewport);
  if (end === undefined) return { move: { kind: 'cut' } };
  const start = from === undefined ? undefined : viewCameraOf(from, viewport);
  const move = tourMove(start, end, viewport, options);
  if (move.kind === 'cut') return { move };
  const { path } = move;
  return { move, along: (part) => cameraOfView(path.at(part), viewport) };
}

/** Where a camera looks, as the core's view cameras say it: the middle of the screen and the zoom. */
function viewCameraOf(camera: Camera, viewport: Size): ViewCamera | undefined {
  if (!(viewport.width > 0 && viewport.height > 0 && camera.scale > 0)) return undefined;
  return {
    x: (viewport.width / 2 - camera.x) / camera.scale,
    y: (viewport.height / 2 - camera.y) / camera.scale,
    zoom: camera.scale,
  };
}

/** The canvas's camera that looks where a view camera says, in a canvas of this size. */
function cameraOfView(camera: ViewCamera, viewport: Size): Camera {
  return {
    scale: camera.zoom,
    x: viewport.width / 2 - camera.x * camera.zoom,
    y: viewport.height / 2 - camera.y * camera.zoom,
  };
}

/** Starts quickly and settles gently. */
function ease(part: number): number {
  return 1 - (1 - part) ** 3;
}

function sameCamera(a: Camera, b: Camera): boolean {
  return a.x === b.x && a.y === b.y && a.scale === b.scale;
}

/** Whether two cameras show the same, within half a pixel and a thousandth of their zoom. */
function nearlySame(a: Camera, b: Camera): boolean {
  return (
    Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.scale / b.scale - 1) < 1e-3
  );
}
