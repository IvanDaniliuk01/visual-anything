/**
 * Cleaning and checking solids in a worker thread (ADR 0075), limited to 1 GiB and stopped after 30
 * seconds, so that a hostile file cannot stall the program. The worker loads the glTF reader and
 * meshoptimizer only when it cleans; the program's own thread loads neither, and imports only the
 * types of what the worker answers.
 *
 * The worker runs:
 * - in the single executable (ADR 0037), from the script the executable holds as an asset;
 * - from the bundle the executable is made of, from the script beside it;
 * - from the sources, as `pnpm dev`, `pnpm start` and the tests run them, from that same script built
 *   once a process (`bundle.ts`).
 */
import * as sea from 'node:sea';
import { Worker } from 'node:worker_threads';
import type { Problem, SolidImportOptions } from '@visual-anything/core';
import type { WorkerSource } from '../drawings/make';
import { errorCode, errorReason } from '../errors';
import type { CleanedSolid } from './clean';
import type { CheckedSolid, SolidWork, SolidWorkAnswer } from './worker';

/** The executable's asset that holds the worker's script. */
export const SOLID_WORKER_ASSET = 'solids/worker.cjs';

/** The worker's script beside the bundle of the server. */
export const SOLID_WORKER_FILE = 'solid-worker.cjs';

/** How much the worker may use: 1 GiB of memory and 30 seconds (ADR 0075). */
export const SOLID_WORKER_LIMITS = { memoryMb: 1024, timeMs: 30_000 } as const;

export interface SolidWorkerOptions {
  /** How long the worker may take, in milliseconds; 30 seconds unless a test says. */
  timeMs?: number;
  /** How much memory the worker may use, in MiB; 1,024 unless a test says. */
  memoryMb?: number;
  /** What the worker runs, for tests; the cleaner's own worker by default. */
  worker?: WorkerSource;
}

/** Cleans a file to import in the worker. The bytes are handed to it, and are no longer the caller's. */
export async function cleanInWorker(
  bytes: Uint8Array,
  options: SolidImportOptions = {},
  run: SolidWorkerOptions = {},
): Promise<CleanedSolid> {
  // Only bytes that are their buffer's whole are handed over; others are copied first.
  const owned =
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength &&
    bytes.buffer instanceof ArrayBuffer
      ? bytes
      : bytes.slice();
  const answer = await runWorker(
    { kind: 'clean', bytes: owned, options },
    run,
    'Cleaning the file',
    true,
  );
  if ('problems' in answer && !answer.ok) return answer;
  if (!answer.ok) return refused('program-failed', 'The file could not be cleaned.');
  if (!('bytes' in answer)) return refused('program-failed', 'The file could not be cleaned.');
  return answer;
}

/** Checks a solid's file in the worker with the core's strict reader. The caller keeps its bytes. */
export async function checkInWorker(
  bytes: Uint8Array,
  run: SolidWorkerOptions = {},
): Promise<CheckedSolid> {
  const answer = await runWorker({ kind: 'check', bytes }, run, 'Checking the solid file', false);
  if (!answer.ok) {
    return 'problems' in answer
      ? { ok: false, problems: answer.problems }
      : refused('program-failed', 'The solid file could not be checked.');
  }
  if ('bytes' in answer) return refused('program-failed', 'The solid file could not be checked.');
  return answer;
}

type Answered = CleanedSolid | CheckedSolid | { ok: false; problems: Problem[] };

async function runWorker(
  work: SolidWork,
  options: SolidWorkerOptions,
  doing: string,
  transfer: boolean,
): Promise<Answered> {
  let source: WorkerSource;
  try {
    source = options.worker ?? (await solidWorker());
  } catch (error) {
    return refused('program-failed', `${doing} could not start: ${errorReason(error)}`);
  }
  const timeMs = options.timeMs ?? SOLID_WORKER_LIMITS.timeMs;
  const memoryMb = options.memoryMb ?? SOLID_WORKER_LIMITS.memoryMb;
  const young = Math.min(64, Math.floor(memoryMb / 8));
  const worker = new Worker(source.script, {
    eval: source.eval,
    workerData: work,
    ...(transfer ? { transferList: [work.bytes.buffer as ArrayBuffer] } : {}),
    // The worker writes nothing the person needs; what it would print is drained.
    stdout: true,
    stderr: true,
    resourceLimits: {
      maxOldGenerationSizeMb: memoryMb - young,
      maxYoungGenerationSizeMb: young,
      stackSizeMb: 8,
    },
  });
  worker.stdout.resume();
  worker.stderr.resume();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: Answered) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(value);
    };
    const timer = setTimeout(() => {
      finish(
        refused(
          'solid-too-large',
          `${doing} took over ${Math.round(timeMs / 1000)} seconds, so it was stopped.`,
        ),
      );
    }, timeMs);
    worker.once('message', (message: SolidWorkAnswer) => finish(answered(message, doing)));
    worker.once('error', (error: Error) => {
      finish(
        errorCode(error) === 'ERR_WORKER_OUT_OF_MEMORY'
          ? refused(
              'solid-too-large',
              `${doing} needed over ${memoryMb.toLocaleString('en')} MiB of memory, so it was stopped.`,
            )
          : refused('program-failed', `${doing} failed: ${error.message}`),
      );
    });
    worker.once('exit', (code) => {
      finish(refused('program-failed', `${doing} failed: its worker stopped (${code}).`));
    });
  });
}

/** What the worker answered, refused when anything in it tried to reach the network or a file. */
function answered(answer: SolidWorkAnswer, doing: string): Answered {
  if (answer.attempts !== 0) {
    return refused(
      'program-failed',
      `${doing} tried to reach the network or a file, which it never may, so nothing was kept.`,
    );
  }
  if (!answer.ok && 'failed' in answer) {
    return refused('program-failed', `${doing} failed: ${answer.failed}`);
  }
  const outcome: Record<string, unknown> = { ...answer };
  delete outcome.attempts;
  return outcome as Answered;
}

function refused(code: Problem['code'], message: string): { ok: false; problems: Problem[] } {
  return { ok: false, problems: [{ code, message }] };
}

/** The worker's script built from the sources, once a process. */
let built: Promise<string> | undefined;

/** The cleaner's own worker, where this program runs. */
export async function solidWorker(): Promise<WorkerSource> {
  if (sea.isSea()) return { script: sea.getAsset(SOLID_WORKER_ASSET, 'utf8'), eval: true };
  const here = import.meta.url;
  if (!here.endsWith('.ts'))
    return { script: new URL(`./${SOLID_WORKER_FILE}`, here), eval: false };
  // A name the bundle of the server does not follow: the executable never builds anything.
  const bundler = './bundle';
  built ??= (import(bundler) as Promise<typeof import('./bundle')>).then(
    async ({ bundleSolidWorker }) => (await bundleSolidWorker()).code,
  );
  try {
    return { script: await built, eval: true };
  } catch (error) {
    built = undefined;
    throw error;
  }
}
