/**
 * The canvas benchmark: draws a synthetic view of 10,000 elements and measures it while the camera
 * pans and zooms by itself, shapes are selected one at a time and all at once, and the view is edited
 * and restacked. `pnpm bench` builds this page for production and serves it on 127.0.0.1:47707, at
 * `/bench.html`; the official numbers come from that build, in work mode. `?elements=N` changes the
 * size, `?overlap=stairs`, `grid` or `cascade` makes shapes overlap (see `synthetic.ts`), and
 * `?theme=dark` runs it in the dark theme. It also switches the theme back and forth at three scales,
 * pans and zooms after a switch, selects everything in the dark theme, and recolors every Service.
 * `?tables` draws a view of tables instead (`syntheticTables`), and adds the edit of one column.
 *
 * Work mode, the default, measures the work of each frame: it moves the camera, draws the frame and
 * waits until the GPU has drawn it, so the result does not depend on how often the browser offers
 * frames, which it slows down for windows it thinks nobody sees. A phase passes when its frames take
 * 10 ms on average, 13 ms at the 95th percentile and never more than two frames at 60 fps.
 * `?mode=frames` measures the time between frames as the browser shows them instead, which needs the
 * window in front, on a 60 Hz display; its frames may run a little late on average and at the 95th
 * percentile, but never more than two frames either.
 */
