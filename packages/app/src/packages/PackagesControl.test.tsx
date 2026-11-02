/**
 * "Packages…" (ADR 0089): the dialog lists the project's packages with what each adds and where its
 * code stands, reaches the approval flow, turns code off on this computer, and adds or updates a
 * package from a file the local program read and checked, asking for approval again when the code
 * changed.
 */
import {
  builtinPackage,
  definitionsIn,
  executeCommand,
  packageCodeOf,
  withApproval,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { PackageFile } from '@visual-anything/schema';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeApproval } from '../code/ApprovalDialog';
import { CodeStore } from '../code/context';
import { codeProject, gaugesPackage } from '../code/test/project';
import { usePackageCode } from '../code/usePackageCode';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EMPTY_SELECTION } from '../editor/selection';
import { translateMessage } from '../i18n/translate';
import { LiveContext, type Live } from '../live/context';
import { appliedPreferences, changePreferences, resetPreferencesForTests } from '../theme/store';
import { PackagesControl } from './PackagesControl';

afterEach(() => {
  resetPreferencesForTests();
});

const METERS: PackageFile = {
  id: 'meters',
  name: 'Meters',
  version: '1.0.0',
  components: [{ id: 'meters.meter', name: 'Meter', derivesFrom: 'essence' }],
  relationTypes: [],
  code: ['export function act() { return { commands: [] }; }'],
  capabilities: ['model:read'],
  extensions: {
    actions: [{ id: 'tidy', label: 'Tidy the meters', where: ['packages-menu'] }],
    exporters: [{ id: 'csv', label: 'Meters as CSV', extension: '.csv' }],
  },
};

type ReadPackageFile = NonNullable<Live['readPackageFile']>;

function Harness({
  project,
  send,
  readPackageFile,
}: {
  project: ProjectSnapshot;
  send: (command: Command) => Promise<{ ok: true; created: string[]; warnings: [] }>;
  readPackageFile: ReadPackageFile;
}) {
  const [store] = useState(() => new CodeStore());
  usePackageCode({
    store,
    project,
    viewId: undefined,
    scene: undefined,
    canvas: undefined,
    makeHost: () => undefined,
  });
  const editor: Editor = {
    project,
    definitions: definitionsIn(project),
    viewId: undefined,
    scene: undefined,
    selection: EMPTY_SELECTION,
    select: () => {},
    send,
    reveal: () => {},
    code: store,
  };
  const live = { status: 'open', readPackageFile } as unknown as Live;
  return (
    <LiveContext value={live}>
      <EditorContext.Provider value={editor}>
        <PackagesControl />
        <CodeApproval />
      </EditorContext.Provider>
    </LiveContext>
  );
}

function setUp(project: ProjectSnapshot, readPackageFile: ReadPackageFile = vi.fn()) {
  const send = vi.fn<(command: Command) => Promise<{ ok: true; created: string[]; warnings: [] }>>(
    () => Promise.resolve({ ok: true, created: [], warnings: [] }),
  );
  const view = render(<Harness project={project} send={send} readPackageFile={readPackageFile} />);
  fireEvent.click(screen.getByRole('button', { name: 'Packages…' }));
  const rerender = (next: ProjectSnapshot) =>
    view.rerender(<Harness project={next} send={send} readPackageFile={readPackageFile} />);
  return { send, rerender };
}

function packagesDialog(): HTMLElement {
  return screen.getByRole('dialog', { name: 'Packages' });
}

function item(name: string): HTMLElement {
  return within(packagesDialog()).getByRole('article', { name });
}

async function choose(text: string, name = 'a.vapackage') {
  const input = screen.getByTestId('package-file');
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File([text], name)] } });
    await Promise.resolve();
  });
}

const read = (file: PackageFile): ReadPackageFile =>
  vi.fn(() =>
    Promise.resolve({
      ok: true as const,
      answer: { type: 'package/read-answer' as const, requestId: 'r', package: file },
    }),
  );

