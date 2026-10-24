import { PROTOCOL_VERSION, encodeServerMessage } from '@visual-anything/core';
import { act, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { FakeWebSocket } from './test/FakeWebSocket';
import { loadSample } from './test/sample';

vi.mock('./canvas/CanvasArea', () => import('./test/FakeCanvasArea'));

const opened = encodeServerMessage({
  type: 'project/opened',
  protocolVersion: PROTOCOL_VERSION,
  project: loadSample(),
});

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
    expect(screen.getByRole('complementary', { name: 'Model' })).toBeInTheDocument();
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
