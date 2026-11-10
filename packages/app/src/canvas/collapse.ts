/**
 * Collapsing and expanding containers on the canvas. A view keeps the containers it collapses
 * (`ViewFile.collapsed`, interface I1); a collapsed container shows none of its contents, and the
 * relations of those contents are drawn as aggregated relations on it. The canvas collapses and
 * expands through one command, `set-collapsed`, from the shape menu, the toggle on a container's
 * shape and the keys, so that each is one undoable action.
 */
import type {
  EmphasisRun,
  ProjectSnapshot,
  ResolvedDrawing,
  SetCollapsedCommand,
} from '@visual-anything/core';
import { modelIndexOf } from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import type { Selection } from '../editor/selection';
import { t } from '../i18n';
import { LINE_HEIGHT, layOutRuns, type Measure } from '../text/layout';
import {
  BASE_DRAWING,
  headerHeldOf,
  headerPlacesOf,
  headerRoomsOf,
  lineOf,
  textSideInset,
} from './drawing';
import { SHEET, TOGGLE_SIZE, bodyOf, toggleRect } from './geometry';
import type { IndexedScene } from './hit';
import type { ElementShape, Scene } from './scene';
import { HEADER_TEXT_SHIFT, headerShift } from './shape-images';
import { DEFAULT_DETAIL_LINES, robotoMeasure } from './textBlock';

const NONE: ReadonlySet<Id> = new Set();
const collapsedSets = new WeakMap<readonly Id[], ReadonlySet<Id>>();

/** The containers a view collapses (`ViewFile.collapsed`, interface I1). */
export function collapsedIn(view: ViewFile): ReadonlySet<Id> {
  const ids = view.collapsed;
  if (ids === undefined || ids.length === 0) return NONE;
  let set = collapsedSets.get(ids);
  if (!set) {
    set = new Set(ids);
    collapsedSets.set(ids, set);
  }
  return set;
}

/**
 * The command that collapses or expands these containers (interface I1). It is undoable, writes only
 * the view file, and the history calls it `Collapse "X"`, `Expand "X"`, or `Collapse N containers`
 * for several.
 */
export function setCollapsedCommand(
  viewId: Id,
  elements: readonly Id[],
  collapsed: boolean,
): SetCollapsedCommand {
  return {
    type: 'set-collapsed',
    view: viewId,
    elements: [...new Set(elements)].sort(),
    collapsed,
  };
}

/** Whether a shape is a container the view can collapse or expand: it holds shapes, or is collapsed. */
export function canCollapse(shape: ElementShape): boolean {
  return shape.holdsContents || shape.collapsed !== undefined;
}

/** What collapsing or expanding offers for a selection: the containers each would change, and how it is called. */
export interface CollapseAction {
  elements: Id[];
  /** `Collapse "X"`, `Collapse 3 containers`, `Expand "X"` or `Expand 3 containers`. */
  label: string;
}

export interface CollapseActions {
  collapse?: CollapseAction;
  expand?: CollapseAction;
}

/**
 * What the selection's containers offer: collapsing the ones drawn expanded, and expanding the ones
 * drawn collapsed. An element counts by its first shape, which every copy follows.
 */
export function collapseActions(
  indexed: IndexedScene,
  project: ProjectSnapshot,
  selection: Selection,
): CollapseActions {
  return collapseActionsFor(project, selection.elements, (id) => indexed.byElement.get(id)?.[0]);
}

/**
 * What the outline offers for an element's row: collapse actions for it alone, or for every element
 * selected when the selection holds it, as the canvas offers them (`collapseActions`); the scene's
 * shapes say which are containers.
 */
export function rowCollapseActions(
  scene: Scene,
  project: ProjectSnapshot,
  selection: Selection,
  element: Id,
): CollapseActions {
  const elements = selection.elements.has(element) ? selection.elements : [element];
  const first = firstShapesOf(scene);
  return collapseActionsFor(project, elements, (id) => first.get(id));
}

const firstShapes = new WeakMap<readonly ElementShape[], Map<Id, ElementShape>>();

function firstShapesOf(scene: Scene): Map<Id, ElementShape> {
  let first = firstShapes.get(scene.shapes);
  if (!first) {
    first = new Map();
    for (const shape of scene.shapes)
      if (!first.has(shape.element)) first.set(shape.element, shape);
    firstShapes.set(scene.shapes, first);
  }
  return first;
}

