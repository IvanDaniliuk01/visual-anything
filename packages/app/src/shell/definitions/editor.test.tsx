import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { SendCommand } from '../../canvas/CanvasArea';
import type { Selectable, Selection } from '../../editor/selection';
import { DefinitionsHarness, type HarnessControls } from '../../test/DefinitionsHarness';
import { loadSample } from '../../test/sample';

const sample = loadSample();

const element = (id: string): Selectable => ({ kind: 'element', id });
const relation = (id: string): Selectable => ({ kind: 'relation', id });

interface Setup {
  project?: ProjectSnapshot;
  selected?: Selectable[];
  editable?: boolean;
}

function renderEditor({ project = sample, selected = [], editable = true }: Setup = {}) {
  const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
  const select = vi.fn<(selection: Selection) => void>();
  let controls: HarnessControls | undefined;
  render(
    <DefinitionsHarness
      project={project}
      selected={selected}
      editable={editable}
      send={send}
      select={select}
      onReady={(given) => {
        controls = given;
      }}
    />,
  );
  return {
    send,
    select,
    inspector: screen.getByRole('complementary', { name: 'Inspector' }),
    undo: () => act(() => controls?.undo()),
    replace: (next: ProjectSnapshot) => act(() => controls?.replace(next)),
  };
}

/** The commands sent so far. */
function sent(send: Mock<SendCommand>): Command[] {
  return send.mock.calls.map(([command]) => command);
}

