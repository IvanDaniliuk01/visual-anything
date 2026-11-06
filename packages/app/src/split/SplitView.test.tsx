import type { ProjectSnapshot } from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTabUseForTests, trackTabUse, type TabUse } from '../guidance/tabs';
import type { GuidanceState } from '../guidance/state';
import { LiveContext } from '../live/context';
import { Shell } from '../shell/Shell';
import { fakeLive } from '../test/fakeLive';
import { fakeCameras } from '../test/fakeCamera';
import { loadSample } from '../test/sample';
import { panesKey } from './panes';

vi.mock('../canvas/CanvasArea', () => import('../test/FakeSplitCanvas'));

const sample = loadSample();
const overview = sample.views[0] as ViewFile;

/** The sample with two more views of the same model. */
const project: ProjectSnapshot = {
  ...sample,
  views: [
    overview,
    { ...overview, id: 'storage', name: 'Storage', positions: [] },
    { ...overview, id: 'people', name: 'People', positions: [] },
  ],
};

/** Where the tab keeps the panes of this project. */
const KEY = panesKey(project.project.name);

/** Two panes, kept in the tab's storage for this project: System overview, active, and Storage. */
function keepTwoPanes(): void {
  sessionStorage.setItem(
    KEY,
    JSON.stringify({
      active: 'pane-1',
      panes: [
        { id: 'pane-1', view: 'system-overview', width: 1 },
        { id: 'pane-2', view: 'storage', width: 1 },
      ],
    }),
  );
}

/** The sample, in which the Calendar component's runbook opens the Storage view, on the patient. */
const linked: ProjectSnapshot = {
  ...project,
  packages: project.packages.map((file) =>
    file.id === 'clinic'
      ? {
          ...file,
          components: file.components.map((each) =>
            each.id === 'clinic.calendar'
              ? {
                  ...each,
                  attributes: [
                    ...(each.attributes ?? []),
                    { name: 'runbook', type: 'destination' as const },
                  ],
                }
              : each,
          ),
        }
      : file,
  ),
  model: {
    ...project.model,
    elements: project.model.elements.map((element) =>
      element.id === 'appointments-db'
        ? {
            ...element,
            attributes: {
              ...element.attributes,
              runbook: { view: 'storage', focus: ['patient'] },
            },
          }
        : element,
    ),
  },
};

/** Another tab of the browser was used after this one. */
const usedElsewhere: TabUse = {
  used: () => undefined,
  isLastUsed: () => false,
  dispose: () => undefined,
};

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  fakeCameras.clear();
  setTabUseForTests(trackTabUse({ channel: undefined, shown: true }));
});

/** Every canvas drawn, left to right. */
const canvases = () => screen.getAllByRole('application');
const viewsDrawn = () => canvases().map((canvas) => canvas.dataset.view);
const activeView = () =>
  canvases().find((canvas) => canvas.dataset.active === 'true')?.dataset.view;

/** The Views list, in the model panel's Model tab. */
function viewList(): HTMLElement {
  fireEvent.click(screen.getByRole('tab', { name: 'Model' }));
  return within(screen.getByRole('tabpanel', { name: 'Model' })).getByRole('list', {
    name: 'Views',
  });
}

function openBeside(name: string): void {
  fireEvent.click(within(viewList()).getByRole('button', { name: `Open "${name}" beside` }));
}

const inspector = () => screen.getByRole('complementary', { name: 'Inspector' });
const headerView = () => within(screen.getByRole('banner'));

