/**
 * The benchmark's phase of a tour step that glides (ADR 0084): 400 shapes of the 10,000-element view
 * glide on the glide layer from where they are to where a camera twice as near and half a screen
 * over would draw them, one eased part of the way each frame, while the canvas under the layer draws
 * its own frame too, as it does in the view a step goes into. It is judged by the frame budget, as a
 * pan is: each frame draws the layer's background and each shape's box and name on the 2D canvas.
 */
import { MAX_GLIDE_SHAPES, planGlide, tourEase } from '@visual-anything/core';
import type { Camera } from '../canvas/camera';
import type { CanvasRenderer } from '../canvas/renderer';
import type { Scene } from '../canvas/scene';
import {
  drawGlideFrame,
  glideSideOf,
  type GlideContext,
  type GlideItem,
  type GlideSide,
} from '../tours/glide-layer';
import type { FramePhase } from './overlays';

/** What the phase needs of the benchmark. */
export interface GlideBench {
  renderer: CanvasRenderer;
  scene(): Scene;
  settle(ms: number): Promise<void>;
  measure(name: string, count: number, step: (frame: number) => void): Promise<FramePhase>;
  move(camera: Camera): void;
  /** A camera at a scale, looking at the middle of the view. */
  cameraAt(scale: number): Camera;
}

/** How many frames the glide is measured over: its longest, 800 ms, at 60 frames a second, twice. */
const GLIDE_FRAMES = 96;

/**
 * Glides the first 400 shapes on screen at a scale where 400 or more show, from the camera there to
 * one twice as near and half a screen over, frame by frame, and gives the layer back.
 */
export async function measureGlide(bench: GlideBench, scale: number): Promise<FramePhase> {
  const { renderer } = bench;
  const screen = renderer.viewport;
  const before = bench.cameraAt(scale);
  bench.move(before);
  await bench.settle(500);
  const after: Camera = {
    scale: before.scale * 2,
    x: before.x * 2 - screen.width / 2,
    y: before.y * 2 - screen.height / 2,
  };
  const first = firstOf(glideSideOf(bench.scene(), before, screen), MAX_GLIDE_SHAPES);
  const second = firstOf(glideSideOf(bench.scene(), after, screen), Number.POSITIVE_INFINITY);
  const plan = planGlide(first.shapes, second.shapes, { screen, reducedMotion: false });
  const items: GlideItem[] =
    plan.kind === 'glide'
      ? plan.pairs.flatMap((pair) => {
          const from = first.shapes[pair.before];
          const to = second.shapes[pair.after];
          const look = first.looks[pair.before];
          return from && to && look ? [{ from: from.rect, to: to.rect, look }] : [];
        })
      : // Shapes that leave the screen glide off it, as far as the camera after would put them.
        first.shapes.map((shape, at) => ({
          from: shape.rect,
          to: {
            x: shape.rect.x * 2 - screen.width / 2,
            y: shape.rect.y * 2 - screen.height / 2,
            width: shape.rect.width * 2,
            height: shape.rect.height * 2,
          },
          look: first.looks[at] as GlideItem['look'],
        }));
  const surface = renderer.glideSurface();
  const context = surface?.element.getContext('2d') as GlideContext | null | undefined;
  const name = `Tour step gliding ${items.length} shapes`;
  if (!surface || !context) return { name: `${name} (no layer)`, frames: [] };
  const phase = await bench.measure(name, GLIDE_FRAMES, (frame) => {
    const part = tourEase((frame % (GLIDE_FRAMES / 2)) / (GLIDE_FRAMES / 2 - 1));
    drawGlideFrame(context, items, part, { ...surface, size: screen });
  });
  surface.element.remove();
  surface.element.width = 0;
  surface.element.height = 0;
  await bench.settle(300);
  return phase;
}

function firstOf(side: GlideSide, count: number): GlideSide {
  return { shapes: side.shapes.slice(0, count), looks: side.looks.slice(0, count) };
}
