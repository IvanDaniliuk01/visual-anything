/**
 * The phases of the beyond-boxes benchmark (`?geometry`, alone and with `?curves`; M8b's "Done
 * when"), on the project `geometry.ts` makes, each reported as the canvas benchmark's phases are:
 * - pan, zoom and select by clicking, at the whole view and with names shown, judged by the frame
 *   budget;
 * - a pointer moving along the outlines on screen: the time to find what is under it, each point
 *   apart, against 1 ms at the 95th percentile; and the frames that draw the hover marks it moves,
 *   judged by the frame budget;
 * - dragging the shape with free geometry that has 50 relations, through the canvas's own pointer
 *   handling: the frames of each drag, judged by the frame budget, and each drop, from the
 *   operations to the frame drawn, against the 50 ms an edit may take;
 * - pans and a zoom that start with the image store cleared, at scales whose pictures were not
 *   drawn yet, judged by the frame budget;
 * - theme switches at the whole view and with names shown, by A1's rule: every frame within two at
 *   60 fps, and 95% within one.
 * Pointing and dragging run with the canvas editable, as the app's is; everything else as the rest
 * of the benchmark runs.
 */
import {
  applyOperations,
  executeCommand,
  flattenOutline,
  outlineInnerPoint,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { EMPTY_SELECTION, selectionOf } from '../editor/selection';
import {
  panBy,
  screenToWorld,
  visibleRect,
  worldToScreen,
  zoomAt,
  type Camera,
} from '../canvas/camera';
import { HIT_TOLERANCE, type CanvasController } from '../canvas/controller';
import type { Point } from '../canvas/geometry';
import { hitAt, type IndexedScene } from '../canvas/hit';
import { DETAILS_FROM, NAMES_FROM } from '../canvas/renderer';
import type { ElementShape } from '../canvas/scene';
import { THEMES } from '../theme/themes';
import type { FrameSteps } from './frames';
import { geometryHub } from './geometry';
import type { FramePhase, TimedAction } from './overlays';
import { seeded } from './synthetic';

/** What the phases need of the benchmark's page. */
export interface BeyondBench {
  controller: CanvasController;
  /** The element the canvas listens to the pointer on. */
  host: HTMLElement;
  view: Id;
  project(): ProjectSnapshot;
  indexed(): IndexedScene;
  /** Shows a project as the app does after a change, editable or not, and what each part took. */
  show(next: ProjectSnapshot, editable?: boolean): { build: number; index: number; draw: number };
  measure(
    name: string,
    count: number,
    step: (frame: number) => void,
    steps?: FrameSteps,
  ): Promise<FramePhase>;
  settle(milliseconds: number): Promise<void>;
  move(camera: Camera): void;
  /** The camera at a scale, centred on the middle of the view. */
  cameraAt(scale: number): Camera;
  /** Takes the commands the canvas sends, from now on; with none, the canvas's commands fail. */
  takeCommands(handler: ((command: Command) => Promise<boolean>) | undefined): void;
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
  /** Drags of the shape with 50 relations, and frames of each. */
  drags: number;
  dragFrames: number;
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
  drags: 10,
  dragFrames: 30,
  switches: 6,
  rest: 300,
};

/** How long finding what is under the pointer may take, at the 95th percentile (M8b). */
export const POINTING_MARK = 1;
/** How long a drop may take from the operations to the frame drawn, as an edit may (§3.9). */
export const DROP_MARK = 50;
/** The most frames a theme switch is waited for, so that a switch that never shows ends the phase. */
const SWITCH_FRAMES = 600;
/** How far a dragged pointer goes out and back, in pixels, and where it lets go. */
const DRAG_REACH = { out: 48, end: 12, wave: 10 };

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
      const began = performance.now();
      selectAt(bench, { x: random() * width, y: random() * height });
      latency.push(performance.now() - began);
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
      if (at) pointer(bench, 'pointermove', worldToScreen(controller.camera, at));
    }),
  );
  pointer(bench, 'pointerleave', middle);

  // Dragging the shape with free geometry and 50 relations, and dropping it.
  const drag = await measureDrags(bench, plan);
  if (drag.phase) phases.push(drag.phase);
  timed.push(drag.timed);
  notes.push(drag.note);
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

