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

function open(lastUsed: boolean, options: { captureSettle?: number } = {}) {
  const connection = new LiveConnection(LIVE_URL, { isLastUsed: () => lastUsed, ...options });
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
    // With the time by which it answers, which a canvas off screen starts by (#16).
    expect(take).toHaveBeenCalledWith(
      { view: 'v', region: ['a'], width: 800, theme: 'dark' },
      expect.any(Number),
    );
    expect(take).toHaveBeenCalledTimes(1);
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

/** Claude's pan_to to another view, as the program sends it. */
const PAN_TO = encodeServerMessage({
  type: 'guidance',
  guidance: { kind: 'pan-to', target: 'a', view: 'v' },
});

const PICTURE = {
  picture: { png: PNG, width: 800, height: 400, view: 'v', theme: 'dark' as const, scale: 1 },
};

/** Lets the tasks and timers queued now run, a few times over. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('a picture asked for right after guidance (#16)', () => {
  it('waits until the guidance received before it is applied, then takes it', async () => {
    const { connection, socket } = open(true);
    const take = vi.fn(() => Promise.resolve(PICTURE));
    connection.lendCapture(take, () => undefined);
    // The tab applied the guidance it had before; then pan_to comes, and the picture right after it.
    connection.guidanceApplied(connection.getState().guidance ?? {});
    socket.receive(PAN_TO);
    socket.receive(encodeServerMessage(REQUEST));
    await settle();
    expect(take).not.toHaveBeenCalled();
    // The guidance layer applied it: the view it named opened.
    connection.guidanceApplied(connection.getState().guidance ?? {});
    expect(await answered(socket)).toMatchObject({
      requestId: 'capture-1',
      picture: PICTURE.picture,
    });
    expect(take).toHaveBeenCalledTimes(1);
  });

  it('waits while the canvas says it has not drawn what the picture needs yet', async () => {
    const { connection, socket } = open(true);
    const take = vi.fn(() => Promise.resolve(PICTURE));
    let waiting: string | undefined = 'the view "v" to be drawn';
    connection.lendCapture(take, () => waiting);
    socket.receive(encodeServerMessage(REQUEST));
    await settle();
    expect(take).not.toHaveBeenCalled();
    waiting = undefined;
    connection.captureChanged();
    expect(await answered(socket)).toMatchObject({ picture: PICTURE.picture });
  });

  it('does not wait for guidance that came before the tab had a guidance layer', async () => {
    const { connection, socket } = open(true);
    const take = vi.fn(() => Promise.resolve(PICTURE));
    connection.lendCapture(take, () => undefined);
    socket.receive(PAN_TO);
    socket.receive(encodeServerMessage(REQUEST));
    expect(await answered(socket)).toMatchObject({ picture: PICTURE.picture });
  });

  it('says what it waited for when the tab never settles, and waits no more for that guidance', async () => {
    const { connection, socket } = open(true, { captureSettle: 30 });
    const take = vi.fn(() => Promise.resolve(PICTURE));
    let waiting: string | undefined = 'the view "v" to be drawn';
    connection.lendCapture(take, () => waiting);
    connection.guidanceApplied(connection.getState().guidance ?? {});
    socket.receive(PAN_TO);
    socket.receive(encodeServerMessage(REQUEST));
    const answer = await answered(socket);
    expect(answer).toMatchObject({ requestId: 'capture-1', failed: 'failed' });
    const why = (answer as { why: string }).why;
    expect(why).toContain('Claude’s guidance');
    expect(why).toContain('the view "v" to be drawn');
    expect(take).not.toHaveBeenCalled();
    // The next picture does not wait for that guidance again.
    waiting = undefined;
    socket.sent.length = 0;
    socket.receive(encodeServerMessage({ ...REQUEST, requestId: 'capture-2' }));
    expect(await answered(socket)).toMatchObject({
      requestId: 'capture-2',
      picture: PICTURE.picture,
    });
  });

  it('waits without frames: in a hidden tab, where requestAnimationFrame never runs', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      const { connection, socket } = open(true);
      const take = vi.fn(() => Promise.resolve(PICTURE));
      let waiting: string | undefined = 'the layout’s move to end';
      connection.lendCapture(take, () => waiting);
      connection.guidanceApplied(connection.getState().guidance ?? {});
      socket.receive(PAN_TO);
      socket.receive(encodeServerMessage(REQUEST));
      connection.guidanceApplied(connection.getState().guidance ?? {});
      waiting = undefined;
      connection.captureChanged();
      expect(await answered(socket)).toMatchObject({ picture: PICTURE.picture });
    } finally {
      hidden.mockRestore();
      vi.unstubAllGlobals();
      vi.stubGlobal('WebSocket', FakeWebSocket);
    }
  });

  it('is taken by the canvas of the pane that becomes active while it waits', async () => {
    const { connection, socket } = open(true);
    const before = vi.fn(() => Promise.resolve(PICTURE));
    const takeBack = connection.lendCapture(before, () => 'the canvas to draw the view "v"');
    socket.receive(encodeServerMessage(REQUEST));
    await settle();
    // Another pane becomes active: the one before takes its canvas back, the new one lends its own.
    const after = vi.fn(() => Promise.resolve(PICTURE));
    takeBack();
    connection.lendCapture(after, () => undefined);
    expect(await answered(socket)).toMatchObject({ picture: PICTURE.picture });
    expect(before).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('says there is no canvas at once when the canvas goes while it waits', async () => {
    const { connection, socket } = open(true, { captureSettle: 5_000 });
    const take = vi.fn(() => Promise.resolve(PICTURE));
    const takeBack = connection.lendCapture(take, () => 'the canvas to draw the view "v"');
    socket.receive(encodeServerMessage(REQUEST));
    await settle();
    takeBack();
    const answer = await vi.waitFor(
      () => {
        const sent = socket.sent.find((each) => each.type === 'capture/answer');
        if (sent === undefined) throw new Error('Not answered yet.');
        return sent;
      },
      { timeout: 1_000 },
    );
    expect(answer).toEqual({ type: 'capture/answer', requestId: 'capture-1', failed: 'no-canvas' });
    expect(take).not.toHaveBeenCalled();
  });

  it('goes once the person dismissed the guidance it waited for', async () => {
    const { connection, socket } = open(true);
    const take = vi.fn(() => Promise.resolve(PICTURE));
    connection.lendCapture(take, () => undefined);
    connection.guidanceApplied(connection.getState().guidance ?? {});
    socket.receive(PAN_TO);
    socket.receive(encodeServerMessage(REQUEST));
    await settle();
    expect(take).not.toHaveBeenCalled();
    connection.clearGuidance();
    // The guidance layer applies no guidance at once.
    connection.guidanceApplied(connection.getState().guidance ?? {});
    expect(await answered(socket)).toMatchObject({ picture: PICTURE.picture });
  });

  it('waits for no guidance received before the program went home, or before it reconnected', async () => {
    const { connection, socket } = open(true, { captureSettle: 5_000 });
    const take = vi.fn(() => Promise.resolve(PICTURE));
    connection.lendCapture(take, () => undefined);
    connection.guidanceApplied(connection.getState().guidance ?? {});
    socket.receive(PAN_TO);
    // The program goes home, then opens a project again: the guidance is gone from the tab.
    socket.receive(
      encodeServerMessage({
        type: 'home/offered',
        protocolVersion: PROTOCOL_VERSION,
        folder: '/home/ana/Visual Anything',
        projects: [],
        recent: [],
        samples: [],
      }),
    );
    socket.receive(
      encodeServerMessage({
        type: 'project/opened',
        protocolVersion: PROTOCOL_VERSION,
        project: sample,
        history: {},
      }),
    );
    connection.guidanceApplied(connection.getState().guidance ?? {});
    socket.receive(encodeServerMessage(REQUEST));
    expect(await answered(socket)).toMatchObject({ picture: PICTURE.picture });
  });

  it('waits for no guidance received before the connection closed', () => {
    const { connection, socket } = open(true);
    connection.lendCapture(
      () => Promise.resolve(PICTURE),
      () => undefined,
    );
    connection.guidanceApplied(connection.getState().guidance ?? {});
    socket.receive(PAN_TO);
    socket.drop(1006);
    // The guidance layer applies the tab's guidance, none, while it reconnects.
    connection.guidanceApplied(connection.getState().guidance ?? {});
    expect(connection.getState().guidance).toEqual({});
    expect(
      (connection as unknown as { captureWaits(after: number): string[] }).captureWaits(1),
    ).toEqual([]);
  });
});
