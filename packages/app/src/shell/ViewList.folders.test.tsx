import { definitionsOf, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, ViewFile, ViewFolderEntry } from '@visual-anything/schema';
import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SendCommand } from '../canvas/CanvasArea';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EMPTY_SELECTION } from '../editor/selection';
import { loadSample } from '../test/sample';
import { closedFoldersKey, viewsInListOrder } from './viewFolders';
import { ViewList } from './ViewList';

const sample = loadSample();

function view(id: Id, name: string): ViewFile {
  return {
    id,
    name,
    perspective: { name: 'Steps' },
    nestingRelationTypes: [],
    positions: [],
    freeShapes: [],
  };
}

// Stories › Ticket 12 › Step one; Stories › Story; then Landing, which no folder names.
const FOLDERS: ViewFolderEntry[] = [
  {
    folder: 'stories',
    name: 'Stories',
    entries: [
      { folder: 'ticket-12', name: 'Ticket 12', entries: [{ view: 'step-one' }] },
      { view: 'story' },
    ],
  },
  { folder: 'empty', name: 'Empty', entries: [] },
];

const filed: ProjectSnapshot = {
  ...sample,
  project: { ...sample.project, viewFolders: FOLDERS },
  views: [view('landing', 'Landing'), view('story', 'Story'), view('step-one', 'Step one')],
};

/** The tree `organize-views` would send with what the list shows: every view filed. */
const TREE: ViewFolderEntry[] = [...FOLDERS, { view: 'landing' }];

interface Setup {
  project?: ProjectSnapshot;
  send?: SendCommand | null;
  openViewId?: Id;
}

/** The view list, inside an editor whose commands are recorded and answered as applied. */
function setup({ project = filed, send, openViewId = 'landing' }: Setup = {}) {
  const sent = vi.fn<SendCommand>(() => Promise.resolve({ ok: true, created: ['made'] }));
  const definitions = definitionsOf(project.packages);
  const editor: Editor = {
    project,
    definitions,
    viewId: openViewId,
    scene: undefined,
    selection: EMPTY_SELECTION,
    select: () => undefined,
    send: send === null ? undefined : (send ?? sent),
    reveal: () => undefined,
    openView: () => undefined,
  };
  const ui = (shown: ProjectSnapshot, open: Id) => (
    <EditorContext.Provider value={{ ...editor, project: shown, viewId: open }}>
      <h3 id="views">Views</h3>
      <ViewList project={shown} definitions={definitions} openViewId={open} labelledBy="views" />
    </EditorContext.Provider>
  );
  const rendered = render(ui(project, openViewId));
  const commands = () => sent.mock.calls.map(([command]) => command);
  return {
    commands,
    unmount: rendered.unmount,
    rerender: (shown: ProjectSnapshot, open: Id) => rendered.rerender(ui(shown, open)),
  };
}

const folderButton = (name: string) => screen.getByRole('button', { name, expanded: true });

function folderSettings(name: string): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: `Settings of the folder "${name}"` }));
  return screen.getByRole('group', { name: `Settings of the folder "${name}"` });
}

async function settle(action: () => void) {
  await act(async () => {
    action();
    await Promise.resolve();
  });
}

/** A drag event's data, as a browser gives it. */
const dataTransfer = () => ({ setData: vi.fn(), effectAllowed: '', dropEffect: '' });

