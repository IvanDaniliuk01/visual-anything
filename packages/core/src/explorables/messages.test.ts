import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { executeCommand } from '../commands';
import { sequentialIds, testProject } from '../test/fixtures';
import {
  MAX_FRAME_MESSAGE_BYTES,
  MAX_STILL_BYTES,
  explorableData,
  parameterValues,
  plainDataBytes,
  readFrameMessage,
  readHostMessage,
  readVaData,
  type VaData,
} from './index';
import type { ExplorableParameter } from '@visual-anything/schema';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

const DATA: VaData = {
  api: 1,
  parameters: { a: 1, grid: true, mode: 'curve' },
  theme: 'dark',
  language: 'es',
  size: { width: 640, height: 480 },
  element: {
    id: 'api',
    name: 'API',
    component: 'test.service',
    attributes: [{ name: 'latency', value: 20, kind: 'number', source: 'live' }],
  },
  contents: [],
  relations: [
    {
      id: 'r',
      type: 'test.calls',
      direction: 'in',
      other: { id: 'client', name: 'Client', component: 'test.service', attributes: [] },
    },
  ],
  omitted: 0,
  step: { kind: 'tour', id: 'tour', step: 's1', title: 'One' },
};

const FRAME_MESSAGES: unknown[] = [
  { kind: 'va/ready' },
  { kind: 'va/pong', at: 12 },
  { kind: 'va/select', id: 'api' },
  { kind: 'va/error', message: 'TypeError: x is undefined' },
  { kind: 'va/still', width: 512, png: PNG },
];

const HOST_MESSAGES: unknown[] = [
  { kind: 'va/hello', api: 1, data: DATA },
  { kind: 'va/data', data: DATA },
  { kind: 'va/ping', at: 3 },
  { kind: 'va/still', width: 1024 },
];

