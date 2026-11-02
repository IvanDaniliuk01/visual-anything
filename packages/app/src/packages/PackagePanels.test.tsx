/**
 * Packages' panels in the inspector (ADR 0089's M14.4 clarification), with the code's answers given
 * by hand: offered by the element's component and those it derives from; each block drawn with the
 * app's controls; a button running the package's action into the review; a failure said inside the
 * section with Show again; and only the answer of the call asked for last shown.
 */
import {
  codeStatusOf,
  definitionsIn,
  notApprovedProblem,
  packageCodeOf,
  withApproval,
  type PackageCodeChanges,
  type PanelBlock,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Element, Id, PackageFile } from '@visual-anything/schema';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PackageCalls } from '../code/client';
import { CodeStore, type PackageCodeView } from '../code/context';
import type { PackageAnswer } from '../code/messages';
import { codeProject, gaugesPackage } from '../code/test/project';
import { EditorContext, type Editor } from '../editor/EditorContext';
import { EMPTY_SELECTION } from '../editor/selection';
import { PackagePanels } from './PackagePanels';

type PanelAnswer = PackageAnswer<PanelBlock[]>;

function gauges(): PackageFile {
  return {
    ...gaugesPackage(['export function panel() { return []; }']),
    extensions: {
      actions: [{ id: 'calibrate', label: 'Calibrate', where: ['selection'] }],
      panels: [{ id: 'readings', label: 'Readings', components: ['gauges.thermometer'] }],
    },
  };
}

function views(
  project: ProjectSnapshot,
  how: 'approved' | 'unapproved' = 'approved',
): Map<Id, PackageCodeView> {
  const code = packageCodeOf(project.packages[0]!)!;
  const approvals =
    how === 'approved'
      ? withApproval([], { hash: code.hash, package: 'gauges', capabilities: [] })
      : [];
  return new Map([['gauges', { code, status: codeStatusOf(code, approvals) }]]);
}

const OK = (blocks: PanelBlock[]): PanelAnswer => ({ ok: true, value: blocks });

function fakeCalls(panel: PackageCalls['packagePanel']) {
  const changes: PackageAnswer<PackageCodeChanges> = {
    ok: true,
    value: {
      label: 'Calibrate',
      commands: [{ type: 'update-element', id: 'oven', changes: { name: 'Calibrated' } }],
    },
  };
  return {
    packagePanel: vi.fn(panel),
    runPackageAction: vi.fn<PackageCalls['runPackageAction']>(() => Promise.resolve(changes)),
    readFileWithPackage: vi.fn<PackageCalls['readFileWithPackage']>(),
    writeFileWithPackage: vi.fn<PackageCalls['writeFileWithPackage']>(),
  };
}

interface SetUp {
  answer?: PackageCalls['packagePanel'];
  how?: 'approved' | 'unapproved';
  element?: Id;
  readOnly?: boolean;
}

function setUp({
  answer = () => Promise.resolve(OK([])),
  how = 'approved',
  element = 'oven',
  readOnly = false,
}: SetUp = {}) {
  const project = codeProject(gauges());
  const store = new CodeStore();
  store.set({ packages: views(project, how), elements: new Map(), drawings: new Map() });
  const calls = fakeCalls(answer);
  store.lendCalls(calls);
  store.changes.attach(() => project);
  const editorOf = (state: ProjectSnapshot): Editor => ({
    project: state,
    definitions: definitionsIn(state),
    viewId: 'kitchen',
    scene: undefined,
    selection: { ...EMPTY_SELECTION, elements: new Set([element]) },
    select: () => {},
    send: readOnly ? undefined : () => Promise.resolve({ ok: true, created: [], warnings: [] }),
    reveal: () => {},
    code: store,
  });
  const elementOf = (state: ProjectSnapshot) =>
    state.model.elements.find((each) => each.id === element) as Element;
  const view = (state: ProjectSnapshot) => (
    <EditorContext.Provider value={editorOf(state)}>
      <PackagePanels element={elementOf(state)} />
    </EditorContext.Provider>
  );
  const rendered = render(view(project));
  const rerender = (state: ProjectSnapshot) => rendered.rerender(view(state));
  return { project, store, calls, rerender };
}

