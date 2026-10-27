import {
  definitionsIn,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useMemo, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SendCommand } from '../../canvas/CanvasArea';
import { EditorContext, type Editor } from '../../editor/EditorContext';
import { EMPTY_SELECTION, type Selectable } from '../../editor/selection';
import { beyondBoxes } from '../../test/beyond';
import { PartsSection } from './PartsSection';

/** The section for one element, in an editor whose commands the core applies, as the local program would. */
function renderSection(start: ProjectSnapshot, element = 'body') {
  const sent: Command[] = [];
  const selected: Selectable[] = [];
  const latest: { project: ProjectSnapshot } = { project: start };
  function Harness() {
    const [project, setProject] = useState(start);
    const now = useRef(start);
    const definitions = useMemo(() => definitionsIn(project), [project]);
    const send: SendCommand = (command) => {
      sent.push(command);
      const outcome = executeCommand(now.current, command);
      if (!outcome.ok) return Promise.resolve({ ok: false });
      now.current = outcome.state;
      latest.project = outcome.state;
      setProject(outcome.state);
      return Promise.resolve({ ok: true });
    };
    const editor: Editor = {
      project,
      definitions,
      viewId: project.views[0]?.id,
      scene: undefined,
      selection: EMPTY_SELECTION,
      select: vi.fn(),
      send,
      reveal: vi.fn(),
    };
    const found = project.model.elements.find((each) => each.id === element);
    return (
      <EditorContext.Provider value={editor}>
        {found && <PartsSection element={found} onSelect={(item) => selected.push(item)} />}
      </EditorContext.Provider>
    );
  }
  render(<Harness />);
  return { sent, selected, latest };
}

/** The body, with its content "extra" renamed, as Anchor parts… matches by name. */
function withExtraNamed(name: string): ProjectSnapshot {
  const state = beyondBoxes();
  return {
    ...state,
    model: {
      ...state.model,
      elements: state.model.elements.map((each) =>
        each.id === 'extra' ? { ...each, name } : each,
      ),
    },
  };
}

describe('the parts of a drawing with parts', () => {
  it('lists its picture’s parts in document order, with the content drawn as each', () => {
    const { selected } = renderSection(beyondBoxes());
    const section = screen.getByRole('region', { name: 'Parts' });
    expect(section.textContent).toContain('Its picture, “Organs”, has 3 named parts.');
    expect(section.textContent).toContain('2 of them are drawn as contents.');
    const items = within(section).getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('.inspector-part-id')?.textContent)).toEqual([
      'left',
      'right',
      'ring',
    ]);
    expect(items[2]?.textContent).toContain('Nothing is drawn as it.');
    fireEvent.click(within(items[0] as HTMLElement).getByRole('button', { name: /left/ }));
    expect(selected).toEqual([{ kind: 'element', id: 'left' }]);
    // A second content naming a part another one is drawn as sits below the picture.
    expect(section.textContent).toContain(
      '“twin” names the part “left”, which “left” is drawn as already, so it sits below the picture.',
    );
  });

  it('shows nothing for an element that is no drawing with parts', () => {
    renderSection(beyondBoxes(), 'extra');
    expect(screen.queryByRole('region', { name: 'Parts' })).toBeNull();
  });
});

describe('Anchor parts…', () => {
  it('matches by name, says what it would do, and anchors in one action', async () => {
    const { sent, latest } = renderSection(withExtraNamed('Ring'));
    fireEvent.click(screen.getByRole('button', { name: 'Anchor parts…' }));
    const dialog = screen.getByRole('dialog', { name: 'Anchor the parts of “Body”' });
    expect(dialog.textContent).toContain('1 part is matched to a content:');
    expect(dialog.textContent).toContain('“ring” → “Ring”');
    expect(dialog.textContent).toContain('2 parts are drawn as contents already, and keep them.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anchor 1 part' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sent).toEqual([
      {
        type: 'batch',
        label: 'Anchor 1 part of "Body"',
        commands: [
          {
            type: 'update-element',
            id: 'extra',
            changes: { appearanceTraits: { part: { part: 'ring' } } },
          },
        ],
      },
    ]);
    const extra = latest.project.model.elements.find((each) => each.id === 'extra');
    expect(extra?.appearance?.part).toEqual({ part: 'ring' });
  });

  it('creates an element of the component chosen for what matches nothing', async () => {
    const { latest } = renderSection(beyondBoxes());
    fireEvent.click(screen.getByRole('button', { name: 'Anchor parts…' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Anchor 0 parts' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(dialog.textContent).toContain('1 part matches nothing.');
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Create an element/ }));
    expect(within(dialog).getByRole('combobox', { name: 'Component' })).toHaveProperty(
      'value',
      'anatomy.chamber',
    );
    expect(dialog.textContent).toContain('“ring” → a new “Ring”');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anchor 1 part' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const made = latest.project.model.elements.at(-1);
    expect(made).toMatchObject({
      name: 'Ring',
      component: 'anatomy.chamber',
      appearance: { part: { part: 'ring' } },
    });
  });

  it('matches by an external identifier in a scheme, and closes with Escape', () => {
    const state = withExtraNamed('Something');
    const found = state.model.elements.find((each) => each.id === 'extra');
    if (found) found.ids = { local: 'ring' };
    renderSection(state);
    fireEvent.click(screen.getByRole('button', { name: 'Anchor parts…' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: /By an external identifier/ }));
    expect(within(dialog).getByRole('combobox', { name: 'Scheme' })).toHaveProperty(
      'value',
      'local',
    );
    expect(dialog.textContent).toContain('“ring” → “Something”');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
