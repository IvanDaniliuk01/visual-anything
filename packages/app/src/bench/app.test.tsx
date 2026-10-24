import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { AppBench, type BenchPlan, type BenchResults } from './app';
import { syntheticProject } from './synthetic';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

/** One step of each phase, two clicks so that the second selects another shape, and no rest. */
const PLAN: BenchPlan = {
  clicks: 2,
  selectAlls: 1,
  frames: 2,
  nudges: 1,
  renames: 1,
  rest: { start: 0, between: 0 },
};

type Outcome = { results: BenchResults } | { error: unknown };

describe('The app benchmark', () => {
  let actEnvironment: unknown;

  beforeEach(() => {
    // The benchmark drives the app as a browser does, outside act().
    actEnvironment = Reflect.get(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', false);
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(600);
  });

  afterEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', actEnvironment);
    vi.restoreAllMocks();
  });

  it('mounts the whole app and runs one step of each phase through its elements', async () => {
    const project = syntheticProject({ elements: 60 });
    const finished = new Promise<Outcome>((resolve) => {
      render(<AppBench project={project} plan={PLAN} onFinish={resolve} />);
    });
    // The canvas starts, as PixiJS does once WebGL is ready.
    FakeApplication.created.at(-1)?.finishInit();
    const outcome = await finished;
    if ('error' in outcome) throw outcome.error;
    const { results } = outcome;

    expect(results.steps.map((phase) => [phase.name, phase.steps.length])).toEqual([
      ['Select by clicking', 2],
      ['Select everything', 1],
      ['Keyboard move', 1],
      ['One edit: a rename', 1],
    ]);
    for (const step of results.steps.flatMap((phase) => phase.steps)) {
      expect(step.total).toBeGreaterThanOrEqual(step.shown);
      expect(step.commits).toBeGreaterThan(0);
    }
    // What changes the project goes through the core, and the shell commits it.
    for (const phase of results.steps.slice(2)) {
      const [step] = phase.steps;
      expect(step?.core).toBeGreaterThan(0);
      expect(step?.effects).toBeGreaterThanOrEqual(step?.committed ?? Infinity);
    }
    expect(results.frames.map((phase) => [phase.name, phase.intervals.length])).toEqual([
      ['Pan by dragging, one element selected', 2],
      ['Pan with the wheel, one element selected', 2],
      ['Zoom with the wheel, one element selected', 2],
      ['Pan by dragging, everything selected', 2],
      ['Pan with the wheel, everything selected', 2],
      ['Zoom with the wheel, everything selected', 2],
    ]);

    // The moved element was renamed from the inspector, and shows its new name there.
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    const name = within(inspector).getByRole<HTMLInputElement>('textbox', { name: 'Name' });
    expect(name.value).toMatch(/ renamed 1$/);
  }, 30_000);
});
