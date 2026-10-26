/**
 * Every phase of the beyond-boxes benchmark runs, briefly, in both of its modes, on a canvas in
 * jsdom: this shows that they run and report as the benchmark's phases do, not how fast they are,
 * which the benchmark's page measures on a quiet machine.
 */
import type { Command, ProjectSnapshot } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { centerOf } from '../canvas/geometry';
import { CanvasController } from '../canvas/controller';
import { indexScene, type IndexedScene } from '../canvas/hit';
import { buildScene } from '../canvas/scene';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import {
  DROP_MARK,
  POINTING_MARK,
  measureBeyondBoxes,
  type BeyondBench,
  type BeyondPlan,
} from './beyond';
import { measureFrames, type BenchMode } from './frames';
import { GEOMETRY_VIEW, geometryHub, syntheticGeometry, withCurves } from './geometry';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

/** A few steps of each phase, and no rest between them. */
const PLAN: BeyondPlan = {
  frames: 2,
  clicks: 2,
  points: 24,
  hover: 2,
  drags: 2,
  dragFrames: 3,
  switches: 1,
  rest: 0,
};

const settle = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** A canvas showing the project, wired as the benchmark's page wires it. */
async function benchOn(start: ProjectSnapshot, mode: BenchMode) {
  const host = document.createElement('div');
  host.tabIndex = 0;
  document.body.append(host);
  Object.defineProperty(host, 'clientWidth', { configurable: true, value: 1200 });
  Object.defineProperty(host, 'clientHeight', { configurable: true, value: 800 });
  let commandsTo: ((command: Command) => Promise<boolean>) | undefined;
  const sent: Command[] = [];
  const controller = new CanvasController(
    host,
    {
      select: () => undefined,
      command: (command) => {
        sent.push(command);
        return commandsTo?.(command) ?? Promise.resolve(false);
      },
      relate: () => undefined,
      remove: () => undefined,
      rename: () => undefined,
      camera: () => undefined,
      // jsdom draws no text: the labels the frames write fail, as the canvas reports.
      failure: () => undefined,
    },
    { firstFit: 'whole' },
  );
  (FakeApplication.created.at(-1) as FakeApplication).finishInit();
  await Promise.resolve();
  await Promise.resolve();
  let project = start;
  let indexed: IndexedScene = indexScene(buildScene(project, GEOMETRY_VIEW));
  controller.update(project, GEOMETRY_VIEW, indexed, false);
  const { scene } = indexed;
  const measuring = {
    renderer: controller.renderer,
    mode,
    pictures: true,
    nextTask: () => settle(0),
  };
  const bench: BeyondBench = {
    controller,
    host,
    view: GEOMETRY_VIEW,
    project: () => project,
    indexed: () => indexed,
    show: (next, editable = false) => {
      const began = performance.now();
      const built = buildScene(next, GEOMETRY_VIEW);
      const builtAt = performance.now();
      indexed = indexScene(built);
      const indexedAt = performance.now();
      controller.update(next, GEOMETRY_VIEW, indexed, editable);
      controller.renderer.renderNow(true);
      project = next;
      return {
        build: builtAt - began,
        index: indexedAt - builtAt,
        draw: performance.now() - indexedAt,
      };
    },
    measure: (name, count, step, steps) => measureFrames(measuring, name, count, step, steps),
    settle,
    move: (camera) => controller.renderer.setCamera(camera),
    cameraAt: (scale) => {
      const { width, height } = controller.renderer.viewport;
      const middle = scene.bounds ? centerOf(scene.bounds) : { x: 0, y: 0 };
      return { scale, x: width / 2 - middle.x * scale, y: height / 2 - middle.y * scale };
    },
    takeCommands: (handler) => {
      commandsTo = handler;
    },
  };
  return { bench, sent };
}

const PHASES = [
  'Pan, whole view',
  'Zoom, whole view',
  'Select by clicking, whole view',
  'Pan, names shown',
  'Zoom, names shown',
  'Select by clicking, names shown',
  'Point along outlines, names shown',
  'Drag a shape with free geometry and 50 relations',
  'Pan, drawings with parts shown, images cold',
  'Pan, pictures far out, images cold',
  'Zoom, images cold',
  'Switch theme, whole view',
  'Switch theme, names shown',
];

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('the beyond-boxes benchmark', () => {
  it.each<{ mode: BenchMode; curves: boolean }>([
    { mode: 'work', curves: false },
    { mode: 'frames', curves: true },
  ])(
    'runs every phase in $mode mode, curves $curves, and reports them as the benchmark does',
    async ({ mode, curves }) => {
      const plain = syntheticGeometry({ elements: 1_000 });
      const start = curves ? withCurves(plain) : plain;
      const { bench, sent } = await benchOn(start, mode);
      const hub = geometryHub(start);
      const results = await measureBeyondBoxes(bench, PLAN);

      expect(results.phases.map((phase) => phase.name)).toEqual(PHASES);
      for (const phase of results.phases)
        expect(phase.frames.length, phase.name).toBeGreaterThan(0);
      expect(results.phases.filter((phase) => phase.restyling).map((phase) => phase.name)).toEqual([
        'Switch theme, whole view',
        'Switch theme, names shown',
      ]);
      expect(results.latency).toHaveLength(PLAN.clicks * 2);

      const [pointing, drop] = results.timed;
      expect(pointing).toMatchObject({
        name: 'Find what is under the pointer, along outlines',
        mark: POINTING_MARK,
      });
      expect(pointing?.times).toHaveLength(PLAN.points);
      const found = /^([\d,]+) found a shape by its outline/.exec(pointing?.note ?? '');
      expect(Number(found?.[1]?.replace(/,/g, '') ?? 0)).toBeGreaterThan(0);
      // Each drag dropped its shape as a move, which went through the core and was shown.
      expect(drop).toMatchObject({
        name: 'Drop a shape with free geometry and 50 relations',
        mark: DROP_MARK,
      });
      expect(drop?.times).toHaveLength(PLAN.drags);
      expect(sent).toHaveLength(PLAN.drags);
      for (const command of sent) {
        expect(command).toMatchObject({ type: 'set-positions', view: GEOMETRY_VIEW });
      }
      const moved = bench
        .project()
        .views[0]?.positions.find((position) => position.element === hub);
      expect(moved?.pinned).toBe(true);
      expect(results.notes.some((note) => note.startsWith('Pointing along outlines'))).toBe(true);
      // The theme the canvas started in, back.
      expect(bench.controller.renderer.theme).toBe('light');
    },
    60_000,
  );
});
