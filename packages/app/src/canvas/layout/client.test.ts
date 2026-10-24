import ELK from 'elkjs/lib/elk.bundled.js';
import { describe, expect, it } from 'vitest';
import { LayoutStopped, sharedRunner, workerRunner, type LayoutWorker } from './client';
import { layOut } from './engine';
import type { LayoutReply, LayoutRequest } from './messages';
import type { LayoutInput, LayoutProgress } from './types';

const elk = new ELK();

/** Answers as the layout worker does, in this thread, with its progress; or fails, when told to. */
class FakeWorker implements LayoutWorker {
  static started: FakeWorker[] = [];
  private readonly listeners = {
    message: [] as ((event: MessageEvent<LayoutReply>) => void)[],
    error: [] as ((event: Event) => void)[],
  };
  terminated = false;
  received: LayoutRequest[] = [];

  constructor(private readonly answer: 'layout' | 'refuse' | 'silent' = 'layout') {
    FakeWorker.started.push(this);
  }

  postMessage(message: LayoutRequest): void {
    this.received.push(message);
    if (this.answer === 'silent') return;
    const send = (reply: LayoutReply) => {
      for (const listener of this.listeners.message) {
        listener(new MessageEvent('message', { data: reply }));
      }
    };
    void (async () => {
      if (this.answer === 'refuse') {
        send({ id: message.id, kind: 'failed', message: 'ELK could not lay it out.' });
        return;
      }
      const result = await layOut(message.input, elk, {
        onProgress: (progress) => send({ id: message.id, kind: 'progress', progress }),
      });
      send({ id: message.id, kind: 'done', result });
    })();
  }

  addEventListener(type: 'message' | 'error', listener: (event: never) => void): void {
    (this.listeners[type] as unknown[]).push(listener);
  }

  fail(): void {
    for (const listener of this.listeners.error)
      listener(new ErrorEvent('error', { message: 'out of memory' }));
  }

  terminate(): void {
    this.terminated = true;
  }
}

const input: LayoutInput = {
  shapes: [
    { key: 'a', element: 'a', parent: -1, free: true, x: 0, y: 0, width: 160, height: 72 },
    { key: 'b', element: 'b', parent: -1, free: true, x: 0, y: 0, width: 160, height: 72 },
  ],
  relations: [{ relation: 'r', from: 0, to: 1 }],
  obstacles: [],
};

describe('workerRunner', () => {
  it('starts its worker with the first layout, and answers each layout with its own result', async () => {
    FakeWorker.started = [];
    const runner = workerRunner(() => new FakeWorker());
    expect(FakeWorker.started).toHaveLength(0);
    const [first, second] = await Promise.all([runner.layOut(input), runner.layOut(input)]);
    expect(FakeWorker.started).toHaveLength(1);
    expect(first?.shapes.map((shape) => shape.element)).toEqual(['a', 'b']);
    expect(second?.shapes).toEqual(first?.shapes);
    expect(FakeWorker.started[0]?.received.map((each) => each.id)).toEqual([1, 2]);
  });

  it('passes on how far a layout has come', async () => {
    const runner = workerRunner(() => new FakeWorker());
    const seen: LayoutProgress[] = [];
    await runner.layOut(input, { onProgress: (progress) => seen.push(progress) });
    expect(seen).toEqual([{ done: 1, total: 1 }]);
  });

  it('fails a layout the worker could not do, with its reason', async () => {
    const runner = workerRunner(() => new FakeWorker('refuse'));
    await expect(runner.layOut(input)).rejects.toThrow('ELK could not lay it out.');
  });

  it('stops a layout by stopping its worker, and starts a new one for the next layout', async () => {
    FakeWorker.started = [];
    const answers: ('silent' | 'layout')[] = ['silent', 'layout'];
    const runner = workerRunner(() => new FakeWorker(answers.shift()));
    const stop = new AbortController();
    const waiting = runner.layOut(input, { signal: stop.signal });
    stop.abort();
    await expect(waiting).rejects.toBeInstanceOf(LayoutStopped);
    expect(FakeWorker.started[0]?.terminated).toBe(true);
    await expect(runner.layOut(input)).resolves.toMatchObject({ stats: { shapes: 2 } });
    expect(FakeWorker.started).toHaveLength(2);
    // Stopped before it is sent, a layout is not sent at all.
    const before = new AbortController();
    before.abort();
    await expect(runner.layOut(input, { signal: before.signal })).rejects.toBeInstanceOf(
      LayoutStopped,
    );
    expect(FakeWorker.started[1]?.received).toHaveLength(1);
  });

  it('fails what waits on a worker that stops, and starts a new one for the next layout', async () => {
    FakeWorker.started = [];
    const answers: ('silent' | 'layout')[] = ['silent', 'layout'];
    const runner = workerRunner(() => new FakeWorker(answers.shift()));
    const waiting = runner.layOut(input);
    FakeWorker.started[0]?.fail();
    await expect(waiting).rejects.toThrow('The layout worker failed: out of memory.');
    expect(FakeWorker.started[0]?.terminated).toBe(true);
    await expect(runner.layOut(input)).resolves.toMatchObject({ stats: { shapes: 2 } });
    expect(FakeWorker.started).toHaveLength(2);
  });

  it('stops its worker and fails what waits when disposed', async () => {
    FakeWorker.started = [];
    const runner = workerRunner(() => new FakeWorker('silent'));
    const waiting = runner.layOut(input);
    runner.dispose();
    await expect(waiting).rejects.toBeInstanceOf(LayoutStopped);
    expect(FakeWorker.started[0]?.terminated).toBe(true);
  });
});

describe('sharedRunner', () => {
  it('is off where the browser has no workers, rather than laying out on the main thread', () => {
    expect(typeof Worker).toBe('undefined');
    expect(sharedRunner()).toBeUndefined();
  });
});
