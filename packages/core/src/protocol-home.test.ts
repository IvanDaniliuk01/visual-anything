/** The live protocol at home (version 8, ADR 0093): the Projects screen's offer, and what apps ask. */
import { describe, expect, it } from 'vitest';
import {
  MAX_HOME_PATH,
  PROTOCOL_VERSION,
  ProtocolError,
  decodeAppMessage,
  decodeServerMessage,
  encodeMessage,
  type AppMessage,
  type ServerMessage,
} from './protocol';

const offered: ServerMessage = {
  type: 'home/offered',
  protocolVersion: PROTOCOL_VERSION,
  folder: 'C:/Users/ana/Documents/Visual Anything',
  projects: [
    { path: 'C:/Users/ana/Documents/Visual Anything/Audit', name: 'Audit', world: 'healthcare', changed: 5 },
    { path: 'C:/Users/ana/Documents/Visual Anything/Mine', name: 'Mine', changed: 3 },
  ],
  recent: [
    { path: 'D:/work/shop', name: 'Shop', world: 'c4', changed: 1, missing: false },
    { path: 'D:/gone', missing: true },
  ],
  samples: [{ id: 'c4-architecture', name: 'Internet banking', packages: ['c4'] }],
  token: 'secret',
  requestId: 'r1',
};

describe('home/offered', () => {
  it('round-trips', () => {
    expect(decodeServerMessage(encodeMessage(offered))).toEqual(offered);
  });

  it('is refused from another version, or without what it offers', () => {
    for (const bad of [
      { ...offered, protocolVersion: 7 },
      { ...offered, projects: 'all' },
      { ...offered, recent: [{ path: 'D:/x' }] },
      { ...offered, projects: [{ path: 'x', name: 'x' }] },
      { ...offered, samples: undefined },
      { ...offered, token: 3 },
      { ...offered, requestId: 3 },
    ]) {
      expect(() => decodeServerMessage(JSON.stringify(bad)), JSON.stringify(bad)).toThrow(
        ProtocolError,
      );
    }
  });
});

describe('project/closed', () => {
  it('round-trips, and says why', () => {
    const closed: ServerMessage = { type: 'project/closed', message: 'No project is open.' };
    expect(decodeServerMessage(encodeMessage(closed))).toEqual(closed);
    expect(() => decodeServerMessage('{"type":"project/closed"}')).toThrow(ProtocolError);
  });
});

describe('what an app asks at home', () => {
  it('round-trips', () => {
    const messages: AppMessage[] = [
      { type: 'home/open', requestId: 'r1', path: 'C:/Users/ana/Documents/Visual Anything/Audit' },
      { type: 'home/create', requestId: 'r2', name: 'Audit', sample: 'clinic-claim' },
      { type: 'home/create', requestId: 'r3', name: 'Mine', view: 'Vista general' },
      { type: 'home/forget', requestId: 'r4', path: 'D:/gone' },
      { type: 'home/close', requestId: 'r5' },
    ];
    for (const message of messages) {
      expect(decodeAppMessage(encodeMessage(message))).toEqual(message);
    }
  });

  it('refuses a path that is no text, too long or holds NUL, and a name that is no short text', () => {
    for (const bad of [
      { type: 'home/open', requestId: 'r', path: 3 },
      { type: 'home/open', requestId: 'r', path: '' },
      { type: 'home/open', requestId: 'r', path: 'x'.repeat(MAX_HOME_PATH + 1) },
      { type: 'home/forget', requestId: 'r', path: 'C:/a\0b' },
      { type: 'home/create', requestId: 'r', name: '  ' },
      { type: 'home/create', requestId: 'r', name: 'x'.repeat(201) },
      { type: 'home/create', requestId: 'r', name: 'x', sample: '../etc' },
      { type: 'home/create', requestId: 'r', name: 'x', view: 7 },
    ]) {
      expect(() => decodeAppMessage(JSON.stringify(bad)), JSON.stringify(bad)).toThrow(
        ProtocolError,
      );
    }
  });
});
