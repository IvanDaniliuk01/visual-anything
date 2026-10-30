/**
 * The Face section of the component editor, and an element's own face in the inspector (ADR 0083):
 * the markup, its variants and the style in text areas with their line numbers; problems at their
 * lines and columns, which move the caret there; a live preview on an element; and Apply, one
 * command with the parts that changed, which undo takes back. Typing sends nothing.
 */
import type { Command, ProjectSnapshot } from '@visual-anything/core';
import type { Face } from '@visual-anything/schema';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { SendCommand } from '../../canvas/CanvasArea';
import type { Selectable, Selection } from '../../editor/selection';
import { LanguageProvider } from '../../i18n/LanguageProvider';
import { DefinitionsHarness, type HarnessControls } from '../../test/DefinitionsHarness';
import { loadSample } from '../../test/sample';

const sample = loadSample();
const CALENDAR = 'clinic.calendar';

function sent(send: Mock<SendCommand>): Command[] {
  return send.mock.calls.map(([command]) => command);
}

async function settle(action: () => void): Promise<void> {
  await act(async () => {
    action();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The sample with Calendar's own face, as its package holds it. */
function withCalendarFace(face: Face): ProjectSnapshot {
  return {
    ...sample,
    packages: sample.packages.map((file) => ({
      ...file,
      components: file.components.map((component) =>
        component.id === CALENDAR
          ? { ...component, appearance: { ...component.appearance, face } }
          : component,
      ),
    })),
  };
}

interface Setup {
  project?: ProjectSnapshot;
  language?: 'en' | 'es';
}

/** Opens the editor of the Appointments DB's component, Calendar, from the element inspector. */
async function editCalendar({ project = sample, language = 'en' }: Setup = {}) {
  const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
  let controls: HarnessControls | undefined;
  const selected: Selectable[] = [{ kind: 'element', id: 'appointments-db' }];
  render(
    <LanguageProvider language={language}>
      <DefinitionsHarness
        project={project}
        selected={selected}
        editable
        send={send}
        select={vi.fn<(selection: Selection) => void>()}
        onReady={(ready) => (controls = ready)}
      />
    </LanguageProvider>,
  );
  const inspector = screen.getByRole('complementary', { name: 'Inspector' });
  const opener = within(inspector).getByRole('button', {
    name: language === 'es' ? /^Editar “/ : /^Edit “/,
  });
  await settle(() => fireEvent.click(opener));
  const section = within(inspector).getByRole('region', {
    name: language === 'es' ? 'Cara' : 'Face',
  });
  return { send, inspector, section, undo: () => controls!.undo() };
}

const markupOf = (section: HTMLElement) =>
  within(section).getByRole('textbox', { name: 'Markup, in a subset of HTML' });
const styleOf = (section: HTMLElement) =>
  within(section).getByRole('textbox', { name: 'Style, in a subset of CSS' });

describe('the Face section', () => {
  it('says a component without a face shows its name and detail, and offers a face to start from', async () => {
    const { section, send } = await editCalendar();
    expect(within(section).getByText('None: its shapes show their name and detail.')).toBeTruthy();
    expect(markupOf(section)).toHaveValue('');
    expect(within(section).getByText('No markup to preview.')).toBeTruthy();
    await settle(() =>
      fireEvent.click(
        within(section).getByRole('button', {
          name: 'Start from a face that writes its name and detail',
        }),
      ),
    );
    expect(markupOf(section)).toHaveValue(
      '<b>{{name}}</b>\n<p class="detail"><detail/></p>\n<p class="badges"><badges/></p>',
    );
    // A live preview on the selected element, and nothing sent while typing.
    expect(
      within(section).getByRole('img', { name: /^Preview of its face: Appointments DB/ }),
    ).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });

  it('applies the typed face as one command, and undo takes it back', async () => {
    const { section, send, undo } = await editCalendar();
    fireEvent.change(markupOf(section), {
      target: { value: '<b>{{name}}</b>\n<p if="timezone">{{timezone}}</p>' },
    });
    fireEvent.change(styleOf(section), { target: { value: 'b { font-size: 14px; }' } });
    expect(
      within(section).getByRole('img', {
        name: 'Preview of its face: Appointments DB, America/Argentina/Buenos_Aires',
      }),
    ).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
    await settle(() => fireEvent.click(within(section).getByRole('button', { name: 'Apply' })));
    expect(sent(send)).toEqual([
      {
        type: 'set-component-appearance',
        component: CALENDAR,
        appearanceTraits: {
          face: {
            markup: ['<b>{{name}}</b>', '<p if="timezone">{{timezone}}</p>'],
            style: ['b { font-size: 14px; }'],
          },
        },
      },
    ]);
    expect(within(section).getByText('A face, with no variants.')).toBeTruthy();
    expect(within(section).getByRole('group', { name: 'Its face' })).toHaveAccessibleDescription(
      /^its own/,
    );
    // Restyled only: the one part that changed.
    fireEvent.change(styleOf(section), { target: { value: 'b { font-size: 16px; }' } });
    await settle(() => fireEvent.click(within(section).getByRole('button', { name: 'Apply' })));
    expect(sent(send).at(-1)).toEqual({
      type: 'set-component-appearance',
      component: CALENDAR,
      appearanceTraits: { face: { style: ['b { font-size: 16px; }'] } },
    });
    await settle(() => undo());
    await settle(() => undo());
    expect(markupOf(section)).toHaveValue('');
  });

  it('lists problems at their lines and columns, keeps Apply off for errors, and moves to one', async () => {
    const { section, send } = await editCalendar();
    fireEvent.change(markupOf(section), {
      target: { value: '<b>{{name}}</b>\n  <img src="x"/>' },
    });
    const problem = within(section).getByRole('button', {
      name: 'Line 2, column 3 of the markup: <img> is not part of a face: nothing in a face runs or is fetched.',
    });
    expect(within(section).getByText('Fix these before it can be applied:')).toBeTruthy();
    expect(within(section).getByRole('button', { name: 'Apply' })).toBeDisabled();
    expect(
      within(section).getByText('The preview shows once the face has no errors.'),
    ).toBeTruthy();
    await settle(() => fireEvent.click(problem));
    const area = markupOf(section) as HTMLTextAreaElement;
    expect(area).toHaveFocus();
    expect(area.selectionStart).toBe('<b>{{name}}</b>\n  '.length);
    // Warnings let it be applied.
    fireEvent.change(markupOf(section), { target: { value: '<p>{{nope}}</p>' } });
    expect(within(section).getByText('It can be applied; it warns about:')).toBeTruthy();
    expect(
      within(section).getByRole('button', {
        name: 'Line 1, column 4 of the markup: it names the attribute "nope", which the component does not have.',
      }),
    ).toBeTruthy();
    expect(within(section).getByRole('button', { name: 'Apply' })).toBeEnabled();
    expect(send).not.toHaveBeenCalled();
  });

  it('edits a variant’s markup, names the collapsed one, and previews it', async () => {
    const project = withCalendarFace({
      markup: ['<b>{{name}}</b>', '<p>{{engine}}</p>'],
      variants: [{ id: 'far', markup: ['<b>{{name}}</b>'] }],
    });
    const { section, send } = await editCalendar({ project });
    expect(within(section).getByText('A face, with 1 variant.')).toBeTruthy();
    const which = within(section).getByRole('combobox', { name: 'Markup of' });
    fireEvent.change(which, { target: { value: 'variant:far' } });
    const variant = within(section).getByRole('textbox', {
      name: 'Markup of the variant "far"',
    });
    expect(variant).toHaveValue('<b>{{name}}</b>');
    fireEvent.change(variant, { target: { value: '<i>{{name}}</i>' } });
    fireEvent.change(within(section).getByRole('combobox', { name: 'Showing' }), {
      target: { value: 'far' },
    });
    expect(
      within(section).getByRole('img', { name: 'Preview of its face: Appointments DB' }),
    ).toBeTruthy();
    // A new variant, named for collapsed containers.
    fireEvent.change(within(section).getByRole('textbox', { name: 'New variant’s id' }), {
      target: { value: 'closed' },
    });
    fireEvent.click(within(section).getByRole('button', { name: 'Add a variant' }));
    fireEvent.change(within(section).getByRole('combobox', { name: 'Collapsed, it shows' }), {
      target: { value: 'closed' },
    });
    await settle(() => fireEvent.click(within(section).getByRole('button', { name: 'Apply' })));
    expect(sent(send)).toEqual([
      {
        type: 'set-component-appearance',
        component: CALENDAR,
        appearanceTraits: {
          face: {
            variants: [
              { id: 'far', markup: ['<i>{{name}}</i>'] },
              { id: 'closed', markup: ['<b>{{name}}</b>', '<p>{{engine}}</p>'] },
            ],
            collapsed: 'closed',
          },
        },
      },
    ]);
  });

  it('takes the face away with Show no face, and gives a built-in component one in the project file', async () => {
    const project = withCalendarFace({ markup: ['<b>{{name}}</b>'] });
    const { section, send } = await editCalendar({ project });
    await settle(() =>
      fireEvent.click(within(section).getByRole('button', { name: 'Show no face' })),
    );
    expect(sent(send)).toEqual([
      {
        type: 'set-component-appearance',
        component: CALENDAR,
        appearanceTraits: { face: 'none' },
      },
    ]);
    expect(
      within(section).getByText('None: its shapes show no face, whatever is inherited.'),
    ).toBeTruthy();
  });

  it('reads in Spanish, problems included', async () => {
    const { section } = await editCalendar({ language: 'es' });
    const markup = within(section).getByRole('textbox', {
      name: 'Marcado, en una parte de HTML',
    });
    fireEvent.change(markup, { target: { value: '<b>{{name}}</b>\n  <img src="x"/>' } });
    expect(
      within(section).getByRole('button', {
        name: 'Línea 2, columna 3 del marcado: <img> no es parte de una cara: nada en una cara se ejecuta ni se descarga.',
      }),
    ).toBeTruthy();
    expect(within(section).getByRole('button', { name: 'Aplicar' })).toBeDisabled();
  });
});

describe('an element’s own face', () => {
  it('is a particularity of the element, applied with update-element', async () => {
    const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    render(
      <LanguageProvider language="en">
        <DefinitionsHarness
          project={withCalendarFace({ markup: ['<b>{{name}}</b>'] })}
          selected={[{ kind: 'element', id: 'appointments-db' }]}
          editable
          send={send}
          select={vi.fn<(selection: Selection) => void>()}
          onReady={() => {}}
        />
      </LanguageProvider>,
    );
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    const trait = within(inspector).getByRole('group', { name: 'Face' });
    expect(trait).toHaveAccessibleDescription(/^from Calendar/);
    const markup = within(trait).getByRole('textbox', { name: 'Markup, in a subset of HTML' });
    expect(markup).toHaveValue('<b>{{name}}</b>');
    fireEvent.change(markup, { target: { value: '<i>{{name}}</i>\n<p>{{sizeGb}}</p>' } });
    expect(
      within(trait).getByRole('img', { name: 'Preview of its face: Appointments DB, 12' }),
    ).toBeTruthy();
    await settle(() => fireEvent.click(within(trait).getByRole('button', { name: 'Apply' })));
    expect(sent(send)).toEqual([
      {
        type: 'update-element',
        id: 'appointments-db',
        changes: {
          appearanceTraits: { face: { markup: ['<i>{{name}}</i>', '<p>{{sizeGb}}</p>'] } },
        },
      },
    ]);
    await settle(() =>
      fireEvent.click(
        within(inspector).getByRole('button', {
          name: 'Use the component’s face for Face',
        }),
      ),
    );
    expect(sent(send).at(-1)).toEqual({
      type: 'update-element',
      id: 'appointments-db',
      changes: { appearanceTraits: { face: null } },
    });
  });
});
