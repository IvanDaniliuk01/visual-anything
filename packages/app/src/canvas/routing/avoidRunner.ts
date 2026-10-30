/**
 * The app's side of the routing worker: a request at a time, a newer one stopping the one before, and
 * the routes coming back a few at a time. Where the browser offers no workers, as jsdom does not,
 * nothing is routed around and lines keep their stand-in routes; tests give a runner of their own.
 *
 * libavoid routes first only where it is asked for (ADR 0080's clarification of Stage 1b): it does not
 * keep within the routing budget on the user's model, so the program's own router is the default, and
 * `visual-anything.router` set to `libavoid` in the browser's storage turns libavoid on.
 */
import { createContext } from 'react';
import type { Point } from '../geometry';
import type { Avoided, AvoidLine, AvoidShapes } from './avoid';
import { routingOrder, type AvoidMessage, type AvoidReply } from './avoidMessages';
import { spreadChannels, type ChannelInput, type ChannelOutput } from './channels';
import { routeLines, type LibavoidRouter } from './libavoid';

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
      /**
       * New routes for lines drawn already, by their indexes in `existing`, which libavoid routed
       * again with those asked for (ADR 0080, section 2).
       */
      others?: { line: number; avoided: Avoided }[],
    ) => void,
    /** The lines drawn already, which routes beside rows keep apart from. */
    existing?: AvoidLine[],
  ): () => void;
  /**
   * Spreads the lines drawn into channels (ADR 0080, section 2), telling `onDone` the routes; a newer
   * request stops an older one. Absent: no channel pass, as a test's runner may give.
   */
  channels?(input: ChannelInput, onDone: (output: ChannelOutput, took: number) => void): () => void;
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

/**
 * Routes in a worker that `start` makes, started with the first request; with libavoid first when
 * `libavoid` gives the address of its WebAssembly.
 */
export function workerAvoidRunner(
  start: () => AvoidWorker = startWorker,
  libavoid?: string,
): AvoidRunner {
  let worker: AvoidWorker | undefined;
  let count = 0;
  const listening = new Map<number, Parameters<AvoidRunner['route']>[3]>();
  let channelling:
    { id: number; onDone: (output: ChannelOutput, took: number) => void } | undefined;
  const ensure = (): AvoidWorker => {
    if (worker) return worker;
    const started = start();
    started.addEventListener('message', (event) => {
      const reply = event.data;
      if (reply.type === 'channels') {
        if (channelling?.id !== reply.id) return;
        const { onDone } = channelling;
        channelling = undefined;
        onDone(reply.output, reply.took);
        return;
      }
      const { id, results, done, took, others } = reply;
      const listener = listening.get(id);
      if (!listener) return;
      if (done) listening.delete(id);
      listener(results, done, took, others);
    });
    worker = started;
    return started;
  };
  return {
    route(shapes, lines, center, onResults, existing) {
      count += 1;
      const id = count;
      // Only the newest request is listened to: a newer one stops the worker's older one.
      for (const old of listening.keys()) worker?.postMessage({ type: 'cancel', id: old });
      listening.clear();
      listening.set(id, onResults);
      ensure().postMessage({
        type: 'route',
        id,
        shapes,
        lines,
        ...(center ? { center } : {}),
        ...(existing && existing.length > 0 ? { existing } : {}),
        ...(libavoid === undefined ? {} : { libavoid }),
      });
      return () => {
        if (!listening.delete(id)) return;
        worker?.postMessage({ type: 'cancel', id });
      };
    },
    channels(input, onDone) {
      count += 1;
      const id = count;
      channelling = { id, onDone };
      ensure().postMessage({ type: 'channels', id, input });
      return () => {
        if (channelling?.id === id) channelling = undefined;
      };
    },
    dispose() {
      listening.clear();
      channelling = undefined;
      worker?.terminate();
      worker = undefined;
    },
  };
}

/**
 * Routes on the calling thread, a turn later, all at once: for tests, and wherever a worker would cost
 * more than it saves; with libavoid first when given its routers.
 */
export function inThreadAvoidRunner(libavoid?: LibavoidRouter): AvoidRunner {
  return {
    route(shapes, lines, center, onResults, existing) {
      let stopped = false;
      queueMicrotask(() => {
        if (stopped) return;
        const began = performance.now();
        const routed = routeLines(shapes, lines, existing, libavoid);
        const results = routingOrder(lines, center).map((line) => ({
          line,
          avoided: routed.results[line] as Avoided,
        }));
        const others: { line: number; avoided: Avoided }[] = [];
        routed.others.forEach((avoided, line) => {
          if (avoided) others.push({ line, avoided });
        });
        onResults(results, true, performance.now() - began, others);
      });
      return () => {
        stopped = true;
      };
    },
    channels(input, onDone) {
      let stopped = false;
      queueMicrotask(() => {
        if (stopped) return;
        const began = performance.now();
        const output = spreadChannels(input);
        onDone(output, performance.now() - began);
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
  shared ??= workerAvoidRunner(startWorker, libavoidWanted() ? LIBAVOID_WASM : undefined);
  return shared;
}

/**
 * Where the app serves libavoid's WebAssembly: a file of its own beside the app, which the person
 * can replace with a build of their own (ADR 0080's consequences, LGPL-2.1-or-later).
 */
export const LIBAVOID_WASM = '/libavoid.wasm';

/** The browser storage key that turns libavoid on as the router, set to `libavoid`. */
export const ROUTER_KEY = 'visual-anything.router';

/** Whether libavoid is asked for in the browser's storage; never where storage cannot be read. */
export function libavoidWanted(
  storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage,
): boolean {
  try {
    return storage?.getItem(ROUTER_KEY) === 'libavoid';
  } catch {
    return false;
  }
}

/**
 * What routes the canvas's lines around shapes: by default (null) the shared worker; tests give a
 * runner of their own, and undefined turns routing around off.
 */
export const AvoidRunnerContext = createContext<AvoidRunner | null | undefined>(null);