describe('the split view', () => {
  it('opens a view beside the active pane from the view list, the active one staying active', () => {
    render(<Shell project={project} />);
    expect(viewsDrawn()).toEqual(['system-overview']);
    // One pane alone shows no header and no border.
    expect(screen.queryByRole('separator', { name: /^Resize/ })).toBeNull();
    openBeside('Storage');
    expect(viewsDrawn()).toEqual(['system-overview', 'storage']);
    expect(activeView()).toBe('system-overview');
    expect(screen.getByRole('region', { name: 'System overview, the active pane' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Storage, a pane' })).toBeVisible();
    expect(screen.getAllByRole('combobox', { name: 'View in this pane' })).toHaveLength(2);
  });

  it('opens three at most, and then shows the view in the rightmost pane but the active one', () => {
    render(<Shell project={project} />);
    openBeside('Storage');
    openBeside('People');
    // Each opens right of the active pane.
    expect(viewsDrawn()).toEqual(['system-overview', 'people', 'storage']);
    fireEvent.pointerDown(canvases()[2] as HTMLElement);
    expect(activeView()).toBe('storage');
    openBeside('System overview');
    expect(viewsDrawn()).toEqual(['system-overview', 'system-overview', 'storage']);
  });

  it('opens beside from a pane’s header, and changes the view a pane shows there', () => {
    render(<Shell project={project} />);
    openBeside('Storage');
    const storage = screen.getByRole('region', { name: 'Storage, a pane' });
    fireEvent.change(within(storage).getByRole('combobox', { name: 'View in this pane' }), {
      target: { value: 'people' },
    });
    expect(viewsDrawn()).toEqual(['system-overview', 'people']);
    // The header acts on its own pane, which it does not make active.
    expect(activeView()).toBe('system-overview');
    const people = screen.getByRole('region', { name: 'People, a pane' });
    fireEvent.click(within(people).getByRole('button', { name: 'Open "People" beside' }));
    expect(viewsDrawn()).toEqual(['system-overview', 'people', 'people']);
  });

  it('closes panes until the single canvas shows as it did', () => {
    render(<Shell project={project} />);
    openBeside('Storage');
    openBeside('People');
    const people = screen.getByRole('region', { name: 'People, a pane' });
    fireEvent.click(within(people).getByRole('button', { name: 'Close the pane of “People”' }));
    expect(viewsDrawn()).toEqual(['system-overview', 'storage']);
    // Closing the active pane makes its neighbor active.
    const active = screen.getByRole('region', { name: 'System overview, the active pane' });
    fireEvent.click(
      within(active).getByRole('button', { name: 'Close the pane of “System overview”' }),
    );
    expect(viewsDrawn()).toEqual(['storage']);
    expect(activeView()).toBe('storage');
    expect(screen.queryByRole('region', { name: /pane$/ })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'View in this pane' })).toBeNull();
    expect(headerView().getByText('Storage')).toBeInTheDocument();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('shares the width with the arrow keys on the border, each pane keeping its least width', () => {
    render(<Shell project={project} />);
    openBeside('Storage');
    const border = screen.getByRole('separator', {
      name: 'Resize “System overview” and “Storage”',
    });
    expect(border).toHaveAttribute('aria-valuenow', '50');
    fireEvent.keyDown(border, { key: 'ArrowRight' });
    expect(border).toHaveAttribute('aria-valuenow', '52');
    fireEvent.keyDown(border, { key: 'ArrowLeft', shiftKey: true });
    expect(border).toHaveAttribute('aria-valuenow', '42');
    for (let press = 0; press < 30; press++) fireEvent.keyDown(border, { key: 'ArrowLeft' });
    expect(border).toHaveAttribute('aria-valuenow', '10');
    const panes = document.querySelectorAll<HTMLElement>('.canvas-pane');
    expect(Number(panes[0]?.style.flexGrow)).toBeCloseTo(0.1);
  });

  it('makes the pane pressed in active, which the header, the inspector and the outline follow', () => {
    render(<Shell project={project} />);
    openBeside('Storage');
    expect(headerView().getByText('System overview')).toBeInTheDocument();
    fireEvent.pointerDown(canvases()[1] as HTMLElement);
    expect(activeView()).toBe('storage');
    expect(headerView().getByText('Storage')).toBeInTheDocument();
    expect(within(inspector()).getAllByText('Storage').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('tab', { name: 'Outline' }));
    expect(screen.getByRole('tree', { name: 'Outline of Storage' })).toBeInTheDocument();
    // Moving the focus into a pane makes it active too.
    fireEvent.focus(canvases()[0] as HTMLElement);
    expect(activeView()).toBe('system-overview');
  });

  it('marks the active pane’s view in the view list', () => {
    render(<Shell project={project} />);
    openBeside('Storage');
    fireEvent.pointerDown(canvases()[1] as HTMLElement);
    const rows = within(viewList()).getAllByRole('listitem');
    const current = rows.filter((row) => row.getAttribute('aria-current') === 'true');
    expect(current.map((row) => row.textContent)).toEqual([expect.stringContaining('Storage')]);
  });

  it('copies the address of the active pane’s view state', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<Shell project={project} />);
    openBeside('Storage');
    fireEvent.pointerDown(canvases()[1] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/#view=storage(&|$)/)),
    );
  });

  it('opens an address brought to the tab in the active pane', async () => {
    render(<Shell project={project} />);
    openBeside('Storage');
    act(() => {
      window.history.replaceState(null, '', '/#view=people');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => expect(viewsDrawn()).toEqual(['people', 'storage']));
    expect(activeView()).toBe('people');
    // Even when another pane shows its view: the address is the active pane's.
    act(() => {
      window.history.replaceState(null, '', '/#view=storage');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => expect(viewsDrawn()).toEqual(['storage', 'storage']));
    expect(canvases()[0]).toHaveAttribute('data-active', 'true');
  });

  it('opens a view another pane shows by making that pane active', () => {
    render(<Shell project={project} />);
    openBeside('Storage');
    fireEvent.click(within(viewList()).getByRole('button', { name: /^Storage/ }));
    expect(viewsDrawn()).toEqual(['system-overview', 'storage']);
    expect(activeView()).toBe('storage');
  });

  it('selects one selection, by element, in every pane', () => {
    render(<Shell project={project} />);
    openBeside('Storage');
    const select = screen.getByRole('button', { name: 'Select the patient in Storage' });
    // As a click does, the press makes the pane active first.
    fireEvent.pointerDown(select);
    fireEvent.click(select);
    expect(activeView()).toBe('storage');
    expect(canvases().map((canvas) => canvas.dataset.selected)).toEqual(['patient', 'patient']);
    expect(within(inspector()).getAllByText('Patient').length).toBeGreaterThan(0);
  });

  it('selects a free shape in its pane only, even where another pane shows its view', () => {
    render(<Shell project={project} />);
    openBeside('Storage');
    const storage = screen.getByRole('region', { name: 'Storage, a pane' });
    fireEvent.change(within(storage).getByRole('combobox', { name: 'View in this pane' }), {
      target: { value: 'system-overview' },
    });
    expect(viewsDrawn()).toEqual(['system-overview', 'system-overview']);
    const [first] = screen.getAllByRole('button', {
      name: 'Select a free shape in System overview',
    });
    fireEvent.pointerDown(first as HTMLElement);
    fireEvent.click(first as HTMLElement);
    expect(canvases().map((canvas) => canvas.dataset.free)).toEqual(['calendar-note', '']);
  });

  it('opens a destination’s view beside the active pane, with what it names selected', () => {
    render(<Shell project={linked} />);
    fireEvent.click(
      within(screen.getByRole('tree', { name: 'Outline of System overview' })).getByText(
        'Appointments DB',
      ),
    );
    fireEvent.click(
      within(inspector()).getByRole('button', {
        name: 'Open the view “Storage” beside the active pane',
      }),
    );
    expect(viewsDrawn()).toEqual(['system-overview', 'storage']);
    expect(activeView()).toBe('system-overview');
    expect(canvases()[1]).toHaveAttribute('data-selected', 'patient');
  });

  it('brings its panes, their views, widths and cameras back from the tab’s storage', () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        active: 'pane-2',
        panes: [
          { id: 'pane-1', view: 'people', width: 3, camera: { x: 40, y: 20, scale: 2 } },
          { id: 'pane-2', view: 'storage', width: 1 },
        ],
      }),
    );
    render(<Shell project={project} />);
    expect(viewsDrawn()).toEqual(['people', 'storage']);
    expect(activeView()).toBe('storage');
    expect(
      screen.getByRole('separator', { name: 'Resize “People” and “Storage”' }),
    ).toHaveAttribute('aria-valuenow', '75');
    expect(fakeCameras.get('people')?.camera()).toEqual({ x: 40, y: 20, scale: 2 });
  });

  it('keeps nothing in the tab’s storage that is not read strictly', () => {
    sessionStorage.setItem(KEY, '{"active":"pane-1","panes":[{"id":"x"}]}');
    render(<Shell project={project} />);
    expect(viewsDrawn()).toEqual(['system-overview']);
  });
});

