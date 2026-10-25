/**
 * The app's side of the layout worker. The worker starts with the first layout asked for, and starts
 * again after it fails or a layout is stopped; a layout's input is copied to it, and its progress and
 * then its result come back.
 */
import type { LayoutReply, LayoutRequest } from './messages';
import type { LayoutInput, LayoutProgress, LayoutResult } from './types';

/** How one layout is followed and stopped. */
export interface LayOutCall {
  /** Called as more of the containers it arranges are done. */
  onProgress?: (progress: LayoutProgress) => void;
  /** Stops the layout: it then fails with `LayoutStopped`. */
  signal?: AbortSignal;
}

/** What runs layouts for the canvas: the layout worker, or a stand-in for it in tests. */
export interface LayoutRunner {
  layOut(input: LayoutInput, call?: LayOutCall): Promise<LayoutResult>;
  /** Stops the worker; layouts still waiting fail. */
  dispose(): void;
}

/** The failure of a layout that was stopped before it ended. */
export class LayoutStopped extends Error {
  override name = 'LayoutStopped';
  constructor() {
    super('The layout was stopped.');
  }
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

interface Waiting {
  resolve: (result: LayoutResult) => void;
  reject: (error: Error) => void;
  onProgress?: ((progress: LayoutProgress) => void) | undefined;
}

/**
 * Runs layouts in a worker that `start` makes. ELK cannot be interrupted, so stopping a layout stops
 * the worker, with every layout waiting in it; the next layout starts a new one.
 */
export function workerRunner(start: () => LayoutWorker = startWorker): LayoutRunner {
  let worker: LayoutWorker | undefined;
  let count = 0;
  const waiting = new Map<number, Waiting>();

  const failAll = (error: () => Error) => {
    const all = [...waiting.values()];
    waiting.clear();
    for (const each of all) each.reject(error());
  };

  const stopWorker = () => {
    worker?.terminate();
    worker = undefined;
  };

  const ensure = (): LayoutWorker => {
    if (worker) return worker;
    const started = start();
    started.addEventListener('message', (event) => {
      const reply = event.data;
      const asked = waiting.get(reply.id);
      if (!asked) return;
      if (reply.kind === 'progress') {
        asked.onProgress?.(reply.progress);
        return;
      }
      waiting.delete(reply.id);
      if (reply.kind === 'done') asked.resolve(reply.result);
      else asked.reject(new Error(reply.message));
    });
    started.addEventListener('error', (event) => {
      // A worker that fails this way answers nothing more: the next layout starts a new one.
      const message = event instanceof ErrorEvent && event.message ? event.message : 'it stopped';
      started.terminate();
      if (worker === started) worker = undefined;
      failAll(() => new Error(`The layout worker failed: ${message}.`));
    });
    worker = started;
    return started;
  };

  return {
    layOut(input, call = {}) {
      const id = ++count;
      return new Promise<LayoutResult>((resolve, reject) => {
        const { signal, onProgress } = call;
        if (signal?.aborted) {
          reject(new LayoutStopped());
          return;
        }
        waiting.set(id, { resolve, reject, onProgress });
        signal?.addEventListener('abort', () => {
          if (!waiting.has(id)) return;
          stopWorker();
          failAll(() => new LayoutStopped());
        });
        try {
          ensure().postMessage({ id, input });
        } catch (error) {
          waiting.delete(id);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    dispose() {
      stopWorker();
      failAll(() => new LayoutStopped());
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