import {
  applyOperations,
  executeCommand,
  type Command,
  type ProjectSnapshot,
  type ThemeName,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { EMPTY_SELECTION, selectionOf, type Selectable, type Selection } from '../editor/selection';
import { panBy, screenToWorld, zoomAt, type Camera } from '../canvas/camera';
import { CanvasController } from '../canvas/controller';
import { centerOf } from '../canvas/geometry';
import { hitAt, indexScene, type IndexedScene } from '../canvas/hit';
import { COARSE_BELOW, DETAILS_FROM, NAMES_FROM } from '../canvas/renderer';
import { buildScene, type ElementShape } from '../canvas/scene';
import { MAX_BANDS, plannedTiles } from '../canvas/tiles';
import '../theme/tokens.css';
import { THEMES } from '../theme/themes';
import { RESTYLING, SHOWN, TARGET_FPS, WORK, addRow, percentile, showVerdict } from './report';
import {
  LARGE_TABLE,
  LARGE_TABLE_COLUMNS,
  OVERLAPS,
  seeded,
  syntheticProject,
  type Overlap,
} from './synthetic';

interface Phase {
  name: string;
  frames: number[];
  /** Judged as theme switches and recolors are, by `RESTYLING`, rather than by the frame budget. */
  restyling?: boolean;
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

/** How long a restack may take, from the command to the frame drawn, at the 95th percentile. */
const RESTACK_MARK = 100;
/** How long one edit, an edit of one column on screen, and a whole layout may take, from the
 * operations to the frame drawn, at the 95th percentile (components.md §3.9). */
const EDIT_MARK = 50;
const COLUMN_MARK = 100;
const LAYOUT_MARK = 150;
/** How many times each phase of switches switches the theme. */
const SWITCHES = 6;
/** How many times the recolor phase gives every Service other colors. */
const RECOLORS = 4;

const search = new URLSearchParams(location.search);
const size = Number(search.get('elements') ?? 10_000);
const mode: 'work' | 'frames' = search.get('mode') === 'frames' ? 'frames' : 'work';
const overlap: Overlap = OVERLAPS.find((each) => each === search.get('overlap')) ?? 'none';
const startTheme: ThemeName = search.get('theme') === 'dark' ? 'dark' : 'light';
// The page's panel follows the canvas's theme, as the app's do.
document.documentElement.setAttribute('data-theme', startTheme);
const host = document.getElementById('canvas') as HTMLElement;
const status = document.getElementById('status') as HTMLElement;

const started = performance.now();
// `?tables` measures a view of tables instead (ADR 0023): see `syntheticTables`.
const tables = search.has('tables');
let project: ProjectSnapshot = syntheticProject({ elements: size, overlap, tables });
const VIEW = project.views[0]?.id ?? 'everything';
// What the recolor phase recolors: every Service, or in a view of tables every Column.
const RECOLORED = tables ? 'Column' : 'Service';
let indexed: IndexedScene = indexScene(buildScene(project, VIEW));
const prepared = performance.now() - started;
const { scene } = indexed;
// Before any edit moves a shape over another.
const bands = bandReport();

const controller = new CanvasController(
  host,
  {
    select: () => undefined,
    command: () => Promise.resolve(false),
    relate: () => undefined,
    remove: () => undefined,
    rename: () => undefined,
    camera: () => undefined,
    failure: (error) => {
      status.textContent = `The canvas failed: ${error instanceof Error ? error.message : String(error)}`;
    },
    themeShown: (theme) => document.documentElement.setAttribute('data-theme', theme),
  },
  { theme: THEMES[startTheme].canvas },
);
controller.update(project, VIEW, indexed, false);
// For looking into the benchmark from the browser's console.
Object.assign(window, { benchmark: { controller, project, scene, indexed, THEMES } });

void run();

async function run(): Promise<void> {
  // Long enough for the garbage of building the scene to be collected before anything is measured,
  // and never before the canvas has started: until then a frame draws nothing and takes no time.
  await settle(2500);
  while (!controller.renderer.canvas) await settle(100);
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
  // Every frame counts until all the marks are drawn, a few chunks a frame.
  phases.push(
    await measure('Select everything', 20, () => controller.setSelection(everything()), {
      before: () => controller.setSelection(EMPTY_SELECTION),
      more: () => controller.renderer.drawingMarks,
    }),
  );
  controller.setSelection(everything());
  // All marks drawn before the zoom, even where the browser offers no frames meanwhile.
  while (controller.renderer.drawingMarks) controller.renderer.renderNow();
  await settle(300);
  phases.push(
    await measure('Zoom, everything selected', 180, (frame) =>
      move(zoomAt(controller.camera, middle, frame < 90 ? 1.02 : 1 / 1.02)),
    ),
  );
  controller.setSelection(EMPTY_SELECTION);

  // Theme switches (ADR-0033): each draws the tiles on screen again within the frame's clock, and
  // then shows them, with the page, in one frame.
  const themeNotes: string[] = [];
  const switchPhase = async (name: string, place: () => void) => {
    place();
    await settle(1000);
    const counts = restyleCounts();
    phases.push({
      ...(await measure(name, SWITCHES, switchTheme, {
        more: () => controller.renderer.switching,
      })),
      restyling: true,
    });
    themeNotes.push(`${name}: ${restyleNote(counts)}`);
  };
  await switchPhase('Switch theme, whole view', () => controller.fit());
  await switchPhase('Switch theme, shapes in full', () => move(cameraAt(COARSE_BELOW * 1.04)));
  await switchPhase('Switch theme, names shown', () => move(cameraAt(NAMES_FROM * 1.3)));

  // Right after a switch, what comes on screen is drawn again before it shows.
  move(cameraAt(NAMES_FROM * 1.3));
  await settle(1000);
  let counts = restyleCounts();
  switchAndShow();
  phases.push(
    await measure('Pan after a switch, names shown', 180, (frame) =>
      move(panBy(controller.camera, frame < 90 ? -8 : 8, frame < 90 ? -4 : 4)),
    ),
  );
  themeNotes.push(`Pan after a switch: ${restyleNote(counts)}`);
  controller.fit();
  await settle(300);
  counts = restyleCounts();
  switchAndShow();
  await settle(1000);
  const zoomSteps = Math.ceil(
    Math.log((NAMES_FROM * 1.3) / controller.camera.scale) / Math.log(1.02),
  );
  phases.push(
    await measure('Zoom in after a switch, to names shown', zoomSteps, () =>
      move(zoomAt(controller.camera, middle, 1.02)),
    ),
  );
  themeNotes.push(`Zoom in after a switch: ${restyleNote(counts)}`);

  // Selecting everything in the dark theme.
  if (controller.renderer.theme !== 'dark') switchAndShow();
  controller.fit();
  await settle(1000);
  phases.push(
    await measure(
      'Select everything, dark theme',
      20,
      () => controller.setSelection(everything()),
      {
        before: () => controller.setSelection(EMPTY_SELECTION),
        more: () => controller.renderer.drawingMarks,
      },
    ),
  );
  controller.setSelection(everything());
  while (controller.renderer.drawingMarks) controller.renderer.renderNow();
  await settle(300);
  phases.push(
    await measure('Zoom, everything selected, dark theme', 180, (frame) =>
      move(zoomAt(controller.camera, middle, frame < 90 ? 1.02 : 1 / 1.02)),
    ),
  );
  controller.setSelection(EMPTY_SELECTION);
  if (controller.renderer.theme !== startTheme) switchAndShow();

  // Recoloring every Service restyles its tiles in place, and shows them in one frame (A2).
  move(cameraAt(COARSE_BELOW * 1.04));
  await settle(1000);
  const recolor = await measureRecolors(RECOLORS);
  phases.push(recolor.phase);
  themeNotes.push(recolor.note);

  // Edits, near the middle of the screen, where they are drawn in full and named.
  move(cameraAt(NAMES_FROM * 1.3));
  await settle(300);
  const timed: Timed[] = [await measureEdits(10)];
  if (tables) timed.push(await measureColumnEdits(10));
  timed.push(await measureLayouts(4));
  if (!tables && (overlap === 'none' || overlap === 'stairs'))
    timed.push(await measureRestacks(20));

  report(phases, timed, latency, themeNotes);
}

/** Switches to the other theme. */
function switchTheme(): void {
  controller.renderer.setTheme(
    THEMES[controller.renderer.theme === 'dark' ? 'light' : 'dark'].canvas,
  );
}

/** Switches to the other theme, and draws frames until it shows, without measuring them. */
function switchAndShow(): void {
  switchTheme();
  while (controller.renderer.switching) controller.renderer.renderNow();
}

/** What the renderer counted of restyles so far. */
function restyleCounts(): { swaps: number; fallbacks: number; staleShown: number } {
  const { stats } = controller.renderer;
  return {
    swaps: stats.swapAfter.length,
    fallbacks: stats.fallbacks,
    staleShown: stats.staleShown,
  };
}

/** What restyles did since `from`: after how many frames each showed, and what showed stale. */
function restyleNote(from: ReturnType<typeof restyleCounts>): string {
  const { stats } = controller.renderer;
  const swaps = stats.swapAfter.slice(from.swaps);
  return `shown after ${swaps.join(', ') || 'no'} frames; ${stats.fallbacks - from.fallbacks} fallbacks and ${stats.staleShown - from.staleShown} stale tiles shown`;
}

/**
 * Gives every Service other colors with a project appearance, as the inspector does, and measures the
 * frame that applies it (the scene's build and index apart), the frames until it shows and 30 after.
 */
async function measureRecolors(count: number): Promise<{ phase: Phase; note: string }> {
  performance.mark(`phase Recolor every ${RECOLORED}`);
  const { renderer } = controller;
  const counts = restyleCounts();
  const frames: number[] = [];
  const parts = { build: 0, index: 0, apply: 0, until: [] as number[] };
  const timedFrame = () => {
    const began = performance.now();
    renderer.renderNow(true);
    frames.push(performance.now() - began);
  };
  for (let each = 0; each < count; each++) {
    const outcome = executeCommand(project, {
      type: 'set-component-appearance',
      component: tables ? 'data-modeling.column' : 'systems.service',
      appearance: each % 2 === 0 ? { fill: '#E7F5FF', stroke: '#0B7285' } : null,
    });
    if (!outcome.ok) throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
    const began = performance.now();
    const nextScene = buildScene(outcome.state, VIEW);
    const built = performance.now();
    indexed = indexScene(nextScene);
    const indexedAt = performance.now();
    controller.update(outcome.state, VIEW, indexed, false);
    renderer.renderNow(true);
    const applied = performance.now();
    project = outcome.state;
    parts.build += built - began;
    parts.index += indexedAt - built;
    parts.apply += applied - indexedAt;
    let until = 1;
    while (renderer.switching) {
      timedFrame();
      until += 1;
    }
    parts.until.push(until);
    for (let later = 0; later < 30; later++) timedFrame();
    await settle(300);
  }
  const average = (total: number) => (total / Math.max(1, count)).toFixed(0);
  return {
    phase: { name: `Recolor every ${RECOLORED}, frames after it`, frames, restyling: true },
    note: `Recolor every ${RECOLORED}: scene ${average(parts.build)} ms and index ${average(parts.index)} ms on average, then the applying frame ${average(parts.apply)} ms; ${restyleNote(counts)}`,
  };
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

interface Steps {
  /** Runs before each step, with a frame of its own that is not recorded. */
  before?: () => void;
  /** After each step, frames go on being drawn and recorded while this says there is more to draw. */
  more?: () => boolean;
}

/**
 * Takes `count` steps, one a frame, and records what each frame took, and each frame after a step
 * while `more` says it still draws what the step started.
 */
function measure(
  name: string,
  count: number,
  step: (frame: number) => void,
  { before, more }: Steps = {},
): Promise<Phase> {
  const { renderer } = controller;
  // Where each phase starts, for the browser's performance tools.
  performance.mark(`phase ${name}`);
  if (mode === 'work') {
    const frames: number[] = [];
    const timed = (work: () => void) => {
      const began = performance.now();
      work();
      renderer.renderNow(true);
      frames.push(performance.now() - began);
    };
    for (let frame = 0; frame < count; frame++) {
      if (before) {
        before();
        renderer.renderNow(true);
      }
      timed(() => step(frame));
      while (more?.()) timed(() => undefined);
    }
    return Promise.resolve({ name, frames });
  }
  return new Promise((resolve) => {
    const frames: number[] = [];
    let previous: number | undefined;
    let steps = 0;
    let readied = false;
    const tick = (now: number) => {
      if (previous !== undefined) frames.push(now - previous);
      previous = now;
      // The renderer draws what is left in its own frames, which are the ones measured meanwhile.
      if (more?.()) {
        requestAnimationFrame(tick);
        return;
      }
      if (steps >= count) {
        resolve({ name, frames });
        return;
      }
      if (before && !readied) {
        before();
        readied = true;
      } else {
        step(steps);
        steps += 1;
        readied = false;
      }
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
  performance.mark('phase One edit');
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
    mark: EDIT_MARK,
    note: `scene ${average(parts.build)} ms, index ${average(parts.index)} ms, tiles and frame ${average(parts.draw)} ms on average`,
  };
}

/**
 * Edits the type of a column of the large table on screen, close enough for its rows to show their
 * texts, one edit after another, and times each from the scene's build until the tile of its row is
 * drawn again with every text it shows (ADR 0023).
 */
async function measureColumnEdits(count: number): Promise<Timed> {
  const { renderer } = controller;
  const large = indexed.byElement.get(LARGE_TABLE)?.[0];
  const rows = large ? (indexed.contentsOf.get(large.key) ?? []) : [];
  const row = rows[Math.floor(rows.length / 2)];
  if (!large || !row)
    return { name: 'Edit one column of a large table', times: [], mark: COLUMN_MARK };
  const { width, height } = renderer.viewport;
  const scale = 1;
  move({
    scale,
    x: width / 2 - (row.rect.x + row.rect.width / 2) * scale,
    y: height / 2 - (row.rect.y + row.rect.height / 2) * scale,
  });
  // Until what shows is drawn and named, as someone who stops to look would see it.
  for (let frame = 0; frame < 600 && !renderer.shownInFull(row.key); frame++) {
    renderer.renderNow(true);
  }
  await settle(300);
  performance.mark('phase Edit one column');
  const times: number[] = [];
  let frames = 0;
  for (let each = 0; each < count; each++) {
    const outcome = executeCommand(project, {
      type: 'update-element',
      id: row.element,
      changes: { attributes: { type: `varchar(${16 + each})` } },
    });
    if (!outcome.ok) throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
    const began = performance.now();
    showProject(outcome.state);
    let more = 0;
    while (!renderer.shownInFull(row.key) && more < 60) {
      renderer.renderNow(true);
      more += 1;
    }
    times.push(performance.now() - began);
    frames += 1 + more;
    await settle(50);
  }
  return {
    name: 'Edit one column of a large table',
    times,
    mark: COLUMN_MARK,
    note: `${LARGE_TABLE_COLUMNS} columns, ${(frames / Math.max(1, count)).toFixed(1)} frames on average until its row's tile shows every text`,
  };
}

/**
 * Applies a layout that moves every shape with a position of its own one step, as a layout result
 * comes back, and times each from the scene's build to the frame drawn with it.
 */
async function measureLayouts(count: number): Promise<Timed> {
  performance.mark('phase Apply a layout');
  const times: number[] = [];
  const parts = { build: 0, index: 0, draw: 0 };
  let moved = 0;
  for (let each = 0; each < count; each++) {
    const step = each % 2 === 0 ? 8 : -8;
    const seen = new Set<string>();
    const positions = indexed.scene.shapes.flatMap((shape) => {
      // Rows have no position of their own; copies of a container share their contents'.
      if (shape.row !== undefined) return [];
      const key = `${shape.element}\u0000${shape.container ?? ''}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [
        {
          element: shape.element,
          ...(shape.container === undefined ? {} : { container: shape.container }),
          x: shape.offset.x + step,
          y: shape.offset.y,
          ...shape.storedSize,
        },
      ];
    });
    moved = positions.length;
    const outcome = executeCommand(project, { type: 'set-positions', view: VIEW, positions });
    if (!outcome.ok) throw new Error(outcome.problems.map((problem) => problem.message).join(' '));
    const taken = showProject(outcome.state);
    parts.build += taken.build;
    parts.index += taken.index;
    parts.draw += taken.draw;
    times.push(taken.build + taken.index + taken.draw);
    await settle(100);
  }
  const average = (total: number) => (total / Math.max(1, times.length)).toFixed(0);
  return {
    name: 'Apply a layout: every shape moves',
    times,
    mark: LAYOUT_MARK,
    note: `${moved.toLocaleString()} positions; scene ${average(parts.build)} ms, index ${average(parts.index)} ms, tiles and frame ${average(parts.draw)} ms on average`,
  };
}

/**
 * Sends random systems directly in World to the back and brings others to the front, one after
 * another, and times each from the command to the frame drawn with it.
 */
async function measureRestacks(count: number): Promise<Timed> {
  performance.mark('phase Restack');
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
    // A row has no position to move: in a view of tables, a table is moved.
    const movable = shapes.filter((shape) => shape.row === undefined);
    const found = movable.find((shape) => !shape.holdsContents) ?? movable[0];
    if (found) return found;
  }
  return undefined;
}

function settle(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
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

function report(phases: Phase[], timed: Timed[], latency: number[], themeNotes: string[]): void {
  const rows: Row[] = phases.map(({ name, frames, restyling }) => {
    const average = frames.reduce((sum, each) => sum + each, 0) / Math.max(1, frames.length);
    const p95 = percentile(frames, 0.95);
    const worst = Math.max(...frames);
    // Frames as shown may run a little late, but none takes more than two frames, as in work mode.
    const passes = restyling
      ? p95 <= RESTYLING.p95 && worst <= RESTYLING.worst
      : mode === 'work'
        ? average <= WORK.average && p95 <= WORK.p95 && worst <= WORK.worst
        : average <= SHOWN.average && p95 <= SHOWN.p95 && worst <= WORK.worst;
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
    ...themeNotes.map((note) => `${note}.`),
  ].join('\n');

  const selection = { p50: percentile(latency, 0.5), p95: percentile(latency, 0.95) };
  status.textContent = `${size.toLocaleString()} elements, ${scene.relations.length.toLocaleString()} relations; ${mode === 'work' ? 'work of each frame, GPU included' : 'frames as shown'}. Scene built in ${prepared.toFixed(0)} ms. Selecting takes ${selection.p50.toFixed(2)} ms (p95 ${selection.p95.toFixed(2)} ms).`;
  showVerdict(document.getElementById('verdict') as HTMLElement, passed, {
    pass: `Meets the ${TARGET_FPS} fps target in every phase.`,
    fail: `Misses the ${TARGET_FPS} fps target in at least one phase.`,
  });
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
      theme: startTheme,
      themeNotes,
      restyles: controller.renderer.stats,
      passed,
    }),
  );
}
