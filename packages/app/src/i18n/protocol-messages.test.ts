/**
 * What the live connection says when a message cannot be read, in Spanish (ADR-0038): the core's
 * protocol reasons, which the "unreadable" screen shows for a message from the local program and a
 * refusal shows for one the app sent; the reasons a tab's copy of the project falls out of step with
 * the program; and why the program refuses preferences. Each must read in Spanish through the
 * catalog's templates, and keep what the message held as it was.
 */
import {
  applyOperations,
  checkPreferenceChanges,
  decodeAppMessage,
  decodeServerMessage,
  OperationError,
  ProtocolError,
  type Operation,
} from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { translateMessage, untranslatedParts } from './translate';

const sample = loadSample();

/** Why a message cannot be read, as the protocol says it. */
function reasonOf(read: () => unknown, name = ''): string {
  try {
    read();
  } catch (error) {
    if (error instanceof ProtocolError || error instanceof OperationError) return error.message;
    throw error;
  }
  throw new Error(`It was read: ${name}.`);
}

const server = (message: object) => () => decodeServerMessage(JSON.stringify(message));
const app = (message: object) => () =>
  decodeAppMessage(JSON.stringify({ requestId: 'r1', ...message }));
const guidance = (value: unknown) => server({ type: 'guidance', guidance: value });
const highlight = (more: object) =>
  guidance({ kind: 'highlight', view: 'v', targets: ['a'], ...more });
const filtered = (filters: unknown) => guidance({ kind: 'filter', view: 'v', filters });
const condition = (more: object) =>
  filtered({
    conditions: [{ of: 'elements', attribute: 'tier', test: 'is', value: 'a', ...more }],
  });
const focus = (more: object) =>
  guidance({ kind: 'focus-view', view: 'v', targets: ['a'], ...more });
const playback = (more: object) => guidance({ kind: 'playback', scenario: 's', ...more });
const history = (actions: unknown) => server({ type: 'history/listed', actions });
const action = (more: object) =>
  history([{ id: 1, label: 'Do', author: 'user', time: 1, undone: false, ...more }]);
const opened = { type: 'project/opened', protocolVersion: 6, project: {} };
const offered = { type: 'start/offered', protocolVersion: 6, folder: '/f', samples: [] };
const liveValue = {
  target: 'patient',
  attribute: 'load',
  value: 1,
  sender: { kind: 'claude' },
  arrivedAt: 1,
  freshFor: 60_000,
};
const values = (more: object) => server({ type: 'live/values', values: [], removed: [], ...more });
const kept = (more: object) =>
  server({
    type: 'live/kept',
    requestId: 'r1',
    kept: 0,
    waiting: 0,
    dropped: 0,
    unknown: [],
    refused: [],
    ...more,
  });

