import { CODE_LIMITS, stalledProblem } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { CodeHost, NO_ANSWERS, STARTING_MS, WATCHDOG_MS, type CodeWorkerLike } from './client';
import { CodeStore } from './context';
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
  const delays: number[] = [];
  const host = new CodeHost(
    () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    {
      setTimer: (callback, ms) => {
        delays.push(ms);
        timers.push(callback);
        return timers.length;
      },
      clearTimer: (timer) => {
        timers[(timer as number) - 1] = () => {};
      },
    },
  );
  return { host, workers, delays, fireWatchdog: () => timers.at(-1)?.() };
}

const project = codeProject();
const gauges = {
  package: 'gauges',
  name: 'Gauges',
  hash: 'a'.repeat(64),
  code: 'x',
  declared: [],
  granted: [],
};

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

  it('gives a new worker time to make its interpreter, and then the watchdog’s', () => {
    const { host, workers, delays } = harness();
    host.update({ project, packages: [gauges], view: undefined, scale: 1, shown: [] });
    expect(delays.at(-1)).toBe(STARTING_MS);
    workers[0]?.reply({
      kind: 'answers',
      calling: 'gauges',
      elements: [],
      cleared: [],
      packages: [],
    });
    expect(delays.at(-1)).toBe(WATCHDOG_MS);
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

describe('the code host’s calls of the hooks that add to the app', () => {
  const clinic = {
    ...gauges,
    extensions: { importers: [{ id: 'lines', label: 'Lines', extensions: ['.txt'] }] },
  };
  const started = () => {
    const it = harness();
    it.host.update({ project, packages: [clinic], view: undefined, scale: 1, shown: [] });
    it.workers[0]?.reply({ kind: 'idle' });
    return it;
  };
  const callsSent = (worker: FakeWorker | undefined) =>
    worker?.sent.filter((each) => each.kind === 'extension/call') ?? [];

  it('sends a call to the worker and answers what it answered, once', async () => {
    const { host, workers } = started();
    const asked = host.runPackageAction('gauges', { action: 'sort', selection: ['oven'] });
    expect(callsSent(workers[0])).toEqual([
      {
        kind: 'extension/call',
        call: 1,
        package: 'gauges',
        hook: 'act',
        input: { action: 'sort', selection: ['oven'] },
      },
    ]);
    const value = { label: 'Sort', commands: [] };
    workers[0]?.reply({ kind: 'extension/answer', call: 1, answer: { ok: true, value } });
    workers[0]?.reply({ kind: 'extension/answer', call: 1, answer: { ok: true, value: 'again' } });
    await expect(asked).resolves.toEqual({ ok: true, value });
    const panel = host.packagePanel('gauges', { panel: 'health', element: 'oven' });
    const written = host.writeFileWithPackage('gauges', { exporter: 'ddl' });
    expect(callsSent(workers[0]).map((each) => [each.call, each.hook])).toEqual([
      [1, 'act'],
      [2, 'panel'],
      [3, 'exportFile'],
    ]);
    workers[0]?.reply({ kind: 'extension/answer', call: 3, answer: { ok: true, value: 'CREATE' } });
    workers[0]?.reply({ kind: 'extension/answer', call: 2, answer: { ok: true, value: [] } });
    await expect(written).resolves.toEqual({ ok: true, value: 'CREATE' });
    await expect(panel).resolves.toEqual({ ok: true, value: [] });
  });

  it('refuses at once code that is not approved, and a file too long to send', async () => {
    const { host, workers } = started();
    await expect(
      host.runPackageAction('other', { action: 'sort', selection: [] }),
    ).resolves.toMatchObject({ ok: false, problem: { code: 'code-not-approved' } });
    const long = await host.readFileWithPackage('gauges', {
      importer: 'lines',
      name: 'huge.txt',
      text: 'x'.repeat(CODE_LIMITS.importText + 1),
    });
    expect(long.ok ? '' : long.problem.message).toContain(
      'the importer "Lines" of the package "Gauges"',
    );
    expect(callsSent(workers[0])).toEqual([]);
    // Without a worker, as when no code is approved, nothing runs.
    const idle = harness();
    await expect(
      idle.host.packagePanel('gauges', { panel: 'health', element: 'oven' }),
    ).resolves.toMatchObject({ ok: false, problem: { code: 'code-not-approved' } });
  });

  it('waits the hook’s time longer while a call runs, and answers a call that stalled', async () => {
    const { host, workers, delays, fireWatchdog } = started();
    const slow = host.runPackageAction('gauges', { action: 'slow', selection: [] });
    const waiting = host.packagePanel('gauges', { panel: 'health', element: 'oven' });
    workers[0]?.reply({ kind: 'extension/running', call: 1, package: 'gauges', hook: 'act' });
    expect(delays.at(-1)).toBe(CODE_LIMITS.extensionCallMs + WATCHDOG_MS);
    fireWatchdog();
    await expect(slow).resolves.toEqual({
      ok: false,
      problem: stalledProblem({ id: 'gauges', name: 'Gauges' }),
    });
    // The new worker gets the call that waited, and the stop counted.
    expect(workers).toHaveLength(2);
    expect(workers[1]?.sent.find((each) => each.kind === 'packages')).toMatchObject({
      packages: [{ package: 'gauges', stops: 1 }],
    });
    expect(callsSent(workers[1]).map((each) => [each.call, each.hook])).toEqual([[2, 'panel']]);
    workers[1]?.reply({ kind: 'extension/running', call: 2, package: 'gauges', hook: 'panel' });
    expect(delays.at(-1)).toBe(CODE_LIMITS.callMs + WATCHDOG_MS);
    workers[1]?.reply({ kind: 'extension/answer', call: 2, answer: { ok: true, value: [] } });
    expect(delays.at(-1)).toBe(WATCHDOG_MS);
    await expect(waiting).resolves.toEqual({ ok: true, value: [] });
  });

  it('answers the calls that wait when no approved code is left', async () => {
    const { host } = started();
    const asked = host.runPackageAction('gauges', { action: 'sort', selection: [] });
    host.update({ project, packages: [], view: undefined, scale: 1, shown: [] });
    await expect(asked).resolves.toMatchObject({
      ok: false,
      problem: { code: 'code-not-approved' },
    });
  });
});

describe('the store’s calls of the hooks that add to the app', () => {
  it('go to the host lent, and say the code is not approved without one', async () => {
    const store = new CodeStore();
    await expect(
      store.calls.runPackageAction('gauges', { action: 'sort', selection: [] }),
    ).resolves.toMatchObject({ ok: false, problem: { code: 'code-not-approved' } });
    const { host, workers } = harness();
    host.update({ project, packages: [gauges], view: undefined, scale: 1, shown: [] });
    const giveBack = store.lendCalls(host);
    const asked = store.calls.writeFileWithPackage('gauges', { exporter: 'ddl' });
    workers[0]?.reply({ kind: 'extension/answer', call: 1, answer: { ok: true, value: 'x' } });
    await expect(asked).resolves.toEqual({ ok: true, value: 'x' });
    giveBack();
    await expect(
      store.calls.packagePanel('gauges', { panel: 'health', element: 'oven' }),
    ).resolves.toMatchObject({ ok: false });
    expect(workers[0]?.sent.filter((each) => each.kind === 'extension/call')).toHaveLength(1);
  });
});
