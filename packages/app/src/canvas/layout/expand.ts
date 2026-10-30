/**
 * Expand in place (ADR 0080, section 4): every expansion, by hand or by zoom, makes room for what it
 * opens.
 *
 * - The box keeps its corner, its top left unless its container has more free room to its left or
 *   above it, and grows toward that room (`engine.ts`'s `growToward`).
 * - Its unpinned contents are laid out inside it, in one pass with only them in the run.
 * - Level by level up to World, the siblings it now comes within 40 units of move right or down by
 *   the least, keeping their order; pinned shapes, rows, notes and arrows never move, and containers
 *   grow around what moved (ADR 0015's moving aside).
 *
 * By hand it is one undoable action, `set-collapsed` and the `set-positions` of what it laid out and
 * moved aside, joined under the expansion's own label, as ADR 0065 joins placement to the action
 * that caused it. The app keeps, for this tab, the places the expansion moved shapes from, so that
 * collapsing it again gives them back while they have not moved since. By zoom nothing is stored:
 * the canvas draws the view with the places the expansion gives, from a copy of the view's positions
 * the app keeps (`useExpandedInPlace`).
 */
import {
  executeCommand,
  positionKey,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, ShapePosition, ViewFile } from '@visual-anything/schema';
import { useEffect, useMemo, useState } from 'react';
import { fitCamera, type Camera } from '../camera';
import { setCollapsedCommand } from '../collapse';
import type { Point, Rect, Size } from '../geometry';
import { NOT_EXPANDED } from '../overlays/collapsed';
import { laidOutRect } from '../overlays/decorate';
import { buildScene, type Scene } from '../scene';
import { closedRoom } from './closeRoom';
import { layoutCommand } from './command';
import { layoutInput, type LayoutScope } from './input';
import { useLayoutRunner } from './runnerContext';
import type { LaidOutShape, LayoutInput } from './types';

/** How far around an expanded box the camera keeps on screen, in pixels. */
export const EXPANDED_MARGIN = 48;
/** How long the camera takes to bring an expanded box on screen, in milliseconds. */
export const EXPAND_CAMERA_MS = 240;

/** What expanding containers works from: the view as the expansion leaves it, and what to lay out. */
export interface ExpansionPlan {
  /** The project with the containers expanded, before anything moved. */
  project: ProjectSnapshot;
  /** Its scene. */
  scene: Scene;
  scope: Extract<LayoutScope, { kind: 'expand' }>;
  /** What layout lays out and moves aside; undefined when the expansion moves nothing. */
  input: LayoutInput | undefined;
}

/**
 * What expanding `elements` in a view works from, given the scene drawn before (for the sizes the
 * containers had collapsed) and the containers the zoom shows expanded already; undefined when the
 * expansion cannot be made.
 */
export function planExpansion(
  project: ProjectSnapshot,
  viewId: Id,
  before: Scene | undefined,
  elements: readonly Id[],
  zoomExpanded: ReadonlySet<Id> = NOT_EXPANDED,
): ExpansionPlan | undefined {
  const done = executeCommand(project, setCollapsedCommand(viewId, elements, false));
  if (!done.ok) return undefined;
  return planOpened(done.state, viewId, before, new Set(elements), zoomExpanded);
}

/**
 * The same, for a project in which the containers are expanded already, as the zoom expands them,
 * which the view keeps collapsed: `opened` are those to make room for.
 */
export function planOpened(
  project: ProjectSnapshot,
  viewId: Id,
  before: Scene | undefined,
  opened: ReadonlySet<Id>,
  zoomExpanded: ReadonlySet<Id> = NOT_EXPANDED,
): ExpansionPlan {
  const scene = buildScene(project, viewId, zoomExpanded);
  const containers = new Set<string>();
  for (const shape of scene.shapes) {
    if (opened.has(shape.element) && shape.holdsContents && shape.collapsed === undefined) {
      containers.add(shape.key);
    }
  }
  const collapsed = new Map<string, Size>();
  for (const shape of before?.shapes ?? []) {
    if (!containers.has(shape.key) || shape.collapsed === undefined) continue;
    const rect = laidOutRect(shape);
    collapsed.set(shape.key, { width: rect.width, height: rect.height });
  }
  const scope = { kind: 'expand', containers, collapsed } as const;
  return { project, scene, scope, input: layoutInput(scene, project, scope) };
}

/** A shape an expansion moved aside: from where, to where, relative to its container. */
export interface MovedPlace {
  element: Id;
  container?: Id;
  from: Point;
  to: Point;
}

/**
 * The one action that expands `elements` by hand with what layout gave: `set-collapsed`, and the
 * `set-positions` of what it laid out and moved aside, under `label`, as `Expand "config"`. Says
 * also which shapes it moved aside, and from where.
 */
