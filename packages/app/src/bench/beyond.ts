/**
 * The phases of the beyond-boxes benchmark (`?geometry`, alone and with `?curves`; M8b's "Done
 * when"), on the project `geometry.ts` makes, each reported as the canvas benchmark's phases are:
 * - pan, zoom and select by clicking, at the whole view and with names shown, judged by the frame
 *   budget;
 * - a pointer moving along the outlines on screen: the time to find what is under it, each point
 *   apart, against 1 ms at the 95th percentile; and the frames that draw the hover marks it moves,
 *   judged by the frame budget;
 * - dragging the shape with free geometry that has 50 relations, and resizing it by a handle with
 *   the alignment guides showing (ADR 0074), through the canvas's own pointer handling
 *   (`gestures.ts`): the frames of each, judged by the frame budget, and each letting go, from the
 *   operations to the frame drawn, against the 50 ms an edit may take;
 * - pans and a zoom that start with the image store cleared, at scales whose pictures were not
 *   drawn yet, judged by the frame budget;
 * - theme switches at the whole view and with names shown, by A1's rule: every frame within two at
 *   60 fps, and 95% within one.
 * Pointing, dragging and resizing run with the canvas editable, as the app's is; everything else as
 * the rest of the benchmark runs.
 */
import { flattenOutline } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { EMPTY_SELECTION } from '../editor/selection';
import { panBy, visibleRect, worldToScreen, zoomAt, type Camera } from '../canvas/camera';
import { HIT_TOLERANCE } from '../canvas/controller';
import type { Point } from '../canvas/geometry';
import { hitAt } from '../canvas/hit';
import { DETAILS_FROM, NAMES_FROM } from '../canvas/renderer';
import type { ElementShape } from '../canvas/scene';
import { THEMES } from '../theme/themes';
import { geometryHub } from './geometry';
import {
  measureDrags,
  measureResizes,
  pointer,
  selectAt,
  type GestureBench,
  type GestureResults,
} from './gestures';
import type { FramePhase, TimedAction } from './overlays';
import { seeded } from './synthetic';

/** What the phases need of the benchmark's page. */
export interface BeyondBench extends GestureBench {
  view: Id;
  /** The camera at a scale, centred on the middle of the view. */
  cameraAt(scale: number): Camera;
}

/** How much of each phase runs: the benchmark's, or a few steps in a test. */
export interface BeyondPlan {
  /** Frames of each pan and zoom. */
  frames: number;
  /** Clicks of each select phase. */
  clicks: number;
  /** Points the pointer is timed at, along the outlines on screen. */
  points: number;
  /** Frames of the pointer moving along them, drawn. */
  hover: number;
  /** Drags, and resizes, of the shape with 50 relations, and the frames of each. */
  gestures: number;
  gestureFrames: number;
  /** Switches of each theme phase. */
  switches: number;
  /** How long to wait between phases, for the garbage of one not to weigh on the next. */
  rest: number;
}

export const BEYOND_PLAN: BeyondPlan = {
  frames: 180,
  clicks: 60,
  points: 2_000,
  hover: 180,
  gestures: 10,
  gestureFrames: 30,
  switches: 6,
  rest: 300,
};

/** How long finding what is under the pointer may take, at the 95th percentile (M8b). */
export const POINTING_MARK = 1;
/** The most frames a theme switch is waited for, so that a switch that never shows ends the phase. */
const SWITCH_FRAMES = 600;

export interface BeyondResults {
  phases: FramePhase[];
  timed: TimedAction[];
  /** How long each click took to select, as the benchmark's status line says. */
  latency: number[];
  notes: string[];
}

