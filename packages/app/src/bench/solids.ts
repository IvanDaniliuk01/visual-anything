/**
 * The phases of the solids benchmark (`?solids`, M9's "Done when"), on the project `solidsProject.ts`
 * makes, with the canonical files it makes itself, each reported as the canvas benchmark's phases are:
 * - a cold run: the solids' files are held back until it starts, so that no picture is made yet; it
 *   pans with names shown while the pictures arrive, judged by the frame budget, and times how long
 *   after the files reach the app every solid on screen has its picture, against 2 s;
 * - pan, zoom and select by clicking, at the whole view and with names shown;
 * - pointing over the parts of the drawing in the middle, the one at the cap on named parts: the time
 *   to find what is under the pointer through its part buffer, each point apart, against 1 ms at the
 *   95th percentile, and the frames of a pointer moving over them;
 * - a change of focus on its parts, each step drawing all but one part faintly in turn, judged by the
 *   frame budget; and a filter that hides ten of its parts, timed until the solid is drawn again
 *   without them, against 150 ms;
 * - turning the solid of 200,000 triangles, and the drawing at every cap, by the keys, one step a
 *   frame: the canvas's frames judged by the frame budget, and the time between the turning's own
 *   frames, against 60 frames per second for the first and 30 for the one at the caps;
 * - pans and a zoom that start with the image store cleared;
 * - theme switches at the whole view and with names shown, by A1's rule.
 * Pointing, the focus and the filter run with the camera on the middle drawing, its picture about
 * 400 pixels across.
 */
import { EMPTY_SELECTION } from '../editor/selection';
import { panBy, visibleRect, worldToScreen, zoomAt, type Camera } from '../canvas/camera';
import { HIT_TOLERANCE } from '../canvas/controller';
import type { Point, Rect } from '../canvas/geometry';
import { hitAt, type IndexedScene } from '../canvas/hit';
import { NAMES_FROM } from '../canvas/renderer';
import type { ElementShape } from '../canvas/scene';
import { solidPictureKey, withHiddenParts } from '../canvas/shape-solids';
import { isSolidAnchor } from '../canvas/solids/pointing';
import type { SolidClient } from '../solids/client';
import type { SolidFrameReply } from '../solids/protocol';
import { THEMES } from '../theme/themes';
import { pointer, selectAt, type GestureBench } from './gestures';
import type { FramePhase, TimedAction } from './overlays';
import { BENCH_SOLIDS } from './solidFiles';
import { benchSolidId } from './solidsProject';
import { seeded } from './synthetic';

/** What the phases need of the benchmark's page. */
export interface SolidsBench extends GestureBench {
  /** The camera at a scale, centred on the middle of the view. */
  cameraAt(scale: number): Camera;
  /** The client the canvas draws solids through. */
  client: SolidClient;
  /** Lets the solids' files reach the app, which until then wait. */
  releaseFiles(): void;
  /** The drawings with parts, the middle one first, and the shapes turning turns, by key. */
  drawings: readonly string[];
  turned: string;
  turnedAtCaps: string;
}

/** How much of each phase runs: the benchmark's, or a few steps in a test. */
export interface SolidsPlan {
  frames: number;
  clicks: number;
  points: number;
  hover: number;
  focus: number;
  filters: number;
  turnFrames: number;
  switches: number;
  /** How long to wait between phases, and for pictures at most, in milliseconds. */
  rest: number;
  wait: number;
}

export const SOLIDS_PLAN: SolidsPlan = {
  frames: 180,
  clicks: 60,
  points: 2_000,
  hover: 180,
  focus: 60,
  filters: 10,
  turnFrames: 240,
  switches: 6,
  rest: 300,
  wait: 10_000,
};

/** The marks, in milliseconds (ADR 0075). */
export const SOLID_MARKS = {
  /** Every picture on screen, after the files reach the app. */
  pictures: 2_000,
  pointing: 1,
  /** A filter that hides parts, until the solid is drawn again without them. */
  filter: 150,
  /** Between turning frames, at the 95th percentile: 60 and 30 frames per second. */
  turning: 1000 / 60,
  turningAtCaps: 1000 / 30,
} as const;

/** The most frames a theme switch is waited for. */
const SWITCH_FRAMES = 600;
/** How wide the middle drawing's picture is on screen for pointing, the focus and the filter. */
const CLOSE_PIXELS = 400;

export interface SolidsResults {
  phases: FramePhase[];
  timed: TimedAction[];
  latency: number[];
  notes: string[];
}