function collapseActionsFor(
  project: ProjectSnapshot,
  elements: Iterable<Id>,
  shapeOf: (id: Id) => ElementShape | undefined,
): CollapseActions {
  const expanded: Id[] = [];
  const collapsed: Id[] = [];
  for (const id of elements) {
    const shape = shapeOf(id);
    if (!shape) continue;
    if (shape.collapsed !== undefined) collapsed.push(id);
    else if (shape.holdsContents) expanded.push(id);
  }
  const index = modelIndexOf(project);
  const labelOf = (verb: string, ids: Id[]): string => {
    const [only] = ids;
    if (ids.length === 1 && only !== undefined) {
      return `${verb} "${index.element(only)?.name ?? only}"`;
    }
    return `${verb} ${ids.length} containers`;
  };
  return {
    ...(expanded.length > 0
      ? { collapse: { elements: expanded, label: labelOf('Collapse', expanded) } }
      : {}),
    ...(collapsed.length > 0
      ? { expand: { elements: collapsed, label: labelOf('Expand', collapsed) } }
      : {}),
  };
}

/** What the canvas says once a collapse or an expand is done: `Collapsed "X".`, `Expanded 3 containers.` */
export function collapseDone(action: CollapseAction, collapsed: boolean): string {
  const verb = collapsed ? 'Collapse' : 'Expand';
  return t.message(`${collapsed ? 'Collapsed' : 'Expanded'}${action.label.slice(verb.length)}.`);
}

/** How a collapsed container's contents are told: `3 inside`. */
export function insideCount(shape: ElementShape): string | undefined {
  return shape.collapsed === undefined ? undefined : countText(shape.collapsed);
}

/**
 * What a collapsed container's count says: `3 inside`, or, where the drawing defaults count what it
 * holds and every content comes from one component, `12 × Table` (ADR 0086), which names them
 * without a plural no component's name has.
 */
export function countText(collapsed: NonNullable<ElementShape['collapsed']>): string {
  const { contents, component } = collapsed;
  return component === undefined
    ? t('{count} inside', { count: contents })
    : t('{count} × {component}', { count: contents, component });
}

/** The least that line is below the top: where the canvas wrote it before drawing defaults. */
const LEAST_COUNT_TOP = 44;

/**
 * Where a container's header writes its third line, below its top, under its name and detail: from
 * the sizes and line height the drawing gives, and never above the 44 the canvas wrote it at before
 * drawing defaults, so that a collapsed container keeps its height.
 */
export function countLineTopOf(drawing: ResolvedDrawing): number {
  return Math.max(
    LEAST_COUNT_TOP,
    Math.round(headerPlacesOf(drawing).detailTop + detailLineOf(drawing) + 2),
  );
}

/** Where a container's header writes its third line, as the drawing that names nothing places it. */
export const COUNT_LINE_TOP = countLineTopOf(BASE_DRAWING);
/**
 * How tall the third line of a container's header is at most, at the detail's size, as its detail's
 * first line (16 at the sizes of before), and how tall it must be to show: 2 less.
 */
function countRoomOf(drawing: ResolvedDrawing): number {
  return headerPlacesOf(drawing).detailRoom;
}
const COUNT_SHORT_BY = 2;
/**
 * How tall each line of a header's detail after its first is: a line at the detail's size, never
 * shorter than a label of one line is drawn (`lineOf`).
 */
function detailLineOf(drawing: ResolvedDrawing): number {
  return lineOf(drawing, drawing.text.detailSize);
}
/** The room a container's toggle takes beside its header. */
const BESIDE_TOGGLE = TOGGLE_SIZE + 4;

/** What a container's header writes under its name. */
export interface HeaderLines {
  /** Its detail, or on a collapsed container with no room for a line of its own, its count first. */
  detail: string;
  /** The height the detail may take: one line, or on a collapsed container the lines it wraps to. */
  detailRoom: number;
  /** Whether the detail was cut to its lines. */
  detailCut: boolean;
  /** On a collapsed container with room for it, its count on a line of its own, and where. */
  count?: string;
  countTop?: number;
  countRoom?: number;
}

/**
 * How wide a collapsed container `width` wide writes its header's detail, as `writeShapeText` wraps
 * it: its body, without the sheet the drawing shows behind it, less the drawing's side insets, the
 * toggle and, when it shows one, the icon (ADR 0082).
 */
export function collapsedHeaderWrap(
  width: number,
  icon: boolean,
  drawing: ResolvedDrawing = BASE_DRAWING,
): number {
  return Math.max(
    1,
    width -
      sheetOf(drawing) -
      2 * textSideInset(drawing) -
      BESIDE_TOGGLE -
      (icon ? HEADER_TEXT_SHIFT : 0),
  );
}

/** How far the sheet behind a collapsed container shows in a drawing: none where it counts instead. */
function sheetOf(drawing: ResolvedDrawing): number {
  return drawing.containers.collapsed === 'count' ? 0 : SHEET;
}

/**
 * How wide a container's header writes its name and detail, as the canvas and the SVG wrap them:
 * its body, less the drawing's side insets, the toggle when it shows one, and the icon its header
 * may show.
 */
