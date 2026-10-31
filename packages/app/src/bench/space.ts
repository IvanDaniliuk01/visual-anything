/**
 * The phases of the space benchmark (`?space`, M10's "Done when"), on the project `spaceProject.ts`
 * makes, with the physical-space panel's drawing open beside the canvas: the space of the open view
 * under World, worked out as the panel works it out (`spaceOf`, `spaceEntriesOf`, `spaceStates`) and
 * drawn by the solid worker through the client, its frames handed to a `bitmaprenderer` canvas as the
 * panel hands them. The panel's React component is not mounted: the page drives the drawing as it
 * does, so what is measured is the worker's frames and the page's own work for them.
 *
 * - **Moving the panel's camera around**, at the whole space and close in on the holder at every cap,
 *   one step a frame: in work mode, the time from each move to its frame; in frames mode, the time
 *   between the frames shown. While it moves past 2,000,000 triangles, the worker draws the farthest
 *   solids as their boxes; the notes say how many triangles a frame draws then, as `lod.ts` works it
 *   out. Judged by the frame budget.
 * - **Drawing the whole space again at rest**, every solid drawn whole, about 5.6 million triangles:
 *   the time from a change of hover to its frame, against 30 frames per second.
 * - **A selection and a change of focus made on the canvas**: the canvas's selection or emphasis set,
 *   the panel's states worked out from it as the panel works them out, and the time until the frame
 *   that shows them, against two frames.
 * - **Picking in the panel**: the time from a pick at a pixel to its answer, against 16 ms.
 * - **The canvas's phases with the panel open and at rest**: pan, zoom and select at the whole view
 *   and with names shown, judged by the 10,000-element benchmark's marks.
 * - **A step played with its 20 relations drawn in space**: their markers travel on the canvas and in
 *   the panel, the panel's frames judged by the frame budget and the canvas's too.
 */
import { modelIndexOf, spaceOf, type Space } from '@visual-anything/core';
import type { Id, SpaceCamera, ViewFile } from '@visual-anything/schema';
import { panBy, zoomAt, type Camera } from '../canvas/camera';
import { emphasize } from '../canvas/emphasize';
import { NAMES_FROM } from '../canvas/renderer';
import type { Emphasis, Marker } from '../editor/emphasis';
import { EMPTY_SELECTION, selectionOf } from '../editor/selection';
import type { SolidClient } from '../solids/solid-client';
import type {
  PixelSize,
  SpaceChange,
  SpaceDrawnEntry,
  SpaceFrameReply,
  SpaceShown,
} from '../solids/protocol';
import { SPACE_TRIANGLE_BUDGET, boxedFrom, type BoxableSolid } from '../solids/worker/space/lod';
import { boundsPlaced } from '../space/camera';
import { spaceEntriesOf } from '../space/entries';
import { spaceLinesOf } from '../space/lines';
import { shapeEmphasisOf, spaceStateList, spaceStates } from '../space/states';
import type { BenchMode } from './frames';
import { selectAt, type GestureBench } from './gestures';
import type { FramePhase, TimedAction } from './overlays';
import { seeded } from './synthetic';

/** What the phases need of the benchmark's page. */
export interface SpaceBench extends GestureBench {
  /** The camera at a scale, centred on the middle of the view. */
  cameraAt(scale: number): Camera;
  /** The client the canvas and the panel draw solids through. */
  client: SolidClient;
  view: ViewFile;
  mode: BenchMode;
  /** The panel's frames' size, in pixels. */
  size: PixelSize;
  /** The panel's canvas, which takes its frames; none in tests. */
  panel?: HTMLCanvasElement;
  /** The holders of anchored parts, the one at every cap first; the step's relations. */
  holders: readonly string[];
  step: readonly string[];
}

/** How much of each phase runs: the benchmark's, or a few steps in a test. */
export interface SpacePlan {
  frames: number;
  clicks: number;
  changes: number;
  picks: number;
  /** How long to wait between phases, and for a frame at most, in milliseconds. */
  rest: number;
  wait: number;
}

export const SPACE_PLAN: SpacePlan = {
  frames: 180,
  clicks: 60,
  changes: 30,
  picks: 200,
  rest: 400,
  wait: 10_000,
};