describe('messages between the app and a frame', () => {
  it('reads every message each way that is what it takes', () => {
    for (const message of FRAME_MESSAGES) expect(readFrameMessage(message)).toEqual(message);
    for (const message of HOST_MESSAGES) expect(readHostMessage(message)).toEqual(message);
  });

  it('drops a message with a key more, a field of the wrong kind, or the other way’s kind', () => {
    for (const message of FRAME_MESSAGES) {
      expect(readFrameMessage({ ...(message as object), extra: 1 })).toBeUndefined();
      expect(readHostMessage(message)).toBeUndefined();
    }
    for (const message of HOST_MESSAGES) {
      expect(readHostMessage({ ...(message as object), extra: 1 })).toBeUndefined();
      expect(readFrameMessage(message)).toBeUndefined();
    }
    expect(readFrameMessage({ kind: 'va/select', id: '../x' })).toBeUndefined();
    expect(readFrameMessage({ kind: 'va/pong', at: Number.NaN })).toBeUndefined();
    expect(readFrameMessage({ kind: 'va/error', message: 'x'.repeat(2001) })).toBeUndefined();
    expect(readFrameMessage({ kind: 'va/still', width: 300, png: PNG })).toBeUndefined();
    expect(readHostMessage({ kind: 'va/hello', api: 2, data: DATA })).toBeUndefined();
    expect(readHostMessage({ kind: 'va/data', data: { ...DATA, theme: 'blue' } })).toBeUndefined();
  });

  it('bounds a still: a PNG, the whole of its buffer, within its cap', () => {
    const big = new Uint8Array(MAX_STILL_BYTES + 1);
    big.set(PNG);
    expect(readFrameMessage({ kind: 'va/still', width: 256, png: big })).toBeUndefined();
    const view = new Uint8Array(new ArrayBuffer(4096), 0, PNG.length);
    view.set(PNG);
    expect(readFrameMessage({ kind: 'va/still', width: 256, png: view })).toBeUndefined();
    expect(
      readFrameMessage({ kind: 'va/still', width: 256, png: new Uint8Array(12) }),
    ).toBeUndefined();
    // Bytes anywhere else are not plain data.
    expect(readFrameMessage({ kind: 'va/error', message: PNG })).toBeUndefined();
  });

  it('drops anything that is not plain data, nests too deep or passes 1 MiB', () => {
    let deep: unknown = 1;
    for (let n = 0; n < 70; n += 1) deep = [deep];
    const attribute = (value: unknown) => ({
      kind: 'va/data',
      data: { ...DATA, element: { ...DATA.element, attributes: [{ name: 'x', value }] } },
    });
    expect(readHostMessage(attribute(deep))).toBeUndefined();
    expect(readHostMessage(attribute(new Date()))).toBeUndefined();
    expect(readHostMessage(attribute(new Map()))).toBeUndefined();
    expect(readHostMessage(attribute(() => 1))).toBeUndefined();
    expect(readHostMessage(attribute(Infinity))).toBeUndefined();
    expect(readHostMessage(attribute('x'.repeat(MAX_FRAME_MESSAGE_BYTES)))).toBeUndefined();
    class Shaped {
      kind = 'va/ready';
    }
    expect(readFrameMessage(new Shaped())).toBeUndefined();
  });

  it('refuses whatever it does not take, and gives back only what it reads', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.anything({ withBigInt: true, withDate: true, withMap: true, withTypedArray: true }),
          fc.record(
            {
              kind: fc.constantFrom('va/ready', 'va/pong', 'va/select', 'va/error', 'va/still'),
              at: fc.anything(),
              id: fc.anything(),
              message: fc.anything(),
              width: fc.anything(),
              png: fc.anything(),
            },
            { requiredKeys: ['kind'] },
          ),
        ),
        (value) => {
          const read = readFrameMessage(value);
          if (read === undefined) return;
          // What it took reads again the same, and is one of the five shapes exactly.
          expect(readFrameMessage(read)).toEqual(read);
          expect(
            Object.keys(read).every((key) =>
              ['kind', 'at', 'id', 'message', 'width', 'png'].includes(key),
            ),
          ).toBe(true);
        },
      ),
      { numRuns: 1000 },
    );
    fc.assert(
      fc.property(fc.anything({ withBigInt: true, withTypedArray: true }), (value) => {
        expect(readHostMessage(value)).toBeUndefined();
        expect(readVaData(value)).toBeUndefined();
      }),
      { numRuns: 500 },
    );
  });

  it('drops a message that any one change to a valid one breaks', () => {
    const breakers: ((data: Record<string, unknown>) => Record<string, unknown>)[] = [
      (data) => ({ ...data, api: 2 }),
      (data) => ({ ...data, language: 'fr' }),
      (data) => ({ ...data, size: { width: -1, height: 1 } }),
      (data) => ({ ...data, parameters: { '1a': 1 } }),
      (data) => ({ ...data, parameters: { a: [1] } }),
      (data) => ({ ...data, omitted: 1.5 }),
      (data) => ({ ...data, step: { kind: 'tour', id: 't' } }),
      (data) => ({
        ...data,
        relations: [{ id: 'r', type: 't', direction: 'up', other: DATA.element }],
      }),
      (data) => ({ ...data, contents: new Array(501).fill(DATA.element) }),
      (data) => ({ ...data, element: { ...DATA.element, attributes: [{ name: '', value: 1 }] } }),
      (data) => ({
        ...data,
        element: { ...DATA.element, attributes: [{ name: 'x', value: 1, source: 'made-up' }] },
      }),
    ];
    for (const broken of breakers) {
      expect(readVaData(broken(DATA as unknown as Record<string, unknown>))).toBeUndefined();
    }
  });
});

