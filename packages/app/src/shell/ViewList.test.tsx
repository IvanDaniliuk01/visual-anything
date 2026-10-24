import { definitionsOf, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SendCommand } from '../canvas/CanvasArea';
import { buildScene } from '../canvas/scene';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EMPTY_SELECTION } from '../editor/selection';
import { loadSample } from '../test/sample';
import { ViewList } from './ViewList';

const sample = loadSample();

const SECURITY: ViewFile = {
  id: 'security',
  name: 'Security',
  perspective: { name: 'Security', description: 'Who may reach what.' },
  nestingRelationTypes: ['systems.is-part-of'],
  positions: [],
  freeShapes: [],
};

const twoViews: ProjectSnapshot = { ...sample, views: [...sample.views, SECURITY] };

interface Setup {
  project?: ProjectSnapshot;
  send?: SendCommand | null;
  openViewId?: Id;
}

/** The view list, inside an editor whose commands are recorded and answered as applied. */
function setup({ project = twoViews, send, openViewId = 'system-overview' }: Setup = {}) {
  const sent = vi.fn<SendCommand>(() =>
    Promise.resolve({ ok: true, created: ['new-view-a1b2c3'] }),
  );
  const openView = vi.fn<(view: Id) => void>();
  const definitions = definitionsOf(project.packages);
  const editor: Editor = {
    project,
    definitions,
    viewId: openViewId,
    scene: project.views.some((view) => view.id === openViewId)
      ? buildScene(project, openViewId)
      : undefined,
    selection: EMPTY_SELECTION,
    select: () => undefined,
    send: send === null ? undefined : (send ?? sent),
    reveal: () => undefined,
    openView,
  };
  render(
    <EditorContext.Provider value={editor}>
      <h3 id="views">Views</h3>
      <ViewList
        project={project}
        definitions={definitions}
        openViewId={openViewId}
        labelledBy="views"
      />
    </EditorContext.Provider>,
  );
  const commands = () => sent.mock.calls.map(([command]) => command);
  return { sent, commands, openView };
}

function settingsOf(name: string): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: `Settings of "${name}"` }));
  return screen.getByRole('group', { name: `Settings of "${name}"` });
}

/** Types into a text control and commits it with Enter, as the inspector's do. */
async function commit(control: HTMLElement, text: string) {
  fireEvent.change(control, { target: { value: text } });
  await act(async () => {
    fireEvent.keyDown(control, { key: 'Enter' });
    await Promise.resolve();
  });
}

