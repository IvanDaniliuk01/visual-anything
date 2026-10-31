import type { Change, ShownProposalChange } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { sampleProposal } from '../test/proposal';
import { carryTicks, initialTicks, neededBy, tickChanges } from './ticks';

const CHANGE: Change = {
  status: 'added',
  ref: { kind: 'element', id: 'x' },
  items: [{ kind: 'element', id: 'x' }],
  differences: [],
};

/** A change by its key, what it needs, and whether the person changed it too. */
function change(key: string, needs: string[] = [], changedByYou = false): ShownProposalChange {
  return { key, change: CHANGE, needs, changedByYou };
}

// A relation that needs its two ends, one of which the person changed too.
const END_A = change('element:a added');
const END_B = change('element:b added', [], true);
const RELATION = change('relation:r added', ['element:a added', 'element:b added']);
const RENAME = change('element:c changed');
const CHANGES = [END_A, END_B, RELATION, RENAME];

describe('the first ticks', () => {
  it('tick every change but those the person changed too, and what needs them', () => {
    expect([...initialTicks(CHANGES)].sort()).toEqual(['element:a added', 'element:c changed']);
  });

  it('tick every change of the sample’s proposal, which the person did not touch', () => {
    const { shown } = sampleProposal();
    expect(initialTicks(shown.changes).size).toBe(shown.changes.length);
    // The relation Claude adds needs the element it starts from.
    const relation = shown.changes.find((each) => each.key.startsWith('relation:sms-to-whatsapp'));
    expect(relation?.needs).toContain('element:sms added');
  });
});

describe('ticking', () => {
  it('ticks what a change needs, and says which it ticked besides', () => {
    const ticked = initialTicks(CHANGES);
    const { ticked: next, also } = tickChanges(CHANGES, ticked, ['relation:r added'], true);
    expect(next.has('relation:r added')).toBe(true);
    expect(next.has('element:b added')).toBe(true);
    // The other end was ticked already: only what turned is said.
    expect(also).toEqual(['element:b added']);
  });

  it('unticks what needs a change unticked', () => {
    const ticked = new Set(CHANGES.map((each) => each.key));
    const { ticked: next, also } = tickChanges(CHANGES, ticked, ['element:a added'], false);
    expect(next.has('element:a added')).toBe(false);
    expect(next.has('relation:r added')).toBe(false);
    expect(next.has('element:b added')).toBe(true);
    expect(also).toEqual(['relation:r added']);
  });

  it('ignores keys the proposal does not hold', () => {
    const ticked = initialTicks(CHANGES);
    expect(tickChanges(CHANGES, ticked, ['element:z added'], true)).toEqual({ ticked, also: [] });
  });

  it('always leaves the ticked changes holding what they need', () => {
    let ticked = initialTicks(CHANGES);
    for (const [key, on] of [
      ['relation:r added', true],
      ['element:b added', false],
      ['element:c changed', false],
      ['relation:r added', true],
      ['element:a added', false],
    ] as const) {
      ticked = tickChanges(CHANGES, ticked, [key], on).ticked;
      for (const each of CHANGES) {
        if (ticked.has(each.key))
          for (const need of each.needs) expect(ticked.has(need)).toBe(true);
      }
    }
  });
});

describe('the proposal shown anew', () => {
  it('keeps the person’s ticks, and ticks the new changes as at first', () => {
    const before = [END_A, RENAME];
    const ticked = new Set(['element:a added']);
    const now = [END_A, RENAME, change('element:d added'), change('element:e changed', [], true)];
    expect([...carryTicks(before, ticked, now)].sort()).toEqual([
      'element:a added',
      'element:d added',
    ]);
  });

  it('unticks a new change that needs one the person left unticked', () => {
    const before = [END_A];
    const ticked = new Set<string>();
    const now = [END_A, change('relation:s added', ['element:a added'])];
    expect(carryTicks(before, ticked, now).size).toBe(0);
  });
});

describe('what needs a change', () => {
  it('lists the changes that name it among what they need', () => {
    expect(neededBy(CHANGES, 'element:a added')).toEqual(['relation:r added']);
    expect(neededBy(CHANGES, 'element:c changed')).toEqual([]);
  });
});