/** The marks, in milliseconds (ADR 0076). */
export const SPACE_MARKS = {
  /** A selection or a change of focus made on the canvas, until the panel shows it: two frames. */
  shown: 2000 / 60,
  pick: 16,
  /** A frame of up to 6,000,000 triangles: 30 frames per second. */
  atRest: 1000 / 30,
} as const;

/** How long the worker waits after the camera last moved before it draws the whole again. */
const REST_AFTER_MOVING = 250;

export interface SpaceResults {
  phases: FramePhase[];
  timed: TimedAction[];
  latency: number[];
  notes: string[];
}

/** The panel's newest frames, and a way to wait for the next. */
class PanelFrames {
  last: SpaceFrameReply | undefined;
  /** When each frame came, in milliseconds. */
  readonly arrivals: number[] = [];
  private waiting: { after: number; resolve: (frame: SpaceFrameReply | undefined) => void }[] = [];

  constructor(private readonly canvas: HTMLCanvasElement | undefined) {}

  take(frame: SpaceFrameReply): void {
    this.arrivals.push(performance.now());
    this.last = frame;
    const context = this.canvas?.getContext('bitmaprenderer');
    if (context && this.canvas) {
      if (this.canvas.width !== frame.width) this.canvas.width = frame.width;
      if (this.canvas.height !== frame.height) this.canvas.height = frame.height;
      context.transferFromImageBitmap(frame.bitmap);
    }
    const ready = this.waiting.filter((each) => frame.serial > each.after);
    this.waiting = this.waiting.filter((each) => frame.serial <= each.after);
    for (const each of ready) each.resolve(frame);
  }

  get serial(): number {
    return this.last?.serial ?? 0;
  }

  /** The first frame after the serial given, or none within `wait` milliseconds. */
  next(after: number, wait: number): Promise<SpaceFrameReply | undefined> {
    if (this.serial > after) return Promise.resolve(this.last);
    return new Promise((resolve) => {
      const entry = { after, resolve };
      this.waiting.push(entry);
      setTimeout(() => {
        if (!this.waiting.includes(entry)) return;
        this.waiting = this.waiting.filter((each) => each !== entry);
        resolve(undefined);
      }, wait);
    });
  }
}

