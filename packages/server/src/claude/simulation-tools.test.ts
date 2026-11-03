/**
 * Claude's tools for simulations (ADR 0085), the whole way from an MCP client through the bridge to
 * the program, on the sample that simulates: reading what an element simulates and whether its code
 * is approved, and the guidance that shows a simulation in the app, recording nothing.
 */
import { resolve } from 'node:path';
import { packageCodeOf, type CodeApproval, type ProjectSnapshot } from '@visual-anything/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { openSession } from '../session';
import { startToolHarness, type ToolHarness } from './tool-harness';

// These tests judge what runs answer, not the call limit (the app's sandbox tests judge that): the
// program's calls into package code may take 500 ms here, timed as the least of the clock and the
// process's time (the app's test/cpu.ts). On a loaded machine a run's first tick took 64 ms on both,
// past the 50 ms a call has, and the run failed for time.
vi.mock('@visual-anything/app/src/code/sandbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@visual-anything/app/src/code/sandbox')>();
  const { stopwatch } = await import('@visual-anything/app/src/test/cpu');
  class LeastTimedSandbox extends actual.CodeSandbox {
    constructor(...[module, options]: ConstructorParameters<typeof actual.CodeSandbox>) {
      super(module, { now: stopwatch(), callMs: 500, ...options });
    }
  }
  return { ...actual, CodeSandbox: LeastTimedSandbox };
});

const SAMPLE = resolve(import.meta.dirname, '../../../../examples/simulate');

let sample: ProjectSnapshot;
let tools: ToolHarness;
let approvals: CodeApproval[];
let turnedOff: string[];

beforeAll(async () => {
  const opened = await openSession(SAMPLE, { watch: false, out: () => {}, err: () => {} });
  if (!opened.ok) throw new Error('The sample that simulates does not open.');
  sample = opened.session.snapshot;
  await opened.session.close();
});

beforeEach(async () => {
  approvals = [];
  turnedOff = [];
  tools = await startToolHarness(sample, {
    codeApprovals: () => approvals,
    codeTurnedOff: () => turnedOff,
  });
}, 30_000);

afterEach(async () => {
  await tools.close();
});

/** What the person does in the app: approve the flow package's code as it is now. */
function approveAsPerson(): void {
  const file = tools.session.snapshot.packages.find((each) => each.id === 'flow');
  const code = file ? packageCodeOf(file) : undefined;
  if (!code) throw new Error('The flow package holds no code.');
  approvals = [{ hash: code.hash, package: 'flow', capabilities: ['model:read'] }];
}

describe('get_simulation', () => {
  it('reads what an element simulates, and says its code is not approved yet', async () => {
    const read = await tools.value('get_simulation', { element: 'audit-queue' });
    expect(read).toMatchObject({
      component: 'flow.queue',
      declaredBy: 'flow.queue',
      package: 'flow',
      tick: { length: 1, unit: 's' },
      ticks: 600,
      approved: false,
    });
    expect((read.parameters as { name: string }[]).map((each) => each.name)).toEqual([
      'arrivals',
      'workers',
      'cost',
      'bursts',
    ]);
    expect(read.why).toMatch(/Claude cannot approve it/);
    approveAsPerson();
    expect(await tools.value('get_simulation', { component: 'flow.case' })).toMatchObject({
      approved: true,
      ticks: 120,
    });
  });

  it('refuses what is not there, and what simulates nothing', async () => {
    expect(await tools.failure('get_simulation', { element: 'ghost' })).toContain(
      'There is no element "ghost"',
    );
    expect(await tools.failure('get_simulation', { element: 'requests' })).toContain(
      'simulates nothing',
    );
    expect(await tools.failure('get_simulation', {})).toBe('Name an element or a component.');
  });
});

