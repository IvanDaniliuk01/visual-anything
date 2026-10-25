import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  checkAttributesAnswer,
  checkDrawAnswer,
  checkProblemsAnswer,
  plainSizeOf,
} from './answers';
import { CODE_LIMITS } from './limits';

const noImages = () => false;

describe('plainSizeOf', () => {
  it('is the length of the value written as JSON', () => {
    fc.assert(
      // A "__proto__" key is refused on purpose, below.
      fc.property(
        fc
          .jsonValue({ maxDepth: 6 })
          .filter((value) => !JSON.stringify(value).includes('"__proto__"')),
        (value) => {
          const size = plainSizeOf(value, 100, Infinity);
          expect(size).toEqual({ ok: true, size: JSON.stringify(value).length });
        },
      ),
    );
  });

  it('refuses what JSON does not hold, what nests too deep and what is too long', () => {
    for (const value of [
      undefined,
      () => 1,
      Symbol('s'),
      1n,
      Number.NaN,
      Infinity,
      new Date(),
      new Map(),
      [undefined],
      { a: undefined },
      Object.create({ inherited: 1 }) as unknown,
    ]) {
      expect(plainSizeOf(value, 16, 1000)).toMatchObject({ ok: false });
    }
    const deep: unknown[] = [];
    let at = deep;
    for (let i = 0; i < 20; i += 1) {
      const next: unknown[] = [];
      at.push(next);
      at = next;
    }
    expect(plainSizeOf(deep, 16, 1000)).toEqual({
      ok: false,
      reason: 'it nests deeper than 16 levels',
    });
    expect(plainSizeOf('x'.repeat(100), 16, 50)).toEqual({
      ok: false,
      reason: 'it is over 50 characters as JSON',
    });
  });

  it('refuses a "__proto__" key, which could change what an object derives from', () => {
    expect(plainSizeOf(JSON.parse('{"__proto__": {"polluted": true}}'), 16, 1000)).toEqual({
      ok: false,
      reason: 'it has the key "__proto__"',
    });
  });

  it('never fails on a cycle', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(plainSizeOf(cycle, 16, 100_000)).toMatchObject({ ok: false });
  });
});

describe('checkAttributesAnswer', () => {
  it('takes an object of attribute values, by name', () => {
    expect(checkAttributesAnswer({ fahrenheit: 212, label: 'hot', tags: ['a'] })).toEqual({
      ok: true,
      value: [
        { name: 'fahrenheit', value: 212 },
        { name: 'label', value: 'hot' },
        { name: 'tags', value: ['a'] },
      ],
    });
    expect(checkAttributesAnswer(undefined)).toEqual({ ok: true, value: [] });
    expect(checkAttributesAnswer(null)).toEqual({ ok: true, value: [] });
  });

  it.each([
    ['a list', [1, 2], 'it is not an object of attribute values'],
    ['a number', 3, 'it is not an object of attribute values'],
    ['an empty name', { '': 1 }, '"" is not a name a computed attribute may have'],
    [
      'a name too long',
      { [`a${'b'.repeat(64)}`]: 1 },
      `"a${'b'.repeat(64)}" is not a name a computed attribute may have`,
    ],
    ['a value JSON cannot hold', { a: Number.NaN }, 'the value of "a" is not plain data'],
    [
      'a value too long',
      { a: 'x'.repeat(CODE_LIMITS.attributeText) },
      'the value of "a" is over 1024 characters as JSON',
    ],
    [
      'too many attributes',
      Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`a${i}`, i])),
      'it computes more than 64 attributes',
    ],
  ])('drops %s, whole', (_, answer, reason) => {
    expect(checkAttributesAnswer(answer)).toEqual({ ok: false, reason });
  });

  it('drops an answer that would pollute what objects derive from, and pollutes nothing', () => {
    const answer: unknown = JSON.parse('{"__proto__": {"polluted": true}, "a": 1}');
    expect(checkAttributesAnswer(answer)).toEqual({
      ok: false,
      reason: '"__proto__" is not a name a computed attribute may have',
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const nested: unknown = JSON.parse('{"a": {"__proto__": {"polluted": true}}}');
    expect(checkAttributesAnswer(nested)).toEqual({
      ok: false,
      reason: 'the value of "a" is not plain data: it has the key "__proto__"',
    });
  });

  it('never fails, and what it keeps is plain and within its caps', () => {
    fc.assert(
      fc.property(
        fc.anything({ maxDepth: 4, withMap: true, withSet: true, withDate: true }),
        (answer) => {
          const checked = checkAttributesAnswer(answer);
          if (!checked.ok) return;
          expect(checked.value.length).toBeLessThanOrEqual(CODE_LIMITS.attributes);
          for (const { name, value } of checked.value) {
            expect(name.length).toBeGreaterThan(0);
            expect(JSON.stringify(value).length).toBeLessThanOrEqual(CODE_LIMITS.attributeText);
            expect(JSON.parse(JSON.stringify(value))).toEqual(value);
          }
        },
      ),
    );
  });
});

