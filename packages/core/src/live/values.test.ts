import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  LIVE_LIMITS,
  checkLiveValue,
  checkLiveValues,
  isLiveAttributeName,
  readFreshFor,
  readLiveSender,
  sameSender,
} from './values';

describe('checkLiveValue', () => {
  it('keeps a target, an attribute, a value and when it was measured', () => {
    expect(
      checkLiveValue({ target: 'api', attribute: 'latency', value: 120, measuredAt: 1_000 }),
    ).toEqual({ target: 'api', attribute: 'latency', value: 120, measuredAt: 1_000 });
    expect(checkLiveValue({ target: 'api', attribute: 'up', value: null })).toEqual({
      target: 'api',
      attribute: 'up',
      value: null,
    });
  });

  it('builds what it keeps afresh, so that nothing else rides along', () => {
    const value = { nested: { a: [1, 2] } };
    const checked = checkLiveValue({ target: 'api', attribute: 'x', value, extra: 'no' });
    expect(checked).toEqual({ target: 'api', attribute: 'x', value });
    expect(typeof checked === 'object' && checked.value).not.toBe(value);
    expect(checked).not.toHaveProperty('extra');
  });

  it('refuses what is not a live value, saying why', () => {
    expect(checkLiveValue(null)).toBe('is not an object');
    expect(checkLiveValue([1])).toBe('is not an object');
    expect(checkLiveValue({ target: 'not an id', attribute: 'a', value: 1 })).toBe(
      'has no target id',
    );
    expect(checkLiveValue({ target: 'api', attribute: ' a', value: 1 })).toMatch(
      /no attribute name/,
    );
    expect(checkLiveValue({ target: 'api', attribute: 'a' })).toBe('has no value for "a"');
    expect(checkLiveValue({ target: 'api', attribute: 'a', value: Number.NaN })).toMatch(
      /not plain data/,
    );
    expect(
      checkLiveValue({ target: 'api', attribute: 'a', value: 'x'.repeat(LIVE_LIMITS.valueText) }),
    ).toMatch(/over 1024 characters as JSON/);
    expect(checkLiveValue({ target: 'api', attribute: 'a', value: 1, measuredAt: -1 })).toMatch(
      /measured/,
    );
    expect(checkLiveValue({ target: 'api', attribute: 'a', value: 1, measuredAt: '2026' })).toMatch(
      /measured/,
    );
  });

  it('refuses values that would pollute a prototype, or nest too deep', () => {
    const polluted: unknown = JSON.parse(
      '{"target":"api","attribute":"a","value":{"__proto__":{"x":1}}}',
    );
    expect(checkLiveValue(polluted)).toMatch(/__proto__/);
    let deep: unknown = 1;
    for (let i = 0; i < 20; i += 1) deep = [deep];
    expect(checkLiveValue({ target: 'api', attribute: 'a', value: deep })).toMatch(/deeper/);
    expect(checkLiveValue({ target: 'api', attribute: '__proto__', value: 1 })).toMatch(
      /attribute name/,
    );
  });

  it('reads only what the object holds itself, never what it inherits', () => {
    const inherited = Object.create({ target: 'api', attribute: 'a', value: 1 }) as object;
    expect(checkLiveValue(inherited)).toBe('has no target id');
  });

  it('never fails, whatever it is given', () => {
    fc.assert(
      fc.property(fc.anything(), (anything) => {
        const checked = checkLiveValue(anything);
        expect(typeof checked === 'string' || typeof checked === 'object').toBe(true);
      }),
    );
  });
});

describe('checkLiveValues', () => {
  it('drops the oldest past the cap of a message, those first in its list', () => {
    const list = Array.from({ length: LIVE_LIMITS.valuesPerMessage + 5 }, (_, i) => ({
      target: `e${i}`,
      attribute: 'a',
      value: i,
    }));
    const checked = checkLiveValues(list);
    expect(checked.dropped).toBe(5);
    expect(checked.values).toHaveLength(LIVE_LIMITS.valuesPerMessage);
    expect(checked.values[0]?.target).toBe('e5');
  });

  it('keeps the later of two values of one target and attribute', () => {
    const checked = checkLiveValues([
      { target: 'api', attribute: 'a', value: 1 },
      { target: 'db', attribute: 'a', value: 2 },
      { target: 'api', attribute: 'a', value: 3 },
    ]);
    expect(checked.values).toEqual([
      { target: 'db', attribute: 'a', value: 2 },
      { target: 'api', attribute: 'a', value: 3 },
    ]);
  });

  it('says which values it refused, by their place', () => {
    const checked = checkLiveValues([{ target: 'api', attribute: 'a', value: 1 }, 'nothing']);
    expect(checked.refused).toEqual([{ at: 1, reason: 'is not an object' }]);
  });

  it('refuses what is not a list', () => {
    expect(checkLiveValues({}).refused).toHaveLength(1);
  });

  it('keeps at most a message’s worth, each one a live value, whatever it is given', () => {
    fc.assert(
      fc.property(fc.array(fc.anything(), { maxLength: 50 }), (list) => {
        const checked = checkLiveValues(list);
        expect(checked.values.length + checked.refused.length).toBeLessThanOrEqual(list.length);
        for (const value of checked.values) expect(typeof checkLiveValue(value)).toBe('object');
      }),
    );
  });
});

describe('readFreshFor', () => {
  it('is a minute unless the sender says, within a second and a week', () => {
    expect(readFreshFor(undefined)).toBe(60_000);
    expect(readFreshFor(5_000)).toBe(5_000);
    expect(readFreshFor(999)).toBeUndefined();
    expect(readFreshFor(LIVE_LIMITS.freshForMax + 1)).toBeUndefined();
    expect(readFreshFor(1.5e3 + 0.5)).toBeUndefined();
    expect(readFreshFor('60000')).toBeUndefined();
  });
});

describe('senders', () => {
  it('reads only what each kind of sender holds', () => {
    expect(readLiveSender({ kind: 'claude', package: 'x' })).toEqual({ kind: 'claude' });
    expect(readLiveSender({ kind: 'command-line' })).toEqual({ kind: 'command-line' });
    expect(readLiveSender({ kind: 'package', package: 'gauges' })).toEqual({
      kind: 'package',
      package: 'gauges',
    });
    expect(readLiveSender({ kind: 'package' })).toBeUndefined();
    expect(readLiveSender({ kind: 'person' })).toBeUndefined();
  });

  it('tells packages apart', () => {
    expect(sameSender({ kind: 'claude' }, { kind: 'claude' })).toBe(true);
    expect(sameSender({ kind: 'package', package: 'a' }, { kind: 'package', package: 'b' })).toBe(
      false,
    );
    expect(sameSender({ kind: 'claude' }, { kind: 'command-line' })).toBe(false);
  });
});

describe('isLiveAttributeName', () => {
  it('takes one line of 1 to 64 characters with no space around it', () => {
    expect(isLiveAttributeName('latency')).toBe(true);
    expect(isLiveAttributeName('p99 latency')).toBe(true);
    expect(isLiveAttributeName('')).toBe(false);
    expect(isLiveAttributeName('a'.repeat(65))).toBe(false);
    expect(isLiveAttributeName('a\nb')).toBe(false);
    expect(isLiveAttributeName('a b')).toBe(false);
    expect(isLiveAttributeName(' a')).toBe(false);
  });
});
