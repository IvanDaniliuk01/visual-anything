/**
 * The canvas benchmark: draws a synthetic view of 10,000 elements and measures it while the camera
 * pans and zooms by itself and shapes are selected. Open `/bench.html` from the dev server;
 * `?elements=N` changes the size.
 *
 * By default it measures the work of each frame: it moves the camera, draws the frame and waits for
 * the GPU to finish, so the result does not depend on how often the browser offers frames, which it
 * slows down for windows it thinks nobody sees. `?mode=frames` measures the time between frames as
 * the browser shows them instead, which needs the window in front.
 */
import type { Id } from '@visual-anything/schema';
import { selectionOf } from '../editor/selection';
import { panBy, screenToWorld, zoomAt, type Camera } from '../canvas/camera';
import { CanvasController } from '../canvas/controller';
import { hitAt, indexScene } from '../canvas/hit';
import { buildScene } from '../canvas/scene';
import { syntheticProject } from './synthetic';

interface Phase {
  name: string;
  frames: number[];
}

/** The target: 60 frames per second, which leaves 16.7 ms for each. */
const TARGET_FPS = 60;
const FRAME_BUDGET = 1000 / TARGET_FPS;

const search = new URLSearchParams(location.search);
const size = Number(search.get('elements') ?? 10_000);
const mode: 'work' | 'frames' = search.get('mode') === 'frames' ? 'frames' : 'work';
const host = document.getElementById('canvas') as HTMLElement;
const status = document.getElementById('status') as HTMLElement;

const started = performance.now();
const project = syntheticProject({ elements: size });
const scene = buildScene(project, 'everything');
const indexed = indexScene(scene);
const prepared = performance.now() - started;

const controller = new CanvasController(host, {
  select: () => undefined,
  command: () => Promise.resolve(false),
  relate: () => undefined,
  remove: () => undefined,
  rename: () => undefined,
  camera: () => undefined,
  failure: (error) => {
    status.textContent = `The canvas failed: ${error instanceof Error ? error.message : String(error)}`;
  },
});
controller.update(project, 'everything', indexed, false);
// For looking into the benchmark from the browser's console.
Object.assign(window, { benchmark: { controller, project, scene, indexed } });

void run();

async function run(): Promise<void> {
  await settle(1000);
  status.textContent = `Measuring ${mode === 'work' ? 'the work of each frame' : 'frames'} with ${size.toLocaleString()} elements and ${scene.relations.length.toLocaleString()} relations…`;
  const phases: Phase[] = [];
  const { width, height } = controller.renderer.viewport;
  const middle = { x: width / 2, y: height / 2 };

  controller.fit();
  await settle(300);
  phases.push(
    await measure('Pan, whole view', 180, (frame, camera) => panBy(camera, frame < 90 ? 6 : -6, 0)),
  );
  phases.push(
    await measure('Zoom, whole view', 180, (frame, camera) =>
      zoomAt(camera, middle, frame < 90 ? 1.02 : 1 / 1.02),
    ),
  );

  controller.renderer.setCamera(zoomAt(controller.camera, middle, 14));
  await settle(300);
  phases.push(
    await measure('Pan, names shown', 180, (frame, camera) =>
      panBy(camera, frame < 90 ? -8 : 8, frame < 90 ? -4 : 4),
    ),
  );
  phases.push(
    await measure('Pan, names shown, again', 180, (frame, camera) =>
      panBy(camera, frame < 90 ? -8 : 8, frame < 90 ? -4 : 4),
    ),
  );
  phases.push(
    await measure('Zoom across the label threshold', 180, (frame, camera) =>
      zoomAt(camera, middle, frame < 90 ? 1 / 1.02 : 1.02),
    ),
  );

  controller.fit();
  await settle(300);
  const selection = await measureSelection(60);
  phases.push(selection.phase);

  report(phases, selection.latency);
}

