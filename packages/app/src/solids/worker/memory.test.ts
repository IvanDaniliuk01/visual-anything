// @vitest-environment node
/**
 * The solid worker's memory (ADR 0075): the solids drawn lately stay within the limit, and those drawn
 * least lately are let go of first, never the one drawn now.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SOLID_WORKER_MEMORY } from '../protocol';
import { SolidMemory } from './memory';

describe('the solid worker’s memory', () => {
  it('keeps 768 MiB unless given less', () => {
    expect(new SolidMemory().limit).toBe(SOLID_WORKER_MEMORY);
    expect(new SolidMemory().fits(SOLID_WORKER_MEMORY)).toBe(true);
    expect(new SolidMemory().fits(SOLID_WORKER_MEMORY + 1)).toBe(false);
  });

  it('lets go of the least recently drawn first', () => {
    const memory = new SolidMemory(100);
    expect(memory.draw('a', 40)).toEqual([]);
    expect(memory.draw('b', 40)).toEqual([]);
    // Drawing a again makes b the least recent.
    expect(memory.draw('a', 40)).toEqual([]);
    expect(memory.order).toEqual(['b', 'a']);
    expect(memory.draw('c', 40)).toEqual(['b']);
    expect(memory.order).toEqual(['a', 'c']);
    expect(memory.used).toBe(80);
    expect(memory.draw('d', 90)).toEqual(['a', 'c']);
    expect(memory.order).toEqual(['d']);
  });

  it('never lets go of the solid drawn now, even past the limit', () => {
    const memory = new SolidMemory(100);
    memory.draw('a', 30);
    expect(memory.draw('b', 120)).toEqual(['a']);
    expect(memory.order).toEqual(['b']);
  });

  it('forgets a solid let go of, and every solid when the context is lost', () => {
    const memory = new SolidMemory(100);
    memory.draw('a', 30);
    memory.draw('b', 30);
    memory.forget('a');
    memory.forget('missing');
    expect(memory.order).toEqual(['b']);
    expect(memory.used).toBe(30);
    memory.reset();
    expect(memory.order).toEqual([]);
    expect(memory.used).toBe(0);
  });

  it('stays within its limit and keeps its recency, whatever is drawn', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(fc.constantFrom('a', 'b', 'c', 'd', 'e'), fc.integer({ min: 1, max: 60 })),
        ),
        (draws) => {
          const memory = new SolidMemory(100);
          const sizes = new Map<string, number>();
          let recency: string[] = [];
          for (const [hash, bytes] of draws) {
            const letGo = memory.draw(hash, bytes);
            sizes.set(hash, bytes);
            recency = [...recency.filter((each) => each !== hash), hash];
            // What it lets go of are the least recent, in order.
            expect(letGo).toEqual(recency.slice(0, letGo.length));
            recency = recency.slice(letGo.length);
            expect(memory.order).toEqual(recency);
            expect(memory.used).toBe(
              recency.reduce((sum, each) => sum + (sizes.get(each) ?? 0), 0),
            );
            expect(memory.used).toBeLessThanOrEqual(100);
            expect(memory.order.at(-1)).toBe(hash);
          }
        },
      ),
    );
  });
});
