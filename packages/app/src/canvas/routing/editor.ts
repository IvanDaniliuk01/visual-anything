/**
 * Editing a relation's route on the canvas, as in draw.io (ADR 0039, `relation-routing.md` §7): while
 * exactly one relation is selected, its line shows handles at its ends, its bend points and the middle
 * of each segment.
 *
 * - Dragging an end attaches it to a connection point or a border point of its shape, or
 *   automatically deep inside; dropped on another element's shape, it reconnects the relation there.
 * - Dragging a bend point moves it, snapping to its neighbours' x and y, and, while the grid shows
 *   and snapping is on, to the grid of the frame its bend points are kept in (A3); dragging the
 *   middle of a straight or curved segment adds one there; dragging a segment of an orthogonal route
 *   moves it, along a grid line while snapping.
 * - A double-click on a bend point, or Delete once it is chosen, removes it. Alt turns snapping off.
 * - Edit the route… enters a mode where the keys do all of this, sent as one action on Enter.
 *
 * The controller hands it its pointer and key events first; each gesture is drawn above the scene
 * and sent as one command when it ends, and its line keeps showing as dropped until the change comes
 * back.
 */
import {
  MAX_BEND_POINTS,
  modelIndexOf,
  relationLabel,
  type Command,
  type ProjectSnapshot,
  type ResolvedAttachment,
  type ResolvedRoute,
  type SetRouteCommand,
} from '@visual-anything/core';
import type { EndAttachment, Id } from '@visual-anything/schema';
import type { Selection } from '../../editor/selection';
import { t } from '../../i18n';
import { IS_APPLE } from '../../live/platform';
import { arrowheadAt, distance, type Point } from '../geometry';
import { GRID_STEP, nudgedOffset, snap } from '../grid';
import type { IndexedScene, Skipped } from '../hit';
import { midpointOf, type RouteEnd } from '../route';
import { relationLinesOf, type ElementShape, type RelationLine } from '../scene';
import {
  frameOriginOf,
  reconnectCommand,
  relativeBendPoints,
  routeOfLine,
  sameAttachment,
  storedAttachment,
  viewIn,
} from './commands';
import { STUB, attachPoint, nearestBorderAttach, type Attach, type Side } from './hand';
import { handleAt, handlesOf, segmentAt, stubsOf, type Handle } from './handles';
import { endOutline, placeOfEnd, routeBoxOf } from './outline-ends';
import { sameHandle, type RouteOverlay } from './overlay';
import { routeLine, type LineEnds } from './scene-routes';
import { draggedBends, moveSegment, type SegmentEnd } from './segments';
import { aimEnd, snapBend, type EndAim } from './snap';

/** How close to a handle, in screen pixels, the pointer grabs it. */
export const HANDLE_REACH = 8;
/** How close to a segment, in screen pixels, the pointer grabs it. */
const SEGMENT_REACH = 6;
/** How far the pointer moves, in screen pixels, before a press on a handle drags it. */
const DRAG_THRESHOLD = 4;
/** How far the arrow keys move a handle, in canvas units, and with Shift. */
const STEP = 1;
const BIG_STEP = 8;

/** What the route editor asks of the canvas. */
export interface RouteEditorHost {
  readonly renderer: {
    setRouteOverlay(overlay: RouteOverlay | undefined): void;
    showsOutline(key: string): boolean;
    readonly hiddenByEmphasis: Skipped;
  };
  /** What the canvas shows now; undefined before a scene shows. */
  state():
    | {
        indexed: IndexedScene;
        project: ProjectSnapshot;
        viewId: Id;
        selection: Selection;
        editable: boolean;
      }
    | undefined;
  scale(): number;
  /**
   * Whether bend points dragged or moved by hand snap to the grid now: while it shows, with snapping
   * on (A3). Without it, they never do.
   */
  snapping?(): boolean;
  /** Sends a command; resolves to whether the local program applied it. */
  command(command: Command): Promise<boolean>;
  announce(text: string): void;
  /** Writes the caption beside the pointer, at a point on screen, or clears it. */
  caption(caption: { text: string; detail?: string } | undefined, at?: Point): void;
  /** Selects a relation alone. */
  select(relation: Id): void;
}

/** How a route is being changed, before it is sent: where its ends attach and its bend points. */
interface Draft {
  /** What each end attaches to now: `undefined` leaves it as it is, `null` attaches it automatically. */
  from?: EndAttachment | null;
  to?: EndAttachment | null;
  /** The bend points, in scene units; `undefined` leaves them as they are. */
  bendPoints?: Point[];
  /** Which coordinates of each bend point snapped, which are sent unrounded. */
  snapped?: { x: boolean; y: boolean }[];
  /** The end reconnected to another element's shape. */
  reconnect?: { end: 'from' | 'to'; shape: ElementShape };
}

type Drag =
  | {
      kind: 'end';
      line: RelationLine;
      end: 'from' | 'to';
      start: Point;
      moved: boolean;
      aim: EndAim;
    }
  | {
      kind: 'bend';
      line: RelationLine;
      index: number;
      /** Whether the bend point was added from the middle of a segment, by this drag. */
      added: boolean;
      start: Point;
      moved: boolean;
      draft: Draft;
      /** Where the route's bend points are kept from, once the grid has asked for it. */
      origin?: Point;
    }
  | {
      kind: 'segment';
      line: RelationLine;
      segment: number;
      start: Point;
      world: Point;
      moved: boolean;
      draft: Draft;
      origin?: Point;
    };

/** Editing a route from the keyboard: the route as it was, how it is changing, and the handle chosen. */
interface KeyEdit {
  relation: Id;
  line: RelationLine;
  draft: Draft;
  chosen: Handle;
}

