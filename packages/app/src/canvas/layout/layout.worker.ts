/**
 * The layout worker: everything a layout does after the app hands over its input runs here, off the
 * main thread (ADR-0015). ELK runs in workers of its own, started from this one, because elkjs takes
 * over the message handler of any worker it is loaded into. There is one ELK worker for every two
 * cores, up to three, so that the containers of one depth are arranged side by side while the main
 * thread keeps a core; one whose run outlasts the layout's time limit is stopped, and started again
 * for the next run. Requests are answered one at a time, in the order they came, with their progress
 * on the way.
 */
import ELK from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
import type { ElkNode } from 'elkjs/lib/elk-api';
import { layOut, type ElkEngine } from './engine';
import type { LayoutReply, LayoutRequest } from './messages';

/** What this file needs of its worker scope, which the DOM types do not describe. */
interface LayoutWorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<LayoutRequest>) => void): void;
  postMessage(message: LayoutReply): void;
  navigator: { hardwareConcurrency?: number };
}

/** One ELK worker, started when first needed, and again after it was stopped. */
class ElkWorker implements ElkEngine {
  private elk: InstanceType<typeof ELK> | undefined;

  constructor(private readonly name: string) {}

  layout(graph: ElkNode): Promise<ElkNode> {
    this.elk ??= new ELK({ workerFactory: () => new Worker(elkWorkerUrl, { name: this.name }) });
    return this.elk.layout(graph);
  }

  stop(): void {
    this.elk?.terminateWorker();
    this.elk = undefined;
  }
}

const scope = self as unknown as LayoutWorkerScope;
const cores = scope.navigator.hardwareConcurrency ?? 2;
const engines: ElkEngine[] = Array.from(
  { length: Math.max(1, Math.min(3, Math.floor(cores / 2))) },
  (_, at) => new ElkWorker(`elk ${at + 1}`),
);
let done: Promise<void> = Promise.resolve();

scope.addEventListener('message', (event) => {
  const { id, input } = event.data;
  done = done.then(async () => {
    try {
      const result = await layOut(input, engines, {
        onProgress: (progress) => scope.postMessage({ id, kind: 'progress', progress }),
      });
      scope.postMessage({ id, kind: 'done', result });
    } catch (error) {
      scope.postMessage({ id, kind: 'failed', message: messageOf(error) });
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