/** Does something, then lets the answers to what it sent arrive. */
async function settle(action: () => void): Promise<void> {
  await act(async () => {
    action();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Types into a control, then presses Enter. */
async function enter(control: HTMLElement, value: string): Promise<void> {
  fireEvent.change(control, { target: { value } });
  await settle(() => fireEvent.keyDown(control, { key: 'Enter' }));
}

/** Opens the editor of the Appointments DB's component, Calendar, from the element inspector. */
async function editCalendar(setup: Setup = {}) {
  const rendered = renderEditor({ selected: [element('appointments-db')], ...setup });
  await settle(() =>
    fireEvent.click(within(rendered.inspector).getByRole('button', { name: 'Edit “Calendar”' })),
  );
  return rendered;
}

/** The sample with Calendar's own fill set, as Claude might have set it. */
function withCalendarFill(fill: string): ProjectSnapshot {
  const outcome = executeCommand(sample, {
    type: 'update-component',
    id: 'clinic.calendar',
    changes: { appearance: { fill } },
  });
  if (!outcome.ok) throw new Error('refused');
  return outcome.state;
}

describe('the component editor', () => {
  it('opens from the element inspector on the element’s own component, with the focus on its title', async () => {
    const { inspector } = await editCalendar();
    const title = within(inspector).getByRole('heading', { name: 'Calendar, Component' });
    expect(title).toHaveFocus();
    const identity = within(inspector).getByRole('region', { name: 'Identity' });
    expect(within(identity).getByRole('textbox', { name: 'Name' })).toHaveValue('Calendar');
    expect(within(identity).getByRole('combobox', { name: 'Derives from' })).toHaveValue(
      'systems.database',
    );
    expect(within(identity).getByText('clinic.calendar')).toBeInTheDocument();
    expect(
      within(within(inspector).getByRole('list', { name: 'Derives from' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Database', 'Box', 'Essence']);
  });

  it('shows where each trait comes from', async () => {
    const { inspector } = await editCalendar({ project: withCalendarFill('#E0F0FF') });
    const fill = within(inspector).getByLabelText('Fill');
    const shape = within(inspector).getByRole('combobox', { name: 'Shape' });
    expect(fill).toHaveAccessibleDescription('its own');
    expect(shape).toHaveValue('cylinder');
    expect(shape).toHaveAccessibleDescription('from Database');
    expect(
      within(inspector).getByRole('checkbox', { name: 'Write the component’s name' }),
    ).toHaveAccessibleDescription('from Essence');
  });

  it('sends only the trait a control changes, as one command', async () => {
    const { send, inspector } = await editCalendar();
    const fill = within(inspector).getByLabelText('Fill');
    expect(fill).toHaveAccessibleDescription('built in, from Database');
    await settle(() => fireEvent.change(fill, { target: { value: '#112233' } }));
    // A color goes where the project can change it: for Calendar, its package.
    expect(sent(send)).toEqual([
      {
        type: 'set-component-appearance',
        component: 'clinic.calendar',
        appearanceTraits: { fill: '#112233' },
      },
    ]);
    expect(within(inspector).getByLabelText('Fill')).toHaveAccessibleDescription('its own');
    await settle(() =>
      fireEvent.change(within(inspector).getByRole('combobox', { name: 'Shape' }), {
        target: { value: 'rectangle' },
      }),
    );
    expect(sent(send).at(-1)).toEqual({
      type: 'update-component',
      id: 'clinic.calendar',
      changes: { appearance: { shape: 'rectangle' } },
    });
  });

  it('inherits a trait again with "Use the inherited value", which sends null', async () => {
    const { send, inspector } = await editCalendar({ project: withCalendarFill('#E0F0FF') });
    await settle(() =>
      fireEvent.click(
        within(inspector).getByRole('button', { name: 'Use the inherited color for Fill' }),
      ),
    );
    expect(sent(send)).toEqual([
      {
        type: 'set-component-appearance',
        component: 'clinic.calendar',
        appearanceTraits: { fill: null },
      },
    ]);
    expect(within(inspector).getByLabelText('Fill')).toHaveValue('#fff3c9');
    expect(
      within(inspector).queryByRole('button', { name: 'Use the inherited color for Fill' }),
    ).not.toBeInTheDocument();
    await settle(() =>
      fireEvent.change(within(inspector).getByRole('combobox', { name: 'Shape' }), {
        target: { value: 'rectangle' },
      }),
    );
    await settle(() =>
      fireEvent.click(
        within(inspector).getByRole('button', { name: 'Use the inherited value for Shape' }),
      ),
    );
    expect(sent(send).at(-1)).toEqual({
      type: 'update-component',
      id: 'clinic.calendar',
      changes: { appearance: { shape: null } },
    });
  });

  it('shows a refusal of the core on the app’s copy inline, and sends nothing', async () => {
    const { send, inspector } = await editCalendar();
    const attributes = within(inspector).getByRole('list', { name: 'Attributes' });
    const name = within(attributes).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveValue('timezone');
    await enter(name, 'engine');
    expect(send).not.toHaveBeenCalled();
    expect(within(inspector).getByRole('alert')).toHaveTextContent(/engine/);
    expect(name).toHaveAccessibleDescription(/engine/);
  });

  it('renames an attribute of its own, and redefines an inherited one here', async () => {
    const { send, inspector } = await editCalendar();
    const attributes = within(inspector).getByRole('list', { name: 'Attributes' });
    await enter(within(attributes).getByRole('textbox', { name: 'Name' }), 'zone');
    await settle(() =>
      fireEvent.click(within(attributes).getByRole('button', { name: 'Redefine “engine” here' })),
    );
    expect(sent(send)).toEqual([
      {
        type: 'update-component',
        id: 'clinic.calendar',
        changes: { attributes: { rename: [{ from: 'timezone', to: 'zone' }] } },
      },
      {
        type: 'update-component',
        id: 'clinic.calendar',
        changes: {
          attributes: {
            set: [
              { name: 'engine', type: 'string', description: 'Such as "postgres" or "mysql".' },
            ],
          },
        },
      },
    ]);
    expect(
      within(attributes).getByRole('button', { name: 'Use the inherited definition of “engine”' }),
    ).toBeInTheDocument();
  });

  it('adds an attribute of its own, and moves it among its own', async () => {
    const { send, inspector } = await editCalendar();
    const form = within(inspector).getByRole('form', { name: 'New attribute' });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'slots' },
    });
    fireEvent.change(within(form).getByRole('combobox', { name: 'Type' }), {
      target: { value: 'number' },
    });
    await settle(() => fireEvent.submit(form));
    await settle(() =>
      fireEvent.click(within(inspector).getByRole('button', { name: 'Move “slots” up' })),
    );
    expect(
      sent(send).map((command) => command.type === 'update-component' && command.changes),
    ).toEqual([
      { attributes: { set: [{ name: 'slots', type: 'number' }] } },
      { attributes: { order: ['slots', 'timezone'] } },
    ]);
  });

  it('chooses which attributes the detail writes, in order', async () => {
    const { send, inspector } = await editCalendar();
    const written = within(inspector).getByRole('group', { name: 'Attributes written' });
    await settle(() =>
      fireEvent.click(within(written).getByRole('checkbox', { name: 'timezone' })),
    );
    await settle(() => fireEvent.click(within(written).getByRole('checkbox', { name: 'engine' })));
    await settle(() =>
      fireEvent.click(within(written).getByRole('button', { name: 'Write “engine” earlier' })),
    );
    expect(
      sent(send).map((command) => command.type === 'update-component' && command.changes),
    ).toEqual([
      { appearance: { detail: { attributes: ['timezone'] } } },
      { appearance: { detail: { attributes: ['timezone', 'engine'] } } },
      { appearance: { detail: { attributes: ['engine', 'timezone'] } } },
    ]);
  });

  it('adds a badge with its condition, and a connection point', async () => {
    const { send, inspector } = await editCalendar();
    const badge = within(inspector).getByRole('form', { name: 'New badge' });
    fireEvent.change(within(badge).getByRole('textbox', { name: 'Badge text' }), {
      target: { value: 'R' },
    });
    fireEvent.change(within(badge).getByRole('combobox', { name: 'Written' }), {
      target: { value: 'from-end:systems.reads-from' },
    });
    await settle(() => fireEvent.submit(badge));
    await settle(() =>
      fireEvent.click(within(inspector).getByRole('button', { name: 'Add a connection point' })),
    );
    expect(
      sent(send).map((command) => command.type === 'update-component' && command.changes),
    ).toEqual([
      {
        appearance: {
          detail: { badges: [{ when: 'from-end', text: 'R', relationType: 'systems.reads-from' }] },
        },
      },
      { appearance: { connectionPoints: [{ name: 'point 1', side: 'right', at: 0.5 }] } },
    ]);
    const badges = within(inspector).getByRole('group', { name: 'Badges' });
    expect(within(badges).getByRole('listitem')).toHaveTextContent(
      /R while it is the from end of “reads from”/,
    );
    expect(within(badges).getByRole('button', { name: 'Remove the badge “R”' })).toBeVisible();
    expect(
      within(inspector).getByRole('spinbutton', { name: 'Along the side, from 0 to 1' }),
    ).toHaveValue(0.5);
  });

  it('sets how many lines the detail takes, inherited until set, and undoes it', async () => {
    const { send, inspector, undo } = await editCalendar();
    const detail = within(inspector).getByRole('region', { name: 'Detail' });
    const lines = within(detail).getByRole('combobox', { name: 'Lines, at most' });
    expect(lines).toHaveValue('3');
    expect(lines).toHaveAccessibleDescription('from Essence');
    expect(
      within(lines)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(
      within(detail).queryByRole('button', { name: 'Use the inherited value for Lines, at most' }),
    ).not.toBeInTheDocument();

    await settle(() => fireEvent.change(lines, { target: { value: '5' } }));
    expect(sent(send)).toEqual([
      {
        type: 'update-component',
        id: 'clinic.calendar',
        changes: { appearance: { detail: { lines: 5 } } },
      },
    ]);
    const own = within(detail).getByRole('combobox', { name: 'Lines, at most' });
    expect(own).toHaveValue('5');
    expect(own).toHaveAccessibleDescription('its own');

    await settle(() =>
      fireEvent.click(
        within(detail).getByRole('button', { name: 'Use the inherited value for Lines, at most' }),
      ),
    );
    expect(sent(send).at(-1)).toEqual({
      type: 'update-component',
      id: 'clinic.calendar',
      changes: { appearance: { detail: { lines: null } } },
    });
    expect(within(detail).getByRole('combobox', { name: 'Lines, at most' })).toHaveValue('3');

    undo();
    expect(within(detail).getByRole('combobox', { name: 'Lines, at most' })).toHaveValue('5');
    undo();
    const back = within(detail).getByRole('combobox', { name: 'Lines, at most' });
    expect(back).toHaveValue('3');
    expect(back).toHaveAccessibleDescription('from Essence');
  });

  it('places the text at the top, the middle or the bottom, inherited until set', async () => {
    const { send, inspector, undo } = await editCalendar();
    const detail = within(inspector).getByRole('region', { name: 'Detail' });
    const placement = within(detail).getByRole('combobox', { name: 'Where its text sits' });
    expect(placement).toHaveValue('middle');
    expect(placement).toHaveAccessibleDescription('from Essence');
    expect(
      within(placement)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['At the top', 'In the middle', 'At the bottom']);

    await settle(() => fireEvent.change(placement, { target: { value: 'top' } }));
    expect(sent(send)).toEqual([
      {
        type: 'update-component',
        id: 'clinic.calendar',
        changes: { appearance: { textPlacement: 'top' } },
      },
    ]);
    expect(
      within(detail).getByRole('combobox', { name: 'Where its text sits' }),
    ).toHaveAccessibleDescription('its own');

    await settle(() =>
      fireEvent.click(
        within(detail).getByRole('button', {
          name: 'Use the inherited value for Where its text sits',
        }),
      ),
    );
    expect(sent(send).at(-1)).toEqual({
      type: 'update-component',
      id: 'clinic.calendar',
      changes: { appearance: { textPlacement: null } },
    });
    expect(within(detail).getByRole('combobox', { name: 'Where its text sits' })).toHaveValue(
      'middle',
    );
    undo();
    expect(within(detail).getByRole('combobox', { name: 'Where its text sits' })).toHaveValue(
      'top',
    );
  });

  it('says that a shape drawing rows writes its name at the top, whatever the placement', async () => {
    const { inspector } = await editCalendar();
    const detail = within(inspector).getByRole('region', { name: 'Detail' });
    expect(
      within(detail).getByRole('combobox', { name: 'Where its text sits' }),
    ).toHaveAccessibleDescription('from Essence');
    await settle(() =>
      fireEvent.click(
        within(inspector).getByRole('checkbox', { name: 'Draw what its elements hold as rows' }),
      ),
    );
    expect(
      within(detail).getByRole('combobox', { name: 'Where its text sits' }),
    ).toHaveAccessibleDescription(
      'from Essence While it draws rows, it writes its name at the top.',
    );
  });

  it('shows the image it inherits, and shows none on request', async () => {
    const { send, inspector } = await editCalendar();
    const image = within(inspector).getByRole('group', { name: 'Image' });
    expect(image).toHaveAccessibleDescription('from Essence');
    expect(within(image).getByText('None')).toBeInTheDocument();
    await settle(() =>
      fireEvent.click(within(image).getByRole('button', { name: 'Show no image' })),
    );
    expect(sent(send)).toEqual([
      {
        type: 'update-component',
        id: 'clinic.calendar',
        changes: { appearance: { image: 'none' } },
      },
    ]);
    expect(within(inspector).getByRole('group', { name: 'Image' })).toHaveAccessibleDescription(
      'its own',
    );
  });

  it('gives a component open attributes, and inherits them again (ADR 0105)', async () => {
    const { send, inspector } = await editCalendar();
    const label = 'Its elements may carry attributes it does not define';
    const open = within(inspector).getByRole('checkbox', { name: label });
    expect(open).not.toBeChecked();
    expect(open).toHaveAccessibleDescription(/^from Essence/);
    await settle(() => fireEvent.click(open));
    expect(sent(send)).toEqual([
      { type: 'update-component', id: 'clinic.calendar', changes: { openAttributes: true } },
    ]);
    expect(within(inspector).getByRole('checkbox', { name: label })).toBeChecked();
    expect(within(inspector).getByRole('checkbox', { name: label })).toHaveAccessibleDescription(
      /^its own/,
    );
    await settle(() =>
      fireEvent.click(
        within(inspector).getByRole('button', { name: `Use the inherited value for ${label}` }),
      ),
    );
    expect(sent(send).at(-1)).toEqual({
      type: 'update-component',
      id: 'clinic.calendar',
      changes: { openAttributes: null },
    });
    expect(within(inspector).getByRole('checkbox', { name: label })).not.toBeChecked();
  });

  it('disables height and the shapes that cannot draw rows while it draws rows', async () => {
    const { inspector } = await editCalendar();
    await settle(() =>
      fireEvent.click(
        within(inspector).getByRole('checkbox', { name: 'Draw what its elements hold as rows' }),
      ),
    );
    // Database's cylinder cannot draw rows: the core refuses the two set together only, so the
    // inherited cylinder stays chosen and the others that cannot are disabled.
    const shape = within(inspector).getByRole('combobox', { name: 'Shape' });
    expect(within(shape).getByRole('option', { name: 'Ellipse' })).toBeDisabled();
    expect(within(shape).getByRole('option', { name: 'Rectangle' })).toBeEnabled();
    expect(within(inspector).getByRole('spinbutton', { name: 'Height' })).toBeDisabled();
  });

  it('counts what uses it, selects those elements, and cannot be removed while used', async () => {
    const { inspector, select } = await editCalendar();
    expect(within(inspector).getByText(/1 element is created from it/)).toBeInTheDocument();
    const remove = within(inspector).getByRole('button', { name: 'Remove the component' });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAccessibleDescription(/cannot be removed: 1 element use it/);
    await settle(() =>
      fireEvent.click(within(inspector).getByRole('button', { name: 'Select it' })),
    );
    expect([...select.mock.calls.at(-1)![0].elements]).toEqual(['appointments-db']);
    // Selecting shows the selection again.
    expect(
      within(inspector).queryByRole('heading', { name: 'Calendar, Component' }),
    ).not.toBeInTheDocument();
  });

  it('goes back to the selection, with the focus on its title', async () => {
    const { inspector } = await editCalendar();
    await settle(() =>
      fireEvent.click(within(inspector).getByRole('button', { name: 'Back to the selection' })),
    );
    expect(
      within(inspector).getByRole('heading', { name: 'Appointments DB, Calendar' }),
    ).toHaveFocus();
  });

  it('is read-only for a built-in component but for its colors, and offers to derive one', async () => {
    const { inspector, send } = renderEditor();
    const tab = screen.getByRole('region', { name: 'Components tab' });
    const systems = within(tab).getByRole('treeitem', { name: 'Systems, Built-in package' });
    expect(systems).toHaveAttribute('aria-expanded', 'false');
    act(() => systems.focus());
    fireEvent.keyDown(systems, { key: 'ArrowRight' });
    await settle(() =>
      fireEvent.click(within(tab).getByRole('treeitem', { name: /^Service, Component/ })),
    );
    expect(
      within(inspector).getByRole('heading', { name: 'Service, Built-in component' }),
    ).toBeInTheDocument();
    const identity = within(inspector).getByRole('region', { name: 'Identity' });
    expect(within(identity).getByRole('textbox', { name: 'Name' })).toBeDisabled();
    expect(within(inspector).getByRole('combobox', { name: 'Shape' })).toBeDisabled();
    expect(
      within(inspector).queryByRole('button', { name: /Use the inherited/ }),
    ).not.toBeInTheDocument();
    expect(
      within(inspector).queryByRole('button', { name: 'Remove the component' }),
    ).not.toBeInTheDocument();
    // Its colors change for this project only, in the project file (ADR-0034).
    const fill = within(inspector).getByLabelText('Fill');
    expect(fill).toBeEnabled();
    expect(fill).toHaveAccessibleDescription(
      'built in Saved in this project; the built-in package Systems stays as it is.',
    );
    await settle(() => fireEvent.change(fill, { target: { value: '#ffe3e3' } }));
    expect(sent(send)).toEqual([
      {
        type: 'set-component-appearance',
        component: 'systems.service',
        appearanceTraits: { fill: '#FFE3E3' },
      },
    ]);
    expect(within(inspector).getByLabelText('Fill')).toHaveAccessibleDescription(
      /^set in this project/,
    );
    await settle(() =>
      fireEvent.click(
        within(inspector).getByRole('button', { name: 'Use the inherited color for Fill' }),
      ),
    );
    expect(sent(send).at(-1)).toEqual({
      type: 'set-component-appearance',
      component: 'systems.service',
      appearanceTraits: { fill: null },
    });
    expect(within(inspector).getByLabelText('Fill')).toHaveValue('#dcebff');
    await settle(() =>
      fireEvent.click(
        within(inspector).getByRole('button', { name: 'Derive a component from “Service”' }),
      ),
    );
    expect(within(inspector).getByRole('form', { name: 'Derive a component' })).toBeVisible();
  });
});

describe('deriving', () => {
  it('derives a component from a built-in one as one action, create-only, and uses it for the element', async () => {
    const { inspector, send } = renderEditor({ selected: [element('appointments-api')] });
    await settle(() =>
      fireEvent.click(
        within(inspector).getByRole('button', { name: 'Derive a component from “Service”' }),
      ),
    );
    const form = within(inspector).getByRole('form', { name: 'Derive a component' });
    expect(
      within(form).getByRole('heading', { name: 'Derive a component, from Service' }),
    ).toHaveFocus();
    expect(within(form).getByRole('textbox', { name: 'Name' })).toHaveValue('Service');
    expect(within(form).getByRole('combobox', { name: 'Package' })).toHaveValue('clinic');
    expect(
      within(form).getByRole('checkbox', { name: 'Use it for “Appointments API”' }),
    ).toBeChecked();
    fireEvent.change(within(form).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Booking API' },
    });
    await settle(() => fireEvent.submit(form));

    const [command] = sent(send);
    expect(send).toHaveBeenCalledTimes(1);
    if (command?.type !== 'batch') throw new Error('not a batch');
    expect(command.label).toBe('Derive the component "Booking API"');
    const [define, use] = command.commands;
    expect(define).toMatchObject({
      type: 'define-component',
      package: 'clinic',
      component: { name: 'Booking API', derivesFrom: 'systems.service' },
      createOnly: true,
    });
    const id = define?.type === 'define-component' ? define.component.id : undefined;
    expect(id).toMatch(/^clinic\.booking-api-[0-9a-z]{6}$/);
    expect(use).toEqual({
      type: 'update-element',
      id: 'appointments-api',
      changes: { component: id },
    });
    // The component editor shows what it made.
    expect(
      within(inspector).getByRole('heading', { name: 'Booking API, Component' }),
    ).toHaveFocus();
  });

  it('offers a new package when the project has none of its own, with an id that can be changed', async () => {
    const own = executeCommand(sample, {
      type: 'update-element',
      id: 'appointments-db',
      changes: { component: 'systems.database' },
    });
    if (!own.ok) throw new Error('refused');
    const none: ProjectSnapshot = {
      ...own.state,
      project: { ...own.state.project, packages: ['systems'] },
      packages: own.state.packages.filter((file) => file.id !== 'clinic'),
    };
    const { inspector, send } = renderEditor({ project: none, selected: [element('patient')] });
    await settle(() =>
      fireEvent.click(
        within(inspector).getByRole('button', { name: 'Derive a component from “Person”' }),
      ),
    );
    const form = within(inspector).getByRole('form', { name: 'Derive a component' });
    expect(within(form).getByRole('combobox', { name: 'Package' })).toHaveValue('');
    expect(within(form).getByRole('textbox', { name: 'Name of the new package' })).toHaveValue(
      'My systems',
    );
    const id = within(form).getByRole('textbox', { name: 'Its id' });
    expect(id).toHaveValue('my-systems');
    fireEvent.change(id, { target: { value: 'systems' } });
    await settle(() => fireEvent.submit(form));
    expect(send).not.toHaveBeenCalled();
    expect(within(form).getByRole('alert')).toHaveTextContent(
      'The id "systems" is the built-in package Systems’s.',
    );
    fireEvent.change(id, { target: { value: 'clinic' } });
    await settle(() => fireEvent.submit(form));
    const [command] = sent(send);
    expect(command?.type === 'batch' && command.commands[0]).toEqual({
      type: 'create-package',
      package: { id: 'clinic', name: 'My systems' },
    });
  });

  it('undoes each step one at a time: the trait, then the derive', async () => {
    const { inspector, undo } = renderEditor({ selected: [element('appointments-api')] });
    await settle(() =>
      fireEvent.click(
        within(inspector).getByRole('button', { name: 'Derive a component from “Service”' }),
      ),
    );
    await settle(() =>
      fireEvent.submit(within(inspector).getByRole('form', { name: 'Derive a component' })),
    );
    const fill = within(inspector).getByLabelText('Fill');
    expect(fill).toHaveValue('#dcebff');
    await settle(() => fireEvent.change(fill, { target: { value: '#445566' } }));
    expect(within(inspector).getByLabelText('Fill')).toHaveValue('#445566');
    undo();
    expect(within(inspector).getByLabelText('Fill')).toHaveValue('#dcebff');
    undo();
    expect(within(inspector).getByText(/No package in use defines the component/)).toBeVisible();
  });
});

describe('the relation type editor', () => {
  it('opens from the relation inspector, and changes direction and limits trait by trait', async () => {
    const project = executeCommand(sample, {
      type: 'update-relation',
      id: 'api-to-reminders',
      changes: { relationType: 'clinic.reminds' },
    });
    if (!project.ok) throw new Error('refused');
    const { inspector, send } = renderEditor({
      project: project.state,
      selected: [relation('api-to-reminders')],
    });
    await settle(() =>
      fireEvent.click(within(inspector).getByRole('button', { name: 'Edit “reminds”' })),
    );
    const direction = within(inspector).getByRole('combobox', { name: 'Direction' });
    expect(direction).toHaveValue('inherit');
    expect(within(direction).getByRole('option', { name: 'Inherited (directed)' })).toBeVisible();
    await settle(() => fireEvent.change(direction, { target: { value: 'undirected' } }));
    const to = within(inspector).getByRole('combobox', { name: 'To end' });
    expect(to).toHaveValue('list');
    expect(to).toHaveAccessibleDescription('its own');
    await settle(() => fireEvent.change(to, { target: { value: 'any' } }));
    const from = within(inspector).getByRole('combobox', { name: 'From end' });
    expect(within(from).getByRole('option', { name: 'Inherited (any)' })).toBeVisible();
    expect(
      sent(send).map((command) => command.type === 'update-relation-type' && command.changes),
    ).toEqual([{ direction: 'undirected' }, { limits: { to: 'any' } }]);
  });

  it('cannot stop nesting while a view nests by it, and says which', async () => {
    const defined = executeCommand(sample, {
      type: 'batch',
      label: 'Nest',
      commands: [
        {
          type: 'define-relation-type',
          package: 'clinic',
          relationType: {
            id: 'clinic.runs-in',
            name: 'runs in',
            derivesFrom: 'relates-to',
            nests: true,
          },
        },
        {
          type: 'update-view',
          id: 'system-overview',
          changes: { nestingRelationTypes: ['systems.is-part-of', 'clinic.runs-in'] },
        },
      ],
    });
    if (!defined.ok) throw new Error('refused');
    const { inspector } = renderEditor({ project: defined.state });
    const tab = screen.getByRole('region', { name: 'Components tab' });
    await settle(() => fireEvent.click(within(tab).getByRole('treeitem', { name: /runs in/ })));
    const nests = within(inspector).getByRole('combobox', { name: 'Nests' });
    expect(within(nests).getByRole('option', { name: 'Does not nest' })).toBeDisabled();
    expect(within(nests).getByRole('option', { name: 'Inherited (does not nest)' })).toBeDisabled();
    expect(nests).toHaveAccessibleDescription(
      /It cannot stop nesting while “System overview” nests by it/,
    );
  });
});

describe('the package editor', () => {
  it('renames a package of the project’s own, and cannot remove it while anything comes from it', async () => {
    const { inspector, send } = renderEditor();
    const tab = screen.getByRole('region', { name: 'Components tab' });
    await settle(() =>
      fireEvent.click(within(tab).getByRole('treeitem', { name: 'Clinic, Package' })),
    );
    await enter(within(inspector).getByRole('textbox', { name: 'Name' }), 'Our clinic');
    expect(sent(send)).toEqual([
      { type: 'update-package', id: 'clinic', changes: { name: 'Our clinic' } },
    ]);
    const remove = within(inspector).getByRole('button', { name: 'Remove this package' });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAccessibleDescription(/cannot stop using the package "clinic"/);
  });

  it('creates a package with the id it proposes, refusing one Visual Anything keeps', async () => {
    const { inspector, send } = renderEditor();
    const tab = screen.getByRole('region', { name: 'Components tab' });
    await settle(() => fireEvent.click(within(tab).getByRole('button', { name: 'New package' })));
    const form = within(inspector).getByRole('form', { name: 'New package' });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Neuroscience' },
    });
    expect(within(form).getByRole('textbox', { name: 'Id' })).toHaveValue('neuroscience-2');
    fireEvent.change(within(form).getByRole('textbox', { name: 'Id' }), {
      target: { value: 'neuroscience' },
    });
    await settle(() => fireEvent.submit(form));
    expect(send).not.toHaveBeenCalled();
    expect(within(form).getByRole('alert')).toHaveTextContent(/keeps the id "neuroscience"/);
    fireEvent.change(within(form).getByRole('textbox', { name: 'Id' }), {
      target: { value: 'brain' },
    });
    await settle(() => fireEvent.submit(form));
    expect(sent(send)).toEqual([
      { type: 'create-package', package: { id: 'brain', name: 'Neuroscience' } },
    ]);
    expect(within(inspector).getByRole('heading', { name: 'Neuroscience, Package' })).toHaveFocus();
  });
});

describe('while the project cannot be changed', () => {
  it('shows the editor read-only', async () => {
    const { inspector } = await editCalendar({ editable: false });
    const identity = within(inspector).getByRole('region', { name: 'Identity' });
    expect(within(identity).getByRole('textbox', { name: 'Name' })).toBeDisabled();
    expect(within(inspector).getByLabelText('Fill')).toBeDisabled();
    expect(
      within(inspector).queryByRole('form', { name: 'New attribute' }),
    ).not.toBeInTheDocument();
  });
});
