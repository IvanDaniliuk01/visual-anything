/**
 * The Projects screen, while the local program is at home (ADR 0093): the projects it offers, the
 * recent ones, a new project, a typed folder, and "Projects…" in the header's menu, which goes back.
 */
import { DEFAULT_PREFERENCES, PROTOCOL_VERSION, encodeServerMessage } from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { resetLanguageForTests } from '../i18n/language';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { loadSample } from '../test/sample';
import { resetPreferencesForTests } from '../theme/store';

vi.mock('../canvas/CanvasArea', () => import('../test/FakeCanvasArea'));

const FOLDER = 'C:/Users/ana/Documents/Visual Anything';

const offer = (extra: object = {}) =>
  encodeServerMessage({
    type: 'home/offered',
    protocolVersion: PROTOCOL_VERSION,
    folder: FOLDER,
    projects: [{ path: `${FOLDER}/Audit`, name: 'Audit', world: 'healthcare', changed: 1e12 }],
    recent: [
      { path: 'D:/work/shop', name: 'Shop', world: 'c4', changed: 1e12, missing: false },
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

function socket(): FakeWebSocket {
  return FakeWebSocket.created[0] as FakeWebSocket;
}

function atHome() {
  render(<App token={{ launch: 'code' }} />);
  act(() => {
    socket().accept();
    socket().receive(offer());
  });
}

describe('the Projects screen', () => {
  it('lists the projects, by name and world, and the recent ones, a missing one flagged', () => {
    atHome();
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeVisible();
    const yours = screen.getByRole('region', { name: 'Your projects' });
    expect(within(yours).getByText('Audit')).toBeVisible();
    expect(within(yours).getByText(/^Healthcare · Changed/)).toBeVisible();
    const recent = screen.getByRole('region', { name: 'Recent projects' });
    expect(within(recent).getByRole('button', { name: 'Open “Shop”' })).toBeEnabled();
    expect(within(recent).getByText(/^Missing/)).toBeVisible();
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

  it('starts a new project once it has a name, empty or from a sample shown by world', () => {
    atHome();
    const newProject = screen.getByRole('region', { name: 'New project' });
    const empty = within(newProject).getByRole('button', { name: 'Start an empty project' });
    expect(empty).toBeDisabled();
    expect(within(newProject).getByRole('region', { name: 'C4 architecture' })).toBeVisible();
    fireEvent.change(within(newProject).getByLabelText('Name'), {
      target: { value: ' Mi auditoría ' },
    });
    fireEvent.click(
      within(newProject).getByRole('button', {
        name: 'Start from the sample “Healthcare: a clinic’s claim”',
      }),
    );
    expect(socket().lastSent()).toMatchObject({
      type: 'home/create',
      name: 'Mi auditoría',
      sample: 'clinic-claim',
    });
  });

  it('opens a typed folder, and says why the program refused it', async () => {
    atHome();
    fireEvent.change(screen.getByLabelText(/whole path/), { target: { value: 'D:/notes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
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
    expect(screen.getByRole('heading', { name: 'Proyectos' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Proyectos recientes' })).toBeVisible();
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
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeVisible();
  });

  it('is not offered at home', () => {
    atHome();
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.queryByRole('button', { name: 'Projects…' })).not.toBeInTheDocument();
  });
});