/** Moves the camera once a frame for `count` frames and records what each frame took. */
function measure(
  name: string,
  count: number,
  step: (frame: number, camera: Camera) => Camera,
): Promise<Phase> {
  if (mode === 'work') {
    const frames: number[] = [];
    for (let frame = 0; frame < count; frame++) {
      const began = performance.now();
      controller.renderer.setCamera(step(frame, controller.camera));
      controller.renderer.renderNow(true);
      frames.push(performance.now() - began);
    }
    return Promise.resolve({ name, frames });
  }
  return new Promise((resolve) => {
    const frames: number[] = [];
    let previous: number | undefined;
    let frame = 0;
    const tick = (now: number) => {
      if (previous !== undefined) frames.push(now - previous);
      previous = now;
      if (frame >= count) {
        resolve({ name, frames });
        return;
      }
      controller.renderer.setCamera(step(frame, controller.camera));
      frame += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Selects the shape under a random point, as clicks would, and times each selection and its frame. */
function measureSelection(count: number): Promise<{ phase: Phase; latency: number[] }> {
  const { width, height } = controller.renderer.viewport;
  const select = (): number => {
    const began = performance.now();
    const point = screenToWorld(controller.camera, {
      x: Math.random() * width,
      y: Math.random() * height,
    });
    const hit = hitAt(indexed, point, 6 / controller.camera.scale);
    const id: Id | undefined = hit?.kind === 'shape' ? hit.shape.element : undefined;
    controller.setSelection(selectionOf(id === undefined ? [] : [{ kind: 'element', id }]));
    return performance.now() - began;
  };
  if (mode === 'work') {
    const frames: number[] = [];
    const latency: number[] = [];
    for (let frame = 0; frame < count; frame++) {
      const began = performance.now();
      latency.push(select());
      controller.renderer.renderNow(true);
      frames.push(performance.now() - began);
    }
    return Promise.resolve({ phase: { name: 'Select by clicking', frames }, latency });
  }
  return new Promise((resolve) => {
    const frames: number[] = [];
    const latency: number[] = [];
    let previous: number | undefined;
    let frame = 0;
    const tick = (now: number) => {
      if (previous !== undefined) frames.push(now - previous);
      previous = now;
      if (frame >= count) {
        resolve({ phase: { name: 'Select by clicking', frames }, latency });
        return;
      }
      latency.push(select());
      frame += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function settle(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function report(phases: Phase[], latency: number[]): void {
  const rows = phases.map(({ name, frames }) => {
    const average = frames.reduce((sum, each) => sum + each, 0) / Math.max(1, frames.length);
    return {
      name,
      averageFps: 1000 / average,
      p95: percentile(frames, 0.95),
      worst: Math.max(...frames),
    };
  });
  // Work must fit in a frame; frames as shown may run a little late now and then.
  const p95Limit = mode === 'work' ? FRAME_BUDGET : 25;
  const passes = (row: (typeof rows)[number]) =>
    row.averageFps >= TARGET_FPS * 0.92 && row.p95 <= p95Limit;
  const passed = rows.every(passes);
  const body = document.querySelector('#table tbody') as HTMLElement;
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.className = passes(row) ? 'pass' : 'fail';
    for (const value of [
      row.name,
      row.averageFps.toFixed(1),
      row.p95.toFixed(1),
      row.worst.toFixed(1),
    ]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  (document.getElementById('table') as HTMLElement).hidden = false;
  const selection = { p50: percentile(latency, 0.5), p95: percentile(latency, 0.95) };
  status.textContent = `${size.toLocaleString()} elements, ${scene.relations.length.toLocaleString()} relations; ${mode === 'work' ? 'work of each frame, GPU included' : 'frames as shown'}. Scene built in ${prepared.toFixed(0)} ms. Selecting takes ${selection.p50.toFixed(2)} ms (p95 ${selection.p95.toFixed(2)} ms).`;
  const verdict = document.getElementById('verdict') as HTMLElement;
  verdict.className = passed ? 'pass' : 'fail';
  verdict.textContent = passed
    ? `Meets the ${TARGET_FPS} fps target in every phase.`
    : `Misses the ${TARGET_FPS} fps target in at least one phase.`;
  console.info(
    'Visual Anything benchmark',
    JSON.stringify({
      elements: size,
      relations: scene.relations.length,
      mode,
      prepared,
      rows,
      selection,
      passed,
    }),
  );
}