describe('checkProblemsAnswer', () => {
  it('takes a list of messages, as texts or as objects with a message', () => {
    expect(checkProblemsAnswer(['Too hot.', { message: ' Over 100 °C. ' }])).toEqual({
      ok: true,
      value: [{ message: 'Too hot.' }, { message: 'Over 100 °C.' }],
    });
    expect(checkProblemsAnswer(undefined)).toEqual({ ok: true, value: [] });
    expect(checkProblemsAnswer([])).toEqual({ ok: true, value: [] });
  });

  it.each([
    ['an object', { message: 'x' }, 'it is not a list of problems'],
    ['a problem that is a number', [1], 'problem 1 is not a message'],
    ['an empty message', ['  '], 'problem 1 is not a message'],
    ['a message too long', ['x'.repeat(301)], 'problem 1 is over 300 characters'],
    [
      'too many problems',
      Array.from({ length: 17 }, () => 'x'),
      'it answers more than 16 problems',
    ],
  ])('drops %s, whole', (_, answer, reason) => {
    expect(checkProblemsAnswer(answer)).toEqual({ ok: false, reason });
  });
});

describe('checkDrawAnswer', () => {
  const gauge = {
    width: 100,
    height: 60,
    items: [
      {
        kind: 'arc',
        x: 50,
        y: 55,
        radius: 40,
        from: 180,
        to: 360,
        stroke: '#888888',
        strokeWidth: 6,
      },
      {
        kind: 'line',
        points: [
          { x: 50, y: 55 },
          { x: 80, y: 30 },
        ],
        stroke: '#D33F49',
      },
      { kind: 'rounded-rectangle', x: 0, y: 0, width: 100, height: 60, fill: '#ffffff' },
      { kind: 'text', x: 50, y: 58, text: '72 °F', align: 'middle', size: 10 },
      { kind: 'image', image: 'gauges.needle', x: 0, y: 0, width: 10, height: 10 },
    ],
  };

  it('takes a drawing whose images a package defines; colors come back in capitals', () => {
    const checked = checkDrawAnswer(gauge, (id) => id === 'gauges.needle');
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value?.items[2]).toEqual({
      kind: 'rounded-rectangle',
      x: 0,
      y: 0,
      width: 100,
      height: 60,
      fill: '#FFFFFF',
    });
    expect(checked.value?.items).toHaveLength(5);
    expect(checkDrawAnswer(null, noImages)).toEqual({ ok: true, value: undefined });
  });

  it.each([
    ['a list', [], 'it is not a drawing'],
    [
      'a box of no size',
      { width: 0, height: 10, items: [] },
      'its box must be over 0 and at most 10000 either way',
    ],
    ['items that are not a list', { width: 10, height: 10, items: {} }, 'its items are not a list'],
    [
      'an unknown item',
      { width: 10, height: 10, items: [{ kind: 'script', text: 'alert(1)' }] },
      'item 1 is not something a drawing holds',
    ],
    [
      'a color that is not #RRGGBB',
      {
        width: 10,
        height: 10,
        items: [{ kind: 'rectangle', x: 0, y: 0, width: 1, height: 1, fill: 'red' }],
      },
      'item 1 has a color that is not written #RRGGBB',
    ],
    [
      'a coordinate out of range',
      { width: 10, height: 10, items: [{ kind: 'rectangle', x: 1e9, y: 0, width: 1, height: 1 }] },
      'item 1 has a number out of range',
    ],
    [
      'a key a drawing item does not have',
      { width: 10, height: 10, items: [{ kind: 'text', x: 0, y: 0, text: 'a', href: 'x' }] },
      'item 1 has the key "href", which a drawing item does not have',
    ],
    [
      'a line of one point',
      { width: 10, height: 10, items: [{ kind: 'line', points: [{ x: 0, y: 0 }] }] },
      'item 1 needs from 2 to 64 points',
    ],
    [
      'a text too long',
      { width: 10, height: 10, items: [{ kind: 'text', x: 0, y: 0, text: 'x'.repeat(81) }] },
      'item 1 has a text over 80 characters',
    ],
    [
      'an image no package defines',
      {
        width: 10,
        height: 10,
        items: [{ kind: 'image', image: 'nope', x: 0, y: 0, width: 1, height: 1 }],
      },
      'item 1 shows the image "nope", which no package in use defines',
    ],
    [
      'too many items',
      {
        width: 10,
        height: 10,
        items: Array.from({ length: 257 }, () => ({
          kind: 'rectangle',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        })),
      },
      'it holds more than 256 items',
    ],
  ])('drops %s, whole', (_, answer, reason) => {
    expect(checkDrawAnswer(answer, noImages)).toEqual({ ok: false, reason });
  });

  it('never fails on any answer', () => {
    fc.assert(
      fc.property(fc.anything({ maxDepth: 4 }), (answer) => {
        const checked = checkDrawAnswer(answer, noImages);
        expect(typeof checked.ok).toBe('boolean');
      }),
    );
  });
});
