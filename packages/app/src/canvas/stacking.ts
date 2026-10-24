/**
 * Changing the stacking order from the canvas: which key presses ask for it, and the `restack`
 * command a press, a toolbar button or a menu item sends, with what it says when it works and why
 * nothing changes when it does not. "Forward" and "backward" are worked out here, as the next shape
 * beside the selected one that overlaps it, so the core's command needs no geometry.
 *
 * It only reads the shapes beside each selected shape, through its container's contents index, and
 * never what is inside the selected shapes, so selecting a container that holds thousands stays cheap.
 */
import type { ProjectSnapshot, RestackCommand, StackingPlace } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { Selection } from '../editor/selection';
import { IS_APPLE } from '../live/platform';
import type { ShortcutKeys } from '../live/shortcuts';
import type { Rect } from './geometry';
import { outlying, overlapWithContents, type IndexedScene } from './hit';
import type { ElementShape } from './scene';
import { overlaps, within } from './spatial';

/** A change of stacking order the canvas offers. */
export type StackingMove = 'front' | 'forward' | 'backward' | 'back';

/** The moves, in the order the toolbar and the shape menu show them. */
export const STACKING_MOVES: readonly StackingMove[] = ['front', 'forward', 'backward', 'back'];

/** What each move is called. */
export const STACKING_NAMES: Readonly<Record<StackingMove, string>> = {
  front: 'Bring to front',
  forward: 'Bring forward',
  backward: 'Send backward',
  back: 'Send to back',
};

/**
 * The keys of each move: as shown in tooltips, which lead with the arrow keys since they are the same
 * key on every keyboard, and for `aria-keyshortcuts`.
 */
export const STACKING_KEYS: Readonly<Record<StackingMove, { shown: string; keys: string }>> = {
  front: {
    shown: IS_APPLE ? '⌘⇧↑' : 'Ctrl+Shift+↑',
    keys: 'Control+Shift+ArrowUp Meta+Shift+ArrowUp Control+} Alt+Meta+]',
  },
  forward: {
    shown: IS_APPLE ? '⌘↑' : 'Ctrl+↑',
    keys: 'Control+ArrowUp Meta+ArrowUp Control+] Meta+]',
  },
  backward: {
    shown: IS_APPLE ? '⌘↓' : 'Ctrl+↓',
    keys: 'Control+ArrowDown Meta+ArrowDown Control+[ Meta+[',
  },
  back: {
    shown: IS_APPLE ? '⌘⇧↓' : 'Ctrl+Shift+↓',
    keys: 'Control+Shift+ArrowDown Meta+Shift+ArrowDown Control+{ Alt+Meta+[',
  },
};

/** Whether a move would change anything, and what it would do, or why it would not. */
export interface StackingAction {
  enabled: boolean;
  description: string;
}

/** What a move sends, and what to say: once it is done, or why nothing changes. */
export interface Restack {
  command?: RestackCommand;
  /** Why nothing changes; present exactly when there is no command. */
  reason?: string;
  /** What to say once the command is done. */
  done?: string;
}

/** Above this many selected shapes, the moves are worked out only when one is asked for. */
export const EAGER_LIMIT = 50;

const SELECT_SHAPES =
  'Select shapes of elements to change their stacking order. Relations, notes and arrows are always drawn in front of them.';
const NOT_EDITABLE = 'The project cannot be changed now.';

/** What each move does to a selection of several shapes. */
const OF_THE_SELECTION: Readonly<Record<StackingMove, string>> = {
  front: 'Bring the selection to the front',
  forward: 'Bring the selection forward',
  backward: 'Send the selection backward',
  back: 'Send the selection to the back',
};

/**
 * The stacking move a key press asks for, if any. Ctrl or ⌘ with ↑ and ↓ bring forward and send
 * backward, and with Shift to the front and the back, on every keyboard; Ctrl or ⌘ with the character
 * `]`, `[`, `}` or `{` do the same wherever a layout types it, and ⌥⌘ with the bracket keys on macOS
 * bring to the front and send to the back. AltGr, which types the brackets on many layouts and is then
 * the relations' key, other presses with Alt, and ⌘⇧, which switches tabs, are left alone.
 */
