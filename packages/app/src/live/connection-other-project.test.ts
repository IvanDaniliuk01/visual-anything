/** Asking the local program to open another project, as a destination names it (ADR 0056). */
import { PROTOCOL_VERSION, encodeServerMessage } from '@visual-anything/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { loadSample } from '../test/sample';
import { LiveConnection } from './connection';

const LIVE_URL = 'ws://localhost:3000/live?token=s3cr3t';
const sample = loadSample();

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

describe('opening another project', () => {
  it('sends the project and the view, and resolves with the name of the project that opened', async () => {
    const { connection, socket } = openConnection();
    const opened = connection.openOtherProject('../billing', 'invoices');
    expect(socket.lastSent()).toEqual({
      type: 'project/open-other',
      requestId: expect.any(String) as string,
      project: '../billing',
      view: 'invoices',
    });
    socket.receive(
      encodeServerMessage({
        type: 'other-project/opened',
        requestId: socket.lastSent().requestId,
        name: 'Billing',
      }),
    );
    await expect(opened).resolves.toEqual({ ok: true, name: 'Billing' });
    // Nothing in this project changed.
    expect(connection.getState().project).toEqual(sample);
  });

  it('resolves with why the local program refused', async () => {
    const { connection, socket } = openConnection();
    const opened = connection.openOtherProject('../nowhere');
    socket.receive(
      encodeServerMessage({
        type: 'command/rejected',
        requestId: socket.lastSent().requestId,
        problems: [{ code: 'broken-destination', message: 'There is no folder.' }],
      }),
    );
    await expect(opened).resolves.toEqual({
      ok: false,
      problems: [{ code: 'broken-destination', message: 'There is no folder.' }],
    });
  });

  it('sends nothing while not connected', async () => {
    const connection = new LiveConnection(LIVE_URL);
    await expect(connection.openOtherProject('../billing')).resolves.toMatchObject({
      ok: false,
      problems: [{ code: 'connection-closed' }],
    });
  });
});