export class RouteEditor {
  private drag: Drag | undefined;
  private keys: KeyEdit | undefined;
  /** The bend point chosen by a click, which Delete removes. */
  private chosenBend: { line: RelationLine; index: number } | undefined;
  /** A route sent, shown as it was dropped until the change comes back. */
  private pending: { project: ProjectSnapshot; overlay: RouteOverlay } | undefined;
  private shown: RouteOverlay | undefined;

  constructor(private readonly host: RouteEditorHost) {}

  /** Whether a drag of a handle or a segment is under way. */
  get dragging(): boolean {
    return this.drag !== undefined;
  }

  /** Whether the keys edit a route now. */
  get editingFromKeys(): boolean {
    return this.keys !== undefined;
  }

  /**
   * The line whose route can be edited: the only thing selected is a relation drawn as a line of its
   * own, which the emphasis does not hide, while the project can be changed.
   */
  line(): RelationLine | undefined {
    const state = this.host.state();
    if (!state || !state.editable) return undefined;
    const { selection, indexed } = state;
    if (
      selection.relations.size !== 1 ||
      selection.elements.size > 0 ||
      selection.freeShapes.size > 0
    ) {
      return undefined;
    }
    const [id] = selection.relations;
    const line = id === undefined ? undefined : relationLinesOf(indexed.scene).get(id);
    if (!line || line.aggregate || this.host.renderer.hiddenByEmphasis.has(line.relation))
      return undefined;
    return line;
  }

  /** The scene, project or selection changed: draws the handles of what is selected now. */
  refresh(): void {
    const state = this.host.state();
    if (this.pending && state?.project !== this.pending.project) this.pending = undefined;
    const line = this.line();
    if (this.keys && (!line || line.relation !== this.keys.relation)) this.keys = undefined;
    else if (this.keys && line) this.keys.line = line;
    if (this.chosenBend && this.chosenBend.line.relation !== line?.relation)
      this.chosenBend = undefined;
    if (this.drag) return;
    if (this.pending) {
      this.show(this.pending.overlay);
      return;
    }
    if (this.keys && line) {
      this.showKeys();
      return;
    }
    if (!line) {
      this.show(undefined);
      return;
    }
    const chosen = this.chosenBend && line.hand?.bendPoints[this.chosenBend.index];
    const handles = handlesOf(line, this.host.scale());
    this.show({
      relation: line.relation,
      handles,
      ...(chosen && this.chosenBend
        ? { chosen: { kind: 'bend', index: this.chosenBend.index, at: chosen } }
        : {}),
    });
  }

  /** The cursor over a point, when it is over a handle or a segment that can be dragged. */
  cursorAt(world: Point): string | undefined {
    const line = this.line();
    if (!line || this.drag) return undefined;
    const handle = handleAt(
      handlesOf(line, this.host.scale()),
      world,
      HANDLE_REACH / this.host.scale(),
    );
    if (handle) return handle.kind === 'end' ? 'crosshair' : 'move';
    if (orthogonal(line)) {
      const segment = segmentAt(line.route, world, SEGMENT_REACH / this.host.scale());
      if (segment !== undefined && this.segmentDraggable(line, segment)) {
        const a = line.route[segment] as Point;
        const b = line.route[segment + 1] as Point;
        return a.y === b.y ? 'row-resize' : 'col-resize';
      }
    }
    return undefined;
  }

  /**
   * A press of the main button at a point: on a handle, or on a segment of the selected orthogonal
   * line, it starts a drag and says so; elsewhere it leaves the press to the canvas.
   */
  press(world: Point, screen: Point, modified: boolean): boolean {
    const line = this.line();
    if (!line || this.keys) return false;
    const scale = this.host.scale();
    const handle = handleAt(handlesOf(line, scale), world, HANDLE_REACH / scale);
    if (handle) {
      this.drag = this.dragOf(line, handle, screen, world);
      if (handle.kind === 'bend') this.chosenBend = { line, index: handle.index };
      return true;
    }
    if (modified || !orthogonal(line)) return false;
    const segment = segmentAt(line.route, world, SEGMENT_REACH / scale);
    if (segment === undefined || !this.segmentDraggable(line, segment)) return false;
    this.drag = { kind: 'segment', line, segment, start: screen, world, moved: false, draft: {} };
    return true;
  }

  private dragOf(line: RelationLine, handle: Handle, screen: Point, world: Point): Drag {
    switch (handle.kind) {
      case 'end':
        return {
          kind: 'end',
          line,
          end: handle.end,
          start: screen,
          moved: false,
          aim: { kind: 'back' },
        };
      case 'bend':
        return {
          kind: 'bend',
          line,
          index: handle.index,
          added: false,
          start: screen,
          moved: false,
          draft: { bendPoints: [...(line.hand?.bendPoints ?? [])] },
        };
      case 'middle':
        if (orthogonal(line)) {
          return {
            kind: 'segment',
            line,
            segment: handle.segment,
            start: screen,
            world,
            moved: false,
            draft: {},
          };
        }
        return {
          kind: 'bend',
          line,
          index: handle.segment,
          added: true,
          start: screen,
          moved: false,
          draft: { bendPoints: [...(line.hand?.bendPoints ?? [])] },
        };
    }
  }

