import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MAX_PULSE_RELATIONS,
  chainBreak,
  chainOrder,
  pulseLegs,
  pulseTimes,
  type ChainLink,
} from './pulse';

const link = (id: string, from: string, to: string): ChainLink => ({ id, from, to });
const node = fc.constantFrom('a', 'b', 'c', 'd', 'e');
const anyLinks = (maxLength: number) =>
  fc
    .array(fc.tuple(node, node), { minLength: 1, maxLength })
    .map((ends) => ends.map(([from, to], at) => link(`r${at}`, from, to)));

/**
 * The oracle: links in this order join when some way of running each, forward or back, starts every
 * one where the one before ended. Tried over every way, so it holds only for short lists.
 */
function joinsSomeWay(links: readonly ChainLink[]): boolean {
  for (let ways = 0; ways < 1 << links.length; ways++) {
    let at: string | undefined;
    let joins = true;
    links.forEach((each, index) => {
      const forward = (ways & (1 << index)) === 0;
      const [start, end] = forward ? [each.from, each.to] : [each.to, each.from];
      if (at !== undefined && at !== start) joins = false;
      at = end;
    });
    if (joins) return true;
  }
  return false;
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, at) =>
    permutations([...items.slice(0, at), ...items.slice(at + 1)]).map((rest) => [item, ...rest]),
  );
}

describe('chainBreak', () => {
  it('accepts a chain whose relations each start where the one before ends, either way round', () => {
    expect(chainBreak([link('r1', 'finding', 'case'), link('r2', 'case', 'subject')])).toBe(-1);
    expect(chainBreak([link('r1', 'finding', 'case'), link('r2', 'subject', 'case')])).toBe(-1);
    expect(chainBreak([link('r1', 'case', 'finding'), link('r2', 'case', 'subject')])).toBe(-1);
    expect(chainBreak([link('r1', 'a', 'b')])).toBe(-1);
  });

  it('says the first relation that does not go on from the one before', () => {
    expect(chainBreak([link('r1', 'a', 'b'), link('r2', 'b', 'c'), link('r3', 'x', 'y')])).toBe(2);
  });

  it('refuses a star of more than two relations: the marker would leap back to its middle', () => {
    expect(chainBreak([link('r1', 'a', 'b'), link('r2', 'a', 'c')])).toBe(-1);
    expect(chainBreak([link('r1', 'a', 'b'), link('r2', 'a', 'c'), link('r3', 'a', 'd')])).toBe(2);
  });

  it('accepts exactly the joined chains', () => {
    // A chain built link by link from the end the marker reached is joined.
    const joined = fc
      .tuple(node, node, fc.array(fc.tuple(node, fc.boolean()), { maxLength: 11 }))
      .map(([from, to, rest]) => {
        const links = [link('r0', from, to)];
        let at = to;
        for (const [other, flip] of rest) {
          links.push(link(`r${links.length}`, flip ? other : at, flip ? at : other));
          at = other;
        }
        return links;
      });
    fc.assert(fc.property(joined, (links) => chainBreak(links) === -1));
    // Any list of links: accepted exactly when some way of running them joins, and refused at the
    // first relation past the longest start that joins.
    fc.assert(
      fc.property(anyLinks(8), (links) => {
        const broken = chainBreak(links);
        expect(broken === -1).toBe(joinsSomeWay(links));
        if (broken !== -1) {
          expect(broken).toBeGreaterThan(0);
          expect(joinsSomeWay(links.slice(0, broken))).toBe(true);
          expect(joinsSomeWay(links.slice(0, broken + 1))).toBe(false);
        }
      }),
      { numRuns: 300 },
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
    // A star of three: four ends meet an odd number of its relations.
    expect(
      chainOrder([link('r1', 'a', 'b'), link('r2', 'a', 'c'), link('r3', 'a', 'd')]),
    ).toBeUndefined();
  });

  it('orders a chain that passes an element twice, and one that comes back to its start', () => {
    // A loop a-b-c-d-a, given in an order the marker cannot run.
    const loop = [
      link('r1', 'a', 'b'),
      link('r3', 'c', 'd'),
      link('r2', 'b', 'c'),
      link('r4', 'd', 'a'),
    ];
    expect(chainBreak(loop)).toBe(1);
    const looped = chainOrder(loop)!;
    expect(new Set(looped)).toEqual(new Set(['r1', 'r2', 'r3', 'r4']));
    const byId = new Map(loop.map((each) => [each.id, each]));
    expect(chainBreak(looped.map((id) => byId.get(id)!))).toBe(-1);
    // A figure of eight through "a": a-b-c-a then a-d-e-a.
    const eight = [
      link('r1', 'a', 'b'),
      link('r4', 'a', 'd'),
      link('r2', 'b', 'c'),
      link('r5', 'd', 'e'),
      link('r3', 'c', 'a'),
      link('r6', 'e', 'a'),
    ];
    const ordered = chainOrder(eight)!;
    const eightById = new Map(eight.map((each) => [each.id, each]));
    expect(chainBreak(ordered.map((id) => eightById.get(id)!))).toBe(-1);
  });

  it('orders exactly the relations some order joins, each once', () => {
    fc.assert(
      fc.property(anyLinks(6), (links) => {
        const order = chainOrder(links);
        const some = permutations(links).some((each) => joinsSomeWay(each));
        expect(order !== undefined).toBe(some);
        if (order === undefined) return;
        expect([...order].sort()).toEqual(links.map((each) => each.id).sort());
        const byId = new Map(links.map((each) => [each.id, each]));
        expect(chainBreak(order.map((id) => byId.get(id)!))).toBe(-1);
      }),
      { numRuns: 200 },
    );
  });

  it(`answers within 5 ms for ${MAX_PULSE_RELATIONS} relations, however they are given`, () => {
    const path = Array.from({ length: MAX_PULSE_RELATIONS }, (_, at) =>
      link(`r${at}`, `n${at}`, `n${at + 1}`),
    );
    // The orders the search by trial took longest on: a path given backwards and shuffled, one that
    // almost joins but for its last relation, and a star.
    const worst = [
      [...path].reverse(),
      path.map((_, at) => path[(at * 5) % MAX_PULSE_RELATIONS]!),
      [...path.slice(0, -1), link('r11', 'x', 'y')].reverse(),
      [...path.slice(1), link('r0', 'n1', 'n9')],
      Array.from({ length: MAX_PULSE_RELATIONS }, (_, at) => link(`r${at}`, 'hub', `n${at}`)),
    ];
    for (const links of worst) chainOrder(links);
    for (const links of worst) {
      const started = performance.now();
      chainOrder(links);
      expect(performance.now() - started).toBeLessThan(5);
    }
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

  it('runs every relation of a joined chain from where the one before ended', () => {
    fc.assert(
      fc.property(anyLinks(8), (links) => {
        if (chainBreak(links) !== -1) return;
        let at: string | undefined;
        pulseLegs(links).forEach((leg, index) => {
          const each = links[index]!;
          const [start, end] = leg.forward ? [each.from, each.to] : [each.to, each.from];
          if (at !== undefined) expect(start).toBe(at);
          at = end;
        });
      }),
      { numRuns: 300 },
    );
  });
});

describe('pulseTimes', () => {
  it('gives each relation 600 ms, as many times as it repeats, and 400 ms apart under reduced motion', () => {
    expect(pulseTimes(3, 2, false)).toEqual({ perRelation: 600, total: 3600 });
    expect(pulseTimes(3, 1, true)).toEqual({ perRelation: 400, total: 1200 });
  });
});
