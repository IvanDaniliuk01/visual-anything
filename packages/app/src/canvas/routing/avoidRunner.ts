/**
 * The app's side of the routing worker: a request at a time, a newer one stopping the one before, and
 * the routes coming back a few at a time. Where the browser offers no workers, as jsdom does not,
 * nothing is routed around and lines keep their stand-in routes; tests give a runner of their own.
 */
import { createContext } from 'react';
import type { Point } from '../geometry';
import { Avoider, type Avoided, type AvoidLine, type AvoidShapes } from './avoid';
import { routingOrder, type AvoidMessage, type AvoidReply } from './avoidMessages';

/** What routes lines around shapes for the canvas. */
export interface AvoidRunner {
  /**
   * Routes `lines` around `shapes`, nearest `center` first, telling `onResults` the routes as they
   * come, by the indexes of their lines; returns what stops it, after which nothing more comes.
   */
  route(
    shapes: AvoidShapes,
    lines: AvoidLine[],
    center: Point | undefined,
    onResults: (
      results: { line: number; avoided: Avoided }[],
      done: boolean,
      /** How long routing them took, in milliseconds, off the main thread when in a worker. */
      took: number,
    ) => void,
  ): () => void;
  dispose(): void;
}

/** What the runner needs of a worker. */
export interface AvoidWorker {
  postMessage(message: AvoidMessage): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<AvoidReply>) => void): void;
  terminate(): void;
}

/** Starts the routing worker. Vite bundles the worker from this exact expression. */
function startWorker(): AvoidWorker {
  return new Worker(new URL('./avoid.worker.ts', import.meta.url), {
    type: 'module',
    name: 'routing',
  });
}

/** Routes in a worker that `start` makes, started with the first request. */
export function workerAvoidRunner(start: () => AvoidWorker = startWorker): AvoidRunner {
  let worker: AvoidWorker | undefined;
  let count = 0;
  const listening = new Map<number, Parameters<AvoidRunner['route']>[3]>();
  const ensure = (): AvoidWorker => {
    if (worker) return worker;
    const started = start();
    started.addEventListener('message', (event) => {
      const { id, results, done, took } = event.data;
      const listener = listening.get(id);
      if (!listener) return;
      if (done) listening.delete(id);
      listener(results, done, took);
    });
    worker = started;
    return started;
  };
  return {
    route(shapes, lines, center, onResults) {
      count += 1;
      const id = count;
      // Only the newest request is listened to: a newer one stops the worker's older one.
      for (const old of listening.keys()) worker?.postMessage({ type: 'cancel', id: old });
      listening.clear();
      listening.set(id, onResults);
      ensure().postMessage({ type: 'route', id, shapes, lines, ...(center ? { center } : {}) });
      return () => {
        if (!listening.delete(id)) return;
        worker?.postMessage({ type: 'cancel', id });
      };
    },
    dispose() {
      listening.clear();
      worker?.terminate();
      worker = undefined;
    },
  };
}

/**
 * Routes on the calling thread, a turn later, all at once: for tests, and wherever a worker would cost
 * more than it saves.
 */
export function inThreadAvoidRunner(): AvoidRunner {
  return {
    route(shapes, lines, center, onResults) {
      let stopped = false;
      queueMicrotask(() => {
        if (stopped) return;
        const began = performance.now();
        const avoider = new Avoider(shapes);
        const results = routingOrder(lines, center).map((line) => ({
          line,
          avoided: avoider.avoid(lines[line] as AvoidLine),
        }));
        onResults(results, true, performance.now() - began);
      });
      return () => {
        stopped = true;
      };
    },
    dispose() {},
  };
}

let shared: AvoidRunner | undefined;

/** The runner every canvas shares: the routing worker, once one is asked for; none without workers. */
export function sharedAvoidRunner(): AvoidRunner | undefined {
  if (typeof Worker !== 'function') return undefined;
  shared ??= workerAvoidRunner();
  return shared;
}

/**
 * What routes the canvas's lines around shapes: by default (null) the shared worker; tests give a
 * runner of their own, and undefined turns routing around off.
 */
export const AvoidRunnerContext = createContext<AvoidRunner | null | undefined>(null);
