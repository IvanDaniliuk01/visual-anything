/**
 * The image picker, in the component editor's image row and in an element's own appearance: files are
 * cleaned before they are sent and what cleaning removed is said; a picture already in the project is
 * reused by its id; and no picture is ever put in the page as an image or as markup.
 */
import type { Command, ProjectSnapshot } from '@visual-anything/core';
import type { ImageDefinition } from '@visual-anything/schema';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { png, pngHeader, pngText } from '../../bench/pictures';
import type { SendCommand } from '../../canvas/CanvasArea';
import type { Selectable, Selection } from '../../editor/selection';
import { DefinitionsHarness } from '../../test/DefinitionsHarness';
import { loadSample } from '../../test/sample';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const sample = loadSample();

const LOGO: ImageDefinition = {
  kind: 'svg',
  id: 'clinic.logo',
  name: 'Logo',
  width: 24,
  height: 24,
  svg: `<svg viewBox="0 0 24 24" ${NS}><circle cx="12" cy="12" r="10" fill="#25D366"/></svg>`,
};

function withLogo(project: ProjectSnapshot = sample): ProjectSnapshot {
  return {
    ...project,
    packages: project.packages.map((file) =>
      file.id === 'clinic' ? { ...file, images: [LOGO] } : file,
    ),
  };
}

function renderPanels(project: ProjectSnapshot, selected: Selectable[]) {
  const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
  render(
    <DefinitionsHarness
      project={project}
      selected={selected}
      editable
      send={send}
      select={vi.fn<(selection: Selection) => void>()}
      onReady={() => undefined}
    />,
  );
  return { send, inspector: screen.getByRole('complementary', { name: 'Inspector' }) };
}

function sent(send: Mock<SendCommand>): Command[] {
  return send.mock.calls.map(([command]) => command);
}

