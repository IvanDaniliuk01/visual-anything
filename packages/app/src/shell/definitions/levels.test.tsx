/**
 * Levels of detail in the component editor (ADR 0055): a component's levels, sorted by the zoom each
 * starts at, each with what it shows; adding, changing and removing them, and the zoom a collapsed
 * container expands from, each one `set-component-appearance`; and where each comes from.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { Face, LevelOfDetail } from '@visual-anything/schema';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { SendCommand } from '../../canvas/CanvasArea';
import type { Selectable, Selection } from '../../editor/selection';
import { LanguageProvider } from '../../i18n/LanguageProvider';
import { DefinitionsHarness } from '../../test/DefinitionsHarness';
import { loadSample } from '../../test/sample';

const sample = loadSample();
const CALENDAR = 'clinic.calendar';

interface Setup {
  project?: ProjectSnapshot;
  editable?: boolean;
  language?: 'en' | 'es';
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

async function enter(control: HTMLElement, value: string): Promise<void> {
  fireEvent.change(control, { target: { value } });
  await settle(() => fireEvent.keyDown(control, { key: 'Enter' }));
}

/** Opens the editor of the Appointments DB's component, Calendar, from the element inspector. */
async function editComponentOf({ project = sample, editable = true, language = 'en' }: Setup = {}) {
  const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
  const selected: Selectable[] = [{ kind: 'element', id: 'appointments-db' }];
  render(
    <LanguageProvider language={language}>
      <DefinitionsHarness
        project={project}
        selected={selected}
        editable={editable}
        send={send}
        select={vi.fn<(selection: Selection) => void>()}
        onReady={() => {}}
      />
    </LanguageProvider>,
  );
  const inspector = screen.getByRole('complementary', { name: 'Inspector' });
  const opener = within(inspector).getByRole('button', {
    name: language === 'es' ? /^Editar “/ : /^Edit “/,
  });
  await settle(() => fireEvent.click(opener));
  return { send, inspector };
}

/** Opens the editor of the built-in Service, from the Components tab. */
async function editService() {
  const opened = await editComponentOf();
  const tab = screen.getByRole('region', { name: 'Components tab' });
  const systems = within(tab).getByRole('treeitem', { name: 'Systems, Built-in package' });
  act(() => systems.focus());
  fireEvent.keyDown(systems, { key: 'ArrowRight' });
  await settle(() =>
    fireEvent.click(within(tab).getByRole('treeitem', { name: /^Service, Component/ })),
  );
  return opened;
}

/** The sample with Calendar's own levels, as its file holds them, in that order. */
function withCalendarLevels(
  levels: LevelOfDetail[],
  expandFrom?: number,
  face?: Face,
): ProjectSnapshot {
  return {
    ...sample,
    packages: sample.packages.map((file) => ({
      ...file,
      components: file.components.map((component) =>
        component.id === CALENDAR
          ? {
              ...component,
              appearance: {
                ...component.appearance,
                levels,
                ...(expandFrom === undefined ? {} : { expandFrom }),
                ...(face === undefined ? {} : { face }),
              },
            }
          : component,
      ),
    })),
  };
}

function section(inspector: HTMLElement): HTMLElement {
  return within(inspector).getByRole('region', { name: 'Levels of detail' });
}

/** Each level the section lists, by its group. */
function levelsIn(inspector: HTMLElement): HTMLElement[] {
  return within(section(inspector)).queryAllByRole('group', { name: /^Level from / });
}