  /** The pointer moved while a drag is under way. */
  move(world: Point, screen: Point, alt: boolean): void {
    const drag = this.drag;
    const state = this.host.state();
    if (!drag || !state) return;
    if (!drag.moved) {
      if (distance(screen, drag.start) < DRAG_THRESHOLD) return;
      drag.moved = true;
      if (drag.kind === 'bend' && drag.added) {
        const bends = drag.draft.bendPoints ?? [];
        if (bends.length >= MAX_BEND_POINTS) {
          this.host.announce(
            t('A route has at most {limit} bend points.', { limit: MAX_BEND_POINTS }),
          );
          this.drag = undefined;
          this.refresh();
          return;
        }
        bends.splice(drag.index, 0, world);
        drag.draft.snapped = bends.map(() => ({ x: false, y: false }));
        this.chosenBend = { line: drag.line, index: drag.index };
      }
    }
    const scale = this.host.scale();
    switch (drag.kind) {
      case 'end': {
        drag.aim = aimEnd(
          state.indexed,
          state.project,
          drag.line,
          drag.end,
          world,
          scale,
          alt,
          (shape) => this.host.renderer.showsOutline(shape.key),
          this.host.renderer.hiddenByEmphasis,
        );
        this.showEndDrag(drag, world);
        this.host.caption(endCaption(drag.aim, alt), screen);
        return;
      }
      case 'bend': {
        const bends = drag.draft.bendPoints ?? [];
        const neighbours = [
          bends[drag.index - 1] ?? drag.line.from,
          bends[drag.index + 1] ?? drag.line.to,
        ];
        const snapped = snapBend(world, neighbours, scale, alt, this.gridOf(drag, state, alt));
        bends[drag.index] = snapped.at;
        const marks = drag.draft.snapped ?? bends.map(() => ({ x: false, y: false }));
        marks[drag.index] = snapped.snapped;
        drag.draft.snapped = marks;
        this.showDraft(drag.line, drag.draft, { kind: 'bend', index: drag.index, at: snapped.at });
        return;
      }
      case 'segment': {
        const a = drag.line.route[drag.segment] as Point;
        const b = drag.line.route[drag.segment + 1] as Point;
        const horizontal = a.y === b.y;
        let value = horizontal ? a.y + (world.y - drag.world.y) : a.x + (world.x - drag.world.x);
        // On the grid, the segment runs along a grid line of the route's frame.
        const grid = this.gridOf(drag, state, alt);
        if (grid) {
          const from = horizontal ? grid.origin.y : grid.origin.x;
          value = from + snap(value - from, grid.step);
        }
        const moved = moveSegment(
          drag.line.route,
          drag.segment,
          value,
          segmentEnds(state.indexed, drag.line),
        );
        // Only the corners near the segment are kept, and the preview routes through them, as the
        // line will be drawn (ADR 0039's clarification of 2026-10-30).
        drag.draft.bendPoints = draggedBends(
          drag.line.route,
          moved,
          stubSides(drag.line),
          drag.line.hand?.bendPoints ?? [],
        );
        this.showDraft(drag.line, drag.draft);
        return;
      }
    }
  }

  /**
   * The grid a drag of a bend point or a segment snaps to: none with Alt, or while the grid is hidden
   * or snapping is off; else the step, from the origin the route's bend points are kept from, which
   * is worked out once for the drag.
   */
  private gridOf(
    drag: Extract<Drag, { kind: 'bend' | 'segment' }>,
    state: NonNullable<ReturnType<RouteEditorHost['state']>>,
    alt: boolean,
  ): { origin: Point; step: number } | undefined {
    if (alt || this.host.snapping?.() !== true) return undefined;
    drag.origin ??= this.originOf(state, drag.line);
    return { origin: drag.origin, step: GRID_STEP };
  }

  /** Where a line's bend points are kept from: its frame's corner, or the canvas's origin. */
  private originOf(state: NonNullable<ReturnType<RouteEditorHost['state']>>, line: RelationLine) {
    const view = viewIn(state.project, state.viewId);
    const route = view ? routeOfLine(state.project, view, state.indexed, line) : undefined;
    return frameOriginOf(state.indexed, line, route);
  }

  /** The pointer was let go: sends what the drag did, if anything. */
  release(): void {
    const drag = this.drag;
    this.drag = undefined;
    this.host.caption(undefined);
    const state = this.host.state();
    if (!drag || !state || !drag.moved) {
      this.refresh();
      return;
    }
    const command = this.commandOf(drag, state);
    if (!command) {
      this.refresh();
      return;
    }
    this.send(command, state.project);
  }

  /** Stops the drag under way, leaving the route as it was. */
  cancel(): void {
    if (!this.drag) return;
    this.drag = undefined;
    this.host.caption(undefined);
    this.refresh();
  }

  /** A double-click: on a bend point, removes it. Says whether it did. */
  doubleClick(world: Point): boolean {
    const line = this.line();
    if (!line || this.keys) return false;
    const handle = handleAt(
      handlesOf(line, this.host.scale()),
      world,
      HANDLE_REACH / this.host.scale(),
    );
    if (handle?.kind !== 'bend') return false;
    this.removeBend(line, handle.index);
    return true;
  }

  /**
   * A key, before the canvas takes it: while the keys edit a route, the keys of that mode; otherwise
   * Delete or Backspace with a bend point chosen, which removes it. Says whether it took the key.
   */
  keyDown(event: KeyboardEvent): boolean {
    if (this.keys) return this.keyEdit(event);
    if ((event.key === 'Delete' || event.key === 'Backspace') && this.chosenBend) {
      const line = this.line();
      if (!line || line.relation !== this.chosenBend.line.relation) return false;
      event.preventDefault();
      this.removeBend(line, this.chosenBend.index);
      return true;
    }
    if (event.key === 'Escape' && this.drag) {
      this.cancel();
      return true;
    }
    return false;
  }

  /**
   * Edit the route…: the keys edit the route of a relation, which is selected alone, from its start.
   * Says whether they do.
   */
  editFromKeys(relation: Id): boolean {
    const state = this.host.state();
    if (!state?.editable) return false;
    const line = relationLinesOf(state.indexed.scene).get(relation);
    if (!line || line.aggregate) return false;
    if (this.line()?.relation !== relation) this.host.select(relation);
    const handles = handlesOf(line, this.host.scale());
    this.keys = { relation, line, draft: {}, chosen: handles[0] as Handle };
    this.chosenBend = undefined;
    const index = state.project;
    this.host.announce(
      t(
        'Editing the route of "{name}". Tab and Shift+Tab move between its handles; the arrow keys move the handle; Insert adds a bend point; Delete removes one; A attaches an end automatically; Enter applies; Escape cancels.',
        { name: labelIn(index, relation) },
      ),
    );
    this.showKeys();
    return true;
  }