/** Does something, then lets files be read and answers arrive. */
async function settle(action: () => void): Promise<void> {
  await act(async () => {
    action();
    for (let tick = 0; tick < 5; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Chooses a file in the picker of a group. */
async function choose(group: HTMLElement, file: File): Promise<void> {
  const input = group.querySelector('input[type="file"]') as HTMLInputElement;
  await settle(() => fireEvent.change(input, { target: { files: [file] } }));
}

async function editCalendar(project: ProjectSnapshot = sample) {
  const rendered = renderPanels(project, [{ kind: 'element', id: 'appointments-db' }]);
  await settle(() =>
    fireEvent.click(within(rendered.inspector).getByRole('button', { name: 'Edit “Calendar”' })),
  );
  return { ...rendered, image: within(rendered.inspector).getByRole('group', { name: 'Image' }) };
}

describe('the image picker in the component editor', () => {
  it('cleans an SVG file before sending it, and says what cleaning removed', async () => {
    const { send, image } = await editCalendar();
    const svg = `<svg viewBox="0 0 24 24" ${NS}><script>alert(1)</script><circle cx="12" cy="12" r="10" onload="steal()"/></svg>`;
    await choose(image, new File([svg], 'Logo.svg', { type: 'image/svg+xml' }));
    const [command] = sent(send);
    expect(command).toMatchObject({
      type: 'batch',
      label: 'Set the image of "Calendar"',
      commands: [
        { type: 'define-image', package: 'clinic', createOnly: true, image: { name: 'Logo' } },
        {
          type: 'update-component',
          id: 'clinic.calendar',
          changes: { appearance: { image: { placement: 'icon' } } },
        },
      ],
    });
    const defined = (command as { commands: { image?: { svg?: string } }[] }).commands[0];
    expect(defined?.image?.svg).not.toMatch(/script|onload|steal/);
    expect(within(image).getByText(/Cleaning removed from “Logo”: .*script element/)).toBeVisible();
    // Previews are drawn into canvases; nothing is put in the page as an image.
    expect(document.querySelector('img, object, embed, iframe')).toBeNull();
  });

  it('refuses a file whose header claims a huge picture, before decoding it, and sends nothing', async () => {
    const { send, image } = await editCalendar();
    await choose(image, new File([pngHeader(30_000, 30_000)], 'bomb.png', { type: 'image/png' }));
    expect(send).not.toHaveBeenCalled();
    expect(within(image).getByRole('alert')).toHaveTextContent(/too large/);
  });

  it('uses a picture already in the project, by its id, from a grid of previews', async () => {
    const { send, image } = await editCalendar(withLogo());
    await settle(() =>
      fireEvent.click(
        within(image).getByRole('button', { name: 'Use a picture already in the project' }),
      ),
    );
    const grid = within(image).getByRole('list', { name: 'Pictures in the project' });
    expect(grid.querySelector('canvas')).not.toBeNull();
    await settle(() => fireEvent.click(within(grid).getByRole('button', { name: 'Use “Logo”' })));
    expect(sent(send)).toEqual([
      {
        type: 'update-component',
        id: 'clinic.calendar',
        changes: { appearance: { image: { image: 'clinic.logo', placement: 'icon' } } },
      },
    ]);
    // Now shown: placed as a drawing on request, in one more action.
    await settle(() =>
      fireEvent.change(within(image).getByRole('combobox', { name: 'Placement' }), {
        target: { value: 'drawing' },
      }),
    );
    expect(sent(send).at(-1)).toEqual({
      type: 'update-component',
      id: 'clinic.calendar',
      changes: { appearance: { image: { image: 'clinic.logo', placement: 'drawing' } } },
    });
  });
});

describe('the image picker in an element’s own appearance', () => {
  it('gives one element a PNG of its own, stripped of its metadata, in a package of the project', async () => {
    const { send, inspector } = renderPanels(sample, [{ kind: 'element', id: 'whatsapp' }]);
    const image = within(inspector).getByRole('group', { name: 'Image' });
    const bytes = png(8, 8, () => [37, 211, 102], [pngText('GPS', '41.40338, 2.17403')]);
    await choose(image, new File([bytes], 'Ana.png', { type: 'image/png' }));
    const [command] = sent(send);
    expect(command).toMatchObject({
      type: 'batch',
      label: 'Set the image of "WhatsApp channel"',
      commands: [
        { type: 'define-image', package: 'clinic', image: { name: 'Ana', format: 'png' } },
        { type: 'update-element', id: 'whatsapp' },
      ],
    });
    const data = (command as { commands: { image?: { data?: string } }[] }).commands[0]?.image
      ?.data;
    expect(atob(data ?? '')).not.toContain('41.40338');
    expect(within(image).getByText(/Cleaning removed from “Ana”: 1 tEXt chunk/)).toBeVisible();
  });

  it('gives another element a picture already in the project, and goes back to its component’s', async () => {
    const project = withLogo();
    const { send, inspector } = renderPanels(project, [{ kind: 'element', id: 'booking-agent' }]);
    const image = within(inspector).getByRole('group', { name: 'Image' });
    await settle(() =>
      fireEvent.click(
        within(image).getByRole('button', { name: 'Use a picture already in the project' }),
      ),
    );
    await settle(() => fireEvent.click(within(image).getByRole('button', { name: 'Use “Logo”' })));
    expect(sent(send)).toEqual([
      {
        type: 'update-element',
        id: 'booking-agent',
        changes: { appearanceTraits: { image: { image: 'clinic.logo', placement: 'icon' } } },
      },
    ]);
    await settle(() =>
      fireEvent.click(
        within(inspector).getByRole('button', { name: 'Use the component’s image for Image' }),
      ),
    );
    expect(sent(send).at(-1)).toEqual({
      type: 'update-element',
      id: 'booking-agent',
      changes: { appearanceTraits: { image: null } },
    });
  });

  it('draws a picture as a silhouette of one color on request', async () => {
    const project = withLogo();
    const { send, inspector } = renderPanels(
      {
        ...project,
        model: {
          ...project.model,
          elements: project.model.elements.map((each) =>
            each.id === 'whatsapp'
              ? { ...each, appearance: { image: { image: 'clinic.logo' } } }
              : each,
          ),
        },
      },
      [{ kind: 'element', id: 'whatsapp' }],
    );
    const image = within(inspector).getByRole('group', { name: 'Image' });
    await settle(() =>
      fireEvent.click(within(image).getByRole('checkbox', { name: 'As a silhouette' })),
    );
    expect(sent(send)).toEqual([
      {
        type: 'update-element',
        id: 'whatsapp',
        changes: {
          appearanceTraits: { image: { image: 'clinic.logo', placement: 'icon', tint: '#1F2933' } },
        },
      },
    ]);
  });
});
