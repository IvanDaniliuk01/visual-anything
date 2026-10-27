/**
 * The component editor's Shape section and the element inspector's part (ADR 0066, ADR 0067): free
 * geometry from typed path data, an SVG file or a named part, with a live preview, Keep proportions
 * and the label area; the part shapes are drawn as; and the image placement With its parts. Each
 * change is one command, sent where the project can change it.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { SendCommand } from '../../canvas/CanvasArea';
import type { Selectable, Selection } from '../../editor/selection';
import { setCurrentLanguage } from '../../i18n/language';
import { ORGANS_ID, beyondBoxes } from '../../test/beyond';
import { DefinitionsHarness, type HarnessControls } from '../../test/DefinitionsHarness';
import { loadSample } from '../../test/sample';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const HEART =
  'M60 104 C20 76 0 52 0 30 C0 12 14 0 30 0 C44 0 54 8 60 20 C66 8 76 0 90 0 C106 0 120 12 120 30 C120 52 100 76 60 104 Z';
const sample = loadSample();

function renderPanels(project: ProjectSnapshot, selected: Selectable[]) {
  const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
  let controls: HarnessControls | undefined;
  render(
    <DefinitionsHarness
      project={project}
      selected={selected}
      editable
      send={send}
      select={vi.fn<(selection: Selection) => void>()}
      onReady={(given) => {
        controls = given;
      }}
    />,
  );
  return {
    send,
    inspector: screen.getByRole('complementary', { name: 'Inspector' }),
    undo: () => act(() => controls?.undo()),
  };
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

/** The trait row a trait's group is in, which also holds its way back to the inherited value. */
function rowOf(group: HTMLElement) {
  return within(group.closest('li') as HTMLElement);
}

/** Opens the component editor of an element's component, one of the project's own. */
async function editComponentOf(project: ProjectSnapshot, element: string, name: string) {
  const rendered = renderPanels(project, [{ kind: 'element', id: element }]);
  await settle(() =>
    fireEvent.click(within(rendered.inspector).getByRole('button', { name: `Edit “${name}”` })),
  );
  const shape = within(rendered.inspector).getByRole('region', { name: 'Shape' });
  return {
    ...rendered,
    shape,
    geometry: within(shape).getByRole('group', { name: 'Free geometry' }),
    part: within(shape).getByRole('group', { name: 'Drawn as a part' }),
  };
}

