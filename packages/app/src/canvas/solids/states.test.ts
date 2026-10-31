/**
 * The table of a drawing's part states (ADR 0075): one entry for each named part, worked out from the
 * element each part stands for and from the parts holding it, so that selecting the heart marks its
 * chambers too, and laid out as the parts' shader reads it.
 */
import fc from 'fast-check';
import type { SolidPart } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { DIMMED_ALPHA } from '../colors';
import {
  PART_MARK,
  STATE_TABLE_WIDTH,
  entryOffset,
  partStatesOf,
  sameTable,
  type PartElementState,
} from './states';

/** A heart (0) holding two chambers (1, 2), the second holding a valve (3), and a vessel (4) apart. */
const HEART: SolidPart[] = [
  { name: 'heart' },
  { name: 'left', parent: 0 },
  { name: 'right', parent: 0 },
  { name: 'valve', parent: 2 },
  { name: 'vessel' },
];

function states(elements: [number, PartElementState][], faint = false) {
  return partStatesOf(HEART, new Map(elements), faint);
}

function bytesOf(table: Uint8Array, value: number) {
  const at = entryOffset(value);
  const veil = at + STATE_TABLE_WIDTH * 4;
  return {
    fill: [...table.slice(at, at + 4)],
    veil: table[veil] ?? 0,
    bits: table[veil + 1] ?? 0,
  };
}

describe('the state table of a drawing’s parts', () => {
  it('has an entry for each part and one for where none is drawn, and nothing in them by default', () => {
    const table = states([]);
    expect(table.parts).toHaveLength(5);
    expect(table.width).toBe(STATE_TABLE_WIDTH);
    expect(table.height).toBe(2);
    expect(table.any).toBe(false);
    expect(table.hidden).toEqual([]);
    for (let value = 0; value <= 5; value++) {
      expect(bytesOf(table.table, value)).toEqual({ fill: [0, 0, 0, 0], veil: 0, bits: 0 });
    }
  });

  it('marks the parts inside a selected, hovered or highlighted one, and no others', () => {
    const table = states([
      [0, { selected: true }],
      [4, { hovered: true }],
      [3, { highlighted: true }],
    ]);
    expect(table.parts.map((part) => part.selected)).toEqual([true, true, true, true, false]);
    expect(table.parts.map((part) => part.hovered)).toEqual([false, false, false, false, true]);
    expect(table.parts.map((part) => part.highlighted)).toEqual([false, false, false, true, false]);
    // Entry v is the part buffer's value: the part's index plus one.
    expect(bytesOf(table.table, 1).bits).toBe(PART_MARK.selected);
    expect(bytesOf(table.table, 4).bits).toBe(PART_MARK.selected | PART_MARK.highlighted);
    expect(bytesOf(table.table, 5).bits).toBe(PART_MARK.hovered);
    expect(bytesOf(table.table, 0).bits).toBe(0);
    expect(table.any).toBe(true);
  });

  it('veils a faint part, and the parts it holds that stand for no element of their own', () => {
    const table = states([
      [2, { faint: true }],
      [3, {}],
    ]);
    const veil = Math.round(255 * (1 - DIMMED_ALPHA));
    expect(bytesOf(table.table, 3).veil).toBe(veil);
    // The valve stands for an element of its own, drawn at full strength.
    expect(bytesOf(table.table, 4).veil).toBe(0);
    expect(bytesOf(table.table, 1).veil).toBe(0);
  });

  it('veils every part of a faint drawing but those whose elements are at full strength', () => {
    const table = states([[1, { faint: false }]], true);
    const veil = Math.round(255 * (1 - DIMMED_ALPHA));
    expect(bytesOf(table.table, 1).veil).toBe(veil);
    expect(bytesOf(table.table, 2).veil).toBe(0);
    expect(bytesOf(table.table, 3).veil).toBe(veil);
    expect(bytesOf(table.table, 5).veil).toBe(veil);
  });

  it('lays an overlay’s fill, faint as its part, and its opacity as a veil', () => {
    const table = states([
      [0, { fill: '#FF8000' }],
      [4, { fill: '#0080FF', faint: true, opacity: 0.5 }],
    ]);
    expect(bytesOf(table.table, 1).fill).toEqual([255, 128, 0, 255]);
    // The chambers take the heart's fill.
    expect(bytesOf(table.table, 3).fill).toEqual([255, 128, 0, 255]);
    expect(bytesOf(table.table, 5).fill).toEqual([0, 128, 255, Math.round(255 * DIMMED_ALPHA)]);
    expect(bytesOf(table.table, 5).veil).toBe(Math.round(255 * (1 - DIMMED_ALPHA * 0.5)));
  });

  it('lists the parts a filter hides, with the parts they hold, and marks none of them', () => {
    const table = states([
      [2, { hidden: true, selected: true }],
      [4, {}],
    ]);
    expect(table.hidden).toEqual([2, 3]);
    expect(bytesOf(table.table, 3).bits).toBe(PART_MARK.selected | PART_MARK.hidden);
  });

  it('lays out more parts than a row holds in bands of two rows', () => {
    const parts: SolidPart[] = Array.from({ length: 600 }, (_, at) => ({ name: `p${at}` }));
    const table = partStatesOf(parts, new Map([[599, { selected: true }]]));
    expect(table.height).toBe(2 * Math.ceil(601 / STATE_TABLE_WIDTH));
    expect(table.table).toHaveLength(STATE_TABLE_WIDTH * table.height * 4);
    expect(bytesOf(table.table, 600).bits).toBe(PART_MARK.selected);
    expect(entryOffset(600)).toBe((2 * 2 * STATE_TABLE_WIDTH + (600 % STATE_TABLE_WIDTH)) * 4);
  });

  it('says whether two tables hold the same bytes', () => {
    expect(sameTable(states([]), states([]))).toBe(true);
    expect(sameTable(states([]), states([[0, { selected: true }]]))).toBe(false);
    expect(sameTable(undefined, states([]))).toBe(false);
  });

  it('marks a part exactly when it or a part holding it is marked (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -1, max: 30 }), { minLength: 1, maxLength: 30 }),
        fc.array(fc.integer({ min: 0, max: 29 }), { maxLength: 5 }),
        (parents, selected) => {
          const parts: SolidPart[] = parents.map((parent, at) =>
            parent >= 0 && parent < at ? { name: `p${at}`, parent } : { name: `p${at}` },
          );
          const elements = new Map<number, PartElementState>(
            selected.filter((at) => at < parts.length).map((at) => [at, { selected: true }]),
          );
          const table = partStatesOf(parts, elements);
          parts.forEach((part, at) => {
            let marked = false;
            for (let up: number | undefined = at; up !== undefined; up = parts[up]?.parent) {
              if (elements.get(up)?.selected) marked = true;
            }
            expect(table.parts[at]?.selected).toBe(marked);
            expect((bytesOf(table.table, at + 1).bits & PART_MARK.selected) !== 0).toBe(marked);
            void part;
          });
        },
      ),
    );
  });
});
