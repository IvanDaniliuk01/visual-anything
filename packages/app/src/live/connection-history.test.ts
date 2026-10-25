import {
  PROTOCOL_VERSION,
  encodeServerMessage,
  type ListedAction,
  type Problem,
} from '@visual-anything/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { loadSample } from '../test/sample';
import { LiveConnection } from './connection';

const LIVE_URL = 'ws://localhost:3000/live?token=s3cr3t';
const sample = loadSample();

const RENAME: ListedAction = {
  id: 1,
  label: 'Rename "Patient" to "Client"',
  author: 'user',
  time: Date.UTC(2026, 9, 24, 14, 30),
  undone: false,
};
const CREATE: ListedAction = {
  id: 2,
  label: 'Create "Booking agent"',
  author: 'claude',
  time: Date.UTC(2026, 9, 24, 14, 31),
  undone: false,
};

beforeEach(() => {
  FakeWebSocket.created = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

function openConnection() {
  const connection = new LiveConnection(LIVE_URL);
  connection.connect();
  const socket = FakeWebSocket.created.at(-1) as FakeWebSocket;
  socket.accept();
  socket.receive(
    encodeServerMessage({
      type: 'project/opened',
      protocolVersion: PROTOCOL_VERSION,
      project: sample,
      history: {},
    }),
  );
  return { connection, socket };
}

const listed = (actions: ListedAction[]) =>
  encodeServerMessage({ type: 'history/listed', actions });

describe('the history list', () => {
  it('has none until the local program lists it', () => {
    const { connection } = openConnection();

    expect(connection.getState().actions).toBeUndefined();
  });

  it('keeps the list the local program sends, replacing the one before', () => {
    const { connection, socket } = openConnection();

    socket.receive(listed([RENAME]));
    const first = connection.getState().actions;
    socket.receive(listed([RENAME, CREATE]));

    expect(first).toEqual([RENAME]);
    expect(connection.getState().actions).toEqual([RENAME, CREATE]);
  });

  it('fails on a list it cannot read, as on any message', () => {
    const { connection, socket } = openConnection();

    socket.receive(JSON.stringify({ type: 'history/listed', actions: [{ id: 'one' }] }));

    expect(connection.getState()).toMatchObject({
      status: 'failed',
      failure: { reason: 'unreadable' },
    });
  });
});

describe('undo and redo up to an action', () => {
  it('sends the action to undo up to, and resolves with the change that answers it', async () => {
    const { connection, socket } = openConnection();

    const undone = connection.undoTo(CREATE.id);

    expect(socket.lastSent()).toEqual({
      type: 'undo',
      requestId: expect.any(String) as string,
      to: CREATE.id,
    });
    socket.receive(
      encodeServerMessage({
        type: 'project/changed',
        operations: [],
        kind: 'undo',
        label: CREATE.label,
        author: 'claude',
        history: {},
        warnings: [],
        created: [],
        requestId: socket.lastSent().requestId,
      }),
    );
    await expect(undone).resolves.toEqual({ ok: true, created: [], warnings: [] });
  });

  it('sends the action to redo up to', () => {
    const { connection, socket } = openConnection();

    void connection.redoTo(RENAME.id);

    expect(socket.lastSent()).toEqual({
      type: 'redo',
      requestId: expect.any(String) as string,
      to: RENAME.id,
    });
  });

  it('shows why an undo up to an action was refused, as for any undo', async () => {
    const { connection, socket } = openConnection();
    const refused: Problem = {
      code: 'nothing-to-undo',
      message: 'That action is no longer in the history, so nothing was undone.',
    };

    const undone = connection.undoTo(7);
    socket.receive(
      encodeServerMessage({
        type: 'command/rejected',
        requestId: socket.lastSent().requestId,
        problems: [refused],
      }),
    );

    await expect(undone).resolves.toEqual({ ok: false, problems: [refused] });
    expect(connection.getState().notices.map((notice) => notice.message)).toEqual([
      `Could not undo: ${refused.message}`,
    ]);
  });
});
