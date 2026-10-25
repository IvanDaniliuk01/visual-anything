/**
 * A view address opened in a new tab of the same browser (ADR-0043): the tab has no session of its
 * own, joins the session of a tab that has the project open, over this origin's channel, and then
 * opens the project at the address's view state. The token goes into no address.
 */
import { PROTOCOL_VERSION, encodeServerMessage } from '@visual-anything/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { takeSessionToken } from '../live/session';
import { SESSION_CHANNEL } from '../live/share';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { loadSample } from '../test/sample';

vi.mock('../canvas/CanvasArea', () => import('../test/FakeCanvasArea'));

const sample = loadSample();
const TOKEN = 'u2Fs7bGqL0bW1n8kX9vC3pYd5eRt6yHj4kMn2oPq1rS';

beforeEach(() => {
  FakeWebSocket.created = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

/** Another tab of this browser whose connection is open: it answers every ask with the token. */
function openTab(): BroadcastChannel {
  const channel = new BroadcastChannel(SESSION_CHANNEL);
  channel.onmessage = (event: MessageEvent) => {
    const { type, ask } = event.data as { type?: unknown; ask?: unknown };
    if (type === 'session/ask') channel.postMessage({ type: 'session/token', ask, token: TOKEN });
  };
  return channel;
}

describe('a view address opened in a new tab', () => {
  it('joins the session of a tab that has the project open, and opens the view state', async () => {
    window.history.replaceState(null, '', '/#view=system-overview&select=appointments-api');
    const other = openTab();
    try {
      const credential = takeSessionToken(window);
      expect(credential).toBeNull();
      render(<App token={credential} />);
      expect(screen.getByRole('status')).toHaveTextContent(/asking the other tabs/i);

      await waitFor(() => expect(FakeWebSocket.created).toHaveLength(1));
      const [socket] = FakeWebSocket.created as [FakeWebSocket];
      expect(socket.url).toBe(`ws://localhost:3000/live?token=${TOKEN}`);
      act(() => {
        socket.accept();
        socket.receive(
          encodeServerMessage({
            type: 'project/opened',
            protocolVersion: PROTOCOL_VERSION,
            project: sample,
            history: {},
          }),
        );
      });
      const inspector = screen.getByRole('complementary', { name: 'Inspector' });
      expect(within(inspector).getAllByText('Appointments API').length).toBeGreaterThan(0);
      await waitFor(() =>
        expect(window.location.hash).toBe('#view=system-overview&select=appointments-api'),
      );
      expect(window.location.href).not.toContain(TOKEN);
      // A reload of this tab keeps its session, as a tab opened through a launch address does.
      expect(takeSessionToken(window)).toEqual({ token: TOKEN });
    } finally {
      other.close();
    }
  });
});
