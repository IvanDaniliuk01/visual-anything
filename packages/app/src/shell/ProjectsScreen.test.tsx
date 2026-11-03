/**
 * The Projects screen, while the local program is at home (ADR 0093): the projects it offers, the
 * recent ones, a new project from a sample or empty, a typed folder, and "Projects…" in the header's
 * menu, which goes back.
 */
import { DEFAULT_PREFERENCES, PROTOCOL_VERSION, encodeServerMessage } from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { resetLanguageForTests } from '../i18n/language';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { loadSample } from '../test/sample';
import { resetPreferencesForTests } from '../theme/store';

vi.mock('../canvas/CanvasArea', () => import('../test/FakeCanvasArea'));

const FOLDER = 'C:/Users/ana/Documents/Visual Anything';
const TWO_DAYS_AGO = Date.now() - 2 * 86_400_000 - 60_000;

const offer = (extra: object = {}) =>
  encodeServerMessage({
    type: 'home/offered',
    protocolVersion: PROTOCOL_VERSION,
    folder: FOLDER,
    projects: [
      { path: `${FOLDER}/Audit`, name: 'Audit', world: 'healthcare', changed: TWO_DAYS_AGO },
    ],
    recent: [
      { path: 'D:/work/shop', name: 'Shop', world: 'c4', changed: TWO_DAYS_AGO, missing: false },
      { path: 'D:/gone', missing: true },
    ],
    samples: [
      { id: 'c4-architecture', name: 'Internet banking', packages: ['c4'] },
      { id: 'clinic-claim', name: 'Clinic', packages: ['healthcare'] },
    ],
    token: 'handed-over',
    ...extra,
  });

const opened = () =>
  encodeServerMessage({
    type: 'project/opened',
    protocolVersion: PROTOCOL_VERSION,
    project: loadSample(),
    history: {},
  });

beforeEach(() => {
  FakeWebSocket.created = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  resetPreferencesForTests();
  sessionStorage.clear();
  resetLanguageForTests();
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
});

function socket(): FakeWebSocket {
  return FakeWebSocket.created[0] as FakeWebSocket;
}

function atHome(extra: object = {}) {
  render(<App token={{ launch: 'code' }} />);
  act(() => {
    socket().accept();
    socket().receive(offer(extra));
  });
}