describe('Claude’s guidance in a split view', () => {
  /** The shell with two panes open, over a session with this guidance. */
  function renderSplit(guidance: GuidanceState) {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        active: 'pane-1',
        panes: [
          { id: 'pane-1', view: 'system-overview', width: 1 },
          { id: 'pane-2', view: 'storage', width: 1 },
        ],
      }),
    );
    const tree = (next: GuidanceState) => (
      <LiveContext value={fakeLive({ project, guidance: next })}>
        <Shell project={project} />
      </LiveContext>
    );
    const shown = render(tree({}));
    act(() => shown.rerender(tree(guidance)));
  }

  it('goes to the pane that shows its view, which becomes active', () => {
    renderSplit({
      marks: { kind: 'highlight', targets: ['patient'], view: 'storage', request: 1 },
    });
    expect(viewsDrawn()).toEqual(['system-overview', 'storage']);
    expect(activeView()).toBe('storage');
  });

  it('applies there even when another tab was used after this one', () => {
    setTabUseForTests(usedElsewhere);
    renderSplit({
      marks: { kind: 'highlight', targets: ['patient'], view: 'storage', request: 1 },
    });
    expect(activeView()).toBe('storage');
  });

  it('opens a view no pane shows in the active pane', () => {
    renderSplit({ marks: { kind: 'highlight', targets: ['patient'], view: 'people', request: 1 } });
    expect(viewsDrawn()).toEqual(['people', 'storage']);
    expect(activeView()).toBe('people');
  });
});

