/**
 * The live connection answers the pictures Claude asks for (ADR 0081): the tab the person used last
 * takes it through the canvas that lends itself, and every other tab passes it over, saying so; a tab
 * with no canvas says that.
 */
import {
  PROTOCOL_VERSION,
  encodeServerMessage,
  type CaptureRequestMessage,
} from '@visual-anything/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { loadSample } from '../test/sample';
import { LiveConnection } from './connection';

const LIVE_URL = 'ws://localhost:3000/live?token=s3cr3t';
const sample = loadSample();

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

beforeEach(() => {
  FakeWebSocket.created = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

function open(lastUsed: boolean) {
  const connection = new LiveConnection(LIVE_URL, { isLastUsed: () => lastUsed });
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

const REQUEST: CaptureRequestMessage = {
  type: 'capture/request',
  requestId: 'capture-1',
  view: 'v',
  region: ['a'],
  width: 800,
  theme: 'dark',
};

const answered = (socket: FakeWebSocket) =>
  vi.waitFor(() => {
    const answer = socket.sent.find((each) => each.type === 'capture/answer');
    if (answer === undefined) throw new Error('Not answered yet.');
    return answer;
  });

describe('a picture Claude asks for', () => {
  it('is taken by the canvas lent, in the tab the person used last, and sent back by its id', async () => {
    const { connection, socket } = open(true);
    const take = vi.fn(() =>
      Promise.resolve({
        picture: { png: PNG, width: 800, height: 400, view: 'v', theme: 'dark' as const, scale: 1 },
      }),
    );
    connection.lendCapture(take);
    socket.receive(encodeServerMessage(REQUEST));
    expect(await answered(socket)).toEqual({
      type: 'capture/answer',
      requestId: 'capture-1',
      picture: { png: PNG, width: 800, height: 400, view: 'v', theme: 'dark', scale: 1 },
    });
    expect(take).toHaveBeenCalledWith({ view: 'v', region: ['a'], width: 800, theme: 'dark' });
  });

  it('is passed over in every other tab, which takes none', async () => {
    const { connection, socket } = open(false);
    const take = vi.fn();
    connection.lendCapture(take);
    socket.receive(encodeServerMessage(REQUEST));
    expect(await answered(socket)).toEqual({
      type: 'capture/answer',
      requestId: 'capture-1',
      passed: 'other-tab',
    });
    expect(take).not.toHaveBeenCalled();
  });

  it('says so in a tab whose canvas is gone, or failed', async () => {
    const { connection, socket } = open(true);
    const takeBack = connection.lendCapture(() => Promise.reject(new Error('Lost.')));
    socket.receive(encodeServerMessage(REQUEST));
    expect(await answered(socket)).toMatchObject({ failed: 'failed', why: 'Lost.' });
    takeBack();
    socket.sent.length = 0;
    socket.receive(encodeServerMessage({ ...REQUEST, requestId: 'capture-2' }));
    expect(await answered(socket)).toEqual({
      type: 'capture/answer',
      requestId: 'capture-2',
      failed: 'no-canvas',
    });
  });
});
