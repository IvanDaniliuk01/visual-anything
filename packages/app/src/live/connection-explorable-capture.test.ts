/**
 * The live connection answers Claude's stills of explorables (ADR 0107, A10.3): the tab the person
 * used last takes it through what the shell lends, every other tab passes it over, and a tab with
 * nothing lent, or whose take failed, says why.
 */
import {
  PROTOCOL_VERSION,
  encodeServerMessage,
  type ExplorableCaptureRequestMessage,
} from '@visual-anything/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { loadSample } from '../test/sample';
import { LiveConnection } from './connection';

const LIVE_URL = 'ws://localhost:3000/live?token=s3cr3t';
const sample = loadSample();
const PNG = 'iVBORw0KGgoAAAANSUhEUgAA';

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

const REQUEST: ExplorableCaptureRequestMessage = {
  type: 'explorable-capture/request',
  requestId: 'explorable-capture-1',
  explorable: 'quadratic.parabola',
  element: 'f',
  width: 512,
};

const answered = (socket: FakeWebSocket) =>
  vi.waitFor(() => {
    const answer = socket.sent.find((each) => each.type === 'explorable-capture/answer');
    if (answer === undefined) throw new Error('Not answered yet.');
    return answer;
  });

describe('a still of an explorable Claude asks for', () => {
  it('is taken by what the tab used last lends, and sent back by its id', async () => {
    const { connection, socket } = open(true);
    const take = vi.fn(() =>
      Promise.resolve({ still: { png: PNG, width: 512, height: 384 }, errors: [], ready: true }),
    );
    connection.lendExplorableCapture(take);
    socket.receive(encodeServerMessage(REQUEST));
    expect(await answered(socket)).toEqual({
      type: 'explorable-capture/answer',
      requestId: 'explorable-capture-1',
      still: { png: PNG, width: 512, height: 384 },
      errors: [],
      ready: true,
    });
    expect(take).toHaveBeenCalledWith({
      explorable: 'quadratic.parabola',
      element: 'f',
      width: 512,
    });
  });

  it('is passed over in every other tab, and says why where nothing is lent or the take failed', async () => {
    const other = open(false);
    const take = vi.fn();
    other.connection.lendExplorableCapture(take);
    other.socket.receive(encodeServerMessage(REQUEST));
    expect(await answered(other.socket)).toMatchObject({ passed: 'other-tab' });
    expect(take).not.toHaveBeenCalled();
    const { connection, socket } = open(true);
    socket.receive(encodeServerMessage(REQUEST));
    expect(await answered(socket)).toMatchObject({ failed: 'failed' });
    socket.sent.length = 0;
    connection.lendExplorableCapture(() => Promise.reject(new Error('Lost.')));
    socket.receive(encodeServerMessage({ ...REQUEST, requestId: 'explorable-capture-2' }));
    expect(await answered(socket)).toMatchObject({ failed: 'failed', why: 'Lost.' });
  });
});