/** Runs every phase, and puts the canvas's camera, selection and emphasis back after. */
export async function measureSpace(
  bench: SpaceBench,
  plan: SpacePlan = SPACE_PLAN,
): Promise<SpaceResults> {
  const { controller } = bench;
  const { renderer } = controller;
  const phases: FramePhase[] = [];
  const timed: TimedAction[] = [];
  const latency: number[] = [];
  const notes: string[] = [];
  const random = seeded(29);
  const project = bench.project();
  const space = spaceOf(project, bench.view);
  const index = modelIndexOf(project);
  const entries = spaceEntriesOf(space, (element) => index.element(element)?.name ?? element);
  const scene = () => bench.indexed().scene;
  let emphasis: Emphasis = {};
  let selected: ReadonlySet<Id> = new Set();
  let hovered: Id | undefined;
  const states = () =>
    spaceStateList(
      spaceStates({
        space,
        shapes: scene().shapes,
        emphasis: shapeEmphasisOf(emphasize(scene(), emphasis)),
        selected,
        hovered,
        containersOf: (element) => index.containersOf(element),
        world: index.world.id,
      }),
    );

  // The panel's drawing, open beside the canvas.
  const frames = new PanelFrames(bench.panel);
  let problem: string | undefined;
  const shown: SpaceShown = { size: bench.size, entries, states: states(), theme: renderer.theme };
  const drawing = bench.client.showSpace(shown, {
    onFrame: (frame) => frames.take(frame),
    onProblem: (found) => {
      problem = `${found.code}: ${found.message}`;
    },
  });
  try {
    const first = await frames.next(0, plan.wait * 3);
    if (!first) {
      notes.push(
        `The panel drew no frame within ${(plan.wait * 3).toLocaleString()} ms${problem ? ` (${problem})` : ''}; its phases were left out`,
      );
      return { phases, timed, latency, notes };
    }
    // Every solid loaded and drawn whole, before anything is measured.
    await settleFrames(frames, plan.rest * 2);
    notes.push(
      `The space: ${space.entries.size.toLocaleString()} entries, ${countPosed(space).toLocaleString()} posed solids and ${countAnchored(space).toLocaleString()} anchored parts, about ${(trianglesOf(entries, bench) / 1e6).toFixed(2)} million triangles at rest`,
    );

    // A step of a phase of the panel's frames: in work mode, from each change to its frame; in
    // frames mode, between the frames shown while one change goes each frame.
    const panelPhase = async (
      name: string,
      count: number,
      step: (frame: number) => SpaceChange,
    ): Promise<FramePhase> => {
      performance.mark(`phase ${name}`);
      const times: number[] = [];
      let missed = 0;
      if (bench.mode === 'work') {
        for (let frame = 0; frame < count; frame++) {
          const after = frames.serial;
          const began = performance.now();
          drawing.update(step(frame));
          const got = await frames.next(after, plan.wait);
          if (got) times.push(performance.now() - began);
          else missed += 1;
        }
      } else {
        const from = frames.arrivals.length;
        await new Promise<void>((resolve) => {
          let steps = 0;
          const tick = () => {
            if (steps >= count) {
              resolve();
              return;
            }
            drawing.update(step(steps));
            steps += 1;
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        await frames.next(frames.serial, plan.wait);
        const arrived = frames.arrivals.slice(from);
        for (let at = 1; at < arrived.length; at++) {
          times.push((arrived[at] as number) - (arrived[at - 1] as number));
        }
        missed = Math.max(0, count - arrived.length);
      }
      if (missed > 0)
        notes.push(`${name}: ${missed} of ${count} changes drew no frame of their own`);
      return { name, frames: times };
    };

    // Moving the panel's camera around, at the whole space and close in.
    const whole = (await drawing.fit()) ?? first.camera;
    const turning = (from: SpaceCamera) => (frame: number) => ({
      camera: { ...from, azimuth: wrapDegrees(from.azimuth + 1.5 * (frame + 1)) },
    });
    drawing.update({ camera: whole });
    await settleFrames(frames, REST_AFTER_MOVING + plan.rest);
    phases.push(
      await panelPhase('Panel: turn the camera, whole space', plan.frames, turning(whole)),
    );
    notes.push(
      `Panel, whole space: about ${(trianglesWhileMoving(entries, bench, whole) / 1e6).toFixed(2)} million triangles a frame while the camera moves, the farthest solids drawn as their boxes past ${(SPACE_TRIANGLE_BUDGET / 1e6).toFixed(0)} million`,
    );
    const zoomed = await drawing.fit([bench.holders[0] as Id]);
    const close = zoomed ? { ...zoomed, distance: zoomed.distance * 0.6 } : whole;
    drawing.update({ camera: close });
    await settleFrames(frames, REST_AFTER_MOVING + plan.rest);
    phases.push(await panelPhase('Panel: turn the camera, close in', plan.frames, turning(close)));
    notes.push(
      `Panel, close in on the holder at every cap: about ${(trianglesWhileMoving(entries, bench, close) / 1e6).toFixed(2)} million triangles a frame while the camera moves`,
    );
    phases.push(
      await panelPhase('Panel: zoom in and out, close in', plan.frames, (frame) => ({
        camera: {
          ...close,
          distance: close.distance * (frame < plan.frames / 2 ? 0.99 : 1 / 0.99) ** (frame + 1),
        },
      })),
    );

    // The whole space drawn again at rest, every solid whole.
    drawing.update({ camera: whole });
    await settleFrames(frames, REST_AFTER_MOVING + plan.rest);
    const posed = [...space.entries.values()]
      .filter((entry) => entry.how === 'posed' && entry.solid)
      .map((entry) => entry.element);
    const atRest: number[] = [];
    for (let change = 0; change < plan.changes; change++) {
      hovered = posed[Math.floor(random() * posed.length)];
      const after = frames.serial;
      const began = performance.now();
      drawing.update({ states: states() });
      if (await frames.next(after, plan.wait)) atRest.push(performance.now() - began);
      await settleFrames(frames, 30);
    }
    hovered = undefined;
    timed.push({
      name: 'Panel: the whole space drawn again at rest',
      times: atRest,
      mark: SPACE_MARKS.atRest,
      note: `about ${(trianglesOf(entries, bench) / 1e6).toFixed(2)} million triangles, from a change of hover to its frame`,
    });

    // A selection and a change of focus made on the canvas, until the panel shows them.
    const shownTimes = async (name: string, make: (element: Id) => void): Promise<void> => {
      const times: number[] = [];
      const work: number[] = [];
      for (let change = 0; change < plan.changes; change++) {
        const element = posed[Math.floor(random() * posed.length)] as Id;
        const after = frames.serial;
        const began = performance.now();
        make(element);
        drawing.update({ states: states() });
        work.push(performance.now() - began);
        if (await frames.next(after, plan.wait)) times.push(performance.now() - began);
        await settleFrames(frames, 30);
      }
      timed.push({
        name,
        times,
        mark: SPACE_MARKS.shown,
        note: `the page's own work, the panel's states included, ${median(work).toFixed(1)} ms at the median`,
      });
    };
    await shownTimes('A selection on the canvas, until the panel shows it', (element) => {
      selected = new Set([element]);
      controller.setSelection(selectionOf([{ kind: 'element', id: element }]));
    });
    selected = new Set();
    controller.setSelection(EMPTY_SELECTION);
    const everyKey = scene().shapes.map((shape) => shape.key);
    await shownTimes('A change of focus on the canvas, until the panel shows it', (element) => {
      const keep = new Set(
        scene()
          .shapes.filter((shape) => shape.element === element)
          .map((shape) => shape.key),
      );
      emphasis = { dimmed: new Set(everyKey.filter((key) => !keep.has(key))) };
      controller.setEmphasis(emphasis);
    });
    emphasis = {};
    controller.setEmphasis(emphasis);
    drawing.update({ states: states() });
    await settleFrames(frames, plan.rest);

    // Picking in the panel.
    const picks: number[] = [];
    const found = { elements: 0, nothing: 0 };
    for (let each = 0; each < plan.picks; each++) {
      const x = Math.floor(random() * bench.size.width);
      const y = Math.floor(random() * bench.size.height);
      const began = performance.now();
      const picked = await drawing.pick(x, y);
      if (picked) {
        picks.push(performance.now() - began);
        if (picked.element) found.elements += 1;
        else found.nothing += 1;
      }
    }
    timed.push({
      name: 'A pick in the panel, answered',
      times: picks,
      mark: SPACE_MARKS.pick,
      note: `${found.elements.toLocaleString()} found an element, ${found.nothing.toLocaleString()} nothing`,
    });

    // The canvas's phases with the panel open and at rest.
    await settleFrames(frames, plan.rest);
    const restingFrom = frames.serial;
    const { width, height } = renderer.viewport;
    const middle = { x: width / 2, y: height / 2 };
    const halfway = (frame: number) => frame < plan.frames / 2;
    const pan = (frame: number) =>
      bench.move(panBy(controller.camera, halfway(frame) ? -8 : 8, halfway(frame) ? -4 : 4));
    const zoom = (frame: number) =>
      bench.move(zoomAt(controller.camera, middle, halfway(frame) ? 1.02 : 1 / 1.02));
    const select = (name: string) =>
      bench.measure(name, plan.clicks, () => {
        latency.push(
          selectAt(controller, bench.indexed(), { x: random() * width, y: random() * height }),
        );
      });
    controller.fitWhole();
    await bench.settle(plan.rest);
    phases.push(await bench.measure('Canvas, panel at rest: pan, whole view', plan.frames, pan));
    phases.push(await bench.measure('Canvas, panel at rest: zoom, whole view', plan.frames, zoom));
    phases.push(await select('Canvas, panel at rest: select by clicking, whole view'));
    bench.move(bench.cameraAt(NAMES_FROM * 1.3));
    await bench.settle(plan.rest);
    phases.push(await bench.measure('Canvas, panel at rest: pan, names shown', plan.frames, pan));
    phases.push(await bench.measure('Canvas, panel at rest: zoom, names shown', plan.frames, zoom));
    phases.push(await select('Canvas, panel at rest: select by clicking, names shown'));
    controller.setSelection(EMPTY_SELECTION);
    // The panel was left at rest: the canvas's selection is not sent to it meanwhile.
    notes.push(
      `The panel drew ${(frames.serial - restingFrom).toLocaleString()} frames while the canvas's phases ran`,
    );

    // A step played with its relations drawn in space.
    // A relation's line is keyed by its id, as the canvas's emphasis names it.
    const relationKeys = new Set(bench.step);
    const endKeys = new Set(
      scene()
        .shapes.filter((shape) =>
          bench.step.some((id) => {
            const relation = index.relation(id);
            return relation?.from === shape.element || relation?.to === shape.element;
          }),
        )
        .map((shape) => shape.key),
    );
    const highlighted = new Set([...relationKeys, ...endKeys]);
    /** The step's markers a second along, from 0 to 1, set on the canvas. */
    const playAt = (frame: number) => {
      const progress = ((frame % 60) + 1) / 60;
      const markers: Marker[] = bench.step.map((relation) => ({ relation, progress }));
      emphasis = { highlighted, markers };
      controller.setEmphasis(emphasis);
      return markers;
    };
    controller.fitWhole();
    drawing.update({ camera: whole });
    playAt(0);
    drawing.update({
      states: states(),
      lines: spaceLinesOf(project, space, emphasis.markers ?? []),
    });
    await settleFrames(frames, REST_AFTER_MOVING + plan.rest);
    const lines = spaceLinesOf(project, space, emphasis.markers ?? []);
    phases.push(
      await panelPhase('Panel: play a step, its relations drawn in space', plan.frames, (frame) => {
        const markers = playAt(frame + 1);
        if (bench.mode === 'work') renderer.renderNow(true);
        return { lines: spaceLinesOf(project, space, markers) };
      }),
    );
    phases.push(
      await bench.measure(
        'Canvas: play a step, its relations drawn in space',
        plan.frames,
        (frame) => {
          const markers = playAt(frame + 1);
          drawing.update({ lines: spaceLinesOf(project, space, markers) });
        },
      ),
    );
    notes.push(`The step: ${bench.step.length} relations, ${lines.length} of them drawn in space`);
    emphasis = {};
    controller.setEmphasis(emphasis);
    return { phases, timed, latency, notes };
  } finally {
    drawing.end();
    controller.setSelection(EMPTY_SELECTION);
    controller.setEmphasis({});
  }
}

/** Waits until the panel has drawn no frame for `quiet` milliseconds, or 10 s. */
async function settleFrames(frames: PanelFrames, quiet: number): Promise<void> {
  const began = performance.now();
  let seen = frames.arrivals.length;
  let since = performance.now();
  while (performance.now() - began < 10_000) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(50, quiet)));
    if (frames.arrivals.length !== seen) {
      seen = frames.arrivals.length;
      since = performance.now();
    } else if (performance.now() - since >= quiet) return;
  }
}

