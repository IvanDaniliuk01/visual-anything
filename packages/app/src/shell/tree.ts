/**
 * Trees of rows, as the outline and the model panel show them: which rows show, given which ones are
 * open, and finding a row by the text it starts with. Pure, so that the tree component stays thin.
 */

/** Items arranged in a tree: the items at the top, and the items inside each one. */
export interface TreeItems<T> {
  readonly top: readonly T[];
  /** The items inside an item, in order. */
  inside(item: T): readonly T[];
  /** How many items sit inside an item; cheaper than listing them, for the rows that stay closed. */
  countInside(item: T): number;
  /** Identifies an item among every item of the tree. */
  idOf(item: T): string;
}

/** A row the tree shows. */
export interface TreeRow<T> {
  readonly id: string;
  readonly item: T;
  /** How deep the row sits: 1 at the top. */
  readonly level: number;
  /** Where the row is among the rows beside it, from 1, and how many of them there are. */
  readonly position: number;
  readonly count: number;
  /** Where the row that holds this one is among the rows shown; absent at the top. */
  readonly outer: number | undefined;
  /** Whether items sit inside it, and whether they show. */
  readonly opens: boolean;
  readonly open: boolean;
}

/** The rows a tree shows, in order, and where each one is. */
export interface ShownRows<T> {
  readonly rows: readonly TreeRow<T>[];
  /** Where each row is in `rows`, by id. */
  readonly at: ReadonlyMap<string, number>;
}

/**
 * The rows that show: the top items, and inside each open item the items it holds, depth first. Only
 * the open items are asked what they hold.
 */
export function shownRows<T>(
  items: TreeItems<T>,
  isOpen: (item: T, id: string) => boolean,
): ShownRows<T> {
  const rows: TreeRow<T>[] = [];
  const at = new Map<string, number>();
  const add = (list: readonly T[], level: number, outer: number | undefined): void => {
    list.forEach((item, index) => {
      const id = items.idOf(item);
      const opens = items.countInside(item) > 0;
      const open = opens && isOpen(item, id);
      const here = rows.length;
      at.set(id, here);
      rows.push({ id, item, level, position: index + 1, count: list.length, outer, opens, open });
      if (open) add(items.inside(item), level + 1, here);
    });
  };
  add(items.top, 1, undefined);
  return { rows, at };
}

/**
 * The ids of the rows around a row whose id is a path of ids joined by `/`, as the keys of shapes are:
 * "a/b/c" sits inside "a/b", inside "a". Outermost first.
 */
export function outerIdsOf(path: string): string[] {
  const parts = path.split('/');
  return parts.slice(0, -1).map((_, at) => parts.slice(0, at + 1).join('/'));
}

/**
 * The row to go to for what was typed: the first row after `from`, wrapping around, whose text starts
 * with it, ignoring case. Typing one letter again and again goes through the rows that start with it;
 * more letters refine the search from the row already found. `from` is -1 when no row has focus.
 */
export function rowStartingWith<T>(
  rows: readonly TreeRow<T>[],
  textOf: (row: TreeRow<T>) => string,
  from: number,
  typed: string,
): number | undefined {
  const lower = typed.toLocaleLowerCase();
  const first = lower.charAt(0);
  if (rows.length === 0 || first === '') return undefined;
  const repeated = [...lower].every((letter) => letter === first);
  const prefix = repeated ? first : lower;
  const start = repeated ? from + 1 : Math.max(0, from);
  for (let step = 0; step < rows.length; step++) {
    const index = (start + step) % rows.length;
    const row = rows[index] as TreeRow<T>;
    if (textOf(row).toLocaleLowerCase().startsWith(prefix)) return index;
  }
  return undefined;
}
