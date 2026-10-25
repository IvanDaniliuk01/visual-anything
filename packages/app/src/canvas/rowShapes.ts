/**
 * What the scene does for shapes that draw their contents as rows (ADR 0023): it measures them by
 * their rows, stacks their rows in the model's order, records what each row holds without drawing it,
 * fits their texts to one line, and works out the side and the lane each relation on a row or on such
 * a shape leaves by. `scene.ts` calls these at its few seams; the sizes come from `rows.ts`.
 */
import type { Element, Id, ShapePosition } from '@visual-anything/schema';
import type { Placement } from '@visual-anything/core';
import { centerOf, type Point, type Rect, type ShapeKind } from './geometry';
import { fitHeader, fitRow } from './fit';
import { overlapHorizontally, sideToward, type SideEnd } from './rowRoutes';
import {
  ROWS_HEADER,
  ROW_HEIGHT,
  collapsedRowsHeight,
  headerMiddle,
  measureRows,
  rowsShapeKind,
  rowsWidth,
  type RowSide,
} from './rows';
import type { Box, ElementShape, Look, Measured } from './scene';

/** What a box of a shape that draws rows, or of a row, adds to what it is measured from. */
export type RowParts =
  | {
      kind: 'rows';
      /** How many rows it draws. */
      count: number;
      /** For a collapsed one, what its header says it holds: "12 × Column". */
      holding?: string;
    }
  | { kind: 'row'; index: number; undrawn: readonly Id[] };

/**
 * A row's box: as wide as its container and one row high, which its container sets as it stacks its
 * rows, with no position of its own and none of what it holds measured.
 */
export function rowBox(placement: Placement, element: Element, look: Look, detail: string): Box {
  const undrawn: Id[] = [];
  const seen = new Set<Id>();
  for (const content of placement.contents) {
    if (seen.has(content.element)) continue;
    seen.add(content.element);
    undrawn.push(content.element);
  }
  return {
    placement,
    width: 0,
    height: ROW_HEIGHT,
    offset: undefined,
    stored: false,
    measured: {
      element,
      look,
      detail,
      position: undefined,
      contents: [],
      rows: { kind: 'row', index: 0, undrawn },
    },
  };
}

/**
 * The box of a shape that draws its contents as rows: as wide as the view stores or its appearance
 * says, as tall as its rows, each row stacked under the header in the model's order. A collapsed one
 * keeps its header only, and says what it holds there.
 */
export function rowsBox(
  placement: Placement,
  element: Element,
  look: Look,
  detail: string,
  position: ShapePosition | undefined,
  collapsed: boolean,
  rowsOf: () => Box[],
): Box {
  const { appearance } = look;
  const offset = position ? { x: position.x, y: position.y } : undefined;
  const width = rowsWidth(position?.width, appearance.width);
  const stored = position !== undefined;
  if (collapsed && placement.contents.length > 0) {
    return {
      placement,
      width,
      height: collapsedRowsHeight(),
      offset,
      stored,
      measured: {
        element,
        look,
        detail,
        position,
        contents: [],
        folded: placement.contents.length,
        rows: { kind: 'rows', count: 0, holding: holdingOf(rowsOf()) },
      },
    };
  }
  const rows = rowsOf();
  rows.forEach((row, index) => {
    row.offset = { x: 0, y: ROWS_HEADER + index * ROW_HEIGHT };
    row.width = width;
    row.height = ROW_HEIGHT;
    row.stored = false;
    const parts = row.measured;
    if (parts?.rows?.kind === 'row') parts.rows = { ...parts.rows, index };
  });
  return {
    placement,
    width,
    height: measureRows(width, rows.length).height,
    offset,
    stored,
    measured: {
      element,
      look,
      detail,
      position,
      contents: rows,
      rows: { kind: 'rows', count: rows.length },
    },
  };
}

/** What a collapsed shape's header says it holds: how many, and of which component when they share one. */
function holdingOf(rows: readonly Box[]): string {
  const names = new Set(rows.map((row) => row.measured?.look.componentName));
  const [name] = names;
  return names.size === 1 && name !== undefined
    ? `${rows.length} × ${name}`
    : `${rows.length} inside`;
}

/** Whether a measured box hides what its placement holds: a row, which draws none of it. */
export function hidesContents(parts: Measured): boolean {
  return parts.rows?.kind === 'row' && parts.rows.undrawn.length > 0;
}

