import { describe, expect, it } from 'vitest';
import {
  LAUNCH_PARAM,
  MAX_CAPTION_LENGTH,
  MAX_GUIDANCE_TARGETS,
  PROTOCOL_VERSION,
  ProtocolError,
  TOKEN_PARAM,
  decodeAppMessage,
  decodeServerMessage,
  encodeMessage,
  encodeServerMessage,
  readGuidance,
  type AppMessage,
  type ServerMessage,
} from './protocol';
import type { ProjectSnapshot } from './snapshot';

const project: ProjectSnapshot = {
  project: { schemaVersion: 1, name: 'My systems', packages: [] },
  model: {
    world: { id: 'world', component: 'essence', name: 'My systems' },
    elements: [],
    relations: [],
  },
  packages: [],
  views: [],
  scenarios: [],
};

describe('PROTOCOL_VERSION', () => {
  it('is 6, since a destination can open another project through its own program, and live values travel on it', () => {
    expect(PROTOCOL_VERSION).toBe(6);
  });

  it('names the launch code and the token in the address and on the live connection', () => {
    expect(LAUNCH_PARAM).toBe('launch');
    expect(TOKEN_PARAM).toBe('token');
  });
});

describe('decodeServerMessage', () => {
  it.each<ServerMessage>([
    { type: 'project/opened', protocolVersion: PROTOCOL_VERSION, project, history: {} },
    {
      type: 'project/opened',
      protocolVersion: PROTOCOL_VERSION,
      project,
      history: {},
      token: 'the-session-token',
    },
    { type: 'guidance', guidance: { kind: 'highlight', targets: ['api', 'api-reads-db'] } },
    { type: 'guidance', guidance: { kind: 'focus', targets: ['api'], view: 'overview' } },
    { type: 'guidance', guidance: { kind: 'pan-to', target: 'db', view: 'overview' } },
    { type: 'guidance', guidance: { kind: 'caption', text: 'The API reads the DB.' } },
    { type: 'guidance', guidance: { kind: 'caption', text: '' } },
    { type: 'guidance', guidance: { kind: 'clear' } },
    {
      type: 'guidance',
      guidance: {
        kind: 'filter',
        filters: {
          components: ['systems.database'],
          relationTypes: [],
          conditions: [{ of: 'elements', attribute: 'owner', test: 'is', value: 'Team A' }],
        },
        view: 'overview',
      },
    },
    {
      type: 'guidance',
      guidance: {
        kind: 'focus-view',
        targets: ['api'],
        degrees: 'all',
        direction: 'outgoing',
        isolate: true,
      },
    },
    { type: 'guidance', guidance: { kind: 'clear-explore' } },
    {
      type: 'guidance',
      guidance: { kind: 'playback', scenario: 'request', action: 'go-to-step', step: 2 },
    },
    {
      type: 'project/changed',
      operations: [{ op: 'set-project', project: project.project }],
      kind: 'do',
      label: 'Edit the project',
      author: 'claude',
      history: { undo: { label: 'Edit the project', author: 'claude' } },
      requestId: 'r1',
      warnings: [],
      created: [],
    },
    {
      type: 'command/rejected',
      requestId: 'r1',
      problems: [{ code: 'empty-name', message: 'A view needs a name.' }],
    },
    { type: 'project/reloaded', project, history: {}, reason: 'model.vamodel changed on disk.' },
    { type: 'notice', level: 'warning', message: 'model.vamodel is not valid.' },
  ])('reads back a $type message', (message) => {
    expect(decodeServerMessage(encodeServerMessage(message))).toEqual(message);
  });

  it.each([
    ['text that is not JSON', 'project/opened'],
    ['a value that is not an object', '["project/opened"]'],
    ['an unknown message type', JSON.stringify({ type: 'model/exploded' })],
    [
      'another protocol version',
      JSON.stringify({ type: 'project/opened', protocolVersion: PROTOCOL_VERSION + 1, project }),
    ],
    [
      'an opening without its project',
      JSON.stringify({ type: 'project/opened', protocolVersion: PROTOCOL_VERSION }),
    ],
    ['a change without operations', JSON.stringify({ type: 'project/changed' })],
    [
      'an opening whose token is not text',
      JSON.stringify({
        type: 'project/opened',
        protocolVersion: PROTOCOL_VERSION,
        project,
        history: {},
        token: 7,
      }),
    ],
    ['guidance without its guidance', JSON.stringify({ type: 'guidance' })],
    [
      'guidance of an unknown kind',
      JSON.stringify({ type: 'guidance', guidance: { kind: 'explode' } }),
    ],
  ])('rejects %s', (_case, text) => {
    expect(() => decodeServerMessage(text)).toThrow(ProtocolError);
  });
});

