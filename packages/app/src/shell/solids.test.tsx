/**
 * The editors of solids (ADR 0075): the component editor's Solid section, the inspector's solid with
 * its description, Use this view and Anchor parts…, and the Components tab's solids, with Change,
 * Replace and Remove, and the files in `solids/` that no package names.
 */
import type { Command, ProjectSnapshot, SolidPreparedMessage } from '@visual-anything/core';
import type { Element, SolidDefinition } from '@visual-anything/schema';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { SendCommand } from '../canvas/CanvasArea';
import { TurningContext, type CanvasTurning } from '../canvas/solids/turningContext';
import type { Selectable, Selection } from '../editor/selection';
import { LanguageProvider } from '../i18n/LanguageProvider';
import { LiveContext, type Live } from '../live/context';
import { DefinitionsHarness } from '../test/DefinitionsHarness';
import { fakeLive } from '../test/fakeLive';
import { loadSample } from '../test/sample';

const sample = loadSample();
const HASH = 'b'.repeat(64);
const UNNAMED = 'c'.repeat(64);

const ARM: SolidDefinition = {
  id: 'clinic.arm',
  name: 'Arm',
  description: 'A six-axis arm on a round base.',
  source: 'Drawn for Visual Anything',
  license: 'CC0-1.0',
  hash: HASH,
  bytes: 4096,
  bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0.4, y: 1.2, z: 0.4 } },
  counts: { triangles: 1000, vertices: 600, nodes: 4, textures: 0 },
  parts: [
    { name: 'appointments_api' },
    { name: 'reminder-service', parent: 0 },
    { name: 'gripper' },
  ],
  camera: { azimuth: 30, elevation: 20 },
};

/** The sample with the arm in the clinic's package, its elements changed as given. */
function withArm(
  solid: Partial<SolidDefinition> = {},
  elements: (element: Element) => Element = (element) => element,
): ProjectSnapshot {
  return {
    ...sample,
    packages: sample.packages.map((file) =>
      file.id === 'clinic' ? { ...file, solids: [{ ...ARM, ...solid }] } : file,
    ),
    model: { ...sample.model, elements: sample.model.elements.map(elements) },
  };
}

/** Scheduling drawn with the arm's parts, as a drawing with parts. */
const schedulingShowsArm = (element: Element): Element =>
  element.id === 'scheduling'
    ? { ...element, appearance: { solid: { solid: ARM.id, placement: 'parts' } } }
    : element;

function renderPanels(
  project: ProjectSnapshot,
  selected: Selectable[],
  options: { live?: Partial<Live>; turning?: CanvasTurning; language?: 'en' | 'es' } = {},
) {
  const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
  render(
    <LanguageProvider language={options.language ?? 'en'}>
      <LiveContext value={fakeLive({ project, ...options.live })}>
        <TurningContext value={options.turning}>
          <DefinitionsHarness
            project={project}
            selected={selected}
            editable
            send={send}
            select={vi.fn<(selection: Selection) => void>()}
            onReady={() => undefined}
          />
        </TurningContext>
      </LiveContext>
    </LanguageProvider>,
  );
  return { send, inspector: screen.getByRole('complementary', { name: 'Inspector' }) };
}

function sent(send: Mock<SendCommand>): Command[] {
  return send.mock.calls.map(([command]) => command);
}