  private removeBend(line: RelationLine, index: number): void {
    const state = this.host.state();
    if (!state) return;
    const bends = [...(line.hand?.bendPoints ?? [])];
    bends.splice(index, 1);
    this.chosenBend = undefined;
    const command = this.bendCommand(state, line, bends);
    if (command) this.send(command, state.project, this.overlayOf(line, { bendPoints: bends }));
  }

  /** What a drag sends: a `set-route`, a reconnection, or nothing when nothing changed. */
  private commandOf(
    drag: Drag,
    state: NonNullable<ReturnType<RouteEditorHost['state']>>,
  ): Command | undefined {
    const { line } = drag;
    switch (drag.kind) {
      case 'end': {
        const { aim } = drag;
        if (aim.kind === 'attach') {
          const current = storedAttachment(line.hand?.route[drag.end] ?? AUTOMATIC);
          if (sameAttachment(current, aim.attachment)) return undefined;
          return {
            type: 'set-route',
            view: state.viewId,
            relation: line.relation,
            [drag.end]: aim.attachment,
          };
        }
        if (aim.kind === 'reconnect') {
          return reconnectCommand(
            state.project,
            state.viewId,
            line.relation,
            drag.end,
            aim.shape.element,
            aim.attachment,
          );
        }
        return undefined;
      }
      case 'bend':
        return this.bendCommand(state, line, drag.draft.bendPoints ?? [], drag.draft.snapped);
      case 'segment': {
        if (!drag.draft.bendPoints) return undefined;
        return this.bendCommand(state, line, drag.draft.bendPoints);
      }
    }
  }

  /** The `set-route` that gives a line these bend points, in scene units; undefined when it has them. */
  private bendCommand(
    state: NonNullable<ReturnType<RouteEditorHost['state']>>,
    line: RelationLine,
    bends: readonly Point[],
    snapped?: readonly { x: boolean; y: boolean }[],
  ): Command | undefined {
    if (bends.length > MAX_BEND_POINTS) {
      this.host.announce(t('A route has at most {limit} bend points.', { limit: MAX_BEND_POINTS }));
      return undefined;
    }
    const current = line.hand?.bendPoints ?? [];
    if (
      bends.length === current.length &&
      bends.every((point, at) => samePoint(point, current[at]))
    ) {
      return undefined;
    }
    const view = viewIn(state.project, state.viewId);
    if (!view) return undefined;
    const route = routeOfLine(state.project, view, state.indexed, line);
    const origin = frameOriginOf(state.indexed, line, route);
    return {
      type: 'set-route',
      view: state.viewId,
      relation: line.relation,
      bendPoints: bends.length === 0 ? null : relativeBendPoints(bends, origin, snapped),
    };
  }

  /** Sends a change, and shows the route as changed until the change comes back. */
  private send(command: Command, from: ProjectSnapshot, overlay = this.shown): void {
    const shown = overlay && { ...overlay, handles: [], chosen: undefined };
    if (shown?.preview) {
      this.pending = { project: from, overlay: shown };
      this.show(shown);
    }
    void this.host.command(command).then(
      (applied) => {
        if (this.pending?.project === from && (!applied || this.host.state()?.project === from)) {
          this.pending = undefined;
        }
        this.refresh();
      },
      () => {
        if (this.pending?.project === from) this.pending = undefined;
        this.refresh();
      },
    );
  }

  private show(overlay: RouteOverlay | undefined): void {
    this.shown = overlay;
    this.host.renderer.setRouteOverlay(overlay);
  }

  /** Draws a dragged end: the line to where it would attach, and what it would attach to. */
  private showEndDrag(drag: Extract<Drag, { kind: 'end' }>, world: Point): void {
    const state = this.host.state();
    if (!state) return;
    const { aim } = drag;
    let draft: Draft;
    if (aim.kind === 'attach') draft = { [drag.end]: aim.attachment };
    else if (aim.kind === 'reconnect') {
      draft = { [drag.end]: aim.attachment, reconnect: { end: drag.end, shape: aim.shape } };
    } else draft = {};
    const overlay = this.overlayOf(drag.line, draft);
    if (aim.kind === 'back' || aim.kind === 'refused') {
      // The line runs to the pointer.
      const preview = overlay.preview ?? drag.line;
      const route =
        drag.end === 'to'
          ? [...preview.route.slice(0, -1), world]
          : [world, ...preview.route.slice(1)];
      overlay.preview = lineAlong(drag.line, route, undefined);
      if (aim.kind === 'refused') overlay.refused = aim.shape.rect;
    } else {
      overlay.points = aim.points;
      if (aim.tick) overlay.tick = aim.tick;
      if (aim.spot) overlay.spot = aim.spot;
      if (aim.outline) overlay.outline = aim.outline;
    }
    overlay.handles = [];
    this.show(overlay);
  }

  /** Draws a route as a draft changes it, with its handles. */
  private showDraft(line: RelationLine, draft: Draft, chosen?: Handle): void {
    const overlay = this.overlayOf(line, draft);
    const preview = overlay.preview ?? line;
    overlay.handles = handlesOf(preview, this.host.scale());
    if (chosen) overlay.chosen = chosen;
    this.show(overlay);
  }

  /** The overlay of a line as a draft changes it: the line, drawn in place of its drawing. */
  private overlayOf(line: RelationLine, draft: Draft): RouteOverlay {
    const state = this.host.state();
    const preview = state ? previewOf(state.indexed, line, draft) : undefined;
    return { relation: line.relation, handles: [], ...(preview ? { preview } : {}) };
  }

