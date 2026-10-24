import {
  PROTOCOL_VERSION,
  encodeServerMessage,
  type Guidance,
  type HistorySummary,
  type Operation,
  type Problem,
  type ProjectChangedMessage,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Element } from '@visual-anything/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { loadSample } from '../test/sample';
import { LiveConnection, MAX_NOTICES, type CommandResult } from './connection';

const LIVE_URL = 'ws://localhost:3000/live?token=s3cr3t';
const sample = loadSample();

beforeEach(() => {
  FakeWebSocket.created = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

function opened(project: ProjectSnapshot = sample, history: HistorySummary = {}): string {
  return encodeServerMessage({
    type: 'project/opened',
    protocolVersion: PROTOCOL_VERSION,
    project,
    history,
  });
}

function changed(change: Partial<Omit<ProjectChangedMessage, 'type'>> = {}): string {
  return encodeServerMessage({
    type: 'project/changed',
    operations: [],
    kind: 'do',
    label: 'Edit "Patient"',
    author: 'user',
    history: {},
    warnings: [],
    created: [],
    ...change,
  });
}

function sampleElement(id: string): Element {
  const found = sample.model.elements.find((each) => each.id === id);
  if (!found) throw new Error(`The sample has no element "${id}".`);
  return found;
}

function rename(id: string, name: string): Operation {
  return { op: 'replace', collection: { name: 'elements' }, item: { ...sampleElement(id), name } };
}

/** The sample with one element renamed, as a fresh opening would carry it. */
function renamedSample(id: string, name: string): ProjectSnapshot {
  return {
    ...sample,
    model: {
      ...sample.model,
      elements: sample.model.elements.map((each) => (each.id === id ? { ...each, name } : each)),
    },
  };
}

/** An operation that cannot apply to the sample: the copy it is applied to has drifted. */
const drifting: Operation = {
  op: 'remove',
  collection: { name: 'elements' },
  key: 'no-such-element',
};

const limitWarning: Problem = {
  code: 'limit-broken',
  message: '"writes to" expects its to end to be Database, but "Patient" is not.',
  subjects: ['patient'],
};

function latestSocket(): FakeWebSocket {
  const socket = FakeWebSocket.created.at(-1);
  if (!socket) throw new Error('No socket was opened.');
  return socket;
}

/** A connection whose project is open. */
function openConnection(history: HistorySummary = {}) {
  const connection = new LiveConnection(LIVE_URL);
  connection.connect();
  const socket = latestSocket();
  socket.accept();
  socket.receive(opened(sample, history));
  return { connection, socket };
}

function nameOf(connection: LiveConnection, id: string): string | undefined {
  return connection.getState().project?.model.elements.find((each) => each.id === id)?.name;
}

function requestIdOf(socket: FakeWebSocket): string {
  return socket.lastSent().requestId;
}

/** Whether a promise has settled, without waiting for it to. */
async function isSettled(promise: Promise<unknown>): Promise<boolean> {
  const pending = Symbol('pending');
  const winner = await Promise.race([promise, Promise.resolve(pending)]);
  return winner !== pending;
}

const CLOSED: CommandResult = {
  ok: false,
  problems: [{ code: 'connection-closed', message: expect.any(String) as string }],
};

describe('LiveConnection', () => {
  it('opens the live connection and waits for the project', () => {
    const connection = new LiveConnection(LIVE_URL);
    connection.connect();
    expect(latestSocket().url).toBe(LIVE_URL);
    expect(connection.getState()).toEqual({
      status: 'connecting',
      failure: undefined,
      project: undefined,
      history: {},
      notices: [],
      guidance: {},
    });
  });

  it('without a session token, fails at once and opens nothing', () => {
    const connection = new LiveConnection(null);
    connection.connect();
    expect(connection.getState()).toMatchObject({
      status: 'failed',
      failure: { reason: 'no-token' },
    });
    expect(FakeWebSocket.created).toHaveLength(0);
  });

  it('shows the project the local program sends, with its history', () => {
    const history = { undo: { label: 'Create "Patient"', author: 'claude' as const } };
    const { connection } = openConnection(history);
    expect(connection.getState()).toMatchObject({ status: 'open', project: sample, history });
  });

  it('tells its subscribers when the state changes, and keeps the same state otherwise', () => {
    const connection = new LiveConnection(LIVE_URL);
    const listener = vi.fn();
    const unsubscribe = connection.subscribe(listener);
    connection.connect();
    const before = connection.getState();
    expect(connection.getState()).toBe(before);

    latestSocket().receive(opened());
    expect(listener).toHaveBeenCalled();
    expect(connection.getState()).not.toBe(before);

    listener.mockClear();
    unsubscribe();
    connection.notify('info', 'Nobody hears this.');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('changes', () => {
  it('applies the operations of every change, and takes the history it carries', () => {
    const { connection, socket } = openConnection();
    const history = {
      undo: { label: 'Rename "Patient" to "Client"', author: 'claude' as const },
    };
    socket.receive(
      changed({ operations: [rename('patient', 'Client')], author: 'claude', history }),
    );
    expect(nameOf(connection, 'patient')).toBe('Client');
    expect(connection.getState().history).toEqual(history);
  });

  it('applies changes in the order they arrive', () => {
    const { connection, socket } = openConnection();
    socket.receive(changed({ operations: [rename('patient', 'Client')] }));
    socket.receive(changed({ operations: [rename('patient', 'Customer')] }));
    expect(nameOf(connection, 'patient')).toBe('Customer');
  });
});

describe('requests', () => {
  const billing: Element = { id: 'billing', component: 'systems.service', name: 'Billing' };
  const insertBilling: Operation = {
    op: 'insert',
    collection: { name: 'elements' },
    index: sample.model.elements.length,
    item: billing,
  };

  it('sends a command with a request id, and resolves with what it created and warned about', async () => {
    const { connection, socket } = openConnection();
    const result = connection.send({
      type: 'create-element',
      element: { component: 'systems.service', name: 'Billing' },
    });
    expect(socket.lastSent()).toEqual({
      type: 'command',
      requestId: expect.any(String) as string,
      command: {
        type: 'create-element',
        element: { component: 'systems.service', name: 'Billing' },
      },
    });

    socket.receive(
      changed({
        requestId: requestIdOf(socket),
        operations: [insertBilling],
        created: ['billing'],
        warnings: [limitWarning],
      }),
    );
    await expect(result).resolves.toEqual({
      ok: true,
      created: ['billing'],
      warnings: [limitWarning],
    });
  });

  it('has applied the change by the time the request resolves', async () => {
    const { connection, socket } = openConnection();
    const result = connection.send({
      type: 'create-element',
      element: { component: 'systems.service', name: 'Billing' },
    });
    socket.receive(
      changed({
        requestId: requestIdOf(socket),
        operations: [insertBilling],
        created: ['billing'],
      }),
    );
    const created = await result.then(() => nameOf(connection, 'billing'));
    expect(created).toBe('Billing');
  });

  it('resolves with the problems when the local program refuses', async () => {
    const { connection, socket } = openConnection();
    const result = connection.send({ type: 'delete', elements: ['world'] });
    const problems: Problem[] = [{ code: 'world-not-allowed', message: 'World stays.' }];
    socket.receive(
      encodeServerMessage({ type: 'command/rejected', requestId: requestIdOf(socket), problems }),
    );
    await expect(result).resolves.toEqual({ ok: false, problems });
    expect(connection.getState().project).toEqual(sample);
  });

  it('gives every request its own id, across connections in the same tab', () => {
    const first = openConnection();
    void first.connection.send({ type: 'delete', elements: ['patient'] });
    void first.connection.undo();
    const second = openConnection();
    void second.connection.redo();
    const ids = [...first.socket.sent, ...second.socket.sent].map((each) => each.requestId);
    expect(new Set(ids).size).toBe(3);
  });

  it('leaves other requests waiting when a change answers one', async () => {
    const { connection, socket } = openConnection();
    const first = connection.send({ type: 'delete', elements: ['patient'] });
    const firstId = requestIdOf(socket);
    const second = connection.send({ type: 'delete', elements: ['scheduling'] });
    const secondId = requestIdOf(socket);

    socket.receive(changed({ requestId: secondId }));
    await expect(second).resolves.toMatchObject({ ok: true });
    expect(await isSettled(first)).toBe(false);

    socket.receive(changed({ requestId: firstId }));
    await expect(first).resolves.toMatchObject({ ok: true });
  });

  it('ignores answers to requests it did not send, but still applies their changes', () => {
    const { connection, socket } = openConnection();
    socket.receive(
      encodeServerMessage({ type: 'command/rejected', requestId: 'elsewhere', problems: [] }),
    );
    socket.receive(
      changed({
        requestId: 'elsewhere',
        operations: [rename('patient', 'Client')],
        warnings: [limitWarning],
      }),
    );
    expect(nameOf(connection, 'patient')).toBe('Client');
    expect(connection.getState().notices).toEqual([]);
  });

  it('resolves waiting requests when the connection closes before the answer', async () => {
    const { connection, socket } = openConnection();
    const result = connection.send({ type: 'delete', elements: ['patient'] });
    socket.drop();
    await expect(result).resolves.toEqual(CLOSED);
  });

  it('refuses requests at once while it is not connected', async () => {
    const connection = new LiveConnection(LIVE_URL);
    connection.connect();
    const socket = latestSocket();
    await expect(connection.send({ type: 'delete', elements: ['patient'] })).resolves.toEqual(
      CLOSED,
    );
    socket.receive(opened());
    socket.drop();
    await expect(connection.undo()).resolves.toEqual(CLOSED);
    expect(socket.sent).toEqual([]);
  });

  it('sends undo and redo, and resolves them like commands', async () => {
    const { connection, socket } = openConnection({
      undo: { label: 'Rename "Patient" to "Client"', author: 'user' },
    });
    const undone = connection.undo();
    expect(socket.lastSent()).toEqual({ type: 'undo', requestId: expect.any(String) as string });
    socket.receive(
      changed({
        kind: 'undo',
        requestId: requestIdOf(socket),
        history: { redo: { label: 'Rename "Patient" to "Client"', author: 'user' } },
      }),
    );
    await expect(undone).resolves.toEqual({ ok: true, created: [], warnings: [] });
    expect(connection.getState().history).toEqual({
      redo: { label: 'Rename "Patient" to "Client"', author: 'user' },
    });

    const redone = connection.redo();
    expect(socket.lastSent()).toEqual({ type: 'redo', requestId: expect.any(String) as string });
    socket.receive(changed({ kind: 'redo', requestId: requestIdOf(socket) }));
    await expect(redone).resolves.toMatchObject({ ok: true });
  });
});

describe('notices', () => {
  it('shows the warnings of a change that answers this tab’s request', () => {
    const { connection, socket } = openConnection();
    void connection.send({ type: 'delete', elements: ['patient'] });
    socket.receive(changed({ requestId: requestIdOf(socket), warnings: [limitWarning] }));
    expect(connection.getState().notices).toEqual([
      { id: expect.any(Number) as number, level: 'warning', message: limitWarning.message },
    ]);
  });

  it('does not show the warnings of changes that answer other tabs or Claude', () => {
    const { connection, socket } = openConnection();
    socket.receive(changed({ author: 'claude', warnings: [limitWarning] }));
    expect(connection.getState().notices).toEqual([]);
  });

  it('shows why an undo or a redo was refused', async () => {
    const { connection, socket } = openConnection();
    const problems: Problem[] = [{ code: 'invalid-command', message: 'There is nothing to undo.' }];
    const undone = connection.undo();
    socket.receive(
      encodeServerMessage({ type: 'command/rejected', requestId: requestIdOf(socket), problems }),
    );
    await expect(undone).resolves.toEqual({ ok: false, problems });
    expect(connection.getState().notices).toEqual([
      {
        id: expect.any(Number) as number,
        level: 'error',
        message: 'Could not undo: There is nothing to undo.',
      },
    ]);

    void connection.redo();
    socket.receive(
      encodeServerMessage({
        type: 'command/rejected',
        requestId: requestIdOf(socket),
        problems: [{ code: 'invalid-command', message: 'There is nothing to redo.' }],
      }),
    );
    expect(connection.getState().notices.at(-1)?.message).toBe(
      'Could not redo: There is nothing to redo.',
    );
  });

  it('leaves a refused command to whoever sent it', () => {
    const { connection, socket } = openConnection();
    void connection.send({ type: 'delete', elements: ['world'] });
    socket.receive(
      encodeServerMessage({
        type: 'command/rejected',
        requestId: requestIdOf(socket),
        problems: [{ code: 'world-not-allowed', message: 'World stays.' }],
      }),
    );
    expect(connection.getState().notices).toEqual([]);
  });

  it('shows the notices the local program sends', () => {
    const { connection, socket } = openConnection();
    socket.receive(
      encodeServerMessage({
        type: 'notice',
        level: 'warning',
        message: 'model.vamodel is not valid.',
      }),
    );
    expect(connection.getState().notices).toEqual([
      {
        id: expect.any(Number) as number,
        level: 'warning',
        message: 'model.vamodel is not valid.',
      },
    ]);
  });

  it('takes the project again when its files change outside the app, and says why', () => {
    const { connection, socket } = openConnection({
      undo: { label: 'Create "Patient"', author: 'user' },
    });
    socket.receive(
      encodeServerMessage({
        type: 'project/reloaded',
        project: renamedSample('patient', 'Client'),
        history: {},
        reason: 'model.vamodel changed on disk.',
      }),
    );
    expect(nameOf(connection, 'patient')).toBe('Client');
    expect(connection.getState().history).toEqual({});
    expect(connection.getState().notices).toEqual([
      {
        id: expect.any(Number) as number,
        level: 'info',
        message: 'Reloaded the project: model.vamodel changed on disk.',
      },
    ]);
  });

  it('adds notices of its own, and dismisses them one at a time', () => {
    const connection = new LiveConnection(LIVE_URL);
    connection.notify('info', 'First.');
    connection.notify('error', 'Second.');
    const [first, second] = connection.getState().notices;
    expect(first).toMatchObject({ level: 'info', message: 'First.' });
    expect(second).toMatchObject({ level: 'error', message: 'Second.' });
    expect(first?.id).not.toBe(second?.id);

    connection.dismiss(first?.id ?? -1);
    expect(connection.getState().notices).toEqual([second]);
    const before = connection.getState();
    connection.dismiss(first?.id ?? -1);
    expect(connection.getState()).toBe(before);
  });

  it('shows a repeated notice once, as the newest', () => {
    const connection = new LiveConnection(LIVE_URL);
    connection.notify('warning', 'Same.');
    const [first] = connection.getState().notices;
    connection.notify('info', 'Other.');
    connection.notify('warning', 'Same.');
    const notices = connection.getState().notices;
    expect(notices.map((each) => each.message)).toEqual(['Other.', 'Same.']);
    expect(notices.at(-1)?.id).not.toBe(first?.id);
  });

  it('keeps only the newest notices', () => {
    const connection = new LiveConnection(LIVE_URL);
    const messages = Array.from({ length: MAX_NOTICES + 2 }, (_, index) => `Notice ${index}.`);
    for (const message of messages) connection.notify('warning', message);
    expect(connection.getState().notices.map((each) => each.message)).toEqual(
      messages.slice(-MAX_NOTICES),
    );
  });
});

describe('drift', () => {
  it('reconnects to get the project again when a change does not fit this tab’s copy', () => {
    const { connection, socket } = openConnection();
    socket.receive(changed({ operations: [drifting] }));

    expect(socket.closedByApp).toBe(true);
    expect(socket.listenerCount()).toBe(0);
    expect(FakeWebSocket.created).toHaveLength(2);
    expect(latestSocket().url).toBe(LIVE_URL);
    // The shell stays on screen with the last project while the fresh one arrives.
    expect(connection.getState()).toMatchObject({ status: 'connecting', project: sample });
    expect(connection.getState().notices).toEqual([
      {
        id: expect.any(Number) as number,
        level: 'warning',
        message: expect.stringMatching(/fell out of step/) as string,
      },
    ]);

    latestSocket().receive(opened(renamedSample('patient', 'Client')));
    expect(connection.getState().status).toBe('open');
    expect(nameOf(connection, 'patient')).toBe('Client');
  });

  it('answers the requests that were waiting on the connection it closed', async () => {
    const { connection, socket } = openConnection();
    const waiting = connection.send({ type: 'delete', elements: ['scheduling'] });
    socket.receive(changed({ operations: [drifting] }));
    await expect(waiting).resolves.toEqual(CLOSED);
  });

  it('resolves the request that the drifting change answers as done', async () => {
    const { connection, socket } = openConnection();
    const result = connection.send({ type: 'delete', elements: ['patient'] });
    socket.receive(
      changed({ requestId: requestIdOf(socket), operations: [drifting], created: ['x'] }),
    );
    await expect(result).resolves.toEqual({ ok: true, created: ['x'], warnings: [] });
  });

  it('does not reconnect again when the fresh copy drifts before any change fits', () => {
    const { connection, socket } = openConnection();
    socket.receive(changed({ operations: [drifting] }));
    const second = latestSocket();
    second.receive(opened());
    second.receive(changed({ operations: [drifting] }));

    expect(FakeWebSocket.created).toHaveLength(2);
    expect(second.closedByApp).toBe(true);
    expect(connection.getState()).toMatchObject({
      status: 'failed',
      failure: {
        reason: 'unreadable',
        detail: expect.stringContaining('no-such-element') as string,
      },
    });
  });

  it('reconnects again for a later drift, once a change has fitted', () => {
    const { socket } = openConnection();
    socket.receive(changed({ operations: [drifting] }));
    const second = latestSocket();
    second.receive(opened());
    second.receive(changed({ operations: [rename('patient', 'Client')] }));
    second.receive(changed({ operations: [drifting] }));
    expect(FakeWebSocket.created).toHaveLength(3);
  });
});

describe('failures', () => {
  it('says it was refused when the connection closes before the project arrives', () => {
    const connection = new LiveConnection(LIVE_URL);
    connection.connect();
    latestSocket().drop();
    expect(connection.getState()).toMatchObject({
      status: 'failed',
      failure: { reason: 'refused' },
    });
  });

  it('keeps the last project when the connection closes after it opened', () => {
    const { connection, socket } = openConnection();
    socket.drop();
    expect(connection.getState()).toMatchObject({ status: 'closed', project: sample });
  });

  it('fails when the local program sends something it cannot read, and disconnects', () => {
    const { connection, socket } = openConnection();
    socket.receive(JSON.stringify({ type: 'model/exploded' }));
    expect(connection.getState()).toMatchObject({
      status: 'failed',
      failure: { reason: 'unreadable', detail: 'Unknown message type: "model/exploded".' },
    });
    expect(socket.closedByApp).toBe(true);
    expect(socket.listenerCount()).toBe(0);
  });

  it('reads only text messages', () => {
    const connection = new LiveConnection(LIVE_URL);
    connection.connect();
    latestSocket().receive(new ArrayBuffer(4));
    expect(connection.getState().failure).toEqual({
      reason: 'unreadable',
      detail: 'The message is not text.',
    });
  });

  it('fails on a change that arrives before the project', () => {
    const connection = new LiveConnection(LIVE_URL);
    connection.connect();
    latestSocket().receive(changed());
    expect(connection.getState()).toMatchObject({
      status: 'failed',
      failure: { reason: 'unreadable' },
    });
  });

  it('answers waiting requests when it fails', async () => {
    const { connection, socket } = openConnection();
    const result = connection.send({ type: 'delete', elements: ['patient'] });
    socket.receive('not json');
    await expect(result).resolves.toEqual(CLOSED);
  });
});

describe('connect and disconnect', () => {
  it('lets go of the socket when it disconnects, and opens another when it connects again', () => {
    const connection = new LiveConnection(LIVE_URL);
    connection.connect();
    const first = latestSocket();
    connection.disconnect();
    expect(first.closedByApp).toBe(true);
    expect(first.listenerCount()).toBe(0);

    connection.connect();
    const second = latestSocket();
    expect(second).not.toBe(first);
    first.drop();
    expect(connection.getState().status).toBe('connecting');
    second.receive(opened());
    expect(connection.getState().status).toBe('open');
  });

  it('opens one socket however often it is asked to connect', () => {
    const connection = new LiveConnection(LIVE_URL);
    connection.connect();
    connection.connect();
    expect(FakeWebSocket.created).toHaveLength(1);
  });

  it('does not reconnect once the connection has closed', () => {
    const { connection, socket } = openConnection();
    socket.drop();
    connection.connect();
    expect(FakeWebSocket.created).toHaveLength(1);
    expect(connection.getState().status).toBe('closed');
  });

  it('answers waiting requests when it disconnects', async () => {
    const { connection } = openConnection();
    const result = connection.send({ type: 'delete', elements: ['patient'] });
    connection.disconnect();
    await expect(result).resolves.toEqual(CLOSED);
  });
});

describe('launch codes', () => {
  const LAUNCH_URL = 'ws://localhost:3000/live?launch=c0de';

  function openedWithToken(token: string): string {
    return encodeServerMessage({
      type: 'project/opened',
      protocolVersion: PROTOCOL_VERSION,
      project: sample,
      history: {},
      token,
    });
  }

  it('hands on the session token the local program gives for a launch code', () => {
    const onToken = vi.fn((token: string) => `ws://localhost:3000/live?token=${token}`);
    const connection = new LiveConnection(LAUNCH_URL, { onToken });
    connection.connect();
    expect(latestSocket().url).toBe(LAUNCH_URL);
    latestSocket().accept();
    latestSocket().receive(openedWithToken('s3cr3t'));
    expect(onToken).toHaveBeenCalledWith('s3cr3t');
    expect(connection.getState().status).toBe('open');
  });

  it('reconnects with the token, never with the launch code it spent', () => {
    const connection = new LiveConnection(LAUNCH_URL, {
      onToken: (token) => `ws://localhost:3000/live?token=${token}`,
    });
    connection.connect();
    latestSocket().accept();
    latestSocket().receive(openedWithToken('s3cr3t'));
    latestSocket().receive(changed({ operations: [drifting] }));
    expect(latestSocket().url).toBe('ws://localhost:3000/live?token=s3cr3t');
  });
});

describe('guidance', () => {
  function guidance(value: Guidance): string {
    return encodeServerMessage({ type: 'guidance', guidance: value });
  }

  it('starts with none', () => {
    const { connection } = openConnection();
    expect(connection.getState().guidance).toEqual({});
  });

  it('keeps what Claude’s guidance shows, message after message', () => {
    const { connection, socket } = openConnection();
    socket.receive(guidance({ kind: 'highlight', targets: ['patient'] }));
    socket.receive(guidance({ kind: 'caption', text: 'The patient writes first.' }));
    expect(connection.getState().guidance).toEqual({
      marks: { kind: 'highlight', targets: ['patient'], request: 1 },
      caption: 'The patient writes first.',
    });
    socket.receive(guidance({ kind: 'pan-to', target: 'whatsapp' }));
    expect(connection.getState().guidance?.panTo).toEqual({ target: 'whatsapp', request: 3 });
  });

  it('changes neither the project nor the history', () => {
    const { connection, socket } = openConnection({ undo: { label: 'Edit', author: 'user' } });
    const before = connection.getState();
    socket.receive(guidance({ kind: 'focus', targets: ['patient'] }));
    expect(connection.getState().project).toBe(before.project);
    expect(connection.getState().history).toBe(before.history);
  });

  it('lets the person dismiss it', () => {
    const { connection, socket } = openConnection();
    socket.receive(guidance({ kind: 'highlight', targets: ['patient'] }));
    connection.clearGuidance();
    expect(connection.getState().guidance).toEqual({});
  });

  it('takes it away when the connection closes', () => {
    const { connection, socket } = openConnection();
    socket.receive(guidance({ kind: 'caption', text: 'Here.' }));
    socket.drop();
    expect(connection.getState()).toMatchObject({ status: 'closed', guidance: {} });
  });
});