export function stackingShortcut(
  keys: ShortcutKeys & { altGraph: boolean },
): StackingMove | undefined {
  if (!(keys.ctrlKey || keys.metaKey)) return undefined;
  // Windows reports AltGr as Ctrl+Alt, so Ctrl+[ cannot be told from AltGr+[ but by AltGraph.
  if (keys.altGraph) return undefined;
  if ((keys.key === 'ArrowUp' || keys.key === 'ArrowDown') && !keys.altKey) {
    const up = keys.key === 'ArrowUp';
    if (keys.shiftKey) return up ? 'front' : 'back';
    return up ? 'forward' : 'backward';
  }
  // On macOS, Option changes the character typed, so ⌥⌘ is read by the key.
  if (keys.metaKey && keys.altKey && !keys.shiftKey) {
    if (keys.code === 'BracketRight') return 'front';
    if (keys.code === 'BracketLeft') return 'back';
  }
  if (keys.altKey) return undefined;
  if (keys.metaKey && keys.shiftKey) return undefined;
  return BY_CHARACTER.get(characterOf(keys));
}

const BY_CHARACTER: ReadonlyMap<string, StackingMove> = new Map([
  [']', 'forward'],
  ['[', 'backward'],
  ['}', 'front'],
  ['{', 'back'],
]);

/**
 * The character a key types: the key itself, but by its place for a letter of a non-Latin layout,
 * such as Russian or Greek, which types no bracket there. Latin layouts are never read by place: on
 * Spanish keyboards the key US ones type `]` with types `+`, and Ctrl and + must stay the zoom.
 */
function characterOf({ key, code, shiftKey }: ShortcutKeys): string {
  if (!/^\p{L}$/u.test(key) || /\p{Script=Latin}/u.test(key)) return key;
  if (code === 'BracketRight') return shiftKey ? '}' : ']';
  if (code === 'BracketLeft') return shiftKey ? '{' : '[';
  return key;
}

/**
 * The restack a move of the selection's shapes sends, or why it changes nothing. Every shape of every
 * selected element moves, once for each container it sits in: copies of a container share the order.
 */
export function restackCommand(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  viewId: Id,
  selection: Selection,
  move: StackingMove,
  editable = true,
): Restack {
  if (!editable || !project.views.some((view) => view.id === viewId)) {
    return { reason: NOT_EDITABLE };
  }
  const shapes = stackedShapes(indexed, selection);
  if (shapes.length === 0) return { reason: SELECT_SHAPES };
  const { restack } = outcomeOf(planOf(indexed, selection, shapes), viewId, move);
  return restack;
}

/**
 * The four moves for the selection: whether each would change anything, and what it would do or why
 * it would not. For more than EAGER_LIMIT shapes, every move is offered and worked out on the press.
 */
export function stackingActions(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  viewId: Id,
  selection: Selection,
  editable = true,
): Record<StackingMove, StackingAction> {
  const all = (action: (move: StackingMove) => StackingAction) =>
    Object.fromEntries(STACKING_MOVES.map((move) => [move, action(move)])) as Record<
      StackingMove,
      StackingAction
    >;
  if (!editable || !project.views.some((view) => view.id === viewId)) {
    return all(() => ({ enabled: false, description: NOT_EDITABLE }));
  }
  const counted = countShapes(indexed, selection, EAGER_LIMIT + 1);
  if (counted === 0) return all(() => ({ enabled: false, description: SELECT_SHAPES }));
  if (counted > EAGER_LIMIT) {
    return all((move) => ({ enabled: true, description: withKeys(OF_THE_SELECTION[move], move) }));
  }
  const plan = planOf(indexed, selection, stackedShapes(indexed, selection));
  return all((move) => {
    const { restack, description } = outcomeOf(plan, viewId, move);
    return restack.command
      ? { enabled: true, description }
      : { enabled: false, description: restack.reason ?? '' };
  });
}

/**
 * Whether a shape, with what sticks out of it, covers some of a rectangle: the rule of overlap that
 * the drawing order follows.
 */
export function coversRect(indexed: IndexedScene, shape: ElementShape, rect: Rect): boolean {
  return (
    overlaps(shape.rect, rect) || outlying(indexed, shape).some((one) => overlaps(one.rect, rect))
  );
}

/** A shape's place in the drawing order. */
export function drawingRank(indexed: IndexedScene, shape: ElementShape): number {
  const at = indexed.indexOfKey.get(shape.key);
  return at === undefined ? -1 : (indexed.rankOf[at] as number);
}

