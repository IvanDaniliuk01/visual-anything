import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { chainBreak, chainOrder, pulseLegs, pulseTimes, type ChainLink } from './pulse';

const link = (id: string, from: string, to: string): ChainLink => ({ id, from, to });

describe('chainBreak', () => {
  it('accepts a chain whose relations each share an end with the next, either way round', () => {
    expect(chainBreak([link('r1', 'finding', 'case'), link('r2', 'case', 'subject')])).toBe(-1);
    expect(chainBreak([link('r1', 'finding', 'case'), link('r2', 'subject', 'case')])).toBe(-1);
    expect(chainBreak([link('r1', 'a', 'b')])).toBe(-1);
  });

  it('says the first relation that does not join the one before', () => {
    expect(chainBreak([link('r1', 'a', 'b'), link('r2', 'b', 'c'), link('r3', 'x', 'y')])).toBe(2);
  });

  it('accepts exactly the joined chains', () => {
    const node = fc.constantFrom('a', 'b', 'c', 'd', 'e');
    // A chain built link by link from an end of the one before is joined.
    const joined = fc
      .tuple(node, node, fc.array(fc.tuple(fc.boolean(), node, fc.boolean()), { maxLength: 11 }))
      .map(([from, to, rest]) => {
        const links = [link('r0', from, to)];
        for (const [which, other, flip] of rest) {
          const last = links.at(-1) as ChainLink;
          const shared = which ? last.from : last.to;
          links.push(link(`r${links.length}`, flip ? other : shared, flip ? shared : other));
        }
        return links;
      });
    fc.assert(fc.property(joined, (links) => chainBreak(links) === -1));
    // Any list of links: accepted exactly when each pair in a row shares an end.
    const any = fc
      .array(fc.tuple(node, node), { minLength: 1, maxLength: 12 })
      .map((ends) => ends.map(([from, to], at) => link(`r${at}`, from, to)));
    fc.assert(
      fc.property(any, (links) => {
        const first = links.findIndex(
          (each, at) =>
            at > 0 &&
            ![each.from, each.to].some((end) =>
              [links[at - 1]?.from, links[at - 1]?.to].includes(end),
            ),
        );
        expect(chainBreak(links)).toBe(first);
      }),
    );
  });
});

describe('chainOrder', () => {
  it('orders relations given in any order into a chain', () => {
    const order = chainOrder([
      link('r2', 'case', 'subject'),
      link('r1', 'finding', 'case'),
      link('r3', 'subject', 'person'),
    ]);
    expect(order).toEqual(['r1', 'r2', 'r3']);
  });

  it('keeps the order given when it is a chain already', () => {
    expect(chainOrder([link('r2', 'b', 'c'), link('r1', 'a', 'b')])).toEqual(['r2', 'r1']);
  });

  it('gives none for relations that no order joins', () => {
    expect(chainOrder([link('r1', 'a', 'b'), link('r2', 'c', 'd')])).toBeUndefined();
  });
});

describe('pulseLegs', () => {
  it('runs each relation from the end the marker reaches it at', () => {
    expect(pulseLegs([link('r1', 'b', 'a'), link('r2', 'b', 'c'), link('r3', 'd', 'c')])).toEqual([
      { relation: 'r1', forward: false },
      { relation: 'r2', forward: true },
      { relation: 'r3', forward: false },
    ]);
    expect(pulseLegs([link('r1', 'a', 'b')])).toEqual([{ relation: 'r1', forward: true }]);
  });
});

describe('pulseTimes', () => {
  it('gives each relation 600 ms, as many times as it repeats, and 400 ms apart under reduced motion', () => {
    expect(pulseTimes(3, 2, false)).toEqual({ perRelation: 600, total: 3600 });
    expect(pulseTimes(3, 1, true)).toEqual({ perRelation: 400, total: 1200 });
  });
});
