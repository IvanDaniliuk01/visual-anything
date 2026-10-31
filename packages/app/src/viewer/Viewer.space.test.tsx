/**
 * The read-only page's physical-space panel (ADR 0076), against the stand-in worker that draws boxes:
 * a page that holds solids' files or poses holds the solid worker and has the panel, opened from
 * Physical space among the reading tools, by Alt+Shift+P and by its address, linked to the page's
 * selection, and offering only what reads; a page with neither, or with pictures only, has no panel
 * and no worker, and keeps its policy.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import { validateFile } from '@visual-anything/schema/validate';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StandInSolidWorker } from '../solids/stand-in';
import { FakeApplication, FakeResizeObserver } from '../test/FakeApplication';
import { loadSample } from '../test/sample';
import { workcell } from '../test/space';
import { pageDataOf, readPageData } from './data';
import { SOLID_WORKER_ID, writePage } from './page';
import { PagePreferences } from './preferences';
import { pageSolidClient } from './solid-clients';
import { holdsPoses, pageHasSpace, withPoses, type PageSolids } from './solids';
import { ViewerApp } from './Viewer';

vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  const { FakeApplication: Application } = await import('../test/FakeApplication');
  return { ...pixi, Application };
});

const VIEW = 'cell-view';

beforeEach(() => {
  FakeApplication.created = [];
  FakeResizeObserver.observers = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * The page of a project, read back as the page reads it, with what its export holds of its solids,
 * opened at an address, its client and its panel made as `main.tsx` makes them.
 */
