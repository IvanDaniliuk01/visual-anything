/**
 * The start screen, while the local program runs on a folder that holds no project yet (ADR 0051):
 * the samples it offers, and the project the person starts, which the tab then shows.
 */
import { DEFAULT_PREFERENCES, PROTOCOL_VERSION, encodeServerMessage } from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { loadSample } from '../test/sample';
import { resetLanguageForTests } from '../i18n/language';
import { resetPreferencesForTests } from '../theme/store';

vi.mock('../canvas/CanvasArea', () => import('../test/FakeCanvasArea'));

const offered = encodeServerMessage({
  type: 'start/offered',
  protocolVersion: PROTOCOL_VERSION,
  folder: 'new-project',
  samples: [
    { id: 'c4-architecture', name: 'Internet banking', packages: ['c4'] },
    { id: 'data-science-pipeline', name: 'Churn prediction', packages: ['data-science'] },
  ],
  token: 'handed-over',
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

function offer() {
  render(<App token={{ launch: 'code' }} />);
  act(() => {
    socket().accept();
    socket().receive(offered);
  });
  return screen.getByRole('list', { name: 'Ways to start' });
}

describe('the start screen', () => {
  it('offers the samples and an empty project, in the folder named', () => {
    const choices = offer();
    expect(screen.getByRole('heading', { name: 'Start a project in “new-project”' })).toBeVisible();
    expect(within(choices).getAllByRole('listitem')).toHaveLength(3);
    expect(within(choices).getByText('C4 architecture: internet banking')).toBeVisible();
    expect(within(choices).getByText('Data science pipeline: churn prediction')).toBeVisible();
    expect(within(choices).getByRole('button', { name: 'Start an empty project' })).toBeEnabled();
  });

  it('starts a sample, and shows the project once the local program opens it', () => {
    const choices = offer();
    fireEvent.click(
      within(choices).getByRole('button', {
        name: 'Start from the sample “C4 architecture: internet banking”',
      }),
    );
    expect(socket().lastSent()).toMatchObject({ type: 'start/create', sample: 'c4-architecture' });
    expect(within(choices).getByRole('button', { name: 'Start an empty project' })).toBeDisabled();
    act(() =>
      socket().receive(
        encodeServerMessage({
          type: 'project/opened',
          protocolVersion: PROTOCOL_VERSION,
          project: loadSample(),
          history: {},
        }),
      ),
    );
    expect(screen.queryByRole('list', { name: 'Ways to start' })).toBeNull();
  });

  it('starts an empty project with its first view named in the language read in', () => {
    offer();
    act(() =>
      socket().receive(
        encodeServerMessage({
          type: 'preferences/changed',
          preferences: { ...DEFAULT_PREFERENCES, language: 'es' },
        }),
      ),
    );
    const choices = screen.getByRole('list', { name: 'Formas de empezar' });
    fireEvent.click(within(choices).getByRole('button', { name: 'Empezar un proyecto vacío' }));
    expect(socket().lastSent()).toMatchObject({
      type: 'start/create',
      names: { view: 'Vista general' },
    });
  });

  it('says why the project could not be started, and lets the person choose again', async () => {
    const choices = offer();
    fireEvent.click(within(choices).getByRole('button', { name: 'Start an empty project' }));
    const { requestId } = socket().lastSent();
    act(() =>
      socket().receive(
        encodeServerMessage({
          type: 'command/rejected',
          requestId,
          problems: [
            {
              code: 'not-saved',
              message:
                'C:/new-project already holds files, or is no folder; a new project starts in an empty folder.',
            },
          ],
        }),
      ),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('already holds files');
    expect(within(choices).getByRole('button', { name: 'Start an empty project' })).toBeEnabled();
  });
});
