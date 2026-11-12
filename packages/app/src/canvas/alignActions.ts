/**
 * Aligning, distributing and sizing alike the selected shapes (ADR 0074), as the shape menu, the
 * canvas toolbar, Alt+Shift with an arrow key and Claude's `align_shapes` do it: which shapes take
 * part, the one action that stores what changes, and why nothing would.
 *
 * Shapes align on the canvas, by the selection's bounds, whichever containers they sit in, and each
 * is stored relative to its own container, pinned. A row stands for its table, an anchored part for
 * its drawing, and what sits inside a shape that takes part goes with it, as when they are dragged.
 * Notes and free arrows align with element shapes; notes take a size, and arrows do not.
 */
import { positionKey, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type { Arrow, FreeShape, Id, Note, Picture, ShapePosition } from '@visual-anything/schema';
import type { Selection } from '../editor/selection';
import { t } from '../i18n';
import { ALIGN_HOWS, alignedRects, fewestFor, onlyMoves, type AlignHow } from './align';
import type { Rect } from './geometry';
import type { IndexedScene } from './hit';
import type { Direction } from './navigation';
import { laidOutRect } from './overlays/decorate';
import { sizeTakenBy } from './resize';
import { viewIn } from './routing/commands';
import type { ElementShape } from './scene';
import { rectAround } from './spatial';

/** The ways in the groups the menus list them in, a line between two groups. */
export const ALIGN_GROUPS: readonly (readonly AlignHow[])[] = [
  ['left', 'centers', 'right'],
  ['top', 'middles', 'bottom'],
  ['distribute-horizontally', 'distribute-vertically'],
  ['same-width', 'same-height'],
];

/** What each way is called in the menus, in English; the menus show it translated. */
export const ALIGN_NAMES: Readonly<Record<AlignHow, string>> = {
  left: 'Align left',
  centers: 'Align centers',
  right: 'Align right',
  top: 'Align top',
  middles: 'Align middles',
  bottom: 'Align bottom',
  'distribute-horizontally': 'Distribute horizontally',
  'distribute-vertically': 'Distribute vertically',
  'same-width': 'Same width',
  'same-height': 'Same height',
};

/** What each way does, for its tooltip, in English. */
export const ALIGN_DESCRIPTIONS: Readonly<Record<AlignHow, string>> = {
  left: 'Lines up the left edges of the selected shapes on the leftmost one’s. Alt+Shift+←',
  centers: 'Lines up the selected shapes’ centers, on a line down the middle of their bounds.',
  right: 'Lines up the right edges of the selected shapes on the rightmost one’s. Alt+Shift+→',
  top: 'Lines up the top edges of the selected shapes on the highest one’s. Alt+Shift+↑',
  middles: 'Lines up the selected shapes’ middles, on a line across the middle of their bounds.',
  bottom: 'Lines up the bottom edges of the selected shapes on the lowest one’s. Alt+Shift+↓',
  'distribute-horizontally':
    'Spaces the selected shapes with equal gaps from left to right; the first and the last stay.',
  'distribute-vertically':
    'Spaces the selected shapes with equal gaps from top to bottom; the first and the last stay.',
  'same-width': 'Gives the selected shapes the width of the widest of them.',
  'same-height': 'Gives the selected shapes the height of the tallest of them.',
};

/** The keys of each way that has one, as `aria-keyshortcuts` writes them. */
export const ALIGN_SHORTCUTS: Readonly<Partial<Record<AlignHow, string>>> = {
  left: 'Alt+Shift+ArrowLeft',
  right: 'Alt+Shift+ArrowRight',
  top: 'Alt+Shift+ArrowUp',
  bottom: 'Alt+Shift+ArrowDown',
};

/** The way Alt+Shift with each arrow key aligns: to that side. */
export const ALIGN_BY_KEY: Readonly<Record<Direction, AlignHow>> = {
  left: 'left',
  right: 'right',
  up: 'top',
  down: 'bottom',
};

/** How the history names aligning `count` shapes a way, in English; the app shows it translated. */
export function alignLabel(how: AlignHow, count: number): string {
  switch (how) {
    case 'left':
      return `Align ${count} shapes to the left`;
    case 'centers':
      return `Align the centers of ${count} shapes`;
    case 'right':
      return `Align ${count} shapes to the right`;
    case 'top':
      return `Align ${count} shapes to the top`;
    case 'middles':
      return `Align the middles of ${count} shapes`;
    case 'bottom':
      return `Align ${count} shapes to the bottom`;
    case 'distribute-horizontally':
      return `Distribute ${count} shapes horizontally`;
    case 'distribute-vertically':
      return `Distribute ${count} shapes vertically`;
    case 'same-width':
      return `Give ${count} shapes the same width`;
    case 'same-height':
      return `Give ${count} shapes the same height`;
  }
}

/** One of the shapes that take part, with the rectangle it is stored at, on the canvas. */
type Part =
  | { kind: 'shape'; shape: ElementShape; rect: Rect }
  | { kind: 'note'; note: Note; rect: Rect }
  | { kind: 'picture'; picture: Picture; rect: Rect }
  | { kind: 'arrow'; arrow: Arrow; rect: Rect };

/**
 * The shapes that take part in a way of aligning: the element shapes a drag of the selection would
 * move, but anchored parts, then its notes and arrows; for sizing alike, only those that take that
 * size, arrows never.
 */
function partsOf(
  indexed: IndexedScene,
  freeShapes: readonly FreeShape[],
  selection: Selection,
  how: AlignHow,
): Part[] {
  const sized = !onlyMoves(how);
  const parts: Part[] = [];
  for (const shape of shapesTakingPart(indexed, selection)) {
    if (sized) {
      const taken = sizeTakenBy(shape);
      if (!taken || (how === 'same-height' && taken !== 'both')) continue;
    }
    parts.push({ kind: 'shape', shape, rect: laidOutRect(shape) });
  }
  for (const free of freeShapes) {
    if (!selection.freeShapes.has(free.id)) continue;
    if (free.kind === 'note') {
      parts.push({
        kind: 'note',
        note: free,
        rect: { x: free.x, y: free.y, width: free.width, height: free.height },
      });
    } else if (free.kind === 'picture') {
      parts.push({
        kind: 'picture',
        picture: free,
        rect: { x: free.x, y: free.y, width: free.width, height: free.height },
      });
    } else if (free.kind === 'arrow' && !sized) {
      parts.push({ kind: 'arrow', arrow: free, rect: rectAround([free.from, free.to]) });
    }
  }
  return parts;
}

/**
 * The element shapes that take part, as a drag of the selection moves them (`movingShapes`): every
 * shape of every selected element, a row standing for its table and an anchored part for its drawing,
 * however deep, each once, but those inside another that takes part, which it carries. Kept here
 * rather than read from the gestures, so that Claude's tool loads no key handling.
 */
function shapesTakingPart(indexed: IndexedScene, selection: Selection): ElementShape[] {
  const unique = new Map<string, ElementShape>();
  for (const id of selection.elements) {
    for (const each of indexed.byElement.get(id) ?? []) {
      let shape = each;
      while (
        (shape.row !== undefined || shape.part?.inDrawing === true) &&
        shape.containerShape !== undefined
      ) {
        const container = indexed.byKey.get(shape.containerShape);
        if (!container) break;
        shape = container;
      }
      if (unique.has(shape.key)) continue;
      unique.set(shape.key, shape);
    }
  }
  const carried = (key: string) => {
    const parts = key.split('/');
    for (let length = parts.length - 1; length > 0; length--) {
      if (unique.has(parts.slice(0, length).join('/'))) return true;
    }
    return false;
  };
  return [...unique.values()].filter((shape) => !carried(shape.key));
}

/** Why a way would do nothing with too few shapes, in the language read in. */
function tooFew(how: AlignHow): string {
  if (fewestFor(how) === 3) return t('Select three or more shapes to distribute them.');
  return onlyMoves(how)
    ? t('Select two or more shapes to align them.')
    : t('Select two or more shapes whose size can change.');
}

/** Why a way would move nothing, in the language read in. */
function changesNothing(how: AlignHow): string {
  if (fewestFor(how) === 3) return t('They are distributed already.');
  return onlyMoves(how) ? t('They are aligned already.') : t('They have that size already.');
}

/**
 * The one action that aligns, distributes or sizes alike the selected shapes a way: a batch named
 * for how many take part, of one `set-positions`, pinned, then one `update-free-shape` for each note
 * or arrow that changes; or why it would do nothing.
 */
export function alignCommand(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  viewId: Id,
  selection: Selection,
  how: AlignHow,
): { command: Command & { type: 'batch' }; label: string } | { reason: string } {
  const view = viewIn(project, viewId);
  if (!view) return { reason: tooFew(how) };
  const parts = partsOf(indexed, view.freeShapes, selection, how);
  if (parts.length < fewestFor(how)) return { reason: tooFew(how) };
  const placed = alignedRects(
    parts.map((part) => part.rect),
    how,
  );
  const positions = new Map<string, ShapePosition>();
  const free: Command[] = [];
  parts.forEach((part, at) => {
    const to = placed[at] as Rect;
    if (to === part.rect) return;
    const dx = to.x - part.rect.x;
    const dy = to.y - part.rect.y;
    switch (part.kind) {
      case 'shape': {
        const { shape } = part;
        const size = { ...shape.storedSize };
        if (to.width !== part.rect.width) size.width = Math.round(to.width);
        if (to.height !== part.rect.height) size.height = Math.round(to.height);
        const position: ShapePosition = {
          element: shape.element,
          ...(shape.container === undefined ? {} : { container: shape.container }),
          x: Math.round(shape.offset.x + dx),
          y: Math.round(shape.offset.y + dy),
          ...size,
          pinned: true,
        };
        // Copies of a container share their contents' places: each is written once.
        const key = positionKey(position);
        if (!positions.has(key)) positions.set(key, position);
        return;
      }
      case 'note':
        free.push({
          type: 'update-free-shape',
          view: view.id,
          shape: {
            ...part.note,
            x: Math.round(to.x),
            y: Math.round(to.y),
            width: Math.round(to.width),
            height: Math.round(to.height),
          },
        });
        return;
      case 'picture':
        free.push({
          type: 'update-free-shape',
          view: view.id,
          shape: {
            ...part.picture,
            x: Math.round(to.x),
            y: Math.round(to.y),
            width: Math.round(to.width),
            height: Math.round(to.height),
          },
        });
        return;
      case 'arrow': {
        const { arrow } = part;
        free.push({
          type: 'update-free-shape',
          view: view.id,
          shape: {
            ...arrow,
            from: { x: Math.round(arrow.from.x + dx), y: Math.round(arrow.from.y + dy) },
            to: { x: Math.round(arrow.to.x + dx), y: Math.round(arrow.to.y + dy) },
          },
        });
        return;
      }
    }
  });
  const commands: Command[] = [
    ...(positions.size > 0
      ? [{ type: 'set-positions' as const, view: view.id, positions: [...positions.values()] }]
      : []),
    ...free,
  ];
  if (commands.length === 0) return { reason: changesNothing(how) };
  const label = alignLabel(how, parts.length);
  return { command: { type: 'batch', label, commands }, label };
}

/** A way of aligning as the menus offer it: whether it would do something, and what it does or why not. */
export interface AlignAction {
  enabled: boolean;
  description: string;
}

/**
 * Each way of aligning as the shape menu and the toolbar offer it for the selection: on while it would
 * change something, and otherwise off, saying why.
 */
export function alignActions(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  viewId: Id,
  selection: Selection,
  editable: boolean,
): Record<AlignHow, AlignAction> {
  const view = viewIn(project, viewId);
  const actions = {} as Record<AlignHow, AlignAction>;
  for (const how of ALIGN_HOWS) {
    const count = view ? partsOf(indexed, view.freeShapes, selection, how).length : 0;
    if (count < fewestFor(how)) {
      actions[how] = { enabled: false, description: tooFew(how) };
    } else if (!editable) {
      actions[how] = { enabled: false, description: t('The project cannot be changed now.') };
    } else {
      actions[how] = { enabled: true, description: t(ALIGN_DESCRIPTIONS[how]) };
    }
  }
  return actions;
}

/** How many shapes of the selection could take part in aligning at all: what the menus show it for. */
export function alignableCount(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  viewId: Id,
  selection: Selection,
): number {
  const view = viewIn(project, viewId);
  return view ? partsOf(indexed, view.freeShapes, selection, 'left').length : 0;
}
