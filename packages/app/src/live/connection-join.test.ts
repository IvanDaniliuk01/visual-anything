/**
 * A live connection that starts with no credential and joins the session of another tab (ADR-0043):
 * it asks once, connects with the token it is given, and fails as before when none comes.
 */
import { PROTOCOL_VERSION, encodeServerMessage } from '@visual-anything/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { loadSample } from '../test/sample';
import { LiveConnection } from './connection';

const JOINED_URL = 'ws://localhost:3000/live?token=s3cr3t';

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

/** A join the test ends: with the URL to connect at, or with null for no token. */
function pendingJoin() {
  let answer: (url: string | null) => void = () => {};
  const join = vi.fn(
    () =>
      new Promise<string | null>((resolve) => {
        answer = resolve;
      }),
  );
  return { join, answer: (url: string | null) => answer(url) };
}

describe('a live connection that joins another tab’s session', () => {
  it('says it is joining, then connects with the token given', async () => {
    const { join, answer } = pendingJoin();
    const connection = new LiveConnection(null, { join });
    expect(connection.getState()).toMatchObject({ status: 'connecting', joining: true });
    expect(connection.getState().failure).toBeUndefined();
    connection.connect();
    expect(join).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.created).toHaveLength(0);

    answer(JOINED_URL);
    await vi.waitFor(() => expect(FakeWebSocket.created).toHaveLength(1));
    expect(FakeWebSocket.created[0]?.url).toBe(JOINED_URL);
    expect(connection.getState().joining).toBeFalsy();

    FakeWebSocket.created[0]?.receive(opened);
    expect(connection.getState().status).toBe('open');
  });

  it('fails as a tab with no token does when no tab gives one', async () => {
    const { join, answer } = pendingJoin();
    const connection = new LiveConnection(null, { join });
    connection.connect();
    answer(null);
    await vi.waitFor(() =>
      expect(connection.getState()).toMatchObject({
        status: 'failed',
        failure: { reason: 'no-token' },
      }),
    );
    expect(connection.getState().joining).toBeFalsy();
    expect(FakeWebSocket.created).toHaveLength(0);
  });

  it('asks once through a mount undone and done again, as StrictMode does', async () => {
    const { join, answer } = pendingJoin();
    const connection = new LiveConnection(null, { join });
    connection.connect();
    connection.disconnect();
    connection.connect();
    expect(join).toHaveBeenCalledTimes(1);
    answer(JOINED_URL);
    await vi.waitFor(() => expect(FakeWebSocket.created).toHaveLength(1));
  });

  it('opens nothing once it went away before the token came', async () => {
    const { join, answer } = pendingJoin();
    const connection = new LiveConnection(null, { join });
    connection.connect();
    connection.disconnect();
    answer(JOINED_URL);
    await Promise.resolve();
    await Promise.resolve();
    expect(FakeWebSocket.created).toHaveLength(0);
  });

  it('treats a join that fails as no token', async () => {
    const connection = new LiveConnection(null, {
      join: () => Promise.reject(new Error('The channel closed.')),
    });
    connection.connect();
    await vi.waitFor(() => expect(connection.getState().failure).toEqual({ reason: 'no-token' }));
  });
});

describe('the token a connection shares with other tabs', () => {
  it('is the one it connects with, and only while the connection is open', () => {
    const connection = new LiveConnection(JOINED_URL);
    expect(connection.sessionToken()).toBeUndefined();
    connection.connect();
    expect(connection.sessionToken()).toBeUndefined();
    const [socket] = FakeWebSocket.created as [FakeWebSocket];
    socket.receive(opened);
    expect(connection.sessionToken()).toBe('s3cr3t');
    socket.drop();
    expect(connection.getState().status).toBe('closed');
    expect(connection.sessionToken()).toBeUndefined();
  });

  it('is the token handed over for a launch code, never the code', () => {
    const connection = new LiveConnection('ws://localhost:3000/live?launch=c0de', {
      onToken: (token) => `ws://localhost:3000/live?token=${token}`,
    });
    connection.connect();
    const [socket] = FakeWebSocket.created as [FakeWebSocket];
    expect(connection.sessionToken()).toBeUndefined();
    socket.receive(
      encodeServerMessage({
        type: 'project/opened',
        protocolVersion: PROTOCOL_VERSION,
        project: loadSample(),
        history: {},
        token: 'handed-over',
      }),
    );
    expect(connection.sessionToken()).toBe('handed-over');
  });

  it('is nothing for a connection still on its launch code', () => {
    const connection = new LiveConnection('ws://localhost:3000/live?launch=c0de');
    connection.connect();
    const [socket] = FakeWebSocket.created as [FakeWebSocket];
    socket.receive(opened);
    expect(connection.getState().status).toBe('open');
    expect(connection.sessionToken()).toBeUndefined();
  });
});
