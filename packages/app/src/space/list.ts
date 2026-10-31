/**
 * The physical-space panel's list (ADR 0076): what it shows as a tree, by what each is posed or
 * anchored in, the element the panel shows at the top; the containers drawn faintly because the view
 * does not show them stand where they hold what it does. Pure, so that the list component stays thin.
 */
import type { Space, SpaceHow } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { TreeItems } from '../shell/tree';

/** A row of the list: an element in the space, how it is there, and what holds it. */
export interface SpaceListItem {
  readonly element: Id;
  /** How it is there, or `faint` for a container the view does not show. */
  readonly how: SpaceHow | 'faint';
  readonly in?: Id;
}

/** The space as the list's tree. */
export function spaceListOf(
  space: Pick<Space, 'root' | 'entries' | 'faint'>,
): TreeItems<SpaceListItem> {
  const items = new Map<Id, SpaceListItem>();
  for (const entry of space.entries.values()) {
    items.set(entry.element, {
      element: entry.element,
      how: entry.how,
      ...(entry.in === undefined ? {} : { in: entry.in }),
    });
  }
  for (const entry of space.faint.values()) {
    if (items.has(entry.element)) continue;
    items.set(entry.element, {
      element: entry.element,
      how: 'faint',
      ...(entry.in === undefined ? {} : { in: entry.in }),
    });
  }
  const inside = new Map<Id, SpaceListItem[]>();
  const top: SpaceListItem[] = [];
  // In the order they were reached, the faint ones before what they hold.
  const ordered = orderedItems(space, items);
  for (const item of ordered) {
    const holder = item.in;
    if (item.element === space.root || holder === undefined || !items.has(holder)) {
      top.push(item);
      continue;
    }
    const list = inside.get(holder) ?? [];
    list.push(item);
    inside.set(holder, list);
  }
  return {
    top,
    inside: (item) => inside.get(item.element) ?? [],
    countInside: (item) => inside.get(item.element)?.length ?? 0,
    idOf: (item) => item.element,
  };
}

function orderedItems(
  space: Pick<Space, 'root' | 'entries' | 'faint'>,
  items: ReadonlyMap<Id, SpaceListItem>,
): SpaceListItem[] {
  const root = items.get(space.root);
  const rest = [...items.values()].filter((item) => item.element !== space.root);
  return root ? [root, ...rest] : rest;
}

/** The ids of the rows that hold an element's row, outermost first. */
export function holdersOf(items: TreeItems<SpaceListItem>, element: Id): Id[] {
  const holderOf = new Map<Id, Id>();
  const walk = (list: readonly SpaceListItem[]) => {
    for (const item of list) {
      for (const each of items.inside(item)) holderOf.set(each.element, item.element);
      walk(items.inside(item));
    }
  };
  walk(items.top);
  const holders: Id[] = [];
  const seen = new Set<Id>([element]);
  let holder = holderOf.get(element);
  while (holder !== undefined && !seen.has(holder)) {
    holders.unshift(holder);
    seen.add(holder);
    holder = holderOf.get(holder);
  }
  return holders;
}
