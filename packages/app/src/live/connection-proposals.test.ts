/**
 * Claude's proposal over the live connection (ADR 0073): the tab keeps the proposal the program shows,
 * on the project as it knows it; it accepts some or all of its changes, naming the revision shown, or
 * refuses it; and every tab says how it closed.
 */
import {
  PROTOCOL_VERSION,
  encodeServerMessage,
  executeCommand,
  type ServerMessage,
} from '@visual-anything/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { RENAME_WHATSAPP, sampleProposal } from '../test/proposal';
import { LiveConnection } from './connection';

const LIVE_URL = 'ws://localhost:3000/live?token=s3cr3t';

beforeEach(() => {
  FakeWebSocket.created = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

function openConnection() {
  const sample = sampleProposal();
  const connection = new LiveConnection(LIVE_URL);
  connection.connect();
  const socket = FakeWebSocket.created.at(-1) as FakeWebSocket;
  socket.accept();
  const send = (message: ServerMessage) => socket.receive(encodeServerMessage(message));
  send({
    type: 'project/opened',
    protocolVersion: PROTOCOL_VERSION,
    project: sample.base,
    history: {},
  });
  return { connection, socket, send, ...sample };
}

function requestIdOf(socket: FakeWebSocket): string {
  const sent = socket.lastSent() as { requestId?: string };
  if (sent.requestId === undefined) throw new Error('The last message names no request.');
  return sent.requestId;
}

describe('the proposal shown', () => {
  it('is kept with the proposed project, worked out from the project this tab knows', () => {
    const { connection, send, shown, proposed, base } = openConnection();
    expect(connection.getState().proposal).toBeUndefined();

    send({ type: 'proposal/shown', proposal: shown });

    const { proposal } = connection.getState();
    expect(proposal?.shown).toEqual(shown);
    expect(proposal?.base).toBe(connection.getState().project);
    expect(proposal?.base).toEqual(base);
    expect(proposal?.proposed).toEqual(proposed);
  });

  it('goes when it closes, and the tab says how', () => {
    const { connection, send, shown } = openConnection();
    send({ type: 'proposal/shown', proposal: shown });
    send({ type: 'proposal/closed', proposal: shown.id, how: 'withdrawn' });

    const state = connection.getState();
    expect(state.proposal).toBeUndefined();
    expect(state.proposalEnded).toEqual({
      proposal: shown.id,
      how: 'withdrawn',
      total: shown.changes.length,
      here: false,
    });
    expect(state.notices.at(-1)).toMatchObject({
      level: 'info',
      message: 'Claude withdrew its proposal: nothing of it was applied.',
    });
  });

  it('says a proposal the person’s change emptied closed by itself', () => {
    const { connection, send, shown, base } = openConnection();
    send({ type: 'proposal/shown', proposal: shown });
    const outcome = executeCommand(base, RENAME_WHATSAPP);
    if (!outcome.ok) throw new Error('The rename is refused.');
    send({
      type: 'project/changed',
      kind: 'do',
      label: outcome.label,
      author: 'user',
      operations: outcome.operations,
      warnings: [],
      created: [],
      history: {},
    });
    send({ type: 'proposal/closed', proposal: shown.id, how: 'dropped' });

    expect(connection.getState().proposal).toBeUndefined();
    expect(connection.getState().notices.at(-1)?.message).toBe(
      'Claude’s proposal closed by itself: what changed left nothing in it to review.',
    );
  });

  it('says how a proposal another tab decided closed', () => {
    const { connection, send, shown } = openConnection();
    send({ type: 'proposal/shown', proposal: shown });
    send({ type: 'proposal/closed', proposal: shown.id, how: 'accepted', accepted: ['x'] });
    expect(connection.getState().notices.at(-1)?.message).toBe(
      'Claude’s proposal was accepted in another tab.',
    );
    send({ type: 'proposal/shown', proposal: { ...shown, id: 'proposal-2' } });
    send({ type: 'proposal/closed', proposal: 'proposal-2', how: 'refused' });
    expect(connection.getState().notices.at(-1)?.message).toBe(
      'Claude’s proposal was refused in another tab.',
    );
  });

  it('is forgotten when the project opens again, until the program shows it anew', () => {
    const { connection, send, shown, base } = openConnection();
    send({ type: 'proposal/shown', proposal: shown });
    send({ type: 'project/opened', protocolVersion: PROTOCOL_VERSION, project: base, history: {} });
    expect(connection.getState().proposal).toBeUndefined();
  });
});

describe('deciding', () => {
  it('accepts the ticked changes, naming the revision shown, and resolves once it closes', async () => {
    const { connection, socket, send, shown } = openConnection();
    send({ type: 'proposal/shown', proposal: shown });
    const keys = [shown.changes[0]?.key ?? ''];

    const accepting = connection.acceptProposal(shown.id, shown.revision, keys);
    expect(socket.lastSent()).toMatchObject({
      type: 'proposal/accept',
      proposal: shown.id,
      revision: shown.revision,
      changes: keys,
    });
    send({
      type: 'proposal/closed',
      proposal: shown.id,
      how: 'accepted',
      accepted: keys,
      requestId: requestIdOf(socket),
    });

    await expect(accepting).resolves.toEqual({ ok: true, created: [], warnings: [] });
    expect(connection.getState().proposalEnded).toMatchObject({ how: 'accepted', here: true });
    expect(connection.getState().notices.at(-1)?.message).toBe(
      `Accepted 1 of Claude’s ${shown.changes.length} changes.`,
    );
  });

  it('accepts every change', async () => {
    const { connection, socket, send, shown } = openConnection();
    send({ type: 'proposal/shown', proposal: shown });
    const accepting = connection.acceptProposal(shown.id, shown.revision, 'all');
    expect(socket.lastSent()).toMatchObject({ changes: 'all' });
    send({
      type: 'proposal/closed',
      proposal: shown.id,
      how: 'accepted',
      accepted: shown.changes.map((each) => each.key),
      requestId: requestIdOf(socket),
    });
    await expect(accepting).resolves.toMatchObject({ ok: true });
    expect(connection.getState().notices.at(-1)?.message).toBe('Accepted Claude’s changes.');
  });

  it('resolves with why an acceptance was refused, and keeps the proposal shown again', async () => {
    const { connection, socket, send, shown } = openConnection();
    send({ type: 'proposal/shown', proposal: shown });
    const accepting = connection.acceptProposal(shown.id, 0, 'all');
    const problem = {
      code: 'invalid-command' as const,
      message: 'The proposal changed since it was shown: review it again.',
    };
    send({ type: 'command/rejected', requestId: requestIdOf(socket), problems: [problem] });
    send({ type: 'proposal/shown', proposal: shown });

    await expect(accepting).resolves.toEqual({ ok: false, problems: [problem] });
    expect(connection.getState().proposal?.shown.revision).toBe(shown.revision);
  });

  it('refuses the proposal', async () => {
    const { connection, socket, send, shown } = openConnection();
    send({ type: 'proposal/shown', proposal: shown });
    const refusing = connection.refuseProposal(shown.id);
    expect(socket.lastSent()).toMatchObject({ type: 'proposal/refuse', proposal: shown.id });
    send({
      type: 'proposal/closed',
      proposal: shown.id,
      how: 'refused',
      requestId: requestIdOf(socket),
    });
    await expect(refusing).resolves.toMatchObject({ ok: true });
    expect(connection.getState().notices.at(-1)?.message).toBe(
      'Refused Claude’s proposal: nothing of it was applied.',
    );
  });
});