describe('the panes of a split view, as the person works with them', () => {
  it('makes the left neighbor active as the active pane closes', () => {
    render(<Shell project={project} />);
    openBeside('Storage');
    openBeside('People');
    expect(viewsDrawn()).toEqual(['system-overview', 'people', 'storage']);
    fireEvent.pointerDown(canvases()[1] as HTMLElement);
    const people = screen.getByRole('region', { name: 'People, the active pane' });
    fireEvent.click(within(people).getByRole('button', { name: 'Close the pane of “People”' }));
    expect(viewsDrawn()).toEqual(['system-overview', 'storage']);
    expect(activeView()).toBe('system-overview');
  });

  it('opens beside from an inactive pane’s header, at three panes in the rightmost but the active one', () => {
    render(<Shell project={project} />);
    openBeside('Storage');
    openBeside('People');
    const people = screen.getByRole('region', { name: 'People, a pane' });
    fireEvent.click(within(people).getByRole('button', { name: 'Open "People" beside' }));
    expect(viewsDrawn()).toEqual(['system-overview', 'people', 'people']);
    expect(activeView()).toBe('system-overview');
  });

  it('opens a destination’s view beside at three panes in the rightmost but the active one', () => {
    render(<Shell project={linked} />);
    openBeside('Storage');
    openBeside('People');
    fireEvent.pointerDown(canvases()[2] as HTMLElement);
    expect(activeView()).toBe('storage');
    fireEvent.click(screen.getByRole('tab', { name: 'Outline' }));
    fireEvent.click(
      within(screen.getByRole('tree', { name: 'Outline of Storage' })).getByText('Appointments DB'),
    );
    fireEvent.click(
      within(inspector()).getByRole('button', {
        name: 'Open the view “Storage” beside the active pane',
      }),
    );
    expect(viewsDrawn()).toEqual(['system-overview', 'storage', 'storage']);
    expect(canvases()[2]).toHaveAttribute('data-active', 'true');
    expect(canvases()[1]).toHaveAttribute('data-selected', 'patient');
  });

  it('moves a border with the pointer, which comes back from past its limit without drifting', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.classList.contains('canvas-panes')
        ? new DOMRect(0, 0, 1000, 600)
        : new DOMRect(0, 0, 0, 0);
    });
    try {
      render(<Shell project={project} />);
      openBeside('Storage');
      const border = screen.getByRole('separator', {
        name: 'Resize “System overview” and “Storage”',
      });
      fireEvent.pointerDown(border, { pointerId: 1, button: 0, clientX: 500 });
      fireEvent.pointerMove(border, { pointerId: 1, clientX: 600 });
      expect(border).toHaveAttribute('aria-valuenow', '60');
      // Far past the least width of the left pane, 240 pixels of 1000, and back.
      fireEvent.pointerMove(border, { pointerId: 1, clientX: -2000 });
      expect(border).toHaveAttribute('aria-valuenow', '24');
      fireEvent.pointerMove(border, { pointerId: 1, clientX: 450 });
      expect(border).toHaveAttribute('aria-valuenow', '45');
      fireEvent.pointerUp(border, { pointerId: 1, clientX: 450 });
      fireEvent.pointerMove(border, { pointerId: 1, clientX: 900 });
      expect(border).toHaveAttribute('aria-valuenow', '45');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('draws the same scene in a pane as it becomes active and as it stops being so', () => {
    render(<Shell project={project} />);
    openBeside('Storage');
    fireEvent.pointerDown(canvases()[1] as HTMLElement);
    expect(activeView()).toBe('storage');
    fireEvent.pointerDown(canvases()[0] as HTMLElement);
    expect(activeView()).toBe('system-overview');
    expect(canvases().map((canvas) => canvas.dataset.scenes)).toEqual(['1', '1']);
  });

  it('places the new shapes of a view two panes show in one of them, the active one first', () => {
    render(<Shell project={project} />);
    openBeside('Storage');
    openBeside('Storage');
    expect(viewsDrawn()).toEqual(['system-overview', 'storage', 'storage']);
    const places = () => canvases().map((canvas) => canvas.dataset.placesNew);
    // The leftmost of the two, while neither is active.
    expect(places()).toEqual(['true', 'true', 'false']);
    fireEvent.pointerDown(canvases()[2] as HTMLElement);
    expect(places()).toEqual(['true', 'false', 'true']);
  });

  it('keeps a tour in the pane it plays in, the other panes beside it', () => {
    render(
      <LiveContext value={fakeLive({ project })}>
        <Shell project={project} />
      </LiveContext>,
    );
    openBeside('Storage');
    const panel = screen.getByRole('complementary', { name: 'Outline and model' });
    fireEvent.click(within(panel).getByRole('tab', { name: 'Tours' }));
    fireEvent.click(
      within(within(panel).getByRole('tabpanel', { name: 'Tours' })).getByRole('button', {
        name: 'Play “How booking works” full screen',
      }),
    );
    expect(document.querySelector('.shell')).toHaveClass('tour-playing');
    expect(viewsDrawn()).toEqual(['system-overview', 'storage']);
    fireEvent.pointerDown(canvases()[1] as HTMLElement);
    fireEvent.focus(canvases()[1] as HTMLElement);
    expect(activeView()).toBe('system-overview');
    expect(screen.getByRole('article')).toHaveTextContent('Clinic booking');
  });
});

