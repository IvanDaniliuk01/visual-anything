/**
 * An approval is of the code the person read (ADR 0054): code that changes while the dialog is open
 * is not approved by it, does not run, and shows in the dialog in its place, which says it changed.
 */
import { definitionsIn, packageCodeOf, type ProjectSnapshot } from '@visual-anything/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_SELECTION } from '../editor/selection';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { appliedPreferences, resetPreferencesForTests } from '../theme/store';
import { CodeApproval } from './ApprovalDialog';
import { CodeHost, type CodeWorkerLike } from './client';
import { CodeStore } from './context';
import type { CodeRequest } from './messages';
import { codeProject, gaugesPackage } from './test/project';
import { usePackageCode } from './usePackageCode';

afterEach(() => {
  resetPreferencesForTests();
});

/** Workers that keep what they are sent. */
function workers() {
  const sent: CodeRequest[] = [];
  const start = (): CodeWorkerLike => ({
    postMessage: (message) => sent.push(message),
    addEventListener: () => {},
    terminate: () => {},
  });
  return { sent, start };
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
  const editor: Editor = {
    project,
    definitions: definitionsIn(project),
    viewId: 'kitchen',
    scene: undefined,
    selection: EMPTY_SELECTION,
    select: () => {},
    send: undefined,
    reveal: () => {},
    code: store,
  };
  return (
    <EditorContext.Provider value={editor}>
      <CodeApproval />
    </EditorContext.Provider>
  );
}

describe('an approval', () => {
  it('approves nothing when the code changed under the dialog, which shows the new code', () => {
    const first = codeProject(gaugesPackage(['export function attributes() { return { a: 1 }; }']));
    const second = codeProject(
      gaugesPackage(['export function attributes() { return { stolen: globalThis.secret }; }']),
    );
    const shownFirst = packageCodeOf(first.packages[0]!)!;
    const { sent, start } = workers();
    const host = new CodeHost(start);
    let store: CodeStore | undefined;
    const view = render(<Harness project={first} host={host} onStore={(each) => (store = each)} />);
    act(() => store?.actions.review('gauges'));
    expect(screen.getByRole('dialog').textContent).toContain('return { a: 1 }');

    // The code changes while the dialog is open: an outside edit, a reload or Claude's write.
    view.rerender(<Harness project={second} host={host} onStore={(each) => (store = each)} />);
    // The approval of what the dialog showed before comes in: it approves nothing.
    let approved: boolean | undefined;
    act(() => {
      approved = store?.actions.approve('gauges', shownFirst.hash, shownFirst.capabilities, []);
    });
    expect(approved).toBe(false);
    expect(appliedPreferences().preferences.codeApprovals).toEqual([]);
    // The new code does not run: no worker was ever given a package.
    expect(sent.filter((each) => each.kind === 'packages')).toEqual([]);
    // The dialog shows the new code, and says that it changed.
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('globalThis.secret');
    expect(dialog.textContent).toContain(
      'The code changed while it was open here: this is the code as it is now, and nothing was approved.',
    );

    // Approving what it shows now approves that code, by its own hash, and only then it runs.
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Approve and run' }));
    });
    const shownSecond = packageCodeOf(second.packages[0]!)!;
    expect(appliedPreferences().preferences.codeApprovals).toEqual([
      { hash: shownSecond.hash, package: 'gauges', capabilities: [] },
    ]);
    expect(sent.find((each) => each.kind === 'packages')).toMatchObject({
      packages: [{ package: 'gauges', hash: shownSecond.hash }],
    });
    host.dispose();
  });
});
