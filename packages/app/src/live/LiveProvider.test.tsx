import { PROTOCOL_VERSION, encodeServerMessage } from '@visual-anything/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeChannels } from '../test/FakeChannels';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { loadSample } from '../test/sample';
import type { CommandResult } from './connection';
import { useLive } from './context';
import { LiveProvider } from './LiveProvider';

const opened = encodeServerMessage({
  type: 'project/opened',
  protocolVersion: PROTOCOL_VERSION,
  project: loadSample(),
  history: {},
});

beforeEach(() => {
  FakeWebSocket.created = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

/** Shows what a component sees of the live session, and sends a command when asked. */
function Probe() {
  const live = useLive();
  const [result, setResult] = useState<CommandResult>();
  return (
    <div>
      <p>Status: {live.status}</p>
      <p>Project: {live.project?.project.name ?? 'none'}</p>
      <button
        type="button"
        onClick={() => {
          void live.send({ type: 'delete', elements: ['patient'] }).then(setResult);
        }}
      >
        Delete the patient
      </button>
      {result !== undefined && <output>{JSON.stringify(result)}</output>}
    </div>
  );
}

function onlySocket(): FakeWebSocket {
  expect(FakeWebSocket.created).toHaveLength(1);
  return FakeWebSocket.created[0] as FakeWebSocket;
}

describe('LiveProvider', () => {
  it('opens the live session with the token for the components inside it', () => {
    render(
      <LiveProvider token="s3cr3t">
        <Probe />
      </LiveProvider>,
    );
    const socket = onlySocket();
    expect(socket.url).toBe('ws://localhost:3000/live?token=s3cr3t');
    expect(screen.getByText('Status: connecting')).toBeInTheDocument();

    act(() => socket.receive(opened));
    expect(screen.getByText('Status: open')).toBeInTheDocument();
    expect(screen.getByText('Project: My systems')).toBeInTheDocument();
  });

  it('sends their commands and gives them the answer', async () => {
    render(
      <LiveProvider token="s3cr3t">
        <Probe />
      </LiveProvider>,
    );
    const socket = onlySocket();
    act(() => socket.receive(opened));
    fireEvent.click(screen.getByRole('button', { name: 'Delete the patient' }));
    const sent = socket.lastSent();
    expect(sent).toMatchObject({ type: 'command', command: { type: 'delete' } });

    await act(async () => {
      socket.receive(
        encodeServerMessage({
          type: 'project/changed',
          operations: [],
          kind: 'do',
          label: 'Delete "Patient"',
          author: 'user',
          history: { undo: { label: 'Delete "Patient"', author: 'user' } },
          requestId: sent.requestId,
          warnings: [],
          created: [],
        }),
      );
      await Promise.resolve();
    });
    expect(screen.getByRole('status')).toHaveTextContent('{"ok":true,"created":[],"warnings":[]}');
  });

  it('without a token, and with no other tab to ask, fails without connecting', async () => {
    render(
      <LiveProvider token={null} openChannel={() => undefined}>
        <Probe />
      </LiveProvider>,
    );
    expect(await screen.findByText('Status: failed')).toBeInTheDocument();
    expect(FakeWebSocket.created).toHaveLength(0);
  });

  it('keeps one live connection under StrictMode, and closes it when it goes away', () => {
    const { unmount } = render(
      <StrictMode>
        <LiveProvider token="s3cr3t">
          <Probe />
        </LiveProvider>
      </StrictMode>,
    );
    const [first, second] = FakeWebSocket.created as [FakeWebSocket, FakeWebSocket];
    expect(FakeWebSocket.created).toHaveLength(2);
    expect(first.closedByApp).toBe(true);
    expect(second.closedByApp).toBe(false);

    act(() => second.receive(opened));
    expect(screen.getByText('Status: open')).toBeInTheDocument();
    unmount();
    expect(second.closedByApp).toBe(true);
  });

  it('without a token, joins the session of another tab of this browser that has it open', async () => {
    const channels = new FakeChannels();
    const openChannel = () => channels.open();
    const token = 'u2Fs7bGqL0bW1n8kX9vC3pYd5eRt6yHj4kMn2oPq1rS';
    render(
      <LiveProvider token={token} openChannel={openChannel}>
        <Probe />
      </LiveProvider>,
    );
    act(() => onlySocket().receive(opened));
    const joined = render(
      <LiveProvider token={null} openChannel={openChannel}>
        <Probe />
      </LiveProvider>,
    );
    await vi.waitFor(() => expect(FakeWebSocket.created).toHaveLength(2));
    const second = FakeWebSocket.created[1] as FakeWebSocket;
    expect(second.url).toBe(`ws://localhost:3000/live?token=${token}`);
    expect(window.sessionStorage.getItem('visual-anything.session-token')).toBe(token);
    act(() => second.receive(opened));
    expect(within(joined.container).getByText('Status: open')).toBeInTheDocument();
  });

  it('gives no token while its own connection is not open', async () => {
    vi.useFakeTimers();
    try {
      const channels = new FakeChannels();
      const openChannel = () => channels.open();
      render(
        <LiveProvider token="u2Fs7bGqL0bW1n8kX9vC3pYd5eRt6yHj4kMn2oPq1rS" openChannel={openChannel}>
          <Probe />
        </LiveProvider>,
      );
      const joined = render(
        <LiveProvider token={null} openChannel={openChannel}>
          <Probe />
        </LiveProvider>,
      );
      await act(() => vi.advanceTimersByTimeAsync(2000));
      expect(within(joined.container).getByText('Status: failed')).toBeInTheDocument();
      expect(FakeWebSocket.created).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets go of the channel when it goes away', () => {
    const channels = new FakeChannels();
    const { unmount } = render(
      <LiveProvider token="s3cr3t" openChannel={() => channels.open()}>
        <Probe />
      </LiveProvider>,
    );
    expect(channels.count).toBe(1);
    unmount();
    expect(channels.count).toBe(0);
  });

  it('says what is missing when a component asks for the live session outside it', () => {
    // React reports the error it rethrows on the console; that report is expected here.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow('useLive() is only available inside a LiveProvider.');
  });
});
