import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LiveGate } from './gate';
import { LiveValueStore } from './store';
import { liveKey, type LiveSender, type LiveValue } from './values';

const CLAUDE: LiveSender = { kind: 'claude' };

function value(target: string, attribute: string, v: number, sender = CLAUDE): LiveValue {
  return { target, attribute, value: v, sender, arrivedAt: 1, freshFor: 60_000 };
}

describe('LiveValueStore', () => {
  it('keeps the latest value of each target and attribute', () => {
    const store = new LiveValueStore();
    store.set([value('api', 'latency', 1), value('api', 'load', 2)]);
    store.set([value('api', 'latency', 3)]);
    expect(store.size).toBe(2);
    expect(store.get('api', 'latency')?.value).toBe(3);
    expect(store.all().map((each) => each.attribute)).toEqual(['load', 'latency']);
  });

  it('drops the oldest past its cap, and says which', () => {
    const store = new LiveValueStore(3);
    store.set([value('a', 'x', 1), value('b', 'x', 1), value('c', 'x', 1)]);
    store.set([value('a', 'x', 2)]);
    const outcome = store.set([value('d', 'x', 1)]);
    expect(outcome.dropped).toEqual([{ target: 'b', attribute: 'x' }]);
    expect(store.all().map((each) => each.target)).toEqual(['c', 'a', 'd']);
  });

  it('does not count as kept what its own message pushed out', () => {
    const store = new LiveValueStore(2);
    const outcome = store.set([value('a', 'x', 1), value('b', 'x', 1), value('c', 'x', 1)]);
    expect(outcome.kept.map((each) => each.target)).toEqual(['b', 'c']);
    expect(outcome.dropped).toEqual([{ target: 'a', attribute: 'x' }]);
  });

  it('clears by sender, target and attribute', () => {
    const store = new LiveValueStore();
    const script: LiveSender = { kind: 'command-line' };
    store.set([
      value('api', 'latency', 1),
      value('api', 'load', 1, script),
      value('db', 'latency', 1),
    ]);
    expect(store.clear({ sender: CLAUDE, targets: ['api'] })).toEqual([
      { target: 'api', attribute: 'latency' },
    ]);
    expect(store.clear({ attributes: ['latency'] })).toEqual([
      { target: 'db', attribute: 'latency' },
    ]);
    expect(store.clear()).toEqual([{ target: 'api', attribute: 'load' }]);
    expect(store.size).toBe(0);
  });

  it('clears the values of targets no longer there', () => {
    const store = new LiveValueStore();
    store.set([value('api', 'a', 1), value('gone', 'a', 1)]);
    expect(store.clearTargetsNotIn((target) => target === 'api')).toEqual([
      { target: 'gone', attribute: 'a' },
    ]);
  });

  it('never holds more than its cap, and always the latest of what it kept', () => {
    const entry = fc.record({
      target: fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f'),
      attribute: fc.constantFrom('x', 'y'),
      value: fc.integer(),
    });
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.array(fc.array(entry, { maxLength: 6 }), { maxLength: 12 }),
        (cap, messages) => {
          const store = new LiveValueStore(cap);
          const latest = new Map<string, number>();
          for (const message of messages) {
            store.set(message.map((each) => value(each.target, each.attribute, each.value)));
            for (const each of message)
              latest.set(liveKey(each.target, each.attribute), each.value);
            expect(store.size).toBeLessThanOrEqual(cap);
          }
          for (const kept of store.all()) {
            expect(kept.value).toBe(latest.get(liveKey(kept.target, kept.attribute)));
          }
        },
      ),
    );
  });
});

describe('LiveGate', () => {
  it('lets twenty messages a second through, and makes the rest wait, merged', () => {
    const gate = new LiveGate(20, 1000);
    for (let i = 0; i < 20; i += 1) {
      expect(gate.offer([value('api', 'a', i)], 100 + i).pass).toHaveLength(1);
    }
    const waiting = gate.offer([value('api', 'a', 20), value('db', 'a', 1)], 150);
    expect(waiting).toEqual({ pass: [], waiting: 2, dropped: 0, wakeAt: 1100 });
    const more = gate.offer([value('api', 'a', 21)], 160);
    expect(more.waiting).toBe(2);
    expect(gate.wake(1099).pass).toEqual([]);
    const woken = gate.wake(1100);
    expect(woken.pass.map((each) => [each.target, each.value])).toEqual([
      ['db', 1],
      ['api', 21],
    ]);
    expect(gate.waiting).toBe(0);
  });

  it('drops the oldest of what waits past a message’s worth', () => {
    const gate = new LiveGate(1, 2);
    gate.offer([value('a', 'x', 1)], 0);
    const outcome = gate.offer([value('b', 'x', 1), value('c', 'x', 1), value('d', 'x', 1)], 10);
    expect(outcome.dropped).toBe(1);
    expect(gate.wake(1000).pass.map((each) => each.target)).toEqual(['c', 'd']);
  });

  it('keeps later values waiting behind those that wait already', () => {
    const gate = new LiveGate(1, 10);
    gate.offer([value('a', 'x', 1)], 0);
    gate.offer([value('a', 'x', 2)], 10);
    // The second has room again, but what waits goes first, with what comes now merged in.
    const outcome = gate.offer([value('a', 'x', 3)], 1500);
    expect(outcome.pass).toEqual([]);
    expect(outcome.wakeAt).toBe(1500);
    expect(gate.wake(1500).pass.map((each) => each.value)).toEqual([3]);
  });

  it('never lets more than its rate through in any second', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 50 }), { minLength: 1, maxLength: 120 }),
        (gaps) => {
          const gate = new LiveGate(5, 100);
          const passed: number[] = [];
          let now = 0;
          let wakeAt: number | undefined;
          for (const gap of gaps) {
            now += gap;
            if (wakeAt !== undefined && wakeAt <= now) {
              const woken = gate.wake(wakeAt);
              if (woken.pass.length > 0) passed.push(wakeAt);
              wakeAt = woken.wakeAt;
            }
            const outcome = gate.offer([value('a', 'x', now)], now);
            if (outcome.pass.length > 0) passed.push(now);
            wakeAt ??= outcome.wakeAt;
            if (outcome.wakeAt !== undefined && wakeAt !== undefined) {
              wakeAt = Math.min(wakeAt, outcome.wakeAt);
            }
          }
          for (const at of passed) {
            expect(
              passed.filter((other) => other > at - 1000 && other <= at).length,
            ).toBeLessThanOrEqual(5);
          }
        },
      ),
    );
  });
});
