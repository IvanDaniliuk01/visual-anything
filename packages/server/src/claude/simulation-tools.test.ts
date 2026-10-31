/**
 * Claude's tools for simulations (ADR 0085), the whole way from an MCP client through the bridge to
 * the program, on the sample that simulates: reading what an element simulates and whether its code
 * is approved, and the guidance that shows a simulation in the app, recording nothing.
 */
import { resolve } from 'node:path';
import { packageCodeOf, type CodeApproval, type ProjectSnapshot } from '@visual-anything/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openSession } from '../session';
import { startToolHarness, type ToolHarness } from './tool-harness';

const SAMPLE = resolve(import.meta.dirname, '../../../../examples/simulate');

let sample: ProjectSnapshot;
let tools: ToolHarness;
let approvals: CodeApproval[];

beforeAll(async () => {
  const opened = await openSession(SAMPLE, { watch: false, out: () => {}, err: () => {} });
  if (!opened.ok) throw new Error('The sample that simulates does not open.');
  sample = opened.session.snapshot;
  await opened.session.close();
});

beforeEach(async () => {
  approvals = [];
  tools = await startToolHarness(sample, { codeApprovals: () => approvals });
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
