/**
 * The benchmark's gestures run on the default project as on the one beyond boxes: the shape in the
 * middle resized by a handle, the guides showing (W51, ADR 0074), and dragged, each letting go
 * through the core, in both modes. This shows that the phases run, not how fast they are.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NAMES_FROM } from '../canvas/renderer';
import { benchCanvas } from '../test/benchCanvas';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import type { BenchMode } from './frames';
import { LET_GO_MARK, measureDrags, measureResizes } from './gestures';
import { syntheticProject } from './synthetic';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

const PLAN = { gestures: 2, frames: 3, rest: 0 };
const ELEMENT = 'element-0-6';

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('the benchmark’s gestures on the 10,000-element project’s layout', () => {
  it.each<BenchMode>(['work', 'frames'])(
    'resizes a shape with guides, and drags it, in %s mode',
    async (mode) => {
      const { bench, sent } = await benchCanvas(
        syntheticProject({ elements: 300 }),
        'everything',
        mode,
      );
      bench.move({ ...bench.cameraAt(NAMES_FROM * 1.3) });
      const resized = await measureResizes(bench, ELEMENT, PLAN);
      expect(resized.phase.name).toBe('Resize a shape, guides shown');
      expect(resized.phase.frames.length).toBeGreaterThan(0);
      expect(resized.timed).toMatchObject({ name: 'Resize a shape: let go', mark: LET_GO_MARK });
      expect(resized.timed.times).toHaveLength(PLAN.gestures);
      expect(resized.note).toMatch(/2 of 2 applied/);
      expect(resized.note).toMatch(/guides drawn in [1-9]\d* of/);
      const stored = bench
        .project()
        .views[0]?.positions.find((position) => position.element === ELEMENT);
      expect(stored).toMatchObject({ pinned: true });
      expect(stored?.width).toBeDefined();

      const dragged = await measureDrags(bench, ELEMENT, PLAN);
      expect(dragged.phase.name).toBe('Drag a shape');
      expect(dragged.timed.times).toHaveLength(PLAN.gestures);
      expect(sent).toHaveLength(PLAN.gestures * 2);
    },
    60_000,
  );

  it('says so, and measures nothing, for a shape the view does not show', async () => {
    const { bench } = await benchCanvas(syntheticProject({ elements: 50 }), 'everything', 'work');
    const resized = await measureResizes(bench, 'nothing', PLAN);
    expect(resized.timed.times).toEqual([]);
    expect(resized.note).toMatch(/no such shape/);
  });
});