  /** Draws the route the keys edit, with its handles and the one chosen. */
  private showKeys(): void {
    const keys = this.keys;
    const state = this.host.state();
    if (!keys || !state) return;
    const preview = previewOf(state.indexed, keys.line, keys.draft) ?? keys.line;
    const handles = handlesOf(preview, this.host.scale());
    const chosen = handles.find((handle) => sameHandle(handle, keys.chosen)) ?? handles[0];
    if (chosen) keys.chosen = chosen;
    this.show({
      relation: keys.relation,
      handles,
      ...(chosen ? { chosen } : {}),
      ...(changed(keys.draft) ? { preview } : {}),
    });
  }

  /** A key while the keys edit a route. */
  private keyEdit(event: KeyboardEvent): boolean {
    const keys = this.keys as KeyEdit;
    const state = this.host.state();
    if (!state) return false;
    const preview = previewOf(state.indexed, keys.line, keys.draft) ?? keys.line;
    const handles = handlesOf(preview, this.host.scale());
    const at = Math.max(
      0,
      handles.findIndex((handle) => sameHandle(handle, keys.chosen)),
    );
    const take = () => {
      event.preventDefault();
      this.showKeys();
      return true;
    };
    switch (event.key) {
      case 'Tab': {
        const next = handles[(at + (event.shiftKey ? handles.length - 1 : 1)) % handles.length];
        if (next) {
          keys.chosen = next;
          this.host.announce(describeHandle(preview, next, handles));
        }
        return take();
      }
      case 'Escape':
        event.preventDefault();
        this.keys = undefined;
        this.host.announce(t('Route editing cancelled; the route is as it was.'));
        this.refresh();
        return true;
      case 'Enter':
        if (event.ctrlKey || event.metaKey) return this.insertBend(event, preview, handles);
        event.preventDefault();
        this.applyKeys(state, preview);
        return true;
      case 'Insert':
        return this.insertBend(event, preview, handles);
      case 'Delete':
      case 'Backspace': {
        if (keys.chosen.kind !== 'bend') {
          this.host.announce(t('Choose a bend point with Tab to remove it.'));
          return take();
        }
        const bends = [...(preview.hand?.bendPoints ?? draftBends(keys))];
        bends.splice(keys.chosen.index, 1);
        keys.draft = {
          ...keys.draft,
          bendPoints: bends,
          snapped: bends.map(() => ({ x: false, y: false })),
        };
        keys.chosen = { kind: 'end', end: 'from', at: preview.from, byHand: false };
        this.host.announce(t('Bend point removed.'));
        return take();
      }
      case 'a':
      case 'A': {
        if (event.ctrlKey || event.metaKey || event.altKey) return false;
        if (keys.chosen.kind !== 'end') {
          this.host.announce(t('Choose the start or the end with Tab to attach it automatically.'));
          return take();
        }
        keys.draft = { ...keys.draft, [keys.chosen.end]: null };
        this.host.announce(t('Attached automatically.'));
        return take();
      }
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
        this.arrow(event, state, preview);
        return take();
      default:
        // Everything else waits for the mode to end, but zooming and panning.
        return !['+', '=', '-', '_', '0', ' '].includes(event.key) && event.key.length === 1;
    }
  }

  private insertBend(
    event: KeyboardEvent,
    preview: RelationLine,
    handles: readonly Handle[],
  ): boolean {
    event.preventDefault();
    const keys = this.keys as KeyEdit;
    const bends = [...draftBends(keys, preview)];
    if (bends.length >= MAX_BEND_POINTS) {
      this.host.announce(t('A route has at most {limit} bend points.', { limit: MAX_BEND_POINTS }));
      return true;
    }
    const chosen = keys.chosen;
    let index: number;
    let at: Point;
    if (chosen.kind === 'bend') {
      index = chosen.index + 1;
      const next = bends[index] ?? preview.to;
      at = { x: Math.round((chosen.at.x + next.x) / 2), y: Math.round((chosen.at.y + next.y) / 2) };
    } else if (chosen.kind === 'middle') {
      index = insertionIndex(preview, chosen, handles);
      at = { x: Math.round(chosen.at.x), y: Math.round(chosen.at.y) };
    } else {
      this.host.announce(t('Choose a segment or a bend point with Tab to add a bend point there.'));
      this.showKeys();
      return true;
    }
    bends.splice(index, 0, at);
    keys.draft = {
      ...keys.draft,
      bendPoints: bends,
      snapped: bends.map(() => ({ x: false, y: false })),
    };
    keys.chosen = { kind: 'bend', index, at };
    this.host.announce(t('Bend point added.'));
    this.showKeys();
    return true;
  }

