import type { ProjectSnapshot } from '@visual-anything/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setCurrentLanguage } from '../i18n/language';
import { LiveContext } from '../live/context';
import { Shell } from '../shell/Shell';
import { fakeLive } from '../test/fakeLive';
import { loadSample } from '../test/sample';

vi.mock('../canvas/CanvasArea', () => import('../test/FakeCanvasArea'));

const sample = loadSample();
const overview = sample.views[0] as ProjectSnapshot['views'][number];
/** The sample with a second view, without the note, which opens first. */
const project: ProjectSnapshot = {
  ...sample,
  views: [
    { ...overview, id: 'ownership', name: 'Ownership', positions: [], freeShapes: [] },
    overview,
  ],
};

function openShell() {
  render(
    <LiveContext value={fakeLive({ project })}>
      <Shell project={project} />
    </LiveContext>,
  );
  // The fake canvas takes the focus as the real one does.
  screen.getByRole('application').tabIndex = 0;
}

const canvas = () => screen.getByRole('application');
const field = () => within(screen.getByRole('search')).getByRole('combobox');
const inspector = () => screen.getByRole('complementary', { name: 'Inspector' });
const openViewName = () => within(screen.getByRole('banner')).getByText(/overview|Ownership/);

/** Opens the find field from the canvas, types a query and waits for what it finds. */
async function findFromCanvas(query: string): Promise<HTMLElement> {
  canvas().focus();
  fireEvent.keyDown(canvas(), { key: 'f', ctrlKey: true });
  fireEvent.change(field(), { target: { value: query } });
  return screen.findByRole('listbox');
}

describe('the find field', () => {
  it('opens on Ctrl+F or ⌘F from the canvas or a panel, focused', () => {
    openShell();
    expect(screen.queryByRole('search')).toBeNull();
    canvas().focus();
    const event = fireEvent.keyDown(canvas(), { key: 'f', ctrlKey: true });
    expect(event).toBe(false);
    expect(field()).toHaveFocus();
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(screen.queryByRole('search')).toBeNull();
    expect(canvas()).toHaveFocus();

    const panel = screen.getByRole('complementary', { name: 'Inspector' });
    fireEvent.keyDown(panel, { key: 'F', metaKey: true, shiftKey: true });
    expect(field()).toHaveFocus();
  });

  it('leaves Ctrl+F to the browser elsewhere', () => {
    openShell();
    const header = screen.getByRole('banner');
    const button = within(header).getByRole('button', { name: 'Copy address' });
    button.focus();
    const event = fireEvent.keyDown(button, { key: 'f', ctrlKey: true });
    expect(event).toBe(true);
    expect(screen.queryByRole('search')).toBeNull();
  });

  it('lists what it finds by the views that draw it, the open view first', async () => {
    openShell();
    const list = await findFromCanvas('appointments');
    const groups = within(list).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
      'In Ownership, open now',
      'In System overview',
    ]);
    expect(
      within(groups[0] as HTMLElement)
        .getAllByRole('option')
        .map((each) => each.textContent),
    ).toEqual(['Appointments APIService', 'Appointments DBCalendar']);
    // The note is only in the view it was drawn in.
    expect(within(groups[1] as HTMLElement).getByRole('option')).toHaveTextContent(
      /^Scheduling owns the calendar/,
    );
    expect(screen.getByText('3 found')).toBeInTheDocument();
  });

  it('says where it matched when it is not the name', async () => {
    openShell();
    const list = await findFromCanvas('postgres');
    expect(within(list).getByRole('option')).toHaveTextContent(
      'Appointments DBCalendar · engine: postgres',
    );
  });

  it('selects what Enter chooses in the open view, and says so', async () => {
    openShell();
    await findFromCanvas('reminder');
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(within(inspector()).getAllByText('Reminder service').length).toBeGreaterThan(0);
    expect(
      await screen.findByText('Reminder service, Service, is selected in Ownership.'),
    ).toBeInTheDocument();
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(canvas()).toHaveFocus();
  });

  it('opens the view that draws what Enter chooses', async () => {
    openShell();
    await findFromCanvas('calendar-note');
    fireEvent.keyDown(field(), { key: 'Enter' });
    await waitFor(() => expect(openViewName()).toHaveTextContent('System overview'));
    expect(
      await screen.findByText(
        /^Scheduling owns the calendar.*, Note, is selected in System overview\.$/,
      ),
    ).toBeInTheDocument();
  });

  it('lists every view that draws it on Alt+Enter, and opens the one chosen', async () => {
    openShell();
    const list = await findFromCanvas('patient');
    fireEvent.keyDown(field(), { key: 'Enter', altKey: true });
    expect(
      await screen.findByText('Drawn in 2 views: Ownership, System overview.'),
    ).toBeInTheDocument();
    const views = within(list)
      .getAllByRole('option')
      .filter((each) => /^Open in/.test(each.textContent ?? ''));
    expect(views.map((each) => each.textContent)).toEqual([
      'Open in Ownership',
      'Open in System overview',
    ]);
    expect(views[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(field(), { key: 'ArrowDown' });
    expect(views[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(field(), { key: 'Enter' });
    await waitFor(() => expect(openViewName()).toHaveTextContent('System overview'));
    expect(within(inspector()).getAllByText('Patient').length).toBeGreaterThan(0);
  });

  it('finds built-in names in Spanish too, and reads in Spanish', async () => {
    setCurrentLanguage('es');
    openShell();
    const list = await findFromCanvas('servicio');
    expect(
      within(list)
        .getAllByRole('option')
        .map((each) => each.textContent),
    ).toEqual(expect.arrayContaining(['Appointments APIServicio', 'Reminder serviceServicio']));
    expect(within(list).getAllByRole('group')[0]).toHaveAccessibleName(
      'En Ownership, abierta ahora',
    );
  });
});