describe('the panes the tab keeps for a project', () => {
  it('reads no other project’s panes', () => {
    sessionStorage.setItem(
      panesKey('Another project'),
      JSON.stringify({
        active: 'pane-1',
        panes: [
          { id: 'pane-1', view: 'system-overview', width: 1 },
          { id: 'pane-2', view: 'storage', width: 1 },
        ],
      }),
    );
    render(<Shell project={project} />);
    expect(viewsDrawn()).toEqual(['system-overview']);
  });

  it('passes over panes that name a view the project lacks, and drops them', () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        active: 'pane-1',
        panes: [
          { id: 'pane-1', view: 'system-overview', width: 1 },
          { id: 'pane-2', view: 'gone', width: 1 },
        ],
      }),
    );
    render(<Shell project={project} />);
    expect(viewsDrawn()).toEqual(['system-overview']);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('closes the panes of a view deleted, down to the single canvas', () => {
    keepTwoPanes();
    const shown = render(<Shell project={project} />);
    expect(viewsDrawn()).toEqual(['system-overview', 'storage']);
    fireEvent.pointerDown(canvases()[1] as HTMLElement);
    shown.rerender(
      <Shell
        project={{ ...project, views: project.views.filter((view) => view.id !== 'storage') }}
      />,
    );
    expect(viewsDrawn()).toEqual(['system-overview']);
    expect(activeView()).toBe('system-overview');
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('brings back each project’s own panes as another opens in the tab', () => {
    const other: ProjectSnapshot = {
      ...project,
      project: { ...project.project, name: 'Another project' },
    };
    sessionStorage.setItem(
      panesKey('Another project'),
      JSON.stringify({
        active: 'pane-3',
        panes: [
          { id: 'pane-2', view: 'people', width: 1 },
          { id: 'pane-3', view: 'storage', width: 1 },
        ],
      }),
    );
    keepTwoPanes();
    const shown = render(<Shell project={project} />);
    expect(viewsDrawn()).toEqual(['system-overview', 'storage']);
    shown.rerender(<Shell project={other} />);
    expect(viewsDrawn()).toEqual(['people', 'storage']);
    expect(activeView()).toBe('storage');
    shown.rerender(<Shell project={project} />);
    expect(viewsDrawn()).toEqual(['system-overview', 'storage']);
    expect(activeView()).toBe('system-overview');
  });
});