  /** An arrow key while the keys edit a route: moves the handle chosen. */
  private arrow(
    event: KeyboardEvent,
    state: NonNullable<ReturnType<RouteEditorHost['state']>>,
    preview: RelationLine,
  ): void {
    const keys = this.keys as KeyEdit;
    const step = event.shiftKey ? BIG_STEP : STEP;
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    const chosen = keys.chosen;
    // While snapping, Shift and an arrow key go to the next grid line of the route's frame (A3).
    const origin =
      event.shiftKey && this.host.snapping?.() === true
        ? this.originOf(state, keys.line)
        : undefined;
    const along = (value: number, from: number, by: number) =>
      origin === undefined || by === 0
        ? value + by
        : from + nudgedOffset(Math.round((value - from) * 1e6) / 1e6, by > 0 ? 1 : -1);
    switch (chosen.kind) {
      case 'bend': {
        const bends = [...draftBends(keys, preview)];
        const point = bends[chosen.index];
        if (!point) return;
        const moved = {
          x: along(point.x, origin?.x ?? 0, dx),
          y: along(point.y, origin?.y ?? 0, dy),
        };
        bends[chosen.index] = moved;
        keys.draft = {
          ...keys.draft,
          bendPoints: bends,
          snapped: bends.map(() => ({ x: false, y: false })),
        };
        keys.chosen = { ...chosen, at: moved };
        return;
      }
      case 'middle': {
        if (orthogonal(preview)) {
          const a = preview.route[chosen.segment] as Point;
          const b = preview.route[chosen.segment + 1] as Point;
          const horizontal = a.y === b.y;
          if ((horizontal && dy === 0) || (!horizontal && dx === 0)) return;
          const value = horizontal
            ? along(a.y, origin?.y ?? 0, dy)
            : along(a.x, origin?.x ?? 0, dx);
          const route = moveSegment(
            preview.route,
            chosen.segment,
            value,
            segmentEnds(state.indexed, keys.line),
          );
          keys.draft = {
            ...keys.draft,
            bendPoints: draggedBends(
              preview.route,
              route,
              stubSides(preview),
              draftBends(keys, preview),
            ),
          };
          const middle = horizontal
            ? { x: chosen.at.x, y: chosen.at.y + (value - a.y) }
            : { x: chosen.at.x + (value - a.x), y: chosen.at.y };
          const next = previewOf(state.indexed, keys.line, keys.draft) ?? preview;
          const middles = handlesOf(next, this.host.scale()).filter(
            (handle) => handle.kind === 'middle',
          );
          keys.chosen = middles.reduce<Handle>(
            (best, handle) =>
              distance(handle.at, middle) < distance(best.at, middle) ? handle : best,
            middles[0] ?? chosen,
          );
          return;
        }
        // On a straight or curved route, moving the middle of a segment adds a bend point there.
        const bends = [...draftBends(keys, preview)];
        if (bends.length >= MAX_BEND_POINTS) return;
        const index = chosen.segment;
        const at = { x: Math.round(chosen.at.x + dx), y: Math.round(chosen.at.y + dy) };
        bends.splice(index, 0, at);
        keys.draft = {
          ...keys.draft,
          bendPoints: bends,
          snapped: bends.map(() => ({ x: false, y: false })),
        };
        keys.chosen = { kind: 'bend', index, at };
        return;
      }
      case 'end': {
        const drawn = keys.line.ends?.[chosen.end];
        const shape = drawn?.kind === 'shape' ? state.indexed.byKey.get(drawn.key) : undefined;
        if (!shape) {
          this.host.announce(
            t('This end is the middle of another relation, and moves with its line.'),
          );
          return;
        }
        const attachment = alongBorder(shape, chosen.at, event.key, event.shiftKey);
        if (!attachment) return;
        keys.draft = { ...keys.draft, [chosen.end]: attachment };
        return;
      }
    }
  }

  /** Enter while the keys edit a route: sends everything changed as one action. */
  private applyKeys(
    state: NonNullable<ReturnType<RouteEditorHost['state']>>,
    preview: RelationLine,
  ): void {
    const keys = this.keys as KeyEdit;
    this.keys = undefined;
    const { line, draft } = keys;
    const command: SetRouteCommand = {
      type: 'set-route',
      view: state.viewId,
      relation: line.relation,
    };
    let anything = false;
    for (const end of ['from', 'to'] as const) {
      const wanted = draft[end];
      if (wanted === undefined) continue;
      const current = storedAttachment(line.hand?.route[end] ?? AUTOMATIC);
      if (sameAttachment(current, wanted)) continue;
      command[end] = wanted;
      anything = true;
    }
    if (draft.bendPoints) {
      const bend = this.bendCommand(state, line, draft.bendPoints, draft.snapped);
      if (bend?.type === 'set-route') {
        command.bendPoints = bend.bendPoints ?? null;
        anything = true;
      }
    }
    if (!anything) {
      this.host.announce(t('The route did not change.'));
      this.refresh();
      return;
    }
    const view = viewIn(state.project, state.viewId);
    const label = labelIn(state.project, line.relation);
    const byHandAfter =
      (command.from ?? storedAttachment(line.hand?.route.from ?? AUTOMATIC)) !== null ||
      (command.to ?? storedAttachment(line.hand?.route.to ?? AUTOMATIC)) !== null ||
      (command.bendPoints === undefined
        ? (line.hand?.bendPoints.length ?? 0) > 0
        : command.bendPoints !== null) ||
      (line.style ?? 'orthogonal') !== 'orthogonal';
    const viewName = view?.name ?? state.viewId;
    const done = byHandAfter
      ? `Route "${label}" by hand in "${viewName}"`
      : `Reset the route of "${label}" in "${viewName}"`;
    this.send(command, state.project, { relation: line.relation, handles: [], preview });
    this.host.announce(t.message(done));
  }

  /** Whether a segment of an orthogonal line can be dragged: any but a stub of an end attached by hand. */
  private segmentDraggable(line: RelationLine, segment: number): boolean {
    const stubs = stubsOf(line);
    const a = line.route[segment] as Point;
    const b = line.route[segment + 1] as Point;
    const short = distance(a, b) <= STUB + 1e-6;
    if (segment === 0 && stubs.from && short) return false;
    if (segment === line.route.length - 2 && stubs.to && short) return false;
    return true;
  }
}

const AUTOMATIC: ResolvedAttachment = { kind: 'automatic' };

/** Whether a line is drawn orthogonally. */
function orthogonal(line: RelationLine): boolean {
  return (line.style ?? 'orthogonal') === 'orthogonal';
}

/** The bend points the keys work on: the draft's, or the line's. */
function draftBends(keys: KeyEdit, preview?: RelationLine): readonly Point[] {
  return keys.draft.bendPoints ?? preview?.hand?.bendPoints ?? keys.line.hand?.bendPoints ?? [];
}

/** Whether a draft changes anything. */
function changed(draft: Draft): boolean {
  return (
    draft.from !== undefined ||
    draft.to !== undefined ||
    draft.bendPoints !== undefined ||
    draft.reconnect !== undefined
  );
}

/** Where a new bend point goes in the list, from the middle of a segment of a straight or curved route. */
function insertionIndex(
  line: RelationLine,
  middle: Extract<Handle, { kind: 'middle' }>,
  handles: readonly Handle[],
): number {
  if (!orthogonal(line)) return middle.segment;
  // On an orthogonal route: after the bend points the route passes before it.
  let count = 0;
  for (const handle of handles) {
    if (handle === middle || sameHandle(handle, middle)) break;
    if (handle.kind === 'bend') count += 1;
  }
  return count;
}

