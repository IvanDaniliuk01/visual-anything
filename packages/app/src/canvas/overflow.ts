/**
 * What of the canvas toolbar goes under More (W26): the toolbar keeps one row, and when its row has no
 * room for everything, groups of controls go under the More menu, one at a time in a fixed order,
 * until the row fits; as the row gets wider, they come back in the reverse order. Adding elements and
 * zooming always stay in the row.
 */

/** The groups that go under More, the first to go first. */
export const OVERFLOW_ORDER = [
  'grid',
  'stacking',
  'layout',
  'shapes',
  'explore',
  'space',
  'fit',
] as const;

/** A group of the canvas toolbar that can go under More. */
export type OverflowGroup = (typeof OVERFLOW_ORDER)[number];

/** The groups under More, in the order the toolbar shows them, which More keeps. */
export const MORE_ORDER: readonly OverflowGroup[] = [
  'shapes',
  'stacking',
  'explore',
  'layout',
  'grid',
  'space',
  'fit',
];

/** The groups under More when `count` of them are. */
export function groupsUnder(count: number): ReadonlySet<OverflowGroup> {
  return new Set(OVERFLOW_ORDER.slice(0, count));
}

/**
 * How many groups are under More, step by step: told after each layout whether the row wraps and how
 * wide it is, it puts one more group under More while the row wraps, and brings the last one back once
 * the row is wider than when that one went. It never puts more under More than there are, and settles
 * on the fewest groups that let the row fit.
 */
export class OverflowPlan {
  #under = 0;
  /** The row's width when each group went under More, by its place in the order. */
  readonly #wentAt: number[] = [];

  constructor(private readonly groups: number = OVERFLOW_ORDER.length) {}

  /** How many groups are under More now. */
  get under(): number {
    return this.#under;
  }

  /** The next step, after a layout of the row: returns how many groups are under More then. */
  next(wraps: boolean, width: number): number {
    if (wraps) {
      if (this.#under < this.groups) {
        this.#wentAt[this.#under] = width;
        this.#under += 1;
      }
    } else if (this.#under > 0 && width > (this.#wentAt[this.#under - 1] ?? Infinity)) {
      this.#under -= 1;
    }
    return this.#under;
  }
}

/** Whether a row of items went onto more than one line: an item starts below where another ends. */
export function isWrapped(boxes: readonly Pick<DOMRect, 'top' | 'bottom' | 'width'>[]): boolean {
  const shown = boxes.filter((box) => box.width > 0);
  if (shown.length === 0) return false;
  const firstLineEnd = Math.min(...shown.map((box) => box.bottom));
  return shown.some((box) => box.top >= firstLineEnd - 0.5);
}