describe('free geometry in the component editor', () => {
  it('shows none, where it comes from, and reads path data as it is typed', async () => {
    const { geometry, send } = await editComponentOf(sample, 'appointments-db', 'Calendar');
    expect(within(geometry).getByText('None: its shapes are drawn as their kind.')).toBeVisible();
    const path = within(geometry).getByRole('textbox', { name: 'SVG path data' });
    expect(path).toHaveAccessibleDescription(/built in, from Essence/);
    const use = within(geometry).getByRole('button', { name: 'Use this path data' });
    expect(use).toBeDisabled();
    fireEvent.change(path, { target: { value: 'L 10 10' } });
    expect(
      within(geometry).getByText('Contour 1: Path data must start with a move, M or m.'),
    ).toBeVisible();
    expect(use).toBeDisabled();
    fireEvent.change(path, { target: { value: HEART } });
    // The draft is previewed as the canvas draws it, before anything is sent.
    expect(
      within(geometry).getByRole('img', { name: /^Preview of its free geometry/ }),
    ).toBeVisible();
    expect(sent(send)).toEqual([]);
    await settle(() => fireEvent.click(use));
    expect(sent(send)).toEqual([
      {
        type: 'set-component-appearance',
        component: 'clinic.calendar',
        appearanceTraits: {
          geometry: { width: 120, height: 104, outline: [{ kind: 'path', d: HEART }] },
        },
      },
    ]);
    expect(within(geometry).getByText('1 contour in a box of 120 by 104')).toBeVisible();
    expect(within(geometry).getByRole('textbox', { name: 'SVG path data' })).toHaveValue(HEART);
  });

  it('takes the box typed beside the path, and says when it does not hold it', async () => {
    const { geometry, send } = await editComponentOf(sample, 'appointments-db', 'Calendar');
    fireEvent.change(within(geometry).getByRole('textbox', { name: 'SVG path data' }), {
      target: { value: 'M0 0 H200 V50 H0 Z' },
    });
    fireEvent.change(within(geometry).getByRole('spinbutton', { name: 'Box width' }), {
      target: { value: '100' },
    });
    expect(
      within(geometry).getByText('The outline of free geometry leaves its box of 100 by 50.'),
    ).toBeVisible();
    fireEvent.change(within(geometry).getByRole('spinbutton', { name: 'Box width' }), {
      target: { value: '250' },
    });
    await settle(() =>
      fireEvent.click(within(geometry).getByRole('button', { name: 'Use this path data' })),
    );
    expect(sent(send).at(-1)).toMatchObject({
      appearanceTraits: { geometry: { width: 250, height: 50 } },
    });
  });

  it('keeps proportions, sets the label area, draws its kind again and inherits, each one action', async () => {
    const { geometry, send, undo } = await editComponentOf(sample, 'appointments-db', 'Calendar');
    fireEvent.change(within(geometry).getByRole('textbox', { name: 'SVG path data' }), {
      target: { value: HEART },
    });
    await settle(() =>
      fireEvent.click(within(geometry).getByRole('button', { name: 'Use this path data' })),
    );
    await settle(() =>
      fireEvent.click(within(geometry).getByRole('checkbox', { name: 'Keep proportions' })),
    );
    expect(sent(send).at(-1)).toMatchObject({
      appearanceTraits: { geometry: { width: 120, height: 104, keepProportions: true } },
    });
    expect(
      within(geometry).getByText(
        'Worked out: the largest rectangle around a point well inside the outline, in the box’s units.',
      ),
    ).toBeVisible();
    const labelWidth = within(geometry).getByRole('spinbutton', { name: 'Label area’s width' });
    fireEvent.change(labelWidth, { target: { value: '40' } });
    await settle(() => fireEvent.keyDown(labelWidth, { key: 'Enter' }));
    const labelled = sent(send).at(-1) as Extract<Command, { type: 'set-component-appearance' }>;
    const label = (labelled.appearanceTraits?.geometry as { label?: { width: number } }).label;
    expect(label?.width).toBe(40);
    expect(within(geometry).getByText('Its own, in the box’s units.')).toBeVisible();
    await settle(() =>
      fireEvent.click(within(geometry).getByRole('button', { name: 'Work the label area out' })),
    );
    expect(
      'label' in
        ((sent(send).at(-1) as Extract<Command, { type: 'set-component-appearance' }>)
          .appearanceTraits?.geometry as object),
    ).toBe(false);
    await settle(() =>
      fireEvent.click(within(geometry).getByRole('button', { name: 'Draw its kind instead' })),
    );
    expect(sent(send).at(-1)).toEqual({
      type: 'set-component-appearance',
      component: 'clinic.calendar',
      appearanceTraits: { geometry: 'none' },
    });
    expect(
      within(geometry).getByText(
        'None: its shapes are drawn as their kind, whatever is inherited.',
      ),
    ).toBeVisible();
    await settle(() =>
      fireEvent.click(
        rowOf(geometry).getByRole('button', { name: 'Use the inherited value for Free geometry' }),
      ),
    );
    expect(sent(send).at(-1)).toMatchObject({ appearanceTraits: { geometry: null } });
    // Each change was one action: undoing the last brings back the one before.
    undo();
    expect(
      within(geometry).getByText(
        'None: its shapes are drawn as their kind, whatever is inherited.',
      ),
    ).toBeVisible();
  });

  it('takes the outline of an SVG file, cleaned by the core first', async () => {
    const { geometry, send } = await editComponentOf(sample, 'appointments-db', 'Calendar');
    const svg = `<svg viewBox="0 0 100 50" ${NS}><script>alert(1)</script><rect x="10" y="10" width="80" height="30"/></svg>`;
    const input = geometry.querySelector('input[type="file"]') as HTMLInputElement;
    await settle(() =>
      fireEvent.change(input, {
        target: { files: [new File([svg], 'card.svg', { type: 'image/svg+xml' })] },
      }),
    );
    const [command] = sent(send);
    expect(command).toMatchObject({
      type: 'set-component-appearance',
      component: 'clinic.calendar',
      appearanceTraits: { geometry: { keepProportions: true } },
    });
    expect(JSON.stringify(command)).not.toContain('script');
  });

  it('says why a file gives no outline, and sends nothing', async () => {
    const { geometry, send } = await editComponentOf(sample, 'appointments-db', 'Calendar');
    const input = geometry.querySelector('input[type="file"]') as HTMLInputElement;
    await settle(() =>
      fireEvent.change(input, {
        target: { files: [new File(['<html></html>'], 'page.svg', { type: 'image/svg+xml' })] },
      }),
    );
    expect(within(geometry).getByRole('alert')).toHaveTextContent(
      'The outermost element is not an SVG element.',
    );
    expect(sent(send)).toEqual([]);
  });

  it('copies the outline of a named part of a picture of the project', async () => {
    const { geometry, send } = await editComponentOf(beyondBoxes(), 'extra', 'Chamber');
    await settle(() =>
      fireEvent.click(
        within(geometry).getByRole('button', { name: 'Copy the outline of a named part…' }),
      ),
    );
    const copy = within(geometry).getByRole('group', { name: 'Copy the outline of a named part' });
    expect(within(copy).getByRole('combobox', { name: 'Picture' })).toHaveValue(ORGANS_ID);
    const copyIt = within(copy).getByRole('button', { name: 'Copy its outline' });
    expect(copyIt).toBeDisabled();
    fireEvent.change(within(copy).getByRole('combobox', { name: 'Named part' }), {
      target: { value: 'ring' },
    });
    await settle(() => fireEvent.click(copyIt));
    const [command] = sent(send);
    expect(command).toMatchObject({
      type: 'set-component-appearance',
      component: 'anatomy.chamber',
      appearanceTraits: { geometry: { keepProportions: true } },
    });
    // A copy, not the part: the geometry is its own, and names no image.
    expect(JSON.stringify(command)).not.toContain(ORGANS_ID);
    expect(within(geometry).getByText(/^2 contours in a box of/)).toBeVisible();
  });

  it('changes a built-in component’s geometry in the project file', async () => {
    const rendered = renderPanels(sample, []);
    const tab = screen.getByRole('region', { name: 'Components tab' });
    const systems = within(tab).getByRole('treeitem', { name: 'Systems, Built-in package' });
    act(() => systems.focus());
    fireEvent.keyDown(systems, { key: 'ArrowRight' });
    await settle(() =>
      fireEvent.click(within(tab).getByRole('treeitem', { name: /^Service, Component/ })),
    );
    const shape = within(rendered.inspector).getByRole('region', { name: 'Shape' });
    const geometry = within(shape).getByRole('group', { name: 'Free geometry' });
    expect(geometry).toHaveAccessibleDescription(
      /Saved in this project; the built-in package Systems stays as it is\./,
    );
    fireEvent.change(within(geometry).getByRole('textbox', { name: 'SVG path data' }), {
      target: { value: 'M0 0 H10 V10 Z' },
    });
    await settle(() =>
      fireEvent.click(within(geometry).getByRole('button', { name: 'Use this path data' })),
    );
    const [command] = sent(rendered.send);
    expect(command).toMatchObject({
      type: 'set-component-appearance',
      component: 'systems.service',
    });
    const outcome = executeCommand(sample, command as Command);
    expect(
      outcome.ok && outcome.state.project.appearances?.components?.['systems.service'],
    ).toEqual({
      geometry: { width: 10, height: 10, outline: [{ kind: 'path', d: 'M0 0 H10 V10 Z' }] },
    });
  });
});

