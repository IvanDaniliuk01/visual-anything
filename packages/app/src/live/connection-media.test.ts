/**
 * Media files over the live connection (ADR 0098): a file sent in pieces to be kept, answered with
 * its reference or why it was refused; a file asked for by its hash, its pieces put together; and the
 * files no picture names, listed and removed.
 */
import { PROTOCOL_VERSION, encodeBase64, encodeServerMessage } from '@visual-anything/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSample } from '../test/sample';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { LiveConnection } from './connection';

const HASH = 'd'.repeat(64);
const MEDIA = { hash: HASH, format: 'png', width: 2, height: 2, bytes: 70 } as const;

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

describe('media files over the live connection', () => {
  it('sends a file to keep, and resolves with its reference', async () => {
    const { connection, socket } = openConnection();
    const kept = connection.putMedia('desk.png', new Uint8Array([1, 2, 3]));
    const requestId = requestIdOf(socket);
    expect(socket.lastSent()).toEqual({
      type: 'media/put',
      requestId,
      fileName: 'desk.png',
      piece: { index: 0, count: 1, data: encodeBase64(new Uint8Array([1, 2, 3])) },
    });
    socket.receive(
      encodeServerMessage({ type: 'media/stored', requestId, media: MEDIA, removed: [] }),
    );
    expect(await kept).toEqual({
      ok: true,
      answer: { type: 'media/stored', requestId, media: MEDIA, removed: [] },
    });
  });

  it('resolves with the program’s refusal', async () => {
    const { connection, socket } = openConnection();
    const kept = connection.putMedia('notes.txt', new Uint8Array([1]));
    socket.receive(
      encodeServerMessage({
        type: 'media/refused',
        requestId: requestIdOf(socket),
        code: 'invalid-image',
        message: 'Not a picture.',
      }),
    );
    expect(await kept).toEqual({
      ok: false,
      problems: [{ code: 'invalid-image', message: 'Not a picture.' }],
    });
  });

  it('asks for a file by its hash, and puts its pieces together', async () => {
    const { connection, socket } = openConnection();
    const file = connection.getMediaFile(HASH);
    const requestId = requestIdOf(socket);
    expect(socket.lastSent()).toEqual({ type: 'media/get', requestId, hash: HASH });
    socket.receive(
      encodeServerMessage({
        type: 'media/piece',
        requestId,
        hash: HASH,
        piece: { index: 0, count: 1, data: encodeBase64(new Uint8Array([9, 8])) },
      }),
    );
    const result = await file;
    expect(result.ok && [...result.answer]).toEqual([9, 8]);
  });

  it('lists and removes the files no picture names', async () => {
    const { connection, socket } = openConnection();
    const listed = connection.removeMediaFiles([HASH]);
    const requestId = requestIdOf(socket);
    expect(socket.lastSent()).toEqual({ type: 'media-files/remove', requestId, hashes: [HASH] });
    socket.receive(
      encodeServerMessage({ type: 'media-files/listed', requestId, files: [], removed: [HASH] }),
    );
    expect(await listed).toMatchObject({ ok: true, answer: { removed: [HASH] } });
  });
});
