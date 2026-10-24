import { describe, expect, it } from 'vitest';
import { rowStartingWith, shownRows, type TreeItems, type TreeRow } from './tree';

/** A small tree: each item is a path such as "a/b", holding the items listed for it. */
const inside: Record<string, string[]> = {
  a: ['a/b', 'a/c'],
  'a/b': ['a/b/d'],
  'a/c': [],
  'a/b/d': [],
  e: [],
};

const items: TreeItems<string> = {
  top: ['a', 'e'],
  inside: (item) => inside[item] ?? [],
  countInside: (item) => inside[item]?.length ?? 0,
  idOf: (item) => item,
};

const summary = (rows: readonly TreeRow<string>[]) =>
  rows.map((row) => [row.id, row.level, row.position, row.count, row.outer, row.opens, row.open]);

describe('shownRows', () => {
  it('shows the top items, and inside each open item what it holds, depth first', () => {
    const { rows, at } = shownRows(items, () => true);
    expect(summary(rows)).toEqual([
      ['a', 1, 1, 2, undefined, true, true],
      ['a/b', 2, 1, 2, 0, true, true],
      ['a/b/d', 3, 1, 1, 1, false, false],
      ['a/c', 2, 2, 2, 0, false, false],
      ['e', 1, 2, 2, undefined, false, false],
    ]);
    expect(at.get('a/c')).toBe(3);
    expect(at.size).toBe(5);
  });

  it('leaves out what closed items hold, without listing it', () => {
    const listed: string[] = [];
    const watched: TreeItems<string> = {
      ...items,
      inside: (item) => {
        listed.push(item);
        return items.inside(item);
      },
    };
    const { rows } = shownRows(watched, (item) => item !== 'a/b');
    expect(rows.map((row) => row.id)).toEqual(['a', 'a/b', 'a/c', 'e']);
    expect(rows[1]).toMatchObject({ opens: true, open: false });
    expect(listed).toEqual(['a']);
  });
});

describe('rowStartingWith', () => {
  const names = ['Patient', 'Clinic booking', 'Calendar', 'Booking agent', 'Appointments API'];
  const rows = shownRows<string>(
    { top: names, inside: () => [], countInside: () => 0, idOf: (name) => name },
    () => false,
  ).rows;
  const textOf = (row: TreeRow<string>) => row.item;

  it('finds the next row whose text starts with what was typed, ignoring case', () => {
    expect(rowStartingWith(rows, textOf, 0, 'b')).toBe(3);
    expect(rowStartingWith(rows, textOf, 0, 'APP')).toBe(4);
  });

  it('wraps around past the last row', () => {
    expect(rowStartingWith(rows, textOf, 4, 'p')).toBe(0);
  });

  it('goes through the rows that start with a letter typed again and again', () => {
    expect(rowStartingWith(rows, textOf, 0, 'c')).toBe(1);
    expect(rowStartingWith(rows, textOf, 1, 'cc')).toBe(2);
    expect(rowStartingWith(rows, textOf, 2, 'ccc')).toBe(1);
  });

  it('refines the search from the row already found as more letters come', () => {
    expect(rowStartingWith(rows, textOf, 1, 'cl')).toBe(1);
    expect(rowStartingWith(rows, textOf, 1, 'ca')).toBe(2);
  });

  it('finds nothing when no row starts with it', () => {
    expect(rowStartingWith(rows, textOf, 0, 'z')).toBeUndefined();
    expect(rowStartingWith([], textOf, 0, 'a')).toBeUndefined();
  });

  it('starts from the top when no row has focus yet', () => {
    expect(rowStartingWith(rows, textOf, -1, 'p')).toBe(0);
  });
});
