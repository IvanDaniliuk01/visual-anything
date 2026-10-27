/**
 * The worker thread a drawing is made in (ADR 0068), limited in memory and time by the program that
 * starts it (`make.ts`): it takes the HTML and the width as its data, makes the drawing once, answers
 * with what it made and how many times anything tried to reach the network, and ends.
 *
 * The network guard is imported first, so that it is up before parse5 and satori load.
 */
import { guardNetwork, networkAttempts } from './network';
import { parentPort, workerData } from 'node:worker_threads';
import { renderDrawing, type Rendered } from './render';

/** What the worker is given. */
export interface DrawingWork {
  html: string;
  width: number;
}

/** What the worker answers: what it made, or the error that stopped it, and the network attempts. */
export type DrawingWorkAnswer = (Rendered | { ok: false; failed: string }) & { attempts: number };

guardNetwork();
const port = parentPort;
if (port !== null) {
  const work = workerData as DrawingWork;
  void renderDrawing(work.html, work.width).then(
    (outcome) => port.postMessage({ ...outcome, attempts: networkAttempts() }),
    (error: unknown) =>
      port.postMessage({
        ok: false,
        failed: error instanceof Error ? error.message : String(error),
        attempts: networkAttempts(),
      } satisfies DrawingWorkAnswer),
  );
}
