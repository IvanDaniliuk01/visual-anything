/**
 * A launch address that carries a view state (ADR-0030's addendum of 2026-10-25): the launch code
 * leaves the address at once, the view state applies only once the code is redeemed and the project
 * has come, and the session token never reaches the address.
 */
import { PROTOCOL_VERSION, encodeServerMessage } from '@visual-anything/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { takeSessionToken } from '../live/session';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { loadSample } from '../test/sample';

vi.mock('../canvas/CanvasArea', () => import('../test/FakeCanvasArea'));

const sample = loadSample();

beforeEach(() => {
  FakeWebSocket.created = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

describe('a launch address with a view state', () => {
  it('applies the state once the launch code is redeemed, and never puts the token in the address', async () => {
    window.history.replaceState(
      null,
      '',
      '/#launch=c0de&theme=dark&view=system-overview&select=appointments-api',
    );
    const credential = takeSessionToken(window);
    expect(credential).toEqual({ launch: 'c0de' });
    expect(window.location.hash).not.toContain('launch');

    render(<App token={credential} />);
    const [socket] = FakeWebSocket.created;
    if (!socket) throw new Error('The app opened no live connection.');
    expect(socket.url).toBe('ws://localhost:3000/live?launch=c0de');
    // Until the program sends the project, nothing applies and the address keeps the state.
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
    expect(window.location.hash).toContain('select=appointments-api');

    act(() => {
      socket.accept();
      socket.receive(
        encodeServerMessage({
          type: 'project/opened',
          protocolVersion: PROTOCOL_VERSION,
          project: sample,
          history: {},
          token: 'the-session-token',
        }),
      );
    });
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(inspector).getAllByText('Appointments API').length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(window.location.hash).toBe('#view=system-overview&select=appointments-api'),
    );
    expect(window.location.href).not.toContain('the-session-token');
  });
});