/** Runs every phase, and puts the theme, the camera and the project's editability back after. */
export async function measureBeyondBoxes(
  bench: BeyondBench,
  plan: BeyondPlan = BEYOND_PLAN,
): Promise<BeyondResults> {
  const { controller } = bench;
  const { renderer } = controller;
  const phases: FramePhase[] = [];
  const timed: TimedAction[] = [];
  const latency: number[] = [];
  const notes: string[] = [];
  const startTheme = renderer.theme;
  const { width, height } = renderer.viewport;
  const middle = { x: width / 2, y: height / 2 };
  const random = seeded(11);
  const pan = (frame: number) =>
    bench.move(
      panBy(controller.camera, frame < plan.frames / 2 ? -8 : 8, frame < plan.frames / 2 ? -4 : 4),
    );
  const zoom = (frame: number) =>
    bench.move(zoomAt(controller.camera, middle, frame < plan.frames / 2 ? 1.02 : 1 / 1.02));
  const select = (name: string) =>
    bench.measure(name, plan.clicks, () => {
      latency.push(
        selectAt(controller, bench.indexed(), { x: random() * width, y: random() * height }),
      );
    });
  const namesShown = () => bench.cameraAt(NAMES_FROM * 1.3);

  // Pan, zoom and select, at the whole view and with names shown.
  controller.fitWhole();
  await bench.settle(plan.rest);
  phases.push(await bench.measure('Pan, whole view', plan.frames, pan));
  phases.push(await bench.measure('Zoom, whole view', plan.frames, zoom));
  phases.push(await select('Select by clicking, whole view'));
  controller.setSelection(EMPTY_SELECTION);
  bench.move(namesShown());
  await bench.settle(plan.rest);
  phases.push(await bench.measure('Pan, names shown', plan.frames, pan));
  phases.push(await bench.measure('Zoom, names shown', plan.frames, zoom));
  phases.push(await select('Select by clicking, names shown'));
  controller.setSelection(EMPTY_SELECTION);

  // A pointer moving along the outlines on screen, with names shown, the canvas editable.
  bench.move(namesShown());
  bench.show(bench.project(), true);
  await bench.settle(plan.rest);
  const pointing = pointsAlongOutlines(bench, plan.points);
  timed.push(timePointing(bench, pointing.points));
  notes.push(pointing.note);
  phases.push(
    await bench.measure('Point along outlines, names shown', plan.hover, (frame) => {
      const at = pointing.points[frame % Math.max(1, pointing.points.length)];
      if (at) pointer(bench.host, 'pointermove', worldToScreen(controller.camera, at));
    }),
  );
  pointer(bench.host, 'pointerleave', middle);

  // Dragging the shape with free geometry and 50 relations, then resizing it with guides.
  const gestures = { gestures: plan.gestures, frames: plan.gestureFrames, rest: plan.rest };
  const hub = geometryHub(bench.project());
  const what = (relations: number) => `a shape with free geometry and ${relations} relations`;
  const took = (results: GestureResults) => {
    phases.push(results.phase);
    timed.push(results.timed);
    notes.push(results.note);
  };
  bench.move(namesShown());
  took(await measureDrags(bench, hub, gestures, what));
  controller.setSelection(EMPTY_SELECTION);
  took(await measureResizes(bench, hub, gestures, what));
  bench.show(bench.project(), false);
  controller.setSelection(EMPTY_SELECTION);
  await bench.settle(plan.rest);

  // Each from a cleared image store, at a scale whose pictures were not drawn before.
  const cold = async (name: string, scale: number, step: (frame: number) => void) => {
    bench.move(bench.cameraAt(scale));
    renderer.resetImages();
    phases.push(await bench.measure(name, plan.frames, step));
  };
  await cold('Pan, drawings with parts shown, images cold', NAMES_FROM * 1.6, pan);
  await cold('Pan, pictures far out, images cold', 0.35, pan);
  await cold('Zoom, images cold', DETAILS_FROM * 1.4, zoom);
  await bench.settle(plan.rest);

  // Theme switches, by A1's rule.
  const switchPhase = async (name: string, place: () => void) => {
    place();
    await bench.settle(plan.rest * 3);
    const { stats } = renderer;
    const before = { swaps: stats.swapAfter.length, stale: stats.staleShown };
    let since = 0;
    const phase = await bench.measure(
      name,
      plan.switches,
      () => {
        since = 0;
        renderer.setTheme(THEMES[renderer.theme === 'dark' ? 'light' : 'dark'].canvas);
      },
      { more: () => renderer.switching && ++since < SWITCH_FRAMES },
    );
    phases.push({ ...phase, restyling: true });
    const swaps = stats.swapAfter.slice(before.swaps);
    notes.push(
      `${name}: shown after ${swaps.join(', ') || 'no'} frames; ${stats.staleShown - before.stale} stale tiles shown`,
    );
  };
  await switchPhase('Switch theme, whole view', () => controller.fitWhole());
  await switchPhase('Switch theme, names shown', () => bench.move(namesShown()));
  if (renderer.theme !== startTheme) {
    renderer.setTheme(THEMES[startTheme].canvas);
    for (let frame = 0; renderer.switching && frame < SWITCH_FRAMES; frame++) renderer.renderNow();
  }
  return { phases, timed, latency, notes };
}

