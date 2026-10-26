/**
 * Making a drawing of HTML (ADR 0068), as the local program, the command line and Claude's
 * `import_drawing` ask for one: in a worker thread of its own, limited to 256 MiB and stopped after 10
 * seconds, so that a hostile page cannot stall the program; then cleaned by the core's `cleanSvg`, as
 * every image is (ADR 0027). Making it changes nothing: the action that stores and shows it is the
 * core's `prepareDrawingImport`.
 *
 * Only the worker loads parse5, satori and Roboto. It runs:
 *
 * - in the single executable (ADR 0037), from the script the executable holds as an asset;
 * - from the bundle the executable is made of, from the script beside it;
 * - from the sources, as `pnpm dev`, `pnpm start` and the tests run them, from that same script built
 *   once a process (`bundle.ts`).
 */
import { createRequire } from 'node:module';
import * as sea from 'node:sea';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { DRAWING_LIMITS, cleanSvg, type Problem } from '@visual-anything/core';
import { errorCode, errorReason } from '../errors';
import { HTML_CAPS } from './caps';
import type { DrawingWork, DrawingWorkAnswer } from './worker';

/** The executable's asset that holds the worker's script. */
export const DRAWING_WORKER_ASSET = 'drawings/worker.cjs';

/** The worker's script beside the bundle of the server. */
export const DRAWING_WORKER_FILE = 'drawing-worker.cjs';

/** What a worker runs: a script's file, or its text. */
export interface WorkerSource {
  script: string | URL;
  eval: boolean;
}

/** A drawing made, or why it was not. */
export type MadeDrawing =
  | {
      ok: true;
      /** Cleaned as every SVG image is. */
      svg: string;
      width: number;
      height: number;
      /** What making it dropped, line by line, in English. */
      report: string[];
    }
  | { ok: false; problems: Problem[] };

export interface MakeOptions {
  /** How long the worker may take, in milliseconds; 10 seconds unless a test says. */
  timeMs?: number;
  /** How much memory the worker may use, in MiB; 256 unless a test says. */
  memoryMb?: number;
  /** What the worker runs, for tests; the drawing's own worker by default. */
  worker?: WorkerSource;
}

/** The text that says how a drawing should change when it is too large. */
const SHORTEN = 'Shorten the HTML, or make it narrower.';

/** Makes a drawing of HTML laid out `width` CSS pixels wide, 800 by default. */
export async function makeDrawing(
  html: string,
  width: number = DRAWING_LIMITS.width.initial,
  options: MakeOptions = {},
): Promise<MadeDrawing> {
  if (
    !Number.isSafeInteger(width) ||
    width < DRAWING_LIMITS.width.least ||
    width > DRAWING_LIMITS.width.most
  ) {
    return refused(
      'invalid-command',
      'A drawing is laid out at a width of 64 to 2000 pixels, in whole pixels.',
    );
  }
  if (typeof html !== 'string' || Buffer.byteLength(html, 'utf8') > HTML_CAPS.input) {
    return refused(
      'image-too-large',
      `The HTML is over ${HTML_CAPS.input / 1024} KiB: shorten it, or import a part of the page.`,
    );
  }
  let source: WorkerSource;
  try {
    source = options.worker ?? (await drawingWorker());
  } catch (error) {
    return refused('program-failed', `The drawing could not be made: ${errorReason(error)}`);
  }
  const answer = await run({ html, width }, source, options);
  return 'problems' in answer ? answer : answered(answer);
}

