import {
  PROTOCOL_VERSION,
  encodeServerMessage,
  type HistorySummary,
  type Operation,
  type Problem,
  type ProjectChangedMessage,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Element, ViewFile } from '@visual-anything/schema';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { CANVAS_COMMAND } from './test/canvasCommand';
import { FakeWebSocket } from './test/FakeWebSocket';
import { loadSample } from './test/sample';

vi.mock('./canvas/CanvasArea', () => import('./test/FakeCanvasArea'));

const sample = loadSample();

function openedWith(project: ProjectSnapshot, history: HistorySummary = {}): string {
  return encodeServerMessage({
    type: 'project/opened',
    protocolVersion: PROTOCOL_VERSION,
    project,
    history,
  });
}

const opened = openedWith(sample);

beforeEach(() => {
  FakeWebSocket.created = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

function onlySocket(): FakeWebSocket {
  expect(FakeWebSocket.created).toHaveLength(1);
  return FakeWebSocket.created[0] as FakeWebSocket;
}

const TERMINAL_ADDRESS = /open the address Visual Anything printed in the terminal/i;

describe('App', () => {
  it('without a session token, says how to get one and does not connect', () => {
    render(<App token={null} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Visual Anything' })).toBeInTheDocument();
    const problem = screen.getByRole('alert');
    expect(problem).toHaveTextContent(/no session token/i);
    expect(problem).toHaveTextContent(TERMINAL_ADDRESS);
    expect(problem).toHaveTextContent(/carries this session’s token/);
    expect(FakeWebSocket.created).toHaveLength(0);
  });

  it('opens the live connection with the token and says it is connecting', () => {
    render(<App token="s3cr3t" />);
    expect(onlySocket().url).toBe('ws://localhost:3000/live?token=s3cr3t');
    expect(screen.getByRole('status')).toHaveTextContent(/connecting/i);
  });

  it('shows the project once the local program sends it', () => {
    render(<App token="s3cr3t" />);
    const socket = onlySocket();
    act(() => {
      socket.accept();
      socket.receive(opened);
    });
    const header = screen.getByRole('banner');
    expect(within(header).getByText('My systems')).toBeInTheDocument();
    expect(within(header).getByText('System overview')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Outline and model' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /System overview/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says the connection was refused, and how to connect again', () => {
    render(<App token="stale" />);
    act(() => onlySocket().drop());
    const problem = screen.getByRole('alert');
    expect(problem).toHaveTextContent(/refused the connection/i);
    expect(problem).toHaveTextContent(TERMINAL_ADDRESS);
    expect(problem).toHaveTextContent(/carries this session’s token/);
    expect(FakeWebSocket.created).toHaveLength(1);
  });

  it('says so when the local program sends something the app cannot read, and disconnects', () => {
    render(<App token="s3cr3t" />);
    const socket = onlySocket();
    act(() => socket.receive(JSON.stringify({ type: 'model/exploded' })));
    expect(screen.getByRole('alert')).toHaveTextContent('Unknown message type: "model/exploded".');
    expect(socket.closedByApp).toBe(true);
  });

  it('keeps the project on screen after the connection closes, and says that it closed', () => {
    render(<App token="s3cr3t" />);
    const socket = onlySocket();
    act(() => socket.receive(opened));
    const canvas = screen.getByRole('img');
    act(() => socket.drop());
    expect(screen.getByRole('alert')).toHaveTextContent(/connection to Visual Anything closed/i);
    expect(within(screen.getByRole('banner')).getByText('My systems')).toBeInTheDocument();
    expect(screen.getByRole('img')).toBe(canvas);
    expect(FakeWebSocket.created).toHaveLength(1);
  });

  it('under StrictMode, keeps only the second connection and ignores the first one closing', () => {
    render(
      <StrictMode>
        <App token="s3cr3t" />
      </StrictMode>,
    );
    expect(FakeWebSocket.created).toHaveLength(2);
    const [first, second] = FakeWebSocket.created as [FakeWebSocket, FakeWebSocket];
    expect(first.closedByApp).toBe(true);
    expect(second.closedByApp).toBe(false);

    act(() => first.drop());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    act(() => second.receive(opened));
    expect(within(screen.getByRole('banner')).getByText('My systems')).toBeInTheDocument();
  });

  it('closes the live connection when it goes away', () => {
    const { unmount } = render(<App token="s3cr3t" />);
    unmount();
    expect(onlySocket().closedByApp).toBe(true);
  });

  it('says what went wrong when a project cannot be shown, instead of leaving the tab empty', () => {
    // React reports the error it caught on the console; that report is expected here.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = JSON.stringify({
      type: 'project/opened',
      protocolVersion: PROTOCOL_VERSION,
      project: { ...loadSample(), model: {} },
    });
    render(<App token="s3cr3t" />);
    act(() => onlySocket().receive(broken));
    expect(screen.getByRole('alert')).toHaveTextContent(/could not show this project/i);
    expect(screen.getByRole('heading', { level: 1, name: 'Visual Anything' })).toBeInTheDocument();
  });
});

/** A change the local program sends; it answers none of this tab's requests unless it says so. */
function changed(change: Partial<Omit<ProjectChangedMessage, 'type'>> = {}): string {
  return encodeServerMessage({
    type: 'project/changed',
    operations: [],
    kind: 'do',
    label: 'Edit "Patient"',
    author: 'user',
    history: {},
    warnings: [],
    created: [],
    ...change,
  });
}

function sampleElement(id: string): Element {
  const found = sample.model.elements.find((each) => each.id === id);
  if (!found) throw new Error(`The sample has no element "${id}".`);
  return found;
}

function rename(id: string, name: string): Operation {
  return { op: 'replace', collection: { name: 'elements' }, item: { ...sampleElement(id), name } };
}

function renameView(name: string): Operation {
  const view: ViewFile | undefined = sample.views[0];
  if (!view) throw new Error('The sample has no view.');
  return { op: 'replace', collection: { name: 'views' }, item: { ...view, name } };
}

/** The sample with one element renamed, as a fresh opening or a reload would carry it. */
function renamedSample(id: string, name: string): ProjectSnapshot {
  return {
    ...sample,
    model: {
      ...sample.model,
      elements: sample.model.elements.map((each) => (each.id === id ? { ...each, name } : each)),
    },
  };
}

/** An operation that cannot apply to the sample: the copy it is applied to has drifted. */
const drifting: Operation = {
  op: 'remove',
  collection: { name: 'elements' },
  key: 'no-such-element',
};

const RENAME_API = 'Rename "Appointments API" to "Appointments gateway"';
const UNDO_RENAME = { label: RENAME_API, author: 'user' as const };
const REDO_DELETE = { label: 'Delete "Patient"', author: 'user' as const };

const limitWarning: Problem = {
  code: 'limit-broken',
  message: '"writes to" expects its to end to be Database, but "Patient" is not.',
  subjects: ['patient'],
};

/** Opens the app on the sample, with this history, and returns its live connection. */
function openApp(history: HistorySummary = {}): FakeWebSocket {
  render(<App token="s3cr3t" />);
  const socket = onlySocket();
  act(() => {
    socket.accept();
    socket.receive(openedWith(sample, history));
  });
  return socket;
}

/** The panel left of the canvas, whose outline shows the open view's elements by name. */
function modelPanel(): HTMLElement {
  return screen.getByRole('complementary', { name: 'Outline and model' });
}

function historyButton(name: string | RegExp): HTMLElement {
  return within(screen.getByRole('group', { name: 'Undo history' })).getByRole('button', { name });
}

/** The local program answers the app's last request with a change, and the app takes it in. */
async function answer(
  socket: FakeWebSocket,
  change: Partial<Omit<ProjectChangedMessage, 'type'>> = {},
): Promise<void> {
  await act(async () => {
    socket.receive(changed({ requestId: socket.lastSent().requestId, ...change }));
    await Promise.resolve();
  });
}

describe('App, editing live', () => {
  it('applies each change the local program sends, so the shell shows the new names and history', () => {
    const socket = openApp();
    act(() =>
      socket.receive(
        changed({
          operations: [rename('appointments-api', 'Appointments gateway')],
          label: RENAME_API,
          history: { undo: UNDO_RENAME },
        }),
      ),
    );
    expect(within(modelPanel()).getByText('Appointments gateway')).toBeInTheDocument();
    expect(within(modelPanel()).queryByText('Appointments API')).not.toBeInTheDocument();
    expect(historyButton(`Undo: ${RENAME_API}`)).not.toHaveAttribute('aria-disabled');

    act(() => socket.receive(changed({ operations: [renameView('Booking overview')] })));
    expect(within(screen.getByRole('banner')).getByText('Booking overview')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAccessibleName(
      /^Booking overview, from the Data flow perspective/,
    );
    expect(historyButton('Undo')).toHaveAttribute('aria-disabled', 'true');
  });

  it('applies changes that answer other tabs or Claude, and labels Claude’s actions as such', () => {
    const socket = openApp();
    act(() =>
      socket.receive(
        changed({
          operations: [rename('patient', 'Client')],
          label: 'Rename "Patient" to "Client"',
          author: 'claude',
          history: { undo: { label: 'Rename "Patient" to "Client"', author: 'claude' } },
        }),
      ),
    );
    expect(within(modelPanel()).getByText('Client')).toBeInTheDocument();
    expect(historyButton('Undo Claude’s action: Rename "Patient" to "Client"')).toBeInTheDocument();
    expect(socket.sent).toEqual([]);
  });

  it('undoes and redoes with the header’s buttons', async () => {
    const socket = openApp({ undo: UNDO_RENAME, redo: REDO_DELETE });
    fireEvent.click(historyButton(/^Undo/));
    expect(socket.lastSent()).toEqual({ type: 'undo', requestId: expect.any(String) as string });
    await answer(socket, { kind: 'undo', history: { undo: UNDO_RENAME, redo: REDO_DELETE } });

    fireEvent.click(historyButton(/^Redo/));
    expect(socket.lastSent()).toEqual({ type: 'redo', requestId: expect.any(String) as string });
    expect(socket.sent).toHaveLength(2);
  });

  it('undoes and redoes from the keyboard, but leaves the shortcuts to text inputs', async () => {
    const socket = openApp({ undo: UNDO_RENAME, redo: REDO_DELETE });
    const history = { undo: UNDO_RENAME, redo: REDO_DELETE };
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(socket.lastSent().type).toBe('undo');
    await answer(socket, { kind: 'undo', history });
    fireEvent.keyDown(document.body, { key: 'y', ctrlKey: true });
    expect(socket.lastSent().type).toBe('redo');
    await answer(socket, { kind: 'redo', history });

    const input = document.createElement('input');
    document.body.append(input);
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(input, { key: 'Z', ctrlKey: true, shiftKey: true });
    input.remove();
    expect(socket.sent).toHaveLength(2);
  });

  it('shows the warnings of the changes this tab asked for', async () => {
    const socket = openApp({ undo: UNDO_RENAME });
    fireEvent.click(historyButton(/^Undo/));
    await answer(socket, { kind: 'undo', warnings: [limitWarning] });
    expect(screen.getByRole('status')).toHaveTextContent(`Warning: ${limitWarning.message}`);
  });

  it('shows why an undo was refused', async () => {
    const socket = openApp({ undo: UNDO_RENAME });
    fireEvent.click(historyButton(/^Undo/));
    await act(async () => {
      socket.receive(
        encodeServerMessage({
          type: 'command/rejected',
          requestId: socket.lastSent().requestId,
          problems: [{ code: 'invalid-command', message: 'There is nothing to undo.' }],
        }),
      );
      await Promise.resolve();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Error: Could not undo: There is nothing to undo.',
    );
  });

  it('says when the project was reloaded because its files changed outside the app', () => {
    const socket = openApp({ undo: UNDO_RENAME });
    act(() =>
      socket.receive(
        encodeServerMessage({
          type: 'project/reloaded',
          project: renamedSample('patient', 'Client'),
          history: {},
          reason: 'model.vamodel changed on disk.',
        }),
      ),
    );
    expect(within(modelPanel()).getByText('Client')).toBeInTheDocument();
    expect(historyButton('Undo')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Reloaded the project: model.vamodel changed on disk.',
    );
  });

  it('shows the notices the local program sends, until they are dismissed', () => {
    const socket = openApp();
    act(() =>
      socket.receive(
        encodeServerMessage({
          type: 'notice',
          level: 'error',
          message: 'model.vamodel is not valid.',
        }),
      ),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Error: model.vamodel is not valid.');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('gets the project again when this tab’s copy falls out of step, reconnecting only once', () => {
    const socket = openApp();
    act(() => socket.receive(changed({ operations: [drifting] })));
    expect(socket.closedByApp).toBe(true);
    expect(FakeWebSocket.created).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent(/fell out of step/);
    // The shell stays on screen while the fresh copy arrives.
    expect(within(modelPanel()).getByText('Patient')).toBeInTheDocument();

    const second = FakeWebSocket.created[1] as FakeWebSocket;
    act(() => second.receive(openedWith(renamedSample('patient', 'Client'))));
    expect(within(modelPanel()).getByText('Client')).toBeInTheDocument();

    act(() => second.receive(changed({ operations: [drifting] })));
    expect(FakeWebSocket.created).toHaveLength(2);
    expect(screen.getByRole('alert')).toHaveTextContent(/cannot read/i);
  });

  it('sends the canvas’s commands to the local program, and says why one was refused', async () => {
    const socket = openApp();
    fireEvent.click(screen.getByRole('button', { name: 'Edit on the canvas' }));
    expect(socket.lastSent()).toEqual({
      type: 'command',
      command: CANVAS_COMMAND,
      requestId: expect.any(String) as string,
    });
    act(() =>
      socket.receive(
        encodeServerMessage({
          type: 'command/rejected',
          requestId: socket.lastSent().requestId,
          problems: [{ code: 'empty-name', message: 'An element needs a name.' }],
        }),
      ),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Error: An element needs a name.');
  });

  it('lets the canvas change nothing once the connection closes', () => {
    const socket = openApp();
    expect(screen.getByRole('button', { name: 'Edit on the canvas' })).toBeInTheDocument();
    act(() => socket.drop());
    expect(screen.queryByRole('button', { name: 'Edit on the canvas' })).not.toBeInTheDocument();
  });

  it('disables undo and redo once the connection closes', () => {
    const socket = openApp({ undo: UNDO_RENAME, redo: REDO_DELETE });
    act(() => socket.drop());
    expect(historyButton(/^Undo/)).toHaveAttribute('aria-disabled', 'true');
    expect(historyButton(/^Redo/)).toHaveAttribute('aria-disabled', 'true');
  });

  it('under StrictMode, sends on the one live connection it keeps', () => {
    render(
      <StrictMode>
        <App token="s3cr3t" />
      </StrictMode>,
    );
    const [first, second] = FakeWebSocket.created as [FakeWebSocket, FakeWebSocket];
    act(() => second.receive(openedWith(sample, { undo: UNDO_RENAME })));
    fireEvent.click(historyButton(/^Undo/));
    expect(second.sent).toEqual([{ type: 'undo', requestId: expect.any(String) as string }]);
    expect(first.sent).toEqual([]);
  });
});
