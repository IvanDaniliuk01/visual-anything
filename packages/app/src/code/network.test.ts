/**
 * Package code granted an origin (ADR 0063): `context.fetched` in `attributes` reads what the local
 * program fetched, never the page's network; the runner says what each package wants fetched, and
 * what its code makes of what came is live values, not computed ones. The app fetches each address
 * through the program while it is read, and sends those live values at most four times a second.
 */
import { codeHash, LIVE_FETCH_LIMITS } from '@visual-anything/core';
import type { QuickJSWASMModule } from 'quickjs-emscripten-core';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadNodeEngine } from './engine-node';
import type { CodeReply, ElementAnswers, RunPackage, WantedAddress } from './messages';
import { PackageLiveValues, PackageNetwork, SEND_EVERY_MS } from './network';
import { CodeRunner } from './runner';
import { CodeSandbox } from './sandbox';
import { codeProject, gaugesPackage } from './test/project';

let engine: QuickJSWASMModule;

beforeAll(async () => {
  engine = await loadNodeEngine();
});

const ORIGIN = 'network:https://status.example.com';

const STATUS_CODE = [
  'export function attributes(element, context) {',
  '  const got = context.fetched("https://status.example.com/ovens#now", { every: 10 });',
  '  if (got === undefined) return { reading: "waiting" };',
  '  const all = JSON.parse(got.text);',
  '  return { reading: all[element.id] ?? null, status: got.status };',
  '}',
];

function runPackage(code: string[], granted: string[], declared = granted): RunPackage {
  return {
    package: 'gauges',
    name: 'Gauges',
    hash: codeHash(code, declared),
    code: code.join('\n'),
    granted,
    declared,
    stops: 0,
  };
}

function harness() {
  const replies: CodeReply[] = [];
  const runner = new CodeRunner({
    newSandbox: () => Promise.resolve(new CodeSandbox(engine, { callMs: 250 })),
    post: (reply) => replies.push(reply),
    pause: () => Promise.resolve(),
  });
  const elements = new Map<string, ElementAnswers>();
  const wanted: WantedAddress[][] = [];
  const absorb = () => {
    for (const reply of replies.splice(0)) {
      if (reply.kind === 'network') wanted.push(reply.wanted);
      if (reply.kind !== 'answers') continue;
      for (const each of reply.elements) elements.set(each.element, each);
      for (const each of reply.cleared) elements.delete(each);
    }
  };
  return {
    elements,
    wanted,
    async run(...requests: Parameters<CodeRunner['receive']>[0][]) {
      for (const request of requests) runner.receive(request);
      await runner.settled();
      absorb();
    },
  };
}

describe('context.fetched in the worker', () => {
  it('says what the code wants fetched, and makes live values of what came', async () => {
    const it = harness();
    const code = STATUS_CODE;
    await it.run(
      { kind: 'project', project: codeProject(gaugesPackage(code, [ORIGIN])) },
      { kind: 'packages', packages: [runPackage(code, [ORIGIN])] },
    );
    // Nothing fetched yet: what it answers is computed, as any other call's.
    expect(it.elements.get('oven')?.attributes).toEqual([
      { name: 'reading', value: 'waiting', package: 'gauges' },
    ]);
    expect(it.elements.get('oven')?.live).toBeUndefined();
    expect(it.wanted).toEqual([[{ url: 'https://status.example.com/ovens', every: 10_000 }]]);

    await it.run({
      kind: 'fetched',
      package: 'gauges',
      url: 'https://status.example.com/ovens',
      response: { status: 200, text: '{"oven": 212}' },
    });
    const oven = it.elements.get('oven');
    expect(oven?.attributes).toEqual([]);
    expect(oven?.live).toEqual({
      values: [
        { name: 'reading', value: 212, package: 'gauges' },
        { name: 'status', value: 200, package: 'gauges' },
      ],
      freshFor: 20_000,
    });

    // The same answer again calls nothing again.
    const before = it.elements.get('oven');
    await it.run({
      kind: 'fetched',
      package: 'gauges',
      url: 'https://status.example.com/ovens',
      response: { status: 200, text: '{"oven": 212}' },
    });
    expect(it.elements.get('oven')).toBe(before);
  });

  it('refuses an origin not granted, and more addresses than its cap', async () => {
    const it = harness();
    const code = [
      'export function attributes(element, context) {',
      '  const said = [];',
      '  try { context.fetched("https://other.example.com/x"); } catch (error) { said.push(String(error.message)); }',
      '  for (let i = 0; i < 20; i += 1) {',
      '    try { context.fetched("https://status.example.com/" + i); } catch (error) { said.push("cap " + i); }',
      '  }',
      '  return { said: said.join("|") };',
      '}',
    ];
    await it.run(
      { kind: 'project', project: codeProject(gaugesPackage(code, [ORIGIN])) },
      { kind: 'packages', packages: [runPackage(code, [ORIGIN])] },
    );
    const said = it.elements.get('oven')?.attributes[0]?.value as string;
    expect(said).toContain('https://other.example.com/x is not on an origin granted');
    const capped = said.split('|').filter((each) => each.startsWith('cap '));
    expect(capped).toHaveLength(20 - LIVE_FETCH_LIMITS.urls);
    expect(it.wanted.at(-1)).toHaveLength(LIVE_FETCH_LIMITS.urls);
  });

  it('gives no context.fetched without an origin granted, nor to check or draw', async () => {
    const it = harness();
    const code = [
      'export function attributes(element, context) { return { has: typeof context.fetched }; }',
      'export function check(element, context) { return typeof context.fetched === "undefined" ? [] : ["has it"]; }',
    ];
    await it.run(
      { kind: 'project', project: codeProject(gaugesPackage(code, [ORIGIN])) },
      { kind: 'packages', packages: [runPackage(code, [], [ORIGIN])] },
    );
    expect(it.elements.get('oven')?.attributes).toEqual([
      { name: 'has', value: 'undefined', package: 'gauges' },
    ]);
    expect(it.elements.get('oven')?.problems ?? []).toEqual([]);
    expect(it.wanted).toEqual([]);
  });

  it('never lets the code reach the page’s own fetch', async () => {
    const it = harness();
    const code = [
      'export function attributes(element, context) {',
      '  return { fetch: typeof globalThis.fetch, xhr: typeof globalThis.XMLHttpRequest };',
      '}',
    ];
    await it.run(
      { kind: 'project', project: codeProject(gaugesPackage(code, [ORIGIN])) },
      { kind: 'packages', packages: [runPackage(code, [ORIGIN])] },
    );
    expect(it.elements.get('oven')?.attributes).toEqual([
      { name: 'fetch', value: 'undefined', package: 'gauges' },
      { name: 'xhr', value: 'undefined', package: 'gauges' },
    ]);
  });
});