/** The line of a row, which drags and takes drops, by the button that names it. */
const lineOf = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}`) }).parentElement!;

beforeEach(() => localStorage.clear());

describe('ViewList with view folders', () => {
  it('shows the folders, what they hold indented under them, then the views no folder names', () => {
    setup();
    const list = screen.getByRole('list', { name: 'Views' });
    const top = within(list)
      .getAllByRole('listitem')
      .filter((item) => item.parentElement === list);
    expect(top.map((item) => item.firstElementChild?.textContent)).toEqual([
      expect.stringContaining('Stories'),
      expect.stringContaining('Empty'),
      expect.stringContaining('Landing'),
    ]);
    const stories = screen.getByRole('list', { name: 'Stories' });
    expect(within(stories).getByRole('list', { name: 'Ticket 12' })).toHaveTextContent('Step one');
    expect(stories).toHaveTextContent('Story');
    expect(screen.getByText('This folder is empty.')).toBeInTheDocument();
  });

  it('closes and opens a folder, and remembers it for the project in the browser', () => {
    const { unmount } = setup();
    fireEvent.click(folderButton('Stories'));
    expect(screen.getByRole('button', { name: 'Stories', expanded: false })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Stories' })).toBeNull();
    expect(JSON.parse(localStorage.getItem(closedFoldersKey(filed.project.name))!)).toEqual([
      'stories',
    ]);
    unmount();
    setup();
    const stories = screen.getByRole('button', { name: 'Stories', expanded: false });
    fireEvent.click(stories);
    expect(screen.getByRole('list', { name: 'Stories' })).toBeInTheDocument();
    expect(localStorage.getItem(closedFoldersKey(filed.project.name))).toBeNull();
  });

  it('opens by itself a folder that holds the open view', () => {
    localStorage.setItem(closedFoldersKey(filed.project.name), '["stories","ticket-12"]');
    const { rerender } = setup();
    expect(screen.queryByRole('list', { name: 'Stories' })).toBeNull();
    rerender(filed, 'step-one');
    expect(screen.getByRole('list', { name: 'Ticket 12' })).toHaveTextContent('Step one');
  });

  it('makes a new folder, last at the top level', async () => {
    const { commands } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'New folder…' }));
    const form = screen.getByRole('form', { name: 'New folder' });
    fireEvent.click(within(form).getByRole('button', { name: 'Create' }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Give the folder a name.');
    fireEvent.change(within(form).getByRole('textbox', { name: 'Name' }), {
      target: { value: ' Indexes ' },
    });
    await settle(() => fireEvent.click(within(form).getByRole('button', { name: 'Create' })));
    expect(commands()).toEqual<Command[]>([
      { type: 'organize-views', viewFolders: [...TREE, { name: 'Indexes', entries: [] }] },
    ]);
    expect(screen.queryByRole('form', { name: 'New folder' })).toBeNull();
  });

  it('renames a folder', async () => {
    const { commands } = setup();
    const settings = folderSettings('Empty');
    const name = within(settings).getByRole('textbox', { name: 'Name' });
    fireEvent.change(name, { target: { value: 'Indexes' } });
    await settle(() => fireEvent.keyDown(name, { key: 'Enter' }));
    expect(commands()).toEqual<Command[]>([
      {
        type: 'organize-views',
        viewFolders: [
          FOLDERS[0]!,
          { folder: 'empty', name: 'Indexes', entries: [] },
          ...TREE.slice(2),
        ],
      },
    ]);
  });

  it('moves a folder up, and into another folder, but never into itself', async () => {
    const { commands } = setup();
    const settings = folderSettings('Empty');
    await settle(() => fireEvent.click(within(settings).getByRole('button', { name: 'Move up' })));
    const inside = within(settings).getByRole('combobox', { name: 'Inside' });
    expect(
      within(inside)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['The top level', 'Stories', 'Stories › Ticket 12']);
    await settle(() => fireEvent.change(inside, { target: { value: 'ticket-12' } }));
    const stories = FOLDERS[0] as Extract<ViewFolderEntry, { folder: Id }>;
    expect(commands()).toEqual<Command[]>([
      { type: 'organize-views', viewFolders: [FOLDERS[1]!, stories, { view: 'landing' }] },
      {
        type: 'organize-views',
        viewFolders: [
          {
            ...stories,
            entries: [
              {
                folder: 'ticket-12',
                name: 'Ticket 12',
                entries: [{ view: 'step-one' }, { folder: 'empty', name: 'Empty', entries: [] }],
              },
              { view: 'story' },
            ],
          },
          { view: 'landing' },
        ],
      },
    ]);
    const outer = folderSettings('Stories');
    const choices = within(within(outer).getByRole('combobox', { name: 'Inside' })).getAllByRole(
      'option',
    );
    expect(choices.map((option) => option.textContent)).toEqual(['The top level', 'Empty']);
  });

  it('deletes a folder, filing what it held in its place', async () => {
    const { commands } = setup();
    const settings = folderSettings('Stories');
    expect(
      within(settings).getByRole('button', { name: 'Delete folder' }),
    ).toHaveAccessibleDescription(/what it holds takes its place/);
    await settle(() =>
      fireEvent.click(within(settings).getByRole('button', { name: 'Delete folder' })),
    );
    expect(commands()).toEqual<Command[]>([
      {
        type: 'organize-views',
        viewFolders: [
          { folder: 'ticket-12', name: 'Ticket 12', entries: [{ view: 'step-one' }] },
          { view: 'story' },
          ...TREE.slice(1),
        ],
      },
    ]);
  });

  it('files a view in a folder chosen by its path, and moves it down its list', async () => {
    const { commands } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Settings of "Landing"' }));
    const settings = screen.getByRole('group', { name: 'Settings of "Landing"' });
    const folder = within(settings).getByRole('combobox', { name: 'Folder' });
    expect(folder).toHaveValue('');
    expect(within(settings).getByRole('button', { name: 'Move down' })).toBeDisabled();
    await settle(() => fireEvent.change(folder, { target: { value: 'ticket-12' } }));
    expect(commands()).toEqual<Command[]>([
      {
        type: 'organize-views',
        viewFolders: [
          {
            folder: 'stories',
            name: 'Stories',
            entries: [
              {
                folder: 'ticket-12',
                name: 'Ticket 12',
                entries: [{ view: 'step-one' }, { view: 'landing' }],
              },
              { view: 'story' },
            ],
          },
          FOLDERS[1]!,
        ],
      },
    ]);
  });

  it('makes a new view in a folder from its settings', async () => {
    const { commands } = setup();
    const settings = folderSettings('Empty');
    fireEvent.click(within(settings).getByRole('button', { name: 'New view in this folder…' }));
    const form = screen.getByRole('form', { name: 'New view in "Empty"' });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Index' },
    });
    fireEvent.change(within(form).getByRole('textbox', { name: 'Perspective' }), {
      target: { value: 'Pages' },
    });
    await settle(() => fireEvent.click(within(form).getByRole('button', { name: 'Create' })));
    expect(commands()).toEqual<Command[]>([
      {
        type: 'create-view',
        view: { name: 'Index', perspective: { name: 'Pages' } },
        folder: 'empty',
      },
    ]);
  });

  it('drops a view into a folder, last', async () => {
    const { commands } = setup();
    fireEvent.dragStart(lineOf('Landing'), { dataTransfer: dataTransfer() });
    const target = lineOf('Empty');
    fireEvent.dragOver(target, { dataTransfer: dataTransfer() });
    expect(target).toHaveClass('view-drop-inside');
    await settle(() => fireEvent.drop(target, { dataTransfer: dataTransfer() }));
    expect(commands()).toEqual<Command[]>([
      {
        type: 'organize-views',
        viewFolders: [
          FOLDERS[0]!,
          { folder: 'empty', name: 'Empty', entries: [{ view: 'landing' }] },
        ],
      },
    ]);
  });

  it('drops a folder between rows, before the one under the upper half', async () => {
    const { commands } = setup();
    fireEvent.dragStart(lineOf('Empty'), { dataTransfer: dataTransfer() });
    const target = lineOf('Story');
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 100, width: 200, height: 20 }),
    );
    // jsdom's drag events carry no pointer position, so the drop is given one.
    const drop = createEvent.drop(target, { dataTransfer: dataTransfer() });
    Object.defineProperty(drop, 'clientY', { value: 104 });
    await settle(() => fireEvent(target, drop));
    expect(commands()).toEqual<Command[]>([
      {
        type: 'organize-views',
        viewFolders: [
          {
            folder: 'stories',
            name: 'Stories',
            entries: [
              { folder: 'ticket-12', name: 'Ticket 12', entries: [{ view: 'step-one' }] },
              { folder: 'empty', name: 'Empty', entries: [] },
              { view: 'story' },
            ],
          },
          { view: 'landing' },
        ],
      },
    ]);
  });

  it('refuses a folder dropped into itself or a folder it holds', async () => {
    const { commands } = setup();
    fireEvent.dragStart(lineOf('Stories'), { dataTransfer: dataTransfer() });
    for (const name of ['Stories', 'Ticket 12']) {
      const target = lineOf(name);
      fireEvent.dragOver(target, { dataTransfer: dataTransfer() });
      expect(target).not.toHaveClass('view-drop-inside');
      await settle(() => fireEvent.drop(target, { dataTransfer: dataTransfer() }));
    }
    expect(commands()).toEqual([]);
  });

  it('changes nothing while the project cannot be changed', () => {
    setup({ send: null });
    expect(screen.getByRole('button', { name: 'New folder…' })).toBeDisabled();
    expect(lineOf('Landing')).not.toHaveAttribute('draggable');
    const settings = folderSettings('Stories');
    expect(within(settings).getByRole('textbox', { name: 'Name' })).toBeDisabled();
    expect(within(settings).getByRole('combobox', { name: 'Inside' })).toBeDisabled();
    expect(within(settings).getByRole('button', { name: 'Delete folder' })).toBeDisabled();
  });
});

describe('viewsInListOrder', () => {
  it('gives the views in the order the view list shows them, folders opened out', () => {
    expect(viewsInListOrder(filed).map((each) => each.id)).toEqual([
      'step-one',
      'story',
      'landing',
    ]);
  });
});