describe('levels of detail in the component editor', () => {
  it('says a component without levels follows the canvas’s defaults, as inherited', async () => {
    const { inspector } = await editComponentOf();
    const levels = section(inspector);
    const trait = within(levels).getByRole('group', { name: 'What its shapes show as you zoom' });
    expect(trait).toHaveAccessibleDescription(/^built in, from Essence/);
    expect(within(levels).getByText(/^None: its shapes follow the canvas’s defaults/)).toBeTruthy();
    expect(levelsIn(inspector)).toHaveLength(0);
    const expand = within(levels).getByRole('spinbutton', {
      name: 'Expand a collapsed container from a zoom of (%)',
    });
    expect(expand).toHaveValue(null);
  });

  it('lists levels by the zoom each starts at, with what each shows', async () => {
    const project = withCalendarLevels([
      { from: 0.9, shows: ['name', 'detail'] },
      { from: 0.3, shows: ['silhouette'] },
    ]);
    const { inspector } = await editComponentOf({ project });
    const [first, second] = levelsIn(inspector);
    expect(first).toHaveAccessibleName('Level from 30%');
    expect(second).toHaveAccessibleName('Level from 90%');
    expect(within(first!).getByRole('checkbox', { name: 'A silhouette only' })).toBeChecked();
    expect(within(first!).getByRole('checkbox', { name: 'Name' })).not.toBeChecked();
    expect(within(second!).getByRole('checkbox', { name: 'Name' })).toBeChecked();
    expect(within(second!).getByRole('checkbox', { name: 'Detail' })).toBeChecked();
    expect(within(second!).getByRole('checkbox', { name: 'Contents or rows' })).not.toBeChecked();
    expect(
      within(section(inspector)).getByRole('group', { name: 'What its shapes show as you zoom' }),
    ).toHaveAccessibleDescription(/^its own/);
  });

  it('adds a level, one command at the level the project changes', async () => {
    const { send, inspector } = await editComponentOf();
    await settle(() =>
      fireEvent.click(within(section(inspector)).getByRole('button', { name: 'Add a level' })),
    );
    expect(sent(send)).toEqual([
      {
        type: 'set-component-appearance',
        component: CALENDAR,
        appearanceTraits: { levels: [{ from: 0.45, shows: ['name'] }] },
      },
    ]);
    expect(levelsIn(inspector)).toHaveLength(1);
    // The next one starts further in, and shows the detail too.
    await settle(() =>
      fireEvent.click(within(section(inspector)).getByRole('button', { name: 'Add a level' })),
    );
    expect(sent(send).at(-1)).toEqual({
      type: 'set-component-appearance',
      component: CALENDAR,
      appearanceTraits: {
        levels: [
          { from: 0.45, shows: ['name'] },
          { from: 0.9, shows: ['name', 'detail'] },
        ],
      },
    });
  });

  it('shows the face, and the variant of it a level names (ADR 0083)', async () => {
    const face: Face = {
      markup: ['<b>{{name}}</b>'],
      variants: [{ id: 'far', markup: ['<b>{{name}}</b>'] }],
    };
    const project = withCalendarLevels([{ from: 0.5, shows: ['name'] }], undefined, face);
    const { send, inspector } = await editComponentOf({ project });
    const level = () => levelsIn(inspector)[0]!;
    // No variant to choose until the level shows the face.
    expect(within(level()).queryByRole('combobox', { name: 'Its face shows' })).toBeNull();
    await settle(() => fireEvent.click(within(level()).getByRole('checkbox', { name: 'Face' })));
    expect(sent(send).at(-1)).toMatchObject({
      appearanceTraits: { levels: [{ from: 0.5, shows: ['name', 'face'] }] },
    });
    const variant = within(level()).getByRole('combobox', { name: 'Its face shows' });
    expect(variant).toHaveValue('');
    await settle(() => fireEvent.change(variant, { target: { value: 'far' } }));
    expect(sent(send).at(-1)).toMatchObject({
      appearanceTraits: { levels: [{ from: 0.5, shows: ['name', 'face'], face: 'far' }] },
    });
    // Unchecking the face lets its variant go.
    await settle(() => fireEvent.click(within(level()).getByRole('checkbox', { name: 'Face' })));
    expect(sent(send).at(-1)).toEqual({
      type: 'set-component-appearance',
      component: CALENDAR,
      appearanceTraits: { levels: [{ from: 0.5, shows: ['name'] }] },
    });
  });

  it('changes what a level shows, a silhouette excluding everything else', async () => {
    const project = withCalendarLevels([{ from: 0.5, shows: ['name'] }]);
    const { send, inspector } = await editComponentOf({ project });
    const level = () => levelsIn(inspector)[0]!;
    await settle(() => fireEvent.click(within(level()).getByRole('checkbox', { name: 'Image' })));
    expect(sent(send).at(-1)).toEqual({
      type: 'set-component-appearance',
      component: CALENDAR,
      appearanceTraits: { levels: [{ from: 0.5, shows: ['name', 'image'] }] },
    });
    await settle(() =>
      fireEvent.click(within(level()).getByRole('checkbox', { name: 'A silhouette only' })),
    );
    expect(sent(send).at(-1)).toMatchObject({
      appearanceTraits: { levels: [{ from: 0.5, shows: ['silhouette'] }] },
    });
    expect(within(level()).getByRole('checkbox', { name: 'Name' })).not.toBeChecked();
    // Any other part takes the silhouette's place.
    await settle(() => fireEvent.click(within(level()).getByRole('checkbox', { name: 'Detail' })));
    expect(sent(send).at(-1)).toMatchObject({
      appearanceTraits: { levels: [{ from: 0.5, shows: ['detail'] }] },
    });
    // A level that shows nothing shows its silhouette.
    await settle(() => fireEvent.click(within(level()).getByRole('checkbox', { name: 'Detail' })));
    expect(sent(send).at(-1)).toMatchObject({
      appearanceTraits: { levels: [{ from: 0.5, shows: ['silhouette'] }] },
    });
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('moves a level to another zoom, keeping the list sorted, and says why a zoom cannot be used', async () => {
    const project = withCalendarLevels([
      { from: 0.3, shows: ['name'] },
      { from: 0.9, shows: ['name', 'detail'] },
    ]);
    const { send, inspector } = await editComponentOf({ project });
    const from = within(levelsIn(inspector)[1]!).getByRole('spinbutton', {
      name: 'From a zoom of (%)',
    });
    await enter(from, '20');
    expect(sent(send)).toEqual([
      {
        type: 'set-component-appearance',
        component: CALENDAR,
        appearanceTraits: {
          levels: [
            { from: 0.2, shows: ['name', 'detail'] },
            { from: 0.3, shows: ['name'] },
          ],
        },
      },
    ]);
    const again = within(levelsIn(inspector)[0]!).getByRole('spinbutton', {
      name: 'From a zoom of (%)',
    });
    await enter(again, '900');
    expect(send).toHaveBeenCalledTimes(1);
    expect(again).toHaveAccessibleDescription(/Enter a zoom from 0% to 800%\./);
  });

  it('says inline why the core refuses two levels at one zoom', async () => {
    const project = withCalendarLevels([
      { from: 0.3, shows: ['name'] },
      { from: 0.9, shows: ['name', 'detail'] },
    ]);
    const { send, inspector } = await editComponentOf({ project });
    const from = within(levelsIn(inspector)[1]!).getByRole('spinbutton', {
      name: 'From a zoom of (%)',
    });
    await enter(from, '30');
    expect(send).not.toHaveBeenCalled();
    expect(within(section(inspector)).getByText(/Two levels of .* start at 0\.3\./)).toBeTruthy();
  });

  it('removes a level, follows the canvas’s defaults, and inherits the levels again', async () => {
    const project = withCalendarLevels([
      { from: 0.3, shows: ['name'] },
      { from: 0.9, shows: ['name', 'detail'] },
    ]);
    const { send, inspector } = await editComponentOf({ project });
    await settle(() =>
      fireEvent.click(
        within(section(inspector)).getByRole('button', { name: 'Remove the level from 30%' }),
      ),
    );
    expect(sent(send).at(-1)).toMatchObject({
      appearanceTraits: { levels: [{ from: 0.9, shows: ['name', 'detail'] }] },
    });
    await settle(() =>
      fireEvent.click(
        within(section(inspector)).getByRole('button', { name: 'Follow the canvas’s defaults' }),
      ),
    );
    expect(sent(send).at(-1)).toMatchObject({ appearanceTraits: { levels: [] } });
    // An empty list is its own: it follows the canvas's steps whatever it inherits.
    expect(
      within(section(inspector)).getByRole('group', { name: 'What its shapes show as you zoom' }),
    ).toHaveAccessibleDescription(/^its own/);
    await settle(() =>
      fireEvent.click(
        within(section(inspector)).getByRole('button', {
          name: 'Use the inherited value for What its shapes show as you zoom',
        }),
      ),
    );
    expect(sent(send).at(-1)).toEqual({
      type: 'set-component-appearance',
      component: CALENDAR,
      appearanceTraits: { levels: null },
    });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('sets the zoom a collapsed container expands from, and takes it back', async () => {
    const { send, inspector } = await editComponentOf();
    const expand = () =>
      within(section(inspector)).getByRole('spinbutton', {
        name: 'Expand a collapsed container from a zoom of (%)',
      });
    await enter(expand(), '150');
    expect(sent(send)).toEqual([
      {
        type: 'set-component-appearance',
        component: CALENDAR,
        appearanceTraits: { expandFrom: 1.5 },
      },
    ]);
    expect(expand()).toHaveValue(150);
    expect(expand()).toHaveAccessibleDescription(/^its own/);
    await enter(expand(), '0');
    expect(send).toHaveBeenCalledTimes(1);
    expect(expand()).toHaveAccessibleDescription(/Enter a zoom above 0%, at most 800%\./);
    await enter(expand(), '');
    expect(sent(send).at(-1)).toEqual({
      type: 'set-component-appearance',
      component: CALENDAR,
      appearanceTraits: { expandFrom: null },
    });
  });

  it('shows what a component inherits from the one it derives from', async () => {
    const outcome = executeCommand(sample, {
      type: 'set-component-appearance',
      component: 'systems.database',
      appearanceTraits: { levels: [{ from: 0.6, shows: ['name'] }], expandFrom: 2 },
    });
    if (!outcome.ok) throw new Error('Refused.');
    const { inspector } = await editComponentOf({ project: outcome.state });
    expect(levelsIn(inspector)).toHaveLength(1);
    expect(levelsIn(inspector)[0]).toHaveAccessibleName('Level from 60%');
    expect(
      within(section(inspector)).getByRole('group', { name: 'What its shapes show as you zoom' }),
    ).toHaveAccessibleDescription(/^from Database, set in this project/);
    const expand = within(section(inspector)).getByRole('spinbutton', {
      name: 'Expand a collapsed container from a zoom of (%)',
    });
    expect(expand).toHaveValue(200);
    expect(expand).toHaveAccessibleDescription(/^from Database, set in this project/);
  });

  it('gives a built-in component levels in the project file', async () => {
    const { send, inspector } = await editService();
    expect(
      within(section(inspector)).getByText(/^Saved in this project; the built-in package/),
    ).toBeTruthy();
    await settle(() =>
      fireEvent.click(within(section(inspector)).getByRole('button', { name: 'Add a level' })),
    );
    expect(sent(send)).toEqual([
      {
        type: 'set-component-appearance',
        component: 'systems.service',
        appearanceTraits: { levels: [{ from: 0.45, shows: ['name'] }] },
      },
    ]);
  });

  it('changes nothing while the project cannot be changed', async () => {
    const project = withCalendarLevels([{ from: 0.5, shows: ['name'] }]);
    const { inspector } = await editComponentOf({ project, editable: false });
    expect(within(section(inspector)).queryByRole('button', { name: 'Add a level' })).toBeNull();
    for (const box of within(section(inspector)).getAllByRole('checkbox')) {
      expect(box).toBeDisabled();
    }
  });

  it('reads in Spanish', async () => {
    const project = withCalendarLevels([{ from: 0.5, shows: ['name'] }]);
    const { inspector } = await editComponentOf({ project, language: 'es' });
    const levels = within(inspector).getByRole('region', { name: 'Niveles de detalle' });
    // Spanish writes a no-break space before the percent sign.
    expect(within(levels).getByRole('group', { name: 'Nivel desde 50 %' })).toBeTruthy();
    expect(within(levels).getByRole('button', { name: 'Agregar un nivel' })).toBeTruthy();
  });
});
