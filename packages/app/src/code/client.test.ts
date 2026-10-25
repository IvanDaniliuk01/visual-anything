import { describe, expect, it } from 'vitest';
import { CodeHost, NO_ANSWERS, type CodeWorkerLike } from './client';
import type { CodeReply, CodeRequest } from './messages';
import { codeProject } from './test/project';

/** A worker that keeps what it is sent and answers when told to. */
class FakeWorker implements CodeWorkerLike {
  readonly sent: CodeRequest[] = [];
  terminated = false;
  private onMessage: ((event: MessageEvent<CodeReply>) => void) | undefined;
  private onError: ((event: Event) => void) | undefined;
  postMessage(message: CodeRequest): void {
    this.sent.push(message);
  }
  addEventListener(type: 'message' | 'error', listener: (event: never) => void): void {
    if (type === 'message') this.onMessage = listener as (event: MessageEvent<CodeReply>) => void;
    else this.onError = listener as (event: Event) => void;
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(reply: CodeReply): void {
    this.onMessage?.({ data: reply } as MessageEvent<CodeReply>);
  }
  fail(): void {
    this.onError?.(new Event('error'));
  }
}

function harness() {
  const workers: FakeWorker[] = [];
  const timers: (() => void)[] = [];
  const host = new CodeHost(
    () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    {
      setTimer: (callback) => {
        timers.push(callback);
        return timers.length;
      },
      clearTimer: (timer) => {
        timers[(timer as number) - 1] = () => {};
      },
    },
  );
  return { host, workers, fireWatchdog: () => timers.at(-1)?.() };
}

const project = codeProject();
const gauges = { package: 'gauges', name: 'Gauges', hash: 'a'.repeat(64), code: 'x', granted: [] };

describe('the code host', () => {
  it('starts no worker while the project has no approved code', () => {
    const { host, workers } = harness();
    host.update({ project, packages: [], view: 'kitchen', scale: 1, shown: [] });
    expect(workers).toHaveLength(0);
    expect(host.current()).toBe(NO_ANSWERS);
  });

  it('sends the project, the packages and the view once each, and then only what changed', () => {
    const { host, workers } = harness();
    const input = { project, packages: [gauges], view: 'kitchen', scale: 1, shown: ['oven'] };
    host.update(input);
    host.update(input);
    expect(workers[0]?.sent.map((each) => each.kind)).toEqual(['project', 'packages', 'view']);
    host.update({ ...input, scale: 2 });
    expect(workers[0]?.sent.map((each) => each.kind)).toEqual([
      'project',
      'packages',
      'view',
      'view',
    ]);
  });

  it('keeps what the worker answers, with the drawings apart', () => {
    const { host, workers } = harness();
    host.update({ project, packages: [gauges], view: 'kitchen', scale: 1, shown: ['oven'] });
    const drawing = { width: 10, height: 10, items: [] };
    workers[0]?.reply({
      kind: 'answers',
      elements: [{ element: 'oven', attributes: [], problems: [], drawing }],
      cleared: [],
      packages: [{ package: 'gauges', state: 'running', hooks: ['draw'], stops: 0 }],
    });
    expect(host.current().drawings.get('oven')).toEqual(drawing);
    expect(host.current().packages.get('gauges')?.state).toBe('running');
    workers[0]?.reply({ kind: 'answers', elements: [], cleared: ['oven'], packages: [] });
    expect(host.current().drawings.size).toBe(0);
    expect(host.current().elements.size).toBe(0);
  });

  it('stops a silent worker, counts a stop for the package it ran, and starts again', () => {
    const { host, workers, fireWatchdog } = harness();
    host.update({ project, packages: [gauges], view: undefined, scale: 1, shown: [] });
    workers[0]?.reply({
      kind: 'answers',
      calling: 'gauges',
      elements: [],
      cleared: [],
      packages: [],
    });
    fireWatchdog();
    expect(workers[0]?.terminated).toBe(true);
    expect(workers).toHaveLength(2);
    const packages = workers[1]?.sent.find((each) => each.kind === 'packages');
    expect(packages).toMatchObject({ packages: [{ package: 'gauges', stops: 1 }] });
    expect(host.current().packages.get('gauges')).toMatchObject({
      stops: 1,
      problem: { code: 'code-stopped' },
    });
    // A worker that fails is started again the same way.
    workers[1]?.reply({
      kind: 'answers',
      calling: 'gauges',
      elements: [],
      cleared: [],
      packages: [],
    });
    workers[1]?.fail();
    expect(workers).toHaveLength(3);
    expect(workers[2]?.sent.find((each) => each.kind === 'packages')).toMatchObject({
      packages: [{ stops: 2 }],
    });
  });

  it('lets an idle worker be, and stops it when no approved code is left', () => {
    const { host, workers } = harness();
    host.update({ project, packages: [gauges], view: undefined, scale: 1, shown: [] });
    workers[0]?.reply({ kind: 'idle' });
    host.update({ project, packages: [], view: undefined, scale: 1, shown: [] });
    expect(workers[0]?.terminated).toBe(true);
    expect(host.current()).toBe(NO_ANSWERS);
  });
});