/** Runs every phase, and puts the theme, the camera and the emphasis back after. */
export async function measureSolids(
  bench: SolidsBench,
  plan: SolidsPlan = SOLIDS_PLAN,
): Promise<SolidsResults> {
  const { controller } = bench;
  const { renderer } = controller;
  const phases: FramePhase[] = [];
  const timed: TimedAction[] = [];
  const latency: number[] = [];
  const notes: string[] = [];
  const startTheme = renderer.theme;
  const { width, height } = renderer.viewport;
  const middle = { x: width / 2, y: height / 2 };
  const random = seeded(17);
  const half = (frame: number) => frame < plan.frames / 2;
  const pan = (frame: number) =>
    bench.move(panBy(controller.camera, half(frame) ? -8 : 8, half(frame) ? -4 : 4));
  const zoom = (frame: number) =>
    bench.move(zoomAt(controller.camera, middle, half(frame) ? 1.02 : 1 / 1.02));
  const select = (name: string) =>
    bench.measure(name, plan.clicks, () => {
      latency.push(
        selectAt(controller, bench.indexed(), { x: random() * width, y: random() * height }),
      );
    });
  const namesShown = () => bench.cameraAt(NAMES_FROM * 1.3);
  const shape = (key: string) => bench.indexed().byKey.get(key) as ElementShape;

  // A cold run: no picture made yet, the files reaching the app as it starts.
  bench.move(namesShown());
  await bench.settle(plan.rest);
  const released = performance.now();
  bench.releaseFiles();
  let shownAt: number | undefined;
  const allShown = () => {
    if (shownAt === undefined && everyPictureShows(bench)) shownAt = performance.now();
    return shownAt !== undefined;
  };
  phases.push(
    await bench.measure('Pan, names shown, pictures arriving', plan.frames, (frame) => {
      pan(frame);
      allShown();
    }),
  );
  bench.move(namesShown());
  for (let waited = 0; !allShown() && performance.now() - released < plan.wait; waited++) {
    renderer.renderNow(true);
    await bench.settle(16);
  }
  const onScreen = solidShapesOnScreen(bench).length;
  timed.push({
    name: 'Every picture on screen shows, after the files reach the app',
    times: shownAt === undefined ? [] : [shownAt - released],
    mark: SOLID_MARKS.pictures,
    note: `${onScreen.toLocaleString()} shapes showing a solid on screen${shownAt === undefined ? `; not all shown within ${plan.wait.toLocaleString()} ms` : ''}`,
  });

  // Pan, zoom and select, at the whole view and with names shown.
  controller.fitWhole();
  await bench.settle(plan.rest);
  phases.push(await bench.measure('Pan, whole view', plan.frames, pan));
  phases.push(await bench.measure('Zoom, whole view', plan.frames, zoom));
  phases.push(await select('Select by clicking, whole view'));
  controller.setSelection(EMPTY_SELECTION);
  bench.move(namesShown());
  await bench.settle(plan.rest);
  phases.push(await bench.measure('Pan, names shown', plan.frames, pan));
  phases.push(await bench.measure('Zoom, names shown', plan.frames, zoom));
  phases.push(await select('Select by clicking, names shown'));
  controller.setSelection(EMPTY_SELECTION);

  // Close on the middle drawing, its picture drawn, for pointing, the focus and the filter.
  const drawingKey = bench.drawings[0] as string;
  const closeOn = (key: string) => {
    const target = shape(key);
    const rect = target.solid?.rect ?? target.rect;
    const scale = CLOSE_PIXELS / Math.max(rect.width, rect.height);
    const at = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    bench.move({ scale, x: width / 2 - at.x * scale, y: height / 2 - at.y * scale });
  };
  closeOn(drawingKey);
  await waitForPicture(bench, drawingKey, solidPictureKey(shape(drawingKey)), plan.wait);
  const points = pointsOver(shape(drawingKey), plan.points);
  timed.push(timePointing(bench, points));
  phases.push(
    await bench.measure('Point over parts', plan.hover, (frame) => {
      const at = points[frame % Math.max(1, points.length)];
      if (at) pointer(bench.host, 'pointermove', worldToScreen(controller.camera, at));
    }),
  );
  pointer(bench.host, 'pointerleave', middle);

  // A change of focus on parts: all but one drawn faintly, a different one each step.
  const parts = partsOf(bench.indexed(), drawingKey);
  const everyKey = bench.indexed().scene.shapes.map((each) => each.key);
  const focusOn = (part: ElementShape | undefined) =>
    new Set(everyKey.filter((key) => key !== part?.key && key !== drawingKey));
  const focuses = [focusOn(parts[0]), focusOn(parts[Math.floor(parts.length / 2)])];
  phases.push(
    await bench.measure('Change focus on parts', plan.focus, (frame) => {
      controller.setEmphasis({ dimmed: focuses[frame % 2] });
    }),
  );
  controller.setEmphasis({});
  await bench.settle(plan.rest);

  // A filter that hides ten parts at a time, until the solid is drawn again without them.
  const filterTimes: number[] = [];
  for (let round = 0; round < plan.filters; round++) {
    const hidden = parts.slice(round * 10, round * 10 + 10);
    if (hidden.length === 0) break;
    const indexes = [...new Set(hidden.map((each) => each.part?.index as number))].sort(
      (a, b) => a - b,
    );
    const wanted = solidPictureKey(withHiddenParts(shape(drawingKey), indexes));
    const began = performance.now();
    controller.setEmphasis({ hidden: new Set(hidden.map((each) => each.key)) });
    const took = await waitForPicture(bench, drawingKey, wanted, plan.wait);
    if (took !== undefined) filterTimes.push(performance.now() - began);
    controller.setEmphasis({});
    await bench.settle(plan.rest / 3);
  }
  timed.push({
    name: 'A filter hides ten parts: the solid drawn again without them',
    times: filterTimes,
    mark: SOLID_MARKS.filter,
    note: `${filterTimes.length} of ${plan.filters} drawn again within ${plan.wait.toLocaleString()} ms`,
  });

  // Turning the solid of 200,000 triangles, then the drawing at every cap.
  const turn = async (key: string, what: string, mark: number) => {
    controller.setSelection(EMPTY_SELECTION);
    closeOn(key);
    await bench.settle(plan.rest);
    const shown: number[] = [];
    let last: number | undefined;
    const setTurning = renderer.setTurning.bind(renderer);
    renderer.setTurning = (
      turning: { key: string; frame: SolidFrameReply | undefined } | undefined,
    ) => {
      const serial = turning?.frame?.serial;
      if (serial !== undefined && serial !== last) {
        last = serial;
        shown.push(performance.now());
      }
      setTurning(turning);
    };
    try {
      if (!controller.turn(key)) {
        notes.push(`Turning ${what}: it could not be turned.`);
        return;
      }
      const keys = ['ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowLeft', 'ArrowDown'];
      phases.push(
        await bench.measure(`Turn ${what}`, plan.turnFrames, (frame) => {
          bench.host.dispatchEvent(
            new KeyboardEvent('keydown', { key: keys[frame % keys.length], bubbles: true }),
          );
        }),
      );
      controller.endTurning();
    } finally {
      renderer.setTurning = setTurning;
    }
    const between = shown.slice(1).map((at, index) => at - (shown[index] as number));
    timed.push({
      name: `Turning ${what}: between its frames`,
      times: between,
      mark,
      note: `${shown.length.toLocaleString()} frames for ${plan.turnFrames.toLocaleString()} steps`,
    });
  };
  await turn(bench.turned, 'a solid of 200,000 triangles', SOLID_MARKS.turning);
  await turn(bench.turnedAtCaps, 'a drawing at every cap', SOLID_MARKS.turningAtCaps);
  controller.setSelection(EMPTY_SELECTION);

  // Each from a cleared image store.
  const cold = async (name: string, camera: Camera, step: (frame: number) => void) => {
    bench.move(camera);
    renderer.resetImages();
    phases.push(await bench.measure(name, plan.frames, step));
  };
  await cold('Pan, names shown, images cold', namesShown(), pan);
  await cold('Zoom, images cold', namesShown(), zoom);
  await bench.settle(plan.rest);

  // Theme switches, by A1's rule.
  const switchPhase = async (name: string, place: () => void) => {
    place();
    await bench.settle(plan.rest * 3);
    let since = 0;
    const phase = await bench.measure(
      name,
      plan.switches,
      () => {
        since = 0;
        renderer.setTheme(THEMES[renderer.theme === 'dark' ? 'light' : 'dark'].canvas);
      },
      { more: () => renderer.switching && ++since < SWITCH_FRAMES },
    );
    phases.push({ ...phase, restyling: true });
  };
  await switchPhase('Switch theme, whole view', () => controller.fitWhole());
  await switchPhase('Switch theme, names shown', () => bench.move(namesShown()));
  if (renderer.theme !== startTheme) {
    renderer.setTheme(THEMES[startTheme].canvas);
    for (let frame = 0; renderer.switching && frame < SWITCH_FRAMES; frame++) renderer.renderNow();
  }
  return { phases, timed, latency, notes };
}

