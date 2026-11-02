/**
 * Turning a package's code off on this computer (ADR 0089's M14.2 clarification): a preference by
 * package id, which keeps the code from reaching the worker, approved or not, while the package stays
 * in the project; calls of what it adds answer that it is turned off.
 */
import { packageCodeOf, withApproval, type ProjectSnapshot } from '@visual-anything/core';
import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { appliedPreferences, changePreferences, resetPreferencesForTests } from '../theme/store';
import { CodeHost, type CodeWorkerLike } from './client';
import { CodeStore } from './context';
import type { CodeRequest } from './messages';
import { codeProject, gaugesPackage } from './test/project';
import { usePackageCode } from './usePackageCode';

afterEach(() => {
  resetPreferencesForTests();
});

function workers() {
  const sent: CodeRequest[] = [];
  const running = { count: 0 };
  const start = (): CodeWorkerLike => {
    running.count += 1;
    return {
      postMessage: (message) => sent.push(message),
      addEventListener: () => {},
      terminate: () => {
        running.count -= 1;
      },
    };
  };
  return { sent, start, running };
}

function Harness({
  project,
  host,
  onStore,
}: {
  project: ProjectSnapshot;
  host: CodeHost;
  onStore: (store: CodeStore) => void;
}) {
  const [store] = useState(() => new CodeStore());
  onStore(store);
  usePackageCode({
    store,
    project,
    viewId: 'kitchen',
    scene: undefined,
    canvas: undefined,
    makeHost: () => host,
  });
  return null;
}

/** The packages the worker was last told to run. */
function lastLoaded(sent: readonly CodeRequest[]): string[] | undefined {
  const last = sent.filter((each) => each.kind === 'packages').at(-1);
  return last?.kind === 'packages' ? last.packages.map((each) => each.package) : undefined;
}

describe('package code turned off on this computer', () => {
  it('never reaches the worker while off, approved or not, and runs again once on', async () => {
    const project = codeProject(gaugesPackage(['export function attributes() { return {}; }']));
    const code = packageCodeOf(project.packages[0]!)!;
    changePreferences({
      codeApprovals: withApproval([], { hash: code.hash, package: 'gauges', capabilities: [] }),
    });
    const { sent, start, running } = workers();
    const host = new CodeHost(start);
    let store: CodeStore | undefined;
    render(<Harness project={project} host={host} onStore={(each) => (store = each)} />);
    expect(lastLoaded(sent)).toEqual(['gauges']);
    expect(running.count).toBe(1);
    const told = sent.length;

    act(() => store?.actions.turnOff('gauges', true));
    expect(appliedPreferences().preferences.codeTurnedOff).toEqual(['gauges']);
    // With no code to run, the worker stops, and is told of no package.
    expect(running.count).toBe(0);
    expect(sent.slice(told).filter((each) => each.kind === 'packages')).toEqual([]);
    // The approval stays: turning off is not withdrawing.
    expect(appliedPreferences().preferences.codeApprovals).toHaveLength(1);
    const view = store?.snapshot().packages.get('gauges');
    expect(view).toMatchObject({ status: { state: 'approved' }, turnedOff: true });
    // What it adds answers that it is off, without asking the worker.
    const answer = await store?.calls.runPackageAction('gauges', {
      action: 'any',
      selection: { elements: [], relations: [] },
    } as never);
    expect(answer).toMatchObject({ ok: false, problem: { code: 'code-off' } });

    act(() => store?.actions.turnOff('gauges', false));
    expect(appliedPreferences().preferences.codeTurnedOff).toEqual([]);
    expect(running.count).toBe(1);
    expect(sent.slice(told).filter((each) => each.kind === 'packages')).toHaveLength(1);
    expect(lastLoaded(sent)).toEqual(['gauges']);
    host.dispose();
  });

  it('keeps code turned off from the worker before it is ever approved', () => {
    const project = codeProject(gaugesPackage(['export function check() { return []; }']));
    const code = packageCodeOf(project.packages[0]!)!;
    changePreferences({ codeTurnedOff: ['gauges'] });
    const { sent, start, running } = workers();
    const host = new CodeHost(start);
    let store: CodeStore | undefined;
    render(<Harness project={project} host={host} onStore={(each) => (store = each)} />);
    act(() => {
      store?.actions.approve('gauges', code.hash, code.capabilities, code.capabilities);
    });
    expect(appliedPreferences().preferences.codeApprovals).toHaveLength(1);
    expect(
      sent
        .filter((each) => each.kind === 'packages')
        .flatMap((each) => (each.kind === 'packages' ? each.packages : [])),
    ).toEqual([]);
    expect(running.count).toBe(0);
    host.dispose();
  });
});
