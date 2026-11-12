import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonical, isStillBucket, stillBucket, stillKey, STILL_WAIT } from './stills';
import type { VaData } from './types';

const DATA: VaData = {
  api: 1,
  parameters: { a: 1, b: -2 },
  theme: 'light',
  language: 'en',
  size: { width: 320, height: 240 },
  element: { id: 'f', name: 'Function', component: 'quadratic.function', attributes: [] },
};
const APPROVAL = 'a'.repeat(64);

describe('stills', () => {
  it('takes a still at the smallest bucket at least as wide as the shape shows, 1,024 past it', () => {
    expect(stillBucket(0)).toBe(256);
    expect(stillBucket(200)).toBe(256);
    expect(stillBucket(256)).toBe(256);
    expect(stillBucket(257)).toBe(512);
    expect(stillBucket(512)).toBe(512);
    expect(stillBucket(900)).toBe(1024);
    expect(stillBucket(5000)).toBe(1024);
    expect([256, 512, 1024].every(isStillBucket)).toBe(true);
    expect([0, 128, 300, 2048, '256'].some(isStillBucket)).toBe(false);
  });

  it('waits for ready or two frames, fonts at most 2 s, and gives up after 5 s', () => {
    expect(STILL_WAIT).toEqual({ framesForReady: 2, fonts: 2000, giveUp: 5000 });
  });

  it('keys a still by its inputs, its data, its theme, its parameters and its bucket', () => {
    const key = stillKey(APPROVAL, DATA, 512);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(stillKey(APPROVAL, { ...DATA }, 512)).toBe(key);
    const others = [
      stillKey('b'.repeat(64), DATA, 512),
      stillKey(APPROVAL, DATA, 256),
      stillKey(APPROVAL, { ...DATA, theme: 'dark' }, 512),
      stillKey(APPROVAL, { ...DATA, parameters: { a: 2, b: -2 } }, 512),
      stillKey(APPROVAL, { ...DATA, size: { width: 321, height: 240 } }, 512),
      stillKey(APPROVAL, { ...DATA, language: 'es' }, 512),
      stillKey(
        APPROVAL,
        { ...DATA, element: { ...(DATA.element as NonNullable<VaData['element']>), name: 'g' } },
        512,
      ),
    ];
    expect(new Set([key, ...others]).size).toBe(others.length + 1);
  });

  it('writes equal data as equal text, whatever order its keys came in', () => {
    const record = fc.dictionary(
      fc.string({ maxLength: 6 }),
      fc.oneof(fc.integer(), fc.string({ maxLength: 6 }), fc.boolean(), fc.constant(null)),
      { maxKeys: 8 },
    );
    fc.assert(
      fc.property(record, (value) => {
        const reversed = Object.fromEntries(Object.entries(value).reverse());
        expect(canonical(reversed)).toBe(canonical(value));
        expect(JSON.parse(canonical(value))).toEqual(JSON.parse(JSON.stringify(value)));
      }),
      { numRuns: 200 },
    );
    expect(canonical({ b: 1, a: [2, { d: undefined, c: 'x' }] })).toBe('{"a":[2,{"c":"x"}],"b":1}');
  });
});