/** A shape to restack, and the shapes beside it that it overlaps. */
interface Stacked {
  shape: ElementShape;
  rank: number;
  /** The key of the container shape it sits in; '' directly in World. */
  holder: string;
  /** The shapes beside it that overlap it, with what is inside them, back to front. */
  overlapping: { shape: ElementShape; rank: number }[];
}

/** What the four moves are worked out from, once per selection. */
interface Plan {
  indexed: IndexedScene;
  selected: ReadonlySet<Id>;
  shapes: Stacked[];
}

/**
 * The shapes of the selected elements, once for each element and container: through the first copy
 * of the container, since every copy has the same contents, drawn in the same order.
 */
function stackedShapes(indexed: IndexedScene, selection: Selection): ElementShape[] {
  const shapes: ElementShape[] = [];
  for (const id of selection.elements) {
    for (const shape of indexed.byElement.get(id) ?? []) {
      if (shape.container !== undefined) {
        const first = indexed.byElement.get(shape.container)?.[0];
        if (first && shape.containerShape !== first.key) continue;
      }
      shapes.push(shape);
    }
  }
  return shapes;
}

/** How many shapes the selected elements have, counting up to `most`. */
function countShapes(indexed: IndexedScene, selection: Selection, most: number): number {
  let counted = 0;
  for (const id of selection.elements) {
    counted += indexed.byElement.get(id)?.length ?? 0;
    if (counted >= most) return counted;
  }
  return counted;
}

function planOf(
  indexed: IndexedScene,
  selection: Selection,
  shapes: readonly ElementShape[],
): Plan {
  return {
    indexed,
    selected: selection.elements,
    shapes: shapes.map((shape) => {
      const holder = shape.containerShape ?? '';
      const overlapping = indexed
        .contentsIndex(holder)
        .query(shape.extent)
        .filter((other) => other.key !== shape.key && overlapWithContents(indexed, shape, other))
        .map((other) => ({ shape: other, rank: drawingRank(indexed, other) }))
        .sort((a, b) => a.rank - b.rank);
      return { shape, rank: drawingRank(indexed, shape), holder, overlapping };
    }),
  };
}

/** One move of the command, with the shape it goes in front of or behind. */
interface PlannedMove {
  stacked: Stacked;
  to: StackingPlace;
  past?: ElementShape;
}

function movesOf(plan: Plan, move: StackingMove): PlannedMove[] {
  const unselected = (other: { shape: ElementShape }) => !plan.selected.has(other.shape.element);
  const above = (stacked: Stacked) =>
    stacked.overlapping.filter((other) => other.rank > stacked.rank && unselected(other));
  const below = (stacked: Stacked) =>
    stacked.overlapping.filter((other) => other.rank < stacked.rank && unselected(other));
  const ascending = [...plan.shapes].sort((a, b) => a.rank - b.rank);
  const descending = [...ascending].reverse();
  switch (move) {
    case 'forward':
      return descending.flatMap((stacked) => {
        const past = above(stacked)[0]?.shape;
        return past ? [{ stacked, to: { inFrontOf: past.element }, past }] : [];
      });
    case 'backward':
      return ascending.flatMap((stacked) => {
        const past = below(stacked).at(-1)?.shape;
        return past ? [{ stacked, to: { behind: past.element }, past }] : [];
      });
    case 'front': {
      const holders = new Set(
        plan.shapes.filter((stacked) => above(stacked).length > 0).map((each) => each.holder),
      );
      return ascending
        .filter((stacked) => holders.has(stacked.holder))
        .map((stacked) => ({ stacked, to: 'front' as const }));
    }
    case 'back': {
      const holders = new Set(
        plan.shapes.filter((stacked) => below(stacked).length > 0).map((each) => each.holder),
      );
      return descending
        .filter((stacked) => holders.has(stacked.holder))
        .map((stacked) => ({ stacked, to: 'back' as const }));
    }
  }
}