describe('the Projects screen', () => {
  it('welcomes with the product and what it does', () => {
    atHome();
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByText('Make any concept or system visual, and explore it.')).toBeVisible();
  });

  it('lists the projects as cards, by name, world and how long ago they changed, and the recent ones, a missing one flagged', () => {
    atHome();
    const yours = screen.getByRole('region', { name: 'Your projects' });
    const audit = within(yours).getByRole('listitem');
    expect(within(audit).getByText('Audit')).toBeVisible();
    expect(within(audit).getByText('Healthcare')).toBeVisible();
    expect(within(audit).getByText('Changed 2 days ago')).toBeVisible();
    const recent = screen.getByRole('region', { name: 'Recent projects' });
    expect(within(recent).getByRole('button', { name: 'Open “Shop”' })).toBeEnabled();
    expect(within(recent).getByText('D:/work/shop')).toBeVisible();
    expect(within(recent).getByText(/^Missing/)).toBeVisible();
  });

  it('shows the projects folder once, and copies its path', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    atHome();
    expect(screen.getAllByText(FOLDER)).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy the projects folder’s path' }));
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(FOLDER);
    expect(screen.getByText('Copied')).toBeInTheDocument();
  });

  it('says what to do next while the projects folder holds none', () => {
    atHome({ projects: [] });
    const yours = screen.getByRole('region', { name: 'Your projects' });
    expect(within(yours).getByText('No projects yet. Start from a sample below.')).toBeVisible();
  });

  it('opens a project, and shows it once the local program does', () => {
    atHome();
    fireEvent.click(screen.getByRole('button', { name: 'Open “Audit”' }));
    expect(socket().lastSent()).toMatchObject({ type: 'home/open', path: `${FOLDER}/Audit` });
    act(() => socket().receive(opened()));
    expect(screen.queryByRole('heading', { name: 'Projects' })).not.toBeInTheDocument();
  });

  it('removes a missing project from the recent list', () => {
    atHome();
    fireEvent.click(screen.getByRole('button', { name: 'Remove “D:/gone” from the recent list' }));
    const { requestId } = socket().lastSent();
    expect(socket().lastSent()).toMatchObject({ type: 'home/forget', path: 'D:/gone' });
    act(() => socket().receive(offer({ recent: [], requestId, token: undefined })));
    expect(screen.queryByRole('region', { name: 'Recent projects' })).not.toBeInTheDocument();
  });

  it('offers the samples as cards labelled by world, and the empty project among them', () => {
    atHome();
    const fresh = screen.getByRole('region', { name: 'Start something new' });
    const cards = within(fresh).getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    const [banking, clinic, empty] = cards as [HTMLElement, HTMLElement, HTMLElement];
    expect(within(banking).getByText('C4 architecture')).toBeVisible();
    expect(within(banking).getByRole('heading', { name: 'Internet banking' })).toBeVisible();
    expect(within(clinic).getByText('Healthcare')).toBeVisible();
    expect(within(clinic).getByRole('heading', { name: 'A clinic’s claim' })).toBeVisible();
    expect(within(empty).getByRole('heading', { name: 'An empty project' })).toBeVisible();
  });

  it('starts from a sample at once, named after it unless a name was given', () => {
    atHome();
    const fresh = screen.getByRole('region', { name: 'Start something new' });
    const clinic = within(fresh).getByRole('button', {
      name: 'Start from the sample “Healthcare: a clinic’s claim”',
    });
    expect(clinic).toBeEnabled();
    fireEvent.click(clinic);
    expect(socket().lastSent()).toMatchObject({
      type: 'home/create',
      name: 'Healthcare: a clinic’s claim',
      sample: 'clinic-claim',
    });
  });

  it('starts a project with the name given, empty or from a sample', () => {
    atHome();
    const fresh = screen.getByRole('region', { name: 'Start something new' });
    fireEvent.change(within(fresh).getByLabelText('Name of the new project'), {
      target: { value: ' Mi auditoría ' },
    });
    fireEvent.click(
      within(fresh).getByRole('button', {
        name: 'Start from the sample “Healthcare: a clinic’s claim”',
      }),
    );
    expect(socket().lastSent()).toMatchObject({
      type: 'home/create',
      name: 'Mi auditoría',
      sample: 'clinic-claim',
    });
  });

  it('names an empty project “My project” when no name was given', () => {
    atHome();
    fireEvent.click(screen.getByRole('button', { name: 'Start an empty project' }));
    expect(socket().lastSent()).toMatchObject({
      type: 'home/create',
      name: 'My project',
      view: 'Overview',
    });
  });

  it('opens a typed folder, behind “Open a folder…”, and says why the program refused it', async () => {
    atHome();
    const folder = screen.getByRole('group', { name: 'Open a folder…' });
    expect(folder).not.toHaveAttribute('open');
    fireEvent.click(within(folder).getByText('Open a folder…'));
    expect(folder).toHaveAttribute('open');
    fireEvent.change(within(folder).getByLabelText(/whole path/), {
      target: { value: 'D:/notes' },
    });
    fireEvent.click(within(folder).getByRole('button', { name: 'Open this folder' }));
    const { requestId } = socket().lastSent();
    expect(socket().lastSent()).toMatchObject({ type: 'home/open', path: 'D:/notes' });
    await act(async () => {
      socket().receive(
        encodeServerMessage({
          type: 'command/rejected',
          requestId,
          problems: [{ code: 'invalid-command', message: 'There is no folder D:/notes.' }],
        }),
      );
      await Promise.resolve();
    });
    expect(screen.getByRole('alert')).toHaveTextContent('There is no folder D:/notes.');
  });

  it('reads in Spanish', () => {
    atHome();
    act(() =>
      socket().receive(
        encodeServerMessage({
          type: 'preferences/changed',
          preferences: { ...DEFAULT_PREFERENCES, language: 'es' },
        }),
      ),
    );
    expect(screen.getByRole('heading', { name: 'Proyectos' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Proyectos recientes' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Empezar algo nuevo' })).toBeVisible();
    expect(screen.getAllByText('Modificado anteayer')).toHaveLength(2);
  });
});

describe('“Projects…” in the header’s menu', () => {
  it('goes back home from a project, and every tab shows the Projects screen', () => {
    render(<App token={{ launch: 'code' }} />);
    act(() => {
      socket().accept();
      socket().receive(opened());
    });
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Projects…' }));
    const { requestId } = socket().lastSent();
    expect(socket().lastSent()).toMatchObject({ type: 'home/close' });
    act(() => socket().receive(offer({ requestId })));
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeInTheDocument();
  });

  it('is not offered at home', () => {
    atHome();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.queryByRole('button', { name: 'Projects…' })).not.toBeInTheDocument();
  });
});
