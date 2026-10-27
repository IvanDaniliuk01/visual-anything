/**
 * Playback brings the step it plays into view (ADR 0031's clarification of 2026-10-26): when a step's
 * relations are not wholly on screen, the camera moves to them with a tour's bounded move (ADR 0077),
 * along the smooth zoom-and-pan path, panning at the zoom it has when they fit there and zooming out
 * to them when they do not; under reduced motion, or past the path's bounds, it cuts, the frame
 * before cross-fading into the frame after unless fades are off. A step the person or Claude asks
 * for, by playing, stepping or going to it, always comes into view; while playback goes on by itself,
 * it stops doing so once the person moves the camera, until they play or step again.
 */
import { TOUR_CROSS_FADE } from '@visual-anything/core';
import { fitCamera, visibleRect, type Camera } from '../canvas/camera';
import type { Rect, Size } from '../canvas/geometry';
import { relationLinesOf, type Scene } from '../canvas/scene';
import { rectAround } from '../canvas/spatial';
import { tourGlide, type CanvasCamera } from '../view-state/canvas';

/** How much room is kept around a step brought into view, in pixels on screen. */
export const FOLLOW_MARGIN = 48;

/**
 * The rectangle holding what a step highlights in a scene, by the keys of the emphasis
 * (`highlightOf`): its relations' lines and the shapes they run between; undefined when the scene
 * draws none of them.
 */
export function stepBounds(scene: Scene, keys: ReadonlySet<string>): Rect | undefined {
  const points: { x: number; y: number }[] = [];
  const lines = relationLinesOf(scene);
  for (const key of keys) {
    const line = lines.get(key);
    if (line) points.push(...line.route);
  }
  for (const shape of scene.shapes) {
    if (!keys.has(shape.key)) continue;
    const { x, y, width, height } = shape.rect;
    points.push({ x, y }, { x: x + width, y: y + height });
  }
  return points.length === 0 ? undefined : rectAround(points);
}

/**
 * Where the camera goes to bring `rect` into view, with `margin` pixels around it: nowhere when it is
 * on screen already; to its middle at the same zoom when it fits there; else to the zoom that shows
 * all of it.
 */
export function followCamera(
  camera: Camera,
  viewport: Size,
  rect: Rect,
  margin = FOLLOW_MARGIN,
): Camera | undefined {
  const shown = visibleRect(camera, viewport);
  const room = margin / camera.scale;
  const onScreen =
    rect.x - room >= shown.x &&
    rect.y - room >= shown.y &&
    rect.x + rect.width + room <= shown.x + shown.width &&
    rect.y + rect.height + room <= shown.y + shown.height;
  if (onScreen) return undefined;
  const fits =
    rect.width * camera.scale + 2 * margin <= viewport.width &&
    rect.height * camera.scale + 2 * margin <= viewport.height;
  if (!fits) return fitCamera(rect, viewport, margin);
  const { scale } = camera;
  return {
    scale,
    x: viewport.width / 2 - (rect.x + rect.width / 2) * scale,
    y: viewport.height / 2 - (rect.y + rect.height / 2) * scale,
  };
}

/** What a step of playback is, as the follower is told of it. */
export interface PlayedStep {
  /** Which scenario and step: a new value is a new step. */
  key: string;
  /** Where the step is in the scene, if it draws it. */
  bounds: Rect | undefined;
  /** Whether playback plays on by itself now, rather than stepping or paused. */
  playing: boolean;
}

/** Follows playback with the canvas's camera. */
export class PlaybackFollower {
  private following = true;
  private last: PlayedStep | undefined;
  /** How many steps the person or Claude had asked for when last told; undefined before. */
  private asks: number | undefined;
  /** Until when the camera's changes are this follower's own move. */
  private movingUntil = 0;
  private moving = false;
  private readonly stop: () => void;

  /**
   * `fades` says whether a cut cross-fades, as the person's Fades preference does (ADR 0077); it
   * does unless told otherwise.
   */
  constructor(
    private readonly canvas: CanvasCamera,
    private readonly options: {
      reducedMotion: () => boolean;
      fades?: () => boolean;
      now?: () => number;
    },
  ) {
    this.stop = canvas.subscribe(() => this.cameraMoved());
  }

  /**
   * Playback is on `step` now, or on none, and the person or Claude have asked for a step `asks`
   * times (`ScenarioSession.getAsks`). A step asked for, by playing, stepping or going to it, comes
   * into view, and so does each step playback goes on to by itself while the person leaves the
   * camera alone. A step put there otherwise, as by an address or a tour, which place the camera
   * themselves, moves nothing; nor does the first step this follower is told of, where it finds the
   * camera.
   */
  show(step: PlayedStep | undefined, asks: number): void {
    const first = this.asks === undefined;
    const asked = !first && asks > (this.asks ?? 0);
    this.asks = asks;
    const last = this.last;
    this.last = step;
    if (!step || first) return;
    const playedOn = step.playing && last !== undefined && last.key !== step.key;
    if (asked) this.following = true;
    else if (!playedOn) return;
    if (this.following && step.bounds) this.bringIntoView(step.bounds);
  }

  dispose(): void {
    this.stop();
  }

  private bringIntoView(bounds: Rect): void {
    const from = this.canvas.camera();
    if (!from) return;
    const viewport = this.canvas.viewport();
    const to = followCamera(from, viewport, bounds);
    if (!to) return;
    const { move, along } = tourGlide(from, to, viewport, {
      reducedMotion: this.options.reducedMotion(),
      sameView: true,
    });
    const duration = move !== 'stay' && move.kind === 'ease' ? move.duration : 0;
    // A cut cross-fades from the frame before, once the canvas has drawn where it went.
    if (move !== 'stay' && move.kind === 'cut' && (this.options.fades?.() ?? true)) {
      this.canvas.capture?.()?.fadeOut(TOUR_CROSS_FADE, { afterFrame: true });
    }
    this.movingUntil = this.now() + duration + 50;
    this.moving = true;
    try {
      this.canvas.glideTo(to, duration, along ? { along } : undefined);
    } finally {
      this.moving = false;
    }
  }

  /** The camera moved: unless this follower moved it, the person did, which stops it while it plays. */
  private cameraMoved(): void {
    if (this.moving || this.now() < this.movingUntil) return;
    if (this.last?.playing) this.following = false;
  }

  private now(): number {
    return (this.options.now ?? (() => performance.now()))();
  }
}
