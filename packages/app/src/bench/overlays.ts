/**
 * The benchmark's phases for overlays and levels of detail (ADR 0055):
 * - an overlay on every shape: coloring them all by a number, which restyles the tiles in place, and
 *   sizing them all by it, which changes where relations attach, as a layout does, each timed from
 *   the scene's build to the frame drawn with it, and the frames after a color until it shows;
 * - zooming back and forth across a level of detail that every Service declares, which draws again
 *   only the tiles that cross it, judged by the frame budget.
 * Each starts from the benchmark's project and puts it back when it is done.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, LevelOfDetail, Overlay } from '@visual-anything/schema';
import type { Camera } from '../canvas/camera';
import { zoomAt } from '../canvas/camera';
import type { CanvasRenderer } from '../canvas/renderer';

/** A phase of frames, as the benchmark judges them. */
export interface FramePhase {
  name: string;
  frames: number[];
  restyling?: boolean;
}

/** A timed action, as the benchmark reports it. */
export interface TimedAction {
  name: string;
  times: number[];
  mark?: number;
  note?: string;
}

/** What the phases need of the benchmark. */
export interface OverlayBench {
  view: Id;
  renderer: CanvasRenderer;
  project(): ProjectSnapshot;
  /** Shows a project as the app does after a change, and says what each part took. */
  show(next: ProjectSnapshot): { build: number; index: number; draw: number };
  settle(ms: number): Promise<void>;
  measure(name: string, count: number, step: (frame: number) => void): Promise<FramePhase>;
  move(camera: Camera): void;
  cameraAt(scale: number): Camera;
  middle: { x: number; y: number };
}

/** How long applying an overlay may take, as a layout may (components.md §3.9). */
const OVERLAY_MARK = 150;

/** Every element with a number to read, from 0 to 99, which the overlays color and size by. */
export function withLoad(project: ProjectSnapshot): ProjectSnapshot {
  return {
    ...project,
    model: {
      ...project.model,
      elements: project.model.elements.map((element, at) => ({
        ...element,
        attributes: { ...element.attributes, load: (at * 37) % 100 },
      })),
    },
  };
}

/** Colors every shape by its load, along a ramp of three colors. */
export const LOAD_FILL: Overlay = {
  id: 'load-fill',
  name: 'Load',
  of: 'elements',
  attribute: 'load',
  channel: 'fill',
  mapping: {
    kind: 'continuous',
    stops: [
      { at: 0, color: '#DCFCE7', label: 'idle' },
      { at: 50, color: '#FEF08A' },
      { at: 100, color: '#FCA5A5', label: 'busy' },
    ],
  },
};

/** Sizes every shape without contents by its load, from 0.75 to 1.25 times. */
export const LOAD_SIZE: Overlay = {
  id: 'load-size',
  of: 'elements',
  attribute: 'load',
  channel: 'size',
  mapping: {
    kind: 'continuous',
    stops: [
      { at: 0, size: 0.75 },
      { at: 100, size: 1.25 },
    ],
  },
};

/** What every Service shows as the zoom crosses the scale names start at. */
export const SERVICE_LEVELS: LevelOfDetail[] = [
  { from: 0, shows: ['silhouette'] },
  { from: 0.35, shows: ['name'] },
  { from: 0.7, shows: ['name', 'detail', 'image'] },
];

function run(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(project, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
  return outcome.state;
}

/**
 * Applies an overlay to every shape and takes it away again, `count` times each for a color and for
 * a size, timing each from the scene's build to the frame drawn with it; and records the frames after
 * each color until it shows, and 30 more, as the recolor phase does.
 */
export async function measureOverlays(
  bench: OverlayBench,
  count: number,
): Promise<{ timed: TimedAction[]; phase: FramePhase; note: string }> {
  const start = bench.project();
  const loaded = withLoad(start);
  bench.show(loaded);
  await bench.settle(1000);
  const frames: number[] = [];
  const { renderer } = bench;
  const timedFrame = () => {
    const began = performance.now();
    renderer.renderNow(true);
    frames.push(performance.now() - began);
  };
  const apply = (overlays: Overlay[], times: number[], parts: number[]) => {
    const next = run(bench.project(), { type: 'set-overlays', view: bench.view, overlays });
    const taken = bench.show(next);
    times.push(taken.build + taken.index + taken.draw);
    parts[0] = (parts[0] ?? 0) + taken.build;
    parts[1] = (parts[1] ?? 0) + taken.index;
    parts[2] = (parts[2] ?? 0) + taken.draw;
  };
  performance.mark('phase Overlay, color every shape');
  const colored: number[] = [];
  const colorParts: number[] = [];
  const until: number[] = [];
  for (let each = 0; each < count; each++) {
    apply(each % 2 === 0 ? [LOAD_FILL] : [], colored, colorParts);
    let after = 1;
    while (renderer.switching) {
      timedFrame();
      after += 1;
    }
    until.push(after);
    for (let later = 0; later < 30; later++) timedFrame();
    await bench.settle(300);
  }
  performance.mark('phase Overlay, size every shape');
  const sized: number[] = [];
  const sizeParts: number[] = [];
  for (let each = 0; each < count; each++) {
    apply(each % 2 === 0 ? [LOAD_SIZE] : [], sized, sizeParts);
    await bench.settle(300);
  }
  bench.show(start);
  await bench.settle(1000);
  const shapes = start.model.elements.length.toLocaleString();
  const average = (parts: number[], at: number) =>
    ((parts[at] ?? 0) / Math.max(1, count)).toFixed(0);
  const split = (parts: number[]) =>
    `scene ${average(parts, 0)} ms, index ${average(parts, 1)} ms, tiles and frame ${average(parts, 2)} ms on average`;
  return {
    timed: [
      {
        name: `Overlay: color ${shapes} shapes by an attribute`,
        times: colored,
        mark: OVERLAY_MARK,
        note: split(colorParts),
      },
      {
        name: `Overlay: size ${shapes} shapes by an attribute`,
        times: sized,
        mark: OVERLAY_MARK,
        note: split(sizeParts),
      },
    ],
    phase: { name: 'Overlay of color, frames after it', frames, restyling: true },
    note: `Overlay of color: shown after ${until.join(', ')} frames`,
  };
}

/**
 * Zooms back and forth across the scale every Service's names show from, past where they are left,
 * twice each way, with every Service declaring levels of detail.
 */
export async function measureLevelCrossing(bench: OverlayBench): Promise<FramePhase> {
  const start = bench.project();
  bench.show(
    run(start, {
      type: 'set-component-appearance',
      component: 'systems.service',
      appearanceTraits: { levels: SERVICE_LEVELS },
    }),
  );
  bench.move(bench.cameraAt(0.35 * 1.05));
  await bench.settle(1000);
  // Thirty steps of 1% take the zoom from 5% above the level to 22% below it, and back.
  const phase = await bench.measure('Zoom across a level of detail', 120, (frame) => {
    const out = Math.floor(frame / 30) % 2 === 0;
    bench.move(zoomAt(bench.renderer.camera, bench.middle, out ? 1 / 1.01 : 1.01));
  });
  bench.show(start);
  await bench.settle(1000);
  return phase;
}