/** Runs the worker on the work, within its limits, and gives what it answered. */
function run(
  work: DrawingWork,
  source: WorkerSource,
  options: MakeOptions,
): Promise<DrawingWorkAnswer | { ok: false; problems: Problem[] }> {
  const timeMs = options.timeMs ?? HTML_CAPS.timeMs;
  const memoryMb = options.memoryMb ?? HTML_CAPS.memoryMb;
  const young = Math.min(16, Math.floor(memoryMb / 4));
  const worker = new Worker(source.script, {
    eval: source.eval,
    workerData: work,
    // The worker writes nothing the person needs; what it would print is drained.
    stdout: true,
    stderr: true,
    resourceLimits: {
      maxOldGenerationSizeMb: memoryMb - young,
      maxYoungGenerationSizeMb: young,
      stackSizeMb: 4,
    },
  });
  worker.stdout.resume();
  worker.stderr.resume();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: DrawingWorkAnswer | { ok: false; problems: Problem[] }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(value);
    };
    const timer = setTimeout(() => {
      finish(
        refused(
          'image-too-large',
          `Making the drawing took over ${Math.round(timeMs / 1000)} seconds, so it was stopped. ${SHORTEN}`,
        ),
      );
    }, timeMs);
    worker.once('message', (message: DrawingWorkAnswer) => finish(message));
    worker.once('error', (error: Error) => {
      finish(
        errorCode(error) === 'ERR_WORKER_OUT_OF_MEMORY'
          ? refused(
              'image-too-large',
              `Making the drawing needed over ${memoryMb} MiB of memory, so it was stopped. ${SHORTEN}`,
            )
          : refused('program-failed', `The drawing could not be made: ${error.message}`),
      );
    });
    worker.once('exit', (code) => {
      finish(
        refused('program-failed', `The drawing could not be made: its worker stopped (${code}).`),
      );
    });
  });
}

/** What the worker answered, its SVG cleaned by the core. */
function answered(answer: DrawingWorkAnswer): MadeDrawing {
  if (answer.attempts !== 0) {
    return refused(
      'program-failed',
      'Making the drawing tried to reach the network, which it never may, so nothing was made.',
    );
  }
  if (!answer.ok) {
    return 'failed' in answer
      ? refused('program-failed', `The drawing could not be made: ${answer.failed}`)
      : { ok: false, problems: [answer.problem] };
  }
  const cleaned = cleanSvg(answer.svg);
  if (!cleaned.ok) {
    return cleaned.problem.code === 'image-too-large'
      ? refused(
          'image-too-large',
          `The drawing is too large to keep as a picture: ${cleaned.problem.message} ${SHORTEN}`,
        )
      : refused(
          cleaned.problem.code,
          `The HTML draws nothing a picture can keep: ${cleaned.problem.message}`,
        );
  }
  const removed = cleaned.removed;
  return {
    ok: true,
    svg: cleaned.value.svg,
    width: cleaned.value.width,
    height: cleaned.value.height,
    report: [
      ...answer.report,
      ...(removed.length === 0 ? [] : [`Cleaning the picture removed: ${removed.join(', ')}.`]),
    ],
  };
}

function refused(code: Problem['code'], message: string): { ok: false; problems: Problem[] } {
  return { ok: false, problems: [{ code, message }] };
}

/** The worker's script built from the sources, once a process. */
let built: Promise<string> | undefined;

/** The drawing's own worker, where this program runs. */
export async function drawingWorker(): Promise<WorkerSource> {
  if (sea.isSea()) return { script: sea.getAsset(DRAWING_WORKER_ASSET, 'utf8'), eval: true };
  const here = import.meta.url;
  if (!here.endsWith('.ts'))
    return { script: new URL(`./${DRAWING_WORKER_FILE}`, here), eval: false };
  // A name the bundle of the server does not follow: the executable never builds anything.
  const bundler = './bundle';
  built ??= (import(bundler) as Promise<typeof import('./bundle')>).then(
    async ({ bundleDrawingWorker }) => (await bundleDrawingWorker()).code,
  );
  try {
    return { script: await built, eval: true };
  } catch (error) {
    built = undefined;
    throw error;
  }
}

/** A worker that runs a module of the sources, through tsx, which `pnpm dev` and the tests run with. */
export function fromSources(entry: URL): WorkerSource {
  // tsx's ES module interface, which registers its loader in this thread.
  const api = pathToFileURL(
    createRequire(import.meta.url)
      .resolve('tsx/esm/api')
      .replace(/\.cjs$/, '.mjs'),
  ).href;
  return {
    script: `import(${JSON.stringify(api)}).then(({ register }) => { register(); return import(${JSON.stringify(entry.href)}); });`,
    eval: true,
  };
}