describe('run_simulation', () => {
  it('runs only code the person approved as it is now', async () => {
    expect(await tools.failure('run_simulation', { element: 'audit-queue' })).toMatch(
      /not approved.*Claude cannot approve it/,
    );
  });

  it('runs nothing turned off on this computer, approved or not (ADR 0089, M14’s review)', async () => {
    approveAsPerson();
    turnedOff = ['flow'];
    expect(await tools.failure('run_simulation', { element: 'audit-queue' })).toMatch(
      /is turned off on this computer/,
    );
    expect(await tools.value('get_simulation', { element: 'audit-queue' })).toMatchObject({
      approved: false,
      why: expect.stringMatching(/is turned off on this computer/) as unknown,
    });
  });

  it('runs the sample’s code in QuickJS: a queue past its limit, with its numbers and ticks sampled', async () => {
    approveAsPerson();
    const run = await tools.value('run_simulation', {
      element: 'audit-queue',
      parameters: { arrivals: 50 },
    });
    const stop = run.stop as { kind: string; value: string; tick: number; why: string };
    expect(stop).toMatchObject({ kind: 'limit', value: 'queue', limit: 'max', limitValue: 5000 });
    expect(stop.why).toMatch(/queue went above its highest, 5000/);
    expect(run.ticks).toBe(stop.tick);
    const sampled = run.sampled as { tick: number }[];
    expect(sampled.length).toBe(200);
    expect(sampled.at(-1)?.tick).toBe(stop.tick - 1);
    const numbers = run.numbers as Record<string, { highest: number }>;
    expect(numbers.queue?.highest).toBeLessThanOrEqual(5000);
    // The same parameters and seed, the same run.
    expect(
      await tools.value('run_simulation', { element: 'audit-queue', parameters: { arrivals: 50 } }),
    ).toEqual(run);
  });

  it('moves an audit to its close through the states it holds, reading the model', async () => {
    approveAsPerson();
    const run = await tools.value('run_simulation', {
      element: 'an-audit',
      parameters: { strictness: 0 },
      from: 2,
    });
    expect(run.stop).toMatchObject({ kind: 'done', message: 'The case reached Closed.' });
    expect(run.from).toBe(2);
  });

  it('refuses parameters out of range, and what simulates nothing', async () => {
    approveAsPerson();
    expect(
      await tools.failure('run_simulation', { element: 'audit-queue', parameters: { workers: 0 } }),
    ).toBe('The parameter "workers" is below its lowest, 1.');
    expect(await tools.failure('run_simulation', { element: 'requests' })).toContain(
      'simulates nothing',
    );
  });
});

describe('show_simulation', () => {
  it('shows a simulation in the open app with its parameters, seed and tick, recording nothing', async () => {
    approveAsPerson();
    const app = await tools.openApp();
    const history = tools.session.history;
    const answer = await tools.value('show_simulation', {
      element: 'audit-queue',
      parameters: { arrivals: 50 },
      seed: 1,
      tick: 300,
      view: 'load',
    });
    expect(answer).toMatchObject({ shown: 1 });
    expect(answer).not.toHaveProperty('warnings');
    await tools.value('show_simulation', { element: 'audit-queue', play: true, speed: 'max' });
    await tools.value('show_simulation', { close: true });
    await expect
      .poll(() => tools.guidanceOf(app))
      .toEqual([
        {
          kind: 'simulation',
          element: 'audit-queue',
          parameters: { arrivals: 50 },
          tick: 300,
          view: 'load',
        },
        { kind: 'simulation', element: 'audit-queue', play: true, speed: 'max' },
        { kind: 'simulation', close: true },
      ]);
    expect(tools.session.history).toEqual(history);
  });

  it('warns that code not approved does not run, and refuses parameters out of range', async () => {
    const answer = await tools.value('show_simulation', { element: 'audit-queue' });
    expect(answer.warnings).toEqual([expect.stringMatching(/not approved/)]);
    expect(
      await tools.failure('show_simulation', {
        element: 'audit-queue',
        parameters: { arrivals: 900 },
      }),
    ).toBe('The parameter "arrivals" is above its highest, 200.');
    expect(await tools.failure('show_simulation', { close: true, element: 'audit-queue' })).toBe(
      'close: true takes nothing else.',
    );
    expect(await tools.failure('show_simulation', { element: 'requests' })).toContain(
      'simulates nothing',
    );
  });
});