export function headerWrapOf(shape: ElementShape, drawing: ResolvedDrawing = BASE_DRAWING): number {
  const toggle = toggleRect(shape);
  const beside = toggle ? toggle.width + 4 : 0;
  return Math.max(
    1,
    bodyOf(shape).width - 2 * textSideInset(drawing) - beside - headerShift(shape),
  );
}

/**
 * What a container's header writes under its name, in a body `bodyHeight` tall: its detail, and on a
 * collapsed container how many shapes it holds, on a line of its own when the body has room for it,
 * or else first on the detail's line. Cutting a line to the shape's width then cuts the detail, never
 * the count, which a collapsed container drawn at its component's size would otherwise lose.
 *
 * A collapsed container wraps its detail to `wrap`, on up to its `lines` (3 unless its appearance
 * says otherwise) and as many as its body holds above the count (ADR 0082), its height grown to hold
 * them (`collapsedHeight`). An open container writes its detail on one line, as before.
 */
export function headerLines(
  shape: Pick<
    ElementShape,
    'detail' | 'componentName' | 'collapsed' | 'detailRuns' | 'detailLines'
  >,
  bodyHeight: number,
  wrap = Infinity,
  measure: Measure = robotoMeasure,
  drawing: ResolvedDrawing = BASE_DRAWING,
): HeaderLines {
  const detail = shape.detail ?? shape.componentName;
  const oneLine = { detailRoom: headerRoomsOf(drawing, bodyHeight).detail, detailCut: false };
  if (shape.collapsed === undefined) return { detail, ...oneLine };
  const count = countText(shape.collapsed);
  if (detail === '') return { detail: count, ...oneLine };
  const laid = detailLinesOf(shape, detail, wrap, measure, drawing);
  // As many lines as the body holds with the count's line under them.
  const top = countLineTopOf(drawing);
  const line = detailLineOf(drawing);
  const countRoom = countRoomOf(drawing);
  const least = countRoom - COUNT_SHORT_BY;
  const holds = Math.floor((bodyHeight - top - least) / line + 1e-6) + 1;
  const lines = Math.max(1, Math.min(laid.lines, holds));
  const countTop = top + (lines - 1) * line;
  const room = Math.min(countRoom, bodyHeight - countTop);
  if (room >= least) {
    return {
      detail,
      detailRoom: headerPlacesOf(drawing).detailRoom + (lines - 1) * line,
      detailCut: laid.cut || lines < laid.lines,
      count,
      countTop,
      countRoom: room,
    };
  }
  return { detail: `${count} · ${detail}`, ...oneLine };
}

/**
 * The height a collapsed container takes: its component's, or more when its detail wraps to more
 * than one line, enough to hold them and its count under them (ADR 0082, built in M3c Stage 2), and
 * never less than its header needs to write its name and its detail's first line at the drawing's
 * sizes (`headerHeldOf`), 48 at the sizes of before.
 */
export function collapsedHeight(
  shape: Pick<ElementShape, 'detail' | 'componentName' | 'detailRuns' | 'detailLines'>,
  height: number,
  wrap: number,
  measure: Measure = robotoMeasure,
  drawing: ResolvedDrawing = BASE_DRAWING,
): number {
  const held = Math.max(height, headerHeldOf(drawing) + sheetOf(drawing));
  const detail = shape.detail ?? shape.componentName;
  if (detail === '') return held;
  const { lines } = detailLinesOf(shape, detail, wrap, measure, drawing);
  if (lines <= 1) return held;
  const needed =
    countLineTopOf(drawing) + (lines - 1) * detailLineOf(drawing) + countRoomOf(drawing) + SHEET;
  return Math.max(held, Math.ceil(needed));
}

/** How many lines a header's detail wraps to, at most its `lines`, and whether it was cut. */
function detailLinesOf(
  shape: Pick<ElementShape, 'detailRuns' | 'detailLines'>,
  detail: string,
  wrap: number,
  measure: Measure,
  drawing: ResolvedDrawing,
): { lines: number; cut: boolean } {
  if (!Number.isFinite(wrap)) return { lines: 1, cut: false };
  const most = Math.max(1, shape.detailLines ?? DEFAULT_DETAIL_LINES);
  const runs = shape.detailRuns ?? [plainRun(detail)];
  const laid = layOutRuns(runs, {
    measure,
    size: drawing.text.detailSize,
    width: wrap,
    align: 'left',
    maxLines: most,
  });
  // A line that holds a formula taller than its text counts for as many lines as it is tall, so
  // that the header grows to hold it (ADR 0106); lines of text alone count one each.
  const lineHeight = drawing.text.detailSize * LINE_HEIGHT;
  const lines = Math.max(laid.lines.length, Math.ceil(laid.height / lineHeight - 1e-6));
  return { lines: Math.max(1, lines), cut: laid.cut };
}

function plainRun(text: string): EmphasisRun {
  return {
    text,
    bold: false,
    italic: false,
    strike: false,
    underline: false,
    code: false,
    highlight: false,
  };
}
