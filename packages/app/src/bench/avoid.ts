/**
 * The benchmark's phases for routes around shapes (ADR 0039's clarification of 2026-10-26), at the
 * scale names show at:
 * - the camera pans, first with the stand-in routes, then while the routing worker routes every
 *   automatic line of the view and the routes come in, a task between frames so that they can: each
 *   frame timed with what it does with the routes that came, the scene with them, its index and the
 *   drawing;
 * - one shape near the middle of the screen moves, again and again, as in the app: the routing's own
 *   work on the main thread for each move, which composes the scene with the routes known and asks for
 *   the rest, is timed apart from the frame drawn with the routes that come.
 *
 * Expected on the reference laptop: both pans within the frame budget as any pan; the routing's own
 * work within a few milliseconds of a frame, and the frame with the routes that came within 50 ms,
 * like one edit. How long the worker takes is noted, not marked: it costs the canvas no frame.
 */
import { executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { Camera } from '../canvas/camera';
import type { CanvasController } from '../canvas/controller';
import { indexScene } from '../canvas/hit';
import { routedLinesOf } from '../canvas/routing/avoided';
import { workerAvoidRunner, type AvoidRunner } from '../canvas/routing/avoidRunner';
import { RoutesAround } from '../canvas/routing/useAvoidedRoutes';
import { buildScene, type ElementShape, type Scene } from '../canvas/scene';

/** What the phases report, as the benchmark's phases do. */
export interface AvoidPhase {
  name: string;
  frames: number[];
}

export interface AvoidTimed {
  name: string;
  times: number[];
  mark?: number;
  note?: string;
}

/** What the phases need of the benchmark's page. */
export interface AvoidBench {
  project: () => ProjectSnapshot;
  view: Id;
  controller: CanvasController;
  settle: (milliseconds: number) => Promise<void>;
  /** Lets the tasks waiting run, as the worker's replies, and resumes. */
  nextTask: () => Promise<void>;
  move: (camera: Camera) => void;
  /** A shape near the middle of the screen, to move. */
  shapeInTheMiddle: () => ElementShape | undefined;
}

/** How long routing's own work for a change may take on the main thread, at the 95th percentile. */
const OWN_MARK = 8;
/** How long the frame with the routes that came may take, as one edit may. */
const FRAME_MARK = 50;
const FRAMES = 180;

/** Pans while every route comes in, then moves one shape at a time. */
export async function measureAvoidance(
  bench: AvoidBench,
  moves: number,
): Promise<{ phases: AvoidPhase[]; timed: AvoidTimed[]; note: string }> {
  const { controller, view } = bench;
  let project = bench.project();
  // A runner of its own, which says when a request is done and how long the worker took.
  const worker = workerAvoidRunner();
  let finished: (() => void) | undefined;
  let workerTook = 0;
  const runner: AvoidRunner = {
    route: (shapes, lines, center, onResults) =>
      worker.route(shapes, lines, center, (results, done, took) => {
        workerTook += took;
        onResults(results, done, took);
        if (done) finished?.();
      }),
    dispose: () => worker.dispose(),
  };
  let arrived = false;
  // Told at once of every reply, so that each frame takes what came before it.
  const routes = new RoutesAround(
    runner,
    () => {
      arrived = true;
    },
    () => Infinity,
  );
  let base = buildScene(project, view);
  let shown: Scene = base;
  const show = () => {
    const composed = routes.compose(view, base);
    if (composed === shown) return;
    shown = composed;
    controller.update(project, view, indexScene(composed), false);
  };
  const center = () => {
    const { width, height } = controller.renderer.viewport;
    const { camera } = controller;
    return { x: (width / 2 - camera.x) / camera.scale, y: (height / 2 - camera.y) / camera.scale };
  };
  const whenDone = () =>
    new Promise<void>((resolve) => {
      finished = () => {
        finished = undefined;
        resolve();
      };
    });
  /** Pans for a while, each frame timed with what it does, a task between frames. */
  const pan = async (name: string, each: () => void): Promise<AvoidPhase> => {
    performance.mark(`phase ${name}`);
    const frames: number[] = [];
    for (let frame = 0; frame < FRAMES; frame++) {
      const began = performance.now();
      each();
      const { camera } = controller;
      bench.move({ ...camera, x: camera.x + (frame < FRAMES / 2 ? -6 : 6) });
      controller.renderer.renderNow(true);
      frames.push(performance.now() - began);
      await bench.nextTask();
    }
    return { name, frames };
  };

  const before = await pan('Pan before routes around shapes', () => undefined);
  const lines = routedLinesOf(base).length;
  const routedAll = whenDone();
  const began = performance.now();
  routes.compose(view, base);
  routes.request(view, base, center());
  const during = await pan('Pan while routes around shapes come in', () => {
    if (!arrived) return;
    arrived = false;
    show();
  });
  await routedAll;
  const allIn = performance.now() - began;
  const allTook = workerTook;
  arrived = false;
  show();
  const around = notAsBuilt(base, shown);
  await bench.settle(300);

  // One shape near the middle moves, again and again: its lines, and those near it, are routed again.
  performance.mark('phase Move one shape, routes around shapes');
  const shape = bench.shapeInTheMiddle();
  const own: number[] = [];
  const frames: number[] = [];
  const took: number[] = [];
  for (let each = 0; each < moves && shape; each++) {
    const outcome = executeCommand(project, {
      type: 'set-positions',
      view,
      positions: [
        {
          element: shape.element,
          ...(shape.container === undefined ? {} : { container: shape.container }),
          x: shape.offset.x + (each % 2 === 0 ? 40 : 0),
          y: shape.offset.y,
          pinned: true,
        },
      ],
    });
    if (!outcome.ok) throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
    project = outcome.state;
    base = buildScene(project, view);
    const done = whenDone();
    workerTook = 0;
    // What the app does on the main thread for routes when a change comes: compose, then ask.
    const ownBegan = performance.now();
    const composed = routes.compose(view, base);
    const requested = routes.request(view, base, center());
    own.push(performance.now() - ownBegan);
    shown = composed;
    controller.update(project, view, indexScene(composed), false);
    controller.renderer.renderNow(true);
    if (requested) {
      await done;
      took.push(workerTook);
    }
    const came = performance.now();
    arrived = false;
    show();
    controller.renderer.renderNow(true);
    frames.push(performance.now() - came);
    await bench.settle(50);
  }
  routes.dispose();
  runner.dispose();
  const average = (list: number[]) =>
    (list.reduce((sum, value) => sum + value, 0) / Math.max(1, list.length)).toFixed(0);
  return {
    phases: [before, during],
    timed: [
      {
        name: 'Move one shape: routing’s own work on the main thread',
        times: own,
        mark: OWN_MARK,
      },
      {
        name: 'Move one shape: the frame with the routes around shapes that came',
        times: frames,
        mark: FRAME_MARK,
        note: `the worker routed what each move touched in ${average(took)} ms of its own`,
      },
    ],
    note: `The routing worker routed ${lines.toLocaleString()} lines in ${allTook.toFixed(0)} ms of its own, all in after ${allIn.toFixed(0)} ms; ${around.toLocaleString()} go around shapes in their way.`,
  };
}

/** How many of a scene's routed lines are drawn otherwise than the scene built them. */
function notAsBuilt(base: Scene, shown: Scene): number {
  const drawn = new Set(shown.relations);
  return routedLinesOf(base).filter((line) => !drawn.has(line)).length;
}