describe('va.data', () => {
  const declared: ExplorableParameter[] = [
    { name: 'a', kind: 'number', min: -5, max: 5, default: 1 },
    { name: 'n', kind: 'integer', min: 0, max: 10, default: 2 },
    { name: 'grid', kind: 'boolean', default: true },
    { name: 'mode', kind: 'choice', choices: ['curve', 'roots'], default: 'curve' },
  ];

  it('gives each parameter the value set when it fits, else its default', () => {
    expect(
      parameterValues(declared, { a: 9, n: 2.5, grid: false, mode: 'roots', extra: 1 }),
    ).toEqual({
      a: 1,
      n: 2,
      grid: false,
      mode: 'roots',
    });
    expect(parameterValues([{ name: '__proto__', kind: 'boolean', default: true }], {})).toEqual(
      Object.fromEntries([['__proto__', true]]),
    );
  });

  function project() {
    const outcome = executeCommand(
      testProject(),
      {
        type: 'define-explorable',
        package: 'test',
        explorable: { id: 'test.q', name: 'Q', parameters: declared },
        text: '',
      },
      { newId: sequentialIds() },
    );
    if (!outcome.ok) throw new Error('not defined');
    return outcome.state;
  }

  it('gives the element, its attributes with their sources, contents and relations', () => {
    const data = explorableData(project(), {
      explorable: 'test.q',
      element: 'api',
      parameters: { a: 3 },
      theme: 'light',
      language: 'en',
      size: { width: 300, height: 200 },
      sources: (id) =>
        id === 'api'
          ? { computed: new Map([['latency', { value: 35, package: 'test' }]]) }
          : undefined,
    });
    expect(data.parameters).toEqual({ a: 3, n: 2, grid: true, mode: 'curve' });
    expect(data.element?.attributes).toEqual([
      { name: 'latency', value: 35, source: 'computed', kind: 'number' },
    ]);
    expect(data.relations?.map((each) => [each.id, each.direction, each.other.id])).toEqual(
      expect.arrayContaining([
        ['client-calls-api', 'in', 'client'],
        ['api-reads-db', 'out', 'db'],
        ['api-in-system', 'out', 'system'],
      ]),
    );
    const system = explorableData(project(), {
      explorable: 'test.q',
      element: 'system',
      theme: 'dark',
      language: 'es',
      size: { width: 1, height: 1 },
    });
    expect(system.contents?.map((each) => each.id).sort()).toEqual(['api', 'db']);
    expect(readVaData(data)).toEqual(data);
    expect(readVaData(system)).toEqual(system);
  });

  it('gives a loose explorable only its parameters, theme, language and size', () => {
    const data = explorableData(project(), {
      explorable: 'test.q',
      theme: 'dark',
      language: 'es',
      size: { width: Number.NaN, height: 1e9 },
    });
    expect(data).toEqual({
      api: 1,
      parameters: { a: 1, n: 2, grid: true, mode: 'curve' },
      theme: 'dark',
      language: 'es',
      size: { width: 0, height: 100_000 },
    });
  });

  it('holds at most 500 elements and one message, the rest counted', () => {
    const base = project();
    const many = 700;
    const big = 'x'.repeat(4000);
    const state = {
      ...base,
      model: {
        ...base.model,
        elements: [
          ...base.model.elements,
          ...Array.from({ length: many }, (_, n) => ({
            id: `c${n}`,
            component: 'test.service',
            name: `C${n}`,
            attributes: { owner: big },
          })),
        ],
        relations: [
          ...base.model.relations,
          ...Array.from({ length: many }, (_, n) => ({
            id: `in${n}`,
            relationType: 'test.inside',
            from: `c${n}`,
            to: 'system',
          })),
        ],
      },
    };
    const data = explorableData(state, {
      explorable: 'test.q',
      element: 'system',
      theme: 'light',
      language: 'en',
      size: { width: 1, height: 1 },
    });
    const count = 1 + (data.contents?.length ?? 0) + (data.relations?.length ?? 0);
    expect(count).toBeLessThanOrEqual(500);
    expect(count + (data.omitted ?? 0)).toBe(1 + (many + 2) * 2);
    expect(plainDataBytes({ kind: 'va/data', data }, MAX_FRAME_MESSAGE_BYTES)).toBeDefined();
    expect(readHostMessage({ kind: 'va/data', data })).toEqual({ kind: 'va/data', data });
  });
});