/** Whether a shape drawn before starts or stops drawing its contents as rows with this look. */
export function rowsChanged(before: ElementShape, look: Look): boolean {
  return (before.rowCount !== undefined) !== look.appearance.contentsAsRows;
}

/** The fields of a shape that its rows decide. */
export interface RowFields {
  kind: ShapeKind;
  rowCount?: number;
  row?: number;
  undrawn?: readonly Id[];
  fitted?: { name: string; detail: string };
}

/** The fields a measured box gives its shape: its kind, and on rows and their containers, the rest. */
export function rowFieldsOf(parts: Measured, width: number, holdsContents: boolean): RowFields {
  const { rows, look, element, detail } = parts;
  if (!rows) return { kind: look.appearance.shape };
  if (rows.kind === 'row') {
    return {
      kind: 'rectangle',
      row: rows.index,
      ...(rows.undrawn.length > 0 ? { undrawn: rows.undrawn } : {}),
      fitted: fitRow(element.name, detail, width),
    };
  }
  const collapsed = parts.folded !== undefined;
  const said =
    rows.holding === undefined
      ? detail
      : detail === ''
        ? rows.holding
        : `${detail} · ${rows.holding}`;
  // A shape that draws rows always has room for its toggle, which it shows once it holds any.
  return {
    kind: rowsShapeKind(look.appearance.shape),
    rowCount: rows.count,
    fitted: fitHeader(element.name, said, width, { toggle: holdsContents || collapsed }),
  };
}

/** Whether a shape drawn before has the fields its rows give it now. */
export function sameRowFields(before: ElementShape, fields: RowFields): boolean {
  return (
    before.rowCount === fields.rowCount &&
    before.row === fields.row &&
    sameIds(before.undrawn, fields.undrawn) &&
    before.fitted?.name === fields.fitted?.name &&
    before.fitted?.detail === fields.fitted?.detail
  );
}

/** Puts the fields its rows give a shape on it, leaving out those it does not have. */
export function withRowFields(shape: ElementShape, fields: RowFields): void {
  if (fields.rowCount !== undefined) shape.rowCount = fields.rowCount;
  if (fields.row !== undefined) shape.row = fields.row;
  if (fields.undrawn !== undefined) shape.undrawn = fields.undrawn;
  if (fields.fitted !== undefined) shape.fitted = fields.fitted;
}