describe('the part shapes are drawn as', () => {
  it('draws a component’s shapes as a named part of a picture, or as their own', async () => {
    const { part, send } = await editComponentOf(beyondBoxes(), 'extra', 'Chamber');
    expect(within(part).getByText('None: drawn as its own shape.')).toBeVisible();
    expect(within(part).getByRole('combobox', { name: 'Picture' })).toHaveValue(ORGANS_ID);
    await settle(() =>
      fireEvent.change(within(part).getByRole('combobox', { name: 'Named part' }), {
        target: { value: 'right' },
      }),
    );
    expect(sent(send)).toEqual([
      {
        type: 'set-component-appearance',
        component: 'anatomy.chamber',
        appearanceTraits: { part: { part: 'right', image: ORGANS_ID } },
      },
    ]);
    expect(within(part).getByText('The part “right” of “Organs”')).toBeVisible();
    await settle(() =>
      fireEvent.click(within(part).getByRole('button', { name: 'Draw it as its own shape' })),
    );
    expect(sent(send).at(-1)).toMatchObject({ appearanceTraits: { part: 'none' } });
    expect(
      within(part).getByText('None: drawn as its own shape, whatever is inherited.'),
    ).toBeVisible();
  });

  it('names a part of whichever picture the container shows, by its id', async () => {
    const { part, send } = await editComponentOf(beyondBoxes(), 'extra', 'Chamber');
    fireEvent.change(within(part).getByRole('combobox', { name: 'Picture' }), {
      target: { value: '' },
    });
    const id = within(part).getByRole('textbox', { name: 'Named part' });
    fireEvent.change(id, { target: { value: '1 bad' } });
    await settle(() => fireEvent.keyDown(id, { key: 'Enter' }));
    expect(sent(send)).toEqual([]);
    fireEvent.change(id, { target: { value: 'lv' } });
    await settle(() => fireEvent.keyDown(id, { key: 'Enter' }));
    expect(sent(send)).toEqual([
      {
        type: 'set-component-appearance',
        component: 'anatomy.chamber',
        appearanceTraits: { part: { part: 'lv' } },
      },
    ]);
    expect(
      within(part).getByText('The part “lv” of the picture its container shows with its parts'),
    ).toBeVisible();
  });

  it('gives one element a part of its own, from the picture its container shows', async () => {
    const { inspector, send } = renderPanels(beyondBoxes(), [{ kind: 'element', id: 'extra' }]);
    const appearance = within(inspector).getByRole('region', { name: 'Appearance' });
    const part = within(appearance).getByRole('group', { name: 'Drawn as a part' });
    // Its container, Body, shows Organs with its parts: those parts are offered.
    fireEvent.change(within(part).getByRole('combobox', { name: 'Picture' }), {
      target: { value: '' },
    });
    await settle(() =>
      fireEvent.change(within(part).getByRole('combobox', { name: 'Named part' }), {
        target: { value: 'ring' },
      }),
    );
    expect(sent(send)).toEqual([
      {
        type: 'update-element',
        id: 'extra',
        changes: { appearanceTraits: { part: { part: 'ring' } } },
      },
    ]);
    await settle(() =>
      fireEvent.click(
        rowOf(part).getByRole('button', { name: 'Use the component’s part for Drawn as a part' }),
      ),
    );
    expect(sent(send).at(-1)).toEqual({
      type: 'update-element',
      id: 'extra',
      changes: { appearanceTraits: { part: null } },
    });
  });

  it('says when the picture named has no such part', () => {
    const project = beyondBoxes();
    const { inspector } = renderPanels(
      {
        ...project,
        model: {
          ...project.model,
          elements: project.model.elements.map((each) =>
            each.id === 'extra'
              ? { ...each, appearance: { part: { part: 'gone', image: ORGANS_ID } } }
              : each,
          ),
        },
      },
      [{ kind: 'element', id: 'extra' }],
    );
    expect(
      within(inspector).getByText(
        '“Organs” has no part “gone”, so it is drawn as an ordinary shape.',
      ),
    ).toBeVisible();
  });
});

