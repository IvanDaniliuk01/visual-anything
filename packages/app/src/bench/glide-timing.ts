/**
 * Times the glide of a tour step in Node (ADR 0084): what the stage works out before a glide plays,
 * `glideSideOf` for the step before and the step after and `planGlide` matching them, then each frame
 * `drawGlideFrame` draws, on the benchmark's 10,000-element view, with the cameras of the benchmark's
 * own phase (`glide.ts`): the zoom where shapes draw in full, toward a camera twice as near and half a
 * screen over. A short check, not a benchmark: the frames drawn on a real 2D canvas are the browser's
 * to measure (`pnpm bench`). Here each frame is drawn on a recording 2D context, which keeps every call
 * and its arguments and paints nothing, so it times the layer's own work: placing each shape, cutting
 * its name to fit and the calls it makes.
 *
 *   pnpm exec tsx packages/app/src/bench/glide-timing.ts [elements] [boxes|tables] [runs]
 */
import { MAX_GLIDE_SHAPES, planGlide, robotoWidth, tourEase } from '@visual-anything/core';
import type { Camera } from '../canvas/camera';
import { buildScene, type Scene } from '../canvas/scene';
import {
  drawGlideFrame,
  glideSideOf,
  type GlideContext,
  type GlideItem,
  type GlideSide,
} from '../tours/glide-layer';
import { syntheticProject } from './synthetic';

// Run by Node, whose `process` the app's types leave out.
const args = (globalThis as { process?: { argv: string[] } }).process?.argv ?? [];
const elements = Number(args[2] ?? 10_000);
const tables = args[3] === 'tables';
const runs = Number(args[4] ?? 20);

/** The benchmark's screen: the reference laptop's 1366 × 768 display, less the browser's own bars. */
const SCREEN = { width: 1366, height: 650 };
/**
 * The scale the benchmark's phase glides at, `COARSE_BELOW * 1.04` (`canvas/renderer.ts`), where
 * shapes draw in full; written out so that Node loads no renderer.
 */
const SCALE = 0.25 * 1.04;
/** The frames of the benchmark's phase: its longest glide, 800 ms at 60 frames a second, twice. */
const FRAMES = 96;

/** A 2D context that records each call and its arguments, and paints nothing. */
function recordingContext(): GlideContext & { calls: unknown[][]; clear(): void } {
  const calls: unknown[][] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
    };
  return {
    calls,
    clear: () => {
      calls.length = 0;
    },
    setTransform: record('setTransform'),
    fillRect: record('fillRect'),
    beginPath: record('beginPath'),
    rect: record('rect'),
    roundRect: record('roundRect'),
    ellipse: record('ellipse'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    closePath: record('closePath'),
    fill: record('fill'),
    stroke: record('stroke'),
    fillText: record('fillText'),
    // Measured as the canvas measures its names, in Roboto's widths, at the layer's 12 px.
    measureText: (text: string) => {
      calls.push(['measureText', text]);
      return { width: robotoWidth(text, 'regular', 12) } as TextMetrics;
    },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
  };
}

const ms = (value: number) => `${value.toFixed(3)} ms`;
const sorted = (values: readonly number[]) => [...values].sort((a, b) => a - b);
const median = (values: readonly number[]) => sorted(values)[Math.floor(values.length / 2)] ?? 0;
const percentile = (values: readonly number[], part: number) =>
  sorted(values)[Math.min(values.length - 1, Math.floor(values.length * part))] ?? 0;

function time<T>(count: number, work: () => T): { times: number[]; result: T } {
  const times: number[] = [];
  let result = work();
  for (let run = 0; run < count; run++) {
    const began = performance.now();
    result = work();
    times.push(performance.now() - began);
  }
  return { times, result };
}

function say(name: string, times: readonly number[]): void {
  console.log(
    `  ${name.padEnd(40)} median ${ms(median(times)).padStart(11)}, worst ${ms(Math.max(...times)).padStart(11)} (${times.length} runs)`,
  );
}

function cameraAt(scene: Scene, scale: number): Camera {
  const bounds = scene.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
  const middle = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  return {
    scale,
    x: SCREEN.width / 2 - middle.x * scale,
    y: SCREEN.height / 2 - middle.y * scale,
  };
}