describe('readGuidance', () => {
  it('keeps only what each kind of guidance holds', () => {
    expect(
      readGuidance({ kind: 'highlight', targets: ['a'], view: 'v', extra: '<script>' }),
    ).toEqual({ kind: 'highlight', targets: ['a'], view: 'v' });
    expect(readGuidance({ kind: 'clear', targets: ['a'] })).toEqual({ kind: 'clear' });
  });

  it('takes a caption up to its longest', () => {
    const text = 'x'.repeat(MAX_CAPTION_LENGTH);
    expect(readGuidance({ kind: 'caption', text })).toEqual({ kind: 'caption', text });
  });

  it('takes up to the most targets', () => {
    const targets = Array.from({ length: MAX_GUIDANCE_TARGETS }, (_, n) => `t${n}`);
    expect(readGuidance({ kind: 'focus', targets })).toEqual({ kind: 'focus', targets });
  });

  it.each([
    ['not an object', 'highlight'],
    ['no kind', {}],
    ['an unknown kind', { kind: 'zoom' }],
    ['targets that are not a list', { kind: 'highlight', targets: 'a' }],
    ['no targets', { kind: 'highlight', targets: [] }],
    ['a target that is not an id', { kind: 'highlight', targets: [''] }],
    ['a target of the wrong type', { kind: 'focus', targets: [3] }],
    [
      'too many targets',
      { kind: 'highlight', targets: Array.from({ length: MAX_GUIDANCE_TARGETS + 1 }, () => 'a') },
    ],
    ['a view that is not an id', { kind: 'highlight', targets: ['a'], view: 4 }],
    ['pan-to without a target', { kind: 'pan-to' }],
    ['a caption without text', { kind: 'caption' }],
    ['a caption that is too long', { kind: 'caption', text: 'x'.repeat(MAX_CAPTION_LENGTH + 1) }],
  ])('refuses guidance with %s', (_case, value) => {
    expect(() => readGuidance(value)).toThrow(ProtocolError);
  });
});

describe('readGuidance for exploring the open view', () => {
  it('fills in the filters and the focus that are left out', () => {
    expect(readGuidance({ kind: 'filter', filters: {} })).toEqual({
      kind: 'filter',
      filters: { components: [], relationTypes: [], conditions: [] },
    });
    expect(readGuidance({ kind: 'focus-view', targets: ['api'], view: 'v' })).toEqual({
      kind: 'focus-view',
      targets: ['api'],
      degrees: 1,
      direction: 'both',
      isolate: false,
      view: 'v',
    });
    expect(readGuidance({ kind: 'clear-explore', view: 'v', targets: ['a'] })).toEqual({
      kind: 'clear-explore',
      view: 'v',
    });
  });

  it('keeps only what a filter holds, and gives a test without a value an empty one', () => {
    expect(
      readGuidance({
        kind: 'filter',
        filters: {
          components: ['systems.service'],
          relationTypes: ['systems.reads-from'],
          conditions: [
            { of: 'relations', attribute: 'protocol', test: 'set', extra: 1 },
            { of: 'elements', attribute: 'sizeGb', test: 'above', value: '20' },
          ],
          hidden: ['everything'],
        },
      }),
    ).toEqual({
      kind: 'filter',
      filters: {
        components: ['systems.service'],
        relationTypes: ['systems.reads-from'],
        conditions: [
          { of: 'relations', attribute: 'protocol', test: 'set', value: '' },
          { of: 'elements', attribute: 'sizeGb', test: 'above', value: '20' },
        ],
      },
    });
  });

  it('takes every degree, or one to five', () => {
    for (const degrees of [1, 5, 'all'] as const) {
      expect(readGuidance({ kind: 'focus-view', targets: ['a'], degrees })).toMatchObject({
        degrees,
      });
    }
  });

  const condition = { of: 'elements', attribute: 'owner', test: 'is', value: 'A' };
  it.each([
    ['filters that are not an object', { kind: 'filter', filters: [] }],
    ['no filters', { kind: 'filter' }],
    ['components that are not ids', { kind: 'filter', filters: { components: [''] } }],
    ['relation types that are not a list', { kind: 'filter', filters: { relationTypes: 'x' } }],
    [
      'too many components',
      {
        kind: 'filter',
        filters: { components: Array.from({ length: MAX_GUIDANCE_TARGETS + 1 }, () => 'a') },
      },
    ],
    [
      'a condition on something else',
      { kind: 'filter', filters: { conditions: [{ ...condition, of: 'views' }] } },
    ],
    [
      'a condition with an unknown test',
      { kind: 'filter', filters: { conditions: [{ ...condition, test: 'matches' }] } },
    ],
    [
      'a condition without its attribute',
      { kind: 'filter', filters: { conditions: [{ ...condition, attribute: ' ' }] } },
    ],
    [
      'a condition that needs a value and has none',
      { kind: 'filter', filters: { conditions: [{ ...condition, value: undefined }] } },
    ],
    [
      'a condition whose value is not text',
      { kind: 'filter', filters: { conditions: [{ ...condition, value: 3 }] } },
    ],
    [
      'too many conditions',
      { kind: 'filter', filters: { conditions: Array.from({ length: 33 }, () => condition) } },
    ],
    [
      'an attribute name that is too long',
      {
        kind: 'filter',
        filters: { conditions: [{ ...condition, attribute: 'x'.repeat(201) }] },
      },
    ],
    ['focus without targets', { kind: 'focus-view', targets: [] }],
    ['focus of no degrees', { kind: 'focus-view', targets: ['a'], degrees: 0 }],
    ['focus of six degrees', { kind: 'focus-view', targets: ['a'], degrees: 6 }],
    ['focus of a degree and a half', { kind: 'focus-view', targets: ['a'], degrees: 1.5 }],
    ['focus in no known direction', { kind: 'focus-view', targets: ['a'], direction: 'up' }],
    ['focus whose isolate is not a boolean', { kind: 'focus-view', targets: ['a'], isolate: 1 }],
    ['clearing a view that is not an id', { kind: 'clear-explore', view: '' }],
  ])('refuses %s', (_case, value) => {
    expect(() => readGuidance(value)).toThrow(ProtocolError);
  });
});

