/**
 * Every phase of the beyond-boxes benchmark runs, briefly, in both of its modes, on a canvas in
 * jsdom: this shows that they run and report as the benchmark's phases do, not how fast they are,
 * which the benchmark's page measures on a quiet machine.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { benchCanvas } from '../test/benchCanvas';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { POINTING_MARK, measureBeyondBoxes, type BeyondPlan } from './beyond';
import type { BenchMode } from './frames';
import { GEOMETRY_VIEW, geometryHub, syntheticGeometry, withCurves } from './geometry';
import { LET_GO_MARK } from './gestures';

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
  gestures: 2,
  gestureFrames: 3,
  switches: 1,
  rest: 0,
};

const PHASES = [
  'Pan, whole view',
  'Zoom, whole view',
  'Select by clicking, whole view',
  'Pan, names shown',
  'Zoom, names shown',
  'Select by clicking, names shown',
  'Point along outlines, names shown',
  'Drag a shape with free geometry and 50 relations',
  'Resize a shape with free geometry and 50 relations, guides shown',
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
      const { bench, sent } = await benchCanvas(start, GEOMETRY_VIEW, mode);
      const hub = geometryHub(start);
      const before = start.views[0]?.positions.find((position) => position.element === hub);
      const results = await measureBeyondBoxes(bench, PLAN);

      expect(results.phases.map((phase) => phase.name)).toEqual(PHASES);
      for (const phase of results.phases) {
        expect(phase.frames.length, phase.name).toBeGreaterThan(0);
      }
      expect(results.phases.filter((phase) => phase.restyling).map((phase) => phase.name)).toEqual([
        'Switch theme, whole view',
        'Switch theme, names shown',
      ]);
      expect(results.latency).toHaveLength(PLAN.clicks * 2);

      const [pointing, drop, resize] = results.timed;
      expect(pointing).toMatchObject({
        name: 'Find what is under the pointer, along outlines',
        mark: POINTING_MARK,
      });
      expect(pointing?.times).toHaveLength(PLAN.points);
      const found = /^([\d,]+) found a shape by its outline/.exec(pointing?.note ?? '');
      expect(Number(found?.[1]?.replace(/,/g, '') ?? 0)).toBeGreaterThan(0);
      // Each drag and each resize let go of its shape, which went through the core and was shown.
      expect(drop).toMatchObject({
        name: 'Drop a shape with free geometry and 50 relations',
        mark: LET_GO_MARK,
      });
      expect(resize).toMatchObject({
        name: 'Resize a shape with free geometry and 50 relations: let go',
        mark: LET_GO_MARK,
      });
      expect(drop?.times).toHaveLength(PLAN.gestures);
      expect(resize?.times).toHaveLength(PLAN.gestures);
      expect(sent).toHaveLength(PLAN.gestures * 2);
      const after = bench
        .project()
        .views[0]?.positions.find((position) => position.element === hub);
      expect(after?.pinned).toBe(true);
      expect(after?.width).toBeDefined();
      expect(before?.width).toBeUndefined();
      expect(results.notes.some((note) => note.startsWith('Pointing along outlines'))).toBe(true);
      // The resize showed guides, where its sides lined up with the shapes beside it.
      const guides = results.notes.find((note) => note.startsWith('Resize'));
      expect(guides).toMatch(/guides drawn in [1-9]\d* of/);
      // The theme the canvas started in, back.
      expect(bench.controller.renderer.theme).toBe('light');
    },
    60_000,
  );
});
