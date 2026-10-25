/**
 * Package code in the panels (ADR 0054): computed values with their mark, what `check` found, code
 * that does not run and why, and the approval dialog, which grants each capability on its own.
 */
import {
  codeHash,
  definitionsIn,
  packageCodeOf,
  type CodeStatus,
  type PackageCode,
} from '@visual-anything/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_SELECTION } from '../editor/selection';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { CodeApproval } from './ApprovalDialog';
import { CodeSection } from './CodeSection';
import { CodeStore } from './context';
import { PackageCodeSection } from './PackageCodeSection';
import { codeProject, gaugesPackage } from './test/project';

const pkg = gaugesPackage(undefined, ['model:read', 'network:https://status.example.com', 'time']);
const project = codeProject(pkg);
const code = packageCodeOf(pkg) as PackageCode;
const oven = project.model.elements.find((each) => each.id === 'oven')!;

function harness(status: CodeStatus) {
  const store = new CodeStore();
  const approve = vi.fn();
  const withdraw = vi.fn();
  store.setActions({ approve, withdraw });
  store.set({
    packages: new Map([['gauges', { code, status }]]),
    elements: new Map([
      [
        'oven',
        {
          element: 'oven',
          attributes: [{ name: 'fahrenheit', value: 212, package: 'gauges' }],
          problems: [{ code: 'code-check', message: 'Over 90 °C.', subjects: ['gauges', 'oven'] }],
        },
      ],
    ]),
    drawings: new Map(),
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
  render(
    <EditorContext.Provider value={editor}>
      <CodeSection element={oven} />
      <PackageCodeSection id="gauges" />
      <CodeApproval />
    </EditorContext.Provider>,
  );
  return { store, approve, withdraw };
}

describe('package code in the inspector', () => {
  it('shows computed values with their mark, and what check found', () => {
    harness({ state: 'approved', granted: ['time'] });
    const values = screen.getByRole('list', { name: 'Computed values' });
    expect(values.textContent).toContain('fahrenheit');
    expect(values.textContent).toContain('212');
    expect(screen.getAllByText('computed')[0]?.getAttribute('title')).toBe(
      'Computed by the code of “Gauges”, and never saved.',
    );
    expect(screen.getByRole('list', { name: 'Warnings' }).textContent).toBe(
      '“Gauges” finds: Over 90 °C.',
    );
  });

  it('says code that is not approved does not run, and opens the approval from there', () => {
    const { approve } = harness({ state: 'unapproved' });
    expect(
      screen.getAllByText('The code of “Gauges” is not approved, so it does not run.'),
    ).toHaveLength(2);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Review the code of “Gauges”…' }));
    });
    const dialog = screen.getByRole('dialog', { name: 'The code of “Gauges”' });
    expect(dialog.textContent).toContain(code.text.split('\n')[0]);
    expect(dialog.textContent).toContain(
      `hash ${codeHash(pkg.code ?? [], pkg.capabilities).slice(0, 12)}…`,
    );
    // Fetching from a web origin is off until the person turns it on; the rest is on.
    const network = screen.getByRole<HTMLInputElement>('checkbox', {
      name: /Fetch from https:\/\/status\.example\.com/,
    });
    expect(network.checked).toBe(false);
    act(() => {
      fireEvent.click(screen.getByRole('checkbox', { name: /Read the clock/ }));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Approve and run' }));
    });
    expect(approve).toHaveBeenCalledWith('gauges', ['model:read']);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says why approved code is off, and withdraws an approval from the dialog', () => {
    const { store, withdraw } = harness({ state: 'approved', granted: [] });
    act(() => {
      store.set({
        ...store.snapshot(),
        packages: new Map([
          [
            'gauges',
            {
              code,
              status: { state: 'approved', granted: [] },
              run: {
                package: 'gauges',
                state: 'off',
                hooks: [],
                stops: 3,
                problem: {
                  code: 'code-off',
                  message:
                    'The code of the package "Gauges" is off until the project opens again: its calls stopped 3 times in a row.',
                },
              },
            },
          ],
        ]),
      });
    });
    expect(
      screen.getAllByText(
        'The code of the package "Gauges" is off until the project opens again: its calls stopped 3 times in a row.',
      ),
    ).toHaveLength(2);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Review the code…' }));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Withdraw approval' }));
    });
    expect(withdraw).toHaveBeenCalledWith('gauges');
  });
});
