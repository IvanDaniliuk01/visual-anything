import type { Command, ProjectSnapshot } from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { SendCommand } from '../canvas/CanvasArea';
import type { Selection } from '../editor/selection';
import { DefinitionsHarness } from '../test/DefinitionsHarness';
import { loadSample } from '../test/sample';

const sample = loadSample();

function renderTab({
  project = sample,
  editable = true,
}: { project?: ProjectSnapshot; editable?: boolean } = {}) {
  const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
  render(
    <DefinitionsHarness
      project={project}
      selected={[]}
      editable={editable}
      send={send}
      select={vi.fn<(selection: Selection) => void>()}
      onReady={() => {}}
    />,
  );
  return {
    send,
    tab: screen.getByRole('region', { name: 'Components tab' }),
    inspector: screen.getByRole('complementary', { name: 'Inspector' }),
  };
}

function sent(send: Mock<SendCommand>): Command[] {
  return send.mock.calls.map(([command]) => command);
}

async function settle(action: () => void): Promise<void> {
  await act(async () => {
    action();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The names of the tree's rows, in order. */
function rowNames(tab: HTMLElement): string[] {
  return within(tab)
    .getAllByRole('treeitem')
    .map((row) => row.textContent ?? '');
}

describe('the Components tab', () => {
  it('lists the packages in use, the project’s own first and open, each with what it defines', () => {
    const { tab } = renderTab();
    const tree = within(tab).getByRole('tree', { name: 'In use' });
    expect(rowNames(tree)).toEqual([
      'Clinic, Package',
      'Calendar, Component, derives from Database',
      'reminds, Relation type, derives from communicates with',
      'Systems, Built-in package',
    ]);
    expect(
      within(tree).getByRole('treeitem', { name: 'Systems, Built-in package' }),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('moves through its rows with the keys, opens a package with Right, and opens a row in the inspector with Enter', async () => {
    const { tab, inspector } = renderTab();
    const clinic = within(tab).getByRole('treeitem', { name: 'Clinic, Package' });
    act(() => clinic.focus());
    fireEvent.keyDown(clinic, { key: 'ArrowDown' });
    const calendar = within(tab).getByRole('treeitem', { name: /^Calendar,/ });
    expect(calendar).toHaveFocus();
    fireEvent.keyDown(calendar, { key: 'End' });
    const systems = within(tab).getByRole('treeitem', { name: 'Systems, Built-in package' });
    expect(systems).toHaveFocus();
    fireEvent.keyDown(systems, { key: 'ArrowRight' });
    expect(systems).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(systems, { key: 'ArrowDown' });
    const box = within(tab).getByRole('treeitem', { name: /^Box, Component/ });
    expect(box).toHaveFocus();
    await settle(() => fireEvent.keyDown(box, { key: 'Enter' }));
    expect(
      within(inspector).getByRole('heading', { name: 'Box, Built-in component' }),
    ).toBeVisible();
    // The focus stays in the tree, on the row that stands for what the inspector shows.
    expect(box).toHaveFocus();
    expect(box).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(box, { key: 'ArrowLeft' });
    expect(systems).toHaveFocus();
    fireEvent.keyDown(systems, { key: 'ArrowLeft' });
    expect(systems).toHaveAttribute('aria-expanded', 'false');
  });

  it('starts using a built-in package not in use yet, and nests the open view by its nesting relation types', async () => {
    const { tab, send } = renderTab();
    const unused = within(tab).getByRole('list', { name: 'Not in use yet' });
    expect(within(unused).getByText('Data modeling')).toBeVisible();
    await settle(() =>
      fireEvent.click(
        within(unused).getByRole('button', { name: 'Use the package “Data modeling”' }),
      ),
    );
    expect(sent(send)).toEqual([
      {
        type: 'batch',
        label: 'Use the package "Data modeling"',
        commands: [
          { type: 'update-project', changes: { packages: ['systems', 'clinic', 'data-modeling'] } },
          {
            type: 'update-view',
            id: 'system-overview',
            changes: { nestingRelationTypes: ['systems.is-part-of', 'data-modeling.is-column-of'] },
          },
        ],
      },
    ]);
    const still = within(tab).getByRole('list', { name: 'Not in use yet' });
    expect(within(still).queryByText('Data modeling')).toBeNull();
    expect(within(still).getByText('C4 architecture')).toBeVisible();
    expect(
      within(tab).getByRole('treeitem', { name: 'Data modeling, Built-in package' }),
    ).toBeVisible();
  });

  it('shows a package not in use yet in the inspector, which can start using it', async () => {
    const { tab, inspector, send } = renderTab();
    await settle(() => fireEvent.click(within(tab).getByRole('button', { name: 'Data modeling' })));
    expect(
      within(inspector).getByRole('heading', { name: 'Data modeling, Built-in package' }),
    ).toHaveFocus();
    expect(within(inspector).getByText('Table')).toBeVisible();
    await settle(() =>
      fireEvent.click(within(inspector).getByRole('button', { name: 'Use this package' })),
    );
    expect(sent(send)[0]?.type).toBe('batch');
    expect(
      within(inspector).getByRole('button', { name: 'Stop using this package' }),
    ).toBeEnabled();
  });

  it('opens the forms that make a new component, relation type or package', async () => {
    const { tab, inspector } = renderTab();
    await settle(() => fireEvent.click(within(tab).getByRole('button', { name: 'New component' })));
    expect(within(inspector).getByRole('heading', { name: 'New component' })).toHaveFocus();
    expect(within(inspector).getByRole('combobox', { name: 'Derives from' })).toHaveValue(
      'essence',
    );
    expect(within(inspector).getByRole('button', { name: 'Define the component' })).toBeVisible();
    await settle(() =>
      fireEvent.click(within(tab).getByRole('button', { name: 'New relation type' })),
    );
    expect(within(inspector).getByRole('combobox', { name: 'Derives from' })).toHaveValue(
      'relates-to',
    );
    await settle(() => fireEvent.click(within(tab).getByRole('button', { name: 'New package' })));
    expect(within(inspector).getByRole('form', { name: 'New package' })).toBeVisible();
  });

  it('makes nothing while the project cannot be changed', () => {
    const { tab } = renderTab({ editable: false });
    expect(within(tab).getByRole('button', { name: 'New component' })).toBeDisabled();
    expect(
      within(tab).getByRole('button', { name: 'Use the package “Data modeling”' }),
    ).toBeDisabled();
  });
});