describe('ViewList', () => {
  it('lists the views with their perspectives, marking the open one', () => {
    setup();
    const list = screen.getByRole('list', { name: 'Views' });
    const [overview, security] = within(list).getAllByRole('listitem');
    expect(overview).toHaveTextContent('System overview');
    expect(overview).toHaveTextContent('Data flow');
    expect(overview).toHaveAttribute('aria-current', 'true');
    expect(security).toHaveTextContent('Security');
    expect(security).not.toHaveAttribute('aria-current');
  });

  it('opens a view on the canvas when its name is chosen', () => {
    const { openView } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Security, Security' }));
    expect(openView).toHaveBeenCalledWith('security');
  });

  it('renames a view, and refuses an empty name', async () => {
    const { commands } = setup();
    const settings = settingsOf('Security');
    const name = within(settings).getByRole('textbox', { name: 'Name' });
    await commit(name, '  ');
    expect(within(settings).getByRole('alert')).toHaveTextContent('A view needs a name.');
    expect(commands()).toEqual([]);
    await commit(name, 'Access');
    expect(commands()).toEqual<Command[]>([
      { type: 'update-view', id: 'security', changes: { name: 'Access' } },
    ]);
  });

  it('gives a view another perspective, keeping what it looks at', async () => {
    const { commands } = setup();
    const settings = settingsOf('Security');
    await commit(within(settings).getByRole('textbox', { name: 'Perspective' }), 'Ownership');
    await commit(
      within(settings).getByRole('textbox', { name: 'What the perspective looks at' }),
      '',
    );
    expect(commands()).toEqual<Command[]>([
      {
        type: 'update-view',
        id: 'security',
        changes: { perspective: { name: 'Ownership', description: 'Who may reach what.' } },
      },
      { type: 'update-view', id: 'security', changes: { perspective: { name: 'Security' } } },
    ]);
  });

  it('changes its description, and removes an empty one', async () => {
    const { commands } = setup();
    const settings = settingsOf('System overview');
    await commit(within(settings).getByRole('textbox', { name: 'Description' }), '');
    expect(commands()).toEqual<Command[]>([
      { type: 'update-view', id: 'system-overview', changes: { description: null } },
    ]);
  });

  it('chooses the nesting relation types that arrange it', async () => {
    const { commands } = setup();
    const settings = settingsOf('Security');
    const nesting = within(settings).getByRole('group', { name: 'Nesting relation types' });
    const isPartOf = within(nesting).getByRole('checkbox', { name: 'is part of' });
    expect(isPartOf).toBeChecked();
    await act(async () => {
      fireEvent.click(isPartOf);
      await Promise.resolve();
    });
    expect(commands()).toEqual<Command[]>([
      { type: 'update-view', id: 'security', changes: { nestingRelationTypes: [] } },
    ]);
  });

  it('adds a nesting relation type after the ones that still nest, leaving out stale ones', async () => {
    const stale: ProjectSnapshot = {
      ...sample,
      views: [{ ...SECURITY, nestingRelationTypes: ['gone.nests'] }],
    };
    const { commands } = setup({ project: stale, openViewId: 'security' });
    const settings = settingsOf('Security');
    await act(async () => {
      fireEvent.click(within(settings).getByRole('checkbox', { name: 'is part of' }));
      await Promise.resolve();
    });
    expect(commands()).toEqual<Command[]>([
      {
        type: 'update-view',
        id: 'security',
        changes: { nestingRelationTypes: ['systems.is-part-of'] },
      },
    ]);
  });

  it('deletes a view once asked again, and keeps it otherwise', async () => {
    const { commands } = setup();
    const settings = settingsOf('Security');
    fireEvent.click(within(settings).getByRole('button', { name: 'Delete view…' }));
    const asked = within(settings).getByRole('group', { name: 'Delete "Security"?' });
    fireEvent.click(within(asked).getByRole('button', { name: 'Keep it' }));
    expect(commands()).toEqual([]);
    fireEvent.click(within(settings).getByRole('button', { name: 'Delete view…' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await Promise.resolve();
    });
    expect(commands()).toEqual<Command[]>([{ type: 'delete-view', id: 'security' }]);
  });

  it('says why a view a scenario plays over cannot be deleted', () => {
    setup();
    const settings = settingsOf('System overview');
    expect(within(settings).queryByRole('button', { name: 'Delete view…' })).toBeNull();
    expect(settings).toHaveTextContent(
      '"Patient books an appointment" plays over this view, so it cannot be deleted.',
    );
  });

  it('makes a new view from a name and a perspective, and opens it', async () => {
    const { commands, openView } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'New view…' }));
    const form = screen.getByRole('form', { name: 'New view' });
    const name = within(form).getByRole('textbox', { name: 'Name' });
    expect(name).toHaveFocus();
    fireEvent.click(within(form).getByRole('button', { name: 'Create' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Give the view a name.');
    fireEvent.change(name, { target: { value: ' Costs ' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Create' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Name the perspective');
    fireEvent.change(within(form).getByRole('textbox', { name: 'Perspective' }), {
      target: { value: 'Cost' },
    });
    await act(async () => {
      fireEvent.click(within(form).getByRole('button', { name: 'Create' }));
      await Promise.resolve();
    });
    expect(commands()).toEqual<Command[]>([
      { type: 'create-view', view: { name: 'Costs', perspective: { name: 'Cost' } } },
    ]);
    expect(openView).toHaveBeenCalledWith('new-view-a1b2c3');
    expect(screen.queryByRole('form', { name: 'New view' })).not.toBeInTheDocument();
  });

  it('cancels a new view with Escape', () => {
    const { commands } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'New view…' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), { key: 'Escape' });
    expect(screen.queryByRole('form', { name: 'New view' })).not.toBeInTheDocument();
    expect(commands()).toEqual([]);
  });

  it('changes nothing while the project cannot be changed', () => {
    setup({ send: null });
    expect(screen.getByRole('button', { name: 'New view…' })).toBeDisabled();
    const settings = settingsOf('Security');
    expect(within(settings).getByRole('textbox', { name: 'Name' })).toBeDisabled();
    expect(within(settings).getByRole('checkbox', { name: 'is part of' })).toBeDisabled();
    expect(within(settings).getByRole('button', { name: 'Delete view…' })).toBeDisabled();
  });

  it('says so when the project has no views', () => {
    setup({ project: { ...sample, views: [] }, openViewId: 'system-overview' });
    expect(screen.getByText('This project has no views yet.')).toBeInTheDocument();
  });
});
