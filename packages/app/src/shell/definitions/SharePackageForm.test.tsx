/**
 * A package from another project in the Components tab and the inspector (R39, ADR 0051): choosing
 * that project's folder, one of its packages, and what adding or updating it does, before it is sent.
 */
import type { Command, ProjectSnapshot } from '@visual-anything/core';
import type { PackageFile } from '@visual-anything/schema';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { SendCommand } from '../../canvas/CanvasArea';
import type { Selection } from '../../editor/selection';
import { DefinitionsHarness } from '../../test/DefinitionsHarness';
import { loadSample } from '../../test/sample';

const sample = loadSample();
const CLINIC = sample.packages.find((each) => each.id === 'clinic') as PackageFile;

const SHOP: PackageFile = {
  id: 'shop',
  name: 'Shop',
  version: '1.0.0',
  license: 'MIT',
  attribution: 'Jane Doe',
  components: [{ id: 'shop.till', name: 'Till', derivesFrom: 'systems.box' }],
  relationTypes: [],
};

function renderTab(project: ProjectSnapshot = sample) {
  const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
  render(
    <DefinitionsHarness
      project={project}
      selected={[]}
      editable
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

/** A file of a folder the person chose, as a folder picker lists it. */
function chosenFile(path: string, value: unknown): File {
  const file = new File([JSON.stringify(value)], path.split('/').at(-1) ?? path);
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
}

/** Chooses a project folder in the form, as the folder picker would hand it over. */
async function chooseFolder(inspector: HTMLElement, files: File[]) {
  const input = inspector.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('No folder picker.');
  expect(input).toHaveAttribute('webkitdirectory');
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  await act(async () => {
    fireEvent.change(input);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Opens the project's own Clinic package in the inspector, from its row in the tab. */
async function openClinic(tab: HTMLElement) {
  const row = within(tab).getByRole('treeitem', { name: 'Clinic, Package' });
  act(() => row.focus());
  await act(async () => {
    fireEvent.keyDown(row, { key: 'Enter' });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function click(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('adding a package from another project', () => {
  it('lists the packages of the folder chosen, says what one holds, and adds it as one command', async () => {
    const { tab, inspector, send } = renderTab();
    await click(within(tab).getByRole('button', { name: 'Add from another project…' }));
    expect(
      within(inspector).getByRole('heading', { name: 'Add a package from another project' }),
    ).toBeVisible();
    await chooseFolder(inspector, [
      chosenFile('other-shop/project.vaproject', { name: 'Other shop' }),
      chosenFile('other-shop/packages/shop.vapackage', SHOP),
    ]);
    await waitFor(() =>
      expect(within(inspector).getByRole('heading', { name: 'Other shop' })).toBeVisible(),
    );
    expect(within(inspector).getByRole('radio', { name: /^Shop/ })).toBeChecked();
    expect(within(inspector).getByText('1 component, 0 relation types and 0 images')).toBeVisible();
    expect(within(inspector).getByText('Jane Doe')).toBeVisible();
    await click(within(inspector).getByRole('button', { name: 'Add this package' }));
    expect(sent(send)).toEqual([{ type: 'add-package', package: SHOP }]);
  });

  it('says before sending anything that the ids clash, and refuses to add it', async () => {
    const { tab, inspector, send } = renderTab();
    await click(within(tab).getByRole('button', { name: 'Add from another project…' }));
    await chooseFolder(inspector, [
      chosenFile('elsewhere/project.vaproject', { name: 'Elsewhere' }),
      chosenFile('elsewhere/packages/clinic.vapackage', CLINIC),
    ]);
    await waitFor(() =>
      expect(
        within(inspector).getByText(
          'The package "Clinic" cannot be added: this project already has a package with the id "clinic".',
        ),
      ).toBeVisible(),
    );
    expect(within(inspector).getByRole('button', { name: 'Add this package' })).toBeDisabled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('updating a package from the project it came from', () => {
  it('lists what changed there, then applies it as one command', async () => {
    const { tab, inspector, send } = renderTab();
    await openClinic(tab);
    await click(within(inspector).getByRole('button', { name: 'Update from another project…' }));
    expect(
      within(inspector).getByRole('heading', { name: 'Update “Clinic” from another project' }),
    ).toBeVisible();
    const next: PackageFile = {
      ...CLINIC,
      version: '1.1.0',
      components: [
        ...CLINIC.components,
        { id: 'clinic.ward', name: 'Ward', derivesFrom: 'systems.box' },
      ],
    };
    await chooseFolder(inspector, [
      chosenFile('source/project.vaproject', { name: 'Clinic source' }),
      chosenFile('source/packages/clinic.vapackage', next),
    ]);
    await waitFor(() => expect(within(inspector).getByText('Added: “Ward”')).toBeVisible());
    expect(within(inspector).getByText('none → 1.1.0')).toBeVisible();
    await click(within(inspector).getByRole('button', { name: 'Apply the update' }));
    expect(sent(send)).toEqual([{ type: 'replace-package', package: next }]);
  });

  it('says when the package is the same there, and when that project has none of that id', async () => {
    const { tab, inspector } = renderTab();
    await openClinic(tab);
    await click(within(inspector).getByRole('button', { name: 'Update from another project…' }));
    await chooseFolder(inspector, [chosenFile('same/packages/clinic.vapackage', CLINIC)]);
    await waitFor(() =>
      expect(
        within(inspector).getByText('Nothing differs: the package is the same there.'),
      ).toBeVisible(),
    );
    expect(within(inspector).getByRole('button', { name: 'Apply the update' })).toBeDisabled();
    await chooseFolder(inspector, [chosenFile('other/packages/shop.vapackage', SHOP)]);
    await waitFor(() =>
      expect(within(inspector).getByText('That project has no package “clinic”.')).toBeVisible(),
    );
  });
});
