/**
 * A solid's file over the live connection (ADR 0075): the tab asks for it by its hash, and the
 * program's pieces are put together into its bytes, or the request ends with why there are none.
 */
import {
  PROTOCOL_VERSION,
  SOLID_PIECE_BYTES,
  encodeBase64,
  encodeServerMessage,
} from '@visual-anything/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSample } from '../test/sample';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { LiveConnection } from './connection';

const LIVE_URL = 'ws://localhost:3000/live?token=s3cr3t';
const HASH = 'e'.repeat(64);

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
      project: loadSample(),
      history: {},
    }),
  );
  return { connection, socket };
}

function requestIdOf(socket: FakeWebSocket): string {
  const sent = socket.lastSent() as { requestId?: string };
  if (sent.requestId === undefined) throw new Error('The last message names no request.');
  return sent.requestId;
}

function piece(requestId: string, index: number, count: number, bytes: Uint8Array, hash = HASH) {
  return encodeServerMessage({
    type: 'solid/piece',
    requestId,
    hash,
    piece: { index, count, data: encodeBase64(bytes) },
  });
}

describe('a solid’s file over the live connection', () => {
  it('asks by its hash, and puts its pieces together in their order, whatever order they come in', async () => {
    const { connection, socket } = openConnection();
    const file = connection.getSolidFile(HASH);
    const requestId = requestIdOf(socket);
    expect(socket.lastSent()).toEqual({ type: 'solid/get', requestId, hash: HASH });
    const first = new Uint8Array(SOLID_PIECE_BYTES).fill(7);
    const last = new Uint8Array([1, 2, 3]);
    socket.receive(piece(requestId, 1, 2, last));
    socket.receive(piece(requestId, 0, 2, first));
    const result = await file;
    if (!result.ok) throw new Error('The file did not come.');
    expect(result.answer.length).toBe(SOLID_PIECE_BYTES + 3);
    expect(result.answer[0]).toBe(7);
    expect([...result.answer.subarray(SOLID_PIECE_BYTES)]).toEqual([1, 2, 3]);
  });

  it('resolves with the program’s refusal', async () => {
    const { connection, socket } = openConnection();
    const file = connection.getSolidFile(HASH);
    socket.receive(
      encodeServerMessage({
        type: 'solid/refused',
        requestId: requestIdOf(socket),
        code: 'solid-file-missing',
        message: 'No such file.',
      }),
    );
    await expect(file).resolves.toEqual({
      ok: false,
      problems: [{ code: 'solid-file-missing', message: 'No such file.' }],
    });
  });

  it('ends the request on pieces that do not fit together', async () => {
    const { connection, socket } = openConnection();
    // A piece of another file.
    const other = connection.getSolidFile(HASH);
    socket.receive(piece(requestIdOf(socket), 0, 1, new Uint8Array([1]), 'f'.repeat(64)));
    await expect(other).resolves.toMatchObject({
      ok: false,
      problems: [{ code: 'invalid-solid' }],
    });
    // A piece before the last that is not a whole MiB.
    const short = connection.getSolidFile(HASH);
    socket.receive(piece(requestIdOf(socket), 0, 2, new Uint8Array([1])));
    await expect(short).resolves.toMatchObject({
      ok: false,
      problems: [{ code: 'invalid-solid' }],
    });
  });

  it('resolves as closed when the connection closes before the last piece', async () => {
    const { connection, socket } = openConnection();
    const file = connection.getSolidFile(HASH);
    socket.receive(piece(requestIdOf(socket), 0, 2, new Uint8Array(SOLID_PIECE_BYTES)));
    socket.drop();
    await expect(file).resolves.toMatchObject({
      ok: false,
      problems: [{ code: 'connection-closed' }],
    });
  });
});
