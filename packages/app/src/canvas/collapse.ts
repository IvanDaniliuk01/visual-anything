/**
 * Collapsing and expanding containers on the canvas. A view keeps the containers it collapses
 * (`ViewFile.collapsed`, interface I1); a collapsed container shows none of its contents, and the
 * relations of those contents are drawn as aggregated relations on it. The canvas collapses and
 * expands through one command, `set-collapsed`, from the shape menu, the toggle on a container's
 * shape and the keys, so that each is one undoable action.
 */
import type { ProjectSnapshot, SetCollapsedCommand } from '@visual-anything/core';
import { modelIndexOf } from '@visual-anything/core';
import type { Id, ViewFile } from '@visual-anything/schema';
import type { Selection } from '../editor/selection';
import { t } from '../i18n';
import type { IndexedScene } from './hit';
import type { ElementShape, Scene } from './scene';

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
  return shape.collapsed === undefined
    ? undefined
    : t('{count} inside', { count: shape.collapsed.contents });
}

/** Where a container's header writes its third line, below its top: under its name and detail. */
export const COUNT_LINE_TOP = 44;
/** How tall the third line of a container's header is at most, and how tall it must be to show. */
const COUNT_ROOM = 16;
const COUNT_LEAST = 14;

/**
 * What a container's header writes under its name, in a body `bodyHeight` tall: its detail, and on a
 * collapsed container how many shapes it holds, on a line of its own when the body has room for it,
 * or else first on the detail's line. Cutting a line to the shape's width then cuts the detail, never
 * the count, which a collapsed container drawn at its component's size would otherwise lose.
 */
export function headerLines(
  shape: Pick<ElementShape, 'detail' | 'componentName' | 'collapsed'>,
  bodyHeight: number,
): { detail: string; count?: string; countRoom?: number } {
  const detail = shape.detail ?? shape.componentName;
  if (shape.collapsed === undefined) return { detail };
  const count = t('{count} inside', { count: shape.collapsed.contents });
  if (detail === '') return { detail: count };
  const room = Math.min(COUNT_ROOM, bodyHeight - COUNT_LINE_TOP);
  if (room >= COUNT_LEAST) return { detail, count, countRoom: room };
  return { detail: `${count} · ${detail}` };
}
