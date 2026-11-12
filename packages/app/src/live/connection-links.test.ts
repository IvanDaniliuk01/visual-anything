/**
 * A link card's preview over the live connection (ADR 0098, stage 3): the app asks for it only with
 * the card's address, and resolves with what the page's preview holds, or with why there is none.
 */
import { PROTOCOL_VERSION, encodeServerMessage } from '@visual-anything/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSample } from '../test/sample';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { LiveConnection } from './connection';

const PICTURE = { hash: 'd'.repeat(64), format: 'png', width: 2, height: 2, bytes: 70 } as const;

beforeEach(() => {
  FakeWebSocket.created = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

function openConnection() {
  const connection = new LiveConnection('ws://localhost:3000/live?token=s3cr3t');
  connection.connect();
  const socket = FakeWebSocket.created.at(-1) as FakeWebSocket;
  socket.accept();
  socket.receive(
    encodeServerMessage({
      type: 'project/opened',
      protocolVersion: PROTOCOL_VERSION,
      project: loadSample(),
      history: {},
    }),
  );
  return { connection, socket };
}

const requestIdOf = (socket: FakeWebSocket) =>
  (socket.lastSent() as { requestId: string }).requestId;

describe('a link card’s preview over the live connection', () => {
  it('asks with the address alone, and resolves with the preview', async () => {
    const { connection, socket } = openConnection();
    const fetched = connection.fetchLinkPreview('https://example.org/');
    const requestId = requestIdOf(socket);
    expect(socket.lastSent()).toEqual({
      type: 'link/fetch',
      requestId,
      url: 'https://example.org/',
    });
    const preview = { title: 'Example', picture: PICTURE };
    socket.receive(encodeServerMessage({ type: 'link/fetched', requestId, preview, notes: [] }));
    expect(await fetched).toEqual({
      ok: true,
      answer: { type: 'link/fetched', requestId, preview, notes: [] },
    });
  });

  it('resolves with the program’s refusal', async () => {
    const { connection, socket } = openConnection();
    const fetched = connection.fetchLinkPreview('https://example.org/');
    socket.receive(
      encodeServerMessage({
        type: 'link/refused',
        requestId: requestIdOf(socket),
        code: 'link-failed',
        message: 'It did not answer.',
      }),
    );
    expect(await fetched).toEqual({
      ok: false,
      problems: [{ code: 'link-failed', message: 'It did not answer.' }],
    });
  });
});