/** The shapes on screen that show a solid, anchored parts aside, which their drawing draws. */
function solidShapesOnScreen(bench: SolidsBench): ElementShape[] {
  const indexed = bench.indexed();
  const { renderer } = bench.controller;
  const seen = visibleRect(bench.controller.camera, renderer.viewport);
  return indexed.shapes
    .query(seen)
    .map((at) => indexed.scene.shapes[at] as ElementShape)
    .filter((shape) => shape.solid !== undefined && !isSolidAnchor(shape));
}

/** Whether the client keeps a picture, of any size, for every shape on screen that shows a solid. */
function everyPictureShows(bench: SolidsBench): boolean {
  return solidShapesOnScreen(bench).every((shape) => {
    const key = solidPictureKey(shape);
    return key === undefined || bench.client.picture(key, 1) !== undefined;
  });
}

/** Draws frames until a drawing shows the picture kept by `key`; how long it took, or none. */
async function waitForPicture(
  bench: SolidsBench,
  drawing: string,
  key: string | undefined,
  wait: number,
): Promise<number | undefined> {
  const { renderer } = bench.controller;
  const began = performance.now();
  while (performance.now() - began < wait) {
    renderer.renderNow(true);
    if (key !== undefined && renderer.solidPictureShown(drawing) === key) {
      return performance.now() - began;
    }
    await bench.settle(4);
  }
  return undefined;
}