function countPosed(space: Space): number {
  return [...space.entries.values()].filter((entry) => entry.how === 'posed' && entry.solid).length;
}

function countAnchored(space: Space): number {
  return [...space.entries.values()].filter((entry) => entry.how === 'anchored').length;
}

/** Each entry's solid as `lod.ts` weighs it: its triangles, from the definitions, and its bounds. */
function solidsOf(entries: readonly SpaceDrawnEntry[], bench: SpaceBench): BoxableSolid[] {
  const byHash = new Map<string, number>();
  for (const pack of bench.project().packages) {
    for (const solid of pack.solids ?? []) byHash.set(solid.hash, solid.counts.triangles);
  }
  const solids: BoxableSolid[] = [];
  for (const entry of entries) {
    if (entry.solid === undefined || !entry.bounds) continue;
    solids.push({
      element: entry.element,
      triangles: byHash.get(entry.solid) ?? 0,
      bounds: boundsPlaced(entry.matrix, entry.bounds),
    });
  }
  return solids;
}

/** Triangles every solid of the space draws together, at rest. */
function trianglesOf(entries: readonly SpaceDrawnEntry[], bench: SpaceBench): number {
  return solidsOf(entries, bench).reduce((sum, solid) => sum + solid.triangles, 0);
}

/** Triangles a frame draws while the camera moves, the farthest solids as boxes past the mark. */
function trianglesWhileMoving(
  entries: readonly SpaceDrawnEntry[],
  bench: SpaceBench,
  camera: SpaceCamera,
): number {
  const solids = solidsOf(entries, bench);
  const boxed = boxedFrom(solids, camera);
  return solids.reduce((sum, solid) => sum + (boxed.has(solid.element) ? 12 : solid.triangles), 0);
}

function wrapDegrees(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
