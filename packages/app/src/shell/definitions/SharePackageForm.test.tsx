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
import { LiveContext, type Live } from '../../live/context';
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

function renderTab(project: ProjectSnapshot = sample, live?: Partial<Live>) {
  const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
  const harness = (
    <DefinitionsHarness
      project={project}
      selected={[]}
      editable
      send={send}
      select={vi.fn<(selection: Selection) => void>()}
      onReady={() => {}}
    />
  );
  render(live === undefined ? harness : <LiveContext value={live as Live}>{harness}</LiveContext>);
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
  const file = new File(
    [value instanceof Uint8Array ? (value as Uint8Array<ArrayBuffer>) : JSON.stringify(value)],
    path.split('/').at(-1) ?? path,
  );
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

describe('updating a package whose code changed (ADR 0089’s M14.6 clarification)', () => {
  /** The sample, its Clinic package holding code. */
  function withCode(code: string[]): ProjectSnapshot {
    return {
      ...sample,
      packages: sample.packages.map((each) => (each.id === 'clinic' ? { ...each, code } : each)),
    };
  }

  async function update(project: ProjectSnapshot, next: PackageFile) {
    const rendered = renderTab(project);
    await openClinic(rendered.tab);
    await click(
      within(rendered.inspector).getByRole('button', { name: 'Update from another project…' }),
    );
    await chooseFolder(rendered.inspector, [chosenFile('source/packages/clinic.vapackage', next)]);
    return rendered;
  }

  it('says that changed code asks for approval again, and applies it though nothing else differs', async () => {
    const project = withCode(['// one']);
    const current = project.packages.find((each) => each.id === 'clinic') as PackageFile;
    const next: PackageFile = { ...current, code: ['// two'] };
    const { inspector, send } = await update(project, next);
    await waitFor(() =>
      expect(
        within(inspector).getByText(
          'Its code changed, so it asks for your approval again before it runs.',
        ),
      ).toBeVisible(),
    );
    await click(within(inspector).getByRole('button', { name: 'Apply the update' }));
    expect(sent(send)).toEqual([{ type: 'replace-package', package: next }]);
  });

  it('says so of what its code may reach', async () => {
    const project = withCode(['// one']);
    const current = project.packages.find((each) => each.id === 'clinic') as PackageFile;
    const { inspector } = await update(project, { ...current, capabilities: ['model:read'] });
    await waitFor(() =>
      expect(
        within(inspector).getByText(
          'What its code may reach changed, so it asks for your approval again before it runs.',
        ),
      ).toBeVisible(),
    );
  });

  it('says what adding code does, for a package that had none', async () => {
    const { inspector } = await update(sample, { ...CLINIC, code: ['// new'] });
    await waitFor(() =>
      expect(
        within(inspector).getByText('It adds code, which runs only once you approve it.'),
      ).toBeVisible(),
    );
    expect(within(inspector).getByRole('button', { name: 'Apply the update' })).toBeEnabled();
  });
});

describe('a package with solids from another project (ADR 0089’s M14.6 clarification)', () => {
  const HASH = 'b'.repeat(64);
  const MISSING = 'c'.repeat(64);
  const solid = (id: string, hash: string) => ({
    id,
    name: 'Arm',
    hash,
    bytes: 3,
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    counts: { triangles: 1, vertices: 3, nodes: 1, textures: 0 },
    parts: [],
    camera: { azimuth: 30, elevation: 20 },
  });
  const ROBOTS: PackageFile = {
    ...SHOP,
    id: 'robots',
    name: 'Robots',
    components: [{ id: 'robots.arm-box', name: 'Arm box', derivesFrom: 'systems.box' }],
    solids: [solid('robots.arm', HASH), solid('robots.leg', MISSING)],
  };
  const PREPARED = {
    type: 'solid/prepared' as const,
    requestId: 'r',
    hash: HASH,
    bytes: 3,
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    counts: { triangles: 1, vertices: 3, nodes: 1, textures: 0 },
    parts: [],
    report: [],
  };

  it('copies the files the folder holds through the local program, then adds the package', async () => {
    const prepareSolid = vi.fn<NonNullable<Live['prepareSolid']>>(() =>
      Promise.resolve({ ok: true, answer: PREPARED }),
    );
    const { tab, inspector, send } = renderTab(sample, { prepareSolid });
    await click(within(tab).getByRole('button', { name: 'Add from another project…' }));
    await chooseFolder(inspector, [
      chosenFile('robots/project.vaproject', { name: 'Robots' }),
      chosenFile('robots/packages/robots.vapackage', ROBOTS),
      chosenFile(`robots/solids/${HASH}.glb`, new Uint8Array([1, 2, 3])),
    ]);
    await waitFor(() =>
      expect(
        within(inspector).getByText(
          'The file of 1 of its solids is copied into this project’s solids folder, checked by Visual Anything first.',
        ),
      ).toBeVisible(),
    );
    expect(
      within(inspector).getByText(
        'That folder holds no file for 1 of its solids: it draws its placeholder until its file is in this project’s solids folder.',
      ),
    ).toBeVisible();
    await click(within(inspector).getByRole('button', { name: 'Add this package' }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(prepareSolid).toHaveBeenCalledTimes(1);
    const [name, bytes, options] = prepareSolid.mock.calls[0] ?? [];
    expect(name).toBe(`${HASH}.glb`);
    expect([...(bytes ?? [])]).toEqual([1, 2, 3]);
    expect(options).toEqual({ keep: HASH });
    expect(sent(send)).toEqual([{ type: 'add-package', package: ROBOTS }]);
  });

  it('adds nothing when the local program refuses a file, and says why', async () => {
    const prepareSolid = vi.fn<NonNullable<Live['prepareSolid']>>(() =>
      Promise.resolve({
        ok: false,
        problems: [
          {
            code: 'solid-not-clean',
            message: 'The solid file is not one Visual Anything cleaned.',
          },
        ],
      }),
    );
    const { tab, inspector, send } = renderTab(sample, { prepareSolid });
    await click(within(tab).getByRole('button', { name: 'Add from another project…' }));
    await chooseFolder(inspector, [
      chosenFile('robots/packages/robots.vapackage', ROBOTS),
      chosenFile(`robots/solids/${HASH}.glb`, new Uint8Array([1, 2, 3])),
    ]);
    await waitFor(() =>
      expect(within(inspector).getByRole('button', { name: 'Add this package' })).toBeEnabled(),
    );
    await click(within(inspector).getByRole('button', { name: 'Add this package' }));
    await waitFor(() =>
      expect(
        within(inspector).getByText('The solid file is not one Visual Anything cleaned.'),
      ).toBeVisible(),
    );
    expect(send).not.toHaveBeenCalled();
  });
});
