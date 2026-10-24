import { describe, expect, it } from 'vitest';
import {
  EMPTY_SELECTION,
  isEmpty,
  isSelected,
  prune,
  sameSelection,
  selectionOf,
  sizeOf,
  toggle,
  union,
} from './selection';

describe('selection', () => {
  const selection = selectionOf([
    { kind: 'element', id: 'api' },
    { kind: 'relation', id: 'r1' },
    { kind: 'free-shape', id: 'note' },
  ]);

  it('holds elements, relations and free shapes', () => {
    expect(sizeOf(selection)).toBe(3);
    expect(isSelected(selection, { kind: 'element', id: 'api' })).toBe(true);
    expect(isSelected(selection, { kind: 'relation', id: 'api' })).toBe(false);
    expect(isEmpty(EMPTY_SELECTION)).toBe(true);
  });

  it('toggles and joins', () => {
    const toggled = toggle(toggle(selection, { kind: 'element', id: 'api' }), {
      kind: 'element',
      id: 'db',
    });
    expect([...toggled.elements]).toEqual(['db']);
    expect(sizeOf(union(selection, toggled))).toBe(4);
  });

  it('drops what no longer exists, and keeps the same object when nothing goes', () => {
    const exists = {
      element: (id: string) => id !== 'api',
      relation: () => true,
      freeShape: () => true,
    };
    expect([...prune(selection, exists).elements]).toEqual([]);
    const all = { element: () => true, relation: () => true, freeShape: () => true };
    expect(prune(selection, all)).toBe(selection);
    expect(
      sameSelection(
        selection,
        selectionOf([
          ...[{ kind: 'free-shape' as const, id: 'note' }],
          { kind: 'relation', id: 'r1' },
          { kind: 'element', id: 'api' },
        ]),
      ),
    ).toBe(true);
  });
});