export function expansionCommand(
  viewId: Id,
  elements: readonly Id[],
  plan: ExpansionPlan,
  laidOut: readonly LaidOutShape[],
  label: string,
): { command: Command; moved: MovedPlace[] } {
  const action = layoutCommand(plan.project, viewId, plan.scene, plan.scope, laidOut);
  const placed = action?.command.type === 'batch' ? action.command.commands : [];
  const byKey = new Map(plan.scene.shapes.map((shape) => [shape.key, shape]));
  const moved: MovedPlace[] = [];
  const seen = new Set<string>();
  for (const each of laidOut) {
    if (each.aside !== true) continue;
    const shape = byKey.get(each.key);
    const key = positionKey(each);
    if (shape?.positioned !== 'stored' || seen.has(key)) continue;
    seen.add(key);
    if (shape.offset.x === each.x && shape.offset.y === each.y) continue;
    moved.push({
      element: each.element,
      ...(each.container === undefined ? {} : { container: each.container }),
      from: { x: shape.offset.x, y: shape.offset.y },
      to: { x: each.x, y: each.y },
    });
  }
  return {
    command: {
      type: 'batch',
      label,
      commands: [setCollapsedCommand(viewId, elements, false), ...placed],
    },
    moved,
  };
}

/**
 * The places expansions by hand moved shapes from, for this tab (ADR 0080, section 4): by view, and
 * by the container that expanded. Reloading the app forgets them, and collapsing then leaves the
 * shapes where they are, which overlaps nothing.
 */
export class ExpansionMemory {
  readonly #byView = new Map<Id, Map<Id, MovedPlace[]>>();

  /** Keeps what expanding these containers moved, for collapsing them again. */
  remember(viewId: Id, elements: readonly Id[], moved: readonly MovedPlace[]): void {
    let byElement = this.#byView.get(viewId);
    if (!byElement) {
      byElement = new Map();
      this.#byView.set(viewId, byElement);
    }
    // What several containers expanded at once moved goes back once all of them collapse: with the
    // first of them.
    const [first, ...rest] = elements;
    if (first === undefined) return;
    byElement.set(first, [...moved]);
    for (const other of rest) byElement.delete(other);
  }

  /** What expanding a container moved, which collapsing it takes back; forgotten once taken. */
  take(viewId: Id, element: Id): MovedPlace[] {
    const byElement = this.#byView.get(viewId);
    const moved = byElement?.get(element) ?? [];
    byElement?.delete(element);
    return moved;
  }
}

/** This tab's memory of the places expansions moved shapes from. */
export const expansionMemory = new ExpansionMemory();

/**
 * The one action that collapses `elements` by hand: `set-collapsed`, and, under the same label, the
 * places back of what expanding them moved aside, for each shape still where the expansion put it.
 * With no place to give back, as after a reload or for a container expanded since the view was made,
 * it closes the room the container leaves instead (`closeRoom.ts`, ADR 0080's clarification of
 * 2026-10-29).
 */
export function collapseCommand(
  project: ProjectSnapshot,
  viewId: Id,
  elements: readonly Id[],
  label: string,
  memory: ExpansionMemory = expansionMemory,
): Command {
  const collapse = setCollapsedCommand(viewId, elements, true);
  const view = project.views.find((each) => each.id === viewId);
  if (!view) return collapse;
  const stored = new Map(view.positions.map((position) => [positionKey(position), position]));
  const back: ShapePosition[] = [];
  for (const element of elements) {
    for (const each of memory.take(viewId, element)) {
      const now = stored.get(positionKey(each));
      if (!now || now.pinned === true || now.x !== each.to.x || now.y !== each.to.y) continue;
      back.push({ ...now, x: each.from.x, y: each.from.y });
    }
  }
  if (back.length === 0) {
    const done = executeCommand(project, collapse);
    const closing = done.ok ? closedRoom(project, done.state, viewId, elements) : [];
    if (closing.length === 0) return collapse;
    return {
      type: 'batch',
      label,
      commands: [collapse, { type: 'set-positions', view: viewId, positions: closing }],
    };
  }
  return {
    type: 'batch',
    label,
    commands: [collapse, { type: 'set-positions', view: viewId, positions: back }],
  };
}

/** How the canvas of the open view expands and collapses in place; each says whether it was done. */
export interface InPlace {
  expand: (elements: readonly Id[], label: string) => Promise<boolean>;
  collapse: (elements: readonly Id[], label: string) => Promise<boolean>;
}

let shown: { view: Id; inPlace: InPlace } | undefined;

/**
 * Says how the canvas showing a view expands and collapses in place, so that the outline and the
 * inspector expand as the canvas does; the function it gives takes it back.
 */
export function showInPlace(view: Id, inPlace: InPlace): () => void {
  const own = { view, inPlace };
  shown = own;
  return () => {
    if (shown === own) shown = undefined;
  };
}

/** How the canvas showing this view expands and collapses in place; none while none shows it. */
export function inPlaceFor(view: Id): InPlace | undefined {
  return shown?.view === view ? shown.inPlace : undefined;
}

/**
 * Where the camera goes so that an expanded box shows whole, `margin` pixels inside the viewport:
 * when it no longer fits at this scale, the camera that shows it whole; when it fits but sticks out,
 * the camera panned by the least that brings it in; none when it shows whole already.
 */