/** The same project, changed: an element renamed. */
function changed(project: ProjectSnapshot, name: string): ProjectSnapshot {
  return {
    ...project,
    model: {
      ...project.model,
      elements: project.model.elements.map((each) =>
        each.id === 'fridge' ? { ...each, name } : each,
      ),
    },
  };
}

const panelRegion = () => screen.getByRole('region', { name: /^Readings/ });

/** A call that answers when told to. */
function deferred() {
  const waiting: ((answer: PanelAnswer) => void)[] = [];
  const answer: PackageCalls['packagePanel'] = () =>
    new Promise((resolve) => {
      waiting.push(resolve);
    });
  return { answer, waiting };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('a package’s panel', () => {
  it('shows for an element of the component it names, or one derived from it, and calls its code for it', async () => {
    const { calls } = setUp();
    const region = panelRegion();
    expect(within(region).getByRole('heading', { level: 4 })).toHaveTextContent(
      'Readings from the package “Gauges”',
    );
    await waitFor(() => expect(calls.packagePanel).toHaveBeenCalledTimes(1));
    expect(calls.packagePanel).toHaveBeenCalledWith('gauges', {
      panel: 'readings',
      element: 'oven',
    });
    expect(
      await within(region).findByText('The package shows nothing here for this element.'),
    ).toBeTruthy();
  });

  it('does not show for an element of another component', () => {
    setUp({ element: 'kitchen' });
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('does not show while the package’s code waits for approval', () => {
    const { calls } = setUp({ how: 'unapproved' });
    expect(screen.queryByRole('region')).toBeNull();
    expect(calls.packagePanel).not.toHaveBeenCalled();
  });

  it('draws each kind of block with the app’s controls, writing every text as text', async () => {
    const blocks: PanelBlock[] = [
      { kind: 'heading', text: 'Now' },
      { kind: 'text', text: '<b>Not bold</b>' },
      { kind: 'value', label: 'Celsius', value: 100 },
      { kind: 'value', label: 'Calibrated', value: false },
      { kind: 'heading', text: 'Last readings' },
      {
        kind: 'table',
        columns: ['At', 'Celsius', 'Checked'],
        rows: [
          ['08:00', 98.5, true],
          ['09:00', null, false],
        ],
      },
      {
        kind: 'chart',
        chart: 'bar',
        labels: ['Mon', 'Tue', 'Wed'],
        series: [
          { name: 'Low', values: [1, 2, 3] },
          { name: 'High', values: [4, 5, 6] },
        ],
      },
      {
        kind: 'chart',
        chart: 'line',
        labels: ['Mon', 'Tue'],
        series: [{ name: 'Celsius', values: [90, 100] }],
      },
      { kind: 'button', label: 'Calibrate now', action: 'calibrate' },
    ];
    setUp({ answer: () => Promise.resolve(OK(blocks)) });
    const region = panelRegion();
    await within(region).findByRole('heading', { name: 'Now', level: 5 });
    // A text is never read as HTML.
    expect(within(region).getByText('<b>Not bold</b>')).toBeTruthy();
    expect(region.querySelector('b')).toBeNull();
    // Values side by side make one list of terms and their values.
    const terms = within(region).getAllByRole('term');
    expect(terms.map((each) => each.textContent)).toEqual(['Celsius', 'Calibrated']);
    const definitions = within(region).getAllByRole('definition');
    expect(definitions.map((each) => each.textContent)).toEqual(['100', 'No']);
    // A table: named by the heading before it, scrolling in a box the keyboard reaches.
    const table = within(region).getByRole('region', { name: 'Last readings' });
    expect(table).toHaveAttribute('tabindex', '0');
    const grid = within(table).getByRole('table');
    expect(
      within(grid)
        .getAllByRole('columnheader')
        .map((each) => each.textContent),
    ).toEqual(['At', 'Celsius', 'Checked']);
    expect(
      within(grid)
        .getAllByRole('cell')
        .map((each) => each.textContent),
    ).toEqual(['08:00', '98.5', 'Yes', '09:00', '', 'No']);
    // Charts: a drawing named by what it shows, and its numbers as a table.
    const bars = within(region).getByRole('img', {
      name: 'Bar chart of Low, High, over 3 labels. From 0 to 6.',
    });
    expect(bars.querySelectorAll('rect')).toHaveLength(6);
    expect(bars.querySelector('title')?.textContent).toBe('Low, Mon: 1');
    expect(
      within(region).getByRole('img', {
        name: 'Line chart of Celsius, over 2 labels. From 90 to 100.',
      }),
    ).toBeTruthy();
    const numbers = within(region)
      .getAllByRole('table')
      .find((each) => each.classList.contains('visually-hidden'));
    expect(numbers?.textContent).toContain('Mon14');
    // The legend names each series of a chart that has more than one.
    expect(region.querySelector('.package-chart-legend')?.textContent).toBe('LowHigh');
    expect(within(region).getByRole('button', { name: 'Calibrate now' })).toBeEnabled();
  });

  it('runs the package’s action from a button, on the element, into the review', async () => {
    const { calls, store } = setUp({
      answer: () =>
        Promise.resolve(OK([{ kind: 'button', label: 'Calibrate now', action: 'calibrate' }])),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Calibrate now' }));
    expect(calls.runPackageAction).toHaveBeenCalledWith('gauges', {
      action: 'calibrate',
      selection: ['oven'],
      view: 'kitchen',
    });
    await waitFor(() => expect(store.changes.snapshot().state).toBe('reviewing'));
  });

  it('keeps its buttons from running while the project cannot be changed', async () => {
    setUp({
      readOnly: true,
      answer: () =>
        Promise.resolve(OK([{ kind: 'button', label: 'Calibrate now', action: 'calibrate' }])),
    });
    expect(await screen.findByRole('button', { name: 'Calibrate now' })).toBeDisabled();
  });

  it('says why its code failed inside the section, calls it again only when asked, and Show again does', async () => {
    let failing = true;
    const { calls, project, rerender } = setUp({
      answer: () =>
        Promise.resolve(
          failing
            ? { ok: false, problem: notApprovedProblem({ id: 'gauges', name: 'Gauges' }) }
            : OK([{ kind: 'text', text: 'Back' }]),
        ),
    });
    const region = panelRegion();
    expect(
      await within(region).findByText(
        'The code of the package "Gauges" is not approved: the person approves it in the app before it runs.',
      ),
    ).toBeTruthy();
    // A change of the project does not call a failed panel again by itself.
    rerender(changed(project, 'Cooler'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(calls.packagePanel).toHaveBeenCalledTimes(1);
    failing = false;
    fireEvent.click(within(region).getByRole('button', { name: 'Show again' }));
    expect(await within(region).findByText('Back')).toBeTruthy();
    expect(calls.packagePanel).toHaveBeenCalledTimes(2);
  });

  it('calls its code again as the project changes, once at a time, dropping the answer of an earlier call', async () => {
    const { answer, waiting } = deferred();
    const { calls, project, rerender } = setUp({ answer });
    await waitFor(() => expect(calls.packagePanel).toHaveBeenCalledTimes(1));
    rerender(changed(project, 'Cooler'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    // The first call has not answered, so the second waits for it.
    expect(calls.packagePanel).toHaveBeenCalledTimes(1);
    await act(async () => {
      waiting[0]!(OK([{ kind: 'text', text: 'Stale' }]));
      await Promise.resolve();
    });
    await waitFor(() => expect(calls.packagePanel).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Stale')).toBeNull();
    await act(async () => {
      waiting[1]!(OK([{ kind: 'text', text: 'Fresh' }]));
      await Promise.resolve();
    });
    expect(await screen.findByText('Fresh')).toBeTruthy();
    expect(screen.queryByText('Stale')).toBeNull();
  });

  it('folds away from its heading, and is not called while folded', async () => {
    const { calls, project, rerender } = setUp({
      answer: () => Promise.resolve(OK([{ kind: 'text', text: 'Shown' }])),
    });
    const toggle = within(panelRegion()).getByRole('button', { name: /^Readings/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('Shown')).toBeVisible();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Shown')).not.toBeVisible();
    rerender(changed(project, 'Cooler'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(calls.packagePanel).toHaveBeenCalledTimes(1);
    fireEvent.click(toggle);
    await waitFor(() => expect(calls.packagePanel).toHaveBeenCalledTimes(2));
  });
});