/** How the ends of a line take a move of the segment that touches them. */
function segmentEnds(
  indexed: IndexedScene,
  line: RelationLine,
): { from: SegmentEnd; to: SegmentEnd } {
  const endOf = (which: 'from' | 'to', point: Point, next: Point | undefined): SegmentEnd => {
    const drawn = line.ends?.[which];
    const shape = drawn?.kind === 'shape' ? indexed.byKey.get(drawn.key) : undefined;
    if (!shape) return { kind: 'fixed' };
    const attachment = line.hand?.route[which];
    // An end attached at a place inside its shape is a point of its own, which does not slide.
    if (attachment?.kind === 'inside') return { kind: 'fixed' };
    // An automatic end reaches a shape by its box, with its name tag (ADR 0066's clarifications).
    const box = shape.points ? shape.rect : routeBoxOf(shape, shape.rect);
    // On an outline, the side the route crosses the box by, which the end lies inside of.
    const crossed =
      next && endOutline(shape, shape.rect) ? placeOfEnd(box, point, next)?.side : undefined;
    const side =
      attachment && attachment.kind !== 'automatic'
        ? attachment.side
        : (crossed ?? sideOfPoint(shape, point));
    if (attachment && attachment.kind !== 'automatic') return { kind: 'stub', side };
    if (shape.points) return { kind: 'stub', side };
    return { kind: 'slides', rect: box, side };
  };
  return {
    from: endOf('from', line.from, line.route[1]),
    to: endOf('to', line.to, line.route.at(-2)),
  };
}

/** The sides the stubs of a line's ends leave, for the ends attached by hand. */
function stubSides(line: RelationLine): { from?: Side; to?: Side } {
  const sides: { from?: Side; to?: Side } = {};
  for (const end of ['from', 'to'] as const) {
    const attachment = line.hand?.route[end];
    if (attachment && attachment.kind !== 'automatic' && attachment.kind !== 'inside') {
      sides[end] = attachment.side;
    }
  }
  return sides;
}

/** The side of a shape's rectangle a point on its border lies on. */
function sideOfPoint(shape: ElementShape, point: Point): Side {
  return nearestBorderAttach(shape.rect, point).side;
}

/** The line as a draft changes it, routed again; undefined when the draft changes nothing. */
export function previewOf(
  indexed: IndexedScene,
  line: RelationLine,
  draft: Draft,
): RelationLine | undefined {
  if (!changed(draft)) return undefined;
  const lines = relationLinesOf(indexed.scene);
  const shapeOf = (which: 'from' | 'to') => {
    if (draft.reconnect?.end === which) return draft.reconnect.shape;
    const drawn = line.ends?.[which];
    return drawn?.kind === 'shape' ? indexed.byKey.get(drawn.key) : undefined;
  };
  const endOf = (which: 'from' | 'to'): RouteEnd | undefined => {
    const shape = shapeOf(which);
    if (shape) return { rect: shape.rect };
    const drawn = line.ends?.[which];
    const other = drawn?.kind === 'relation' ? lines.get(drawn.relation) : undefined;
    return other ? { point: other.middle } : { point: which === 'from' ? line.from : line.to };
  };
  const from = endOf('from');
  const to = endOf('to');
  if (!from || !to) return undefined;
  const fromShape = shapeOf('from');
  const toShape = shapeOf('to');
  const resolve = (which: 'from' | 'to', shape: ElementShape | undefined): ResolvedAttachment => {
    const wanted = draft[which];
    if (wanted === undefined) return line.hand?.route[which] ?? AUTOMATIC;
    if (wanted === null || !shape) return AUTOMATIC;
    if (wanted.kind === 'border') return { kind: 'border', side: wanted.side, at: wanted.at };
    if (wanted.kind === 'inside') return { kind: 'inside', x: wanted.x, y: wanted.y };
    const point = shape.points?.find((each) => each.name === wanted.name);
    return point
      ? { kind: 'connection-point', name: point.name, side: point.side, at: point.at }
      : AUTOMATIC;
  };
  const route: ResolvedRoute = {
    relation: line.relation,
    from: resolve('from', fromShape),
    to: resolve('to', toShape),
    style: line.style ?? 'orthogonal',
    bendPoints: [],
    byHand: true,
  };
  const bendPoints = draft.bendPoints ?? line.hand?.bendPoints ?? [];
  const ends: LineEnds = {
    relation: line.relation,
    offset: line.ends?.offset ?? 0,
    fromShape,
    toShape,
    from,
    to,
  };
  const routed = routeLine(ends, {
    route,
    bendPoints,
    bendOrigin: line.hand?.bendOrigin ?? { x: 0, y: 0 },
  });
  return lineAlong(line, routed.route, routed.curve, {
    route,
    bendPoints,
    bendOrigin: line.hand?.bendOrigin ?? { x: 0, y: 0 },
  });
}

/** A line drawn along another route, its arrowhead and middle with it. */
function lineAlong(
  line: RelationLine,
  route: Point[],
  curve: RelationLine['curve'],
  hand: RelationLine['hand'] = line.hand,
): RelationLine {
  const end = route.at(-1) as Point;
  const before = route.at(-2) ?? end;
  return {
    ...line,
    route,
    from: route[0] as Point,
    to: end,
    middle: midpointOf(route),
    curve,
    hand,
    ...(line.arrowhead ? { arrowhead: arrowheadAt(before, end, line.width) } : {}),
  };
}

/**
 * Where an end moves along its shape's border for an arrow key: one unit, or with Shift to the next
 * connection point, or eight units when the shape has none; round the corners. The arrow that runs
 * clockwise along the end's side goes clockwise, the opposite one back; the others leave it.
 */