/** One message that cannot be read for each reason the protocol gives. */
const UNREADABLE: readonly [string, () => unknown][] = [
  ['not JSON', () => decodeServerMessage('{')],
  ['not an object', () => decodeServerMessage('[1]')],
  ['of no type', server({ type: 'paint' })],
  ['of another version', server({ ...opened, protocolVersion: 5 })],
  ['without its project', server({ ...opened, project: 1 })],
  ['with a token that is not text', server({ ...opened, token: 1 })],
  ['reloaded without its project', server({ type: 'project/reloaded' })],
  ['without operations', server({ type: 'project/changed' })],
  ['without preferences', server({ type: 'preferences/changed' })],
  ['opened elsewhere without names', server({ type: 'other-project/opened' })],
  ['start of another version', server({ ...offered, protocolVersion: 5 })],
  ['start without its folder', server({ ...offered, folder: 1 })],
  ['start with a token that is not text', server({ ...offered, token: 1 })],
  ['start without samples', server({ ...offered, samples: 1 })],
  ['start with a sample of no name', server({ ...offered, samples: [{ id: 's' }] })],
  ['guidance not an object', guidance(1)],
  ['guidance of no view', highlight({ view: 1 })],
  ['guidance of no targets', highlight({ targets: [] })],
  ['guidance of too many targets', highlight({ targets: Array.from({ length: 501 }, () => 'a') })],
  ['guidance of targets not ids', highlight({ targets: [1] })],
  ['pan to nothing', guidance({ kind: 'pan-to', view: 'v' })],
  ['caption without its text', guidance({ kind: 'caption' })],
  ['caption too long', guidance({ kind: 'caption', text: 'x'.repeat(281) })],
  ['guidance of no kind', guidance({ kind: 'dance' })],
  ['filters not an object', filtered(1)],
  ['components of filters not ids', filtered({ components: [1] })],
  ['relation types of filters not ids', filtered({ relationTypes: [1] })],
  [
    'too many components in filters',
    filtered({ components: Array.from({ length: 501 }, () => 'a') }),
  ],
  [
    'too many relation types in filters',
    filtered({ relationTypes: Array.from({ length: 501 }, () => 'a') }),
  ],
  ['conditions not a list', filtered({ conditions: 1 })],
  ['too many conditions', filtered({ conditions: Array.from({ length: 33 }, () => ({})) })],
  ['condition not an object', filtered({ conditions: [1] })],
  ['condition on nothing', condition({ of: 'views' })],
  ['condition of no attribute', condition({ attribute: '' })],
  ['condition of no test', condition({ test: 'like' })],
  ['condition without its value', condition({ value: undefined })],
  ['condition too long', condition({ value: 'x'.repeat(1001) })],
  ['focus too far', focus({ degrees: 9 })],
  ['focus no way', focus({ direction: 'up' })],
  ['focus isolating not a flag', focus({ isolate: 'yes' })],
  ['playback of no scenario', playback({ scenario: 1 })],
  ['playback doing nothing known', playback({ action: 'rewind' })],
  ['playback to no step', playback({ action: 'go-to-step', step: -1 })],
  ['history not a list', history(1)],
  ['action not an object', history([1])],
  ['action of no id', action({ id: 0 })],
  [
    'actions of one id',
    history([
      { id: 1, label: 'Do', author: 'user', time: 1, undone: false },
      { id: 1, label: 'Do', author: 'user', time: 1, undone: false },
    ]),
  ],
  ['action of no label', action({ label: 1 })],
  ['action of no author', action({ author: 'robot' })],
  ['action of no time', action({ time: 'now' })],
  ['action not saying whether undone', action({ undone: 'no' })],
  ['live values not lists', values({ values: 1 })],
  ['live value not an object', values({ values: [1] })],
  ['live value of no target', values({ values: [{ ...liveValue, target: 1 }] })],
  ['live value of no attribute', values({ values: [{ ...liveValue, attribute: '' }] })],
  ['live value of no value', values({ values: [{ ...liveValue, value: undefined }] })],
  [
    'live value not plain data',
    values({ values: [{ ...liveValue, value: { a: 'x'.repeat(5000) } }] }),
  ],
  ['live value measured at no time', values({ values: [{ ...liveValue, measuredAt: 'now' }] })],
  ['live value of no sender', values({ values: [{ ...liveValue, sender: 1 }] })],
  ['live value that arrived at no time', values({ values: [{ ...liveValue, arrivedAt: 'now' }] })],
  ['live value of no freshness', values({ values: [{ ...liveValue, freshFor: undefined }] })],
  ['live value removed of no target', values({ removed: [1] })],
  ['live value removed of no attribute', values({ removed: [{ target: 'a' }] })],
  ['answer to no request', server({ type: 'live/kept' })],
  ['answer counting nothing', kept({ kept: -1 })],
  ['answer of targets not ids', kept({ unknown: [1] })],
  ['answer not listing what it refused', kept({ refused: 1 })],
  ['answer refusing what is not an object', kept({ refused: [1] })],
  ['answer refusing with no reason', kept({ refused: [{ at: 0 }] })],
  ['fetched of no status', server({ type: 'live/fetched', requestId: 'r1', status: 99, text: '' })],
  ['fetched of no text', server({ type: 'live/fetched', requestId: 'r1', status: 200, text: 1 })],
  // What an app sends, refused with these reasons.
  ['app message without a request', () => decodeAppMessage(JSON.stringify({ type: 'undo' }))],
  ['app message of no type', app({ type: 'paint' })],
  ['command missing', app({ type: 'command' })],
  ['undo up to no action', app({ type: 'undo', to: 'last' })],
  ['redo up to no action', app({ type: 'redo', to: 'last' })],
  ['preferences without changes', app({ type: 'preferences/set' })],
  ['start from no sample', app({ type: 'start/create', sample: 1 })],
  ['start with names not an object', app({ type: 'start/create', names: 1 })],
  [
    'start with a name too long',
    app({ type: 'start/create', names: { project: 'x'.repeat(201) } }),
  ],
  ['open no project', app({ type: 'project/open-other', project: '' })],
  ['open no view there', app({ type: 'project/open-other', project: '/p', view: 1 })],
  ['fetch for no package', app({ type: 'live/fetch', url: 'https://a.com' })],
  ['fetch no address', app({ type: 'live/fetch', package: 'p', url: '' })],
  ['live values of no package', app({ type: 'live/set', values: [] })],
  ['live values not a list', app({ type: 'live/set', package: 'p', values: 1 })],
  ['live values of no freshness', app({ type: 'live/set', package: 'p', values: [], freshFor: 1 })],
];