describe('readGuidance for playing a scenario', () => {
  it.each(['open', 'play', 'pause', 'next-step', 'previous-step'] as const)(
    'reads %s, which names no step',
    (action) => {
      expect(readGuidance({ kind: 'playback', scenario: 's', action, step: 3 })).toEqual({
        kind: 'playback',
        scenario: 's',
        action,
      });
    },
  );

  it('reads going to a step by its index', () => {
    expect(
      readGuidance({ kind: 'playback', scenario: 's', action: 'go-to-step', step: 0 }),
    ).toEqual({ kind: 'playback', scenario: 's', action: 'go-to-step', step: 0 });
  });

  it.each([
    ['no scenario', { kind: 'playback', action: 'play' }],
    ['an unknown action', { kind: 'playback', scenario: 's', action: 'rewind' }],
    ['going to no step', { kind: 'playback', scenario: 's', action: 'go-to-step' }],
    [
      'going to a step before the first',
      { kind: 'playback', scenario: 's', action: 'go-to-step', step: -1 },
    ],
    ['going to half a step', { kind: 'playback', scenario: 's', action: 'go-to-step', step: 0.5 }],
  ])('refuses %s', (_case, value) => {
    expect(() => readGuidance(value)).toThrow(ProtocolError);
  });
});

describe('readGuidance for laying out the open view', () => {
  it('reads a layout of the whole view, or of the contents of some containers, and nothing else', () => {
    expect(readGuidance({ kind: 'layout', targets: ['a'] })).toEqual({ kind: 'layout' });
    expect(readGuidance({ kind: 'layout', view: 'v', containers: ['a', 'b'], extra: 1 })).toEqual({
      kind: 'layout',
      view: 'v',
      containers: ['a', 'b'],
    });
  });

  it.each([
    ['containers that are not a list', { kind: 'layout', containers: 'a' }],
    ['an empty list of containers', { kind: 'layout', containers: [] }],
    ['a container that is not an id', { kind: 'layout', containers: [''] }],
    [
      'more containers than guidance names',
      {
        kind: 'layout',
        containers: Array.from({ length: MAX_GUIDANCE_TARGETS + 1 }, (_, n) => `c${n}`),
      },
    ],
    ['a view that is not an id', { kind: 'layout', view: 3 }],
  ])('refuses %s', (_case, value) => {
    expect(() => readGuidance(value)).toThrow(ProtocolError);
  });
});

describe('decodeAppMessage', () => {
  it.each<AppMessage>([
    { type: 'command', requestId: 'r1', command: { type: 'delete', elements: ['api'] } },
    { type: 'undo', requestId: 'r2' },
    { type: 'redo', requestId: 'r3' },
  ])('reads back a $type message', (message) => {
    expect(decodeAppMessage(encodeMessage(message))).toEqual(message);
  });

  it.each([
    ['a message without a request id', JSON.stringify({ type: 'undo' })],
    ['a request id that is too long', JSON.stringify({ type: 'undo', requestId: 'r'.repeat(101) })],
    [
      'a command that is not an object',
      JSON.stringify({ type: 'command', requestId: 'r', command: 'delete' }),
    ],
    ['an unknown message type', JSON.stringify({ type: 'explode', requestId: 'r' })],
    ['text that is not JSON', '{'],
  ])('rejects %s', (_case, text) => {
    expect(() => decodeAppMessage(text)).toThrow(ProtocolError);
  });
});