/** Selects the shape at a point of the screen, as a click does. */
function selectAt(bench: BeyondBench, point: Point): void {
  const { controller } = bench;
  const { renderer } = controller;
  const world = screenToWorld(controller.camera, point);
  const hit = hitAt(
    bench.indexed(),
    world,
    HIT_TOLERANCE / controller.camera.scale,
    (shape) => renderer.showsOutline(shape.key),
    renderer.hiddenByEmphasis,
  );
  const id = hit?.kind === 'shape' ? hit.shape.element : undefined;
  controller.setSelection(selectionOf(id === undefined ? [] : [{ kind: 'element', id }]));
}

/**
 * Sends the canvas a pointer event at a point of the canvas, as the mouse does: pressed with its
 * first button while it drags.
 */
function pointer(bench: BeyondBench, type: string, at: Point, pressed = false): void {
  const { host } = bench;
  const box = host.getBoundingClientRect();
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: box.left + at.x,
    clientY: box.top + at.y,
    button: 0,
    buttons: pressed ? 1 : 0,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  host.dispatchEvent(event);
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

/**
 * Drags the shape with free geometry that has 50 relations, through the canvas's pointer handling,
 * with the camera on it and names shown: out and back, letting go a little to one side and then the
 * other, so that each drop is a move. Each drop's change goes through the core, and is shown as the
 * app shows what the local program sends back.
 */
async function measureDrags(
  bench: BeyondBench,
  plan: BeyondPlan,
): Promise<{ phase?: FramePhase; timed: TimedAction; note: string }> {
  const name = 'Drop a shape with free geometry and 50 relations';
  const { controller } = bench;
  const { renderer } = controller;
  const hubId = geometryHub(bench.project());
  const start = hubId === undefined ? undefined : bench.indexed().byElement.get(hubId)?.[0];
  const times: number[] = [];
  if (!start?.outline)
    return { timed: { name, times, mark: DROP_MARK }, note: `${name}: no such shape` };
  const scale = NAMES_FROM * 1.3;
  const { width, height } = renderer.viewport;
  const centre = {
    x: start.rect.x + start.rect.width / 2,
    y: start.rect.y + start.rect.height / 2,
  };
  bench.move({ scale, x: width / 2 - centre.x * scale, y: height / 2 - centre.y * scale });
  bench.show(bench.project(), true);
  await bench.settle(plan.rest);

  const { host } = bench;
  // The events are the benchmark's, of no pointer the browser knows, which it could not capture.
  const captures = ['setPointerCapture', 'releasePointerCapture'] as const;
  const own = captures.map((method) => Object.getOwnPropertyDescriptor(host, method));
  for (const method of captures) {
    Object.defineProperty(host, method, { configurable: true, value: () => undefined });
  }
  const frames: number[] = [];
  const parts = { release: 0, core: 0, build: 0, index: 0, draw: 0, drops: 0 };
  let relations = 0;
  try {
    for (let each = 0; each < plan.drags; each++) {
      const shape = hubId === undefined ? undefined : bench.indexed().byElement.get(hubId)?.[0];
      const press = shape && pressPoint(bench, shape);
      if (!shape || !press) break;
      relations = bench
        .indexed()
        .scene.relations.filter(
          (line) =>
            (line.ends?.from.kind === 'shape' && line.ends.from.key === shape.key) ||
            (line.ends?.to.kind === 'shape' && line.ends.to.key === shape.key),
        ).length;
      const side = each % 2 === 0 ? 1 : -1;
      const along = (frame: number) => {
        const done = plan.dragFrames > 1 ? frame / (plan.dragFrames - 1) : 1;
        return {
          x:
            press.x +
            side * (8 + Math.sin(done * Math.PI) * DRAG_REACH.out + done * DRAG_REACH.end),
          y: press.y + Math.sin(done * Math.PI * 2) * DRAG_REACH.wave,
        };
      };
      // Each drop goes through the core, and comes back once the canvas knows it was applied.
      let applied: Promise<void> | undefined;
      bench.takeCommands((command) => {
        const began = performance.now();
        const outcome = executeCommand(bench.project(), command);
        parts.core += performance.now() - began;
        if (!outcome.ok) return Promise.resolve(false);
        applied = new Promise<void>((resolve) => {
          // After the canvas has heard that it was applied, as when the local program answers.
          setTimeout(() => {
            const from = performance.now();
            const next = applyOperations(bench.project(), outcome.operations).state;
            const taken = bench.show(next, true);
            const total = performance.now() - from;
            times.push(total);
            parts.build += taken.build;
            parts.index += taken.index;
            parts.draw += taken.draw;
            parts.drops += 1;
            resolve();
          }, 0);
        });
        return Promise.resolve(true);
      });
      pointer(bench, 'pointerdown', press, true);
      const phase = await bench.measure(dragName(relations), plan.dragFrames, (frame) =>
        pointer(bench, 'pointermove', along(frame), true),
      );
      frames.push(...phase.frames);
      // The release's own work, the core's command it sends left out.
      const released = performance.now();
      const coreBefore = parts.core;
      pointer(bench, 'pointerup', along(plan.dragFrames - 1));
      parts.release += performance.now() - released - (parts.core - coreBefore);
      bench.takeCommands(undefined);
      if (applied) await applied;
      await bench.settle(Math.min(plan.rest, 50));
    }
  } finally {
    captures.forEach((method, at) => {
      const descriptor = own[at];
      if (descriptor) Object.defineProperty(host, method, descriptor);
      else Reflect.deleteProperty(host, method);
    });
    bench.takeCommands(undefined);
  }
  const average = (total: number) => (total / Math.max(1, parts.drops)).toFixed(1);
  return {
    phase: { name: dragName(relations), frames },
    timed: {
      name,
      times,
      mark: DROP_MARK,
      note: `from the operations to the frame drawn: scene ${average(parts.build)} ms, index ${average(parts.index)} ms, tiles and frame ${average(parts.draw)} ms on average; before them, the release took ${average(parts.release)} ms and the core's command ${average(parts.core)} ms`,
    },
    note: `${name}: ${parts.drops} drops of ${plan.drags}, each after ${plan.dragFrames} frames of dragging`,
  };
}

/** The drag phase's name, with how many relations the dragged shape has. */
function dragName(relations: number): string {
  return `Drag a shape with free geometry and ${relations} relations`;
}

/**
 * Where to press the shape so that the canvas finds it there, and not a line over it: its outline's
 * point well inside first, then points across its rectangle.
 */
function pressPoint(bench: BeyondBench, shape: ElementShape): Point | undefined {
  const { controller } = bench;
  const { renderer } = controller;
  const { outline, rect } = shape;
  const inner = outline && outlineInnerPoint(outline.fitted);
  const candidates: Point[] = inner
    ? [{ x: rect.x + outline.x + inner.x, y: rect.y + outline.y + inner.y }]
    : [];
  for (let row = 1; row < 8; row++) {
    for (let column = 1; column < 8; column++) {
      candidates.push({
        x: rect.x + (rect.width * column) / 8,
        y: rect.y + (rect.height * row) / 8,
      });
    }
  }
  const tolerance = HIT_TOLERANCE / controller.camera.scale;
  for (const world of candidates) {
    const hit = hitAt(
      bench.indexed(),
      world,
      tolerance,
      (each) => renderer.showsOutline(each.key),
      renderer.hiddenByEmphasis,
    );
    if (hit?.kind === 'shape' && hit.shape.key === shape.key) {
      return worldToScreen(controller.camera, world);
    }
  }
  return undefined;
}