async function settle(action: () => void = () => undefined): Promise<void> {
  await act(async () => {
    action();
    for (let tick = 0; tick < 5; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Opens the component editor of Calendar from Appointments DB, and its Solid group. */
async function editCalendar(project: ProjectSnapshot) {
  const rendered = renderPanels(project, [{ kind: 'element', id: 'appointments-db' }]);
  await settle(() =>
    fireEvent.click(within(rendered.inspector).getByRole('button', { name: 'Edit “Calendar”' })),
  );
  return {
    ...rendered,
    solid: within(rendered.inspector).getByRole('group', { name: 'Its solid' }),
  };
}

describe('the component editor’s Solid section', () => {
  it('shows a solid, chosen from the project’s, with the solid trait set whole', async () => {
    const { send, solid } = await editCalendar(withArm());
    expect(within(solid).getByText('None', { selector: 'p' })).toBeTruthy();
    await settle(() =>
      fireEvent.change(within(solid).getByLabelText('Which solid'), { target: { value: ARM.id } }),
    );
    expect(sent(send)).toEqual([
      {
        type: 'update-component',
        id: 'clinic.calendar',
        changes: { appearance: { solid: { solid: ARM.id } } },
      },
    ]);
  });

  it('places it, lights it and sets its camera, each one action, and shows no solid', async () => {
    const shown = withArm();
    const project: ProjectSnapshot = {
      ...shown,
      packages: shown.packages.map((file) =>
        file.id === 'clinic'
          ? {
              ...file,
              components: file.components.map((each) =>
                each.id === 'clinic.calendar'
                  ? { ...each, appearance: { ...each.appearance, solid: { solid: ARM.id } } }
                  : each,
              ),
            }
          : file,
      ),
    };
    const { send, solid } = await editCalendar(project);
    const group = within(solid);
    expect(group.getByText('Arm, as its drawing')).toBeTruthy();
    expect(group.getByText('Its text alternative: A six-axis arm on a round base.')).toBeTruthy();
    // Where no program draws solids, the preview says so, and its description is its alternative.
    expect(group.getByRole('img', { name: 'A six-axis arm on a round base.' })).toBeTruthy();
    await settle(() =>
      fireEvent.change(group.getByLabelText('Placement'), { target: { value: 'parts' } }),
    );
    await settle(() =>
      fireEvent.change(group.getByLabelText('Lighting'), { target: { value: 'flat' } }),
    );
    const azimuth = group.getByLabelText('Azimuth, in degrees');
    fireEvent.change(azimuth, { target: { value: '90' } });
    await settle(() => fireEvent.keyDown(azimuth, { key: 'Enter' }));
    await settle(() =>
      fireEvent.change(group.getByLabelText('Projection'), { target: { value: 'orthographic' } }),
    );
    await settle(() => fireEvent.click(group.getByRole('button', { name: 'Show no solid' })));
    expect(
      sent(send).map((each) =>
        each.type === 'update-component' ? each.changes.appearance?.solid : each,
      ),
    ).toEqual([
      { solid: ARM.id, placement: 'parts' },
      { solid: ARM.id, placement: 'parts', lighting: 'flat' },
      {
        solid: ARM.id,
        placement: 'parts',
        lighting: 'flat',
        camera: { azimuth: 90, elevation: 20 },
      },
      {
        solid: ARM.id,
        placement: 'parts',
        lighting: 'flat',
        camera: { azimuth: 90, elevation: 20, projection: 'orthographic' },
      },
      'none',
    ]);
  });

  it('says that an image the component shows is not drawn beside its solid', async () => {
    const shown = withArm();
    const project: ProjectSnapshot = {
      ...shown,
      packages: shown.packages.map((file) =>
        file.id === 'clinic'
          ? {
              ...file,
              images: [
                {
                  kind: 'svg',
                  id: 'clinic.logo',
                  name: 'Logo',
                  width: 24,
                  height: 24,
                  svg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/></svg>',
                },
              ],
              components: file.components.map((each) =>
                each.id === 'clinic.calendar'
                  ? {
                      ...each,
                      appearance: {
                        image: { image: 'clinic.logo' },
                        solid: { solid: ARM.id },
                      },
                    }
                  : each,
              ),
            }
          : file,
      ),
    };
    const { solid } = await editCalendar(project);
    expect(
      within(solid).getByText(
        'Its image is not drawn: a shape that shows a solid draws the solid instead.',
      ),
    ).toBeTruthy();
  });
});

describe('the inspector’s solid', () => {
  it('shows an element’s solid with its description, its parts, and Use this view while it turns', async () => {
    const useThisView = vi.fn<() => Promise<boolean>>(() => Promise.resolve(true));
    const { inspector } = renderPanels(
      withArm({}, schedulingShowsArm),
      [{ kind: 'element', id: 'scheduling' }],
      { turning: { element: 'scheduling', useThisView } },
    );
    const section = within(inspector).getByRole('region', { name: 'Its solid' });
    const shown = within(section);
    expect(shown.getByText('“Arm”, drawn with its parts.')).toBeTruthy();
    expect(
      shown.getByText('Scheduling, with a solid: A six-axis arm on a round base.'),
    ).toBeTruthy();
    expect(shown.getByText('Its solid, “Arm”, has 3 named parts.', { exact: false })).toBeTruthy();
    expect(shown.getByText('gripper')).toBeTruthy();
    await settle(() => fireEvent.click(shown.getByRole('button', { name: 'Use this view' })));
    expect(useThisView).toHaveBeenCalledTimes(1);
    expect(shown.getByRole('status').textContent).toBe('Kept this view of Scheduling.');
  });

  it('offers Use this view only for the element that turns', () => {
    const { inspector } = renderPanels(
      withArm({}, schedulingShowsArm),
      [{ kind: 'element', id: 'scheduling' }],
      { turning: { element: 'patient', useThisView: () => Promise.resolve(true) } },
    );
    expect(within(inspector).queryByRole('button', { name: 'Use this view' })).toBeNull();
  });

  it('says when a solid has no description', () => {
    const { inspector } = renderPanels(withArm({ description: '' }, schedulingShowsArm), [
      { kind: 'element', id: 'scheduling' },
    ]);
    expect(
      within(inspector).getByText(
        'The solid has no description, so its shapes have no text alternative: add one in the Components tab.',
      ),
    ).toBeTruthy();
  });

  it('anchors the solid’s parts by name, creating elements for those left, in one action', async () => {
    const { inspector, send } = renderPanels(withArm({}, schedulingShowsArm), [
      { kind: 'element', id: 'scheduling' },
    ]);
    await settle(() =>
      fireEvent.click(within(inspector).getByRole('button', { name: 'Anchor parts…' })),
    );
    const dialog = within(screen.getByRole('dialog', { name: 'Anchor the parts of “Scheduling”' }));
    expect(dialog.getByText('“appointments_api” → “Appointments API”')).toBeTruthy();
    expect(dialog.getByText('“reminder-service” → “Reminder service”')).toBeTruthy();
    fireEvent.click(
      dialog.getByRole('checkbox', {
        name: 'Create an element for each part that matches nothing, named after the part',
      }),
    );
    expect(dialog.getByText('“gripper” → a new “Gripper”')).toBeTruthy();
    await settle(() => fireEvent.click(dialog.getByRole('button', { name: 'Anchor 3 parts' })));
    const [command] = sent(send);
    expect(command).toMatchObject({ type: 'batch', label: 'Anchor 3 parts of "Scheduling"' });
    const commands = command?.type === 'batch' ? command.commands : [];
    expect(commands.filter((each) => each.type === 'update-element')).toEqual([
      {
        type: 'update-element',
        id: 'appointments-api',
        changes: { appearanceTraits: { part: { part: 'appointments_api', solid: 'clinic.arm' } } },
      },
      {
        type: 'update-element',
        id: 'reminder-service',
        changes: { appearanceTraits: { part: { part: 'reminder-service', solid: 'clinic.arm' } } },
      },
    ]);
    expect(commands.some((each) => each.type === 'create-element')).toBe(true);
  });
});

/** The answer of the program to a listing of the files no package names. */
function listed(files: { hash: string; bytes: number }[], more: object = {}) {
  return {
    ok: true as const,
    answer: { type: 'solid-files/listed' as const, requestId: 'r', files, ...more },
  };
}

/** The Components tab's solids section. */
function solidsSection() {
  return screen.getByRole('heading', { name: 'Solids' }).closest('section') as HTMLElement;
}

describe('the Components tab’s solids', () => {
  it('lists the packages’ solids with what each says, and refuses to remove one in use', async () => {
    renderPanels(withArm({}, schedulingShowsArm), [], {
      live: { listSolidFiles: () => Promise.resolve(listed([])) },
    });
    await settle();
    const section = within(solidsSection());
    expect(section.getByText('Arm')).toBeTruthy();
    expect(section.getByText('A six-axis arm on a round base.')).toBeTruthy();
    expect(section.getByText(/^0\.4 × 1\.2 × 0\.4 m · 4 KiB · 1,000 triangles/)).toBeTruthy();
    expect(section.getByText('Source: Drawn for Visual Anything · License: CC0-1.0')).toBeTruthy();
    const remove = section.getByRole('button', { name: 'Remove' });
    expect(remove.getAttribute('aria-disabled')).toBe('true');
    expect(
      section.getByText('It cannot be removed while 1 thing shows it: “Scheduling”.'),
    ).toBeTruthy();
  });

  it('changes what a solid says and removes one no appearance shows, each one action', async () => {
    const { send } = renderPanels(withArm(), [], {
      live: { listSolidFiles: () => Promise.resolve(listed([])) },
    });
    await settle();
    const section = within(solidsSection());
    fireEvent.click(section.getByRole('button', { name: 'Change…' }));
    const description = section.getByLabelText('Description, its text alternative');
    fireEvent.change(description, { target: { value: 'An arm.' } });
    await settle(() => fireEvent.keyDown(description, { key: 'Enter' }));
    await settle(() => fireEvent.click(section.getByRole('button', { name: 'Remove' })));
    expect(sent(send)).toEqual([
      { type: 'update-solid', id: ARM.id, changes: { description: 'An arm.' } },
      { type: 'remove-solid', id: ARM.id },
    ]);
  });

  it('replaces a solid’s file, saying first which anchored parts it loses', async () => {
    const prepared: SolidPreparedMessage = {
      type: 'solid/prepared',
      requestId: 'r',
      hash: 'd'.repeat(64),
      bytes: 5000,
      bounds: ARM.bounds,
      counts: ARM.counts,
      parts: [{ name: 'gripper' }],
      report: [],
    };
    const prepareSolid = vi.fn<NonNullable<Live['prepareSolid']>>(() =>
      Promise.resolve({ ok: true, answer: prepared }),
    );
    const anchored = withArm({}, (element) =>
      element.id === 'appointments-api'
        ? { ...element, appearance: { part: { part: 'appointments_api' } } }
        : schedulingShowsArm(element),
    );
    const { send } = renderPanels(anchored, [], {
      live: { listSolidFiles: () => Promise.resolve(listed([])), prepareSolid },
    });
    await settle();
    const input = solidsSection().querySelector('input[type="file"]') as HTMLInputElement;
    await settle(() =>
      fireEvent.change(input, {
        target: { files: [new File([new Uint8Array([7])], 'arm-2.glb')] },
      }),
    );
    const dialog = within(
      screen.getByRole('dialog', { name: 'Replace the solid “Arm” with “arm-2.glb”?' }),
    );
    expect(dialog.getByText('“appointments_api”, drawn as “Appointments API”')).toBeTruthy();
    await settle(() => fireEvent.click(dialog.getByRole('button', { name: 'Replace' })));
    expect(sent(send)).toEqual([
      {
        type: 'define-solid',
        package: 'clinic',
        fileName: 'arm-2.glb',
        solid: {
          ...ARM,
          hash: prepared.hash,
          bytes: prepared.bytes,
          parts: prepared.parts,
        },
      },
    ]);
  });

  it('lists the files no package names, says how many, and removes them after asking', async () => {
    const removeSolidFiles = vi.fn<NonNullable<Live['removeSolidFiles']>>(() =>
      Promise.resolve(listed([], { removed: [UNNAMED] })),
    );
    renderPanels(withArm(), [], {
      live: {
        listSolidFiles: () => Promise.resolve(listed([{ hash: UNNAMED, bytes: 2 * 1024 * 1024 }])),
        removeSolidFiles,
      },
    });
    await settle();
    const section = within(solidsSection());
    expect(
      section.getByText(
        'The project’s solids/ folder holds 1 file that no package names. It stays until you remove it.',
      ),
    ).toBeTruthy();
    expect(section.getByText('2 MiB')).toBeTruthy();
    fireEvent.click(section.getByRole('button', { name: `Remove “solids/${UNNAMED}.glb”` }));
    const asking = within(screen.getByRole('alertdialog'));
    expect(asking.getByText(/This cannot be undone/)).toBeTruthy();
    await settle(() => fireEvent.click(asking.getByRole('button', { name: 'Remove' })));
    expect(removeSolidFiles).toHaveBeenCalledWith([UNNAMED]);
    expect(
      section.getByText('Every file in the project’s solids/ folder is named by a package.'),
    ).toBeTruthy();
  });

  it('removes nothing when the person cancels', async () => {
    const removeSolidFiles = vi.fn<NonNullable<Live['removeSolidFiles']>>();
    renderPanels(withArm(), [], {
      live: {
        listSolidFiles: () => Promise.resolve(listed([{ hash: UNNAMED, bytes: 10 }])),
        removeSolidFiles,
      },
    });
    await settle();
    fireEvent.click(
      within(solidsSection()).getByRole('button', { name: `Remove “solids/${UNNAMED}.glb”` }),
    );
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
    );
    expect(removeSolidFiles).not.toHaveBeenCalled();
  });

  it('reads in Spanish', async () => {
    renderPanels(withArm(), [], {
      language: 'es',
      live: {
        listSolidFiles: () => Promise.resolve(listed([{ hash: UNNAMED, bytes: 10 }])),
        removeSolidFiles: () => Promise.resolve(listed([])),
      },
    });
    await settle();
    const section = screen
      .getByRole('heading', { name: 'Sólidos' })
      .closest('section') as HTMLElement;
    expect(
      within(section).getByText(
        'La carpeta solids/ del proyecto tiene 1 archivo que ningún paquete nombra. Queda hasta que se quite.',
      ),
    ).toBeTruthy();
  });
});