async function open(
  project: ProjectSnapshot,
  solids: PageSolids | undefined,
  hash = '',
  forced?: boolean,
) {
  const read = readPageData(
    JSON.stringify(pageDataOf(project, solids ? { solids } : {})),
    validateFile,
  );
  if (!read.ok) throw new Error(read.problems.join('\n'));
  const workers: StandInSolidWorker[] = [];
  const client = pageSolidClient(read.solids, () => {
    const worker = new StandInSolidWorker();
    workers.push(worker);
    return worker;
  });
  const space = forced ?? (client !== undefined && pageHasSpace(read.project, read.solids));
  window.history.replaceState(null, '', `/page.html${hash}`);
  render(
    <ViewerApp
      read={read}
      preferences={new PagePreferences(window)}
      solids={client}
      space={space}
    />,
  );
  await settle();
  return { workers, worker: () => workers.at(-1), space };
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

const tools = () => screen.getByRole('toolbar', { name: 'Reading tools' });
const panel = () => screen.queryByRole('region', { name: 'Physical space' });
const pressSpaceKey = () =>
  fireEvent.keyDown(window, { key: 'P', code: 'KeyP', altKey: true, shiftKey: true });

/** A posed workcell's page, as the export writes it: the worker, from no files, for its poses. */
const posedPage = () => withPoses(workcell(), undefined);

describe('what a page holds for physical space', () => {
  it('holds the worker from no files for poses alone, and nothing for neither', () => {
    expect(holdsPoses(workcell())).toBe(true);
    expect(withPoses(workcell(), undefined)).toEqual({ form: 'files', files: {} });
    expect(holdsPoses(loadSample())).toBe(false);
    expect(withPoses(loadSample(), undefined)).toBeUndefined();
    // A page of pictures holds no worker, whatever its poses.
    expect(withPoses(workcell(), undefined, 'pictures')).toBeUndefined();
    expect(pageHasSpace(workcell(), { form: 'pictures', pictures: [] })).toBe(false);
    expect(pageHasSpace(workcell(), { form: 'files', files: {} })).toBe(true);
    expect(pageHasSpace(workcell({ posed: false }), { form: 'files', files: {} })).toBe(false);
  });

  it('keeps the policy of a page of pictures with poses, and gives the worker’s to one of poses', async () => {
    const assets = { script: 'void 0;', style: '', solidWorker: 'self.onmessage = () => {};' };
    const pictures = await writePage({
      assets,
      data: pageDataOf(workcell(), { solids: { form: 'pictures', pictures: [] } }),
      title: 'Workcell',
    });
    expect(pictures.policy).toContain("worker-src 'none'");
    expect(pictures.policy).toMatch(/trusted-types default$/);
    expect(pictures.html).not.toContain(SOLID_WORKER_ID);
    const plain = await writePage({
      assets,
      data: pageDataOf(loadSample(), {}),
      title: 'My systems',
    });
    expect(plain.policy).toContain("worker-src 'none'");
    expect(plain.html).not.toContain(SOLID_WORKER_ID);
    const posed = await writePage({
      assets,
      data: pageDataOf(workcell(), { solids: withPoses(workcell(), undefined) }),
      title: 'Workcell',
    });
    expect(posed.policy).toContain('worker-src blob:');
    expect(posed.policy).toContain('trusted-types default visual-anything-solids');
    expect(posed.html).toContain(SOLID_WORKER_ID);
  });
});

describe('the read-only page’s physical-space panel', () => {
  it('is not there in a page with neither solids nor poses, which starts no worker', async () => {
    const { workers, space } = await open(loadSample(), undefined);
    expect(space).toBe(false);
    expect(within(tools()).queryByRole('button', { name: 'Physical space' })).toBeNull();
    pressSpaceKey();
    await settle();
    expect(panel()).toBeNull();
    expect(workers).toHaveLength(0);
  });

  it('is not there in a page of pictures, whatever its poses', async () => {
    const { workers } = await open(workcell(), { form: 'pictures', pictures: [] });
    expect(within(tools()).queryByRole('button', { name: 'Physical space' })).toBeNull();
    pressSpaceKey();
    await settle();
    expect(panel()).toBeNull();
    expect(workers).toHaveLength(0);
  });

  it('opens with poses alone from Physical space, and draws through the page’s worker', async () => {
    const { worker } = await open(workcell(), posedPage(), `#view=${VIEW}`);
    const toggle = within(tools()).getByRole('button', { name: 'Physical space' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    await settle();
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(panel()).toHaveTextContent('Shows “World”');
    const [shown] = worker()?.ofType('space/show') ?? [];
    expect(shown?.entries.map((entry) => entry.element)).toEqual([
      'world',
      'table',
      'arm',
      'camera',
      'elbow',
    ]);
    // The page's address carries the panel, as the app's does.
    await waitFor(() => expect(window.location.hash).toBe(`#view=${VIEW}&space=open`));
    fireEvent.click(screen.getByRole('button', { name: 'Close the physical-space panel' }));
    await settle();
    expect(panel()).toBeNull();
    expect(worker()?.ofType('space/end')).toHaveLength(1);
  });

  it('opens and closes with Alt+Shift+P', async () => {
    await open(workcell(), posedPage(), `#view=${VIEW}`);
    pressSpaceKey();
    await settle();
    expect(panel()).not.toBeNull();
    pressSpaceKey();
    await settle();
    expect(panel()).toBeNull();
  });

  it('opens as the page’s address says, on what it shows', async () => {
    await open(workcell(), posedPage(), `#view=${VIEW}&space=root:arm`);
    expect(panel()).toHaveTextContent('Shows “Arm”');
  });

  it('offers only what reads: no handles, no Move, Rotate, Place or Take out', async () => {
    const { worker } = await open(workcell(), posedPage(), `#view=${VIEW}&select=table&space=open`);
    const region = panel();
    if (!region) throw new Error('The panel is open.');
    const panelTools = within(region).getByRole('toolbar', { name: 'Physical space tools' });
    for (const name of ['Fit', 'Frame', 'Show on the canvas']) {
      expect(within(panelTools).getByRole('button', { name })).toBeInTheDocument();
    }
    for (const name of [
      'Move',
      'Rotate',
      'Place in physical space',
      'Take out of physical space',
    ]) {
      expect(within(region).queryByRole('button', { name })).toBeNull();
    }
    const shown = worker()?.ofType('space/show') ?? [];
    const updates = worker()?.ofType('space/update') ?? [];
    expect([...shown, ...updates].some((each) => each.handles)).toBe(false);
    // The page's selection is the panel's.
    expect(shown.at(-1)?.states).toContainEqual({ element: 'table', selected: true });
    const frames = within(region).getByRole('application', { name: /^Physical space:/ });
    fireEvent.keyDown(frames, { key: 'm' });
    expect(screen.queryByText('The handles move.')).toBeNull();
    expect(region).not.toHaveTextContent('Place in physical space');
  });

  it('marks what the page’s outline hovers, as the app’s does', async () => {
    const { worker } = await open(workcell(), posedPage(), `#view=${VIEW}&space=open`);
    fireEvent.click(within(tools()).getByRole('button', { name: 'Outline' }));
    await settle();
    const outline = screen.getByRole('complementary', { name: 'Outline' });
    const row = within(outline)
      .getAllByRole('treeitem')
      .find((each) => each.textContent?.includes('Camera'));
    if (!row) throw new Error('The outline lists the camera.');
    fireEvent.pointerOver(row);
    await settle();
    const updates = worker()?.ofType('space/update') ?? [];
    expect(updates.at(-1)?.states).toContainEqual({ element: 'camera', hovered: true });
  });

  it('says nothing of putting something in physical space when the view holds nothing there', async () => {
    // A page whose poses no longer reach the view, as one changed by hand might be.
    await open(workcell({ posed: false }), posedPage(), `#view=${VIEW}&space=open`, true);
    expect(panel()).toHaveTextContent('Nothing this view shows is in physical space.');
    expect(panel()).not.toHaveTextContent('Place in physical space');
  });
});