describe('the image placement With its parts', () => {
  it('places an SVG picture with its parts, as one action', async () => {
    const { inspector, send } = renderPanels(beyondBoxes(), [{ kind: 'element', id: 'body' }]);
    await settle(() =>
      fireEvent.click(within(inspector).getByRole('button', { name: 'Edit “Organ”' })),
    );
    const image = within(inspector).getByRole('group', { name: 'Image' });
    expect(within(image).getByText('Organs, with its parts')).toBeVisible();
    const placement = within(image).getByRole('combobox', { name: 'Placement' });
    expect(placement).toHaveValue('parts');
    await settle(() => fireEvent.change(placement, { target: { value: 'icon' } }));
    await settle(() =>
      fireEvent.change(within(image).getByRole('combobox', { name: 'Placement' }), {
        target: { value: 'parts' },
      }),
    );
    expect(sent(send).at(-1)).toMatchObject({
      type: 'update-component',
      id: 'anatomy.organ',
      changes: { appearance: { image: { image: ORGANS_ID, placement: 'parts' } } },
    });
  });
});

describe('the Shape section in Spanish', () => {
  it('reads in Spanish', async () => {
    setCurrentLanguage('es');
    const { inspector } = await editComponentOfSpanish();
    const shape = within(inspector).getByRole('region', { name: 'Forma' });
    expect(within(shape).getByRole('group', { name: 'Geometría libre' })).toBeVisible();
    expect(within(shape).getByRole('group', { name: 'Dibujada como una parte' })).toBeVisible();
  });
});

async function editComponentOfSpanish() {
  const rendered = renderPanels(beyondBoxes(), [{ kind: 'element', id: 'extra' }]);
  await settle(() =>
    fireEvent.click(within(rendered.inspector).getByRole('button', { name: 'Editar “Chamber”' })),
  );
  return rendered;
}