/** A drawing's anchored parts, in their solid's order. */
function partsOf(indexed: IndexedScene, drawing: string): ElementShape[] {
  return indexed.scene.shapes
    .filter((shape) => shape.containerShape === drawing && isSolidAnchor(shape))
    .sort((a, b) => (a.part?.index ?? 0) - (b.part?.index ?? 0));
}

/** Points spread over a drawing's picture, on a grid, a little off its pixels' edges. */
function pointsOver(drawing: ElementShape, count: number): Point[] {
  const rect: Rect = drawing.solid?.rect ?? drawing.rect;
  const side = Math.max(1, Math.ceil(Math.sqrt(count)));
  const points: Point[] = [];
  for (let at = 0; at < count; at++) {
    const x = ((at % side) + 0.37) / side;
    const y = (Math.floor(at / side) + 0.61) / side;
    points.push({ x: rect.x + x * rect.width, y: rect.y + y * rect.height });
  }
  return points;
}

/**
 * Finds what is under the pointer at each point, as the canvas does when it moves, through the
 * drawing's part buffer, timing each.
 */
function timePointing(bench: SolidsBench, points: readonly Point[]): TimedAction {
  performance.mark('phase Find what is under the pointer, over parts');
  const { controller } = bench;
  const { renderer } = controller;
  const indexed = bench.indexed();
  const tolerance = HIT_TOLERANCE / controller.camera.scale;
  const exact = (shape: ElementShape) => renderer.showsOutline(shape.key);
  const times: number[] = [];
  const found = { parts: 0, drawing: 0, other: 0 };
  for (const point of points) {
    const began = performance.now();
    const hit = hitAt(indexed, point, tolerance, exact, renderer.hiddenByEmphasis);
    let shape = hit?.kind === 'shape' ? hit.shape : undefined;
    if (shape && isSolidAnchor(shape) && shape.containerShape !== undefined) {
      shape = indexed.byKey.get(shape.containerShape) ?? shape;
    }
    if (shape?.solid?.placement === 'parts') shape = renderer.solidPartAt(shape, point);
    times.push(performance.now() - began);
    if (shape && isSolidAnchor(shape)) found.parts += 1;
    else if (shape?.solid?.placement === 'parts') found.drawing += 1;
    else found.other += 1;
  }
  return {
    name: 'Find what is under the pointer, over parts',
    times,
    mark: SOLID_MARKS.pointing,
    note: `${found.parts.toLocaleString()} found an anchored part, ${found.drawing.toLocaleString()} its drawing, ${found.other.toLocaleString()} something else`,
  };
}

/**
 * The shapes the phases go to, by key: the drawings with parts, the middle one first; the first shape
 * that shows the solid of 200,000 triangles; and the drawing at every cap.
 */
export function solidsBenchKeys(
  indexed: IndexedScene,
  drawings: readonly string[],
): Pick<SolidsBench, 'drawings' | 'turned' | 'turnedAtCaps'> {
  const keyOf = (element: string) => indexed.byElement.get(element)?.[0]?.key ?? element;
  const keys = drawings.map(keyOf);
  const turned = indexed.scene.shapes.find(
    (shape) => shape.solid?.id === benchSolidId(BENCH_SOLIDS.turned) && !isSolidAnchor(shape),
  );
  const atCaps = keys.find(
    (key) => indexed.byKey.get(key)?.solid?.id === benchSolidId(BENCH_SOLIDS.turnedAtCaps),
  );
  return {
    drawings: keys,
    turned: turned?.key ?? (keys[0] as string),
    turnedAtCaps: atCaps ?? (keys[0] as string),
  };
}