function firstOf(side: GlideSide, count: number): GlideSide {
  return { shapes: side.shapes.slice(0, count), looks: side.looks.slice(0, count) };
}

const project = syntheticProject({ elements, tables });
const view = project.views[0]?.id as string;
const built = performance.now();
const scene = buildScene(project, view);
console.log(
  `${elements} elements${tables ? ', tables' : ''}: ${scene.shapes.length} shapes, the scene built in ${ms(performance.now() - built)}; a screen of ${SCREEN.width} × ${SCREEN.height}`,
);

const before = cameraAt(scene, SCALE);
const after: Camera = {
  scale: before.scale * 2,
  x: before.x * 2 - SCREEN.width / 2,
  y: before.y * 2 - SCREEN.height / 2,
};

console.log('\nWhat the stage works out before the glide plays');
const sideBefore = time(runs, () => glideSideOf(scene, before, SCREEN));
say('glideSideOf, the step before', sideBefore.times);
const sideAfter = time(runs, () => glideSideOf(scene, after, SCREEN));
say('glideSideOf, the step after', sideAfter.times);
const first = firstOf(sideBefore.result, MAX_GLIDE_SHAPES);
const second = sideAfter.result;
console.log(
  `    ${sideBefore.result.shapes.length} shapes on screen before (${first.shapes.length} kept), ${second.shapes.length} after`,
);
const planned = time(runs, () =>
  planGlide(first.shapes, second.shapes, { screen: SCREEN, reducedMotion: false }),
);
say(`planGlide, ${first.shapes.length} against ${second.shapes.length}`, planned.times);
const plan = planned.result;
console.log(
  `    ${plan.kind === 'glide' ? `glides ${plan.pairs.length} shapes over ${plan.duration} ms` : `cuts: ${plan.reason}, ${plan.shared} shared`}`,
);
// The same match with no cap on the step before: what judging a step that glides too many costs.
const everyBefore = sideBefore.result;
const whole = time(runs, () =>
  planGlide(everyBefore.shapes, second.shapes, { screen: SCREEN, reducedMotion: false }),
);
say(`planGlide, ${everyBefore.shapes.length} against ${second.shapes.length}`, whole.times);

/** Each of a side's shapes, to where the camera after puts it, on the screen or off it. */
const toCameraAfter = (side: GlideSide): GlideItem[] =>
  side.shapes.map((shape, at) => ({
    from: shape.rect,
    to: {
      x: shape.rect.x * 2 - SCREEN.width / 2,
      y: shape.rect.y * 2 - SCREEN.height / 2,
      width: shape.rect.width * 2,
      height: shape.rect.height * 2,
    },
    look: side.looks[at] as GlideItem['look'],
  }));

const items: GlideItem[] =
  plan.kind === 'glide'
    ? plan.pairs.flatMap((pair) => {
        const from = first.shapes[pair.before];
        const to = second.shapes[pair.after];
        const look = first.looks[pair.before];
        return from && to && look ? [{ from: from.rect, to: to.rect, look }] : [];
      })
    : toCameraAfter(first);

const context = recordingContext();
const surface = { background: '#ffffff', resolution: 1, size: SCREEN };

function measureFrames(name: string, gliding: readonly GlideItem[]): void {
  console.log(`\n${name}, ${gliding.length} shapes, on a recording 2D context`);
  const times: number[] = [];
  let calls = 0;
  // Twice over: the first warms the code, the second is the one said.
  for (let pass = 0; pass < 2; pass++) {
    times.length = 0;
    for (let frame = 0; frame < FRAMES; frame++) {
      context.clear();
      const part = tourEase((frame % (FRAMES / 2)) / (FRAMES / 2 - 1));
      const began = performance.now();
      drawGlideFrame(context, gliding, part, surface);
      times.push(performance.now() - began);
      calls = Math.max(calls, context.calls.length);
    }
  }
  say(`drawGlideFrame, ${FRAMES} frames`, times);
  console.log(
    `    95th percentile ${ms(percentile(times, 0.95))}; at most ${calls} calls a frame, ${(calls / Math.max(1, gliding.length)).toFixed(1)} a shape`,
  );
}

measureFrames('Each frame of the glide the plan makes', items);
measureFrames(
  `Each frame with every one of the ${first.shapes.length} shapes the step before keeps gliding`,
  toCameraAfter(first),
);
