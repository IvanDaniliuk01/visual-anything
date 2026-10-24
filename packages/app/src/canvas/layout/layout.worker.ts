/**
 * The layout worker: everything a layout does after the app hands over its input runs here, off the
 * main thread (ADR-0015). ELK runs in a worker of its own, started from this one, because elkjs takes
 * over the message handler of any worker it is loaded into. Requests are answered one at a time, in
 * the order they came.
 */
import ELK from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
import { layOut } from './engine';
import type { LayoutReply, LayoutRequest } from './messages';

/** What this file needs of its worker scope, which the DOM types do not describe. */
interface LayoutWorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<LayoutRequest>) => void): void;
  postMessage(message: LayoutReply): void;
}

const scope = self as unknown as LayoutWorkerScope;
const elk = new ELK({ workerFactory: () => new Worker(elkWorkerUrl, { name: 'elk' }) });
let done: Promise<void> = Promise.resolve();

scope.addEventListener('message', (event) => {
  const { id, input } = event.data;
  done = done.then(async () => {
    try {
      scope.postMessage({ id, ok: true, result: await layOut(input, elk) });
    } catch (error) {
      scope.postMessage({ id, ok: false, message: messageOf(error) });
    }
  });
});

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message);
  }
  return String(error);
}
