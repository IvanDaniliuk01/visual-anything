/**
 * An appearance's explorable set in the app (ADR 0107, A10's review): the component editor's
 * Explorable row and an element's own, a list of the project's explorables with Inherited and None,
 * each choice one command through the appearance commands every trait uses.
 */
import type { Command, ProjectSnapshot } from '@visual-anything/core';
import type { ExplorableDefinition } from '@visual-anything/schema';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { SendCommand } from '../../canvas/CanvasArea';
import type { Selectable, Selection } from '../../editor/selection';
import { DefinitionsHarness } from '../../test/DefinitionsHarness';
import { loadSample } from '../../test/sample';
import { explorableChange } from './explorableChoice';

const sample = loadSample();

const explorable = (id: string, name: string): ExplorableDefinition => ({
  id,
  name,
  file: `${id.split('.')[1]}.html`,
  api: 1,
  hash: '0'.repeat(64),
});

function withExplorables(project: ProjectSnapshot = sample): ProjectSnapshot {
  return {
    ...project,
    packages: project.packages.map((file) =>
      file.id === 'clinic'
        ? {
            ...file,
            explorables: [
              explorable('clinic.queue', 'Queue'),
              explorable('clinic.load', 'Load curve'),
            ],
          }
        : file,
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

async function settle(action: () => void): Promise<void> {
  await act(async () => {
    action();
    for (let tick = 0; tick < 5; tick++) await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function optionsOf(list: HTMLElement): string[] {
  return within(list)
    .getAllByRole('option')
    .map((option) => option.textContent ?? '');
}

describe('the explorable trait in the component editor', () => {
  it('lists Inherited, None and the project’s explorables, and sets the component’s', async () => {
    const { send, inspector } = renderPanels(withExplorables(), [
      { kind: 'element', id: 'appointments-db' },
    ]);
    await settle(() =>
      fireEvent.click(within(inspector).getByRole('button', { name: 'Edit “Calendar”' })),
    );
    const list = within(inspector).getByRole('combobox', { name: 'Its explorable' });
    expect(optionsOf(list)).toEqual(['Inherited (None)', 'None', 'Queue', 'Load curve']);
    await settle(() => fireEvent.change(list, { target: { value: 'clinic.load' } }));
    expect(sent(send)).toEqual([
      {
        type: 'update-component',
        id: 'clinic.calendar',
        changes: { appearance: { explorable: { explorable: 'clinic.load' } } },
      },
    ]);
  });

  it('shows no row where the project defines no explorable and nothing shows one', async () => {
    const { inspector } = renderPanels(sample, [{ kind: 'element', id: 'appointments-db' }]);
    await settle(() =>
      fireEvent.click(within(inspector).getByRole('button', { name: 'Edit “Calendar”' })),
    );
    expect(within(inspector).queryByRole('combobox', { name: 'Its explorable' })).toBeNull();
  });
});

describe('the explorable trait in an element’s own appearance', () => {
  /** The project with WhatsApp's component showing the queue. */
  function componentShowsQueue(): ProjectSnapshot {
    const project = withExplorables();
    const component = project.model.elements.find((each) => each.id === 'whatsapp')?.component;
    return {
      ...project,
      packages: project.packages.map((file) => ({
        ...file,
        components: file.components?.map((each) =>
          each.id === component
            ? {
                ...each,
                appearance: { ...each.appearance, explorable: { explorable: 'clinic.queue' } },
              }
            : each,
        ),
      })),
    };
  }

  it('says what it inherits, gives the element one of its own, None, and back', async () => {
    const project = componentShowsQueue();
    const { send, inspector } = renderPanels(project, [{ kind: 'element', id: 'whatsapp' }]);
    const list = within(inspector).getByRole('combobox', { name: 'Its explorable' });
    expect(optionsOf(list)[0]).toBe('Inherited (Queue)');
    expect((list as HTMLSelectElement).value).toBe('\u0000inherited');
    await settle(() => fireEvent.change(list, { target: { value: 'clinic.load' } }));
    await settle(() => fireEvent.change(list, { target: { value: '\u0000none' } }));
    expect(sent(send)).toEqual([
      {
        type: 'update-element',
        id: 'whatsapp',
        changes: { appearanceTraits: { explorable: { explorable: 'clinic.load' } } },
      },
      {
        type: 'update-element',
        id: 'whatsapp',
        changes: { appearanceTraits: { explorable: 'none' } },
      },
    ]);
  });

  it('shows an element’s own explorable, and goes back to its component’s', async () => {
    const project = componentShowsQueue();
    const own: ProjectSnapshot = {
      ...project,
      model: {
        ...project.model,
        elements: project.model.elements.map((each) =>
          each.id === 'whatsapp'
            ? { ...each, appearance: { explorable: { explorable: 'clinic.load' } } }
            : each,
        ),
      },
    };
    const { send, inspector } = renderPanels(own, [{ kind: 'element', id: 'whatsapp' }]);
    const list = within(inspector).getByRole('combobox', { name: 'Its explorable' });
    expect((list as HTMLSelectElement).value).toBe('clinic.load');
    await settle(() =>
      fireEvent.click(
        within(inspector).getByRole('button', {
          name: 'Use the component’s explorable for Its explorable',
        }),
      ),
    );
    expect(sent(send)).toEqual([
      {
        type: 'update-element',
        id: 'whatsapp',
        changes: { appearanceTraits: { explorable: null } },
      },
    ]);
  });

  it('turns each choice into the trait the core takes', () => {
    expect(explorableChange('\u0000inherited')).toBeNull();
    expect(explorableChange('\u0000none')).toBe('none');
    expect(explorableChange('math.parabola')).toEqual({ explorable: 'math.parabola' });
  });
});