/**
 * Points along the outlines of the shapes on screen that have one, in the order of the shapes' keys:
 * a pointer walks each outline's edges, now just inside and now just outside them, where finding
 * what is under it costs the most, then moves on to the next shape.
 */
function pointsAlongOutlines(bench: BeyondBench, count: number): { points: Point[]; note: string } {
  const indexed = bench.indexed();
  const { renderer } = bench.controller;
  const seen = visibleRect(bench.controller.camera, renderer.viewport);
  const shapes = indexed.shapes
    .query(seen)
    .map((at) => indexed.scene.shapes[at] as ElementShape)
    .filter((shape) => shape.outline !== undefined)
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const offsets = [-2, -0.5, 0.5, 2];
  const perShape = Math.max(8, Math.ceil(count / Math.max(1, shapes.length)));
  const points: Point[] = [];
  for (const shape of shapes) {
    const outline = shape.outline;
    if (!outline) continue;
    const origin = { x: shape.rect.x + outline.x, y: shape.rect.y + outline.y };
    const contours = flattenOutline(outline.fitted);
    const corners = contours.reduce((sum, contour) => sum + contour.points.length / 2, 0);
    const every = Math.max(1, Math.floor(corners / perShape));
    let walked = 0;
    for (const contour of contours) {
      const flat = contour.points;
      const length = flat.length / 2;
      for (let at = 0; at < length; at++, walked++) {
        if (walked % every !== 0) continue;
        const next = (at + 1) % length;
        const x = flat[at * 2] as number;
        const y = flat[at * 2 + 1] as number;
        const dx = (flat[next * 2] as number) - x;
        const dy = (flat[next * 2 + 1] as number) - y;
        const run = Math.hypot(dx, dy) || 1;
        const offset = offsets[points.length % offsets.length] as number;
        points.push({
          x: origin.x + x - (dy / run) * offset,
          y: origin.y + y + (dx / run) * offset,
        });
      }
    }
    if (points.length >= count) break;
  }
  return {
    points: points.slice(0, count),
    note: `Pointing along outlines: ${Math.min(points.length, count).toLocaleString()} points along the outlines of ${shapes.length.toLocaleString()} shapes on screen`,
  };
}

/** Finds what is under the pointer at each point, as the canvas does when it moves, timing each. */
function timePointing(bench: BeyondBench, points: readonly Point[]): TimedAction {
  performance.mark('phase Find what is under the pointer, along outlines');
  const { controller } = bench;
  const { renderer } = controller;
  const indexed = bench.indexed();
  const tolerance = HIT_TOLERANCE / controller.camera.scale;
  const exact = (shape: ElementShape) => renderer.showsOutline(shape.key);
  const times: number[] = [];
  const found = { outline: 0, other: 0, nothing: 0 };
  for (const point of points) {
    const began = performance.now();
    const hit = hitAt(indexed, point, tolerance, exact, renderer.hiddenByEmphasis);
    times.push(performance.now() - began);
    if (!hit) found.nothing += 1;
    else if (hit.kind === 'shape' && hit.shape.outline) found.outline += 1;
    else found.other += 1;
  }
  return {
    name: 'Find what is under the pointer, along outlines',
    times,
    mark: POINTING_MARK,
    note: `${found.outline.toLocaleString()} found a shape by its outline, ${found.other.toLocaleString()} a line or another shape, and ${found.nothing.toLocaleString()} nothing; the clock ticks every ${clockStep().toFixed(3)} ms`,
  };
}

/** The smallest step the page's clock takes, which the times of single points are read to. */
function clockStep(): number {
  let step = Infinity;
  let last = performance.now();
  const until = last + 5;
  for (let tries = 0; tries < 100_000; tries++) {
    const now = performance.now();
    if (now > last) {
      step = Math.min(step, now - last);
      last = now;
    }
    if (now > until) break;
  }
  return Number.isFinite(step) ? step : 0;
}