describe('PackageNetwork', () => {
  function clock() {
    const timers: { ms: number; task: () => void; cancelled: boolean }[] = [];
    return {
      timers,
      later: (task: () => void, ms: number) => {
        const timer = { ms, task, cancelled: false };
        timers.push(timer);
        return {
          cancel: () => {
            timer.cancelled = true;
          },
        };
      },
    };
  }

  it('fetches what is wanted at once and again every so often, until it is no longer', async () => {
    const { timers, later } = clock();
    const fetch = vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        answer: { type: 'live/fetched' as const, requestId: 'r', status: 200, text: '1' },
      }),
    );
    const deliver = vi.fn();
    const network = new PackageNetwork({ fetch, deliver, tell: () => {}, later });
    network.want('gauges', [{ url: 'https://status.example.com/a', every: 10_000 }]);
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));
    expect(deliver).toHaveBeenCalledWith({
      kind: 'fetched',
      package: 'gauges',
      url: 'https://status.example.com/a',
      response: { status: 200, text: '1' },
    });
    expect(timers.map((each) => each.ms)).toEqual([10_000]);
    timers[0]?.task();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    network.want('gauges', []);
    expect(timers.at(-1)?.cancelled ?? true).toBe(true);
  });

  it('says once why an address could not be fetched', async () => {
    const tell = vi.fn();
    const network = new PackageNetwork({
      fetch: () =>
        Promise.resolve({
          ok: false as const,
          problems: [{ code: 'fetch-refused' as const, message: 'No.' }],
        }),
      deliver: () => {},
      tell,
      later: () => ({ cancel: () => {} }),
    });
    network.want('gauges', [{ url: 'https://a.example/1', every: 5_000 }]);
    network.want('gauges', [
      { url: 'https://a.example/1', every: 5_000 },
      { url: 'https://a.example/2', every: 5_000 },
    ]);
    await vi.waitFor(() => expect(tell).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(tell).toHaveBeenCalledTimes(1);
  });
});

describe('PackageLiveValues', () => {
  it('sends the latest of each value at most four times a second, a thousand to a message', () => {
    let pending: (() => void) | undefined;
    const send = vi.fn();
    const values = new PackageLiveValues({
      send,
      later: (task, ms) => {
        expect(ms).toBe(SEND_EVERY_MS);
        pending = task;
        return { cancel: () => (pending = undefined) };
      },
    });
    for (let i = 0; i < 1500; i += 1) values.add('gauges', 20_000, `e${i}`, 'reading', i);
    values.add('gauges', 20_000, 'e0', 'reading', 'latest');
    expect(send).not.toHaveBeenCalled();
    pending?.();
    expect(send.mock.calls.map((call) => (call[1] as unknown[]).length)).toEqual([1000, 500]);
    expect((send.mock.calls[0]?.[1] as unknown[])[0]).toEqual({
      target: 'e0',
      attribute: 'reading',
      value: 'latest',
    });
  });
});