export function cameraToShow(
  camera: Camera,
  viewport: Size,
  rect: Rect,
  margin = EXPANDED_MARGIN,
): Camera | undefined {
  const width = rect.width * camera.scale;
  const height = rect.height * camera.scale;
  if (width + 2 * margin > viewport.width || height + 2 * margin > viewport.height) {
    return fitCamera(rect, viewport, margin);
  }
  const left = rect.x * camera.scale + camera.x;
  const top = rect.y * camera.scale + camera.y;
  const along = (start: number, size: number, room: number) => {
    if (start < margin) return margin - start;
    if (start + size > room - margin) return room - margin - (start + size);
    return 0;
  };
  const dx = along(left, width, viewport.width);
  const dy = along(top, height, viewport.height);
  if (dx === 0 && dy === 0) return undefined;
  return { ...camera, x: camera.x + dx, y: camera.y + dy };
}

/** The places an expansion by zoom gives, and the stored places they stand in for. */
interface ZoomPlaces {
  view: Id;
  expanded: ReadonlySet<Id>;
  /** The view's positions they were worked out from. */
  from: ViewFile['positions'];
  places: ReadonlyMap<string, { position: ShapePosition; was: ShapePosition | undefined }>;
}

/**
 * Expanding by zoom in place (ADR 0080, section 4; ADR 0055): the project to draw the open view from,
 * whose copy of the view's positions holds the places the expansion gives, and the containers the
 * zoom shows expanded. Nothing is stored. A container the zoom expands shows once its places are
 * worked out in the layout worker, so that it never shows covering its neighbours; without the
 * worker, as in tests, it shows at once, as before. A place is drawn only while the shape's stored
 * place is still the one it was worked out from.
 */
export function useExpandedInPlace(
  project: ProjectSnapshot,
  view: ViewFile | undefined,
  expanded: ReadonlySet<Id>,
): { project: ProjectSnapshot; expanded: ReadonlySet<Id> } {
  const runner = useLayoutRunner();
  const [ready, setReady] = useState<ZoomPlaces>();
  const viewId = view?.id;
  const positions = view?.positions;

  useEffect(() => {
    if (!runner || viewId === undefined || positions === undefined || expanded.size === 0) return;
    let current = true;
    const stop = new AbortController();
    // Worked out from the view's stored places, with the whole set the zoom expands.
    const plan = planOpened(project, viewId, undefined, expanded, expanded);
    const stored = new Map(positions.map((position) => [positionKey(position), position]));
    const input = plan.input;
    // Nothing to lay out or move aside: the containers show where they are, once this effect ends.
    const laid = input
      ? runner.layOut(input, { signal: stop.signal })
      : Promise.resolve({ shapes: [] as LaidOutShape[] });
    laid
      .then((result) => {
        if (!current) return;
        const places = new Map<
          string,
          { position: ShapePosition; was: ShapePosition | undefined }
        >();
        for (const each of result.shapes) {
          const key = positionKey(each);
          const was = stored.get(key);
          if (was?.pinned === true) continue;
          places.set(key, {
            position: {
              ...was,
              element: each.element,
              ...(each.container === undefined ? {} : { container: each.container }),
              x: each.x,
              y: each.y,
            },
            was,
          });
        }
        setReady({ view: viewId, expanded, from: positions, places });
      })
      .catch(() => {
        // Stopped or failed: the containers show expanded where they are, as before.
        if (current) setReady({ view: viewId, expanded, from: positions, places: new Map() });
      });
    return () => {
      current = false;
      stop.abort();
    };
    // The places follow the view's positions and the containers the zoom expands, not each change
    // of the project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runner, viewId, positions, expanded]);

  return useMemo(() => {
    if (!view || expanded.size === 0) return { project, expanded };
    if (!runner) return { project, expanded };
    const known = ready?.view === view.id ? ready : undefined;
    // Until the places of what the zoom expanded come, what they are for shows as it was.
    const all = known !== undefined && [...expanded].every((id) => known.expanded.has(id));
    const shown = all
      ? expanded
      : new Set(known ? [...expanded].filter((id) => known.expanded.has(id)) : []);
    if (!known || known.places.size === 0 || shown.size === 0) {
      return { project, expanded: shown.size === 0 ? NOT_EXPANDED : shown };
    }
    const stored = new Map(view.positions.map((position) => [positionKey(position), position]));
    const placed = new Map<string, ShapePosition>();
    for (const [key, { position, was }] of known.places) {
      const now = stored.get(key);
      const unmoved =
        now === undefined
          ? was === undefined
          : was !== undefined && now.x === was.x && now.y === was.y;
      if (unmoved) placed.set(key, position);
    }
    if (placed.size === 0) return { project, expanded: shown };
    const kept = view.positions.map((position) => placed.get(positionKey(position)) ?? position);
    const added = [...placed.entries()]
      .filter(([key]) => !stored.has(key))
      .map(([, position]) => position);
    const drawn: ViewFile = { ...view, positions: [...kept, ...added] };
    return {
      project: { ...project, views: project.views.map((each) => (each === view ? drawn : each)) },
      expanded: shown,
    };
  }, [project, view, expanded, runner, ready]);
}
