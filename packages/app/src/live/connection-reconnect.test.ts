/**
 * A tab that reconnects by itself once the local program runs again with its session (ADR 0099),
 * after the program proved it holds the token, and the tab that comes forward when asked.
 */
import { PROTOCOL_VERSION, encodeServerMessage } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { loadSample } from '../test/sample';
import {
  LiveConnection,
  OTHER_SESSION,
  RECONNECT_FIRST,
  RESTARTED,
  SHOWN,
  type LiveConnectionOptions,
} from './connection';
import type { SessionProof } from './session';

const LIVE_URL = 'ws://localhost:3000/live?token=s3cr3t';

const opened = encodeServerMessage({
  type: 'project/opened',
  protocolVersion: PROTOCOL_VERSION,
  project: loadSample(),
  history: {},
});

beforeEach(() => {
  FakeWebSocket.created = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function connected(options: LiveConnectionOptions = {}) {
  const connection = new LiveConnection(LIVE_URL, options);
  connection.connect();
  FakeWebSocket.created[0]?.receive(opened);
  return connection;
}

const messagesOf = (connection: LiveConnection) =>
  connection.getState().notices.map((each) => each.message);

describe('reconnecting by itself (ADR 0099)', () => {
  it('waits, has the program prove the token, then reconnects and says Visual Anything restarted', async () => {
    const proofs: SessionProof[] = ['unreachable', 'ok'];
    const prove = vi.fn((token: string) => {
      expect(token).toBe('s3cr3t');
      return Promise.resolve(proofs.shift() ?? 'ok');
    });
    const connection = connected({ prove });
    FakeWebSocket.created[0]?.drop(1006);
    expect(connection.getState().status).toBe('closed');

    await vi.advanceTimersByTimeAsync(RECONNECT_FIRST);
    expect(prove).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.created).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(RECONNECT_FIRST * 2);
    expect(prove).toHaveBeenCalledTimes(2);
    expect(FakeWebSocket.created).toHaveLength(2);
    expect(FakeWebSocket.created[1]?.url).toBe(LIVE_URL);

    FakeWebSocket.created[1]?.receive(opened);
    expect(connection.getState().status).toBe('open');
    expect(messagesOf(connection)).toContain(RESTARTED);
  });

  it('never sends the token to a program that does not prove it, and says why', async () => {
    const prove = vi.fn(() => Promise.resolve<SessionProof>('other'));
    const connection = connected({ prove });
    FakeWebSocket.created[0]?.drop(1006);
    await vi.advanceTimersByTimeAsync(RECONNECT_FIRST * 20);
    expect(prove).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.created).toHaveLength(1);
    expect(messagesOf(connection)).toContain(OTHER_SESSION);
  });

  it('stops trying once the tab lets go of the connection', async () => {
    const prove = vi.fn(() => Promise.resolve<SessionProof>('unreachable'));
    const connection = connected({ prove });
    FakeWebSocket.created[0]?.drop(1006);
    connection.disconnect();
    await vi.advanceTimersByTimeAsync(RECONNECT_FIRST * 20);
    expect(prove).not.toHaveBeenCalled();
  });

  it('does not reconnect with a launch code, which works once', async () => {
    const prove = vi.fn(() => Promise.resolve<SessionProof>('ok'));
    const connection = new LiveConnection('ws://localhost:3000/live?launch=c0de', { prove });
    connection.connect();
    FakeWebSocket.created[0]?.drop(1006);
    await vi.advanceTimersByTimeAsync(RECONNECT_FIRST * 20);
    expect(prove).not.toHaveBeenCalled();
    expect(connection.getState().failure).toEqual({ reason: 'refused' });
  });
});

describe('app/shown (ADR 0099)', () => {
  it('brings the tab used last forward with the view state, and says so', () => {
    const onShown = vi.fn();
    const connection = connected({ onShown, isLastUsed: () => true });
    FakeWebSocket.created[0]?.receive(
      encodeServerMessage({ type: 'app/shown', state: { view: 'overview' } }),
    );
    expect(onShown).toHaveBeenCalledWith({ view: 'overview' }, true);
    expect(messagesOf(connection)).toContain(SHOWN);
  });

  it('is passed over in the other tabs', () => {
    const onShown = vi.fn();
    const connection = connected({ onShown, isLastUsed: () => false });
    FakeWebSocket.created[0]?.receive(encodeServerMessage({ type: 'app/shown' }));
    expect(onShown).not.toHaveBeenCalled();
    expect(connection.getState().notices).toEqual([]);
  });
});