/** Operations that do not fit a tab's copy of the project, as the program might send them. */
const OUT_OF_STEP: readonly [string, Operation][] = [
  [
    'an element twice',
    {
      op: 'insert',
      collection: { name: 'elements' },
      index: 0,
      item: sample.model.elements[0] as never,
    },
  ],
  [
    'no place',
    { op: 'insert', collection: { name: 'relations' }, index: -1, item: { id: 'r9' } as never },
  ],
  ['no element', { op: 'remove', collection: { name: 'elements' }, key: 'nobody' }],
  ['no relation', { op: 'remove', collection: { name: 'relations' }, key: 'nobody' }],
  ['no view to list', { op: 'remove', collection: { name: 'views' }, key: 'nowhere' }],
  ['no scenario', { op: 'remove', collection: { name: 'scenarios' }, key: 'nothing' }],
  ['no package to list', { op: 'remove', collection: { name: 'packages' }, key: 'nope' }],
  [
    'no component',
    { op: 'remove', collection: { name: 'components', package: 'clinic' }, key: 'nope' },
  ],
  [
    'no relation type',
    { op: 'remove', collection: { name: 'relationTypes', package: 'clinic' }, key: 'nope' },
  ],
  ['no image', { op: 'remove', collection: { name: 'images', package: 'clinic' }, key: 'nope' }],
  [
    'no position',
    { op: 'remove', collection: { name: 'positions', view: 'system-overview' }, key: 'nope' },
  ],
  [
    'no free shape',
    { op: 'remove', collection: { name: 'freeShapes', view: 'system-overview' }, key: 'nope' },
  ],
  [
    'no route',
    { op: 'remove', collection: { name: 'routes', view: 'system-overview' }, key: 'nope' },
  ],
  [
    'no stacked shape',
    {
      op: 'remove',
      collection: { name: 'stackingOrder', view: 'system-overview', container: 'world' },
      key: 'nope',
    },
  ],
  ['no package', { op: 'set-package', package: 'nope', properties: {} as never }],
  ['no view', { op: 'set-view', view: 'nowhere', properties: {} as never }],
  [
    'a view of another id',
    {
      op: 'set-view',
      view: 'system-overview',
      properties: { ...(sample.views[0] as object), id: 'other' } as never,
    },
  ],
  [
    'a package of another id',
    { op: 'set-package', package: 'clinic', properties: { id: 'other', name: 'Other' } as never },
  ],
];

function said(): { name: string; message: string }[] {
  const all = UNREADABLE.map(([name, read]) => ({ name, message: reasonOf(read, name) }));
  // What the connection says of a frame that is not text.
  all.push({ name: 'a frame of bytes', message: 'The message is not text.' });
  for (const [name, operation] of OUT_OF_STEP) {
    all.push({ name, message: reasonOf(() => applyOperations(sample, [operation]), name) });
  }
  for (const [name, changes] of [
    ['preferences not an object', 'dark'],
    ['no preference', {}],
    ['a preference there is not', { glow: true }],
  ] as const) {
    const checked = checkPreferenceChanges(changes);
    for (const problem of checked.ok ? [] : checked.problems) {
      all.push({ name, message: problem.message });
    }
  }
  return all;
}

describe('what the live connection says when it cannot read a message, in Spanish', () => {
  const all = said();

  it('says each reason the protocol gives', () => {
    expect(new Set(all.map(({ message }) => message)).size).toBeGreaterThan(90);
  });

  it('has a Spanish template for every reason', () => {
    const missing = all.flatMap(({ name, message }) =>
      untranslatedParts('es', message).map((part) => `${name}: ${part}`),
    );
    expect(missing).toEqual([]);
  });

  it('keeps what the message held as it was', () => {
    expect(translateMessage('es', 'Unknown message type: "paint".')).toBe(
      'Tipo de mensaje desconocido: "paint".',
    );
    expect(
      translateMessage(
        'es',
        'This tab’s copy of the project fell out of step with Visual Anything again: The elements of the project holds no "nobody".',
      ),
    ).toBe(
      'La copia del proyecto de esta pestaña volvió a desfasarse con Visual Anything: "nobody" no está en los elementos del proyecto.',
    );
  });
});
