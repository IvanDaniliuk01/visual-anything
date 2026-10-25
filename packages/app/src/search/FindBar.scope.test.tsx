/**
 * Search and the open view's scope (ADR-0040): what the scope leaves out is found all the same,
 * listed under the views that show it, with Add to this view, which sends one command.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { SendCommand } from '../canvas/CanvasArea';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LiveContext } from '../live/context';
import { Shell } from '../shell/Shell';
import { fakeLive } from '../test/fakeLive';
import { loadSample } from '../test/sample';
import type { Entry } from './find';
import { groupsOf, viewsDrawing } from './groups';

vi.mock('../canvas/CanvasArea', () => import('../test/FakeCanvasArea'));

const sample = loadSample();
const overview = sample.views[0] as ProjectSnapshot['views'][number];
/** The sample with a first view, open first, that leaves the Appointments DB out. */
const project: ProjectSnapshot = {
  ...sample,
  views: [
    { ...overview, id: 'calls', name: 'Calls', scope: { leftOut: ['appointments-db'] } },
    overview,
  ],
};

const entry = (kind: Entry['kind'], id: string) => ({ kind, id }) as Entry;

describe('the views that draw what search found', () => {
  it('are those whose scope shows it', () => {
    expect(viewsDrawing(project, entry('element', 'appointments-db')).map((v) => v.id)).toEqual([
      'system-overview',
    ]);
    expect(viewsDrawing(project, entry('relation', 'api-reads-db')).map((v) => v.id)).toEqual([
      'system-overview',
    ]);
    expect(viewsDrawing(project, entry('element', 'patient')).map((v) => v.id)).toEqual([
      'calls',
      'system-overview',
    ]);
  });

  it('list what the open view leaves out under a view that shows it', () => {
    const found = [
      { entry: entry('element', 'patient'), rank: 0, matched: { field: 'name' as const } },
      { entry: entry('element', 'appointments-db'), rank: 0, matched: { field: 'name' as const } },
    ];
    const groups = groupsOf(found, project, 'calls');
    expect(
      groups.map((group) => [group.view?.id, group.found.map((each) => each.entry.id)]),
    ).toEqual([
      ['calls', ['patient']],
      ['system-overview', ['appointments-db']],
    ]);
  });
});

describe('Add to this view, in search', () => {
  it('adds what the open view leaves out as one command', async () => {
    const send = vi.fn<SendCommand>(() => Promise.resolve({ ok: true }));
    render(
      <LiveContext value={fakeLive({ project })}>
        <Shell project={project} onCommand={send} />
      </LiveContext>,
    );
    const canvas = screen.getByRole('application');
    canvas.tabIndex = 0;
    canvas.focus();
    fireEvent.keyDown(canvas, { key: 'f', ctrlKey: true });
    const field = within(screen.getByRole('search')).getByRole('combobox');
    fireEvent.change(field, { target: { value: 'appointments db' } });
    const list = await screen.findByRole('listbox');
    const add = within(list).getByRole('option', { name: 'Add to this view, “Calls”' });
    fireEvent.click(add);
    expect(send).toHaveBeenCalledWith({
      type: 'add-to-view',
      view: 'calls',
      elements: ['appointments-db'],
    });
  });
});
