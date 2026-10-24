/**
 * The canvas benchmark: draws a synthetic view of 10,000 elements and measures it while the camera
 * pans and zooms by itself, shapes are selected one at a time and all at once, and the view is edited
 * and restacked. Open `/bench.html` from the dev server; `?elements=N` changes the size and
 * `?overlap=stairs`, `grid` or `cascade` makes shapes overlap (see `synthetic.ts`).
 *
 * By default it measures the work of each frame: it moves the camera, draws the frame and waits for
 * the GPU to finish, so the result does not depend on how often the browser offers frames, which it
 * slows down for windows it thinks nobody sees. A phase passes when its frames take 10 ms on average,
 * 13 ms at the 95th percentile and never more than two frames at 60 fps. `?mode=frames` measures the
 * time between frames as the browser shows them instead, which needs the window in front.
 */
import {
  applyOperations,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { EMPTY_SELECTION, selectionOf, type Selectable, type Selection } from '../editor/selection';
import { panBy, screenToWorld, zoomAt, type Camera } from '../canvas/camera';
import { CanvasController } from '../canvas/controller';
import { centerOf } from '../canvas/geometry';
import { hitAt, indexScene, type IndexedScene } from '../canvas/hit';
import { DETAILS_FROM, NAMES_FROM } from '../canvas/renderer';
import { buildScene, type ElementShape } from '../canvas/scene';
import { MAX_BANDS, plannedTiles } from '../canvas/tiles';
import { OVERLAPS, seeded, syntheticProject, type Overlap } from './synthetic';

interface Phase {
  name: string;
  frames: number[];
}

interface Row {
  name: string;
  average: number;
  p95: number;
  worst: number;
  passes: boolean;
}

interface Timed {
  name: string;
  times: number[];
  /** The 95th percentile it must stay under, when it has one. */
  mark?: number;
  note?: string;
}

/** The target: 60 frames per second, which leaves 16.7 ms for each. */
const TARGET_FPS = 60;
/** What the work of a frame may take: on average, at the 95th percentile, and at worst two frames. */
const WORK = { average: 10, p95: 13, worst: 2000 / TARGET_FPS };
/** What frames as shown may take: they may run a little late now and then. */
const SHOWN = { average: 1000 / (TARGET_FPS * 0.92), p95: 25 };
/** How long a restack may take, from the command to the frame drawn, at the 95th percentile. */
const RESTACK_MARK = 100;
const VIEW = 'everything';

const search = new URLSearchParams(location.search);
const size = Number(search.get('elements') ?? 10_000);
const mode: 'work' | 'frames' = search.get('mode') === 'frames' ? 'frames' : 'work';
const overlap: Overlap = OVERLAPS.find((each) => each === search.get('overlap')) ?? 'none';
const host = document.getElementById('canvas') as HTMLElement;
const status = document.getElementById('status') as HTMLElement;

const started = performance.now();
let project: ProjectSnapshot = syntheticProject({ elements: size, overlap });
let indexed: IndexedScene = indexScene(buildScene(project, VIEW));
const prepared = performance.now() - started;
const { scene } = indexed;
// Before any edit moves a shape over another.
const bands = bandReport();

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
controller.update(project, VIEW, indexed, false);
// For looking into the benchmark from the browser's console.
Object.assign(window, { benchmark: { controller, project, scene, indexed } });

void run();

async function run(): Promise<void> {
  // Long enough for the garbage of building the scene to be collected before anything is measured.
  await settle(2500);
  status.textContent = `Measuring ${mode === 'work' ? 'the work of each frame' : 'frames'} with ${size.toLocaleString()} elements and ${scene.relations.length.toLocaleString()} relations…`;
  const phases: Phase[] = [];
  const { width, height } = controller.renderer.viewport;
  const middle = { x: width / 2, y: height / 2 };

  controller.fit();
  await settle(300);
  phases.push(
    await measure('Pan, whole view', 180, (frame) =>
      move(panBy(controller.camera, frame < 90 ? 6 : -6, 0)),
    ),
  );
  phases.push(
    await measure('Zoom, whole view', 180, (frame) =>
      move(zoomAt(controller.camera, middle, frame < 90 ? 1.02 : 1 / 1.02)),
    ),
  );

  // Between the scale names show at and the one details show at, on any window.
  move(cameraAt(NAMES_FROM * 1.3));
  await settle(300);
  phases.push(
    await measure('Pan, names shown', 180, (frame) =>
      move(panBy(controller.camera, frame < 90 ? -8 : 8, frame < 90 ? -4 : 4)),
    ),
  );
  phases.push(
    await measure('Pan, names shown, again', 180, (frame) =>
      move(panBy(controller.camera, frame < 90 ? -8 : 8, frame < 90 ? -4 : 4)),
    ),
  );
  phases.push(
    await measure('Zoom across the label threshold', 180, (frame) =>
      move(zoomAt(controller.camera, middle, frame < 90 ? 1 / 1.02 : 1.02)),
    ),
  );

  // Component names and relation labels.
  move(cameraAt(DETAILS_FROM * 1.15));
  await settle(300);
  phases.push(
    await measure('Pan, details shown', 180, (frame) =>
      move(panBy(controller.camera, frame < 90 ? -8 : 8, frame < 90 ? -4 : 4)),
    ),
  );

  controller.fit();
  await settle(300);
  const latency: number[] = [];
  phases.push(
    await measure('Select by clicking', 60, () => {
      const began = performance.now();
      selectAt({ x: Math.random() * width, y: Math.random() * height });
      latency.push(performance.now() - began);
    }),
  );

  const everything = (): Selection =>
    selectionOf([
      ...[...new Set(scene.shapes.map((shape) => shape.element))].map((id): Selectable => ({
        kind: 'element',
        id,
      })),
      ...scene.notes.map((note): Selectable => ({ kind: 'free-shape', id: note.id })),
      ...scene.arrows.map((arrow): Selectable => ({ kind: 'free-shape', id: arrow.id })),
    ]);
  phases.push(
    await measure(
      'Select everything',
      20,
      () => controller.setSelection(everything()),
      () => controller.setSelection(EMPTY_SELECTION),
    ),
  );
  controller.setSelection(everything());
  await settle(300);
  phases.push(
    await measure('Zoom, everything selected', 180, (frame) =>
      move(zoomAt(controller.camera, middle, frame < 90 ? 1.02 : 1 / 1.02)),
    ),
  );
  controller.setSelection(EMPTY_SELECTION);

  // Edits, near the middle of the screen, where they are drawn in full and named.
  move(cameraAt(NAMES_FROM * 1.3));
  await settle(300);
  const timed: Timed[] = [await measureEdits(10)];
  if (overlap === 'none' || overlap === 'stairs') timed.push(await measureRestacks(20));

  report(phases, timed, latency);
}

function move(camera: Camera): void {
  controller.renderer.setCamera(camera);
}

/** The camera at a scale, centered on the middle of the scene. */
function cameraAt(scale: number): Camera {
  const { width, height } = controller.renderer.viewport;
  const middle = scene.bounds ? centerOf(scene.bounds) : { x: 0, y: 0 };
  return { scale, x: width / 2 - middle.x * scale, y: height / 2 - middle.y * scale };
}

/** Selects the shape at a point of the screen, as a click would. */
function selectAt(point: { x: number; y: number }): void {
  const world = screenToWorld(controller.camera, point);
  const hit = hitAt(indexed, world, 6 / controller.camera.scale, (shape) =>
    controller.renderer.showsOutline(shape.key),
  );
  const id: Id | undefined = hit?.kind === 'shape' ? hit.shape.element : undefined;
  controller.setSelection(selectionOf(id === undefined ? [] : [{ kind: 'element', id }]));
}

/**
 * Takes `count` steps, one a frame, and records what each frame took. `before`, when given, runs
 * before each step, with a frame of its own that is not recorded.
 */
function measure(
  name: string,
  count: number,
  step: (frame: number) => void,
  before?: () => void,
): Promise<Phase> {
  if (mode === 'work') {
    const frames: number[] = [];
    for (let frame = 0; frame < count; frame++) {
      if (before) {
        before();
        controller.renderer.renderNow(true);
      }
      const began = performance.now();
      step(frame);
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
      if (frame >= count * (before ? 2 : 1)) {
        resolve({ name, frames });
        return;
      }
      if (before && frame % 2 === 0) before();
      else step(before ? Math.floor(frame / 2) : frame);
      frame += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Shows a project as the app does after a change: a new scene, its index, and the next frame. */
function showProject(next: ProjectSnapshot): { build: number; index: number; draw: number } {
  const began = performance.now();
  const nextScene = buildScene(next, VIEW);
  const built = performance.now();
  indexed = indexScene(nextScene);
  const indexedAt = performance.now();
  controller.update(next, VIEW, indexed, false);
  controller.renderer.renderNow(true);
  project = next;
  return { build: built - began, index: indexedAt - built, draw: performance.now() - indexedAt };
}

/**
 * Renames and moves the shape in the middle of the screen with the core, one edit after another,
 * and times each from the scene's build to the frame drawn with it.
 */
async function measureEdits(count: number): Promise<Timed> {
  const shape = shapeInTheMiddle();
  const times: number[] = [];
  const parts = { build: 0, index: 0, draw: 0 };
  for (let each = 0; each < count && shape; each++) {
    const command: Command =
      each % 2 === 0
        ? { type: 'update-element', id: shape.element, changes: { name: `Edited ${each}` } }
        : {
            type: 'set-positions',
            view: VIEW,
            positions: [
              {
                element: shape.element,
                ...(shape.container === undefined ? {} : { container: shape.container }),
                x: shape.offset.x + each * 4,
                y: shape.offset.y,
                pinned: true,
              },
            ],
          };
    const outcome = executeCommand(project, command);
    if (!outcome.ok) throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
    const taken = showProject(outcome.state);
    parts.build += taken.build;
    parts.index += taken.index;
    parts.draw += taken.draw;
    times.push(taken.build + taken.index + taken.draw);
    await settle(50);
  }
  const average = (total: number) => (total / Math.max(1, times.length)).toFixed(0);
  return {
    name: 'One edit: a rename or a move',
    times,
    note: `scene ${average(parts.build)} ms, index ${average(parts.index)} ms, tiles and frame ${average(parts.draw)} ms on average`,
  };
}

/**
 * Sends random systems directly in World to the back and brings others to the front, one after
 * another, and times each from the command to the frame drawn with it.
 */
async function measureRestacks(count: number): Promise<Timed> {
  const random = seeded(7);
  const systems = indexed.contentsOf
    .get('')
    ?.filter((shape) => shape.element.startsWith('system-'))
    .map((shape) => shape.element);
  const times: number[] = [];
  let largest = 0;
  for (let each = 0; each < count && systems && systems.length > 0; each++) {
    const element = systems[Math.floor(random() * systems.length)] as Id;
    const began = performance.now();
    const outcome = executeCommand(project, {
      type: 'restack',
      view: VIEW,
      moves: [{ shape: { element }, to: each % 2 === 0 ? 'back' : 'front' }],
    });
    if (!outcome.ok) throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
    // As the app applies what the local program sends back.
    showProject(applyOperations(project, outcome.operations).state);
    times.push(performance.now() - began);
    const lists = Object.values(
      project.views.find((view) => view.id === VIEW)?.stackingOrder ?? {},
    );
    largest = Math.max(largest, ...lists.map((list) => list.length));
    await settle(50);
  }
  return {
    name: 'Restack: to the back, then to the front',
    times,
    mark: RESTACK_MARK,
    note: `the longest stacking list written holds ${largest.toLocaleString()} ids`,
  };
}

/** The shape nearest the middle of the screen, one that holds nothing when there is one near. */
function shapeInTheMiddle(): ElementShape | undefined {
  const { width, height } = controller.renderer.viewport;
  const world = screenToWorld(controller.camera, { x: width / 2, y: height / 2 });
  const bounds = scene.bounds;
  const reachAll = bounds ? Math.max(bounds.width, bounds.height) * 2 : 0;
  for (let reach = 400; reach <= Math.max(400, reachAll); reach *= 2) {
    const near = indexed.shapes.query({
      x: world.x - reach,
      y: world.y - reach,
      width: 2 * reach,
      height: 2 * reach,
    });
    const shapes = near.map((at) => indexed.scene.shapes[at] as ElementShape);
    const found = shapes.find((shape) => !shape.holdsContents) ?? shapes[0];
    if (found) return found;
  }
  return undefined;
}

function settle(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

/** How the scene's shapes fall in bands and tiles. */
function bandReport(): string {
  const counts = new Map<number, number>();
  for (const band of indexed.bands) counts.set(band, (counts.get(band) ?? 0) + 1);
  // The bands with tiles of their own one by one, and those beyond them together.
  const beyond = [...counts.entries()]
    .filter(([band]) => band >= MAX_BANDS)
    .reduce((sum, [, count]) => sum + count, 0);
  const histogram = [
    ...[...counts.entries()]
      .filter(([band]) => band < MAX_BANDS)
      .sort(([a], [b]) => a - b)
      .map(([band, count]) => `${band}: ${count.toLocaleString()}`),
    ...(beyond > 0 ? [`${MAX_BANDS} and above: ${beyond.toLocaleString()}`] : []),
  ].join(', ');
  const tiles = plannedTiles(indexed, new Set());
  const runs = tiles.filter((tile) => tile.band === MAX_BANDS).length;
  return `Overlap "${overlap}": highest band ${Math.max(0, ...indexed.bands)}; shapes by band ${histogram}; ${(tiles.length - runs).toLocaleString()} tiles in bands and ${runs.toLocaleString()} runs beyond them.`;
}

function report(phases: Phase[], timed: Timed[], latency: number[]): void {
  const rows: Row[] = phases.map(({ name, frames }) => {
    const average = frames.reduce((sum, each) => sum + each, 0) / Math.max(1, frames.length);
    const p95 = percentile(frames, 0.95);
    const worst = Math.max(...frames);
    const passes =
      mode === 'work'
        ? average <= WORK.average && p95 <= WORK.p95 && worst <= WORK.worst
        : average <= SHOWN.average && p95 <= SHOWN.p95;
    return { name, average, p95, worst, passes };
  });
  const passed = rows.every((row) => row.passes);
  const body = document.querySelector('#table tbody') as HTMLElement;
  for (const row of rows) {
    addRow(body, row.passes ? 'pass' : 'fail', [
      row.name,
      row.average.toFixed(1),
      row.p95.toFixed(1),
      row.worst.toFixed(1),
    ]);
  }
  (document.getElementById('table') as HTMLElement).hidden = false;

  const edits = document.querySelector('#edits tbody') as HTMLElement;
  const actions = timed.map((each) => ({
    ...each,
    p50: percentile(each.times, 0.5),
    p95: percentile(each.times, 0.95),
    worst: Math.max(0, ...each.times),
  }));
  for (const action of actions) {
    const passes = action.mark === undefined || action.p95 <= action.mark;
    addRow(edits, action.mark === undefined ? '' : passes ? 'pass' : 'fail', [
      action.name,
      action.p50.toFixed(0),
      action.p95.toFixed(0),
      action.worst.toFixed(0),
      action.mark === undefined ? 'none yet' : `p95 ≤ ${action.mark}`,
    ]);
  }
  (document.getElementById('edits') as HTMLElement).hidden = false;
  const notes = document.getElementById('notes') as HTMLElement;
  notes.textContent = [
    bands,
    ...actions.flatMap((action) => (action.note ? [`${action.name}: ${action.note}.`] : [])),
  ].join('\n');

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
      overlap,
      prepared,
      rows,
      actions: actions.map(({ name, p50, p95, worst, mark, note }) => ({
        name,
        p50,
        p95,
        worst,
        mark,
        note,
      })),
      bands,
      selection,
      passed,
    }),
  );
}

function addRow(body: HTMLElement, className: string, values: string[]): void {
  const tr = document.createElement('tr');
  if (className) tr.className = className;
  for (const value of values) {
    const td = document.createElement('td');
    td.textContent = value;
    tr.appendChild(td);
  }
  body.appendChild(tr);
}
