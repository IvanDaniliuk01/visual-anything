/**
 * The app's side of the layout worker. The worker starts with the first layout asked for, and starts
 * again after it fails; a layout's input is copied to it, and only its result comes back.
 */
import type { LayoutReply, LayoutRequest } from './messages';
import type { LayoutInput, LayoutResult } from './types';

/** What runs layouts for the canvas: the layout worker, or a stand-in for it in tests. */
export interface LayoutRunner {
  layOut(input: LayoutInput): Promise<LayoutResult>;
  /** Stops the worker; layouts still waiting fail. */
  dispose(): void;
}

/** What the runner needs of a worker. */
export interface LayoutWorker {
  postMessage(message: LayoutRequest): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<LayoutReply>) => void): void;
  addEventListener(type: 'error', listener: (event: ErrorEvent | Event) => void): void;
  terminate(): void;
}

/** Starts the layout worker. Vite bundles the worker from this exact expression. */
function startWorker(): LayoutWorker {
  return new Worker(new URL('./layout.worker.ts', import.meta.url), {
    type: 'module',
    name: 'layout',
  });
}

/** Runs layouts in a worker that `start` makes. */
export function workerRunner(start: () => LayoutWorker = startWorker): LayoutRunner {
  let worker: LayoutWorker | undefined;
  let count = 0;
  const waiting = new Map<
    number,
    { resolve: (result: LayoutResult) => void; reject: (error: Error) => void }
  >();

  const failAll = (message: string) => {
    const all = [...waiting.values()];
    waiting.clear();
    for (const each of all) each.reject(new Error(message));
  };

  const ensure = (): LayoutWorker => {
    if (worker) return worker;
    const started = start();
    started.addEventListener('message', (event) => {
      const reply = event.data;
      const asked = waiting.get(reply.id);
      if (!asked) return;
      waiting.delete(reply.id);
      if (reply.ok) asked.resolve(reply.result);
      else asked.reject(new Error(reply.message));
    });
    started.addEventListener('error', (event) => {
      // A worker that fails this way answers nothing more: the next layout starts a new one.
      const message = event instanceof ErrorEvent && event.message ? event.message : 'it stopped';
      started.terminate();
      if (worker === started) worker = undefined;
      failAll(`The layout worker failed: ${message}.`);
    });
    worker = started;
    return started;
  };

  return {
    layOut(input) {
      const id = ++count;
      return new Promise<LayoutResult>((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        try {
          ensure().postMessage({ id, input });
        } catch (error) {
          waiting.delete(id);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    dispose() {
      worker?.terminate();
      worker = undefined;
      failAll('The layout stopped.');
    },
  };
}

let shared: LayoutRunner | undefined;

/**
 * The runner every canvas shares, made the first time one asks; undefined where the browser has no
 * workers, as in tests, so that layout is off there rather than run on the main thread.
 */
export function sharedRunner(): LayoutRunner | undefined {
  if (typeof Worker === 'undefined') return undefined;
  shared ??= workerRunner();
  return shared;
}