function alongBorder(
  shape: ElementShape,
  at: Point,
  key: string,
  jump: boolean,
): EndAttachment | undefined {
  const { rect } = shape;
  const { width, height } = rect;
  const perimeter = 2 * (width + height);
  if (perimeter <= 0) return undefined;
  const place = nearestBorderAttach(rect, at);
  const clockwise: Record<Side, string> = {
    top: 'ArrowRight',
    right: 'ArrowDown',
    bottom: 'ArrowLeft',
    left: 'ArrowUp',
  };
  const back: Record<Side, string> = {
    top: 'ArrowLeft',
    right: 'ArrowUp',
    bottom: 'ArrowRight',
    left: 'ArrowDown',
  };
  const direction = key === clockwise[place.side] ? 1 : key === back[place.side] ? -1 : 0;
  if (direction === 0) return undefined;
  const sOf = (attach: Attach) => {
    switch (attach.side) {
      case 'top':
        return attach.at * width;
      case 'right':
        return width + attach.at * height;
      case 'bottom':
        return width + height + (1 - attach.at) * width;
      case 'left':
        return 2 * width + height + (1 - attach.at) * height;
    }
  };
  const current = sOf(place);
  if (jump && shape.points && shape.points.length > 0) {
    const ahead = shape.points
      .map((point) => ({
        point,
        distance: ((((sOf(point) - current) * direction) % perimeter) + perimeter) % perimeter,
      }))
      .filter((each) => each.distance > 1e-6)
      .sort((a, b) => a.distance - b.distance)[0];
    if (ahead) return { kind: 'connection-point', name: ahead.point.name };
  }
  const s =
    (((current + direction * (jump ? BIG_STEP : STEP)) % perimeter) + perimeter) % perimeter;
  const attach: Attach =
    s < width
      ? { side: 'top', at: s / width }
      : s < width + height
        ? { side: 'right', at: (s - width) / height }
        : s < 2 * width + height
          ? { side: 'bottom', at: 1 - (s - width - height) / width }
          : { side: 'left', at: 1 - (s - 2 * width - height) / height };
  const exact = nearestBorderAttach(rect, attachPoint(rect, attach), [attach.side]);
  return { kind: 'border', side: exact.side, at: exact.at };
}

/** What the caption beside a dragged end says the release will do. */
function endCaption(aim: EndAim, alt: boolean): { text: string; detail?: string } | undefined {
  const hint = alt ? (IS_APPLE ? t('⌥: no snapping') : t('Alt: no snapping')) : undefined;
  const withHint = (caption: { text: string; detail?: string }) =>
    hint === undefined
      ? caption
      : { text: caption.text, detail: caption.detail ? `${caption.detail} · ${hint}` : hint };
  switch (aim.kind) {
    case 'back':
      return undefined;
    case 'attach':
      return withHint({ text: attachText(aim.attachment, onOutline(aim.shape)) });
    case 'reconnect':
      return withHint({
        text: t('Reconnect to "{name}"', { name: aim.shape.name }),
        detail: attachText(aim.attachment, onOutline(aim.shape)),
      });
    case 'refused':
      return {
        text: t('Cannot reconnect to "{name}"', { name: aim.shape.name }),
        detail:
          aim.reason === 'cycle'
            ? t('Containment would form a cycle')
            : t('It is the other end of the relation already'),
      };
  }
}

/** Whether a shape attaches lines on an outline of its own (ADR 0066, ADR 0067), not on its box. */
function onOutline(shape: ElementShape): boolean {
  return endOutline(shape, shape.rect) !== undefined;
}

/**
 * What attaching an end somewhere says; on a shape with an outline of its own, a place on a side is
 * where it meets the outline, which the canvas marks.
 */
export function attachText(attachment: EndAttachment | null, outlined = false): string {
  if (attachment === null) return t('Attach automatically');
  if (attachment.kind === 'connection-point')
    return t('Attach at "{name}"', { name: attachment.name });
  if (attachment.kind === 'inside') return t('Attach at this point inside it');
  if (outlined) return t('Attach at this point of its edge');
  switch (attachment.side) {
    case 'top':
      return t('Attach to the top side');
    case 'right':
      return t('Attach to the right side');
    case 'bottom':
      return t('Attach to the bottom side');
    case 'left':
      return t('Attach to the left side');
  }
}

/** Where an end attaches, in words: `at "out"`, `on the left side`, or `attached automatically`. */
export function whereAttached(attachment: ResolvedAttachment): string {
  switch (attachment.kind) {
    case 'automatic':
      return t('attached automatically');
    case 'connection-point':
      return t('at "{name}"', { name: attachment.name });
    case 'inside':
      return t('at a place inside it');
    case 'border':
      switch (attachment.side) {
        case 'top':
          return t('on the top side');
        case 'right':
          return t('on the right side');
        case 'bottom':
          return t('on the bottom side');
        case 'left':
          return t('on the left side');
      }
  }
}

/** What the keys say a handle is, as they reach it. */
function describeHandle(line: RelationLine, handle: Handle, handles: readonly Handle[]): string {
  switch (handle.kind) {
    case 'end':
      return t('{end}, {where}', {
        end: handle.end === 'from' ? t('Start') : t('End'),
        where: whereAttached(line.hand?.route[handle.end] ?? AUTOMATIC),
      });
    case 'bend':
      return t('Bend point {position} of {total}', {
        position: handle.index + 1,
        total: handles.filter((each) => each.kind === 'bend').length,
      });
    case 'middle':
      return t('Middle of segment {position}', {
        position: handles.filter((each) => each.kind === 'middle').indexOf(handle) + 1,
      });
  }
}

function labelIn(project: ProjectSnapshot, relation: Id): string {
  return relationLabel(modelIndexOf(project), relation);
}

function samePoint(a: Point, b: Point | undefined): boolean {
  return b !== undefined && a.x === b.x && a.y === b.y;
}