/** A move's restack, and how the toolbar describes it. */
function outcomeOf(
  plan: Plan,
  viewId: Id,
  move: StackingMove,
): { restack: Restack; description: string } {
  const moves = movesOf(plan, move);
  const [only] = plan.shapes.length === 1 ? plan.shapes : [];
  const forward = move === 'front' || move === 'forward';

  if (moves.length === 0) {
    if (!only) {
      const reason = forward
        ? 'The selection is already in front of everything it overlaps.'
        : 'The selection is already behind everything it overlaps.';
      return { restack: { reason }, description: reason };
    }
    const already = forward ? 'in front of' : 'behind';
    const reason =
      `"${only.shape.name}" is already ${already} everything it overlaps ${whereOf(plan, only)}.` +
      (forward ? coverFromOutside(plan.indexed, only) : '') +
      sitsOver(only);
    return { restack: { reason }, description: reason };
  }

  const command: RestackCommand = {
    type: 'restack',
    view: viewId,
    moves: moves.map(({ stacked, to }) => ({
      shape: {
        element: stacked.shape.element,
        ...(stacked.shape.container === undefined ? {} : { container: stacked.shape.container }),
      },
      to,
    })),
  };
  if (!only) {
    return {
      restack: {
        command,
        done: forward ? 'The selection is now in front.' : 'The selection is now behind.',
      },
      description: withKeys(OF_THE_SELECTION[move], move),
    };
  }

  const name = `"${only.shape.name}"`;
  const past = moves[0]?.past;
  const pastName = `"${past?.name ?? ''}"`;
  const pastHides = past !== undefined && within(only.shape.rect, past.rect);
  // After a send to the back every shape beside it is drawn after it: the first that holds it hides it.
  const hider = only.overlapping.find((other) => within(only.shape.rect, other.shape.rect))?.shape;
  const where = whereOf(plan, only);
  let done: string;
  let description: string;
  switch (move) {
    case 'forward':
      done = `${name} is now in front of ${pastName}.`;
      description = `Bring forward, in front of ${pastName}`;
      break;
    case 'backward':
      done = `${name} is now behind ${pastName}${pastHides ? ', which hides it' : ''}.`;
      description = `Send backward, behind ${pastName}${pastHides ? ', which hides it' : ''}`;
      break;
    case 'front':
      done = `${name} is now at the front.`;
      description = `Bring to front, ${where}`;
      break;
    case 'back':
      done = `${name} is now at the back.${hider ? ` "${hider.name}" hides it.` : ''}`;
      description = `Send to back, ${where}${hider ? `; "${hider.name}" then hides it` : ''}`;
      break;
  }
  return {
    restack: { command, done: done + sitsOver(only) },
    description: withKeys(description, move),
  };
}

function withKeys(text: string, move: StackingMove): string {
  return `${text} (${STACKING_KEYS[move].shown})`;
}

/** Where a shape sits: `inside "C"`, or `directly in World`. */
function whereOf(plan: Plan, stacked: Stacked): string {
  if (stacked.holder === '') return 'directly in World';
  return `inside "${plan.indexed.byKey.get(stacked.holder)?.name ?? ''}"`;
}

/**
 * What covers a shape from outside its container: the topmost shape, across every container on the
 * way out to World, that is drawn after one of them and covers the shape. A shape at the front of its
 * container can still be hidden there.
 */
function coverFromOutside(indexed: IndexedScene, stacked: Stacked): string {
  const { rect } = stacked.shape;
  let found: { cover: ElementShape; holder: ElementShape; rank: number } | undefined;
  let key = stacked.shape.containerShape;
  while (key !== undefined) {
    const holder = indexed.byKey.get(key);
    if (!holder) break;
    const holderRank = drawingRank(indexed, holder);
    for (const other of indexed.contentsIndex(holder.containerShape ?? '').query(rect)) {
      if (other.key === holder.key) continue;
      const rank = drawingRank(indexed, other);
      if (rank <= holderRank || (found && rank <= found.rank)) continue;
      if (coversRect(indexed, other, rect)) found = { cover: other, holder, rank };
    }
    key = holder.containerShape;
  }
  return found
    ? ` "${found.cover.name}" is drawn in front of "${found.holder.name}", which holds it.`
    : '';
}

/**
 * The hint for a shape drawn over a container beside it that it is not inside, which looks as if it
 * were: putting it inside orders it among the shapes there.
 */
function sitsOver(stacked: Stacked): string {
  const under = stacked.overlapping
    .filter(
      (other) =>
        other.rank < stacked.rank &&
        other.shape.holdsContents &&
        within(stacked.shape.rect, other.shape.rect),
    )
    .at(-1)?.shape;
  return under
    ? ` It sits over "${under.name}" without being inside it; Put inside "${under.name}" orders it among the shapes there.`
    : '';
}