describe('Packages…', () => {
  it('lists the project’s packages, built in and its own, with what each adds and its code', () => {
    const systems = builtinPackage('systems')!;
    const project = codeProject({ ...gaugesPackage(), extensions: METERS.extensions });
    setUp({ ...project, packages: [systems, ...project.packages] });

    const list = within(packagesDialog()).getByRole('list', { name: 'Packages of the project' });
    expect(within(list).getAllByRole('article')).toHaveLength(2);
    const builtIn = item('Systems');
    expect(builtIn.textContent).toContain('Built-in package');
    expect(builtIn.textContent).toContain('No code.');
    expect(within(builtIn).queryByRole('checkbox')).toBeNull();

    const own = item('Gauges');
    expect(own.textContent).toContain('The project’s own');
    expect(own.textContent).toContain('1 component and 2 relation types');
    expect(own.textContent).toContain('ActionsTidy the meters');
    expect(own.textContent).toContain('ExportersMeters as CSV');
    expect(own.textContent).toContain('Its code waits for approval, so it does not run.');
    expect(within(own).getByRole('button', { name: 'Review and approve the code…' })).toBeTruthy();
    expect(
      within(own).getByRole<HTMLInputElement>('checkbox', {
        name: 'Run its code on this computer',
      }).checked,
    ).toBe(true);
  });

  it('says code approved once the person approved it, and turns it off and on as a preference', () => {
    const project = codeProject();
    const code = packageCodeOf(project.packages[0]!)!;
    changePreferences({
      codeApprovals: withApproval([], { hash: code.hash, package: 'gauges', capabilities: [] }),
    });
    setUp(project);
    expect(item('Gauges').textContent).toContain('Approved: it runs once the worker starts.');
    expect(within(item('Gauges')).getByRole('button', { name: 'Review the code…' })).toBeTruthy();

    fireEvent.click(within(item('Gauges')).getByRole('checkbox'));
    expect(appliedPreferences().preferences.codeTurnedOff).toEqual(['gauges']);
    expect(item('Gauges').textContent).toContain('Turned off on this computer');
    fireEvent.click(within(item('Gauges')).getByRole('checkbox'));
    expect(appliedPreferences().preferences.codeTurnedOff).toEqual([]);
  });

  it('opens the approval dialog over it, and comes back to the button once it closes', () => {
    setUp(codeProject());
    const review = within(item('Gauges')).getByRole('button', {
      name: 'Review and approve the code…',
    });
    fireEvent.click(review);
    expect(screen.queryByRole('dialog', { name: 'Packages' })).toBeNull();
    const approval = screen.getByRole('dialog', { name: 'The code of “Gauges”' });
    fireEvent.click(within(approval).getByRole('button', { name: 'Cancel' }));
    expect(packagesDialog()).toBeTruthy();
    expect(document.activeElement).toBe(review);
  });

  it('says what to do when the project uses no package', () => {
    setUp({ ...codeProject(), packages: [] });
    expect(packagesDialog().textContent).toContain(
      'This project uses no package yet. Add one from a package file or a folder below.',
    );
  });

  it('adds a package from a file the local program read, its code waiting for approval', async () => {
    const readPackageFile = read(METERS);
    const { send } = setUp(codeProject(), readPackageFile);
    await choose(JSON.stringify(METERS), 'meters.vapackage');
    expect(readPackageFile).toHaveBeenCalledWith('meters.vapackage', JSON.stringify(METERS));
    const dialog = packagesDialog();
    await waitFor(() => expect(dialog.textContent).toContain('Add “Meters”'));
    expect(dialog.textContent).toContain(
      'It holds code, which runs only once you approve it, after reading it.',
    );
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add this package' }));
      await Promise.resolve();
    });
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]![0];
    expect(command).toMatchObject({
      type: 'batch',
      commands: [
        { type: 'add-package', package: { id: 'meters' } },
        { type: 'set-package-code', package: 'meters', code: METERS.code },
      ],
    });
    await waitFor(() => expect(dialog.textContent).toContain('Added “Meters”.'));
  });

  it('refuses a file the schema refuses, with the schema’s message, in Spanish too', async () => {
    const problem = 'In the package file, /name must not be empty.';
    const readPackageFile = vi.fn<ReadPackageFile>(() =>
      Promise.resolve({ ok: false, problems: [{ code: 'invalid-command', message: problem }] }),
    );
    const { send } = setUp(codeProject(), readPackageFile);
    await choose('{"id": "x", "name": ""}');
    const alert = await within(packagesDialog()).findByRole('alert');
    expect(alert.textContent).toContain('a.vapackage cannot be added:');
    expect(alert.textContent).toContain(problem);
    expect(send).not.toHaveBeenCalled();
    expect(translateMessage('es', problem)).toBe(
      'En el archivo del paquete, /name no debe estar vacío.',
    );
  });

  it('refuses a file over 2 MiB without sending it', async () => {
    const readPackageFile = vi.fn<ReadPackageFile>();
    setUp(codeProject(), readPackageFile);
    await choose('x'.repeat(2 * 1024 * 1024 + 1), 'big.vapackage');
    const alert = await within(packagesDialog()).findByRole('alert');
    expect(alert.textContent).toContain('The file big.vapackage is over 2 MiB.');
    expect(readPackageFile).not.toHaveBeenCalled();
  });

  it('updates the project’s own package from a newer file, asking for approval again', async () => {
    const project = codeProject();
    const code = packageCodeOf(project.packages[0]!)!;
    changePreferences({
      codeApprovals: withApproval([], { hash: code.hash, package: 'gauges', capabilities: [] }),
    });
    const newer: PackageFile = {
      ...gaugesPackage(['export function check() { return []; }']),
      version: '2.0.0',
    };
    const { send, rerender } = setUp(project, read(newer));
    await choose(JSON.stringify(newer), 'gauges.vapackage');
    const dialog = packagesDialog();
    await waitFor(() => expect(dialog.textContent).toContain('Update “Gauges”'));
    expect(dialog.textContent).toContain(
      'Its code changed, so it asks for your approval again before it runs.',
    );
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Apply the update' }));
      await Promise.resolve();
    });
    const command = send.mock.calls[0]![0];
    expect(command).toMatchObject({ type: 'batch', commands: [{ type: 'replace-package' }, {}] });

    // The program applies it; the project comes back with the new code, which waits again.
    const outcome = executeCommand(project, command);
    if (!outcome.ok) throw new Error('The update was refused.');
    rerender(outcome.state);
    expect(item('Gauges').textContent).toContain('Version 2.0.0');
    expect(item('Gauges').textContent).toContain(
      'Its code waits for approval, so it does not run.',
    );
  });

  it('closes with Escape, giving the focus back to its button', () => {
    setUp(codeProject());
    fireEvent.keyDown(packagesDialog(), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Packages' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Packages…' }));
  });
});