function sameIds(a: readonly Id[] | undefined, b: readonly Id[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((id, at) => id === b[at]);
}

/** Whether a shape is a row, or draws its contents as rows: relations on it leave beside it. */
export function leavesBeside(shape: ElementShape): boolean {
  return shape.row !== undefined || shape.rowCount !== undefined;
}

/** The side a relation's end leaves from, and its lane there. */
export interface SideInfo {
  side: RowSide;
  lane: number;
}

/** For each line, by its place in the plan, how each end leaves when it ends on a row or such a shape. */
export interface RowSides {
  from: readonly (SideInfo | undefined)[];
  to: readonly (SideInfo | undefined)[];
}

/** One end of a line, as the scene's plan holds it. */
interface PlannedEnd {
  kind: 'shape' | 'relation';
  /** The shape's index, for a shape. */
  at: number;
}

const rowsInShapes = new WeakMap<readonly ElementShape[], boolean>();

/** Whether any shape draws rows, worked out once for each list of shapes. */
function anyRows(shapes: readonly ElementShape[]): boolean {
  let any = rowsInShapes.get(shapes);
  if (any === undefined) {
    any = shapes.some((shape) => shape.rowCount !== undefined);
    rowsInShapes.set(shapes, any);
  }
  return any;
}

/**
 * The side and lane of every end of a line that ends on a row or on a shape that draws rows; undefined
 * when no shape draws rows.
 *
 * - An end leaves on the right when the middle of its other end is at or beyond the middle of its
 *   container, and on the left otherwise; toward the middle of another relation, on the right.
 * - When both ends leave beside containers that overlap horizontally, both leave on the right.
 * - Each row with relations on a side, and the header, gets a lane there: its place among them, in
 *   the model's order, header first.
 */
export function rowSidesOf(
  specs: readonly { from: PlannedEnd; to: PlannedEnd }[],
  shapes: readonly ElementShape[],
  keyIndex: ReadonlyMap<string, number>,
): RowSides | undefined {
  if (!anyRows(shapes)) return undefined;
  const containerOf = (shape: ElementShape): ElementShape | undefined => {
    if (shape.row === undefined) return shape;
    const at = shape.containerShape === undefined ? undefined : keyIndex.get(shape.containerShape);
    return at === undefined ? undefined : shapes[at];
  };
  const besideOf = (end: PlannedEnd): { shape: ElementShape; container: ElementShape } | undefined => {
    if (end.kind !== 'shape') return undefined;
    const shape = shapes[end.at];
    if (!shape || !leavesBeside(shape)) return undefined;
    const container = containerOf(shape);
    return container ? { shape, container } : undefined;
  };
  const middleOf = (end: PlannedEnd): Point | undefined => {
    const shape = end.kind === 'shape' ? shapes[end.at] : undefined;
    return shape && centerOf(shape.rect);
  };

  const from: (SideInfo | undefined)[] = new Array<SideInfo | undefined>(specs.length);
  const to: (SideInfo | undefined)[] = new Array<SideInfo | undefined>(specs.length);
  // The rows, by their index, -1 for the header, with relations on each side of each container.
  const used = new Map<string, Set<number>>();
  const placeOf = (beside: { shape: ElementShape; container: ElementShape }) =>
    beside.shape.row ?? -1;
  const pending: { list: (SideInfo | undefined)[]; at: number; key: string; place: number }[] = [];
  const sideFor = (
    beside: { shape: ElementShape; container: ElementShape },
    other: PlannedEnd,
    otherBeside: { container: ElementShape } | undefined,
  ): RowSide => {
    const rect = beside.container.rect;
    if (otherBeside && overlapHorizontally(rect, otherBeside.container.rect)) return 'right';
    const middle = middleOf(other);
    return middle ? sideToward(rect, middle) : 'right';
  };
  specs.forEach((spec, at) => {
    const a = besideOf(spec.from);
    const b = besideOf(spec.to);
    const each: [typeof a, PlannedEnd, typeof b, (SideInfo | undefined)[]][] = [
      [a, spec.to, b, from],
      [b, spec.from, a, to],
    ];
    for (const [beside, other, otherBeside, list] of each) {
      if (!beside) continue;
      const side = sideFor(beside, other, otherBeside);
      const key = `${beside.container.key}\u0000${side}`;
      const place = placeOf(beside);
      let places = used.get(key);
      if (!places) {
        places = new Set();
        used.set(key, places);
      }
      places.add(place);
      list[at] = { side, lane: 0 };
      pending.push({ list, at, key, place });
    }
  });
  const lanes = new Map<string, Map<number, number>>();
  for (const [key, places] of used) {
    lanes.set(key, new Map([...places].sort((x, y) => x - y).map((place, lane) => [place, lane])));
  }
  for (const { list, at, key, place } of pending) {
    const info = list[at] as SideInfo;
    list[at] = { side: info.side, lane: lanes.get(key)?.get(place) ?? 0 };
  }
  return { from, to };
}

/** The indexes of the lines whose ends leave by another side or lane than they did. */
export function changedSides(before: RowSides | undefined, after: RowSides | undefined): number[] {
  if (before === after) return [];
  const length = Math.max(
    before?.from.length ?? 0,
    after?.from.length ?? 0,
  );
  const changed: number[] = [];
  const same = (x: SideInfo | undefined, y: SideInfo | undefined) =>
    x === y || (x !== undefined && y !== undefined && x.side === y.side && x.lane === y.lane);
  for (let at = 0; at < length; at++) {
    if (!same(before?.from[at], after?.from[at]) || !same(before?.to[at], after?.to[at])) {
      changed.push(at);
    }
  }
  return changed;
}

/**
 * The end a route leaves a row or a shape that draws rows by: its container's side, at the row's
 * middle or the header's.
 */
export function sideEndOf(
  shape: ElementShape,
  shapes: readonly ElementShape[],
  keyIndex: ReadonlyMap<string, number>,
  info: SideInfo,
): SideEnd | undefined {
  let container: Rect = shape.rect;
  let y = headerMiddle(shape.rect);
  if (shape.row !== undefined) {
    const at = shape.containerShape === undefined ? undefined : keyIndex.get(shape.containerShape);
    const holder = at === undefined ? undefined : shapes[at];
    if (!holder) return undefined;
    container = holder.rect;
    y = shape.rect.y + shape.rect.height / 2;
  }
  return { kind: 'side', container, y, lane: info.lane, side: info.side };
}
